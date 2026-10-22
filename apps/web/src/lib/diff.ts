import type {
  DocumentSnapshot,
  LayerBounds,
  LayerNode,
  PsdDiffSummary,
} from "./domain";
import { downloadJson, sanitizeFileName } from "./format";
import { flattenLayers } from "./layers";

export type LayerDiffField =
  | "name"
  | "path"
  | "kind"
  | "bounds"
  | "visible"
  | "locked"
  | "opacity"
  | "blendMode"
  | "clipping"
  | "text"
  | "fontFamily"
  | "fontSize"
  | "textColor"
  | "textAlign"
  | "bold"
  | "hasMask"
  | "hasEffects";

export interface LayerDiffChange {
  field: LayerDiffField;
  label: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

export interface LayerDiffEntry {
  layerId: string;
  status: "added" | "removed" | "changed";
  kind: LayerNode["kind"];
  matchedBy: "id" | "path";
  beforePath?: string;
  afterPath?: string;
  nameBefore?: string;
  nameAfter?: string;
  changes: LayerDiffChange[];
}

export interface DiffSnapshotMeta {
  documentId: string;
  revision: string;
  path?: string;
  layerCount: number;
  width?: number;
  height?: number;
  capturedAt: string;
}

export type DiffBaseline = "session-open" | "previous-save";

export interface PsdDiffReport {
  schema: "layerforge.psd-diff";
  schemaVersion: "0.1.0";
  generatedAt: string;
  evidence: "engine-layer-tree";
  simulated: boolean;
  baseline: DiffBaseline;
  before: DiffSnapshotMeta;
  after: DiffSnapshotMeta;
  summary: PsdDiffSummary;
  entries: LayerDiffEntry[];
  notes: string[];
}

const FIELD_LABELS: Record<LayerDiffField, string> = {
  name: "名称",
  path: "路径",
  kind: "类型",
  bounds: "边界",
  visible: "可见性",
  locked: "锁定",
  opacity: "不透明度",
  blendMode: "混合模式",
  clipping: "剪贴蒙版",
  text: "文本",
  fontFamily: "字体",
  fontSize: "字号",
  textColor: "颜色",
  textAlign: "对齐",
  bold: "粗体",
  hasMask: "蒙版",
  hasEffects: "效果",
};

const META_FIELDS: Array<{
  field: LayerDiffField;
  key: string;
  numeric?: boolean;
  boolean?: boolean;
}> = [
  { field: "text", key: "text" },
  { field: "fontFamily", key: "fontFamily" },
  { field: "fontSize", key: "fontSize", numeric: true },
  { field: "textColor", key: "textColor" },
  { field: "textAlign", key: "textAlign" },
  { field: "bold", key: "bold", boolean: true },
  { field: "hasMask", key: "hasMask", boolean: true },
  { field: "hasEffects", key: "hasEffects", boolean: true },
];

function formatBounds(bounds: LayerBounds | undefined): string | null {
  if (!bounds) return null;
  return `${bounds.width}×${bounds.height} @ ${bounds.x},${bounds.y}`;
}

function metaValue(
  node: LayerNode,
  key: string,
  options: { numeric?: boolean; boolean?: boolean },
): string | number | boolean | null {
  const value = node.meta?.[key];
  if (options.boolean) return typeof value === "boolean" ? value : null;
  if (options.numeric) return typeof value === "number" ? value : null;
  return typeof value === "string" ? value : null;
}

function change(
  field: LayerDiffField,
  before: string | number | boolean | null,
  after: string | number | boolean | null,
): LayerDiffChange | null {
  if (Object.is(before, after)) return null;
  return { field, label: FIELD_LABELS[field], before, after };
}

function compareLayers(before: LayerNode, after: LayerNode): LayerDiffChange[] {
  const changes = [
    change("name", before.name, after.name),
    change("path", before.path, after.path),
    change("kind", before.kind, after.kind),
    change("bounds", formatBounds(before.bounds), formatBounds(after.bounds)),
    change("visible", before.visible, after.visible),
    change("locked", before.locked, after.locked),
    change("opacity", before.opacity, after.opacity),
    change("blendMode", before.blendMode ?? null, after.blendMode ?? null),
    change("clipping", before.clipping === true, after.clipping === true),
    ...META_FIELDS.map((meta) =>
      change(
        meta.field,
        metaValue(before, meta.key, meta),
        metaValue(after, meta.key, meta),
      ),
    ),
  ];
  return changes.filter((item): item is LayerDiffChange => item !== null);
}

function snapshotMeta(snapshot: DocumentSnapshot): DiffSnapshotMeta {
  return {
    documentId: snapshot.documentId,
    revision: snapshot.revision,
    ...(snapshot.path ? { path: snapshot.path } : {}),
    layerCount: flattenLayers(snapshot.layers).length,
    ...(typeof snapshot.width === "number" ? { width: snapshot.width } : {}),
    ...(typeof snapshot.height === "number" ? { height: snapshot.height } : {}),
    capturedAt: snapshot.capturedAt,
  };
}

export function diffLayerTrees(
  before: DocumentSnapshot,
  after: DocumentSnapshot,
  options: { simulated?: boolean; baseline?: DiffBaseline; now?: Date } = {},
): PsdDiffReport {
  const beforeFlat = flattenLayers(before.layers);
  const afterFlat = flattenLayers(after.layers);
  const afterById = new Map(afterFlat.map((node) => [node.id, node]));
  const afterByPath = new Map(afterFlat.map((node) => [node.path, node]));
  const usedAfter = new Set<LayerNode>();

  const changed: LayerDiffEntry[] = [];
  const removed: LayerDiffEntry[] = [];
  let unchanged = 0;
  let renamed = 0;
  let geometryChanged = 0;
  let restyled = 0;

  for (const beforeLayer of beforeFlat) {
    let afterLayer = afterById.get(beforeLayer.id);
    let matchedBy: "id" | "path" = "id";
    if (!afterLayer || usedAfter.has(afterLayer)) {
      afterLayer = afterByPath.get(beforeLayer.path);
      matchedBy = "path";
      if (afterLayer && usedAfter.has(afterLayer)) afterLayer = undefined;
    }
    if (!afterLayer) {
      removed.push({
        layerId: beforeLayer.id,
        status: "removed",
        kind: beforeLayer.kind,
        matchedBy: "id",
        beforePath: beforeLayer.path,
        nameBefore: beforeLayer.name,
        changes: [],
      });
      continue;
    }
    usedAfter.add(afterLayer);
    const fields = compareLayers(beforeLayer, afterLayer);
    if (fields.length === 0) {
      unchanged += 1;
      continue;
    }
    const nameChange = fields.some((item) => item.field === "name");
    const geometry = fields.some(
      (item) => item.field === "path" || item.field === "bounds",
    );
    if (nameChange) renamed += 1;
    else if (geometry) geometryChanged += 1;
    else restyled += 1;
    changed.push({
      layerId: afterLayer.id,
      status: "changed",
      kind: afterLayer.kind,
      matchedBy,
      beforePath: beforeLayer.path,
      afterPath: afterLayer.path,
      nameBefore: beforeLayer.name,
      nameAfter: afterLayer.name,
      changes: fields,
    });
  }

  const added: LayerDiffEntry[] = afterFlat
    .filter((node) => !usedAfter.has(node))
    .map((node) => ({
      layerId: node.id,
      status: "added" as const,
      kind: node.kind,
      matchedBy: "id" as const,
      afterPath: node.path,
      nameAfter: node.name,
      changes: [],
    }));

  const summary: PsdDiffSummary = {
    beforeLayers: beforeFlat.length,
    afterLayers: afterFlat.length,
    added: added.length,
    removed: removed.length,
    renamed,
    geometryChanged,
    restyled,
    unchanged,
  };
  const simulated = options.simulated === true;
  const baseline = options.baseline ?? "session-open";
  return {
    schema: "layerforge.psd-diff",
    schemaVersion: "0.1.0",
    generatedAt: (options.now ?? new Date()).toISOString(),
    evidence: "engine-layer-tree",
    simulated,
    baseline,
    before: snapshotMeta(before),
    after: snapshotMeta(after),
    summary,
    entries: [...changed, ...removed, ...added],
    notes: [
      baseline === "previous-save"
        ? "对比基准是上一次成功保存后重开的图层树，目标是本次保存重开后的图层树。"
        : "对比基准是本次会话打开文档时的图层树，目标是保存重开后的图层树。",
      "对比对象是图层树结构，不是 PSD 二进制，也不是像素差异。",
      "合成图与逐层像素差异见独立的“原 PSD 对比”：它用 ag-psd 重新解析源 PSD 与保存 PSD，不依赖引擎返回的图层树。",
      "分类计数按每个变更图层的主变化归类：名称优先于几何，几何优先于属性；完整字段见 entries。",
      ...(simulated
        ? ["演示引擎的保存为模拟，本报告只用于界面测试，不能作为 Patchy/Photoshop 证据。"]
        : []),
    ],
  };
}

export function psdDiffFileName(projectName: string, now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `${sanitizeFileName(projectName)}-psd-diff-${stamp}.json`;
}

export function downloadPsdDiff(report: PsdDiffReport, fileName: string): void {
  downloadJson(report, fileName);
}
