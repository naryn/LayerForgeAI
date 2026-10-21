import { describe, expect, it } from "vitest";
import type { LayerNode } from "./domain";
import {
  collectLayerPaths,
  countLayers,
  filterLayerTree,
  findLayerById,
  findLayerByPath,
  flattenLayers,
  kindBreakdown,
  layerKindLabel,
  normalizeBounds,
  normalizeLocalLayers,
  normalizePatchyLayers,
  unionBounds,
  type AgLayerLike,
} from "./layers";

function leaf(name: string, overwrite: Partial<AgLayerLike> = {}): AgLayerLike {
  return { name, id: name.length, opacity: 1, ...overwrite };
}

describe("normalizeBounds", () => {
  it("由 left/top/right/bottom 推导宽高", () => {
    expect(normalizeBounds({ left: 10, top: 20, right: 40, bottom: 60 })).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    });
  });

  it("直接读取 x/y/width/height", () => {
    expect(normalizeBounds({ x: 5, y: 6, width: 7, height: 8 })).toEqual({
      x: 5,
      y: 6,
      width: 7,
      height: 8,
    });
  });

  it("支持嵌套的 bounds/rect", () => {
    expect(normalizeBounds({ bounds: { left: 1, top: 2, right: 3, bottom: 4 } })).toEqual({
      x: 1,
      y: 2,
      width: 2,
      height: 2,
    });
    expect(normalizeBounds({ rect: { left: 0, top: 0, right: 10, bottom: 5 } })).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 5,
    });
  });

  it("对缺失或非法输入返回 undefined，并把负宽高收敛为 0", () => {
    expect(normalizeBounds(undefined)).toBeUndefined();
    expect(normalizeBounds({ left: 1 })).toBeUndefined();
    expect(normalizeBounds({ left: 10, top: 10, right: 0, bottom: 0 })).toEqual({
      x: 10,
      y: 10,
      width: 0,
      height: 0,
    });
  });
});

describe("unionBounds", () => {
  function node(bounds?: LayerNode["bounds"]): LayerNode {
    return { id: "x", name: "x", path: "0", kind: "pixel", bounds, visible: true, locked: false, opacity: 100, children: [] };
  }

  it("合并子树中所有非空边界", () => {
    const tree = [
      node({ x: 10, y: 20, width: 30, height: 40 }),
      node({ x: 40, y: 50, width: 10, height: 10 }),
    ];
    expect(unionBounds(tree)).toEqual({ x: 10, y: 20, width: 40, height: 40 });
  });

  it("递归进入子节点", () => {
    const parent = node();
    parent.children = [node({ x: 2, y: 3, width: 4, height: 5 })];
    expect(unionBounds([parent])).toEqual({ x: 2, y: 3, width: 4, height: 5 });
  });

  it("没有任何有效边界时返回 undefined", () => {
    expect(unionBounds([node(), node()])).toBeUndefined();
    expect(unionBounds([])).toBeUndefined();
  });
});

describe("normalizeLocalLayers", () => {
  it("将 ag-psd 的 0..1 不透明度换算为百分比并夹取范围", () => {
    const layers = normalizeLocalLayers([
      leaf("全不透明", { opacity: 1 }),
      leaf("半透明", { opacity: 0.5 }),
      leaf("默认", { opacity: undefined }),
      leaf("超范围", { opacity: 3 }),
    ]);
    expect(layers.map((layer) => layer.opacity)).toEqual([100, 50, 100, 100]);
  });

  it("按子节点或 sectionDivider 识别分组", () => {
    const layers = normalizeLocalLayers([
      { name: "组", children: [leaf("子层")] },
      { name: "分隔组", sectionDivider: { type: 1 } },
      leaf("像素层"),
    ]);
    expect(layers.map((layer) => layer.kind)).toEqual(["group", "group", "pixel"]);
  });

  it("提取文本内容、字体、字号、颜色与对齐", () => {
    const [layer] = normalizeLocalLayers([
      leaf("价格", {
        text: {
          text: "25,000 IQD",
          style: {
            font: { name: "PingFangSC-Semibold" },
            fontSize: 65.71429,
            fillColor: { r: 181.00155, g: 17.0034, b: 219.99615 },
            fauxBold: false,
          },
          paragraphStyle: { justification: "center" },
          styleRuns: [{ length: 8, style: {} }, { length: 2, style: {} }],
        },
      }),
    ]);
    expect(layer.kind).toBe("text");
    expect(layer.meta).toMatchObject({
      hasText: true,
      text: "25,000 IQD",
      fontFamily: "PingFangSC-Semibold",
      fontSize: 65.71,
      textColor: "#b511dc",
      bold: true,
      textAlign: "center",
      textRuns: 2,
    });
  });

  it("文本内容超长时截断，缺少样式时只保留内容", () => {
    const [layer] = normalizeLocalLayers([
      leaf("长文本", { text: { text: "字".repeat(620) } }),
      leaf("空文本", { text: {} }),
    ]);
    expect(String(layer.meta?.text)).toHaveLength(501);
    expect(String(layer.meta?.text).endsWith("…")).toBe(true);
    expect(layer.meta?.fontFamily).toBeUndefined();
    expect(layer.children).toEqual([]);
  });

  it("识别文本、调整层、智能对象与形状", () => {
    const layers = normalizeLocalLayers([
      leaf("文本", { text: { text: "hi" } }),
      leaf("调整", { adjustment: { type: "brightness" } }),
      leaf("智能对象", { placedLayer: { id: "p" } }),
      leaf("形状", { vectorFill: { type: "color" } }),
    ]);
    expect(layers.map((layer) => layer.kind)).toEqual([
      "text",
      "adjustment",
      "smart-object",
      "shape",
    ]);
  });

  it("把 protected.position 映射为锁定，hidden 映射为不可见", () => {
    const [layer] = normalizeLocalLayers([
      leaf("锁定隐藏", { protected: { position: true }, hidden: true }),
    ]);
    expect(layer.locked).toBe(true);
    expect(layer.visible).toBe(false);
  });

  it("分组自身矩形为空时，用子节点并集作为边界", () => {
    const [group] = normalizeLocalLayers([
      {
        name: "组",
        children: [
          leaf("a", { left: 10, top: 20, right: 40, bottom: 60 }),
          leaf("b", { left: 40, top: 50, right: 50, bottom: 60 }),
        ],
      },
    ]);
    expect(group.kind).toBe("group");
    expect(group.bounds).toEqual({ x: 10, y: 20, width: 40, height: 40 });
  });

  it("为非分组层保留其自身的 0×0 边界", () => {
    const [layer] = normalizeLocalLayers([leaf("空", { left: 5, top: 5, right: 5, bottom: 5 })]);
    expect(layer.kind).toBe("pixel");
    expect(layer.bounds).toEqual({ x: 5, y: 5, width: 0, height: 0 });
  });

  it("构建嵌套路径、稳定 id，并记录 meta 标记", () => {
    const layers = normalizeLocalLayers([
      {
        name: "组",
        children: [
          leaf("剪贴", { mask: {}, effects: {}, text: { text: "x" }, clipping: true }),
        ],
      },
    ]);
    const child = layers[0].children[0];
    expect(layers[0].path).toBe("0");
    expect(child.path).toBe("0/0");
    expect(child.id).toBe(`local-${child.name.length}`);
    expect(child.meta).toEqual({
      hasMask: true,
      hasEffects: true,
      hasText: true,
      text: "x",
      clipping: true,
    });
    expect(child.clipping).toBe(true);
  });

  it("名称缺失时回退为 layer_<path>", () => {
    const [layer] = normalizeLocalLayers([{}]);
    expect(layer.name).toBe("layer_0");
  });

  it("undefined 输入返回空数组", () => {
    expect(normalizeLocalLayers(undefined)).toEqual([]);
  });
});

describe("normalizePatchyLayers", () => {
  it("读取 Patchy 侧字段并夹取 0..100 不透明度", () => {
    const layers = normalizePatchyLayers([
      { id: "root", name: "根", type: "group", visible: true, children: [{ id: "c1", name: "子" }] },
      { name: "半透明", opacity: 42.6 },
      { name: "越界", opacity: 500 },
      { name: "隐藏", hidden: true },
    ]);
    expect(layers[0].kind).toBe("group");
    expect(layers[0].children[0].path).toBe("0/0");
    expect(layers[1].opacity).toBe(43);
    expect(layers[2].opacity).toBe(100);
    expect(layers[3].visible).toBe(false);
  });

  it("识别自动化 state 的 isArtboard/isText/isShape 标志", () => {
    const layers = normalizePatchyLayers([
      { id: "1", name: "画板", isGroup: false, isArtboard: true },
      { id: "2", name: "标题", isGroup: false, isText: true },
      { id: "3", name: "按钮底", isGroup: false, isShape: true },
      { id: "4", name: "照片", isGroup: false },
    ]);
    expect(layers.map((layer) => layer.kind)).toEqual(["group", "text", "shape", "pixel"]);
  });

  it("组边界为 0×0 时改用子层并集", () => {
    const [group] = normalizePatchyLayers([
      {
        id: "g",
        name: "组",
        isGroup: true,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        children: [
          { id: "a", name: "a", isShape: true, bounds: { x: 10, y: 20, width: 30, height: 40 } },
          { id: "b", name: "b", bounds: { x: 50, y: 30, width: 10, height: 10 } },
        ],
      },
    ]);
    expect(group.bounds).toEqual({ x: 10, y: 20, width: 50, height: 40 });
  });

  it("缺少 id 时用路径作为回退 id", () => {
    const layers = normalizePatchyLayers([{ name: "无 id" }]);
    expect(layers[0].id).toBe("0");
  });

  it("识别 locked 与 clipping 别名", () => {
    const [layer] = normalizePatchyLayers([{ id: "l", name: "锁定剪贴", clipToBelow: true, isLocked: true }]);
    expect(layer.locked).toBe(true);
    expect(layer.clipping).toBe(true);
  });

  it("非数组输入返回空数组", () => {
    expect(normalizePatchyLayers(null)).toEqual([]);
    expect(normalizePatchyLayers({})).toEqual([]);
  });
});

describe("图层树查询工具", () => {
  const tree: LayerNode[] = normalizeLocalLayers([
    {
      name: "页面",
      id: 10,
      children: [
        { name: "标题", id: 11, text: { text: "t" } },
        { name: "按钮", id: 12 },
      ],
    },
    { name: "脚注", id: 13 },
  ]);

  it("flattenLayers 深度优先展开", () => {
    expect(flattenLayers(tree).map((layer) => layer.name)).toEqual([
      "页面",
      "标题",
      "按钮",
      "脚注",
    ]);
  });

  it("countLayers 统计节点总数", () => {
    expect(countLayers(tree)).toBe(4);
  });

  it("findLayerById / findLayerByPath 定位节点", () => {
    const button = findLayerByPath(tree, "0/1");
    expect(button?.name).toBe("按钮");
    expect(findLayerById(tree, button!.id)?.path).toBe("0/1");
    expect(findLayerById(tree, "missing")).toBeUndefined();
  });

  it("filterLayerTree 保留命中节点的祖先链", () => {
    const filtered = filterLayerTree(tree, "按钮");
    expect(filtered.map((layer) => layer.name)).toEqual(["页面"]);
    expect(filtered[0].children.map((layer) => layer.name)).toEqual(["按钮"]);
  });

  it("filterLayerTree 支持按类型标签搜索，空查询返回原树", () => {
    expect(filterLayerTree(tree, "文本").map((layer) => layer.name)).toEqual(["页面"]);
    expect(filterLayerTree(tree, "  ")).toBe(tree);
  });

  it("collectLayerPaths 与 kindBreakdown 汇总", () => {
    expect(collectLayerPaths(tree)).toEqual(["0", "0/0", "0/1", "1"]);
    expect(kindBreakdown(tree)).toEqual([
      { kind: "pixel", count: 2 },
      { kind: "group", count: 1 },
      { kind: "text", count: 1 },
    ]);
  });

  it("layerKindLabel 提供中文标签", () => {
    expect(layerKindLabel("smart-object")).toBe("智能对象");
    expect(layerKindLabel("unknown")).toBe("未知");
  });
});