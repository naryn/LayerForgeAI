import { describe, expect, it } from "vitest";
import type { ProjectRecord } from "./domain";
import { analyzeLayers } from "./cleanup";
import {
  AI_NAMING_REQUEST_SCHEMA,
  AI_NAMING_RESPONSE_SCHEMA,
  AI_NAMING_SCHEMA_VERSION,
  buildAiNamingPrompt,
  buildAiNamingTask,
  collectAiNamingCandidates,
  parseAiNamingResponse,
  parseAiNamingResponseText,
  type AiNamingCandidate,
} from "./aiNaming";
import { normalizeLocalLayers } from "./layers";

const NOW = new Date("2026-10-21T10:00:00.000Z");

const layers = normalizeLocalLayers([
  { name: "Layer 1", id: 1, left: 0, top: 0, right: 400, bottom: 300 },
  {
    name: "Group 12",
    id: 2,
    children: [
      { name: "Rectangle 5", id: 3, left: 20, top: 20, right: 100, bottom: 60 },
      { name: "Ellipse 2", id: 4, left: 200, top: 20, right: 260, bottom: 80 },
    ],
  },
  {
    name: "Layer 13",
    id: 5,
    text: { text: "Pay Now" },
    left: 20,
    top: 200,
    right: 200,
    bottom: 240,
  },
  {
    name: "hero",
    id: 6,
    children: [
      {
        name: "Layer 14",
        id: 7,
        text: { text: "Continue" },
        left: 240,
        top: 200,
        right: 380,
        bottom: 240,
      },
    ],
  },
  {
    name: "Group 20",
    id: 8,
    children: [
      {
        name: "Layer 15",
        id: 9,
        text: { text: "Close" },
        left: 300,
        top: 20,
        right: 380,
        bottom: 50,
      },
      {
        name: "Layer 16",
        id: 10,
        text: { text: "VIP" },
        left: 300,
        top: 60,
        right: 380,
        bottom: 90,
      },
    ],
  },
]);

const report = analyzeLayers({ layers, width: 400, height: 300, now: NOW });
const candidates = collectAiNamingCandidates({ layers, report });

function project(): ProjectRecord {
  return {
    id: "project-1",
    name: "Demo Store",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    source: {
      fileName: "demo.psd",
      sha256: "abc",
      version: 1,
      channels: 4,
      width: 400,
      height: 300,
      depth: 8,
      colorMode: 3,
      colorModeLabel: "RGB",
      fileSize: 1024,
      layerCount: 10,
    },
    localInspection: { layerCount: 10, parsedWith: "ag-psd" },
    plan: [],
    revisions: [],
  };
}

function response(renames: unknown[], overrides: Record<string, unknown> = {}): unknown {
  return {
    schema: AI_NAMING_RESPONSE_SCHEMA,
    schemaVersion: AI_NAMING_SCHEMA_VERSION,
    renames,
    ...overrides,
  };
}

describe("collectAiNamingCandidates", () => {
  it("只收集规则无法处理的通用名，并带上父子与布局上下文", () => {
    expect(candidates.map((candidate) => candidate.path)).toEqual([
      "1",
      "2",
      "3/0",
      "4",
      "4/0",
      "4/1",
    ]);
    expect(candidates.map((candidate) => candidate.currentName)).toEqual([
      "Group 12",
      "Layer 13",
      "Layer 14",
      "Group 20",
      "Layer 15",
      "Layer 16",
    ]);
    const group = candidates.find((candidate) => candidate.path === "1");
    expect(group).toMatchObject({
      kind: "group",
      bounds: { x: 20, y: 20, width: 240, height: 60 },
      parentPath: null,
      siblingIndex: 2,
      siblingCount: 5,
      reasons: ["通用名称"],
      layout: { direction: "row", gap: 100, align: "start" },
    });
    expect(group?.siblingNames).toEqual(["Layer 1", "Layer 13", "hero", "Group 20"]);
    expect(group?.childNames).toEqual(["Rectangle 5", "Ellipse 2"]);
    const multiText = candidates.find((candidate) => candidate.path === "4");
    expect(multiText?.textSamples).toEqual(["Close", "VIP"]);
    expect(multiText?.parentName).toBeNull();
  });

  it("有分析结果时排除已按结构角色命名的图层", () => {
    expect(candidates.map((candidate) => candidate.path)).not.toContain("0");
    expect(candidates.map((candidate) => candidate.path)).not.toContain("1/0");
    expect(candidates.map((candidate) => candidate.path)).not.toContain("1/1");
    const withoutReport = collectAiNamingCandidates({ layers });
    expect(withoutReport.map((candidate) => candidate.path)).toContain("0");
  });

  it("标记同级重名", () => {
    const duplicateLayers = normalizeLocalLayers([
      { name: "Shape 1", id: 1, left: 0, top: 0, right: 10, bottom: 10 },
      { name: "Shape 1", id: 2, left: 20, top: 0, right: 30, bottom: 10 },
    ]);
    const duplicateCandidates = collectAiNamingCandidates({ layers: duplicateLayers });
    expect(duplicateCandidates).toHaveLength(2);
    expect(duplicateCandidates.map((candidate) => candidate.reasons)).toEqual([
      ["通用名称", "同级重名"],
      ["通用名称", "同级重名"],
    ]);
  });
});

describe("buildAiNamingTask / buildAiNamingPrompt", () => {
  it("生成自包含的提示词与严格响应格式", () => {
    const task = buildAiNamingTask({
      project: project(),
      layers,
      report,
      candidates,
      now: NOW,
    });
    expect(task).toMatchObject({
      schema: AI_NAMING_REQUEST_SCHEMA,
      schemaVersion: AI_NAMING_SCHEMA_VERSION,
      generatedAt: NOW.toISOString(),
      project: {
        name: "Demo Store",
        sourceFileName: "demo.psd",
        width: 400,
        height: 300,
        layerCount: 10,
      },
    });
    expect(task.outline).toContain('1 [group] "Group 12" (2 子层)');
    const prompt = buildAiNamingPrompt(task);
    expect(prompt).toContain(AI_NAMING_REQUEST_SCHEMA);
    expect(prompt).toContain(AI_NAMING_RESPONSE_SCHEMA);
    expect(prompt).toContain("不要 Markdown 代码围栏");
    expect(prompt).toContain("layout.direction");
    expect(prompt).toContain('"path": "1"');
    expect(prompt).toContain("Rectangle 5");
    expect(prompt).toContain("候选数：6");
  });
});

describe("parseAiNamingResponse", () => {
  it("接受合法命名并规范化，拒绝未知路径、通用名、重名与重复路径", () => {
    const result = parseAiNamingResponse(
      response([
        { path: "1", newName: "Feature Card", reason: "包含两个图形" },
        { path: "2", newName: "Pay CTA", reason: "按钮文案" },
        { path: "3/0", newName: "Continue Label", reason: "文本层" },
        { path: "9/9", newName: "ghost", reason: "不存在" },
        { path: "4/0", newName: "Shape 2", reason: "仍是通用名" },
        { path: "1", newName: "feature-card-2", reason: "重复路径" },
      ]),
      { candidates, layers },
    );
    expect(result.accepted).toEqual([
      {
        path: "1",
        layerId: "local-2",
        originalName: "Group 12",
        newName: "feature-card",
        reason: "包含两个图形",
      },
      {
        path: "2",
        layerId: "local-5",
        originalName: "Layer 13",
        newName: "pay-cta",
        reason: "按钮文案",
      },
      {
        path: "3/0",
        layerId: "local-7",
        originalName: "Layer 14",
        newName: "continue-label",
        reason: "文本层",
      },
    ]);
    expect(result.rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "9/9", reason: "路径不在本次候选列表" }),
        expect.objectContaining({ path: "4/0", reason: "仍是通用名称" }),
        expect.objectContaining({ path: "1", reason: "同一路径重复出现" }),
      ]),
    );
  });

  it("拒绝与当前名称相同的命名", () => {
    const result = parseAiNamingResponse(
      response([{ path: "1", newName: "Group 12", reason: "不变" }]),
      { candidates, layers },
    );
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual([
      expect.objectContaining({ path: "1", reason: "与当前名称相同" }),
    ]);
  });

  it("拒绝与未改名的同级图层冲突", () => {
    const collisionLayers = normalizeLocalLayers([
      { name: "Layer 1", id: 1, left: 0, top: 0, right: 100, bottom: 100 },
      { name: "hero", id: 2, left: 200, top: 0, right: 300, bottom: 100 },
    ]);
    const collisionCandidates = collectAiNamingCandidates({ layers: collisionLayers });
    const result = parseAiNamingResponse(
      response([{ path: "0", newName: "hero", reason: "撞上兄弟" }]),
      { candidates: collisionCandidates, layers: collisionLayers },
    );
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual([
      expect.objectContaining({ path: "0", reason: "与同级图层名称冲突" }),
    ]);
  });

  it("同批重名按图层树顺序保留第一个", () => {
    const result = parseAiNamingResponse(
      response([
        { path: "4/1", newName: "shared-name", reason: "第二项" },
        { path: "4/0", newName: "Shared Name", reason: "第一项" },
      ]),
      { candidates, layers },
    );
    expect(result.accepted.map((rename) => rename.path)).toEqual(["4/0"]);
    expect(result.rejected).toEqual([
      expect.objectContaining({ path: "4/1", reason: "与同级图层名称冲突" }),
    ]);
  });

  it("冲突被拒的图层保留原名并占用该名称", () => {
    const reservedLayers = normalizeLocalLayers([
      { name: "Layer 1", id: 1, left: 0, top: 0, right: 100, bottom: 100 },
      { name: "hero-art", id: 2, left: 120, top: 0, right: 220, bottom: 100 },
      { name: "Layer 2", id: 3, left: 240, top: 0, right: 340, bottom: 100 },
    ]);
    const reservedCandidates: AiNamingCandidate[] = reservedLayers.map((layer) => ({
      path: layer.path,
      layerId: layer.id,
      currentName: layer.name,
      kind: layer.kind,
      bounds: layer.bounds ?? null,
      visible: layer.visible,
      parentPath: null,
      parentName: null,
      siblingIndex: 1,
      siblingCount: 3,
      siblingNames: [],
      childNames: [],
      textSamples: [],
      reasons: ["通用名称"],
    }));
    const result = parseAiNamingResponse(
      response([
        { path: "0", newName: "hero-banner", reason: "主图" },
        { path: "1", newName: "hero-banner", reason: "撞名" },
        { path: "2", newName: "hero-art", reason: "试图占用被拒图层原名" },
      ]),
      { candidates: reservedCandidates, layers: reservedLayers },
    );
    expect(result.accepted.map((rename) => rename.path)).toEqual(["0"]);
    expect(result.rejected).toEqual([
      expect.objectContaining({ path: "1", reason: "与同级图层名称冲突" }),
      expect.objectContaining({ path: "2", reason: "与同级图层名称冲突" }),
    ]);
  });

  it("拒绝过期候选与非法响应包", () => {
    const stale = candidates.map((candidate) =>
      candidate.path === "1" ? { ...candidate, currentName: "Old Layer" } : candidate,
    );
    const result = parseAiNamingResponse(
      response([{ path: "1", newName: "page-background", reason: "过期" }]),
      { candidates: stale, layers },
    );
    expect(result.rejected).toEqual([
      expect.objectContaining({ path: "1", reason: "图层名称已变化，请重新分析" }),
    ]);
    expect(() =>
      parseAiNamingResponse(response([]), {
        candidates,
        layers,
      }),
    ).not.toThrow();
    expect(() =>
      parseAiNamingResponse(response([], { schema: "wrong" }), { candidates, layers }),
    ).toThrow("schema");
    expect(() =>
      parseAiNamingResponse(response([], { schemaVersion: "9.9.9" }), {
        candidates,
        layers,
      }),
    ).toThrow("schemaVersion");
  });

  it("容忍 Markdown 代码围栏并抛出可读的 JSON 错误", () => {
    const result = parseAiNamingResponseText(
      [
        "```json",
        JSON.stringify(
          response([{ path: "1", newName: "feature-card", reason: "合法" }]),
        ),
        "```",
      ].join("\n"),
      { candidates, layers },
    );
    expect(result.accepted).toHaveLength(1);
    expect(() => parseAiNamingResponseText("{not json", { candidates, layers })).toThrow(
      "JSON 解析失败",
    );
  });
});
