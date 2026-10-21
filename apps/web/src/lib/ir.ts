import type {
  DocumentSnapshot,
  EngineMode,
  LayerBounds,
  LayerNode,
  PlanEntry,
  ProjectRecord,
} from "./domain";
import type { CleanupGroupSuggestion } from "./cleanup";
import { downloadJson, sanitizeFileName } from "./format";
import type { ComponentLayoutHint } from "./layout";

export interface DesignIr {
  schema: "layerforge.design-ir.draft";
  schemaVersion: "0.4.0";
  generatedAt: string;
  status: {
    validated: false;
    note: string;
  };
  project: {
    id: string;
    name: string;
    source: {
      fileName: string;
      sha256: string;
      width: number;
      height: number;
      depth: number;
      colorMode: string;
      layers: number;
    };
  };
  document: {
    engine: EngineMode;
    documentId: string;
    revision: string;
    fingerprint: string;
    width?: number;
    height?: number;
  };
  logicalGroups: IrLogicalGroup[];
  nodes: IrNode[];
  plan: PlanEntry[];
}

export interface IrAssetSource {
  id: string;
  sourcePath: string;
}

export interface IrLogicalGroup {
  id: string;
  rule: "group-cluster";
  status: "suggested";
  parentPath: string | null;
  parentName: string | null;
  suggestedName: string;
  memberPaths: string[];
  memberIds: string[];
  bounds: LayerBounds;
  layout: ComponentLayoutHint;
  reason: string;
}

export interface IrNode {
  id: string;
  parentId: string | null;
  sourceLayerId: string;
  sourcePath: string;
  name: string;
  semanticName: string | null;
  logicalGroupId: string | null;
  /** Asset-pack PNG id when this node has a generated output; null otherwise. */
  assetId: string | null;
  type: string;
  /** Sibling order from the PSD layer list, 0 = bottom-most. */
  zIndex: number;
  /** Global depth-first paint order, higher paints above lower. */
  paintOrder: number;
  bounds: LayerNode["bounds"] | null;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: string | null;
  clipping: boolean;
  meta: Record<string, string | number | boolean> | null;
  children: IrNode[];
}

function nodeKey(path: string): string {
  return `node:${path}`;
}

interface IrBuildContext {
  planByPath: Map<string, PlanEntry>;
  logicalGroupByPath: Map<string, string>;
  assetIdByPath: Map<string, string>;
}

function toIrNode(
  layer: LayerNode,
  parentId: string | null,
  zIndex: number,
  counter: { value: number },
  context: IrBuildContext,
): IrNode {
  const entry = context.planByPath.get(layer.path);
  const paintOrder = counter.value;
  counter.value += 1;
  return {
    id: nodeKey(layer.path),
    parentId,
    sourceLayerId: layer.id,
    sourcePath: layer.path,
    name: layer.name,
    semanticName: entry?.newName || null,
    logicalGroupId: context.logicalGroupByPath.get(layer.path) ?? null,
    assetId: context.assetIdByPath.get(layer.path) ?? null,
    type: layer.kind,
    zIndex,
    paintOrder,
    bounds: layer.bounds ?? null,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    blendMode: layer.blendMode ?? null,
    clipping: layer.clipping === true,
    meta: layer.meta ?? null,
    children: layer.children.map((child, index) =>
      toIrNode(child, nodeKey(layer.path), index, counter, context),
    ),
  };
}

function collectLayerIds(
  layers: LayerNode[],
  ids = new Map<string, string>(),
): Map<string, string> {
  for (const layer of layers) {
    ids.set(layer.path, layer.id);
    collectLayerIds(layer.children, ids);
  }
  return ids;
}

function toLogicalGroups(
  suggestions: CleanupGroupSuggestion[],
  layerIds: Map<string, string>,
): IrLogicalGroup[] {
  return suggestions.map((suggestion) => ({
    id: suggestion.id,
    rule: "group-cluster",
    status: "suggested",
    parentPath: suggestion.parentPath,
    parentName: suggestion.parentName,
    suggestedName: suggestion.suggestedName,
    memberPaths: [...suggestion.memberPaths],
    memberIds: suggestion.memberPaths
      .map((path) => layerIds.get(path))
      .filter((id): id is string => Boolean(id)),
    bounds: suggestion.bounds,
    layout: { ...suggestion.layout },
    reason: suggestion.reason,
  }));
}

export function buildDesignIr(options: {
  project: ProjectRecord;
  snapshot: DocumentSnapshot;
  plan: PlanEntry[];
  engine: EngineMode;
  logicalGroups?: CleanupGroupSuggestion[];
  assets?: IrAssetSource[];
}): DesignIr {
  const { project, snapshot, plan, engine } = options;
  const planByPath = new Map(plan.map((entry) => [entry.path, entry]));
  const logicalGroups = toLogicalGroups(
    options.logicalGroups ?? [],
    collectLayerIds(snapshot.layers),
  );
  const logicalGroupByPath = new Map<string, string>();
  for (const group of logicalGroups) {
    for (const path of group.memberPaths) {
      logicalGroupByPath.set(path, group.id);
    }
  }
  const assetIdByPath = new Map(
    (options.assets ?? []).map((asset) => [asset.sourcePath, asset.id]),
  );
  const context: IrBuildContext = { planByPath, logicalGroupByPath, assetIdByPath };
  const counter = { value: 0 };
  return {
    schema: "layerforge.design-ir.draft",
    schemaVersion: "0.4.0",
    generatedAt: new Date().toISOString(),
    status: {
      validated: false,
      note: "Draft IR generated from the current engine snapshot. Not an M5-validated release artifact. Logical groups and their layout hints are rule-based IR suggestions and do not modify the PSD.",
    },
    project: {
      id: project.id,
      name: project.name,
      source: {
        fileName: project.source.fileName,
        sha256: project.source.sha256,
        width: project.source.width,
        height: project.source.height,
        depth: project.source.depth,
        colorMode: project.source.colorModeLabel,
        layers: project.source.layerCount,
      },
    },
    document: {
      engine,
      documentId: snapshot.documentId,
      revision: snapshot.revision,
      fingerprint: snapshot.fingerprint,
      width: snapshot.width,
      height: snapshot.height,
    },
    logicalGroups,
    nodes: snapshot.layers.map((layer, index) =>
      toIrNode(layer, null, index, counter, context),
    ),
    plan,
  };
}

export function designIrFileName(project: ProjectRecord): string {
  return `${sanitizeFileName(project.name)}-design-ir.json`;
}

export function downloadDesignIr(ir: DesignIr, fileName: string): void {
  downloadJson(ir, fileName);
}
