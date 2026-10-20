import {
  PATCHY_BRIDGE_PROTOCOL_VERSION,
  PatchyBridgeClient,
} from "./patchy-bridge.js";

const enabled = new URLSearchParams(location.search).get("m0") === "1";

if (enabled) {
  const input = document.createElement("input");
  input.id = "patchy-m0-fixture";
  input.type = "file";
  input.accept = ".psd,.psb";
  input.hidden = true;
  document.body.appendChild(input);

  const bridge = new PatchyBridgeClient(window, { timeoutMs: 120_000 });

  const flatten = (layers, result = []) => {
    for (const layer of layers || []) {
      result.push(layer);
      flatten(layer.children, result);
    }
    return result;
  };

  const stateDocument = (snapshot, documentId) =>
    snapshot.state.documents.find((document) => document.id === documentId);

  async function expectBridgeError(operation, payload, options, expectedCode) {
    try {
      await bridge.request(operation, payload, options);
    } catch (error) {
      if (error.code !== expectedCode) {
        throw new Error(`${operation}: expected ${expectedCode}, got ${error.code}: ${error.message}`);
      }
      return { operation, expectedCode, actualCode: error.code, passed: true };
    }
    throw new Error(`${operation}: expected ${expectedCode}, but the request succeeded`);
  }

  async function runProtocolChecks(documentId) {
    const state = await bridge.request("getState");
    const document = stateDocument(state, documentId);
    const target = flatten(document?.layers)[0];
    if (!document || !target) throw new Error("The reopened fixture has no layer for protocol checks");

    const checks = {};
    checks.missingPrecondition = await expectBridgeError("renameLayer", {
      documentId: document.id,
      layerId: target.id,
      name: `${target.name} [must not apply]`,
    }, {}, "PRECONDITION_REQUIRED");
    checks.stalePrecondition = await expectBridgeError("renameLayer", {
      documentId: document.id,
      layerId: target.id,
      name: `${target.name} [must not apply]`,
    }, {
      precondition: { documentId: document.id, revision: "999999", fingerprint: state.fingerprint },
    }, "STALE_DOCUMENT");
    checks.invalidPreviewPath = await expectBridgeError("renderPreview", {
      documentId: document.id,
      path: "/saved/../escape.png",
    }, {}, "INVALID_REQUEST");
    checks.invalidOpenPath = await expectBridgeError("openDocument", {
      path: "/etc/passwd",
    }, {}, "INVALID_REQUEST");
    checks.unknownOperation = await expectBridgeError("executeScript", {
      source: "app.quit()",
    }, {}, "INVALID_REQUEST");
    checks.previewOverwrite = await expectBridgeError("renderPreview", {
      documentId: document.id,
      path: "/saved/m0-before.png",
    }, {}, "SCRIPT_ERROR");
    checks.psdOverwrite = await expectBridgeError("saveAsAndReopen", {
      documentId: document.id,
      path: "/saved/m0-normalized.psd",
    }, {
      precondition: { documentId: document.id, revision: document.revision, fingerprint: state.fingerprint },
    }, "SCRIPT_ERROR");

    const after = await bridge.request("getState");
    const afterDocument = stateDocument(after, documentId);
    const afterTarget = flatten(afterDocument?.layers).find((layer) => layer.id === target.id);
    if (after.fingerprint !== state.fingerprint || afterTarget?.name !== target.name) {
      throw new Error("A rejected bridge request mutated the document");
    }
    checks.stateUnchanged = { passed: true };
    return { checks, fingerprint: after.fingerprint };
  }

  async function waitForStagingHelper(timeoutMs = 120_000) {
    const started = performance.now();
    while (typeof window.__patchyStageBrowserFile !== "function") {
      if (performance.now() - started > timeoutMs) {
        throw new Error("Patchy did not install its browser file staging helper");
      }
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
  }

  async function run() {
    const file = input.files?.[0];
    if (!file) throw new Error("Select an M0 PSD/PSB fixture first");
    await waitForStagingHelper();

    const opened = await bridge.openBrowserFile(file);
    const initial = await bridge.request("getState");
    const document = stateDocument(initial, opened.documentId);
    const target = flatten(document?.layers)[0];
    if (!document || !target) throw new Error("The opened fixture has no layer to rename");

    const before = await bridge.request("renderPreview", {
      documentId: document.id,
      path: "/saved/m0-before.png",
      download: true,
    });
    const renamed = `${target.name} [M0]`;
    await bridge.request("renameLayer", {
      documentId: document.id,
      layerId: target.id,
      name: renamed,
    }, {
      precondition: {
        documentId: document.id,
        revision: document.revision,
        fingerprint: initial.fingerprint,
      },
    });

    const renamedState = await bridge.request("getState");
    const renamedDocument = stateDocument(renamedState, document.id);
    const reopened = await bridge.request("saveAsAndReopen", {
      documentId: document.id,
      path: "/saved/m0-normalized.psd",
    }, {
      precondition: {
        documentId: document.id,
        revision: renamedDocument.revision,
        fingerprint: renamedState.fingerprint,
      },
    });

    const finalState = await bridge.request("getState");
    const finalDocument = stateDocument(finalState, reopened.documentId);
    const persisted = flatten(finalDocument?.layers).find((layer) => layer.name === renamed);
    if (!persisted) throw new Error("Renamed layer was not found after reopening the saved PSD");
    const after = await bridge.request("renderPreview", {
      documentId: reopened.documentId,
      path: "/saved/m0-after.png",
      download: true,
    });
    const protocolChecks = await runProtocolChecks(reopened.documentId);

    return {
      protocolVersion: PATCHY_BRIDGE_PROTOCOL_VERSION,
      sourceFile: file.name,
      sourceDocumentId: document.id,
      sourceLayerId: target.id,
      originalName: target.name,
      renamed,
      reopenedDocumentId: reopened.documentId,
      reopenedLayerId: persisted.id,
      before,
      after,
      finalRevision: finalDocument.revision,
      finalFingerprint: finalState.fingerprint,
      protocolChecks,
    };
  }

  window.__patchyM0Harness = { run, bridge };
}

