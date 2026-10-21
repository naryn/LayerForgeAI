import type { PatchyBridgeRequest, PatchyBridgeResponse } from "./protocol";
import {
  PATCHY_BRIDGE_PROTOCOL_VERSION,
  PATCHY_BRIDGE_REQUEST_LIMIT_BYTES,
  PatchyBridgeError,
} from "./protocol";

const DEFAULT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 25;

export interface BridgeQueueRoot {
  __patchyM0Requests?: PatchyBridgeRequest[];
  __patchyM0Responses?: PatchyBridgeResponse[];
  __patchyM0Cancelled?: Record<string, boolean>;
  __patchyStageBrowserFile?: (file: File, directory: string) => Promise<{ path: string }>;
  __patchyReleaseBrowserTransfer?: (path: string) => void;
  setInterval: (handler: TimerHandler, timeout?: number) => number;
  clearInterval: (id?: number) => void;
  setTimeout: (handler: TimerHandler, timeout?: number) => number;
  clearTimeout: (id?: number) => void;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: PatchyBridgeError) => void;
  timer: number;
  signal?: AbortSignal;
  abort: () => void;
}

export interface RequestOptions {
  precondition?: {
    documentId: string;
    revision: string;
    fingerprint?: string;
  };
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Browser-side half of the M0/Patchy bridge protocol v1.
 *
 * Safety invariant: this module never calls a WebAssembly export. DOM and
 * Promise callbacks only append plain JSON to a page-owned queue. Patchy's Qt
 * event loop polls that queue from a QTimer. See poc/patchy-bridge/PROTOCOL.md.
 */
export class PatchyBridgeClient {
  private readonly root: BridgeQueueRoot;
  private readonly timeoutMs: number;
  private readonly clientId: string;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly pollHandle: number;
  private nextId = 1;

  constructor(
    root: BridgeQueueRoot,
    options: { timeoutMs?: number; clientId?: string } = {},
  ) {
    this.root = root;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.clientId =
      options.clientId ?? `studio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    root.__patchyM0Requests ??= [];
    root.__patchyM0Responses ??= [];
    root.__patchyM0Cancelled ??= Object.create(null) as Record<string, boolean>;
    this.pollHandle = root.setInterval(() => this.drainResponses(), POLL_INTERVAL_MS);
  }

  request<TResult = unknown>(
    operation: string,
    payload: Record<string, unknown> = {},
    options: RequestOptions = {},
  ): Promise<TResult> {
    const requestId = `${this.clientId}-${this.nextId++}`;
    const { precondition, signal, timeoutMs = this.timeoutMs } = options;
    if (signal?.aborted) {
      return Promise.reject(
        new PatchyBridgeError("CANCELLED", `Patchy request cancelled: ${operation}`),
      );
    }
    const request: PatchyBridgeRequest = {
      protocolVersion: PATCHY_BRIDGE_PROTOCOL_VERSION,
      requestId,
      clientId: this.clientId,
      operation,
      payload,
      ...(precondition ? { precondition } : {}),
    };
    if (encodeJsonSize(request) > PATCHY_BRIDGE_REQUEST_LIMIT_BYTES) {
      return Promise.reject(
        new PatchyBridgeError("INVALID_REQUEST", "Patchy bridge request exceeds 64 KiB"),
      );
    }
    return new Promise<TResult>((resolve, reject) => {
      const cancel = (code: string, message: string) => {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.root.__patchyM0Cancelled![requestId] = true;
        this.cleanupPending(requestId, pending);
        reject(new PatchyBridgeError(code, message, { operation, requestId }));
      };
      const timer = this.root.setTimeout(() => {
        cancel("TIMEOUT", `Patchy bridge timed out: ${operation}`);
      }, timeoutMs);
      const abort = () => cancel("CANCELLED", `Patchy request cancelled: ${operation}`);
      signal?.addEventListener("abort", abort, { once: true });
      this.pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
        signal,
        abort,
      });
      this.root.__patchyM0Requests!.push(request);
    });
  }

  private cleanupPending(requestId: string, pending: PendingRequest): void {
    this.pending.delete(requestId);
    this.root.clearTimeout(pending.timer);
    pending.signal?.removeEventListener("abort", pending.abort);
  }

  private drainResponses(): void {
    const queue = this.root.__patchyM0Responses;
    if (!queue) return;
    const available = queue.length;
    for (let index = 0; index < available; index += 1) {
      const response = queue.shift();
      if (!response) continue;
      if (response.clientId !== this.clientId) {
        queue.push(response);
        continue;
      }
      const pending = this.pending.get(response.requestId);
      if (!pending) continue;
      this.cleanupPending(response.requestId, pending);
      if (response.protocolVersion !== PATCHY_BRIDGE_PROTOCOL_VERSION) {
        pending.reject(
          new PatchyBridgeError(
            "PROTOCOL_MISMATCH",
            `Unsupported Patchy bridge response version: ${response.protocolVersion}`,
          ),
        );
      } else if (response.ok) {
        pending.resolve(response.result);
      } else {
        const error = response.error;
        pending.reject(
          new PatchyBridgeError(
            error?.code || "REQUEST_FAILED",
            error?.message || "Patchy bridge request failed",
            error?.details,
          ),
        );
      }
    }
  }

  async openBrowserFile(file: File): Promise<{ documentId: string }> {
    const stage = this.root.__patchyStageBrowserFile;
    if (typeof stage !== "function") {
      throw new Error("Patchy's browser file staging helper is unavailable");
    }
    const staged = await stage(file, "/opened");
    try {
      return await this.request<{ documentId: string }>("openDocument", {
        path: staged.path,
      });
    } finally {
      this.root.__patchyReleaseBrowserTransfer?.(staged.path);
    }
  }

  dispose(): void {
    this.root.clearInterval(this.pollHandle);
    for (const [requestId, pending] of this.pending) {
      this.root.__patchyM0Cancelled![requestId] = true;
      this.cleanupPending(requestId, pending);
      pending.reject(new PatchyBridgeError("DISPOSED", "Patchy bridge disposed"));
    }
  }
}

function encodeJsonSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
