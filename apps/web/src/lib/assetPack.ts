import { zipSync } from "fflate";
import type {
  DocumentSnapshot,
  EngineMode,
  LayerBounds,
  LayerNode,
  PlanEntry,
  ProjectRecord,
} from "./domain";
import type {
  CleanupGroupSuggestion,
  CleanupMergeCandidate,
  CleanupReport,
  CleanupSliceCandidate,
} from "./cleanup";
import { downloadBlob, sanitizeFileName } from "./format";
import { buildDesignIr } from "./ir";
import { layoutSummary } from "./layout";
import { layerKindLabel } from "./layers";
import { sha256Hex } from "./psd";

const MAX_PACK_BYTES = 512 * 1024 * 1024;
const MAX_OUTPUT_DIMENSION = 8192;
const MAX_DOCUMENT_PIXELS = 90_000_000;
const VERIFY_TOLERANCE = 2;
const MAX_GALLERY_ITEMS = 200;

interface PixelDataLike {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface AssetPackOutput {
  fileName: string;
  scale: number;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  source: "composite-crop" | "composite-upscale";
}

export interface AssetPackAsset {
  id: string;
  name: string;
  semanticName: string | null;
  sourcePath: string;
  sourceLayerId: string;
  kind: CleanupSliceCandidate["kind"];
  bounds: LayerBounds;
  outputs: AssetPackOutput[];
  verification: {
    checked: boolean;
    mismatched: boolean;
  };
}

export interface AssetPackMergedAsset {
  id: string;
  name: string;
  suggestedName: string;
  sourcePath: string;
  kind: CleanupMergeCandidate["kind"];
  memberPaths: string[];
  bounds: LayerBounds;
  areaRatio: number;
  outputs: AssetPackOutput[];
  verification: {
    checked: boolean;
    mismatched: boolean;
  };
}

export interface AssetPackComparison {
  method: "composite-crops-and-decode-verification";
  width: number;
  height: number;
  totalPixels: number;
  coveredPixels: number;
  coverageRatio: number;
  verifiedAssets: number;
  mismatchedAssets: number;
  verifiedMergedAssets: number;
  mismatchedMergedAssets: number;
  maxChannelDelta: number;
  tolerance: number;
  notes: string[];
}

export interface AssetPackLimits {
  byteBudget: number;
  bytesUsed: number;
  truncated: boolean;
  skippedAssets: number;
  skippedMergedAssets: number;
  skippedOutputs: number;
  oversizedOutputs: number;
}

export interface AssetPackManifest {
  schema: "layerforge.asset-pack";
  schemaVersion: "0.3.0";
  generatedAt: string;
  status: {
    validated: false;
    pixels: "generated-local-composite-crops";
    note: string;
  };
  project: { id: string; name: string };
  source: {
    fileName: string;
    sha256: string;
    width: number;
    height: number;
    depth: number;
    colorMode: string;
  };
  document: {
    engine: EngineMode;
    documentId: string;
    revision: string;
  };
  analysis: {
    nodes: number;
    slices: number;
    groups: number;
    merges: number;
    mergedAssets: number;
    renames: number;
  };
  logicalGroups: CleanupGroupSuggestion[];
  mergeCandidates: CleanupMergeCandidate[];
  assets: AssetPackAsset[];
  mergedAssets: AssetPackMergedAsset[];
  comparison: AssetPackComparison;
  limits: AssetPackLimits;
  files: string[];
  notes: string[];
}

export interface AssetPackResult {
  fileName: string;
  bytes: Uint8Array;
  manifest: AssetPackManifest;
  comparison: AssetPackComparison;
  assets: AssetPackAsset[];
  mergedAssets: AssetPackMergedAsset[];
  limits: AssetPackLimits;
}

export interface AssetPackBuildOptions {
  project: ProjectRecord;
  snapshot: DocumentSnapshot;
  plan: PlanEntry[];
  engine: EngineMode;
  report: CleanupReport;
  file: Blob;
  now?: Date;
  onProgress?: (message: string, done: number, total: number) => void;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("浏览器无法创建 2D 画布");
  return context;
}

function clampBounds(
  bounds: LayerBounds,
  width: number,
  height: number,
): LayerBounds | null {
  const x = Math.max(0, Math.floor(bounds.x));
  const y = Math.max(0, Math.floor(bounds.y));
  const right = Math.min(width, Math.ceil(bounds.x + bounds.width));
  const bottom = Math.min(height, Math.ceil(bounds.y + bounds.height));
  if (right - x < 1 || bottom - y < 1) return null;
  return { x, y, width: right - x, height: bottom - y };
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("PNG 编码失败：浏览器没有返回 Blob"));
        return;
      }
      blob
        .arrayBuffer()
        .then((buffer) => resolve(new Uint8Array(buffer)))
        .catch(reject);
    }, "image/png");
  });
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const copy = bytes.slice();
  return sha256Hex(copy.buffer);
}

function isPixelData(value: unknown): value is PixelDataLike {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { width?: unknown; height?: unknown; data?: unknown };
  return (
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    candidate.data instanceof Uint8ClampedArray
  );
}

export interface CompositeImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export async function readPsdComposite(file: Blob): Promise<CompositeImage> {
  const buffer = await file.arrayBuffer();
  const { readPsd } = await import("ag-psd");
  const psd = readPsd(buffer, {
    skipLayerImageData: true,
    skipCompositeImageData: false,
    skipThumbnail: true,
    skipLinkedFilesData: true,
    useImageData: true,
    logMissingFeatures: false,
    throwForMissingFeatures: false,
  });
  const width = psd.width;
  const height = psd.height;
  if (!width || !height) throw new Error("PSD 缺少有效的画布尺寸");
  if (width * height > MAX_DOCUMENT_PIXELS) {
    throw new Error(
      `画布 ${width}×${height} 超过本地资产包上限 ${MAX_DOCUMENT_PIXELS.toLocaleString()} 像素`,
    );
  }
  if (!isPixelData(psd.imageData)) {
    throw new Error(
      "PSD 没有可读取的合成图像；请确认文件包含兼容性合成预览（Photoshop 中“最大兼容”开启）",
    );
  }
  const data = psd.imageData;
  if (data.width !== width || data.height !== height) {
    throw new Error("PSD 合成图像尺寸与画布尺寸不一致");
  }
  return {
    width,
    height,
    data: new Uint8ClampedArray(data.data),
  };
}

interface VerificationResult {
  checked: boolean;
  mismatched: boolean;
  maxChannelDelta: number;
}

async function verifyPngAgainstPixels(
  bytes: Uint8Array,
  expected: ImageData,
): Promise<VerificationResult> {
  if (typeof createImageBitmap !== "function") {
    return { checked: false, mismatched: false, maxChannelDelta: 0 };
  }
  const blob = new Blob([bytes.slice().buffer], { type: "image/png" });
  const bitmap = await createImageBitmap(blob);
  const width = bitmap.width;
  const height = bitmap.height;
  const canvas = createCanvas(width, height);
  const context = context2d(canvas);
  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  if (width !== expected.width || height !== expected.height) {
    return { checked: true, mismatched: true, maxChannelDelta: 255 };
  }
  const actual = context.getImageData(0, 0, width, height);
  let maxChannelDelta = 0;
  let mismatched = false;
  for (let index = 0; index < actual.data.length; index += 4) {
    const expectedAlpha = expected.data[index + 3];
    const actualAlpha = actual.data[index + 3];
    const alphaDelta = Math.abs(expectedAlpha - actualAlpha);
    if (alphaDelta > maxChannelDelta) maxChannelDelta = alphaDelta;
    if (alphaDelta > VERIFY_TOLERANCE) mismatched = true;
    if (expectedAlpha === 0 && actualAlpha === 0) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = Math.abs(expected.data[index + channel] - actual.data[index + channel]);
      if (delta > maxChannelDelta) maxChannelDelta = delta;
      if (delta > VERIFY_TOLERANCE) mismatched = true;
    }
  }
  return { checked: true, mismatched, maxChannelDelta };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function percent(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${((value / total) * 100).toFixed(4)}%`;
}

export function buildAssetPackPreview(options: {
  projectName: string;
  width: number;
  height: number;
  assets: AssetPackAsset[];
  comparison: AssetPackComparison;
  engine: EngineMode;
}): string {
  const { projectName, width, height, assets, comparison, engine } = options;
  const oneX = assets
    .map((asset) => ({
      asset,
      output: asset.outputs.find((item) => item.scale === 1),
    }))
    .filter(
      (item): item is { asset: AssetPackAsset; output: AssetPackOutput } =>
        item.output !== undefined,
    );
  const stageImages = oneX
    .map(({ asset, output }) => {
      const bounds = asset.bounds;
      const style = [
        `left:${percent(bounds.x, width)}`,
        `top:${percent(bounds.y, height)}`,
        `width:${percent(bounds.width, width)}`,
        `height:${percent(bounds.height, height)}`,
      ].join(";");
      return `<img class="slice" src="assets/${escapeHtml(output.fileName)}" alt="${escapeHtml(asset.name)}" title="${escapeHtml(asset.name)}" style="${style}" data-path="${escapeHtml(asset.sourcePath)}" data-semantic-name="${escapeHtml(asset.semanticName ?? "")}" />`;
    })
    .join("\n      ");
  const gallery = oneX.slice(0, MAX_GALLERY_ITEMS)
    .map(({ asset, output }) => {
      const semantic =
        asset.semanticName && asset.semanticName !== asset.name
          ? `<span class="semantic">${escapeHtml(asset.semanticName)}</span>`
          : "";
      return `<figure class="asset">
        <div class="asset__image"><img src="assets/${escapeHtml(output.fileName)}" alt="${escapeHtml(asset.name)}" loading="lazy" /></div>
        <figcaption>
          <strong>${escapeHtml(asset.name)}</strong>${semantic}
          <span class="meta">${escapeHtml(layerKindLabel(asset.kind))} · ${asset.bounds.width}×${asset.bounds.height} · /${escapeHtml(asset.sourcePath)}</span>
          <code>${escapeHtml(output.fileName)}</code>
        </figcaption>
      </figure>`;
    })
    .join("\n      ");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(projectName)} · LayerForge 资产包预览</title>
  <style>
    :root { color-scheme: dark; --bg:#0f1115; --panel:#171a21; --border:#2a303b; --text:#e7ebf2; --muted:#98a2b3; --accent:#6ea8fe; }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font:13px/1.55 ui-sans-serif,system-ui,"Segoe UI",sans-serif; }
    header { padding:26px 28px 12px; border-bottom:1px solid var(--border); }
    h1 { margin:0 0 6px; font-size:20px; }
    h2 { margin:0 0 10px; font-size:14px; }
    p { margin:0 0 6px; color:var(--muted); }
    main { padding:20px 28px 40px; display:flex; flex-direction:column; gap:26px; }
    .badge { display:inline-block; padding:2px 7px; border:1px solid var(--border); border-radius:999px; font-size:11px; color:var(--muted); margin-right:6px; }
    .compare { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px; }
    .frame { border:1px solid var(--border); border-radius:10px; overflow:hidden; background:var(--panel); }
    .frame h3 { margin:0; padding:9px 12px; font-size:12px; border-bottom:1px solid var(--border); color:var(--muted); font-weight:600; }
    .stage-wrap { padding:12px; background-image:linear-gradient(45deg,#20242c 25%,transparent 25%),linear-gradient(-45deg,#20242c 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#20242c 75%),linear-gradient(-45deg,transparent 75%,#20242c 75%); background-size:16px 16px; background-position:0 0,0 8px,8px -8px,-8px 0; }
    .stage { position:relative; width:100%; overflow:hidden; background:transparent; }
    .stage img { max-width:100%; display:block; }
    .stage .base { width:100%; height:100%; object-fit:contain; }
    .stage .slice { position:absolute; image-rendering:auto; }
    .gallery { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:12px; }
    .asset { margin:0; border:1px solid var(--border); border-radius:9px; background:var(--panel); overflow:hidden; }
    .asset__image { min-height:88px; display:flex; align-items:center; justify-content:center; padding:10px; background-image:linear-gradient(45deg,#20242c 25%,transparent 25%),linear-gradient(-45deg,#20242c 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#20242c 75%),linear-gradient(-45deg,transparent 75%,#20242c 75%); background-size:14px 14px; background-position:0 0,0 7px,7px -7px,-7px 0; }
    .asset__image img { max-width:100%; max-height:120px; }
    figcaption { display:flex; flex-direction:column; gap:2px; padding:8px 10px; font-size:11.5px; }
    .semantic { color:var(--accent); font-size:11px; }
    .meta { color:var(--muted); font-size:10.5px; }
    code { color:var(--muted); font-size:10.5px; overflow-wrap:anywhere; }
    .notes { border:1px solid var(--border); border-radius:9px; padding:12px 14px; background:var(--panel); }
    .notes ul { margin:0; padding-left:18px; color:var(--muted); }
    footer { padding:0 28px 28px; color:var(--muted); font-size:11px; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(projectName)}</h1>
    <p>${width}×${height} · ${assets.length} 个切图资产 · 引擎 ${escapeHtml(engine)}</p>
    <p>
      <span class="badge">未验证</span>
      <span class="badge">合成图裁切</span>
      <span class="badge">非 Photoshop 证据</span>
      <span class="badge">覆盖率 ${(comparison.coverageRatio * 100).toFixed(1)}%</span>
    </p>
  </header>
  <main>
    <section>
      <h2>页面对比</h2>
      <div class="compare">
        <div class="frame">
          <h3>原始 PSD 合成图</h3>
          <div class="stage-wrap"><div class="stage" style="aspect-ratio:${width}/${height}">
            <img class="base" src="preview/original-composite.png" alt="原始合成图" />
          </div></div>
        </div>
        <div class="frame">
          <h3>资产重建（按边界叠加切图）</h3>
          <div class="stage-wrap"><div class="stage" style="aspect-ratio:${width}/${height}">
            <img class="base" src="preview/page-reconstruction.png" alt="资产重建" />
      ${stageImages}
          </div></div>
        </div>
      </div>
    </section>
    <section>
      <h2>资产（${assets.length}）</h2>
      <div class="gallery">
      ${gallery}
      </div>
      ${oneX.length > MAX_GALLERY_ITEMS ? `<p>仅展示前 ${MAX_GALLERY_ITEMS} 个资产；完整列表见 manifest.json。</p>` : ""}
    </section>
    <section class="notes">
      <h2>使用说明</h2>
      <ul>
        <li>切图来自 PSD 的扁平合成图按图层边界裁切，保留合成效果，但不是逐图层隔离渲染。</li>
        <li>@2x 输出由合成图放大得到，不是原生 2x 重渲染。</li>
        <li>资产重建按边界叠加切图，重叠区域以较小切图为准；它用于快速预览与代码搭建，不是像素级保真证明。</li>
        <li>design-ir.json 提供机器可读的图层树、逻辑编组与布局提示，agent-context.md 提供面向 AI 编码工具的结构摘要。</li>
        <li>本资产包未经 Patchy 或 Photoshop 验证，不能作为兼容性证据。</li>
      </ul>
    </section>
  </main>
  <footer>Generated by LayerForgeAI · local composite pack · ${new Date().toISOString()}</footer>
</body>
</html>`;
}

function formatBounds(bounds: LayerBounds | undefined): string {
  if (!bounds) return "无边界";
  return `${bounds.width}×${bounds.height} @ ${bounds.x},${bounds.y}`;
}

function markdownCell(value: string, max = 160): string {
  const normalized = value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function siblingZIndex(path: string): number {
  const segment = path.slice(path.lastIndexOf("/") + 1);
  const value = Number.parseInt(segment, 10);
  return Number.isFinite(value) ? value : 0;
}

export function buildAgentContext(options: {
  project: ProjectRecord;
  snapshot: DocumentSnapshot;
  plan: PlanEntry[];
  engine: EngineMode;
  assets: AssetPackAsset[];
  mergedAssets: AssetPackMergedAsset[];
  comparison: AssetPackComparison;
  mergeCandidates: CleanupMergeCandidate[];
  groupSuggestions: CleanupGroupSuggestion[];
}): string {
  const {
    project,
    snapshot,
    plan,
    engine,
    assets,
    mergedAssets,
    comparison,
    mergeCandidates,
    groupSuggestions,
  } = options;
  const planByPath = new Map(plan.map((entry) => [entry.path, entry]));
  const mergedByPath = new Map(mergedAssets.map((asset) => [asset.sourcePath, asset]));
  const lines: string[] = [
    `# ${project.name} · AI 编码上下文`,
    "",
    "> 由 LayerForgeAI 从 PSD 本地解析生成。切图来自扁平合成图裁切；这不是 Patchy/Photoshop 验证结果。",
    "",
    "## 文件",
    "",
    "- `design-ir.json`：机器可读图层树、边界、语义名、文本内容/样式、命名计划、含布局提示的逻辑编组、切图节点 `assetId` 与全局绘制序 `paintOrder`。",
    "- `manifest.json`：资产、输出文件、哈希与对比统计。",
    "- `preview.html`：原始合成图与资产重建的并排预览。",
    "- `assets/`：PNG 切图（1x 与 @2x）。",
    "- `merged/`：合并候选区域的单张合成裁剪 PNG（1x 与 @2x），可直接作为前端素材，不代表 PSD 已合并。",
    "",
    "## 页面",
    "",
    `- 项目：${project.name}`,
    `- 源文件：${project.source.fileName}`,
    `- 画布：${project.source.width}×${project.source.height}`,
    `- 引擎：${engine}（本地资产包不代表引擎能力）`,
    `- 资产数量：${assets.length}`,
    `- 切图覆盖率：${(comparison.coverageRatio * 100).toFixed(1)}%（按面积）`,
    "",
    "## 图层结构",
    "",
    "列表按 PSD 堆叠顺序排列（自底向上，`z` 为同级序号，0 是最底层；数值越大越靠上）。",
    "",
  ];
  const logicalGroupByPath = new Map<string, string>();
  for (const group of groupSuggestions) {
    for (const path of group.memberPaths) {
      logicalGroupByPath.set(path, group.suggestedName);
    }
  }
  const walk = (nodes: LayerNode[], depth: number): void => {
    nodes.forEach((node, index) => {
      const entry = planByPath.get(node.path);
      const semantic = entry ? ` → \`${entry.newName}\`` : "";
      const blend = node.blendMode?.replace(/\s+/g, "").toLowerCase();
      const logicalGroup = logicalGroupByPath.get(node.path);
      const flags = [
        `z=${index}`,
        layerKindLabel(node.kind),
        formatBounds(node.bounds),
        node.visible ? "可见" : "隐藏",
        `${node.opacity}%`,
        ...(node.clipping ? ["剪贴"] : []),
        ...(node.meta?.hasMask ? ["蒙版"] : []),
        ...(node.meta?.hasEffects ? ["效果"] : []),
        ...(blend && blend !== "normal" && blend !== "passthrough"
          ? [`混合=${node.blendMode}`]
          : []),
        ...(logicalGroup ? [`逻辑组=${logicalGroup}`] : []),
      ].join(" · ");
      lines.push(
        `${"  ".repeat(depth)}- ${node.name}${semantic} (/${node.path}) — ${flags}`,
      );
      walk(node.children, depth + 1);
    });
  };
  walk(snapshot.layers, 0);

  lines.push("", "## 逻辑编组建议", "");
  if (groupSuggestions.length === 0) {
    lines.push("没有符合规则的逻辑编组建议。");
  } else {
    lines.push(
      "以下分组只存在于 Design IR（`logicalGroups` 与节点 `logicalGroupId`），用于划分前端组件；图层树成员行末带 `逻辑组=` 标记。应用内可通过桥接把建议写入当前文档内存，仍需另存并重开才持久化。`layout` 由成员边界推断（row/column/stack、间距与对齐），仅作为 CSS 布局提示。",
      "",
      "| ID | 建议名 | 父级 | 成员 | 边界 | 布局 | 说明 |",
      "|---|---|---|---|---|---|---|",
    );
    for (const group of groupSuggestions) {
      const parent = group.parentPath
        ? `${group.parentName ?? "组"} (/${group.parentPath})`
        : "根图层";
      lines.push(
        `| ${markdownCell(group.id, 80)} | ${markdownCell(group.suggestedName)} | ${markdownCell(parent, 80)} | ${markdownCell(group.memberNames.join("、"), 100)} | ${formatBounds(group.bounds)} | ${layoutSummary(group.layout)} | ${markdownCell(group.reason, 100)} |`,
      );
    }
  }

  const textLayers: LayerNode[] = [];
  const collectText = (nodes: LayerNode[]): void => {
    for (const node of nodes) {
      if (typeof node.meta?.text === "string" && node.meta.text.length > 0) {
        textLayers.push(node);
      }
      collectText(node.children);
    }
  };
  collectText(snapshot.layers);
  lines.push("", "## 文本层", "");
  if (textLayers.length === 0) {
    lines.push("没有可读取的文本内容。");
  } else {
    lines.push("| 图层 | 内容 | 字体 | 字号 | 颜色 | 对齐 | 粗体 | 边界 | Z |");
    lines.push("|---|---|---|---|---|---|---|---|---|");
    for (const node of textLayers) {
      const meta = node.meta ?? {};
      const font = typeof meta.fontFamily === "string" ? meta.fontFamily : "—";
      const size = typeof meta.fontSize === "number" ? `${meta.fontSize}px` : "—";
      const color = typeof meta.textColor === "string" ? meta.textColor : "—";
      const align = typeof meta.textAlign === "string" ? meta.textAlign : "—";
      const bold = meta.bold === true ? "是" : "—";
      lines.push(
        `| ${markdownCell(node.name)} | ${markdownCell(meta.text as string)} | ${markdownCell(font, 60)} | ${size} | ${color} | ${align} | ${bold} | ${formatBounds(node.bounds)} | ${siblingZIndex(node.path)} |`,
      );
    }
  }

  lines.push("", "## 资产", "");
  if (assets.length === 0) {
    lines.push("没有符合规则的切图候选。");
  } else {
    lines.push("| 名称 | 语义名 | 文件 | 路径 | 边界 | 类型 | Z |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const asset of assets) {
      const output = asset.outputs.find((item) => item.scale === 1);
      lines.push(
        `| ${asset.name} | ${asset.semanticName ?? "—"} | ${output?.fileName ?? "—"} | /${asset.sourcePath} | ${asset.bounds.width}×${asset.bounds.height} @ ${asset.bounds.x},${asset.bounds.y} | ${layerKindLabel(asset.kind)} | ${siblingZIndex(asset.sourcePath)} |`,
      );
    }
  }

  lines.push("", "## 合并候选", "");
  if (mergeCandidates.length === 0) {
    lines.push("没有符合规则的合并候选。");
  } else {
    lines.push(
      "以下组的结构角色为角标、按钮、输入框或图标按钮等组件，且边界紧凑，适合在 PSD 中合并为单层素材；`merged/` 提供对应区域的单张合成裁剪，尚未写入文档。",
      "",
      "| 组 | 建议名 | 类型 | 成员 | 边界 | 布局 | 占画布 | 文件 |",
      "|---|---|---|---|---|---|---|---|",
    );
    for (const merge of mergeCandidates) {
      const output = mergedByPath
        .get(merge.path)
        ?.outputs.find((item) => item.scale === 1);
      lines.push(
        `| ${markdownCell(merge.name)} | ${markdownCell(merge.suggestedName)} | ${
          merge.kind === "badge" ? "角标" : "组件"
        } | ${markdownCell(merge.memberNames.join("、"), 80)} | ${formatBounds(merge.bounds)} | ${layoutSummary(merge.layout)} | ${(merge.areaRatio * 100).toFixed(1)}% | ${output ? `merged/${output.fileName}` : "—"} |`,
      );
    }
  }

  lines.push(
    "",
    "## 使用建议",
    "",
    "1. 以 `design-ir.json` 的边界和层级搭建布局，以 `assets/` 的 PNG 作为图像资源；`paintOrder` 越大越靠上，可映射为 CSS z-index。",
    "2. 切图节点的 `assetId` 对应 `manifest.json` 的资产 id 与 `assets/` 文件，可据此把该节点渲染为 `<img>`，不必按名称猜测。",
    "3. `design-ir.json` 的 `logicalGroups` 与节点 `logicalGroupId` 是规则版逻辑分组；每组 `layout` 给出 row/column/stack、间距与对齐，可作为 flex 布局线索，但它是边界推断，不改变 PSD 层级。",
    "4. 文本层优先使用真实文本与上表的字体/字号/颜色/对齐，不要把文字烘焙进图片。",
    "5. 边界使用 PSD 像素坐标；网页实现时按设计宽度等比换算。",
    "6. 重叠切图在小尺寸资产中会覆盖大尺寸资产；页面重建预览已按此规则生成。",
    "7. 图层树中的剪贴/蒙版/效果/混合标记来自 PSD 元数据；切图是合成裁剪，效果已反映在像素中，但不等于隔离渲染。",
    "8. 合并候选用于指导 PSD 清理与前端组件拆分；`merged/` 是合成图裁切，可直接引用，但不代表 PSD 已合并；应用内可通过桥接执行合并，需另存并重开。",
    "9. 需要逐图层隔离图或原生 2x 时，必须接入 Patchy 逐图层渲染（协议 v2）。",
    "",
  );
  return lines.join("\n");
}

export function buildAssetPackManifest(options: {
  project: ProjectRecord;
  snapshot: DocumentSnapshot;
  engine: EngineMode;
  report: CleanupReport;
  assets: AssetPackAsset[];
  mergedAssets: AssetPackMergedAsset[];
  comparison: AssetPackComparison;
  limits: AssetPackLimits;
  files: string[];
  now?: Date;
}): AssetPackManifest {
  const { project, snapshot, engine, report, assets, mergedAssets, comparison, limits, files } =
    options;
  return {
    schema: "layerforge.asset-pack",
    schemaVersion: "0.3.0",
    generatedAt: (options.now ?? new Date()).toISOString(),
    status: {
      validated: false,
      pixels: "generated-local-composite-crops",
      note: "PNG assets were cropped from the PSD composite locally. Not a Patchy/Photoshop-verified release.",
    },
    project: { id: project.id, name: project.name },
    source: {
      fileName: project.source.fileName,
      sha256: project.source.sha256,
      width: project.source.width,
      height: project.source.height,
      depth: project.source.depth,
      colorMode: project.source.colorModeLabel,
    },
    document: {
      engine,
      documentId: snapshot.documentId,
      revision: snapshot.revision,
    },
    analysis: {
      nodes: report.summary.nodes,
      slices: report.summary.slices,
      groups: report.summary.groups,
      merges: report.summary.merges,
      mergedAssets: mergedAssets.length,
      renames: report.summary.renames,
    },
    logicalGroups: report.groups,
    mergeCandidates: report.mergeCandidates,
    assets,
    mergedAssets,
    comparison,
    limits,
    files,
    notes: [
      "切图来自 PSD 扁平合成图按边界裁切；重叠区域包含下方内容，不是逐图层隔离渲染。",
      "@2x 输出由合成图放大，不是原生 2x 渲染。",
      "logicalGroups 与 layout 只是 Design IR 中的规则建议/启发式提示；应用内可经桥接写入文档内存，未另存重开前不改变 PSD。",
      "mergeCandidates 只是可审核的规则建议；merged/ 中的图片是合成裁剪，不是 PSD 合并结果；应用内合并需另存重开。",
      "本资产包未经 Patchy 或 Photoshop 验证，不能作为兼容性证据。",
    ],
  };
}

function buildReadme(options: {
  manifest: AssetPackManifest;
  comparison: AssetPackComparison;
}): string {
  const { manifest, comparison } = options;
  return [
    `${manifest.project.name} · LayerForgeAI 资产包`,
    "",
    `生成时间：${manifest.generatedAt}`,
    `源文件：${manifest.source.fileName}`,
    `画布：${manifest.source.width}×${manifest.source.height}`,
    `资产：${manifest.assets.length} 个，输出 ${manifest.assets.reduce((sum, asset) => sum + asset.outputs.length, 0)} 个 PNG`,
    `逻辑编组建议：${manifest.logicalGroups.length} 组（仅 Design IR，不写回 PSD）`,
    `合并素材：${manifest.mergedAssets.length} 个，输出 ${manifest.mergedAssets.reduce((sum, asset) => sum + asset.outputs.length, 0)} 个 PNG`,
    `覆盖率：${(comparison.coverageRatio * 100).toFixed(1)}%`,
    `PNG 解码校验：切图 ${comparison.verifiedAssets} 个通过、${comparison.mismatchedAssets} 个不一致；合并素材 ${comparison.verifiedMergedAssets} 个通过、${comparison.mismatchedMergedAssets} 个不一致`,
    "",
    "目录：",
    "- manifest.json：资产清单与哈希",
    "- design-ir.json：Design IR 草稿",
    "- agent-context.md：面向 AI 编码工具的结构摘要",
    "- preview.html：原始合成图与资产重建并排预览",
    "- assets/：1x 与 @2x PNG",
    "- merged/：合并候选区域的单张合成裁剪 PNG（1x 与 @2x）",
    "- preview/：原始合成图与资产重建 PNG",
    "",
    "限制：",
    "- 切图为合成图裁切，不是逐图层隔离渲染。",
    "- @2x 由合成图放大，不是原生渲染。",
    "- merged/ 为合成图裁切，不是 PSD 合并，也未写回文档。",
    "- logicalGroups 与 layout 为 Design IR 中的规则建议/启发式提示，未写入 PSD。",
    "- 未写入编组、合并或命名；命名与逻辑编组计划见 design-ir.json。",
    "- 本资产包未经 Patchy 或 Photoshop 验证，不能作为兼容性证据。",
    "",
    manifest.limits.truncated
      ? `注意：受 ${manifest.limits.byteBudget} 字节预算限制，本次导出被截断，${manifest.limits.skippedAssets} 个资产与 ${manifest.limits.skippedMergedAssets} 个合并素材未包含。`
      : "",
    "",
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n");
}

export async function buildLocalAssetPack(
  options: AssetPackBuildOptions,
): Promise<AssetPackResult> {
  const { project, snapshot, plan, engine, report, file, onProgress } = options;
  const generatedAt = options.now ?? new Date();
  const total = report.slices.length + report.mergeCandidates.length;
  onProgress?.("读取 PSD 合成图", 0, total);
  const composite = await readPsdComposite(file);

  const compositeCanvas = createCanvas(composite.width, composite.height);
  context2d(compositeCanvas).putImageData(
    new ImageData(new Uint8ClampedArray(composite.data), composite.width, composite.height),
    0,
    0,
  );
  const originalPng = await canvasToPng(compositeCanvas);

  const reconstruction = createCanvas(composite.width, composite.height);
  const reconstructionContext = context2d(reconstruction);
  reconstructionContext.imageSmoothingEnabled = false;
  const covered = new Uint8Array(composite.width * composite.height);
  const planByPath = new Map(plan.map((entry) => [entry.path, entry]));

  const slices = [...report.slices].sort(
    (a, b) =>
      b.bounds.width * b.bounds.height - a.bounds.width * a.bounds.height ||
      a.path.localeCompare(b.path),
  );
  const assets: AssetPackAsset[] = [];
  const mergedAssets: AssetPackMergedAsset[] = [];
  const mergedSlugs = new Set<string>();
  const entries: Record<string, Uint8Array> = {};
  let bytesUsed = originalPng.byteLength;
  let truncated = false;
  let skippedAssets = 0;
  let skippedMergedAssets = 0;
  let skippedOutputs = 0;
  let oversizedOutputs = 0;
  let verifiedAssets = 0;
  let mismatchedAssets = 0;
  let verifiedMergedAssets = 0;
  let mismatchedMergedAssets = 0;
  let maxChannelDelta = 0;

  for (let index = 0; index < slices.length; index += 1) {
    const slice = slices[index];
    onProgress?.(
      `裁切资产 ${index + 1}/${slices.length}：${slice.name}`,
      index,
      slices.length,
    );
    const bounds = clampBounds(slice.bounds, composite.width, composite.height);
    if (!bounds) {
      skippedAssets += 1;
      continue;
    }
    if (bytesUsed > MAX_PACK_BYTES) {
      truncated = true;
      skippedAssets = slices.length - index;
      break;
    }

    const crop = createCanvas(bounds.width, bounds.height);
    const cropContext = context2d(crop);
    cropContext.imageSmoothingEnabled = false;
    cropContext.drawImage(
      compositeCanvas,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      0,
      bounds.width,
      bounds.height,
    );
    reconstructionContext.drawImage(crop, bounds.x, bounds.y);
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      covered.fill(1, y * composite.width + bounds.x, y * composite.width + bounds.x + bounds.width);
    }

    const oneX = await canvasToPng(crop);
    const expected = cropContext.getImageData(0, 0, bounds.width, bounds.height);
    const verification = await verifyPngAgainstPixels(oneX, expected);
    if (verification.checked) {
      verifiedAssets += 1;
      if (verification.mismatched) mismatchedAssets += 1;
    }
    if (verification.maxChannelDelta > maxChannelDelta) {
      maxChannelDelta = verification.maxChannelDelta;
    }

    const slug = slice.fileName.replace(/\.png$/i, "");
    const outputs: AssetPackOutput[] = [
      {
        fileName: `${slug}.png`,
        scale: 1,
        width: bounds.width,
        height: bounds.height,
        bytes: oneX.byteLength,
        sha256: await sha256Bytes(oneX),
        source: "composite-crop",
      },
    ];
    entries[`assets/${slug}.png`] = oneX;
    bytesUsed += oneX.byteLength;

    const doubledWidth = bounds.width * 2;
    const doubledHeight = bounds.height * 2;
    if (
      doubledWidth <= MAX_OUTPUT_DIMENSION &&
      doubledHeight <= MAX_OUTPUT_DIMENSION &&
      bytesUsed <= MAX_PACK_BYTES
    ) {
      const doubled = createCanvas(doubledWidth, doubledHeight);
      const doubledContext = context2d(doubled);
      doubledContext.imageSmoothingEnabled = false;
      doubledContext.drawImage(crop, 0, 0, doubledWidth, doubledHeight);
      const png = await canvasToPng(doubled);
      entries[`assets/${slug}@2x.png`] = png;
      bytesUsed += png.byteLength;
      outputs.push({
        fileName: `${slug}@2x.png`,
        scale: 2,
        width: doubledWidth,
        height: doubledHeight,
        bytes: png.byteLength,
        sha256: await sha256Bytes(png),
        source: "composite-upscale",
      });
    } else {
      oversizedOutputs += 1;
      skippedOutputs += 1;
    }

    assets.push({
      id: `asset:${slice.path}`,
      name: slice.name,
      semanticName: planByPath.get(slice.path)?.newName ?? null,
      sourcePath: slice.path,
      sourceLayerId: slice.layerId,
      kind: slice.kind,
      bounds,
      outputs,
      verification: {
        checked: verification.checked,
        mismatched: verification.mismatched,
      },
    });
  }

  const merges = report.mergeCandidates;
  for (let index = 0; index < merges.length; index += 1) {
    const merge = merges[index];
    onProgress?.(
      `裁切合并素材 ${index + 1}/${merges.length}：${merge.suggestedName}`,
      slices.length + index,
      total,
    );
    const bounds = clampBounds(merge.bounds, composite.width, composite.height);
    if (!bounds) {
      skippedMergedAssets += 1;
      continue;
    }
    if (bytesUsed > MAX_PACK_BYTES) {
      truncated = true;
      skippedMergedAssets += merges.length - index;
      break;
    }

    const crop = createCanvas(bounds.width, bounds.height);
    const cropContext = context2d(crop);
    cropContext.imageSmoothingEnabled = false;
    cropContext.drawImage(
      compositeCanvas,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      0,
      bounds.width,
      bounds.height,
    );

    const oneX = await canvasToPng(crop);
    const expected = cropContext.getImageData(0, 0, bounds.width, bounds.height);
    const verification = await verifyPngAgainstPixels(oneX, expected);
    if (verification.checked) {
      verifiedMergedAssets += 1;
      if (verification.mismatched) mismatchedMergedAssets += 1;
    }
    if (verification.maxChannelDelta > maxChannelDelta) {
      maxChannelDelta = verification.maxChannelDelta;
    }

    const baseSlug = sanitizeFileName(merge.suggestedName, "merged-component");
    let slug = baseSlug;
    let suffix = 2;
    while (mergedSlugs.has(slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    mergedSlugs.add(slug);

    const outputs: AssetPackOutput[] = [
      {
        fileName: `${slug}.png`,
        scale: 1,
        width: bounds.width,
        height: bounds.height,
        bytes: oneX.byteLength,
        sha256: await sha256Bytes(oneX),
        source: "composite-crop",
      },
    ];
    entries[`merged/${slug}.png`] = oneX;
    bytesUsed += oneX.byteLength;

    const doubledWidth = bounds.width * 2;
    const doubledHeight = bounds.height * 2;
    if (
      doubledWidth <= MAX_OUTPUT_DIMENSION &&
      doubledHeight <= MAX_OUTPUT_DIMENSION &&
      bytesUsed <= MAX_PACK_BYTES
    ) {
      const doubled = createCanvas(doubledWidth, doubledHeight);
      const doubledContext = context2d(doubled);
      doubledContext.imageSmoothingEnabled = false;
      doubledContext.drawImage(crop, 0, 0, doubledWidth, doubledHeight);
      const png = await canvasToPng(doubled);
      entries[`merged/${slug}@2x.png`] = png;
      bytesUsed += png.byteLength;
      outputs.push({
        fileName: `${slug}@2x.png`,
        scale: 2,
        width: doubledWidth,
        height: doubledHeight,
        bytes: png.byteLength,
        sha256: await sha256Bytes(png),
        source: "composite-upscale",
      });
    } else {
      oversizedOutputs += 1;
      skippedOutputs += 1;
    }

    mergedAssets.push({
      id: `merged:${merge.path}`,
      name: merge.name,
      suggestedName: merge.suggestedName,
      sourcePath: merge.path,
      kind: merge.kind,
      memberPaths: [...merge.memberPaths],
      bounds,
      areaRatio: merge.areaRatio,
      outputs,
      verification: {
        checked: verification.checked,
        mismatched: verification.mismatched,
      },
    });
  }

  onProgress?.("生成对比与预览", total, total);
  const reconstructionPng = await canvasToPng(reconstruction);
  const comparison: AssetPackComparison = {
    method: "composite-crops-and-decode-verification",
    width: composite.width,
    height: composite.height,
    totalPixels: composite.width * composite.height,
    coveredPixels: covered.reduce((sum, flag) => sum + flag, 0),
    coverageRatio: 0,
    verifiedAssets,
    mismatchedAssets,
    verifiedMergedAssets,
    mismatchedMergedAssets,
    maxChannelDelta,
    tolerance: VERIFY_TOLERANCE,
    notes: [
      "覆盖率按切图边界并集面积计算；它不是像素级保真证明。",
      "每个 1x PNG 都经过解码并与源合成图裁切区域逐像素比较；容差为 2。",
      "重叠切图在页面重建中按面积从大到小叠加。",
      "合并素材是候选区域的合成裁剪，不参与页面重建覆盖率，也不代表 PSD 已合并。",
      "编组/合并写入尚未执行；当前桥接协议没有这些操作。",
    ],
  };
  comparison.coverageRatio =
    comparison.totalPixels > 0 ? comparison.coveredPixels / comparison.totalPixels : 0;

  const limits: AssetPackLimits = {
    byteBudget: MAX_PACK_BYTES,
    bytesUsed,
    truncated,
    skippedAssets,
    skippedMergedAssets,
    skippedOutputs,
    oversizedOutputs,
  };
  const files = [
    "manifest.json",
    "design-ir.json",
    "agent-context.md",
    "preview.html",
    "comparison.json",
    "README.txt",
    "preview/original-composite.png",
    "preview/page-reconstruction.png",
    ...Object.keys(entries),
  ];
  const manifest = buildAssetPackManifest({
    project,
    snapshot,
    engine,
    report,
    assets,
    mergedAssets,
    comparison,
    limits,
    files,
    now: generatedAt,
  });
  const ir = buildDesignIr({
    project,
    snapshot,
    plan,
    engine,
    logicalGroups: report.groups,
    assets,
  });
  const previewHtml = buildAssetPackPreview({
    projectName: project.name,
    width: composite.width,
    height: composite.height,
    assets,
    comparison,
    engine,
  });
  const agentContext = buildAgentContext({
    project,
    snapshot,
    plan,
    engine,
    assets,
    mergedAssets,
    comparison,
    mergeCandidates: report.mergeCandidates,
    groupSuggestions: report.groups,
  });
  const readme = buildReadme({ manifest, comparison });
  const encoder = new TextEncoder();
  entries["manifest.json"] = encoder.encode(JSON.stringify(manifest, null, 2));
  entries["design-ir.json"] = encoder.encode(JSON.stringify(ir, null, 2));
  entries["agent-context.md"] = encoder.encode(agentContext);
  entries["preview.html"] = encoder.encode(previewHtml);
  entries["comparison.json"] = encoder.encode(JSON.stringify(comparison, null, 2));
  entries["README.txt"] = encoder.encode(readme);
  entries["preview/original-composite.png"] = originalPng;
  entries["preview/page-reconstruction.png"] = reconstructionPng;

  const fileName = `${sanitizeFileName(project.name)}-asset-pack.zip`;
  const bytes = zipSync(entries, { level: 0 });
  return { fileName, bytes, manifest, comparison, assets, mergedAssets, limits };
}

export function downloadAssetPack(result: AssetPackResult): void {
  downloadBlob(
    new Blob([result.bytes.slice().buffer], { type: "application/zip" }),
    result.fileName,
  );
}
