import { describe, expect, it } from "vitest";
import type { CleanupGroupSuggestion } from "./cleanup";
import type { DocumentSnapshot, PlanEntry, ProjectRecord } from "./domain";
import { buildDesignIr, designIrFileName } from "./ir";
import { normalizeLocalLayers } from "./layers";

const project: ProjectRecord = {
  id: "prj_1",
  name: "首页 视觉稿",
  createdAt: "2026-10-20T00:00:00.000Z",
  updatedAt: "2026-10-20T00:00:00.000Z",
  source: {
    version: 1,
    channels: 3,
    width: 1440,
    height: 900,
    depth: 8,
    colorMode: 3,
    colorModeLabel: "RGB",
    fileSize: 1024,
    fileName: "home.psd",
    sha256: "abc",
    layerCount: 3,
  },
  localInspection: { layerCount: 3, parsedWith: "ag-psd" },
  plan: [],
  revisions: [],
};

const snapshot: DocumentSnapshot = {
  documentId: "demo-doc-1",
  revision: "2",
  fingerprint: "demo-2-deadbeef",
  name: "home",
  path: "/demo/demo-doc-1.psd",
  width: 1440,
  height: 900,
  layers: normalizeLocalLayers([
    { name: "组", children: [{ name: "组/标题", text: { text: "t" }, opacity: 0.5 }] },
    { name: "底图", id: 9 },
  ]),
  capturedAt: "2026-10-20T00:00:00.000Z",
} as DocumentSnapshot;

const plan: PlanEntry[] = [
  {
    id: "p1",
    path: "0/0",
    originalName: "组/标题",
    newName: "hero/title",
    status: "applied",
    updatedAt: "2026-10-20T00:00:00.000Z",
  },
];

const groupSuggestion: CleanupGroupSuggestion = {
  id: "group:root:0+1",
  parentPath: null,
  parentName: null,
  memberPaths: ["0", "1"],
  memberNames: ["组", "底图"],
  bounds: { x: 0, y: 0, width: 1440, height: 900 },
  layout: { direction: "stack", gap: null, align: "center" },
  suggestedName: "root-group",
  reason: "2 个同级图层边界相邻且未编组",
};

describe("buildDesignIr", () => {
  it("标注为未验证的草稿模式", () => {
    const ir = buildDesignIr({ project, snapshot, plan, engine: "demo" });
    expect(ir.schema).toBe("layerforge.design-ir.draft");
    expect(ir.schemaVersion).toBe("0.4.0");
    expect(ir.status.validated).toBe(false);
    expect(ir.status.note).toMatch(/Not an M5-validated/);
    expect(ir.status.note).toMatch(/do not modify the PSD/);
  });

  it("携带项目来源与文档快照元数据", () => {
    const ir = buildDesignIr({ project, snapshot, plan, engine: "demo" });
    expect(ir.project).toMatchObject({ id: "prj_1", name: "首页 视觉稿" });
    expect(ir.project.source).toMatchObject({
      fileName: "home.psd",
      colorMode: "RGB",
      width: 1440,
      layers: 3,
    });
    expect(ir.document).toMatchObject({
      engine: "demo",
      documentId: "demo-doc-1",
      revision: "2",
      fingerprint: "demo-2-deadbeef",
    });
  });

  it("递归映射节点并把计划名称写入 semanticName", () => {
    const ir = buildDesignIr({ project, snapshot, plan, engine: "demo" });
    const group = ir.nodes[0];
    expect(group).toMatchObject({
      id: "node:0",
      parentId: null,
      sourcePath: "0",
      name: "组",
      semanticName: null,
      type: "group",
      zIndex: 0,
      paintOrder: 0,
      clipping: false,
    });
    const child = group.children[0];
    expect(child).toMatchObject({
      id: "node:0/0",
      parentId: "node:0",
      sourcePath: "0/0",
      name: "组/标题",
      semanticName: "hero/title",
      type: "text",
      zIndex: 0,
      paintOrder: 1,
      opacity: 50,
      children: [],
    });
    expect(child.blendMode).toBeNull();
    expect(child.meta).toMatchObject({ hasText: true, text: "t" });
    expect(ir.nodes[1].meta).toBeNull();
  });

  it("未匹配计划的节点 semanticName 为 null，并透传计划", () => {
    const ir = buildDesignIr({ project, snapshot, plan, engine: "demo" });
    expect(ir.nodes[1].semanticName).toBeNull();
    expect(ir.nodes[1].zIndex).toBe(1);
    expect(ir.nodes[1].paintOrder).toBe(2);
    expect(ir.plan).toBe(plan);
  });

  it("把编组建议映射为 logicalGroups 与节点 logicalGroupId", () => {
    const ir = buildDesignIr({
      project,
      snapshot,
      plan,
      engine: "demo",
      logicalGroups: [groupSuggestion],
    });
    expect(ir.logicalGroups).toEqual([
      {
        id: "group:root:0+1",
        rule: "group-cluster",
        status: "suggested",
        parentPath: null,
        parentName: null,
        suggestedName: "root-group",
        memberPaths: ["0", "1"],
        memberIds: [ir.nodes[0].sourceLayerId, ir.nodes[1].sourceLayerId],
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        layout: { direction: "stack", gap: null, align: "center" },
        reason: "2 个同级图层边界相邻且未编组",
      },
    ]);
    expect(ir.nodes[0].logicalGroupId).toBe(groupSuggestion.id);
    expect(ir.nodes[1].logicalGroupId).toBe(groupSuggestion.id);
    expect(ir.nodes[0].children[0].logicalGroupId).toBeNull();
  });

  it("没有编组建议时输出空数组与 null", () => {
    const ir = buildDesignIr({ project, snapshot, plan, engine: "demo" });
    expect(ir.logicalGroups).toEqual([]);
    expect(ir.nodes.every((node) => node.logicalGroupId === null)).toBe(true);
    expect(ir.nodes.every((node) => node.assetId === null)).toBe(true);
  });

  it("把资产包输出 id 写入对应节点的 assetId", () => {
    const ir = buildDesignIr({
      project,
      snapshot,
      plan,
      engine: "inspect",
      assets: [
        { id: "asset:0/0", sourcePath: "0/0" },
        { id: "asset:ghost", sourcePath: "9/9" },
      ],
    });
    expect(ir.nodes[0].children[0].assetId).toBe("asset:0/0");
    expect(ir.nodes[0].assetId).toBeNull();
    expect(ir.nodes[1].assetId).toBeNull();
  });
});

describe("designIrFileName", () => {
  it("清洗项目名并加上 -design-ir.json 后缀", () => {
    expect(designIrFileName({ ...project, name: "Home Page v2" })).toBe(
      "Home-Page-v2-design-ir.json",
    );
  });

  it("保留中文项目名", () => {
    expect(designIrFileName({ ...project, name: "首页 视觉稿" })).toBe(
      "首页-视觉稿-design-ir.json",
    );
  });

  it("无法清洗的名称回退为 project", () => {
    expect(designIrFileName({ ...project, name: "***" })).toBe("project-design-ir.json");
  });
});