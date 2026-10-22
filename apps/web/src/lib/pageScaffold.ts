import type { DesignIr, IrLogicalGroup, IrNode } from "./ir";

export interface PageScaffoldAsset {
  id: string;
  name: string;
  semanticName: string | null;
  sourcePath: string;
  kind: string;
  bounds: { x: number; y: number; width: number; height: number };
  outputs: Array<{ fileName: string; scale: number }>;
}

export interface PageScaffoldOptions {
  projectName: string;
  engine: string;
  width: number;
  height: number;
  ir: DesignIr;
  assets: PageScaffoldAsset[];
  coverageRatio: number;
}

const CSS_BLEND_MODES = new Set([
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
]);

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

function formatBounds(bounds: PageScaffoldAsset["bounds"]): string {
  return `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`;
}

function metaText(node: IrNode, key: string): string | null {
  const value = node.meta?.[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean" && value) return "true";
  return null;
}

function flattenNodes(nodes: IrNode[], result: IrNode[] = []): IrNode[] {
  for (const node of nodes) {
    result.push(node);
    flattenNodes(node.children, result);
  }
  return result;
}

function renderSlice(
  node: IrNode,
  asset: PageScaffoldAsset,
  width: number,
  height: number,
): string {
  const output = asset.outputs.find((item) => item.scale === 1) ?? asset.outputs[0];
  if (!output || !node.bounds) return "";
  const retina = asset.outputs.find((item) => item.scale === 2);
  const bounds = node.bounds;
  const style = [
    `left:${percent(bounds.x, width)}`,
    `top:${percent(bounds.y, height)}`,
    `width:${percent(bounds.width, width)}`,
    `height:${percent(bounds.height, height)}`,
    `z-index:${node.paintOrder}`,
  ];
  if (node.opacity < 100) {
    style.push(`opacity:${(node.opacity / 100).toFixed(3)}`);
  }
  const blend = node.blendMode?.trim();
  const cssBlend = blend?.toLowerCase().replace(/\s+/g, "-");
  if (blend) {
    const safeBlend = cssBlend && CSS_BLEND_MODES.has(cssBlend) ? cssBlend : null;
    if (safeBlend) style.push(`mix-blend-mode:${safeBlend}`);
  }
  const attributes = [
    `class="lf-slice"`,
    `src="assets/${escapeHtml(output.fileName)}"`,
    retina
      ? `srcset="assets/${escapeHtml(output.fileName)} 1x, assets/${escapeHtml(retina.fileName)} 2x"`
      : null,
    `alt="${escapeHtml(node.semanticName ?? asset.semanticName ?? node.name)}"`,
    `data-layer-path="/${escapeHtml(node.sourcePath)}"`,
    `data-layer-name="${escapeHtml(node.name)}"`,
    node.semanticName
      ? `data-semantic-name="${escapeHtml(node.semanticName)}"`
      : null,
    `data-layer-kind="${escapeHtml(node.type)}"`,
    `data-paint-order="${node.paintOrder}"`,
    `data-bounds="${formatBounds(bounds)}"`,
    blend ? `data-blend-mode="${escapeHtml(blend)}"` : null,
  ].filter((item): item is string => item !== null);
  const text = metaText(node, "text");
  if (text) {
    attributes.push(`data-text="${escapeHtml(text.slice(0, 400))}"`);
    const fontFamily = metaText(node, "fontFamily");
    const fontSize = metaText(node, "fontSize");
    const textColor = metaText(node, "textColor");
    const textAlign = metaText(node, "textAlign");
    if (fontFamily) attributes.push(`data-font-family="${escapeHtml(fontFamily)}"`);
    if (fontSize) attributes.push(`data-font-size="${escapeHtml(fontSize)}"`);
    if (textColor) attributes.push(`data-text-color="${escapeHtml(textColor)}"`);
    if (textAlign) attributes.push(`data-text-align="${escapeHtml(textAlign)}"`);
    if (metaText(node, "bold")) attributes.push(`data-font-weight="bold"`);
  }
  return `      <img ${attributes.join(" ")} style="${style.join(";")}" />`;
}

function renderComponent(
  group: IrLogicalGroup,
  nodes: IrNode[],
  assetsById: Map<string, PageScaffoldAsset>,
  width: number,
  height: number,
): string {
  const attributes = [
    `class="lf-component"`,
    `data-component-id="${escapeHtml(group.id)}"`,
    `data-component-name="${escapeHtml(group.suggestedName)}"`,
    `data-layout-direction="${group.layout.direction}"`,
    group.layout.gap !== null ? `data-layout-gap="${group.layout.gap}"` : null,
    `data-layout-align="${group.layout.align}"`,
    `data-bounds="${formatBounds(group.bounds)}"`,
    `style="display:contents"`,
  ].filter((item): item is string => item !== null);
  const slices = nodes
    .map((node) => {
      const asset = node.assetId ? assetsById.get(node.assetId) : undefined;
      return asset ? renderSlice(node, asset, width, height) : "";
    })
    .filter(Boolean)
    .join("\n");
  return `    <section ${attributes.join(" ")}>\n${slices}\n    </section>`;
}

export function buildPageScaffold(options: PageScaffoldOptions): string {
  const { projectName, engine, width, height, ir, assets, coverageRatio } = options;
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const flat = flattenNodes(ir.nodes);
  const usedPaths = new Set<string>();
  const visibleNodes = flat
    .filter((node) => {
      if (!node.visible || node.opacity <= 0 || !node.assetId || !node.bounds) return false;
      if (node.bounds.width <= 0 || node.bounds.height <= 0) return false;
      if (!assetsById.has(node.assetId) || usedPaths.has(node.sourcePath)) return false;
      usedPaths.add(node.sourcePath);
      return true;
    })
    .sort((a, b) => a.paintOrder - b.paintOrder);
  const groupsById = new Map(ir.logicalGroups.map((group) => [group.id, group]));
  const groupedNodes = new Map<string, IrNode[]>();
  const standaloneNodes: IrNode[] = [];
  for (const node of visibleNodes) {
    if (node.logicalGroupId && groupsById.has(node.logicalGroupId)) {
      const list = groupedNodes.get(node.logicalGroupId) ?? [];
      list.push(node);
      groupedNodes.set(node.logicalGroupId, list);
    } else {
      standaloneNodes.push(node);
    }
  }
  const components = ir.logicalGroups
    .map((group) => {
      const nodes = groupedNodes.get(group.id);
      return nodes && nodes.length > 0
        ? renderComponent(group, nodes, assetsById, width, height)
        : "";
    })
    .filter(Boolean)
    .join("\n");
  const standalone = standaloneNodes
    .map((node) => {
      const asset = node.assetId ? assetsById.get(node.assetId) : undefined;
      return asset ? renderSlice(node, asset, width, height) : "";
    })
    .filter(Boolean)
    .join("\n");
  const coverage = (coverageRatio * 100).toFixed(1);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="generator" content="LayerForgeAI asset pack" />
  <title>${escapeHtml(projectName)} · 页面骨架</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #ffffff; }
    body { font-family: ui-sans-serif, system-ui, "Segoe UI", sans-serif; }
    .lf-page { position: relative; width: 100%; max-width: ${width}px; aspect-ratio: ${width} / ${height}; margin: 0 auto; overflow: hidden; background: transparent; }
    .lf-slice { position: absolute; display: block; max-width: none; }
    .lf-component { display: contents; }
  </style>
</head>
<body>
  <!--
    LayerForgeAI 页面骨架（引擎：${escapeHtml(engine)}）。
    切图覆盖画布 ${coverage}%，未覆盖区域在页面中为透明；所有位置按画布百分比定位，可等比缩放。
    z-index 来自 paintOrder，越大越靠上；data-* 属性保留语义名、图层路径、边界与文本样式。
    .lf-component 使用 display:contents 仅表达逻辑编组；data-layout-direction/gap/align 是布局提示，
    转成 flex/grid 时移除该 style 即可。文本层当前以 PNG 呈现，data-text 与字体属性供替换为真实文本。
    2x 通过 srcset 提供（由 1x 放大，不是原生 2x）。此文件由本地资产包生成，不是 Photoshop 证据。
  -->
  <main class="lf-page" data-canvas-width="${width}" data-canvas-height="${height}" data-coverage-ratio="${coverageRatio.toFixed(4)}" data-slice-count="${visibleNodes.length}" data-engine="${escapeHtml(engine)}">
${components}
${standalone}
  </main>
</body>
</html>`;
}
