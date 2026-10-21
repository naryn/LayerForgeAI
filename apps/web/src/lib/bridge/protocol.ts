export const PATCHY_BRIDGE_PROTOCOL_VERSION = 2;
export const PATCHY_BRIDGE_REQUEST_LIMIT_BYTES = 65_536;

export type PatchyOperation =
  | "getState"
  | "openDocument"
  | "renderPreview"
  | "comparePreview"
  | "renameLayer"
  | "groupLayers"
  | "mergeLayers"
  | "undo"
  | "saveAsAndReopen";

export interface BridgePrecondition {
  documentId: string;
  revision: string;
  fingerprint?: string;
}

export interface PatchyBridgeRequest {
  protocolVersion: number;
  requestId: string;
  clientId: string;
  operation: string;
  payload: Record<string, unknown>;
  precondition?: BridgePrecondition;
}

export interface PatchyBridgeErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface PatchyBridgeResponse {
  protocolVersion: number;
  requestId: string;
  clientId: string;
  ok: boolean;
  result: unknown;
  error: PatchyBridgeErrorPayload | null;
}

export class PatchyBridgeError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "PatchyBridgeError";
    this.code = code;
    this.details = details;
  }
}
