import { describe, expect, it } from "vitest";
import type { LayerNode, PlanEntry } from "./domain";
import { normalizeLocalLayers } from "./layers";
import {
  planStats,
  suggestedNormalizedFileName,
  toSavedPath,
  verifyPlanAgainstLayers,
} from "./normalize";

function entry(overwrite: Partial<PlanEntry>): PlanEntry {
  return {
    id: "e1",
    path: "0",
    originalName: "旧名",
    newName: "新名",
    status: "applied",
    updatedAt: "2026-10-20T00:00:00.000Z",
    ...overwrite,
  };
}

describe("toSavedPath", () => {
  it("为合法文件名生成 /saved 路径", () => {
    expect(toSavedPath("design-normalized.psd")).toBe("/saved/design-normalized.psd");
    expect(toSavedPath("B.PSB")).toBe("/saved/B.PSB");
  });

  it("拒绝空名、含路径分隔符或错误扩展名", () => {
    expect(() => toSavedPath("   ")).toThrow(/不能为空/);
    expect(() => toSavedPath("a/b.psd")).toThrow(/路径分隔符/);
    expect(() => toSavedPath("a\\b.psd")).toThrow(/路径分隔符/);
    expect(() => toSavedPath("a.png")).toThrow(/必须以 \.psd 或 \.psb 结尾/);
  });
});

describe("suggestedNormalizedFileName", () => {
  it("使用本地时间戳并清洗项目名", () => {
    const name = suggestedNormalizedFileName(
      "home page v2",
      new Date(2026, 9, 20, 22, 21, 27),
    );
    expect(name).toBe("home-page-v2-20261020-222127-normalized.psd");
  });

  it("保留中文项目名", () => {
    expect(suggestedNormalizedFileName("首页 视觉稿", new Date(2026, 9, 20, 22, 21, 27))).toBe(
      "首页-视觉稿-20261020-222127-normalized.psd",
    );
  });

  it("对无法清洗的名称回退为 project", () => {
    expect(suggestedNormalizedFileName("", new Date(2026, 0, 2, 3, 4, 5))).toBe(
      "project-20260102-030405-normalized.psd",
    );
  });
});

describe("verifyPlanAgainstLayers", () => {
  const layers: LayerNode[] = normalizeLocalLayers([
    { name: "alpha", id: 1 },
    { name: "beta", id: 2 },
    { name: "beta", id: 3 },
  ]);

  it("按图层路径与目标名称匹配为已验证", () => {
    const result = verifyPlanAgainstLayers(
      [entry({ path: "0", originalName: "alpha", newName: "alpha" })],
      layers,
    );
    expect(result.verified).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.plan[0].status).toBe("verified");
    expect(result.plan[0].note).toBeUndefined();
    expect(result.plan[0].layerId).toBe(layers[0].id);
  });

  it("路径失效但新名称唯一时，回退匹配并附加说明", () => {
    const result = verifyPlanAgainstLayers(
      [entry({ path: "9/9", newName: "alpha" })],
      layers,
    );
    expect(result.verified).toBe(1);
    expect(result.plan[0].status).toBe("verified");
    expect(result.plan[0].note).toMatch(/按唯一新名称匹配/);
  });

  it("新名称不唯一时判为失败", () => {
    const result = verifyPlanAgainstLayers([entry({ path: "9/9", newName: "beta" })], layers);
    expect(result.failed).toBe(1);
    expect(result.plan[0].status).toBe("failed");
    expect(result.plan[0].note).toMatch(/未能/);
  });

  it("草稿条目保持原状且不计入尝试数", () => {
    const draft = entry({ id: "d", status: "draft", path: "9/9", newName: "不存在" });
    const result = verifyPlanAgainstLayers([draft], layers);
    expect(result.attempted).toBe(0);
    expect(result.plan[0]).toBe(draft);
  });
});

describe("planStats", () => {
  it("统计各状态并汇总待处理项", () => {
    const stats = planStats([
      entry({ id: "1", status: "draft" }),
      entry({ id: "2", status: "applied" }),
      entry({ id: "3", status: "verified" }),
      entry({ id: "4", status: "failed" }),
      entry({ id: "5", status: "draft" }),
    ]);
    expect(stats).toEqual({
      total: 5,
      draft: 2,
      applied: 1,
      verified: 1,
      failed: 1,
      pending: 3,
    });
  });

  it("空计划返回全零", () => {
    expect(planStats([])).toEqual({
      total: 0,
      draft: 0,
      applied: 0,
      verified: 0,
      failed: 0,
      pending: 0,
    });
  });
});