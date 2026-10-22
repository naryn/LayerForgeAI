# M0 browser bridge protocol v2

The transport is two page-owned arrays and one cancellation object:

- `window.__patchyM0Requests`: written by browser JavaScript, shifted by the
  Patchy-side Qt timer.
- `window.__patchyM0Responses`: written by Patchy, shifted by browser
  JavaScript.
- `window.__patchyM0Cancelled`: request IDs set to `true` by browser timeout,
  AbortSignal, or client disposal and polled by Patchy's Qt timer.

No DOM listener, Promise continuation, timeout, or AbortSignal callback calls a
WASM export.

## Request

```json
{
  "protocolVersion": 2,
  "requestId": "client-id-4",
  "clientId": "client-id",
  "operation": "renameLayer",
  "payload": {
    "documentId": "21",
    "layerId": "144",
    "name": "hero/title"
  },
  "precondition": {
    "documentId": "21",
    "revision": "38",
    "fingerprint": "sha256-from-getState"
  }
}
```

`renameLayer`, `groupLayers`, `mergeLayers`, `undo`, and `saveAsAndReopen`
require the precondition. A mismatch returns `STALE_DOCUMENT`; the browser must
refresh state and ask the user or regenerate its plan rather than retrying a
mutation blindly.

`undo` restores the document's previous history entry and returns
`{documentId}`. The browser must call `getState` afterwards; revisions and layer
IDs may change. One engine script (one group or merge) is one undo entry.

`comparePreview` decodes two existing `/saved/*.png` previews inside Patchy and
returns aggregate pixel differences without transferring image data:

```json
{
  "operation": "comparePreview",
  "payload": {
    "beforePath": "/saved/before-abc.png",
    "afterPath": "/saved/after-abc.png"
  }
}
```

The result is `{sameSize, width, height, totalPixels, differingPixels, ratio,
maxDelta, bounds, sizes}`. It is a raw RGBA comparison of the two renders, not
a PSD binary or Photoshop comparison.

`renderLayer` renders one layer or group alone into a new `/saved/*.png` and
returns its document-space bounds. It uses the same scratch-document path as
Patchy's GIF/sprite exports: the target layer is forced visible and composited
alone, so parent group opacity, masks, clipping bases and the canvas background
are intentionally not applied. The live document is never mutated and no undo
entry is created.

```json
{
  "operation": "renderLayer",
  "payload": {
    "documentId": "21",
    "layerId": "144",
    "path": "/saved/isolated-144.png"
  }
}
```

The result is `{documentId, layerId, path, isolated: true, width, height,
bounds: {x, y, width, height}}`. `bounds` is clipped to the document canvas.
The bridge returns metadata only; the caller reads the PNG from the same-origin
Patchy MEMFS and may then unlink it. The Emscripten FS lives on the module
instance returned by `qtLoad()`, not on `window`, so the host page must expose
it (LayerForgeAI's `stage:patchy` aliases it as `window.__patchyModule.FS`).
An existing target is never overwritten, and a layer with no pixels inside the
canvas fails with `EMPTY_RENDER`.

`groupLayers` accepts two or more unique layer IDs that share one parent and
returns the new group:

```json
{
  "operation": "groupLayers",
  "payload": {
    "documentId": "21",
    "layerIds": ["144", "145"],
    "name": "hero/cta"
  },
  "precondition": { "documentId": "21", "revision": "38", "fingerprint": "sha256-from-getState" }
}
```

It maps directly to Patchy's `document.groupLayers(layers, name)`; artboards are
rejected and the group is inserted at the first selected layer's index.

`mergeLayers` accepts one or more unique sibling layer IDs and an optional name:

```json
{
  "operation": "mergeLayers",
  "payload": {
    "documentId": "21",
    "layerIds": ["180"],
    "name": "badge-merged"
  },
  "precondition": { "documentId": "21", "revision": "38", "fingerprint": "sha256-from-getState" }
}
```

It calls Patchy's `document.mergeLayers(layers, { keepVectors: false,
withinGroups: false, separateVectorTypes: false })`, so a selected group is
released and its contents are raster-merged. The surviving result layer is
renamed when a name is supplied. Merging is destructive in the current document
buffer; the browser must still save and reopen to persist anything.

## Response

```json
{
  "protocolVersion": 2,
  "requestId": "client-id-4",
  "clientId": "client-id",
  "ok": false,
  "result": null,
  "error": {
    "code": "STALE_DOCUMENT",
    "message": "Document state changed; refresh before applying the mutation"
  }
}
```

## Whitelist

| Operation | Mutation | Purpose |
|---|---:|---|
| `getState` | no | Recursive Patchy automation state plus fingerprint. |
| `openDocument` | no | Open only a Patchy-staged `/opened/` file. |
| `renderPreview` | no | Write only `/saved/*.png`; optional browser download. |
| `renderLayer` | no | Isolated layer/group render to `/saved/*.png`; returns bounds only. |
| `comparePreview` | no | Compare two existing `/saved/*.png` previews and return aggregate RGBA differences. |
| `renameLayer` | yes | Rename exactly one document/layer ID. |
| `groupLayers` | yes | Group two or more same-sibling layer IDs under a new group. |
| `mergeLayers` | yes | Raster-merge selected sibling layers or a group's contents into one layer. |
| `undo` | yes | Restore the previous document history entry. |
| `saveAsAndReopen` | yes | Save only a new `/saved/*.psd` or `.psb`, close it, and reopen the copy. Patchy's save path already offers the browser download, so the bridge does not download it a second time. |

There is intentionally no arbitrary `executeScript`, filesystem path, or raw
C++ method operation.

Requests larger than 64 KiB are rejected before enqueue. Input paths must be
exact Patchy-staged `/opened/<number>/<filename>` paths. Outputs are direct
children of `/saved/`, and an existing target is never overwritten.

`renderPreview` returns only path, dimensions and render metadata; the PNG
download is opt-in through `download: true`. `saveAsAndReopen` downloads the PSD
through Patchy's existing `offer_browser_download_for_saved_file` hook, so a
successful round trip produces exactly one PSD transfer.

## Stable error codes

- `PROTOCOL_MISMATCH`
- `INVALID_REQUEST`
- `PRECONDITION_REQUIRED`
- `STALE_DOCUMENT`
- `DOCUMENT_NOT_FOUND`
- `EMPTY_RENDER`
- `BUSY`
- `SCRIPT_ERROR`
- `CANCELLED`
- Browser-only: `TIMEOUT`, `DISPOSED`, `REQUEST_FAILED`

## Still outside v2

Large JSON streaming, persisted recovery across a full tab crash, multi-request
transactions, bulk rename, and visibility operations remain deferred. `undo` is
a single history step, not a transaction rollback for a whole cleanup batch.
`renderLayer` returns 1x pixels only; native 2x re-rendering is not part of v2.
The operations remain additive under `protocolVersion: 2`; a failed Photoshop
gate does not promote `m1Allowed`.

