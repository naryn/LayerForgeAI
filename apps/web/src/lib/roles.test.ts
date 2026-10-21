import { describe, expect, it } from "vitest";
import { normalizeLocalLayers } from "./layers";
import { inferComponentRoles } from "./roles";

const CONTEXT = { width: 1440, height: 900 };

function rolesOf(layers: Parameters<typeof normalizeLocalLayers>[0]) {
  return inferComponentRoles(normalizeLocalLayers(layers), CONTEXT);
}

describe("inferComponentRoles · 叶子角色", () => {
  const roles = rolesOf([
    { name: "Layer 1", id: 1, left: 0, top: 0, right: 1440, bottom: 900 },
    { name: "Layer 2", id: 2, left: 100, top: 100, right: 420, bottom: 320 },
    { name: "Layer 3", id: 3, left: 100, top: 400, right: 124, bottom: 424 },
    { name: "Layer 4", id: 4, left: 100, top: 500, right: 500, bottom: 502, vectorFill: {} },
    { name: "Pay Now", id: 5, text: { text: "Pay Now" }, left: 100, top: 600, right: 200, bottom: 620 },
    { name: "Levels", id: 6, adjustment: {}, left: 0, top: 0, right: 10, bottom: 10 },
  ]);

  it("按边界区分背景、图片、图标与分隔线", () => {
    expect(roles.get("0")).toMatchObject({ role: "background", nameable: true });
    expect(roles.get("1")).toMatchObject({ role: "image", nameable: true });
    expect(roles.get("2")).toMatchObject({ role: "icon", nameable: true });
    expect(roles.get("3")).toMatchObject({ role: "divider", nameable: true });
  });

  it("文本与调整层不参与命名", () => {
    expect(roles.get("4")).toMatchObject({ role: "text", nameable: false });
    expect(roles.get("5")).toMatchObject({ role: "adjustment", nameable: false });
  });
});

describe("inferComponentRoles · 组件角色", () => {
  it("识别按钮并给子层组件前缀", () => {
    const roles = rolesOf([
      {
        name: "Pay Now 2",
        id: 10,
        children: [
          { name: "Rectangle 1", id: 11, left: 100, top: 600, right: 340, bottom: 656 },
          { name: "Layer 2", id: 12, text: { text: "Buy Now" }, left: 180, top: 620, right: 260, bottom: 636 },
        ],
      },
    ]);
    expect(roles.get("0")).toMatchObject({ role: "button", nameable: true });
    expect(roles.get("0/0")).toMatchObject({ role: "button-background", nameable: true });
    expect(roles.get("0/1")).toMatchObject({ role: "text", nameable: false });
  });

  it("识别横向输入框，背景层命名为 input-background", () => {
    const roles = rolesOf([
      {
        name: "Search 3",
        id: 20,
        children: [
          { name: "bg", id: 21, left: 100, top: 300, right: 700, bottom: 340 },
          { name: "txt", id: 22, text: { text: "Search" }, left: 106, top: 312, right: 306, bottom: 328 },
        ],
      },
    ]);
    expect(roles.get("0")).toMatchObject({ role: "input", nameable: true });
    expect(roles.get("0/0")).toMatchObject({ role: "input-background", nameable: true });
  });

  it("识别勾选行，方形小控件命名为 checkbox-row-icon", () => {
    const roles = rolesOf([
      {
        name: "agree 2",
        id: 30,
        children: [
          { name: "row bg", id: 31, left: 100, top: 700, right: 600, bottom: 740 },
          { name: "box", id: 32, left: 104, top: 710, right: 124, bottom: 730 },
          { name: "txt", id: 33, text: { text: "I agree" }, left: 130, top: 712, right: 250, bottom: 728 },
        ],
      },
    ]);
    expect(roles.get("0")).toMatchObject({ role: "checkbox-row", nameable: true });
    expect(roles.get("0/0")).toMatchObject({ role: "checkbox-row-background" });
    expect(roles.get("0/1")).toMatchObject({ role: "checkbox-row-icon" });
  });

  it("紧凑文本组件优先识别为角标", () => {
    const roles = rolesOf([
      {
        name: "badge 9",
        id: 40,
        children: [
          { name: "bg", id: 41, left: 1340, top: 10, right: 1440, bottom: 38 },
          { name: "txt", id: 42, text: { text: "NEW" }, left: 1350, top: 18, right: 1400, bottom: 30 },
        ],
      },
    ]);
    expect(roles.get("0")).toMatchObject({ role: "badge", nameable: true });
    expect(roles.get("0/0")).toMatchObject({ role: "badge-background" });
  });

  it("包含多个角标的组识别为角标组", () => {
    const roles = rolesOf([
      {
        name: "Group 12",
        id: 50,
        children: [
          {
            name: "A",
            id: 51,
            children: [
              { name: "bg", id: 52, left: 1240, top: 10, right: 1335, bottom: 38 },
              { name: "txt", id: 53, text: { text: "NEW" }, left: 1250, top: 18, right: 1290, bottom: 30 },
            ],
          },
          {
            name: "B",
            id: 54,
            children: [
              { name: "bg", id: 55, left: 1345, top: 10, right: 1440, bottom: 38 },
              { name: "txt", id: 56, text: { text: "HOT" }, left: 1355, top: 18, right: 1395, bottom: 30 },
            ],
          },
        ],
      },
    ]);
    expect(roles.get("0")).toMatchObject({ role: "badge-group", nameable: true });
    expect(roles.get("0/0")).toMatchObject({ role: "badge" });
    expect(roles.get("0/1")).toMatchObject({ role: "badge" });
  });

  it("无文本方形控件组识别为图标按钮", () => {
    const roles = rolesOf([
      {
        name: "icon btn",
        id: 60,
        children: [{ name: "glyph", id: 61, left: 100, top: 100, right: 148, bottom: 148 }],
      },
    ]);
    expect(roles.get("0")).toMatchObject({ role: "icon-button", nameable: true });
    expect(roles.get("0/0")).toMatchObject({ role: "icon-button-icon" });
  });

  it("带背景的多元素容器识别为卡片", () => {
    const roles = rolesOf([
      {
        name: "Card 5",
        id: 70,
        children: [
          { name: "bg", id: 71, left: 100, top: 200, right: 600, bottom: 500 },
          { name: "img", id: 72, left: 120, top: 220, right: 240, bottom: 300 },
          { name: "txt", id: 73, text: { text: "Title" }, left: 260, top: 220, right: 420, bottom: 240 },
          { name: "body", id: 74, left: 260, top: 250, right: 420, bottom: 330 },
        ],
      },
    ]);
    expect(roles.get("0")).toMatchObject({ role: "card", nameable: true });
    expect(roles.get("0/0")).toMatchObject({ role: "card-background" });
  });

  it("大尺寸无背景容器识别为区块", () => {
    const roles = rolesOf([
      {
        name: "Grid",
        id: 80,
        children: [
          { name: "a", id: 81, left: 0, top: 0, right: 200, bottom: 100 },
          { name: "b", id: 82, left: 200, top: 0, right: 400, bottom: 100 },
          { name: "c", id: 83, left: 400, top: 0, right: 600, bottom: 100 },
          { name: "d", id: 84, left: 0, top: 100, right: 200, bottom: 200 },
          { name: "e", id: 85, left: 200, top: 100, right: 400, bottom: 200 },
          { name: "f", id: 86, left: 400, top: 100, right: 600, bottom: 200 },
        ],
      },
    ]);
    expect(roles.get("0")).toMatchObject({ role: "section", nameable: true });
  });
});
