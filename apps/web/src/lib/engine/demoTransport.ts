import type {
  DocumentSnapshot,
  LayerNode,
  PixelDiffSummary,
  Precondition,
  PreviewResult,
} from "../domain";
import { PatchyBridgeError } from "../bridge/protocol";
import { findLayerById, flattenLayers, unionBounds } from "../layers";
import { createDemoLayers } from "./demoLayers";
import type {
  EngineTransport,
  LayerGroupResult,
  LayerMergeResult,
} from "./types";

export interface DemoTransportOptions {
  projectName: string;
  width: number;
  height: number;
  layers?: LayerNode[];
}

function cloneTree(layers: LayerNode[]): LayerNode[] {
  return JSON.parse(JSON.stringify(layers)) as LayerNode[];
}

function hashTree(layers: LayerNode[]): string {
  const text = flattenLayers(layers)
    .map((layer) => `${layer.path}:${layer.name}:${layer.visible}:${layer.locked}`)
    .join("|");
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

interface LocatedLayer {
  siblings: LayerNode[];
  index: number;
  node: LayerNode;
}

function locateLayer(
  layers: LayerNode[],
  layerId: string,
): LocatedLayer | null {
  for (let index = 0; index < layers.length; index += 1) {
    const node = layers[index];
    if (node.id === layerId) return { siblings: layers, index, node };
    const nested = locateLayer(node.children, layerId);
    if (nested) return nested;
  }
  return null;
}

function reindexPaths(layers: LayerNode[], parentPath = ""): void {
  layers.forEach((layer, index) => {
    layer.path = parentPath ? `${parentPath}/${index}` : `${index}`;
    reindexPaths(layer.children, layer.path);
  });
}

/**
 * In-memory transport for UI development and E2E tests. It mimics the v1
 * protocol, but it never writes a PSD and must never be presented as Patchy
 * evidence.
 */
export class DemoTransport implements EngineTransport {
  readonly mode = "demo" as const;
  readonly label = "演示引擎";

  private readonly options: DemoTransportOptions;
  private tree: LayerNode[];
  private documentId: string | null = null;
  private revision = 0;
  private documentCounter = 0;
  private layerCounter = 0;
  private readonly savedPaths = new Set<string>();
  private readonly previewPaths = new Set<string>();
  private readonly undoStack: string[] = [];
  private disposed = false;

  constructor(options: DemoTransportOptions) {
    this.options = options;
    this.tree = cloneTree(options.layers?.length ? options.layers : createDemoLayers());
  }

  async connect(): Promise<void> {
    await wait(80);
  }

  async openFile(_file: File): Promise<DocumentSnapshot> {
    if (this.disposed) throw new PatchyBridgeError("DISPOSED", "演示引擎已关闭");
    this.documentCounter += 1;
    this.documentId = `demo-doc-${this.documentCounter}`;
    this.revision = 0;
    this.undoStack.length = 0;
    return this.snapshot();
  }

  async getDocument(): Promise<DocumentSnapshot> {
    this.ensureConnected();
    return this.snapshot();
  }

  async renameLayer(
    layerId: string,
    newName: string,
    precondition: Precondition,
  ): Promise<{ layerId: string; name: string }> {
    this.ensureConnected();
    this.assertPrecondition(precondition);
    const trimmed = newName.trim();
    if (!trimmed) throw new PatchyBridgeError("INVALID_REQUEST", "图层名称不能为空");
    if (new TextEncoder().encode(trimmed).byteLength > 4096) {
      throw new PatchyBridgeError("INVALID_REQUEST", "图层名称超过 4096 字节");
    }
    const layer = findLayerById(this.tree, layerId);
    if (!layer) throw new PatchyBridgeError("INVALID_REQUEST", `找不到图层 ${layerId}`);
    if (layer.name !== trimmed) {
      this.undoStack.push(JSON.stringify(this.tree));
      layer.name = trimmed;
      this.revision += 1;
    }
    return { layerId: layer.id, name: layer.name };
  }

  async groupLayers(
    layerIds: string[],
    name: string,
    precondition: Precondition,
  ): Promise<LayerGroupResult> {
    this.ensureConnected();
    this.assertPrecondition(precondition);
    const trimmed = name.trim();
    if (!trimmed) throw new PatchyBridgeError("INVALID_REQUEST", "编组名称不能为空");
    if (new TextEncoder().encode(trimmed).byteLength > 4096) {
      throw new PatchyBridgeError("INVALID_REQUEST", "编组名称超过 4096 字节");
    }
    if (layerIds.length < 2 || new Set(layerIds).size !== layerIds.length) {
      throw new PatchyBridgeError("INVALID_REQUEST", "编组至少需要两个不重复的图层");
    }
    const located = layerIds.map((id) => locateLayer(this.tree, id));
    if (located.some((item) => !item)) {
      throw new PatchyBridgeError("INVALID_REQUEST", "找不到要编组的图层");
    }
    const items = located as LocatedLayer[];
    const siblings = items[0].siblings;
    if (items.some((item) => item.siblings !== siblings)) {
      throw new PatchyBridgeError("INVALID_REQUEST", "只能编组同一父级下的图层");
    }
    if (items.some((item) => item.node.kind === "group" && item.node.meta?.artboard)) {
      throw new PatchyBridgeError("INVALID_REQUEST", "画板不能编组");
    }
    const ordered = [...items].sort((a, b) => a.index - b.index);
    const insertIndex = ordered[0].index;
    const members = ordered.map((item) => item.node);
    this.undoStack.push(JSON.stringify(this.tree));
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      siblings.splice(ordered[index].index, 1);
    }
    const groupId = `demo-group-${++this.layerCounter}`;
    const group: LayerNode = {
      id: groupId,
      name: trimmed,
      path: "",
      kind: "group",
      bounds: unionBounds(members),
      visible: true,
      locked: false,
      opacity: 1,
      children: members,
    };
    siblings.splice(insertIndex, 0, group);
    reindexPaths(this.tree);
    this.revision += 1;
    return {
      documentId: this.requireDocumentId(),
      groupId,
      name: trimmed,
      layerIds: members.map((member) => member.id),
    };
  }

  async mergeLayers(
    layerIds: string[],
    name: string | undefined,
    precondition: Precondition,
  ): Promise<LayerMergeResult> {
    this.ensureConnected();
    this.assertPrecondition(precondition);
    if (layerIds.length === 0 || new Set(layerIds).size !== layerIds.length) {
      throw new PatchyBridgeError("INVALID_REQUEST", "合并需要不重复的图层");
    }
    const items = layerIds.map((id) => locateLayer(this.tree, id));
    if (items.some((item) => !item)) {
      throw new PatchyBridgeError("INVALID_REQUEST", "找不到要合并的图层");
    }
    const located = items as LocatedLayer[];
    const siblings = located[0].siblings;
    if (located.some((item) => item.siblings !== siblings)) {
      throw new PatchyBridgeError("INVALID_REQUEST", "演示引擎只支持合并同一父级下的图层");
    }
    const ordered = [...located].sort((a, b) => a.index - b.index);
    const insertIndex = ordered[0].index;
    const targets = ordered.map((item) => item.node);
    this.undoStack.push(JSON.stringify(this.tree));
    const mergedName = (name?.trim() || targets[0].name).slice(0, 512);
    const bounds =
      unionBounds(targets.flatMap((node) => (node.kind === "group" ? flattenLayers(node.children) : [node]))) ??
      unionBounds(targets);
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      siblings.splice(ordered[index].index, 1);
    }
    const mergedId = `demo-merge-${++this.layerCounter}`;
    siblings.splice(insertIndex, 0, {
      id: mergedId,
      name: mergedName,
      path: "",
      kind: "pixel",
      bounds,
      visible: true,
      locked: false,
      opacity: 1,
      children: [],
      meta: { demoMerged: true },
    });
    reindexPaths(this.tree);
    this.revision += 1;
    return {
      documentId: this.requireDocumentId(),
      layerId: mergedId,
      name: mergedName,
      layerIds: [mergedId],
    };
  }

  async renderPreview(path: string, download: boolean): Promise<PreviewResult> {
    this.ensureConnected();
    if (!/^\/saved\/[^/]+\.png$/i.test(path)) {
      throw new PatchyBridgeError("INVALID_REQUEST", "预览路径必须是 /saved/*.png");
    }
    if (this.previewPaths.has(path)) {
      throw new PatchyBridgeError("SCRIPT_ERROR", "拒绝覆盖已有预览文件");
    }
    this.previewPaths.add(path);
    return {
      documentId: this.requireDocumentId(),
      path,
      width: this.options.width,
      height: this.options.height,
      downloaded: false,
      simulated: true,
      note: download ? "演示模式不会生成真实 PNG 文件" : undefined,
    };
  }

  async comparePreview(beforePath: string, afterPath: string): Promise<PixelDiffSummary> {
    this.ensureConnected();
    if (!this.previewPaths.has(beforePath) || !this.previewPaths.has(afterPath)) {
      throw new PatchyBridgeError("INVALID_REQUEST", "找不到要对比的预览");
    }
    return {
      sameSize: true,
      width: this.options.width,
      height: this.options.height,
      totalPixels: this.options.width * this.options.height,
      differingPixels: 0,
      ratio: 0,
      maxDelta: 0,
      bounds: null,
      simulated: true,
    };
  }

  async undo(precondition: Precondition): Promise<DocumentSnapshot> {
    this.ensureConnected();
    this.assertPrecondition(precondition);
    const previous = this.undoStack.pop();
    if (!previous) {
      throw new PatchyBridgeError("SCRIPT_ERROR", "没有可撤销的操作");
    }
    this.tree = JSON.parse(previous) as LayerNode[];
    this.revision += 1;
    return this.snapshot();
  }

  async saveAsAndReopen(
    path: string,
    precondition: Precondition,
  ): Promise<DocumentSnapshot> {
    this.ensureConnected();
    this.assertPrecondition(precondition);
    if (!/^\/saved\/[^/]+\.(psd|psb)$/i.test(path)) {
      throw new PatchyBridgeError("INVALID_REQUEST", "保存路径必须是新的 /saved/*.psd");
    }
    if (this.savedPaths.has(path)) {
      throw new PatchyBridgeError("SCRIPT_ERROR", "拒绝覆盖已有 PSD");
    }
    this.savedPaths.add(path);
    this.documentCounter += 1;
    this.documentId = `demo-doc-${this.documentCounter}`;
    this.revision = 0;
    this.tree = cloneTree(this.tree);
    this.undoStack.length = 0;
    return { ...this.snapshot(), path };
  }

  dispose(): void {
    this.disposed = true;
  }

  private ensureConnected(): void {
    if (this.disposed) throw new PatchyBridgeError("DISPOSED", "演示引擎已关闭");
    if (!this.documentId) {
      throw new PatchyBridgeError("DOCUMENT_NOT_FOUND", "演示引擎尚未打开文档");
    }
  }

  private requireDocumentId(): string {
    this.ensureConnected();
    return this.documentId as string;
  }

  private snapshot(): DocumentSnapshot {
    return {
      documentId: this.requireDocumentId(),
      revision: this.revision.toString(),
      fingerprint: `demo-${this.revision}-${hashTree(this.tree)}`,
      name: this.options.projectName,
      path: `/demo/${this.documentId}.psd`,
      width: this.options.width,
      height: this.options.height,
      layers: cloneTree(this.tree),
      capturedAt: new Date().toISOString(),
    };
  }

  private assertPrecondition(precondition: Precondition): void {
    const documentId = this.requireDocumentId();
    if (!precondition.documentId || precondition.revision === undefined) {
      throw new PatchyBridgeError(
        "PRECONDITION_REQUIRED",
        "修改操作需要 documentId 与 revision 前置条件",
      );
    }
    if (precondition.documentId !== documentId) {
      throw new PatchyBridgeError("DOCUMENT_NOT_FOUND", "目标文档已不在演示引擎中");
    }
    const fingerprint = `demo-${this.revision}-${hashTree(this.tree)}`;
    if (
      precondition.revision !== this.revision.toString() ||
      (precondition.fingerprint !== undefined &&
        precondition.fingerprint !== "" &&
        precondition.fingerprint !== fingerprint)
    ) {
      throw new PatchyBridgeError("STALE_DOCUMENT", "文档已变化，请刷新后再应用修改");
    }
  }
}
