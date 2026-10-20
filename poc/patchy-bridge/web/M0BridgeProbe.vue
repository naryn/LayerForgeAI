<script setup>
import { onBeforeUnmount, ref } from "vue";
import { PatchyBridgeClient } from "./patchy-bridge.js";

const bridge = new PatchyBridgeClient(window);
const log = ref([]);
const running = ref(false);

function flatten(layers, result = []) {
  for (const layer of layers || []) {
    result.push(layer);
    flatten(layer.children, result);
  }
  return result;
}

async function runM0(file) {
  running.value = true;
  try {
    const opened = await bridge.openBrowserFile(file);
    const initial = await bridge.request("getState");
    const document = initial.state.documents.find((item) => item.id === opened.documentId);
    const target = flatten(document?.layers)[0];
    if (!document || !target) throw new Error("The opened PSD has no layer to rename");

    await bridge.request("renderPreview", {
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
    const renamedDocument = renamedState.state.documents.find((item) => item.id === document.id);
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
    const finalDocument = finalState.state.documents.find((item) => item.id === reopened.documentId);
    if (!flatten(finalDocument?.layers).some((layer) => layer.name === renamed)) {
      throw new Error("Renamed layer was not found after reopening the saved PSD");
    }
    await bridge.request("renderPreview", {
      documentId: reopened.documentId,
      path: "/saved/m0-after.png",
      download: true,
    });
    log.value.push({ ok: true, before: target.name, after: renamed, reopened });
  } catch (error) {
    log.value.push({ ok: false, error: String(error) });
  } finally {
    running.value = false;
  }
}

onBeforeUnmount(() => bridge.dispose());
</script>

<template>
  <main>
    <input type="file" accept=".psd,.psb" :disabled="running"
      @change="runM0($event.target.files[0])" />
    <pre>{{ JSON.stringify(log, null, 2) }}</pre>
  </main>
</template>

