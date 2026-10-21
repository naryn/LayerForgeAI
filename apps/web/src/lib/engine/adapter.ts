import type { DocumentSnapshot } from "../domain";
import { normalizeBounds, normalizePatchyLayers } from "../layers";
import { PatchyBridgeError } from "../bridge/protocol";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  return undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function snapshotFromAutomationState(
  value: unknown,
  requestedDocumentId?: string,
): DocumentSnapshot {
  if (!isRecord(value) || !isRecord(value.state) || !Array.isArray(value.state.documents)) {
    throw new PatchyBridgeError(
      "PROTOCOL_MISMATCH",
      "Patchy getState did not return an automation state with documents",
    );
  }
  const documents = value.state.documents.filter(isRecord);
  const rawDocument = requestedDocumentId
    ? documents.find((document) => readString(document.id) === requestedDocumentId)
    : documents[0];
  if (!rawDocument) {
    throw new PatchyBridgeError(
      "DOCUMENT_NOT_FOUND",
      requestedDocumentId
        ? `Document ${requestedDocumentId} is not open in Patchy`
        : "Patchy has no open document",
    );
  }
  const documentId = readString(rawDocument.id);
  if (!documentId) {
    throw new PatchyBridgeError("PROTOCOL_MISMATCH", "Patchy document has no id");
  }
  const bounds = normalizeBounds(rawDocument.bounds ?? rawDocument.rect);
  return {
    documentId,
    revision: readString(rawDocument.revision) ?? "0",
    fingerprint: readString(value.fingerprint) ?? "",
    name: readString(rawDocument.name),
    path: readString(rawDocument.path),
    width: readNumber(rawDocument.width) ?? bounds?.width,
    height: readNumber(rawDocument.height) ?? bounds?.height,
    layers: normalizePatchyLayers(rawDocument.layers),
    capturedAt: new Date().toISOString(),
  };
}
