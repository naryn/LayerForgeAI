import type { LayerBounds, LayerNode } from "./domain";
import { unionBounds } from "./layers";

export interface ComponentRoleInfo {
  role: string;
  label: string;
  basis: string;
  nameable: boolean;
}

export interface RoleContext {
  width: number;
  height: number;
}

const COMPONENT_PARENTS = new Set([
  "button",
  "input",
  "form-row",
  "checkbox-row",
  "badge",
  "badge-group",
  "icon-button",
  "card",
]);

function boundsOf(node: LayerNode): LayerBounds | undefined {
  if (node.kind === "group") {
    // PSD group rects arrive as 0x0 from the engine; child extents are the
    // only reliable geometry for role inference.
    const union = unionBounds(node.children);
    if (union && union.width > 0 && union.height > 0) return union;
  }
  return node.bounds;
}

function area(bounds: LayerBounds): number {
  return bounds.width * bounds.height;
}

function widthRatio(bounds: LayerBounds, context: RoleContext): number {
  return bounds.width / Math.max(1, context.width);
}

function heightRatio(bounds: LayerBounds, context: RoleContext): number {
  return bounds.height / Math.max(1, context.height);
}

function areaRatio(bounds: LayerBounds, context: RoleContext): number {
  return area(bounds) / Math.max(1, context.width * context.height);
}

function aspectRatio(bounds: LayerBounds): number {
  return bounds.width / Math.max(1, bounds.height);
}

function isSquareLike(bounds: LayerBounds): boolean {
  const longSide = Math.max(bounds.width, bounds.height);
  const shortSide = Math.max(1, Math.min(bounds.width, bounds.height));
  return longSide / shortSide <= 1.4;
}

function coversParent(bounds: LayerBounds, parent: LayerBounds | undefined): boolean {
  if (!parent) return false;
  const parentArea = area(parent);
  if (parentArea <= 0) return false;
  const overlapWidth =
    Math.min(bounds.x + bounds.width, parent.x + parent.width) - Math.max(bounds.x, parent.x);
  const overlapHeight =
    Math.min(bounds.y + bounds.height, parent.y + parent.height) - Math.max(bounds.y, parent.y);
  if (overlapWidth <= 0 || overlapHeight <= 0) return false;
  return (overlapWidth * overlapHeight) / parentArea >= 0.75;
}

function hasTextDescendant(node: LayerNode): boolean {
  return node.children.some(
    (child) => child.kind === "text" || (child.kind === "group" && hasTextDescendant(child)),
  );
}

function leafChildren(node: LayerNode): LayerNode[] {
  return node.children.filter(
    (child) =>
      child.kind !== "group" &&
      child.kind !== "text" &&
      child.kind !== "adjustment" &&
      child.bounds !== undefined,
  );
}

function smallSquareLeaf(node: LayerNode, context: RoleContext): LayerNode | undefined {
  return leafChildren(node).find((child) => {
    const bounds = child.bounds as LayerBounds;
    const maxSide = Math.max(bounds.width, bounds.height);
    return isSquareLike(bounds) && maxSide <= Math.max(48, Math.min(context.width, context.height) * 0.06);
  });
}

function textLeansLeft(node: LayerNode, group: LayerBounds): boolean {
  const texts = node.children.filter((child) => child.kind === "text" && child.bounds);
  if (texts.length !== 1) return false;
  const text = texts[0].bounds as LayerBounds;
  const leftGap = text.x - group.x;
  const rightGap = group.x + group.width - (text.x + text.width);
  return leftGap <= Math.max(8, group.height * 0.2) && rightGap >= Math.max(24, leftGap * 2.5);
}

function groupRole(
  node: LayerNode,
  bounds: LayerBounds,
  context: RoleContext,
  roles: Map<string, ComponentRoleInfo>,
): ComponentRoleInfo | null {
  const directTexts = node.children.filter((child) => child.kind === "text");
  const leaves = leafChildren(node);
  const textPresent = directTexts.length > 0 || hasTextDescendant(node);
  const aspect = aspectRatio(bounds);
  const heightShare = heightRatio(bounds, context);
  const share = areaRatio(bounds, context);

  const badgeChildren = node.children.filter(
    (child) => roles.get(child.path)?.role === "badge",
  ).length;
  if (badgeChildren >= 2) {
    return {
      role: "badge-group",
      label: "角标组",
      basis: `包含 ${badgeChildren} 个角标/图标组件`,
      nameable: true,
    };
  }

  if (textPresent && share <= 0.006 && heightShare <= 0.1 && aspect >= 0.5 && aspect <= 6) {
    return {
      role: "badge",
      label: "角标",
      basis: `小尺寸组件，占画布 ${(share * 100).toFixed(1)}%`,
      nameable: true,
    };
  }

  const iconChild = smallSquareLeaf(node, context);
  if (textPresent && iconChild) {
    return {
      role: "checkbox-row",
      label: "勾选行",
      basis: `小方形控件 ${iconChild.bounds?.width}×${iconChild.bounds?.height} 与文本同行`,
      nameable: true,
    };
  }

  if (directTexts.length >= 2 && leaves.length >= 2) {
    return {
      role: "form-row",
      label: "表单行",
      basis: `${directTexts.length} 个文本与 ${leaves.length} 个控件并排`,
      nameable: true,
    };
  }

  const background = leaves.find((child) => coversParent(child.bounds as LayerBounds, bounds));
  if (textPresent && background) {
    if (heightShare <= 0.12 && aspect >= 3 && textLeansLeft(node, bounds)) {
      return {
        role: "input",
        label: "输入框",
        basis: `横向 ${bounds.width}×${bounds.height}，文本靠左`,
        nameable: true,
      };
    }
    if (heightShare <= 0.2 && aspect >= 1.6) {
      return {
        role: "button",
        label: "按钮",
        basis: `文本+背景形状，横向 ${bounds.width}×${bounds.height}`,
        nameable: true,
      };
    }
  }

  if (!textPresent && node.children.length >= 1) {
    const maxSide = Math.max(bounds.width, bounds.height);
    if (
      isSquareLike(bounds) &&
      maxSide <= Math.min(context.width, context.height) * 0.15 &&
      share <= 0.02
    ) {
      return {
        role: "icon-button",
        label: "图标按钮",
        basis: `无文本方形控件组 ${bounds.width}×${bounds.height}`,
        nameable: true,
      };
    }
  }

  if (background && node.children.length >= 3 && share >= 0.03) {
    return {
      role: "card",
      label: "卡片",
      basis: `带背景的 ${node.children.length} 元素容器`,
      nameable: true,
    };
  }

  if (share >= 0.15 || node.children.length >= 5) {
    return {
      role: "section",
      label: "区块",
      basis: `页面级容器，包含 ${node.children.length} 个元素`,
      nameable: true,
    };
  }

  return null;
}

function leafRole(
  node: LayerNode,
  bounds: LayerBounds,
  context: RoleContext,
  parentRole: string | undefined,
  parentBounds: LayerBounds | undefined,
): ComponentRoleInfo | null {
  const share = areaRatio(bounds, context);
  const maxSide = Math.max(bounds.width, bounds.height);
  const scale = Math.min(context.width, context.height);
  const isBitmap = node.kind === "pixel" || node.kind === "smart-object";

  if (widthRatio(bounds, context) >= 0.85 && heightRatio(bounds, context) >= 0.6) {
    return {
      role: "background",
      label: "背景",
      basis: `覆盖画布 ${Math.round(widthRatio(bounds, context) * 100)}% 宽、${Math.round(
        heightRatio(bounds, context) * 100,
      )}% 高`,
      nameable: true,
    };
  }

  const insideComponent = parentRole !== undefined && COMPONENT_PARENTS.has(parentRole);
  if (insideComponent && coversParent(bounds, parentBounds)) {
    if (parentRole === "icon-button") {
      return {
        role: `${parentRole}-icon`,
        label: `${roleLabel(parentRole)}图形`,
        basis: "覆盖图标按钮边界的位图/形状",
        nameable: true,
      };
    }
    return {
      role: `${parentRole}-background`,
      label: `${roleLabel(parentRole)}背景`,
      basis: "覆盖组件边界的背景层",
      nameable: true,
    };
  }

  if (isBitmap) {
    if (share >= 0.05) {
      return { role: "image", label: "图片", basis: `大尺寸位图 ${bounds.width}×${bounds.height}`, nameable: true };
    }
    if (maxSide <= scale * 0.2) {
      const role = insideComponent ? `${parentRole}-icon` : "icon";
      return {
        role,
        label: insideComponent ? `${roleLabel(parentRole)}图标` : "图标",
        basis: `小尺寸位图 ${bounds.width}×${bounds.height}`,
        nameable: true,
      };
    }
    return { role: "image", label: "图片", basis: `位图 ${bounds.width}×${bounds.height}`, nameable: true };
  }

  if (node.kind === "shape") {
    if (Math.min(bounds.width, bounds.height) <= 3 || aspectRatio(bounds) >= 12) {
      return { role: "divider", label: "分隔线", basis: `细长形状 ${bounds.width}×${bounds.height}`, nameable: true };
    }
    if (maxSide <= Math.max(48, scale * 0.06) && isSquareLike(bounds)) {
      const role = insideComponent ? `${parentRole}-icon` : "icon";
      return {
        role,
        label: insideComponent ? `${roleLabel(parentRole)}图标` : "图标",
        basis: `小方形形状 ${bounds.width}×${bounds.height}`,
        nameable: true,
      };
    }
  }

  return null;
}

const ROLE_LABELS: Record<string, string> = {
  background: "背景",
  button: "按钮",
  input: "输入框",
  "form-row": "表单行",
  "checkbox-row": "勾选行",
  badge: "角标",
  "badge-group": "角标组",
  "icon-button": "图标按钮",
  icon: "图标",
  divider: "分隔线",
  image: "图片",
  card: "卡片",
  section: "区块",
};

export function roleLabel(role: string): string {
  if (ROLE_LABELS[role]) return ROLE_LABELS[role];
  if (role.endsWith("-background")) return `${roleLabel(role.slice(0, -11))}背景`;
  if (role.endsWith("-icon")) return `${roleLabel(role.slice(0, -5))}图标`;
  return role;
}

/**
 * Infers UI component roles from structure, size and hierarchy only. Layer
 * names and text content are deliberately never read here.
 */
export function inferComponentRoles(
  layers: LayerNode[],
  context: RoleContext,
): Map<string, ComponentRoleInfo> {
  const roles = new Map<string, ComponentRoleInfo>();

  const visit = (node: LayerNode, parentRole: string | undefined, parentBounds: LayerBounds | undefined): void => {
    const bounds = boundsOf(node);
    if (node.kind === "text") {
      roles.set(node.path, { role: "text", label: "文本", basis: "文本图层", nameable: false });
      return;
    }
    if (node.kind === "adjustment") {
      roles.set(node.path, { role: "adjustment", label: "调整层", basis: "调整图层", nameable: false });
      return;
    }
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      roles.set(node.path, { role: node.kind, label: roleLabel(node.kind), basis: "无有效边界", nameable: false });
      return;
    }

    let info: ComponentRoleInfo | null = null;
    if (node.kind === "group") {
      for (const child of node.children) {
        visit(child, undefined, bounds);
      }
      info = groupRole(node, bounds, context, roles);
      // Children were visited before the parent role is known; reclassify
      // leaves that need the parent role for the component-prefixed names.
      if (info && COMPONENT_PARENTS.has(info.role)) {
        for (const child of node.children) {
          if (child.kind === "group") continue;
          const childBounds = boundsOf(child);
          if (!childBounds) continue;
          const childInfo = leafRole(child, childBounds, context, info.role, bounds);
          if (childInfo) roles.set(child.path, childInfo);
        }
      }
    } else {
      info = leafRole(node, bounds, context, parentRole, parentBounds);
    }

    roles.set(node.path, info ?? { role: "shape", label: "图形", basis: "未识别为组件", nameable: false });
  };

  for (const layer of layers) visit(layer, undefined, undefined);
  return roles;
}
