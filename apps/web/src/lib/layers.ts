import type { LayerBounds, LayerKind, LayerNode } from "./domain";

type RawRecord = Record<string, unknown>;

export interface AgLayerLike {
  name?: string;
  id?: number;
  children?: AgLayerLike[];
  top?: number;
  left?: number;
  bottom?: number;
  right?: number;
  hidden?: boolean;
  opacity?: number;
  blendMode?: string;
  clipping?: boolean;
  text?: unknown;
  adjustment?: unknown;
  placedLayer?: unknown;
  vectorFill?: unknown;
  vectorStroke?: unknown;
  vectorMask?: unknown;
  effects?: unknown;
  mask?: unknown;
  sectionDivider?: { type?: number };
  protected?: { position?: boolean; transparency?: boolean };
}

const KIND_LABELS: Record<LayerKind, string> = {
  group: "组",
  pixel: "像素",
  text: "文本",
  adjustment: "调整层",
  shape: "形状",
  "smart-object": "智能对象",
  unknown: "未知",
};

export function layerKindLabel(kind: LayerKind): string {
  return KIND_LABELS[kind];
}

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function normalizeBounds(value: unknown): LayerBounds | undefined {
  if (!isRecord(value)) return undefined;
  const nested = isRecord(value.bounds) ? value.bounds : isRecord(value.rect) ? value.rect : value;
  const left = readNumber(nested.left);
  const top = readNumber(nested.top);
  const right = readNumber(nested.right);
  const bottom = readNumber(nested.bottom);
  const x = readNumber(nested.x) ?? left;
  const y = readNumber(nested.y) ?? top;
  const width =
    readNumber(nested.width) ?? (left !== undefined && right !== undefined ? right - left : undefined);
  const height =
    readNumber(nested.height) ??
    (top !== undefined && bottom !== undefined ? bottom - top : undefined);
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined;
  }
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(0, Math.round(width)),
    height: Math.max(0, Math.round(height)),
  };
}

function detectPatchyKind(raw: RawRecord, children: LayerNode[]): LayerKind {
  const rawType = (readString(raw.type) ?? readString(raw.kind) ?? readString(raw.layerType) ?? "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  if (
    raw.isGroup === true ||
    raw.isArtboard === true ||
    raw.group === true ||
    rawType === "group" ||
    rawType === "folder"
  ) {
    return "group";
  }
  if (children.length > 0) return "group";
  if (raw.isText === true || raw.text !== undefined || rawType.includes("text")) return "text";
  if (raw.adjustment !== undefined || rawType.includes("adjust")) return "adjustment";
  if (
    raw.smartObject !== undefined ||
    rawType.includes("smartobject") ||
    rawType === "smart"
  ) {
    return "smart-object";
  }
  if (raw.isShape === true || rawType.includes("shape") || rawType.includes("vector")) {
    return "shape";
  }
  if (rawType.includes("raster") || rawType.includes("pixel") || rawType === "normal") {
    return "pixel";
  }
  // Patchy automation state exposes only isGroup/isText/isArtboard/isShape;
  // every remaining leaf is a raster layer.
  if (typeof raw.isGroup === "boolean") return "pixel";
  return "unknown";
}

export function normalizePatchyLayers(rawLayers: unknown, parentPath = ""): LayerNode[] {
  if (!Array.isArray(rawLayers)) return [];
  return rawLayers.reduce<LayerNode[]>((nodes, entry, index) => {
    if (!isRecord(entry)) return nodes;
    const path = parentPath ? `${parentPath}/${index}` : String(index);
    const children = normalizePatchyLayers(entry.children, path);
    const rawId = readString(entry.id) ?? (readNumber(entry.id)?.toString());
    const name = readString(entry.name)?.trim() || `layer_${rawId ?? path}`;
    const kind = detectPatchyKind(entry, children);
    const opacityValue = readNumber(entry.opacity);
    const visible =
      typeof entry.visible === "boolean" ? entry.visible : entry.hidden !== true;
    const locked =
      typeof entry.locked === "boolean"
        ? entry.locked
        : typeof entry.isLocked === "boolean"
          ? entry.isLocked
          : false;
    const clipping =
      entry.clipping === true || entry.clipped === true || entry.clipToBelow === true;
    const meta: Record<string, string | number | boolean> = {};
    if (entry.mask !== undefined) meta.hasMask = true;
    if (entry.effects !== undefined) meta.hasEffects = true;
    if (entry.text !== undefined) meta.hasText = true;
    const own = normalizeBounds(entry.bounds ?? entry.rect);
    const bounds =
      own && (own.width > 0 || own.height > 0) ? own : kind === "group" ? unionBounds(children) : own;
    nodes.push({
      id: rawId ?? path,
      name,
      path,
      kind,
      bounds,
      visible,
      locked,
      opacity:
        opacityValue === undefined ? 100 : Math.min(100, Math.max(0, Math.round(opacityValue))),
      blendMode: readString(entry.blendMode),
      clipping,
      children,
      ...(Object.keys(meta).length > 0 ? { meta } : {}),
    });
    return nodes;
  }, []);
}

function detectLocalKind(raw: AgLayerLike, children: LayerNode[]): LayerKind {
  const isGroup =
    children.length > 0 ||
    (raw.sectionDivider?.type !== undefined && raw.sectionDivider.type >= 1);
  if (isGroup) return "group";
  if (raw.text !== undefined) return "text";
  if (raw.adjustment !== undefined) return "adjustment";
  if (raw.placedLayer !== undefined) return "smart-object";
  if (raw.vectorFill !== undefined || raw.vectorStroke !== undefined) return "shape";
  return "pixel";
}

/**
 * ag-psd leaves group rects empty, so group extents are derived from the
 * deepest children that do carry bounds.
 */
export function unionBounds(nodes: LayerNode[]): LayerBounds | undefined {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let seen = false;
  const walk = (list: LayerNode[]) => {
    for (const node of list) {
      if (node.bounds && (node.bounds.width > 0 || node.bounds.height > 0)) {
        seen = true;
        left = Math.min(left, node.bounds.x);
        top = Math.min(top, node.bounds.y);
        right = Math.max(right, node.bounds.x + node.bounds.width);
        bottom = Math.max(bottom, node.bounds.y + node.bounds.height);
      }
      walk(node.children);
    }
  };
  walk(nodes);
  if (!seen) return undefined;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function readColorHex(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const red = readNumber(value.r);
  const green = readNumber(value.g);
  const blue = readNumber(value.b);
  if (red === undefined || green === undefined || blue === undefined) return undefined;
  const channel = (number: number) =>
    Math.max(0, Math.min(255, Math.round(number))).toString(16).padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function readTextMeta(value: unknown): Record<string, string | number | boolean> {
  if (!isRecord(value)) return {};
  const meta: Record<string, string | number | boolean> = { hasText: true };
  const content = readString(value.text);
  if (content !== undefined) {
    meta.text = content.length > 500 ? `${content.slice(0, 500)}…` : content;
  }
  const style = isRecord(value.style) ? value.style : undefined;
  if (style) {
    const font = isRecord(style.font) ? readString(style.font.name) : undefined;
    if (font) meta.fontFamily = font;
    const fontSize = readNumber(style.fontSize);
    if (fontSize !== undefined) meta.fontSize = Math.round(fontSize * 100) / 100;
    const color = readColorHex(style.fillColor);
    if (color) meta.textColor = color;
    if (style.fauxBold === true || (font !== undefined && /bold|black|heavy/i.test(font))) {
      meta.bold = true;
    }
  }
  const paragraph = isRecord(value.paragraphStyle) ? value.paragraphStyle : undefined;
  const align = paragraph ? readString(paragraph.justification) : undefined;
  if (align) meta.textAlign = align;
  if (Array.isArray(value.styleRuns) && value.styleRuns.length > 1) {
    meta.textRuns = value.styleRuns.length;
  }
  return meta;
}

export function normalizeLocalLayers(
  rawLayers: AgLayerLike[] | undefined,
  parentPath = "",
): LayerNode[] {
  if (!rawLayers) return [];
  return rawLayers.map((raw, index) => {
    const path = parentPath ? `${parentPath}/${index}` : String(index);
    const children = normalizeLocalLayers(raw.children, path);
    const kind = detectLocalKind(raw, children);
    const meta: Record<string, string | number | boolean> = {};
    if (raw.mask !== undefined) meta.hasMask = true;
    if (raw.effects !== undefined) meta.hasEffects = true;
    if (raw.text !== undefined) Object.assign(meta, readTextMeta(raw.text));
    if (raw.clipping) meta.clipping = true;
    const own = normalizeBounds({
      left: raw.left,
      top: raw.top,
      right: raw.right,
      bottom: raw.bottom,
    });
    const bounds =
      own && (own.width > 0 || own.height > 0) ? own : kind === "group" ? unionBounds(children) : own;
    return {
      id: raw.id !== undefined ? `local-${raw.id}` : `local-${path}`,
      name: raw.name?.trim() || `layer_${path}`,
      path,
      kind,
      bounds,
      visible: !raw.hidden,
      locked: raw.protected?.position === true,
      opacity:
        raw.opacity === undefined
          ? 100
          : Math.min(100, Math.max(0, Math.round(raw.opacity * 100))),
      blendMode: raw.blendMode,
      clipping: raw.clipping === true,
      children,
      ...(Object.keys(meta).length > 0 ? { meta } : {}),
    };
  });
}

export function flattenLayers(layers: LayerNode[]): LayerNode[] {
  const result: LayerNode[] = [];
  const walk = (nodes: LayerNode[]) => {
    for (const node of nodes) {
      result.push(node);
      walk(node.children);
    }
  };
  walk(layers);
  return result;
}

export function countLayers(layers: LayerNode[]): number {
  return flattenLayers(layers).length;
}

export function findLayerById(layers: LayerNode[], id: string): LayerNode | undefined {
  return flattenLayers(layers).find((layer) => layer.id === id);
}

export function findLayerByPath(layers: LayerNode[], path: string): LayerNode | undefined {
  return flattenLayers(layers).find((layer) => layer.path === path);
}

export function filterLayerTree(layers: LayerNode[], query: string): LayerNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return layers;
  const result: LayerNode[] = [];
  for (const node of layers) {
    const selfMatches =
      node.name.toLowerCase().includes(needle) ||
      layerKindLabel(node.kind).includes(needle) ||
      node.kind.includes(needle);
    const children = filterLayerTree(node.children, needle);
    if (selfMatches) {
      result.push(node);
    } else if (children.length > 0) {
      result.push({ ...node, children });
    }
  }
  return result;
}

export function collectLayerPaths(layers: LayerNode[]): string[] {
  return flattenLayers(layers).map((layer) => layer.path);
}

export function kindBreakdown(layers: LayerNode[]): Array<{ kind: LayerKind; count: number }> {
  const counts = new Map<LayerKind, number>();
  for (const layer of flattenLayers(layers)) {
    counts.set(layer.kind, (counts.get(layer.kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count);
}
