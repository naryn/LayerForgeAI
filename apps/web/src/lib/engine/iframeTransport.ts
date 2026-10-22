import type {
  DocumentSnapshot,
  IsolatedRenderResult,
  LayerBounds,
  PixelDiffSummary,
  Precondition,
  PreviewResult,
} from "../domain";
import { PatchyBridgeClient, type BridgeQueueRoot } from "../bridge/client";
import { PatchyBridgeError } from "../bridge/protocol";
import { snapshotFromAutomationState } from "./adapter";
import type {
  EngineTransport,
  LayerGroupResult,
  LayerMergeResult,
} from "./types";

export const PATCHY_SITE_URL =
  (import.meta.env.VITE_PATCHY_URL as string | undefined) ?? "/patchy/patchy.html";

// The branded shell self-embeds the engine in a nested iframe whenever its GUI
// scale is not 100%, which hides the bridge helper from the host. Pinning
// embedded=100 makes the shell run the engine in its own window instead.
export function patchyIframeUrl(siteUrl = PATCHY_SITE_URL): string {
  const [beforeHash, hash] = siteUrl.split("#", 2);
  const [path, query] = beforeHash.split("?", 2);
  const params = new URLSearchParams(query ?? "");
  params.set("embedded", "100");
  const suffix = hash ? `#${hash}` : "";
  return `${path}?${params.toString()}${suffix}`;
}

export interface PatchySiteStatus {
  available: boolean;
  url: string;
  reason?: string;
}

export async function checkPatchySite(
  url = PATCHY_SITE_URL,
  signal?: AbortSignal,
): Promise<PatchySiteStatus> {
  try {
    const response = await fetch(url, { cache: "no-store", signal });
    if (!response.ok) {
      return {
        available: false,
        url,
        reason: `未找到 Patchy 构建（HTTP ${response.status}）`,
      };
    }
    const html = await response.text();
    if (!/patchy/i.test(html)) {
      return {
        available: false,
        url,
        reason: "该地址不是 Patchy 页面",
      };
    }
    return { available: true, url };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return {
      available: false,
      url,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readBounds(value: unknown): LayerBounds | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.x !== "number" ||
    typeof record.y !== "number" ||
    typeof record.width !== "number" ||
    typeof record.height !== "number"
  ) {
    return null;
  }
  return {
    x: record.x,
    y: record.y,
    width: record.width,
    height: record.height,
  };
}

function isIframeLoaded(iframe: HTMLIFrameElement): boolean {
  try {
    const document = iframe.contentDocument;
    const window = iframe.contentWindow;
    if (!document || !window) return false;
    if (document.readyState !== "complete") return false;
    return window.location.href !== "about:blank";
  } catch {
    return false;
  }
}

async function waitForIframeLoad(
  iframe: HTMLIFrameElement,
  timeoutMs: number,
): Promise<void> {
  if (isIframeLoaded(iframe)) return;
  await new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      cleanup();
      reject(
        new PatchyBridgeError(
          "ENGINE_TIMEOUT",
          "Patchy iframe 加载超时。请确认 /patchy/patchy.html 可访问。",
        ),
      );
    }, timeoutMs);
    const cleanup = () => {
      globalThis.clearTimeout(timer);
      iframe.removeEventListener("load", onLoad);
      iframe.removeEventListener("error", onError);
    };
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new PatchyBridgeError("ENGINE_UNAVAILABLE", "Patchy iframe 加载失败"));
    };
    iframe.addEventListener("load", onLoad, { once: true });
    iframe.addEventListener("error", onError, { once: true });
  });
}

async function waitForStagingHelper(root: Window, timeoutMs: number): Promise<void> {
  const started = performance.now();
  let lastError: unknown;
  while (performance.now() - started < timeoutMs) {
    try {
      const helper = (root as unknown as Record<string, unknown>).__patchyStageBrowserFile;
      if (typeof helper === "function") return;
    } catch (error) {
      lastError = error;
      break;
    }
    await wait(100);
  }
  const suffix = lastError instanceof Error ? `：${lastError.message}` : "";
  throw new PatchyBridgeError(
    "ENGINE_UNAVAILABLE",
    `Patchy 未安装桥接入口 __patchyStageBrowserFile。请使用已编译 web_bridge_wasm 的 Patchy 构建${suffix}`,
  );
}

export interface IframeTransportOptions {
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
}

interface PatchyFs {
  readFile: (path: string, options?: { encoding?: "binary" }) => Uint8Array;
  unlink: (path: string) => void;
}

interface PatchyFsRoot {
  FS?: PatchyFs;
  // patchy.html aliases the qtLoad() result here; the Emscripten FS lives on
  // the module instance, not on the iframe window.
  __patchyModule?: { FS?: PatchyFs };
}

/**
 * Real transport: same-origin iframe running a bridge-enabled Patchy WASM
 * build. All engine work stays on Patchy's Qt event loop; the host only writes
 * JSON into the page-owned queues.
 */
export class IframePatchyTransport implements EngineTransport {
  readonly mode = "patchy" as const;
  readonly label = "Patchy 引擎";
  readonly supportsIsolatedRender = true;

  private readonly iframe: HTMLIFrameElement;
  private readonly connectTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private client: PatchyBridgeClient | null = null;
  private currentDocumentId: string | null = null;
  private lastSnapshot: DocumentSnapshot | null = null;

  constructor(iframe: HTMLIFrameElement, options: IframeTransportOptions = {}) {
    this.iframe = iframe;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 180_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 180_000;
  }

  async connect(): Promise<void> {
    if (typeof window.crossOriginIsolated === "boolean" && !window.crossOriginIsolated) {
      throw new PatchyBridgeError(
        "ENVIRONMENT_UNSUPPORTED",
        "页面未启用跨源隔离（COOP/COEP），多线程 Patchy WASM 无法启动",
      );
    }
    await waitForIframeLoad(this.iframe, this.connectTimeoutMs);
    const root = this.iframe.contentWindow;
    if (!root) {
      throw new PatchyBridgeError("ENGINE_UNAVAILABLE", "Patchy iframe 没有可用的 window");
    }
    try {
      void root.location.href;
    } catch {
      throw new PatchyBridgeError(
        "ENGINE_UNAVAILABLE",
        "Patchy iframe 与宿主页面不同源；必须同源部署",
      );
    }
    await waitForStagingHelper(root, this.connectTimeoutMs);
    this.client = new PatchyBridgeClient(root as unknown as BridgeQueueRoot, {
      timeoutMs: this.requestTimeoutMs,
    });
  }

  async openFile(file: File): Promise<DocumentSnapshot> {
    const client = this.requireClient();
    const opened = await client.openBrowserFile(file);
    this.currentDocumentId = opened.documentId;
    return this.getDocument();
  }

  async getDocument(): Promise<DocumentSnapshot> {
    const client = this.requireClient();
    const result = await client.request<unknown>("getState");
    const snapshot = snapshotFromAutomationState(result, this.currentDocumentId ?? undefined);
    this.currentDocumentId = snapshot.documentId;
    this.lastSnapshot = snapshot;
    return snapshot;
  }

  async renameLayer(
    layerId: string,
    newName: string,
    precondition: Precondition,
  ): Promise<{ layerId: string; name: string }> {
    const client = this.requireClient();
    this.assertDocument(precondition);
    const result = await client.request<{ layerId?: string; name?: string }>(
      "renameLayer",
      {
        documentId: precondition.documentId,
        layerId,
        name: newName,
      },
      { precondition },
    );
    return {
      layerId: result?.layerId ?? layerId,
      name: result?.name ?? newName,
    };
  }

  async groupLayers(
    layerIds: string[],
    name: string,
    precondition: Precondition,
  ): Promise<LayerGroupResult> {
    const client = this.requireClient();
    this.assertDocument(precondition);
    const result = await client.request<{
      documentId?: string;
      groupId?: string;
      name?: string;
      layerIds?: unknown;
    }>(
      "groupLayers",
      {
        documentId: precondition.documentId,
        layerIds,
        name,
      },
      { precondition },
    );
    const groupId = result?.groupId;
    if (typeof groupId !== "string" || !groupId) {
      throw new PatchyBridgeError("PROTOCOL_MISMATCH", "Patchy groupLayers returned no group id");
    }
    return {
      documentId: result.documentId ?? precondition.documentId,
      groupId,
      name: result.name ?? name,
      layerIds: Array.isArray(result.layerIds)
        ? result.layerIds.filter((id): id is string => typeof id === "string")
        : [],
    };
  }

  async mergeLayers(
    layerIds: string[],
    name: string | undefined,
    precondition: Precondition,
  ): Promise<LayerMergeResult> {
    const client = this.requireClient();
    this.assertDocument(precondition);
    const result = await client.request<{
      documentId?: string;
      layerId?: string;
      name?: string;
      layerIds?: unknown;
    }>(
      "mergeLayers",
      {
        documentId: precondition.documentId,
        layerIds,
        ...(name ? { name } : {}),
      },
      { precondition },
    );
    const layerId = result?.layerId;
    if (typeof layerId !== "string" || !layerId) {
      throw new PatchyBridgeError("PROTOCOL_MISMATCH", "Patchy mergeLayers returned no layer id");
    }
    return {
      documentId: result.documentId ?? precondition.documentId,
      layerId,
      name: result.name ?? name ?? "",
      layerIds: Array.isArray(result.layerIds)
        ? result.layerIds.filter((id): id is string => typeof id === "string")
        : [layerId],
    };
  }

  async renderPreview(path: string, download: boolean): Promise<PreviewResult> {
    const client = this.requireClient();
    const documentId = this.requireDocument();
    const result = await client.request<Record<string, unknown>>("renderPreview", {
      documentId,
      path,
      download,
    });
    return {
      documentId,
      path: typeof result.path === "string" ? result.path : path,
      width: typeof result.width === "number" ? result.width : (this.lastSnapshot?.width ?? 0),
      height:
        typeof result.height === "number" ? result.height : (this.lastSnapshot?.height ?? 0),
      downloaded: download,
    };
  }

  async renderLayer(layerId: string, path: string): Promise<IsolatedRenderResult> {
    const client = this.requireClient();
    const documentId = this.requireDocument();
    if (!/^\/saved\/[^/]+\.png$/i.test(path)) {
      throw new PatchyBridgeError("INVALID_REQUEST", "隔离渲染路径必须是 /saved/*.png");
    }
    const result = await client.request<Record<string, unknown>>(
      "renderLayer",
      { documentId, layerId, path },
      { timeoutMs: 300_000 },
    );
    const bounds = readBounds(result.bounds);
    const width = readCount(result.width);
    const height = readCount(result.height);
    if (!bounds || width < 1 || height < 1) {
      throw new PatchyBridgeError("PROTOCOL_MISMATCH", "Patchy renderLayer 未返回有效边界");
    }
    if (result.path !== path) {
      throw new PatchyBridgeError("PROTOCOL_MISMATCH", "Patchy renderLayer 返回了意外路径");
    }
    return {
      documentId:
        typeof result.documentId === "string" ? result.documentId : documentId,
      layerId,
      width,
      height,
      bounds,
      bytes: this.takeSavedBytes(path),
    };
  }

  async comparePreview(beforePath: string, afterPath: string): Promise<PixelDiffSummary> {
    const client = this.requireClient();
    const documentId = this.requireDocument();
    const result = await client.request<Record<string, unknown>>("comparePreview", {
      documentId,
      beforePath,
      afterPath,
    });
    return {
      sameSize: result.sameSize === true,
      width: readCount(result.width),
      height: readCount(result.height),
      totalPixels: readCount(result.totalPixels),
      differingPixels: readCount(result.differingPixels),
      ratio: typeof result.ratio === "number" && Number.isFinite(result.ratio) ? result.ratio : 0,
      maxDelta: readCount(result.maxDelta),
      bounds: readBounds(result.bounds),
    };
  }

  async undo(precondition: Precondition): Promise<DocumentSnapshot> {
    const client = this.requireClient();
    this.assertDocument(precondition);
    await client.request("undo", { documentId: precondition.documentId }, { precondition });
    return this.getDocument();
  }

  async saveAsAndReopen(
    path: string,
    precondition: Precondition,
  ): Promise<DocumentSnapshot> {
    const client = this.requireClient();
    this.assertDocument(precondition);
    const result = await client.request<{ documentId?: string }>(
      "saveAsAndReopen",
      {
        documentId: precondition.documentId,
        path,
      },
      { precondition },
    );
    this.currentDocumentId = result?.documentId ?? null;
    const snapshot = await this.getDocument();
    return { ...snapshot, path };
  }

  async readSavedFile(path: string): Promise<Uint8Array | null> {
    if (!/^\/saved\/[^/]+\.(psd|psb)$/i.test(path)) {
      throw new PatchyBridgeError(
        "INVALID_REQUEST",
        "只能读取 /saved/*.psd 或 .psb 保存结果",
      );
    }
    // Keep the PSD in MEMFS: the reopened document may still reference it.
    // Patchy's save coordinator leaves saved files in place for the same reason.
    return this.takeSavedBytes(path, { unlink: false });
  }

  dispose(): void {
    this.client?.dispose();
    this.client = null;
  }

  private requireClient(): PatchyBridgeClient {
    if (!this.client) {
      throw new PatchyBridgeError("ENGINE_UNAVAILABLE", "Patchy 引擎尚未连接");
    }
    return this.client;
  }

  private requireDocument(): string {
    if (!this.currentDocumentId) {
      throw new PatchyBridgeError("DOCUMENT_NOT_FOUND", "Patchy 中没有打开的文档");
    }
    return this.currentDocumentId;
  }

  // The bridge writes PNGs into the iframe's MEMFS. Reading them here keeps
  // pixel data off the JSON queue, and unlinking bounds memory growth to one
  // render at a time.
  private takeSavedBytes(path: string, options: { unlink?: boolean } = {}): Uint8Array {
    const root = this.iframe.contentWindow as unknown as PatchyFsRoot | null;
    const fs = root?.__patchyModule?.FS ?? root?.FS;
    if (!fs || typeof fs.readFile !== "function") {
      throw new PatchyBridgeError(
        "ENGINE_UNAVAILABLE",
        "Patchy MEMFS 不可访问，无法读取隔离渲染结果",
      );
    }
    let bytes: Uint8Array;
    try {
      bytes = fs.readFile(path, { encoding: "binary" });
    } catch (error) {
      throw new PatchyBridgeError(
        "REQUEST_FAILED",
        `无法读取隔离渲染 PNG：${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const copy = bytes.slice();
    if (options.unlink !== false) {
      try {
        fs.unlink(path);
      } catch {
        // The bytes are already in the host; a failed cleanup only costs MEMFS space.
      }
    }
    return copy;
  }

  private assertDocument(precondition: Precondition): void {
    if (!precondition.documentId || !precondition.revision) {
      throw new PatchyBridgeError(
        "PRECONDITION_REQUIRED",
        "修改操作需要 documentId 与 revision 前置条件",
      );
    }
    if (!this.currentDocumentId) {
      throw new PatchyBridgeError("DOCUMENT_NOT_FOUND", "Patchy 中没有打开的文档");
    }
    if (precondition.documentId !== this.currentDocumentId) {
      throw new PatchyBridgeError("STALE_DOCUMENT", "文档已变化，请刷新后再应用修改");
    }
  }
}
