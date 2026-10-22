import { describe, expect, it } from "vitest";
import type { CleanupGroupSuggestion } from "./cleanup";
import type {
  DocumentSnapshot,
  LayerNode,
  PlanEntry,
  ProjectRecord,
} from "./domain";
import { buildDesignIr } from "./ir";
import { buildPageScaffold, type PageScaffoldAsset } from "./pageScaffold";

function node(partial: Partial<LayerNode> & Pick<LayerNode, "id" | "name" | "path">): LayerNode {
  return {
    kind: "pixel",
    visible: true,
    locked: false,
    opacity: 100,
    children: [],
    ...partial,
  };
}

const layers: LayerNode[] = [
  node({
    id: "root-bg",
    name: "背景",
    path: "0",
    bounds: { x: 0, y: 0, width: 100, height: 50 },
  }),
  node({
    id: "hero-group",
    name: "hero",
    path: "1",
    kind: "group",
    bounds: { x: 0, y: 0, width: 100, height: 50 },
    children: [
      node({
        id: "hero-title",
        name: "标题",
        path: "1/0",
        bounds: { x: 10, y: 10, width: 60, height: 20 },
        blendMode: "multiply",
      }),
      node({
        id: "hero-cta",
        name: "按钮",
        path: "1/1",
        bounds: { x: 60, y: 35, width: 30, height: 12 },
        opacity: 80,
      }),
      node({
        id: "hero-price",
        name: "价格",
        path: "1/2",
        kind: "text",
        bounds: { x: 10, y: 32, width: 40, height: 16 },
        meta: {
          hasText: true,
          text: "25,000 <IQD>",
          fontFamily: 'PingFang "SC"',
          fontSize: 30,
          textColor: "#ffffff",
          textAlign: "center",
          bold: true,
        },
      }),
    ],
  }),
  node({
    id: "badge",
    name: "Badge",
    path: "2",
    kind: "group",
    bounds: { x: 85, y: 5, width: 10, height: 7 },
    children: [
      node({
        id: "badge-bg",
        name: "badge bg",
        path: "2/0",
        bounds: { x: 85, y: 5, width: 10, height: 7 },
      }),
      node({
        id: "badge-text",
        name: "badge text",
        path: "2/1",
        kind: "text",
        bounds: { x: 86, y: 6, width: 8, height: 5 },
        meta: { hasText: true, text: "NEW" },
      }),
    ],
  }),
  node({
    id: "hidden",
    name: "隐藏层",
    path: "3",
    visible: false,
    bounds: { x: 0, y: 0, width: 10, height: 10 },
  }),
  node({
    id: "empty",
    name: "空边界",
    path: "4",
    bounds: { x: 0, y: 0, width: 0, height: 0 },
  }),
];

const snapshot: DocumentSnapshot = {
  documentId: "doc-1",
  revision: "3",
  fingerprint: "fp",
  width: 100,
  height: 50,
  layers,
  capturedAt: "2026-10-20T00:00:00.000Z",
};

const project: ProjectRecord = {
  id: "prj-1",
  name: "示例项目",
  createdAt: "2026-10-20T00:00:00.000Z",
  updatedAt: "2026-10-20T00:00:00.000Z",
  source: {
    version: 1,
    channels: 4,
    height: 50,
    width: 100,
    depth: 8,
    colorMode: 3,
    colorModeLabel: "RGB",
    fileSize: 1024,
    fileName: "sample.psd",
    sha256: "a".repeat(64),
    layerCount: 6,
  },
  localInspection: { layerCount: 6, parsedWith: "ag-psd" },
  plan: [],
  revisions: [],
};

const plan: PlanEntry[] = [
  {
    id: "plan-1",
    path: "1/1",
    layerId: "hero-cta",
    originalName: "按钮",
    newName: "hero-cta",
    status: "draft",
    updatedAt: "2026-10-20T00:00:00.000Z",
  },
];

const groupSuggestions: CleanupGroupSuggestion[] = [
  {
    id: "group:1:1/0+1/1",
    parentPath: "1",
    parentName: "hero",
    memberPaths: ["1/0", "1/1"],
    memberNames: ["标题", "按钮"],
    bounds: { x: 10, y: 10, width: 80, height: 37 },
    layout: { direction: "column", gap: 5, align: "mixed" },
    suggestedName: "hero-content",
    reason: "2 个同级图层边界相邻且未编组",
  },
];

function asset(
  path: string,
  overrides: Partial<PageScaffoldAsset> = {},
): PageScaffoldAsset {
  return {
    id: `asset:${path}`,
    name: `layer-${path}`,
    semanticName: null,
    sourcePath: path,
    kind: "pixel",
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    outputs: [
      { fileName: `layer-${path}.png`, scale: 1 },
      { fileName: `layer-${path}@2x.png`, scale: 2 },
    ],
    ...overrides,
  };
}

const assets: PageScaffoldAsset[] = [
  asset("0", { name: "背景", bounds: { x: 0, y: 0, width: 100, height: 50 } }),
  asset("1/0", {
    name: "标题",
    bounds: { x: 10, y: 10, width: 60, height: 20 },
  }),
  asset("1/1", {
    name: "按钮",
    semanticName: "hero-cta",
    bounds: { x: 60, y: 35, width: 30, height: 12 },
  }),
  asset("1/2", {
    name: "价格",
    kind: "text",
    bounds: { x: 10, y: 32, width: 40, height: 16 },
  }),
  asset("2", {
    name: "Badge",
    kind: "group",
    bounds: { x: 85, y: 5, width: 10, height: 7 },
  }),
  asset("2/0", { name: "badge bg", bounds: { x: 85, y: 5, width: 10, height: 7 } }),
  asset("2/1", { name: "badge text", bounds: { x: 86, y: 6, width: 8, height: 5 } }),
  asset("3", { name: "隐藏层", bounds: { x: 0, y: 0, width: 10, height: 10 } }),
  asset("4", { name: "空边界" }),
];

const ir = buildDesignIr({
  project,
  snapshot,
  plan,
  engine: "patchy",
  logicalGroups: groupSuggestions,
  assets: assets.map((item) => ({ id: item.id, sourcePath: item.sourcePath })),
});

function buildScaffold(): string {
  return buildPageScaffold({
    projectName: "示例 <项目>",
    engine: "patchy",
    width: 100,
    height: 50,
    ir,
    assets,
    coverageRatio: 0.312,
  });
}

function countSlices(html: string): number {
  return (html.match(/class="lf-slice"/g) ?? []).length;
}

describe("page scaffold", () => {
  it("按画布百分比定位可见切图并输出 z-index", () => {
    const html = buildScaffold();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("示例 &lt;项目&gt; · 页面骨架");
    expect(html).toContain('data-canvas-width="100"');
    expect(html).toContain('data-canvas-height="50"');
    expect(html).toContain('data-coverage-ratio="0.3120"');
    expect(html).toContain('data-slice-count="7"');
    expect(html).toContain("left:60.0000%");
    expect(html).toContain("top:70.0000%");
    expect(html).toContain("width:30.0000%");
    expect(html).toContain("height:24.0000%");
    expect(html).toContain('data-layer-path="/1/1"');
    expect(html).toContain("z-index:3");
    expect(html).toContain("opacity:0.800");
  });

  it("排除隐藏层与空边界层，并按 z-index 叠放组和子层", () => {
    const html = buildScaffold();
    expect(countSlices(html)).toBe(7);
    expect(html).not.toContain('data-layer-path="/3"');
    expect(html).not.toContain('data-layer-path="/4"');
    expect(html).toContain('data-layer-path="/2/0"');
    expect(html).toContain('data-layer-path="/2/1"');
    expect(html.indexOf('data-layer-path="/2"')).toBeLessThan(
      html.indexOf('data-layer-path="/2/0"'),
    );
  });

  it("逻辑编组输出 component 与布局提示", () => {
    const html = buildScaffold();
    expect(html).toContain('class="lf-component"');
    expect(html).toContain('data-component-id="group:1:1/0+1/1"');
    expect(html).toContain('data-component-name="hero-content"');
    expect(html).toContain('data-layout-direction="column"');
    expect(html).toContain('data-layout-gap="5"');
    expect(html).toContain('data-layout-align="mixed"');
    expect(html).toContain('style="display:contents"');
    expect(html.indexOf('data-component-name="hero-content"')).toBeLessThan(
      html.indexOf('data-layer-path="/1/0"'),
    );
    expect(html.indexOf('data-layer-path="/1/1"')).toBeLessThan(
      html.indexOf("</section>"),
    );
  });

  it("保留语义名、文本与样式 data 属性并转义", () => {
    const html = buildScaffold();
    expect(html).toContain('alt="hero-cta"');
    expect(html).toContain('data-text="25,000 &lt;IQD&gt;"');
    expect(html).toContain('data-font-family="PingFang &quot;SC&quot;"');
    expect(html).toContain('data-font-size="30"');
    expect(html).toContain('data-text-color="#ffffff"');
    expect(html).toContain('data-text-align="center"');
    expect(html).toContain('data-font-weight="bold"');
    expect(html).not.toContain("<IQD>");
  });

  it("为 1x 切图提供 2x srcset 并说明页面骨架限制", () => {
    const html = buildScaffold();
    expect(html).toContain(
      'srcset="assets/layer-2.png 1x, assets/layer-2@2x.png 2x"',
    );
    expect(html).toContain("display:contents");
    expect(html).toContain("不是 Photoshop 证据");
    expect(html).toContain("data-layout-direction/gap/align");
  });
});
