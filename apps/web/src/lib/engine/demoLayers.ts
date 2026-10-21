import type { LayerBounds, LayerKind, LayerNode } from "../domain";

const SECTIONS = [
  "page_header",
  "hero_section",
  "feature_grid",
  "product_showcase",
  "sidebar_panel",
  "page_footer",
];

const ITEM_KINDS: LayerKind[] = ["pixel", "text", "shape", "pixel", "text"];

function bounds(left: number, top: number, width: number, height: number): LayerBounds {
  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/** Deterministic 132-node tree used only by the explicit demo engine. */
export function createDemoLayers(width = 1440, height = 900): LayerNode[] {
  const sectionHeight = height / SECTIONS.length;
  return SECTIONS.map((section, sectionIndex) => {
    const sectionPath = String(sectionIndex);
    const top = sectionIndex * sectionHeight;
    const children: LayerNode[] = [];

    const push = (
      name: string,
      kind: LayerKind,
      layerBounds: LayerBounds,
      extra: Partial<LayerNode> = {},
    ) => {
      const path = `${sectionPath}/${children.length}`;
      children.push({
        id: `demo-${path.replaceAll("/", "-")}`,
        name,
        path,
        kind,
        bounds: layerBounds,
        visible: true,
        locked: false,
        opacity: 100,
        children: [],
        ...extra,
      });
    };

    push(`${section}_background`, "pixel", bounds(0, top, width, sectionHeight));
    push(`${section}_title`, "text", bounds(64, top + 24, 420, 48), {
      meta: { hasText: true },
    });
    push(`${section}_subtitle`, "text", bounds(64, top + 80, 520, 28), {
      meta: { hasText: true },
    });

    for (let item = 1; item <= 14; item += 1) {
      const kind = ITEM_KINDS[(item + sectionIndex) % ITEM_KINDS.length];
      const column = (item - 1) % 4;
      const row = Math.floor((item - 1) / 4);
      push(`${section}_item_${String(item).padStart(2, "0")}`, kind, bounds(
        64 + column * 200,
        top + 128 + row * 92,
        168,
        kind === "text" ? 32 : 72,
      ), {
        ...(kind === "text" ? { meta: { hasText: true } } : {}),
        opacity: item === 7 ? 65 : 100,
        visible: item !== 12,
      });
    }

    const actionPath = `${sectionPath}/${children.length}`;
    const actionChildren: LayerNode[] = [0, 1].map((iconIndex) => {
      const path = `${actionPath}/${iconIndex}`;
      return {
        id: `demo-${path.replaceAll("/", "-")}`,
        name: `${section}_action_${iconIndex + 1}_icon`,
        path,
        kind: "shape" as const,
        bounds: bounds(width - 180 + iconIndex * 56, top + 32, 40, 40),
        visible: true,
        locked: false,
        opacity: 100,
        children: [],
      };
    });
    children.push({
      id: `demo-${actionPath.replaceAll("/", "-")}`,
      name: `${section}_actions`,
      path: actionPath,
      kind: "group",
      bounds: bounds(width - 196, top + 24, 132, 56),
      visible: true,
      locked: false,
      opacity: 100,
      children: actionChildren,
    });

    const layerBounds = bounds(0, top, width, sectionHeight);
    return {
      id: `demo-section-${sectionIndex}`,
      name: section,
      path: sectionPath,
      kind: "group" as const,
      bounds: layerBounds,
      visible: true,
      locked: false,
      opacity: 100,
      clipping: false,
      children,
    };
  });
}
