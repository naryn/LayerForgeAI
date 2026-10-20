import assert from "node:assert/strict";
import test from "node:test";

import {
  PATCHY_BRIDGE_PROTOCOL_VERSION,
  PatchyBridgeClient,
  PatchyBridgeError,
} from "../web/patchy-bridge.js";

function fakeWindow() {
  return {
    __wasmCalls: 0,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    Module: { ccall() { this.__wasmCalls += 1; } },
  };
}

test("request only enqueues JSON and resolves from the response queue", async () => {
  const root = fakeWindow();
  const bridge = new PatchyBridgeClient(root, { timeoutMs: 1_000, clientId: "test" });
  const resultPromise = bridge.request("getState");

  assert.deepEqual(root.__patchyM0Requests, [
    {
      protocolVersion: PATCHY_BRIDGE_PROTOCOL_VERSION,
      requestId: "test-1",
      clientId: "test",
      operation: "getState",
      payload: {},
    },
  ]);
  assert.equal(root.__wasmCalls, 0);

  root.__patchyM0Responses.push({
    protocolVersion: 1, requestId: "test-1", clientId: "test", ok: true,
    result: { documents: [] },
  });
  bridge.drainResponses();
  assert.deepEqual(await resultPromise, { documents: [] });
  bridge.dispose();
});

test("file staging Promise continuation enqueues instead of entering WASM", async () => {
  const root = fakeWindow();
  const released = [];
  root.__patchyStageBrowserFile = async () => ({ path: "/opened/7/sample.psd" });
  root.__patchyReleaseBrowserTransfer = (path) => released.push(path);
  const bridge = new PatchyBridgeClient(root, { timeoutMs: 1_000, clientId: "test" });
  const resultPromise = bridge.openBrowserFile({ name: "sample.psd" });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(root.__wasmCalls, 0);
  assert.equal(root.__patchyM0Requests[0].operation, "openDocument");
  assert.equal(root.__patchyM0Requests[0].payload.path, "/opened/7/sample.psd");

  root.__patchyM0Responses.push({
    protocolVersion: 1, requestId: "test-1", clientId: "test", ok: true,
    result: { documentId: "9" },
  });
  bridge.drainResponses();
  assert.deepEqual(await resultPromise, { documentId: "9" });
  assert.deepEqual(released, ["/opened/7/sample.psd"]);
  bridge.dispose();
});

test("an error response rejects the matching request", async () => {
  const root = fakeWindow();
  const bridge = new PatchyBridgeClient(root, { timeoutMs: 1_000, clientId: "test" });
  const resultPromise = bridge.request("renameLayer", { layerId: "3" });
  root.__patchyM0Responses.push({
    protocolVersion: 1,
    requestId: "test-1",
    clientId: "test",
    ok: false,
    error: { code: "LAYER_NOT_FOUND", message: "layer missing" },
  });
  bridge.drainResponses();
  await assert.rejects(resultPromise, (error) => {
    assert.ok(error instanceof PatchyBridgeError);
    assert.equal(error.code, "LAYER_NOT_FOUND");
    return /layer missing/.test(error.message);
  });
  bridge.dispose();
});

test("precondition is serialized without invoking WASM", async () => {
  const root = fakeWindow();
  const bridge = new PatchyBridgeClient(root, { timeoutMs: 1_000, clientId: "test" });
  const promise = bridge.request("renameLayer", { documentId: "2", layerId: "3", name: "hero" }, {
    precondition: { documentId: "2", revision: "17", fingerprint: "abc" },
  });
  assert.deepEqual(root.__patchyM0Requests[0].precondition, {
    documentId: "2", revision: "17", fingerprint: "abc",
  });
  assert.equal(root.__wasmCalls, 0);
  root.__patchyM0Responses.push({
    protocolVersion: 1, requestId: "test-1", clientId: "test", ok: true,
    result: { name: "hero" },
  });
  bridge.drainResponses();
  await promise;
  bridge.dispose();
});

test("AbortSignal marks plain JS cancellation state and never calls WASM", async () => {
  const root = fakeWindow();
  const controller = new AbortController();
  const bridge = new PatchyBridgeClient(root, { timeoutMs: 1_000, clientId: "test" });
  const promise = bridge.request("renderPreview", {}, { signal: controller.signal });
  controller.abort();
  await assert.rejects(promise, (error) => error.code === "CANCELLED");
  assert.equal(root.__patchyM0Cancelled["test-1"], true);
  assert.equal(root.__wasmCalls, 0);
  bridge.dispose();
});

test("timeout marks cancellation for the Qt poller", async () => {
  const root = fakeWindow();
  const bridge = new PatchyBridgeClient(root, { timeoutMs: 5, clientId: "test" });
  const promise = bridge.request("getState");
  await assert.rejects(promise, (error) => error.code === "TIMEOUT");
  assert.equal(root.__patchyM0Cancelled["test-1"], true);
  bridge.dispose();
});

test("one client does not consume another client's response", async () => {
  const root = fakeWindow();
  const first = new PatchyBridgeClient(root, { timeoutMs: 1_000, clientId: "first" });
  const second = new PatchyBridgeClient(root, { timeoutMs: 1_000, clientId: "second" });
  const secondPromise = second.request("getState");
  root.__patchyM0Responses.push({
    protocolVersion: 1,
    requestId: "second-1",
    clientId: "second",
    ok: true,
    result: { state: { documents: [] }, fingerprint: "abc" },
  });
  first.drainResponses();
  assert.equal(root.__patchyM0Responses.length, 1);
  second.drainResponses();
  assert.equal((await secondPromise).fingerprint, "abc");
  first.dispose();
  second.dispose();
});

test("response protocol mismatch is rejected", async () => {
  const root = fakeWindow();
  const bridge = new PatchyBridgeClient(root, { timeoutMs: 1_000, clientId: "test" });
  const promise = bridge.request("getState");
  root.__patchyM0Responses.push({
    protocolVersion: 2, requestId: "test-1", clientId: "test", ok: true, result: {},
  });
  bridge.drainResponses();
  await assert.rejects(promise, (error) => error.code === "PROTOCOL_MISMATCH");
  bridge.dispose();
});

test("oversized payload is rejected before it reaches the page queue", async () => {
  const root = fakeWindow();
  const bridge = new PatchyBridgeClient(root, { timeoutMs: 1_000, clientId: "test" });
  await assert.rejects(
    bridge.request("renameLayer", { name: "x".repeat(70_000) }),
    (error) => error.code === "INVALID_REQUEST",
  );
  assert.equal(root.__patchyM0Requests.length, 0);
  assert.equal(root.__wasmCalls, 0);
  bridge.dispose();
});

