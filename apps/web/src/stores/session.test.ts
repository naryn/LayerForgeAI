import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { writePsdBuffer } from "ag-psd";
import PlanPanel from "@/components/PlanPanel.vue";
import type { CleanupGroupSuggestion, CleanupMergeCandidate } from "@/lib/cleanup";
import { useProjectsStore } from "./projects";
import { useSessionStore } from "./session";

function layerData(width: number, height: number): ImageData {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) } as ImageData;
}

function buildPsd(): ArrayBuffer {
  return writePsdBuffer({
    width: 200,
    height: 120,
    children: [
      { name: "背景 / 底图", imageData: layerData(200, 120) },
      { name: "hero / 标题", imageData: layerData(160, 40), top: 10, left: 20 },
      { name: "hero / 按钮", imageData: layerData(60, 24), top: 80, left: 120 },
    ],
  }) as unknown as ArrayBuffer;
}

async function bootSession() {
  const projects = useProjectsStore();
  const bytes = new Uint8Array(buildPsd());
  const file = new File([bytes], "probe.psd", { type: "image/vnd.adobe.photoshop" });
  const project = await projects.createFromFile(file, "probe");
  const localLayers = await projects.getLocalLayers(project);
  const session = useSessionStore();
  await session.connectDemo({ project, file, localLayers });
  return { projects, session, project };
}

const Probe = defineComponent({
  setup() {
    const session = useSessionStore();
    return () =>
      h("div", [
        h("span", { class: "draft" }, String(session.stats.draft)),
        h("span", { class: "applied" }, String(session.stats.applied)),
        h("span", { class: "pending" }, String(session.stats.pending)),
        h(
          "ul",
          session.plan.map((entry) => h("li", { key: entry.id, class: "row" }, entry.status)),
        ),
      ]);
  },
});

describe("session store · 命名计划应用", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("应用后 stats 与列表状态一致", async () => {
    const { session } = await bootSession();
    expect(session.mode).toBe("demo");
    expect(session.canEdit).toBe(true);

    const layers = session.layerList;
    expect(layers.length).toBeGreaterThanOrEqual(2);
    await session.addPlanEntry(layers[0], "背景/backdrop");
    await session.addPlanEntry(layers[1], "hero/headline");
    expect(session.stats.draft).toBe(2);

    const wrapper = mount(Probe);
    await flushPromises();
    expect(wrapper.findAll(".row").map((node) => node.text())).toEqual(["draft", "draft"]);

    const result = await session.applyPlan();
    await flushPromises();
    expect(result).toEqual({ applied: 2, failed: 0 });

    const rows = wrapper.findAll(".row").map((node) => node.text());
    expect(rows).toEqual(["applied", "applied"]);
    expect(wrapper.find(".draft").text()).toBe("0");
    expect(wrapper.find(".applied").text()).toBe("2");
    expect(wrapper.find(".pending").text()).toBe("0");
  });

  it("PanelPanel 的统计与条目徽标同步", async () => {
    const { session } = await bootSession();
    const layers = session.layerList;
    await session.addPlanEntry(layers[0], "背景/backdrop");
    await session.addPlanEntry(layers[1], "hero/headline");

    const wrapper = mount(PlanPanel);
    await flushPromises();

    const chips = () => wrapper.findAll(".stat-chip__value").map((node) => node.text());
    const badges = () => wrapper.findAll(".plan-item .badge").map((node) => node.text().trim());
    expect(chips()).toEqual(["2", "0", "0", "0"]);
    expect(badges()).toEqual(["草稿", "草稿"]);

    await session.applyPlan();
    await flushPromises();

    expect(chips()).toEqual(["0", "2", "0", "0"]);
    expect(badges()).toEqual(["已应用", "已应用"]);
  });

  it("一键整理可批量加入计划，文档变化后分析结果失效", async () => {
    const { session } = await bootSession();
    const report = session.analyzeCleanup();
    expect(report).not.toBeNull();
    expect(report?.summary.renames).toBe(3);
    expect(report?.summary.slices).toBe(2);

    const first = await session.addCleanupRenamesToPlan(report?.renames ?? []);
    expect(first).toEqual({ added: 3, skipped: 0 });
    expect(session.plan.map((entry) => entry.note)).toEqual([
      "一键整理建议",
      "一键整理建议",
      "一键整理建议",
    ]);
    const second = await session.addCleanupRenamesToPlan(report?.renames ?? []);
    expect(second).toEqual({ added: 0, skipped: 3 });

    const result = await session.applyPlan();
    expect(result).toEqual({ applied: 3, failed: 0 });
    expect(session.cleanupReport).toBeNull();
  });
});

describe("session store · 编组与合并回写", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("一键编组写入演示文档、重算分析并纠正命名计划路径", async () => {
    const { session } = await bootSession();
    const roots = [...session.layers];
    expect(roots).toHaveLength(3);
    await session.addPlanEntry(roots[2], "背景/footer");

    const suggestion: CleanupGroupSuggestion = {
      id: "group-probe",
      parentPath: null,
      parentName: null,
      memberPaths: [roots[0].path, roots[1].path],
      memberNames: [roots[0].name, roots[1].name],
      bounds: { x: 0, y: 0, width: 200, height: 120 },
      layout: { direction: "stack", gap: null, align: "mixed" },
      suggestedName: "hero-card",
      reason: "测试编组",
    };
    const result = await session.applyGroupSuggestions([suggestion]);
    expect(result).toEqual({ applied: 1, failed: 0 });

    const document = session.document;
    expect(document).not.toBeNull();
    const group = document?.layers.find((layer) => layer.kind === "group");
    expect(group?.name).toBe("hero-card");
    expect(group?.children).toHaveLength(2);
    expect(document?.layers).toHaveLength(2);
    expect(session.plan[0].path).toBe(document?.layers[1].path);
    expect(session.cleanupReport).not.toBeNull();

    const applied = await session.applyPlan();
    expect(applied).toEqual({ applied: 1, failed: 0 });
  });

  it("撤销上一步恢复编组前的图层树并清空可撤销状态", async () => {
    const { session } = await bootSession();
    const roots = [...session.layers];
    const beforeNames = (session.document?.layers ?? []).map((layer) => layer.name);
    await session.applyGroupSuggestions([
      {
        id: "group-undo",
        parentPath: null,
        parentName: null,
        memberPaths: [roots[0].path, roots[1].path],
        memberNames: [roots[0].name, roots[1].name],
        bounds: { x: 0, y: 0, width: 200, height: 120 },
        layout: { direction: "stack", gap: null, align: "mixed" },
        suggestedName: "hero-card",
        reason: "测试撤销",
      },
    ]);
    expect(session.undoDepth).toBe(1);
    expect(session.canUndo).toBe(true);
    expect((session.document?.layers ?? []).some((layer) => layer.kind === "group")).toBe(true);

    const undone = await session.undoLastMutation();
    expect(undone).toBe(true);
    expect((session.document?.layers ?? []).map((layer) => layer.name)).toEqual(beforeNames);
    expect(session.undoDepth).toBe(0);
    expect(session.canUndo).toBe(false);
  });

  it("一键合并把组栅格化为单个图层并保留建议名称", async () => {
    const { session } = await bootSession();
    const roots = [...session.layers];
    await session.applyGroupSuggestions([
      {
        id: "group-probe",
        parentPath: null,
        parentName: null,
        memberPaths: [roots[0].path, roots[1].path],
        memberNames: [roots[0].name, roots[1].name],
        bounds: { x: 0, y: 0, width: 200, height: 120 },
        layout: { direction: "stack", gap: null, align: "mixed" },
        suggestedName: "hero-card",
        reason: "测试编组",
      },
    ]);
    const group = session.document?.layers.find((layer) => layer.kind === "group");
    expect(group).toBeDefined();
    if (!group) return;

    const candidate: CleanupMergeCandidate = {
      id: "merge-probe",
      path: group.path,
      parentPath: null,
      name: group.name,
      suggestedName: "hero-card-merged",
      kind: "badge",
      memberPaths: group.children.map((child) => child.path),
      memberNames: group.children.map((child) => child.name),
      bounds: group.bounds ?? { x: 0, y: 0, width: 200, height: 120 },
      layout: { direction: "stack", gap: null, align: "mixed" },
      areaRatio: 0.1,
      reason: "测试合并",
    };
    const result = await session.applyMergeCandidates([candidate]);
    expect(result).toEqual({ applied: 1, failed: 0 });

    const merged = session.document?.layers.find((layer) => layer.meta?.demoMerged === true);
    expect(merged?.name).toBe("hero-card-merged");
    expect(merged?.kind).toBe("pixel");
    expect(merged?.children).toEqual([]);
    expect(session.document?.layers).toHaveLength(2);
  });
});