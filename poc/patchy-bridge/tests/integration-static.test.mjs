import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const browserSource = await readFile(new URL("../web/patchy-bridge.js", import.meta.url), "utf8");
const nativeSource = await readFile(new URL("../patchy/web_bridge_wasm.cpp", import.meta.url), "utf8");
const integrationPatch = await readFile(new URL("../patchy/integration.patch", import.meta.url), "utf8");

test("browser callbacks contain no direct WASM entry call", () => {
  assert.doesNotMatch(browserSource, /\b(?:ccall|cwrap|EM_ASM|dynCall)\s*\(/);
  assert.match(browserSource, /__patchyM0Requests\.push\(request\)/);
  assert.match(browserSource, /__patchyM0Cancelled\[requestId\] = true/);
});

test("native adapter is timer-polled and exposes only the M0 whitelist", () => {
  assert.match(nativeSource, /QTimer::timeout/);
  assert.doesNotMatch(nativeSource, /EMSCRIPTEN_KEEPALIVE|emscripten_bind/);
  assert.match(nativeSource, /Refusing to overwrite PSD/);
  assert.match(nativeSource, /Refusing to overwrite preview/);
  const operationChecks = [...nativeSource.matchAll(/operation == QStringLiteral\("([^"]+)"\)/g)]
    .map((match) => match[1]);
  assert.deepEqual([...new Set(operationChecks)].sort(), [
    "getState", "openDocument", "renameLayer", "renderPreview", "saveAsAndReopen",
  ]);
});

test("integration patch wires only the wasm target and MainWindow timer owner", () => {
  assert.match(integrationPatch, /target_sources\(patchy_ui PRIVATE/);
  assert.match(integrationPatch, /new WebBridgeWasm\(\*this\)/);
  assert.match(integrationPatch, /src\/ui\/web_bridge_wasm\.cpp/);
  assert.match(integrationPatch, /m0-harness\.js/);
  assert.match(integrationPatch, /packaging\/web\/patchy\.html\.in/);
});

