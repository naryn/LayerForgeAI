import { describe, expect, it } from "vitest";
import type {
  DocumentSnapshot,
  LayerNode,
  PlanEntry,
  ProjectRecord,
} from "./domain";
import { analyzeLayers, type CleanupGroupSuggestion } from "./cleanup";
import {
  buildAgentContext,
  buildAssetPackManifest,
  buildAssetPackPreview,
  type AssetPackAsset,
  type AssetPackComparison,
  type AssetPackLimits,
  type AssetPackMergedAsset,
} from "./assetPack";

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
    id: "local-1",
    name: "背景 / 底图",
    path: "0",
    bounds: { x: 0, y: 0, width: 100, height: 50 },
  }),
  node({
    id: "local-2",
    name: "hero",
    path: "1",
    kind: "group",
    bounds: { x: 0, y: 0, width: 100, height: 50 },
    children: [
      node({
        id: "local-3",
        name: "hero / 标题",
        path: "1/0",
        bounds: { x: 10, y: 10, width: 60, height: 20 },
        blendMode: "multiply",
        meta: { hasMask: true, hasEffects: true },
      }),
      node({
        id: "local-4",
        name: "hero / 按钮",
        path: "1/1",
        bounds: { x: 60, y: 35, width: 30, height: 12 },
      }),
      node({
        id: "local-5",
        name: "hero / 价格",
        path: "1/2",
        kind: "text",
        bounds: { x: 10, y: 32, width: 40, height: 16 },
        meta: {
          hasText: true,
          text: "25,000 IQD",
          fontFamily: "PingFangSC-Semibold",
          fontSize: 30,
          textColor: "#ffffff",
          textAlign: "center",
          bold: true,
        },
      }),
    ],
  }),
  node({
    id: "local-6",
    name: "Badge",
    path: "2",
    kind: "group",
    bounds: { x: 85, y: 5, width: 10, height: 7 },
    children: [
      node({
        id: "local-7",
        name: "badge bg",
        path: "2/0",
        bounds: { x: 85, y: 5, width: 10, height: 7 },
      }),
      node({
        id: "local-8",
        name: "badge text",
        path: "2/1",
        kind: "text",
        bounds: { x: 86, y: 6, width: 8, height: 5 },
        meta: { hasText: true, text: "NEW" },
      }),
    ],
  }),
];

const report = analyzeLayers({ layers, width: 100, height: 50 });
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
    layerCount: 4,
  },
  localInspection: { layerCount: 4, parsedWith: "ag-psd" },
  plan: [],
  revisions: [],
};

const plan: PlanEntry[] = [
  {
    id: "plan-1",
    path: "1/1",
    layerId: "local-4",
    originalName: "hero / 按钮",
    newName: "hero-cta",
    status: "draft",
    updatedAt: "2026-10-20T00:00:00.000Z",
  },
];

const assets: AssetPackAsset[] = [
  {
    id: "asset:1/0",
    name: "hero / 标题",
    semanticName: null,
    sourcePath: "1/0",
    sourceLayerId: "local-3",
    kind: "pixel",
    bounds: { x: 10, y: 10, width: 60, height: 20 },
    outputs: [
      {
        fileName: "hero-标题.png",
        scale: 1,
        width: 60,
        height: 20,
        bytes: 100,
        sha256: "b".repeat(64),
        source: "composite-crop",
      },
      {
        fileName: "hero-标题@2x.png",
        scale: 2,
        width: 120,
        height: 40,
        bytes: 200,
        sha256: "c".repeat(64),
        source: "composite-upscale",
      },
    ],
    verification: { checked: true, mismatched: false },
  },
  {
    id: "asset:1/1",
    name: "hero / 按钮",
    semanticName: "hero-cta",
    sourcePath: "1/1",
    sourceLayerId: "local-4",
    kind: "pixel",
    bounds: { x: 60, y: 35, width: 30, height: 12 },
    outputs: [
      {
        fileName: "hero-按钮.png",
        scale: 1,
        width: 30,
        height: 12,
        bytes: 80,
        sha256: "d".repeat(64),
        source: "composite-crop",
      },
    ],
    verification: { checked: true, mismatched: false },
  },
];

const mergedAssets: AssetPackMergedAsset[] = [
  {
    id: "merged:2",
    name: "Badge",
    suggestedName: "component-merged",
    sourcePath: "2",
    kind: "component",
    memberPaths: ["2/0", "2/1"],
    bounds: { x: 85, y: 5, width: 10, height: 7 },
    areaRatio: 0.014,
    outputs: [
      {
        fileName: "component-merged.png",
        scale: 1,
        width: 10,
        height: 7,
        bytes: 60,
        sha256: "e".repeat(64),
        source: "composite-crop",
      },
      {
        fileName: "component-merged@2x.png",
        scale: 2,
        width: 20,
        height: 14,
        bytes: 90,
        sha256: "f".repeat(64),
        source: "composite-upscale",
      },
    ],
    verification: { checked: true, mismatched: false },
  },
];

const groupSuggestions: CleanupGroupSuggestion[] = [
  {
    id: "group:1:1/0+1/1",
    parentPath: "1",
    parentName: "hero",
    memberPaths: ["1/0", "1/1"],
    memberNames: ["hero / 标题", "hero / 按钮"],
    bounds: { x: 10, y: 10, width: 80, height: 37 },
    layout: { direction: "column", gap: 5, align: "mixed" },
    suggestedName: "hero-group",
    reason: "2 个同级图层边界相邻且未编组",
  },
];

const comparison: AssetPackComparison = {
  method: "composite-crops-and-decode-verification",
  width: 100,
  height: 50,
  totalPixels: 5000,
  coveredPixels: 1560,
  coverageRatio: 0.312,
  verifiedAssets: 2,
  mismatchedAssets: 0,
  verifiedMergedAssets: 1,
  mismatchedMergedAssets: 0,
  maxChannelDelta: 0,
  tolerance: 2,
  notes: ["覆盖率按切图边界并集面积计算；它不是像素级保真证明。"],
};

const limits: AssetPackLimits = {
  byteBudget: 1024,
  bytesUsed: 512,
  truncated: false,
  skippedAssets: 0,
  skippedMergedAssets: 0,
  skippedOutputs: 0,
  oversizedOutputs: 0,
};

describe("asset pack manifest", () => {
  it("声明本地合成图切图并保留来源与统计", () => {
    const manifest = buildAssetPackManifest({
      project,
      snapshot,
      engine: "inspect",
      report,
      assets,
      mergedAssets,
      comparison,
      limits,
      files: ["manifest.json", "assets/hero-标题.png", "merged/component-merged.png"],
      now: new Date("2026-10-20T12:00:00.000Z"),
    });
    expect(manifest.schema).toBe("layerforge.asset-pack");
    expect(manifest.schemaVersion).toBe("0.3.0");
    expect(manifest.logicalGroups).toEqual([]);
    expect(manifest.generatedAt).toBe("2026-10-20T12:00:00.000Z");
    expect(manifest.status.validated).toBe(false);
    expect(manifest.status.pixels).toBe("generated-local-composite-crops");
    expect(manifest.document).toMatchObject({ engine: "inspect", revision: "3" });
    expect(manifest.analysis.slices).toBe(report.summary.slices);
    expect(manifest.analysis.merges).toBe(1);
    expect(manifest.analysis.mergedAssets).toBe(1);
    expect(manifest.mergeCandidates[0]).toMatchObject({
      path: "2",
      suggestedName: "component-merged",
      kind: "component",
    });
    expect(manifest.mergedAssets[0]).toMatchObject({
      sourcePath: "2",
      suggestedName: "component-merged",
      memberPaths: ["2/0", "2/1"],
      verification: { checked: true, mismatched: false },
    });
    expect(manifest.mergedAssets[0].outputs.map((output) => output.fileName)).toEqual([
      "component-merged.png",
      "component-merged@2x.png",
    ]);
    expect(manifest.assets[1].semanticName).toBe("hero-cta");
    expect(manifest.comparison.coverageRatio).toBeCloseTo(0.312);
    expect(manifest.notes.join(" ")).toContain("不是逐图层隔离渲染");
    expect(manifest.notes.join(" ")).toContain("不能作为兼容性证据");
    expect(manifest.notes.join(" ")).toContain("mergeCandidates");
    expect(manifest.notes.join(" ")).toContain("merged/");
    expect(manifest.notes.join(" ")).toContain("logicalGroups");
    expect(manifest.notes.join(" ")).toContain("layout");
  });

  it("清单携带逻辑编组建议并声明未写入 PSD", () => {
    const groupedReport = {
      ...report,
      summary: { ...report.summary, groups: groupSuggestions.length },
      groups: groupSuggestions,
    };
    const manifest = buildAssetPackManifest({
      project,
      snapshot,
      engine: "inspect",
      report: groupedReport,
      assets,
      mergedAssets,
      comparison,
      limits,
      files: ["manifest.json"],
    });
    expect(manifest.logicalGroups).toEqual(groupSuggestions);
    expect(manifest.logicalGroups[0].layout).toEqual({
      direction: "column",
      gap: 5,
      align: "mixed",
    });
    expect(manifest.analysis.groups).toBe(1);
    expect(manifest.notes.join(" ")).toContain(
      "应用内可经桥接写入文档内存，未另存重开前不改变 PSD",
    );
  });

  it("预览用百分比定位资产并转义名称", () => {
    const unsafe: AssetPackAsset = {
      ...assets[0],
      name: `标题 <script>alert("x")</script>`,
    };
    const html = buildAssetPackPreview({
      projectName: "项目 <b>",
      width: 100,
      height: 50,
      assets: [unsafe],
      comparison,
      engine: "inspect",
    });
    expect(html).toContain("项目 &lt;b&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("left:10.0000%");
    expect(html).toContain("top:20.0000%");
    expect(html).toContain("width:60.0000%");
    expect(html).toContain("assets/hero-标题.png");
    expect(html).toContain("资产重建");
    expect(html).toContain("非 Photoshop 证据");
  });

  it("AI 编码上下文包含语义名、资产表和限制说明", () => {
    const context = buildAgentContext({
      project,
      snapshot,
      plan,
      engine: "inspect",
      assets,
      mergedAssets,
      comparison,
      mergeCandidates: report.mergeCandidates,
      groupSuggestions,
    });
    expect(context).toContain("# 示例项目 · AI 编码上下文");
    expect(context).toContain("hero / 按钮 → `hero-cta`");
    expect(context).toContain("| hero / 按钮 | hero-cta | hero-按钮.png |");
    expect(context).toContain("切图来自扁平合成图裁切");
    expect(context).toContain("协议 v2");
    expect(context).toContain("## 文本层");
    expect(context).toContain(
      "| hero / 价格 | 25,000 IQD | PingFangSC-Semibold | 30px | #ffffff | center | 是 | 40×16 @ 10,32 | 2 |",
    );
    expect(context).toContain("hero (/1) — z=1 · 组");
    expect(context).toContain(
      "hero / 标题 (/1/0) — z=0 · 像素 · 60×20 @ 10,10 · 可见 · 100% · 蒙版 · 效果 · 混合=multiply",
    );
    expect(context).toContain("逻辑组=hero-group");
    expect(context).toContain("自底向上");
    expect(context).toContain(
      "| hero / 按钮 | hero-cta | hero-按钮.png | /1/1 | 30×12 @ 60,35 | 像素 | 1 |",
    );
    expect(context).toContain("切图节点的 `assetId`");
    expect(context).toContain("## 逻辑编组建议");
    expect(context).toContain(
      "应用内可通过桥接把建议写入当前文档内存，仍需另存并重开才持久化",
    );
    expect(context).toContain(
      "| group:1:1/0+1/1 | hero-group | hero (/1) | hero / 标题、hero / 按钮 | 80×37 @ 10,10 | 纵向 · 间距 5px · 混合 | 2 个同级图层边界相邻且未编组 |",
    );
    expect(context).toContain("用于划分前端组件");
    expect(context).toContain("## 合并候选");
    expect(context).toContain(
      "| Badge | component-merged | 组件 | badge bg、badge text | 10×7 @ 85,5 | 叠加 · 无间距 · 居中 | 1.4% | merged/component-merged.png |",
    );
    expect(context).toContain("尚未写入文档");
    expect(context).toContain("不要把文字烘焙进图片");
    expect(context).toContain("可映射为 CSS z-index");
  });
});
