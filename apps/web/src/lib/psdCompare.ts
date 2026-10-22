import type {
  DocumentSnapshot,
  LayerBounds,
  LayerNode,
  PsdCompareRecord,
  PsdDiffSummary,
  PsdHeader,
} from "./domain";
import { diffLayerTrees, type LayerDiffEntry } from "./diff";
import { downloadJson, sanitizeFileName } from "./format";
import {
  collectAgLayerIds,
  collectAgLayerImages,
  flattenLayers,
  normalizeLocalLayers,
  type AgLayerImage,
  type AgLayerLike,
} from "./layers";
import { parsePsdHeader, sha256Hex } from "./psd";

const MAX_COMPARE_PIXELS = 36_000_000;
const MAX_LAYER_COMPARE_PIXELS = 48_000_000;
const MAX_LAYER_ENTRIES = 100;
export const PSD_COMPARE_TOLERANCE = 2;

export interface PsdCompareFileSide {
  fileName: string;
  header: PsdHeader;
  sha256: string;
  layerCount: number;
}

export interface PsdComparePixel {
  available: boolean;
  reason?: string;
  tolerance: number;
  sameSize: boolean;
  width: number;
  height: number;
  totalPixels: number;
  differingPixels: number;
  ratio: number;
  maxDelta: number;
  bounds: LayerBounds | null;
}

export type PsdLayerMatch = "id" | "path" | "name";

export interface PsdLayerPixelEntry {
  layerId: string;
  name: string;
  status: "differing" | "unavailable";
  matchedBy: PsdLayerMatch;
  beforePath?: string;
  afterPath?: string;
  width: number;
  height: number;
  totalPixels: number;
  differingPixels: number;
  maxDelta: number;
  bounds: LayerBounds | null;
  reason?: string;
}

export interface PsdLayerPixels {
  available: boolean;
  binaryIdentical: boolean;
  tolerance: number;
  maxPixels: number;
  truncated: boolean;
  compared: number;
  identical: number;
  differing: number;
  unavailable: number;
  unpaired: number;
  matchedById: number;
  matchedByPath: number;
  matchedByName: number;
  totalPixels: number;
  differingPixels: number;
  maxDelta: number;
  entriesTruncated: boolean;
  entries: PsdLayerPixelEntry[];
  reason?: string;
}

export interface PsdComparison {
  schema: "layerforge.psd-compare";
  schemaVersion: "0.2.0";
  generatedAt: string;
  evidence: "ag-psd-independent";
  source: PsdCompareFileSide;
  saved: PsdCompareFileSide;
  identicalBinary: boolean;
  structure: PsdDiffSummary;
  structureEntries: LayerDiffEntry[];
  pixel: PsdComparePixel;
  layerPixels: PsdLayerPixels;
  notes: string[];
}

export interface PsdCompareInput {
  fileName: string;
  bytes: ArrayBuffer | Uint8Array;
}

interface Composite {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface ParsedPsd {
  header: PsdHeader;
  layers: LayerNode[];
  composite: Composite | null;
  compositeReason?: string;
  layerImages: Map<string, AgLayerImage>;
  layerImageReason?: string;
  realIds: Set<string>;
}

function toArrayBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;
  const buffer = input.buffer;
  if (buffer instanceof ArrayBuffer) {
    return buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  }
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  return copy.buffer;
}

function canvas2dAvailable(): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  const context = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  return context !== null && context !== undefined;
}

async function loadAgPsd(): Promise<typeof import("ag-psd")> {
  const module = await import("ag-psd");
  // ag-psd decodes 8-bit composites through createImageData, which needs a 2D
  // canvas. Without one (tests, workers) supply raw buffers so structure and
  // composite parsing still work.
  if (!canvas2dAvailable()) {
    module.initializeCanvas(
      () => {
        throw new Error("Canvas 2D 不可用");
      },
      (width, height) =>
        ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as ImageData,
    );
  }
  return module;
}

function extractComposite(
  value: unknown,
  width: number,
  height: number,
): Composite | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as {
    width?: unknown;
    height?: unknown;
    data?: unknown;
  };
  if (
    typeof record.width !== "number" ||
    typeof record.height !== "number" ||
    !(record.data instanceof Uint8ClampedArray)
  ) {
    return null;
  }
  if (record.width !== width || record.height !== height) return null;
  return { width: record.width, height: record.height, data: record.data };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function parseIndependent(buffer: ArrayBuffer): Promise<ParsedPsd> {
  const header = parsePsdHeader(buffer);
  const { readPsd } = await loadAgPsd();
  const options = {
    skipThumbnail: true,
    skipLinkedFilesData: true,
    useImageData: true,
    logMissingFeatures: false,
    throwForMissingFeatures: false,
  } as const;
  let psd: ReturnType<typeof readPsd>;
  let layerImageReason: string | undefined;
  let compositeDecodeError: string | undefined;
  try {
    psd = readPsd(buffer, {
      ...options,
      skipLayerImageData: false,
      skipCompositeImageData: false,
    });
  } catch (fullError) {
    try {
      // Layer pixels are more expensive to decode than the composite, so keep
      // them only when the full read fails for composite-specific reasons.
      psd = readPsd(buffer, {
        ...options,
        skipLayerImageData: false,
        skipCompositeImageData: true,
      });
      compositeDecodeError = errorMessage(fullError);
    } catch (layerError) {
      try {
        psd = readPsd(buffer, {
          ...options,
          skipLayerImageData: true,
          skipCompositeImageData: false,
        });
        layerImageReason = `逐层像素解码失败：${errorMessage(layerError)}`;
      } catch (compositeError) {
        psd = readPsd(buffer, {
          ...options,
          skipLayerImageData: true,
          skipCompositeImageData: true,
        });
        layerImageReason = `逐层像素解码失败：${errorMessage(layerError)}`;
        compositeDecodeError = errorMessage(compositeError);
      }
    }
  }
  const rawChildren = psd.children as AgLayerLike[] | undefined;
  const layers = normalizeLocalLayers(rawChildren);
  const layerImages = collectAgLayerImages(rawChildren);
  const realIds = collectAgLayerIds(rawChildren);
  const rawImage = (psd as { imageData?: unknown }).imageData;
  const composite = extractComposite(rawImage, header.width, header.height);
  return {
    header,
    layers,
    composite,
    layerImages,
    realIds,
    ...(layerImageReason ? { layerImageReason } : {}),
    ...(compositeDecodeError
      ? { compositeReason: `合成图解码失败：${compositeDecodeError}` }
      : rawImage === undefined || rawImage === null
        ? { compositeReason: "文件没有内嵌合成图（可能需要开启“最大兼容”）" }
        : composite
          ? {}
          : { compositeReason: "内嵌合成图不是 8 位 RGBA，或尺寸与画布不一致" }),
  };
}

interface BufferDiff {
  totalPixels: number;
  differingPixels: number;
  maxDelta: number;
  bounds: LayerBounds | null;
}

function diffBuffers(
  before: Uint8Array | Uint8ClampedArray,
  after: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): BufferDiff {
  let differing = 0;
  let maxDelta = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0, pixel = 0; index < before.length; index += 4, pixel += 1) {
    const alphaDelta = Math.abs(before[index + 3] - after[index + 3]);
    let delta = alphaDelta;
    if (before[index + 3] !== 0 || after[index + 3] !== 0) {
      delta = Math.max(
        delta,
        Math.abs(before[index] - after[index]),
        Math.abs(before[index + 1] - after[index + 1]),
        Math.abs(before[index + 2] - after[index + 2]),
      );
    }
    if (delta > maxDelta) maxDelta = delta;
    if (delta <= PSD_COMPARE_TOLERANCE) continue;
    differing += 1;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return {
    totalPixels: width * height,
    differingPixels: differing,
    maxDelta,
    bounds:
      maxX >= 0 && maxY >= 0
        ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
        : null,
  };
}

function compareComposite(
  source: ParsedPsd,
  saved: ParsedPsd,
  maxPixels: number,
  identicalBinary: boolean,
): PsdComparePixel {
  const width = source.header.width;
  const height = source.header.height;
  const empty = {
    tolerance: PSD_COMPARE_TOLERANCE,
    width,
    height,
    totalPixels: 0,
    differingPixels: 0,
    ratio: 0,
    maxDelta: 0,
    bounds: null,
  };
  if (!source.composite || !saved.composite) {
    return {
      ...empty,
      available: false,
      reason:
        source.compositeReason ??
        saved.compositeReason ??
        "至少一方缺少可读取的内嵌合成图",
      sameSize: source.composite !== null && saved.composite !== null,
    };
  }
  if (!identicalBinary && (saved.header.width !== width || saved.header.height !== height)) {
    return {
      ...empty,
      available: false,
      reason: `画布尺寸不一致：${width}×${height} vs ${saved.header.width}×${saved.header.height}`,
      sameSize: false,
    };
  }
  const totalPixels = width * height;
  if (totalPixels > maxPixels) {
    return {
      ...empty,
      available: false,
      reason: `画布 ${width}×${height} 超过独立像素对比上限 ${maxPixels.toLocaleString()} 像素`,
      sameSize: true,
    };
  }
  if (identicalBinary) {
    return {
      ...empty,
      available: true,
      differingPixels: 0,
      totalPixels,
      sameSize: true,
    };
  }
  const diff = diffBuffers(
    source.composite.data,
    saved.composite.data,
    width,
    height,
  );
  return {
    available: true,
    tolerance: PSD_COMPARE_TOLERANCE,
    sameSize: true,
    width,
    height,
    totalPixels,
    differingPixels: diff.differingPixels,
    ratio: totalPixels > 0 ? diff.differingPixels / totalPixels : 0,
    maxDelta: diff.maxDelta,
    bounds: diff.bounds,
  };
}

interface LayerPair {
  before: LayerNode;
  after: LayerNode;
  matchedBy: PsdLayerMatch;
}

function layerMatchKey(node: LayerNode): string {
  const size = node.bounds ? `${node.bounds.width}x${node.bounds.height}` : "?";
  return `${node.kind}\u0000${node.name}\u0000${size}`;
}

function layerNameKey(node: LayerNode): string {
  return `${node.kind}\u0000${node.name}`;
}

function pairUniqueByKey(
  beforeLeaves: LayerNode[],
  afterLeaves: LayerNode[],
  usedBefore: Set<LayerNode>,
  usedAfter: Set<LayerNode>,
  pairs: LayerPair[],
  keyOf: (node: LayerNode) => string,
): void {
  const beforeByKey = new Map<string, LayerNode[]>();
  for (const layer of beforeLeaves) {
    if (usedBefore.has(layer)) continue;
    const key = keyOf(layer);
    const list = beforeByKey.get(key);
    if (list) list.push(layer);
    else beforeByKey.set(key, [layer]);
  }
  const afterByKey = new Map<string, LayerNode[]>();
  for (const layer of afterLeaves) {
    if (usedAfter.has(layer)) continue;
    const key = keyOf(layer);
    const list = afterByKey.get(key);
    if (list) list.push(layer);
    else afterByKey.set(key, [layer]);
  }
  for (const [key, beforeList] of beforeByKey) {
    if (beforeList.length !== 1) continue;
    const afterList = (afterByKey.get(key) ?? []).filter((node) => !usedAfter.has(node));
    if (afterList.length !== 1) continue;
    usedBefore.add(beforeList[0]);
    usedAfter.add(afterList[0]);
    pairs.push({ before: beforeList[0], after: afterList[0], matchedBy: "name" });
  }
}

function layerBoxSize(node: LayerNode): string {
  return node.bounds ? `${node.bounds.width}x${node.bounds.height}` : "?";
}

function sameKindAndSize(left: LayerNode, right: LayerNode): boolean {
  return left.kind === right.kind && layerBoxSize(left) === layerBoxSize(right);
}

function pairLayers(
  before: LayerNode[],
  after: LayerNode[],
  beforeRealIds: Set<string>,
  afterRealIds: Set<string>,
): { pairs: LayerPair[]; unpaired: number } {
  const beforeLeaves = flattenLayers(before).filter((node) => node.kind !== "group");
  const afterLeaves = flattenLayers(after).filter((node) => node.kind !== "group");
  const usedBefore = new Set<LayerNode>();
  const usedAfter = new Set<LayerNode>();
  const pairs: LayerPair[] = [];

  // Path-derived fallback ids collide when a layer moves, so join on ids only
  // when both sides carry a real PSD layer id.
  const afterById = new Map(
    afterLeaves
      .filter((node) => afterRealIds.has(node.id))
      .map((node) => [node.id, node]),
  );
  for (const beforeLayer of beforeLeaves) {
    if (!beforeRealIds.has(beforeLayer.id)) continue;
    const afterLayer = afterById.get(beforeLayer.id);
    if (!afterLayer || usedAfter.has(afterLayer)) continue;
    usedBefore.add(beforeLayer);
    usedAfter.add(afterLayer);
    pairs.push({ before: beforeLayer, after: afterLayer, matchedBy: "id" });
  }

  // A unique name+kind+size survives grouping (which rewrites paths) and wins
  // over positional matches, so a shifted path cannot steal another layer.
  pairUniqueByKey(beforeLeaves, afterLeaves, usedBefore, usedAfter, pairs, layerMatchKey);
  // A second name+kind pass pairs resized layers so their size change can be
  // reported instead of silently becoming an unpaired leaf.
  pairUniqueByKey(beforeLeaves, afterLeaves, usedBefore, usedAfter, pairs, layerNameKey);

  // Path is the last resort, and only when kind and size still agree; this
  // keeps renames paired without matching a merged layer to a shifted index.
  const afterByPath = new Map(afterLeaves.map((node) => [node.path, node]));
  for (const beforeLayer of beforeLeaves) {
    if (usedBefore.has(beforeLayer)) continue;
    const afterLayer = afterByPath.get(beforeLayer.path);
    if (!afterLayer || usedAfter.has(afterLayer)) continue;
    if (!sameKindAndSize(beforeLayer, afterLayer)) continue;
    usedBefore.add(beforeLayer);
    usedAfter.add(afterLayer);
    pairs.push({ before: beforeLayer, after: afterLayer, matchedBy: "path" });
  }

  return {
    pairs,
    unpaired: beforeLeaves.length + afterLeaves.length - pairs.length * 2,
  };
}

function layerEntryBase(pair: LayerPair): Pick<
  PsdLayerPixelEntry,
  "layerId" | "name" | "matchedBy" | "beforePath" | "afterPath"
> {
  return {
    layerId: pair.after.id,
    name: pair.after.name,
    matchedBy: pair.matchedBy,
    beforePath: pair.before.path,
    afterPath: pair.after.path,
  };
}

function compareLayerPixels(
  source: ParsedPsd,
  saved: ParsedPsd,
  identicalBinary: boolean,
  maxPixels: number,
): PsdLayerPixels {
  const { pairs, unpaired } = pairLayers(
    source.layers,
    saved.layers,
    source.realIds,
    saved.realIds,
  );
  const entries: PsdLayerPixelEntry[] = [];
  let compared = 0;
  let identical = 0;
  let differing = 0;
  let unavailable = 0;
  let totalPixels = 0;
  let differingPixels = 0;
  let maxDelta = 0;
  let truncated = false;
  let matchedById = 0;
  let matchedByPath = 0;
  let matchedByName = 0;

  for (const pair of pairs) {
    if (pair.matchedBy === "id") matchedById += 1;
    else if (pair.matchedBy === "path") matchedByPath += 1;
    else matchedByName += 1;
    const beforeImage = source.layerImages.get(pair.before.id);
    const afterImage = saved.layerImages.get(pair.after.id);
    if (!beforeImage || !afterImage) {
      unavailable += 1;
      entries.push({
        ...layerEntryBase(pair),
        status: "unavailable",
        width: beforeImage?.width ?? afterImage?.width ?? 0,
        height: beforeImage?.height ?? afterImage?.height ?? 0,
        totalPixels: 0,
        differingPixels: 0,
        maxDelta: 0,
        bounds: null,
        reason: beforeImage ? "保存文件没有该图层的像素数据" : "源文件没有该图层的像素数据",
      });
      continue;
    }
    if (beforeImage.width !== afterImage.width || beforeImage.height !== afterImage.height) {
      unavailable += 1;
      entries.push({
        ...layerEntryBase(pair),
        status: "unavailable",
        width: afterImage.width,
        height: afterImage.height,
        totalPixels: 0,
        differingPixels: 0,
        maxDelta: 0,
        bounds: null,
        reason: `图层尺寸变化：${beforeImage.width}×${beforeImage.height} → ${afterImage.width}×${afterImage.height}`,
      });
      continue;
    }
    const pixels = beforeImage.width * beforeImage.height;
    if (totalPixels + pixels > maxPixels) {
      truncated = true;
      continue;
    }
    compared += 1;
    totalPixels += pixels;
    if (identicalBinary) {
      identical += 1;
      continue;
    }
    const diff = diffBuffers(
      beforeImage.data,
      afterImage.data,
      beforeImage.width,
      beforeImage.height,
    );
    if (diff.maxDelta > maxDelta) maxDelta = diff.maxDelta;
    differingPixels += diff.differingPixels;
    if (diff.differingPixels === 0) {
      identical += 1;
      continue;
    }
    differing += 1;
    entries.push({
      ...layerEntryBase(pair),
      status: "differing",
      width: afterImage.width,
      height: afterImage.height,
      totalPixels: diff.totalPixels,
      differingPixels: diff.differingPixels,
      maxDelta: diff.maxDelta,
      bounds: diff.bounds,
    });
  }

  entries.sort((left, right) => right.differingPixels - left.differingPixels);
  const capped = entries.slice(0, MAX_LAYER_ENTRIES);
  let reason: string | undefined;
  if (compared === 0) {
    if (pairs.length === 0) {
      reason = "没有可匹配的非组图层";
    } else if (truncated) {
      reason = `逐层像素总量超过上限 ${maxPixels.toLocaleString()} 像素`;
    } else {
      reason =
        source.layerImages.size === 0 || saved.layerImages.size === 0
          ? (source.layerImageReason ??
            saved.layerImageReason ??
            "至少一方没有可解码的图层像素数据")
          : "匹配图层的像素尺寸变化或缺少像素数据";
    }
  }
  return {
    available: compared > 0,
    binaryIdentical: identicalBinary,
    tolerance: PSD_COMPARE_TOLERANCE,
    maxPixels,
    truncated,
    compared,
    identical,
    differing,
    unavailable,
    unpaired,
    matchedById,
    matchedByPath,
    matchedByName,
    totalPixels,
    differingPixels,
    maxDelta,
    entriesTruncated: capped.length < entries.length,
    entries: capped,
    ...(reason ? { reason } : {}),
  };
}

function toSnapshot(
  side: ParsedPsd,
  documentId: string,
  capturedAt: string,
): DocumentSnapshot {
  return {
    documentId,
    revision: "0",
    fingerprint: documentId,
    width: side.header.width,
    height: side.header.height,
    layers: side.layers,
    capturedAt,
  };
}

export async function comparePsdFiles(
  source: PsdCompareInput,
  saved: PsdCompareInput,
  options: { now?: Date; maxPixels?: number; maxLayerPixels?: number } = {},
): Promise<PsdComparison> {
  const now = options.now ?? new Date();
  const sourceBuffer = toArrayBuffer(source.bytes);
  const savedBuffer = toArrayBuffer(saved.bytes);
  const [sourceHash, savedHash, sourceParsed, savedParsed] = await Promise.all([
    sha256Hex(sourceBuffer),
    sha256Hex(savedBuffer),
    parseIndependent(sourceBuffer),
    parseIndependent(savedBuffer),
  ]);
  const identicalBinary =
    sourceHash === savedHash && sourceBuffer.byteLength === savedBuffer.byteLength;
  const pixel = compareComposite(
    sourceParsed,
    savedParsed,
    options.maxPixels ?? MAX_COMPARE_PIXELS,
    identicalBinary,
  );
  const layerPixels = compareLayerPixels(
    sourceParsed,
    savedParsed,
    identicalBinary,
    options.maxLayerPixels ?? MAX_LAYER_COMPARE_PIXELS,
  );
  const structure = diffLayerTrees(
    toSnapshot(sourceParsed, "independent-source", now.toISOString()),
    toSnapshot(savedParsed, "independent-saved", now.toISOString()),
    { now },
  );
  return {
    schema: "layerforge.psd-compare",
    schemaVersion: "0.2.0",
    generatedAt: now.toISOString(),
    evidence: "ag-psd-independent",
    source: {
      fileName: source.fileName,
      header: sourceParsed.header,
      sha256: sourceHash,
      layerCount: flattenLayers(sourceParsed.layers).length,
    },
    saved: {
      fileName: saved.fileName,
      header: savedParsed.header,
      sha256: savedHash,
      layerCount: flattenLayers(savedParsed.layers).length,
    },
    identicalBinary,
    structure: structure.summary,
    structureEntries: structure.entries,
    pixel,
    layerPixels,
    notes: [
      "对比双方均由 ag-psd 独立解析：源文件取自导入时的本地副本，保存文件由 Patchy 另存后从 MEMFS 读回。",
      "结构对比按图层 id/路径匹配；编组与合并会改变路径，新增/移除计数需结合命名与合并计划解读。",
      "逐层像素对比按 真实图层 ID → 唯一名称+类型+尺寸 → 路径+同类型同尺寸 配对非组图层，只比较尺寸一致的图层缓存，不做位移对齐；未配对图层不计入逐层差异。",
      "像素数据来自两份 PSD 的图层缓存与内嵌合成图，不是 Photoshop 渲染，也不等同于 PSD 二进制逐字节比较。",
      ...(identicalBinary ? ["两份文件 SHA-256 相同。"] : []),
      ...(pixel.available ? [] : [`合成图对比不可用：${pixel.reason}`]),
      ...(layerPixels.available
        ? [
            layerPixels.truncated
              ? `逐层像素对比达到 ${layerPixels.maxPixels.toLocaleString()} 像素上限，其余匹配图层未比较。`
              : `逐层像素对比了 ${layerPixels.compared} 个匹配图层，${layerPixels.unpaired} 个叶层未配对。`,
          ]
        : [`逐层像素对比不可用：${layerPixels.reason ?? "没有可比较的图层像素数据"}`]),
    ],
  };
}

export function summarizePsdComparison(report: PsdComparison): PsdCompareRecord {
  return {
    sourceSha256: report.source.sha256,
    savedSha256: report.saved.sha256,
    identicalBinary: report.identicalBinary,
    sourceLayers: report.source.layerCount,
    savedLayers: report.saved.layerCount,
    width: report.saved.header.width,
    height: report.saved.header.height,
    added: report.structure.added,
    removed: report.structure.removed,
    renamed: report.structure.renamed,
    geometryChanged: report.structure.geometryChanged,
    restyled: report.structure.restyled,
    pixelAvailable: report.pixel.available,
    pixelDiffering: report.pixel.available ? report.pixel.differingPixels : null,
    pixelTotal: report.pixel.available ? report.pixel.totalPixels : null,
    pixelRatio: report.pixel.available ? report.pixel.ratio : null,
    pixelMaxDelta: report.pixel.available ? report.pixel.maxDelta : null,
    layerPixelAvailable: report.layerPixels.available,
    layerPixelCompared: report.layerPixels.compared,
    layerPixelIdentical: report.layerPixels.identical,
    layerPixelDifferingLayers: report.layerPixels.differing,
    layerPixelDiffering: report.layerPixels.differingPixels,
    layerPixelTotal: report.layerPixels.totalPixels,
    layerPixelMaxDelta: report.layerPixels.maxDelta,
    layerPixelTruncated: report.layerPixels.truncated,
  };
}

export function psdCompareFileName(projectName: string, now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `${sanitizeFileName(projectName)}-psd-compare-${stamp}.json`;
}

export function downloadPsdCompare(report: PsdComparison, fileName: string): void {
  downloadJson(report, fileName);
}
