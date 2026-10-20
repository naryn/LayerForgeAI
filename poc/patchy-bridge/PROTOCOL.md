# M0 browser bridge protocol v1

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
  "protocolVersion": 1,
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

`renameLayer` and `saveAsAndReopen` require the precondition. A mismatch returns
`STALE_DOCUMENT`; the browser must refresh state and ask the user or regenerate
its plan rather than retrying a mutation blindly.

## Response

```json
{
  "protocolVersion": 1,
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
| `renameLayer` | yes | Rename exactly one document/layer ID. |
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
- `BUSY`
- `SCRIPT_ERROR`
- `CANCELLED`
- Browser-only: `TIMEOUT`, `DISPOSED`, `REQUEST_FAILED`

## Still outside v1 M0

Large JSON streaming, persisted recovery across a full tab crash, multi-request
transactions, and bulk rename are intentionally deferred until the single-layer
round trip passes the Windows browser and Photoshop gates.

