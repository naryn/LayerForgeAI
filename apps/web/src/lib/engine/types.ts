import type {
  DocumentSnapshot,
  EngineMode,
  IsolatedRenderResult,
  PixelDiffSummary,
  Precondition,
  PreviewResult,
} from "../domain";

export interface LayerGroupResult {
  documentId: string;
  groupId: string;
  name: string;
  layerIds: string[];
}

export interface LayerMergeResult {
  documentId: string;
  layerId: string;
  name: string;
  layerIds: string[];
}

export interface EngineTransport {
  readonly mode: EngineMode;
  readonly label: string;
  /** True only when renderLayer() returns pixels from a real Patchy document. */
  readonly supportsIsolatedRender: boolean;
  connect(): Promise<void>;
  openFile(file: File): Promise<DocumentSnapshot>;
  getDocument(): Promise<DocumentSnapshot>;
  renameLayer(
    layerId: string,
    newName: string,
    precondition: Precondition,
  ): Promise<{ layerId: string; name: string }>;
  groupLayers(
    layerIds: string[],
    name: string,
    precondition: Precondition,
  ): Promise<LayerGroupResult>;
  mergeLayers(
    layerIds: string[],
    name: string | undefined,
    precondition: Precondition,
  ): Promise<LayerMergeResult>;
  renderPreview(path: string, download: boolean): Promise<PreviewResult>;
  renderLayer(layerId: string, path: string): Promise<IsolatedRenderResult>;
  comparePreview(beforePath: string, afterPath: string): Promise<PixelDiffSummary>;
  undo(precondition: Precondition): Promise<DocumentSnapshot>;
  saveAsAndReopen(path: string, precondition: Precondition): Promise<DocumentSnapshot>;
  /** Bytes of a PSD written by saveAsAndReopen, or null when the engine has none. */
  readSavedFile(path: string): Promise<Uint8Array | null>;
  dispose(): void;
}

export function preconditionFor(snapshot: DocumentSnapshot): Precondition {
  return {
    documentId: snapshot.documentId,
    revision: snapshot.revision,
    fingerprint: snapshot.fingerprint,
  };
}
