const DEFAULT_TIMEOUT_MS = 30_000;
export const PATCHY_BRIDGE_PROTOCOL_VERSION = 1;

export class PatchyBridgeError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "PatchyBridgeError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Browser-side half of the M0 bridge.
 *
 * Safety invariant: this module never calls a WebAssembly export. DOM and
 * Promise callbacks only append plain JSON to a page-owned queue. Patchy's
 * Qt event loop must poll that queue from a QTimer.
 */
export class PatchyBridgeClient {
  constructor(root = globalThis, { timeoutMs = DEFAULT_TIMEOUT_MS, clientId } = {}) {
    this.root = root;
    this.timeoutMs = timeoutMs;
    this.clientId = clientId ?? `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.nextId = 1;
    this.pending = new Map();
    root.__patchyM0Requests ??= [];
    root.__patchyM0Responses ??= [];
    root.__patchyM0Cancelled ??= Object.create(null);
    this.pollHandle = root.setInterval(() => this.drainResponses(), 25);
  }

  request(operation, payload = {}, options = {}) {
    const requestId = `${this.clientId}-${this.nextId++}`;
    const { precondition, signal, timeoutMs = this.timeoutMs } = options;
    if (signal?.aborted) {
      return Promise.reject(new PatchyBridgeError("CANCELLED", `Patchy request cancelled: ${operation}`));
    }
    const request = {
      protocolVersion: PATCHY_BRIDGE_PROTOCOL_VERSION,
      requestId,
      clientId: this.clientId,
      operation,
      payload,
      ...(precondition ? { precondition } : {}),
    };
    if (JSON.stringify(request).length > 65_536) {
      return Promise.reject(new PatchyBridgeError(
        "INVALID_REQUEST", "Patchy bridge request exceeds 64 KiB",
      ));
    }
    return new Promise((resolve, reject) => {
      const cancel = (code, message) => {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.root.__patchyM0Cancelled[requestId] = true;
        this.cleanupPending(requestId, pending);
        reject(new PatchyBridgeError(code, message, { operation, requestId }));
      };
      const timer = this.root.setTimeout(() => {
        cancel("TIMEOUT", `Patchy bridge timed out: ${operation}`);
      }, timeoutMs);
      const abort = () => cancel("CANCELLED", `Patchy request cancelled: ${operation}`);
      signal?.addEventListener("abort", abort, { once: true });
      this.pending.set(requestId, { resolve, reject, timer, signal, abort });
      // Deliberately no Module.ccall/cwrap or other WASM invocation here.
      this.root.__patchyM0Requests.push(request);
    });
  }

  cleanupPending(requestId, pending) {
    this.pending.delete(requestId);
    this.root.clearTimeout(pending.timer);
    pending.signal?.removeEventListener("abort", pending.abort);
  }

  drainResponses() {
    const available = this.root.__patchyM0Responses.length;
    for (let index = 0; index < available; index += 1) {
      const response = this.root.__patchyM0Responses.shift();
      if (response.clientId !== this.clientId) {
        this.root.__patchyM0Responses.push(response);
        continue;
      }
      const pending = this.pending.get(response.requestId);
      if (!pending) continue;
      this.cleanupPending(response.requestId, pending);
      if (response.protocolVersion !== PATCHY_BRIDGE_PROTOCOL_VERSION) {
        pending.reject(new PatchyBridgeError(
          "PROTOCOL_MISMATCH",
          `Unsupported Patchy bridge response version: ${response.protocolVersion}`,
        ));
      } else if (response.ok) pending.resolve(response.result);
      else {
        const error = response.error ?? {};
        pending.reject(new PatchyBridgeError(
          error.code || "REQUEST_FAILED",
          error.message || "Patchy bridge request failed",
          error.details,
        ));
      }
    }
  }

  /** Stage a user-selected file using Patchy's existing MEMFS helper. */
  async openBrowserFile(file) {
    const stage = this.root.__patchyStageBrowserFile;
    if (typeof stage !== "function") {
      throw new Error("Patchy's browser file staging helper is unavailable");
    }
    const staged = await stage(file, "/opened");
    // The Promise continuation only enqueues JSON; Qt enters C++ later.
    try {
      return await this.request("openDocument", { path: staged.path });
    } finally {
      // This is Patchy's existing exact-path MEMFS transfer cleanup helper.
      this.root.__patchyReleaseBrowserTransfer?.(staged.path);
    }
  }

  dispose() {
    this.root.clearInterval(this.pollHandle);
    for (const [requestId, pending] of this.pending) {
      this.root.__patchyM0Cancelled[requestId] = true;
      this.cleanupPending(requestId, pending);
      pending.reject(new PatchyBridgeError("DISPOSED", "Patchy bridge disposed"));
    }
  }
}

