import { describe, expect, it } from "vitest";
import type { PatchyBridgeRequest, PatchyBridgeResponse } from "./protocol";
import { PATCHY_BRIDGE_PROTOCOL_VERSION, PatchyBridgeError } from "./protocol";
import { PatchyBridgeClient, type BridgeQueueRoot } from "./client";

class FakeRoot implements BridgeQueueRoot {
  __patchyM0Requests: PatchyBridgeRequest[] = [];
  __patchyM0Responses: PatchyBridgeResponse[] = [];
  __patchyM0Cancelled: Record<string, boolean> = Object.create(null);
  __patchyStageBrowserFile?: (file: File, directory: string) => Promise<{ path: string }>;
  __patchyReleaseBrowserTransfer?: (path: string) => void;
  private readonly intervals = new Map<number, () => void>();
  private readonly timeouts = new Map<number, () => void>();
  private nextTimerId = 1;

  setInterval(handler: TimerHandler): number {
    const id = this.nextTimerId++;
    this.intervals.set(id, handler as () => void);
    return id;
  }

  clearInterval(id?: number): void {
    if (id !== undefined) this.intervals.delete(id);
  }

  setTimeout(handler: TimerHandler): number {
    const id = this.nextTimerId++;
    this.timeouts.set(id, handler as () => void);
    return id;
  }

  clearTimeout(id?: number): void {
    if (id !== undefined) this.timeouts.delete(id);
  }

  poll(): void {
    for (const handler of [...this.intervals.values()]) handler();
  }

  fireTimeouts(): void {
    const handlers = [...this.timeouts.values()];
    this.timeouts.clear();
    for (const handler of handlers) handler();
  }

  activeIntervalCount(): number {
    return this.intervals.size;
  }
}

function response(
  request: PatchyBridgeRequest,
  overwrite: Partial<PatchyBridgeResponse> = {},
): PatchyBridgeResponse {
  return {
    protocolVersion: PATCHY_BRIDGE_PROTOCOL_VERSION,
    requestId: request.requestId,
    clientId: request.clientId,
    ok: true,
    result: { ok: true },
    error: null,
    ...overwrite,
  };
}

function setup() {
  const root = new FakeRoot();
  const client = new PatchyBridgeClient(root, { clientId: "test-client", timeoutMs: 1000 });
  return { root, client };
}

describe("PatchyBridgeClient 请求生命周期", () => {
  it("匹配响应后解析结果", async () => {
    const { root, client } = setup();
    const promise = client.request<{ ok: boolean }>("getState");
    expect(root.__patchyM0Requests).toHaveLength(1);
    root.__patchyM0Responses.push(response(root.__patchyM0Requests[0]));
    root.poll();
    await expect(promise).resolves.toEqual({ ok: true });
    client.dispose();
  });

  it("忽略并非本客户端的响应", async () => {
    const { root, client } = setup();
    const promise = client.request("getState");
    root.__patchyM0Responses.push(
      response(root.__patchyM0Requests[0], { clientId: "someone-else", result: "nope" }),
    );
    root.poll();
    expect(root.__patchyM0Responses).toHaveLength(1);
    root.__patchyM0Responses.push(response(root.__patchyM0Requests[0], { result: "mine" }));
    root.poll();
    await expect(promise).resolves.toBe("mine");
    client.dispose();
  });

  it("把失败响应转换为携带 code 的 PatchyBridgeError", async () => {
    const { root, client } = setup();
    const promise = client.request("renameLayer", { layerId: "l" });
    root.__patchyM0Responses.push(
      response(root.__patchyM0Requests[0], {
        ok: false,
        result: null,
        error: { code: "STALE_DOCUMENT", message: "文档已变化" },
      }),
    );
    root.poll();
    await expect(promise).rejects.toMatchObject({ code: "STALE_DOCUMENT", message: "文档已变化" });
    client.dispose();
  });

  it("协议版本不一致时拒绝", async () => {
    const { root, client } = setup();
    const promise = client.request("getState");
    root.__patchyM0Responses.push(response(root.__patchyM0Requests[0], { protocolVersion: 99 }));
    root.poll();
    await expect(promise).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH" });
    client.dispose();
  });

  it("超时后以 TIMEOUT 拒绝并标记取消", async () => {
    const { root, client } = setup();
    const promise = client.request("getState");
    const requestId = root.__patchyM0Requests[0].requestId;
    root.fireTimeouts();
    await expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(root.__patchyM0Cancelled![requestId]).toBe(true);
    client.dispose();
  });

  it("AbortSignal 触发时以 CANCELLED 拒绝", async () => {
    const { client } = setup();
    const controller = new AbortController();
    const promise = client.request("getState", {}, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: "CANCELLED" });
    client.dispose();
  });

  it("已中止的信号会立即拒绝且不排队", async () => {
    const { root, client } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(
      client.request("getState", {}, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(root.__patchyM0Requests).toHaveLength(0);
    client.dispose();
  });

  it("超过 64 KiB 的请求被拒绝且不排队", async () => {
    const { root, client } = setup();
    await expect(client.request("getState", { blob: "x".repeat(70_000) })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    expect(root.__patchyM0Requests).toHaveLength(0);
    client.dispose();
  });

  it("dispose 会停止轮询并拒绝在途请求", async () => {
    const { root, client } = setup();
    const promise = client.request("getState");
    expect(root.activeIntervalCount()).toBe(1);
    client.dispose();
    await expect(promise).rejects.toBeInstanceOf(PatchyBridgeError);
    await expect(promise).rejects.toMatchObject({ code: "DISPOSED" });
    expect(root.activeIntervalCount()).toBe(0);
  });

  it("携带前置条件时写入请求体", async () => {
    const { root, client } = setup();
    const promise = client.request("renameLayer", { layerId: "l" }, {
      precondition: { documentId: "d1", revision: "3", fingerprint: "fp" },
    });
    const request = root.__patchyM0Requests[0];
    expect(request.precondition).toEqual({ documentId: "d1", revision: "3", fingerprint: "fp" });
    root.__patchyM0Responses.push(response(request));
    root.poll();
    await promise;
    client.dispose();
  });
});

describe("PatchyBridgeClient.openBrowserFile", () => {
  it("缺少暂存助手时抛出错误", async () => {
    const { client } = setup();
    await expect(client.openBrowserFile(new File(["x"], "a.psd"))).rejects.toThrow(
      /staging helper is unavailable/,
    );
    client.dispose();
  });

  it("暂存文件后发起 openDocument，并在完成后释放", async () => {
    const { root, client } = setup();
    const released: string[] = [];
    root.__patchyStageBrowserFile = async () => ({ path: "/opened/staged.psd" });
    root.__patchyReleaseBrowserTransfer = (path) => released.push(path);

    const promise = client.openBrowserFile(new File(["x"], "a.psd"));
    for (let attempt = 0; attempt < 5 && root.__patchyM0Requests.length === 0; attempt += 1) {
      await Promise.resolve();
    }
    const request = root.__patchyM0Requests[0];
    expect(request.operation).toBe("openDocument");
    expect(request.payload).toEqual({ path: "/opened/staged.psd" });
    root.__patchyM0Responses.push(response(request, { result: { documentId: "doc-9" } }));
    root.poll();
    await expect(promise).resolves.toEqual({ documentId: "doc-9" });
    expect(released).toEqual(["/opened/staged.psd"]);
    client.dispose();
  });
});