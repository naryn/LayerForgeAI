export type EngineMode = "patchy" | "demo" | "inspect";

export interface LayerBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LayerKind =
  | "group"
  | "pixel"
  | "text"
  | "adjustment"
  | "shape"
  | "smart-object"
  | "unknown";

export interface LayerNode {
  id: string;
  name: string;
  path: string;
  kind: LayerKind;
  bounds?: LayerBounds;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode?: string;
  clipping?: boolean;
  children: LayerNode[];
  meta?: Record<string, string | number | boolean>;
}

export interface DocumentSnapshot {
  documentId: string;
  revision: string;
  fingerprint: string;
  name?: string;
  path?: string;
  width?: number;
  height?: number;
  layers: LayerNode[];
  capturedAt: string;
}

export interface PsdHeader {
  version: number;
  channels: number;
  height: number;
  width: number;
  depth: number;
  colorMode: number;
  colorModeLabel: string;
  fileSize: number;
}

export interface ProjectSource extends PsdHeader {
  fileName: string;
  sha256: string;
  layerCount: number;
}

export interface LocalInspectionSummary {
  layerCount: number;
  parsedWith: "ag-psd";
  warning?: string;
}

export type PlanStatus = "draft" | "applied" | "verified" | "failed";

export interface PlanEntry {
  id: string;
  path: string;
  layerId?: string;
  originalName: string;
  newName: string;
  status: PlanStatus;
  note?: string;
  updatedAt: string;
}

export interface PixelDiffSummary {
  sameSize: boolean;
  width: number;
  height: number;
  totalPixels: number;
  differingPixels: number;
  ratio: number;
  maxDelta: number;
  bounds: LayerBounds | null;
  simulated?: boolean;
}

export interface PsdDiffSummary {
  beforeLayers: number;
  afterLayers: number;
  added: number;
  removed: number;
  renamed: number;
  geometryChanged: number;
  restyled: number;
  unchanged: number;
}

export interface RevisionRecord {
  id: string;
  path: string;
  documentId: string;
  createdAt: string;
  engine: EngineMode;
  layerCount: number;
  plannedCount: number;
  verifiedCount: number;
  verified: boolean;
  diff?: PsdDiffSummary;
  pixelDiff?: PixelDiffSummary;
}

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  source: ProjectSource;
  localInspection: LocalInspectionSummary;
  plan: PlanEntry[];
  revisions: RevisionRecord[];
}

export interface StoredProjectFile {
  projectId: string;
  fileName: string;
  size: number;
  type: string;
  blob: Blob;
}

export type SnapshotKind = "local" | "revision";

export interface StoredSnapshot {
  key: string;
  projectId: string;
  kind: SnapshotKind;
  createdAt: string;
  data: unknown;
}

export interface Precondition {
  documentId: string;
  revision: string;
  fingerprint?: string;
}

export interface PreviewResult {
  documentId: string;
  path?: string;
  width: number;
  height: number;
  downloaded: boolean;
  simulated?: boolean;
  note?: string;
}
