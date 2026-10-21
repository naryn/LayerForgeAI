import { describe, expect, it } from "vitest";
import type { DocumentSnapshot, ProjectRecord } from "./domain";
import {
  analyzeLayers,
  assetManifestFileName,
  buildAssetManifest,
  isGenericLayerName,
  normalizeLayerName,
  type CleanupReport,
} from "./cleanup";
import { normalizeLocalLayers, normalizePatchyLayers } from "./layers";

const DOC = { width: 1440, height: 900 };
const NOW = new Date("2026-10-20T12:00:00.000Z");

describe("normalizeLayerName", () => {
  it("统一空格、下划线、斜杠与大小写", () => {
    expect(normalizeLayerName("  Hero   Banner  ")).toBe("hero-banner");
    expect(normalizeLayerName("hero_banner")).toBe("hero-banner");
    expect(normalizeLayerName("Hero / Banner")).toBe("hero-banner");
    expect(normalizeLayerName("Main　Visual")).toBe("main-visual");
  });

  it("移除副本与拷贝标记", () => {
    expect(normalizeLayerName("按钮（副本）")).toBe("按钮");
    expect(normalizeLayerName("按钮 Copy 2")).toBe("按钮");
    expect(normalizeLayerName("Card 拷贝")).toBe("card");
  });

  it("保留中文并生成可读名称", () => {
    expect(normalizeLayerName("背景 / 底图")).toBe("背景-底图");
    expect(normalizeLayerName("图层 1")).toBe("图层-1");
  });

  it("清洗后为空时回退原名", () => {
    expect(normalizeLayerName("Copy")).toBe("Copy");
    expect(normalizeLayerName("  ")).toBe("");
  });
});

describe("isGenericLayerName", () => {
  it("识别常见通用名", () => {
    expect(isGenericLayerName("图层 3")).toBe(true);
    expect(isGenericLayerName("组 2")).toBe(true);
    expect(isGenericLayerName("Layer 12")).toBe(true);
    expect(isGenericLayerName("Rectangle")).toBe(true);
  });

  it("不把语义名称当作通用名", () => {
    expect(isGenericLayerName("Hero Banner")).toBe(false);
    expect(isGenericLayerName("登录按钮")).toBe(false);
  });
});

function applyRenames(
  layers: ReturnType<typeof normalizeLocalLayers>,
  renames: CleanupReport["renames"],
): ReturnType<typeof normalizeLocalLayers> {
  const byPath = new Map(renames.map((rename) => [rename.path, rename.newName]));
  const walk = (
    nodes: ReturnType<typeof normalizeLocalLayers>,
  ): ReturnType<typeof normalizeLocalLayers> =>
    nodes.map((node) => ({
      ...node,
      name: byPath.get(node.path) ?? node.name,
      children: walk(node.children),
    }));
  return walk(layers);
}

const ROLE_LAYERS = normalizeLocalLayers([
  { name: "背景 / 底图", id: 1, left: 0, top: 0, right: 1440, bottom: 900 },
  {
    name: "Pay Now 2",
    id: 2,
    children: [
      { name: "Rectangle 1", id: 3, left: 100, top: 600, right: 340, bottom: 656 },
      { name: "Layer 2", id: 4, text: { text: "Buy Now" }, left: 180, top: 620, right: 260, bottom: 636 },
    ],
  },
  {
    name: "Pay Now 3",
    id: 5,
    children: [
      { name: "Rectangle 2", id: 6, left: 100, top: 680, right: 340, bottom: 736 },
      { name: "Layer 3", id: 7, text: { text: "Pay Now" }, left: 180, top: 700, right: 260, bottom: 716 },
    ],
  },
  {
    name: "agree 2",
    id: 8,
    children: [
      { name: "Rectangle 3", id: 9, left: 100, top: 760, right: 400, bottom: 792 },
      { name: "Rectangle 4", id: 10, left: 104, top: 767, right: 122, bottom: 785 },
      { name: "Layer 4", id: 11, text: { text: "I agree" }, left: 130, top: 768, right: 250, bottom: 784 },
    ],
  },
  {
    name: "Selected 3",
    id: 12,
    children: [
      { name: "Rectangle 5", id: 13, left: 600, top: 760, right: 672, bottom: 788 },
      { name: "Layer 5", id: 14, text: { text: "Selected" }, left: 618, top: 767, right: 654, bottom: 781 },
    ],
  },
  { name: "Layer 12", id: 15, text: { text: "Pay Now" }, left: 100, top: 100, right: 180, bottom: 120 },
]);
const ROLE_REPORT = analyzeLayers({ layers: ROLE_LAYERS, ...DOC, now: NOW });

describe("analyzeLayers · 结构角色命名", () => {
  it("按组件结构生成名称，而不是改写图层原名", () => {
    const byPath = new Map(ROLE_REPORT.renames.map((rename) => [rename.path, rename]));
    expect(byPath.get("0")).toMatchObject({ newName: "background", role: "background" });
    expect(byPath.get("1")).toMatchObject({ newName: "button", role: "button" });
    expect(byPath.get("2")).toMatchObject({ newName: "button-2", role: "button" });
    expect(byPath.get("3")).toMatchObject({ newName: "checkbox-row", role: "checkbox-row" });
    expect(byPath.get("4")).toMatchObject({ newName: "badge", role: "badge" });
  });

  it("命名理由只描述结构，不包含图层名或 T 文案", () => {
    const byPath = new Map(ROLE_REPORT.renames.map((rename) => [rename.path, rename]));
    for (const path of ["0", "1", "2", "3", "4"]) {
      const rename = byPath.get(path);
      expect(rename?.reason).toContain("结构角色：");
      expect(rename?.reason).not.toContain("Pay Now");
      expect(rename?.reason).not.toContain("Buy Now");
      expect(rename?.reason).not.toContain("Selected");
    }
  });

  it("组件内部图层按父级角色命名背景与图标", () => {
    const byPath = new Map(ROLE_REPORT.renames.map((rename) => [rename.path, rename]));
    expect(byPath.get("1/0")?.newName).toBe("button-background");
    expect(byPath.get("3/0")?.newName).toBe("checkbox-row-background");
    expect(byPath.get("3/1")?.newName).toBe("checkbox-row-icon");
    expect(byPath.get("4/0")?.newName).toBe("badge-background");
  });

  it("文本层保持原名，只进入待复核", () => {
    const byPath = new Map(ROLE_REPORT.renames.map((rename) => [rename.path, rename]));
    expect(byPath.has("5")).toBe(false);
    expect(ROLE_REPORT.summary.genericNames).toBe(1);
    expect(ROLE_REPORT.findings.map((finding) => finding.rule)).toEqual(["generic-name"]);
  });

  it("应用命名建议后再次分析不再产生新建议", () => {
    const renamed = applyRenames(ROLE_LAYERS, ROLE_REPORT.renames);
    const again = analyzeLayers({ layers: renamed, ...DOC, now: NOW });
    expect(again.renames).toEqual([]);
  });
});

describe("analyzeLayers · 不使用 T 文案", () => {
  it("含唯一文案的通用组仍按结构命名", () => {
    const layers = normalizeLocalLayers([
      {
        name: "组 3",
        id: 1,
        children: [
          { name: "Rectangle 9", id: 2, left: 100, top: 100, right: 340, bottom: 156 },
          { name: "Layer 13", id: 3, text: { text: "Continue" }, left: 180, top: 120, right: 260, bottom: 136 },
        ],
      },
    ]);
    const report = analyzeLayers({ layers, ...DOC, now: NOW });
    const byPath = new Map(report.renames.map((rename) => [rename.path, rename]));
    expect(byPath.get("0")?.newName).toBe("button");
    expect(byPath.get("0")?.reason).not.toContain("continue");
    expect(byPath.get("0/0")?.newName).toBe("button-background");
    expect(byPath.has("0/1")).toBe(false);
  });

  it("纯文本组不会被编造成语义名", () => {
    const layers = normalizeLocalLayers([
      {
        name: "Two texts",
        id: 1,
        children: [
          { name: "Layer 14", id: 2, text: { text: "One" }, left: 100, top: 200, right: 200, bottom: 240 },
          { name: "Layer 15", id: 3, text: { text: "Two" }, left: 210, top: 200, right: 310, bottom: 240 },
        ],
      },
    ]);
    const report = analyzeLayers({ layers, width: 500, height: 400, now: NOW });
    expect(report.renames).toEqual([]);
    expect(report.summary.genericNames).toBe(2);
  });

  it("文本与小图标并存的紧凑组识别为角标而不是勾选行", () => {
    const layers = normalizeLocalLayers([
      {
        name: "badge 9",
        id: 1,
        children: [
          { name: "bg", id: 2, left: 1400, top: 10, right: 1440, bottom: 34 },
          { name: "icon", id: 3, left: 1404, top: 14, right: 1418, bottom: 28 },
          { name: "txt", id: 4, text: { text: "NEW" }, left: 1420, top: 16, right: 1436, bottom: 26 },
        ],
      },
    ]);
    const report = analyzeLayers({ layers, ...DOC, now: NOW });
    expect(report.renames.find((rename) => rename.path === "0")).toMatchObject({
      newName: "badge",
      role: "badge",
    });
    expect(report.mergeCandidates[0]).toMatchObject({
      suggestedName: "badge-merged",
      kind: "badge",
    });
  });
});

describe("analyzeLayers · 结构问题", () => {
  const layers = normalizeLocalLayers([
    { name: "空组", id: 1, sectionDivider: { type: 1 } },
    {
      name: "单子组",
      id: 2,
      children: [{ name: "only", id: 3, left: 10, top: 10, right: 50, bottom: 50 }],
    },
  ]);
  const report = analyzeLayers({ layers, width: 200, height: 120, now: NOW });

  it("检测空组与单子组", () => {
    expect(report.summary.emptyGroups).toBe(1);
    expect(report.summary.singleChildGroups).toBe(1);
    expect(report.findings.map((finding) => finding.rule)).toEqual([
      "empty-group",
      "single-child-group",
    ]);
  });
});

describe("analyzeLayers · 编组建议", () => {
  const layers = normalizeLocalLayers([
    { name: "title text", id: 1, text: { text: "Hello" }, left: 100, top: 100, right: 300, bottom: 140 },
    { name: "cta shape", id: 2, left: 310, top: 100, right: 430, bottom: 140 },
    { name: "card", id: 3, left: 100, top: 200, right: 430, bottom: 360 },
    { name: "background", id: 4, left: 0, top: 0, right: 500, bottom: 400 },
  ]);
  const report = analyzeLayers({ layers, width: 500, height: 400, now: NOW });

  it("把相邻且未编组的同级图层归为一组", () => {
    expect(report.summary.groups).toBe(1);
    expect(report.groups[0]).toMatchObject({
      parentPath: null,
      memberPaths: ["0", "1"],
      memberNames: ["title text", "cta shape"],
      suggestedName: "row-cluster",
      bounds: { x: 100, y: 100, width: 330, height: 40 },
      layout: { direction: "row", gap: 10, align: "start" },
    });
    expect(report.groups[0].reason).not.toContain("title");
    expect(report.groups[0].reason).not.toContain("cta");
  });

  it("簇本身是组件时按结构角色命名", () => {
    const cluster = normalizeLocalLayers([
      { name: "hero-shape", id: 1, left: 100, top: 100, right: 300, bottom: 148 },
      { name: "hero-text", id: 2, text: { text: "Go" }, left: 180, top: 114, right: 260, bottom: 134 },
      { name: "spark", id: 3, left: 10, top: 380, right: 30, bottom: 400 },
      { name: "dot", id: 4, left: 480, top: 20, right: 500, bottom: 40 },
    ]);
    const result = analyzeLayers({ layers: cluster, width: 500, height: 400, now: NOW });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({
      memberPaths: ["0", "1"],
      suggestedName: "button",
    });
    expect(result.groups[0].reason).toContain("结构角色：按钮");
  });

  it("排除满版背景与距离较远的图层", () => {
    const members = report.groups.flatMap((group) => group.memberPaths);
    expect(members).not.toContain("2");
    expect(members).not.toContain("3");
  });

  it("同级图层过少时不建议编组", () => {
    const few = normalizeLocalLayers([
      { name: "a", id: 1, left: 0, top: 0, right: 40, bottom: 40 },
      { name: "b", id: 2, left: 20, top: 20, right: 60, bottom: 60 },
    ]);
    const result = analyzeLayers({ layers: few, width: 100, height: 100, now: NOW });
    expect(result.groups).toEqual([]);
  });
});

describe("analyzeLayers · 合并候选", () => {
  it("把含文本的紧凑角标组标记为 badge 合并候选", () => {
    const layers = normalizeLocalLayers([
      {
        name: "Badge",
        id: 1,
        children: [
          { name: "bg", id: 2, left: 700, top: 20, right: 780, bottom: 60 },
          { name: "Label 1", id: 3, text: { text: "New" }, left: 710, top: 26, right: 770, bottom: 54 },
        ],
      },
    ]);
    const report = analyzeLayers({ layers, ...DOC, now: NOW });
    expect(report.summary.merges).toBe(1);
    expect(report.mergeCandidates[0]).toMatchObject({
      path: "0",
      parentPath: null,
      suggestedName: "badge-merged",
      kind: "badge",
      memberNames: ["bg", "Label 1"],
      bounds: { x: 700, y: 20, width: 80, height: 40 },
      layout: { direction: "stack", gap: null, align: "center" },
    });
    expect(report.mergeCandidates[0].reason).toContain("结构角色：角标");
    expect(report.mergeCandidates[0].reason).not.toContain("New");
    expect(report.mergeCandidates[0].areaRatio).toBeLessThan(0.01);
  });

  it("通用组按结构角色命名，并跳过嵌套重复", () => {
    const layers = normalizeLocalLayers([
      {
        name: "组 5",
        id: 1,
        children: [
          { name: "Rectangle 1", id: 2, left: 100, top: 100, right: 220, bottom: 140 },
          { name: "Layer 2", id: 3, text: { text: "Continue" }, left: 110, top: 105, right: 200, bottom: 135 },
          {
            name: "Icon",
            id: 4,
            children: [
              { name: "icon bg", id: 5, left: 120, top: 110, right: 160, bottom: 130 },
              { name: "icon text", id: 6, text: { text: "Continue" }, left: 122, top: 112, right: 158, bottom: 128 },
            ],
          },
        ],
      },
    ]);
    const report = analyzeLayers({ layers, ...DOC, now: NOW });
    expect(report.summary.merges).toBe(1);
    expect(report.mergeCandidates[0]).toMatchObject({
      path: "0",
      suggestedName: "badge-merged",
      kind: "badge",
    });
    expect(report.mergeCandidates[0].reason).not.toContain("Continue");
    expect(report.mergeCandidates.some((merge) => merge.path === "0/2")).toBe(false);
  });

  it("纯数字组名仍按结构命名合并候选", () => {
    const layers = normalizeLocalLayers([
      {
        name: "12",
        id: 1,
        children: [
          { name: "shape", id: 2, left: 100, top: 300, right: 220, bottom: 340 },
          { name: "text", id: 3, text: { text: "Buy Now" }, left: 110, top: 305, right: 200, bottom: 335 },
        ],
      },
    ]);
    const report = analyzeLayers({ layers, ...DOC, now: NOW });
    expect(report.mergeCandidates[0]).toMatchObject({
      suggestedName: "badge-merged",
      kind: "badge",
    });
    expect(report.mergeCandidates[0].reason).not.toContain("Buy Now");
  });

  it("同级多个组件按序编号，无文本图标按钮也可合并", () => {
    const layers = normalizeLocalLayers([
      {
        name: "Badge A",
        id: 1,
        children: [
          { name: "a bg", id: 2, left: 700, top: 20, right: 780, bottom: 60 },
          { name: "a text", id: 3, text: { text: "New" }, left: 710, top: 26, right: 770, bottom: 54 },
        ],
      },
      {
        name: "Badge B",
        id: 4,
        children: [
          { name: "b bg", id: 5, left: 700, top: 100, right: 780, bottom: 140 },
          { name: "b text", id: 6, text: { text: "Hot" }, left: 710, top: 106, right: 770, bottom: 134 },
        ],
      },
      {
        name: "Close",
        id: 7,
        children: [
          { name: "close dot", id: 8, left: 1200, top: 400, right: 1212, bottom: 412 },
          { name: "close glyph", id: 9, left: 1203, top: 403, right: 1209, bottom: 409 },
        ],
      },
    ]);
    const report = analyzeLayers({ layers, ...DOC, now: NOW });
    expect(report.mergeCandidates.map((merge) => merge.suggestedName)).toEqual([
      "badge-merged",
      "badge-merged-2",
      "icon-button-merged",
    ]);
  });

  it("真实引擎返回 0×0 组边界时仍按子层边界识别组件", () => {
    const layers = normalizePatchyLayers([
      {
        id: "1",
        name: "badge",
        isGroup: true,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        children: [
          { id: "2", name: "badge-count", type: "pixel", bounds: { x: 120, y: 70, width: 12, height: 12 } },
          { id: "3", name: "badge-icon", type: "pixel", bounds: { x: 126, y: 74, width: 8, height: 8 } },
        ],
      },
    ]);
    const report = analyzeLayers({ layers, ...DOC, now: NOW });
    expect(report.summary.merges).toBe(1);
    expect(report.mergeCandidates[0]).toMatchObject({
      suggestedName: "icon-button-merged",
      kind: "component",
    });
  });

  it("排除无文本的非角标组与超过画布 8% 的大组", () => {
    const layers = normalizeLocalLayers([
      {
        name: "decor",
        id: 1,
        children: [
          { name: "shape a", id: 2, left: 10, top: 10, right: 50, bottom: 50 },
          { name: "shape b", id: 3, left: 60, top: 10, right: 100, bottom: 50 },
        ],
      },
      {
        name: "hero",
        id: 4,
        children: [
          { name: "hero bg", id: 5, left: 20, top: 20, right: 780, bottom: 520 },
          { name: "hero title", id: 6, text: { text: "Welcome" }, left: 100, top: 100, right: 400, bottom: 140 },
        ],
      },
    ]);
    const report = analyzeLayers({ layers, ...DOC, now: NOW });
    expect(report.mergeCandidates).toEqual([]);
    expect(report.summary.merges).toBe(0);
  });
});

describe("analyzeLayers · 切图候选", () => {
  const layers = normalizeLocalLayers([
    { name: "背景", id: 1, left: 0, top: 0, right: 800, bottom: 600 },
    { name: "hidden icon", id: 2, hidden: true, left: 10, top: 10, right: 60, bottom: 60 },
    { name: "标题", id: 3, text: { text: "Hi" }, left: 100, top: 20, right: 300, bottom: 60 },
    { name: "clipped", id: 4, clipping: true, left: 100, top: 70, right: 200, bottom: 120 },
    { name: "Logo", id: 5, left: 600, top: 20, right: 700, bottom: 120 },
    {
      name: "icon",
      id: 6,
      children: [{ name: "icon shape", id: 7, left: 620, top: 140, right: 680, bottom: 200 }],
    },
  ]);
  const report = analyzeLayers({ layers, width: 800, height: 600, now: NOW });

  it("只保留可见、独立、未满版的图形候选", () => {
    expect(report.slices.map((slice) => slice.name)).toEqual(["Logo", "icon", "icon shape"]);
    expect(report.slices.map((slice) => slice.fileName)).toEqual([
      "logo.png",
      "icon.png",
      "icon-shape.png",
    ]);
  });

  it("为每个候选生成 1x/2x 输出规格", () => {
    const logo = report.slices[0];
    expect(logo.bounds).toEqual({ x: 600, y: 20, width: 100, height: 100 });
    expect(logo.scales).toEqual([1, 2]);
    expect(logo.formats).toEqual(["png"]);
  });
});

function projectRecord(name: string): ProjectRecord {
  return {
    id: "prj_cleanup",
    name,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    source: {
      version: 1,
      channels: 3,
      width: 800,
      height: 600,
      depth: 8,
      colorMode: 3,
      colorModeLabel: "RGB",
      fileSize: 2048,
      fileName: "cleanup.psd",
      sha256: "abc123",
      layerCount: 6,
    },
    localInspection: { layerCount: 6, parsedWith: "ag-psd" },
    plan: [],
    revisions: [],
  };
}

describe("buildAssetManifest", () => {
  const layers = normalizeLocalLayers([
    { name: "Logo", id: 1, left: 10, top: 10, right: 110, bottom: 60 },
    { name: "背景", id: 2, left: 0, top: 0, right: 800, bottom: 600 },
  ]);
  const report: CleanupReport = analyzeLayers({
    layers,
    width: 800,
    height: 600,
    now: NOW,
  });
  const snapshot: DocumentSnapshot = {
    documentId: "demo-doc-7",
    revision: "4",
    fingerprint: "fp",
    width: 800,
    height: 600,
    layers,
    capturedAt: NOW.toISOString(),
  };

  it("导出未生成像素的切图清单", () => {
    const manifest = buildAssetManifest({
      project: projectRecord("Landing Page"),
      snapshot,
      engine: "demo",
      report,
      now: NOW,
    });
    expect(manifest.schema).toBe("layerforge.asset-manifest.draft");
    expect(manifest.schemaVersion).toBe("0.1.0");
    expect(manifest.status).toMatchObject({ validated: false, pixels: "not-generated" });
    expect(manifest.document).toMatchObject({
      engine: "demo",
      documentId: "demo-doc-7",
      revision: "4",
    });
    expect(manifest.assets).toHaveLength(1);
    expect(manifest.assets[0]).toMatchObject({
      id: "asset:0",
      name: "Logo",
      bounds: { x: 10, y: 10, width: 100, height: 50 },
      status: "candidate",
    });
    expect(manifest.assets[0].outputs).toEqual([
      { fileName: "logo.png", scale: 1, width: 100, height: 50 },
      { fileName: "logo@2x.png", scale: 2, width: 200, height: 100 },
    ]);
    expect(manifest.notes.join(" ")).toContain("未执行逐图层渲染");
  });

  it("中文项目名保留在清单文件名中", () => {
    expect(assetManifestFileName(projectRecord("首页 视觉稿"))).toBe(
      "首页-视觉稿-assets.json",
    );
  });
});
