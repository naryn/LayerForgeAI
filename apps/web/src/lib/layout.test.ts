import { describe, expect, it } from "vitest";
import { inferComponentLayout, layoutSummary } from "./layout";

function boxes(...values: [number, number, number, number][]) {
  return values.map(([x, y, width, height]) => ({ bounds: { x, y, width, height } }));
}

describe("inferComponentLayout", () => {
  it("识别横向排列并计算间距与居中对齐", () => {
    expect(inferComponentLayout(boxes([10, 10, 50, 20], [70, 15, 30, 10]))).toEqual({
      direction: "row",
      gap: 10,
      align: "center",
    });
  });

  it("识别纵向排列与顶部起始对齐", () => {
    expect(inferComponentLayout(boxes([10, 10, 40, 20], [10, 40, 40, 20]))).toEqual({
      direction: "column",
      gap: 10,
      align: "start",
    });
  });

  it("识别重叠堆叠并在中心对齐时给出 center", () => {
    expect(inferComponentLayout(boxes([10, 10, 40, 30], [15, 15, 30, 20]))).toEqual({
      direction: "stack",
      gap: null,
      align: "center",
    });
  });

  it("分离且不对齐的图层视为混合堆叠", () => {
    expect(inferComponentLayout(boxes([0, 0, 20, 20], [30, 30, 20, 20]))).toEqual({
      direction: "stack",
      gap: null,
      align: "mixed",
    });
  });

  it("成员不足或边界无效时退化为堆叠", () => {
    expect(inferComponentLayout([])).toEqual({
      direction: "stack",
      gap: null,
      align: "mixed",
    });
    expect(inferComponentLayout([{ bounds: null }, { bounds: { x: 0, y: 0, width: 0, height: 10 } }])).toEqual({
      direction: "stack",
      gap: null,
      align: "mixed",
    });
  });
});

describe("layoutSummary", () => {
  it("输出中文布局摘要", () => {
    expect(layoutSummary({ direction: "row", gap: 12, align: "center" })).toBe(
      "横向 · 间距 12px · 居中",
    );
    expect(layoutSummary({ direction: "stack", gap: null, align: "mixed" })).toBe(
      "叠加 · 无间距 · 混合",
    );
  });
});
