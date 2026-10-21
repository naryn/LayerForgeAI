import type {
  DocumentSnapshot,
  EngineMode,
  LayerBounds,
  LayerKind,
  LayerNode,
  ProjectRecord,
} from "./domain";
import { downloadJson, sanitizeFileName } from "./format";
import { inferComponentLayout, type ComponentLayoutHint } from "./layout";
import { flattenLayers, layerKindLabel, unionBounds } from "./layers";
import {
  inferComponentRoles,
  roleLabel,
  type ComponentRoleInfo,
  type RoleContext,
} from "./roles";

const MAX_RENAME_LENGTH = 120;
const MIN_SLICE_SIZE = 4;
const MIN_MERGE_CHILDREN = 2;
const MERGE_MAX_AREA_RATIO = 0.08;
const MERGE_MAX_COMPACTNESS = 3.5;
const MIN_GROUPING_CHILDREN = 4;
const FULL_BLEED_RATIO = 0.85;
const GROUPING_GAP_RATIO = 0.015;
const COPY_SUFFIX = /[\s._-]*(?:\(|\[)?(?:副本|拷贝|copy)(?:\)|\])?(?:[\s._-]*\d+)?$/i;
const GENERIC_NAME =
  /^(?:图层组|图层|组|矩形|形状|椭圆|文本|文字|图像|图片|智能对象|路径|layers?|groups?|layer group|rectangles?|rect|shapes?|ellipses?|texts?|text|images?|smart objects?|paths?)[\s._-]*\d*$/i;
const SLICE_GROUP_ROLES = new Set([
  "button",
  "input",
  "form-row",
  "checkbox-row",
  "badge",
  "badge-group",
  "icon-button",
  "card",
]);
const MERGE_COMPONENT_ROLES = new Set([
  "button",
  "input",
  "form-row",
  "checkbox-row",
  "icon-button",
  "card",
]);

export type CleanupRuleId =
  | "normalize-name"
  | "duplicate-name"
  | "generic-name"
  | "empty-group"
  | "single-child-group"
  | "group-cluster"
  | "slice-candidate";

export interface CleanupFinding {
  id: string;
  rule: CleanupRuleId;
  severity: "info" | "warn";
  path: string | null;
  message: string;
}

export interface CleanupRename {
  path: string;
  layerId: string;
  originalName: string;
  newName: string;
  role?: string;
  reason: string;
}

export interface CleanupGroupSuggestion {
  id: string;
  parentPath: string | null;
  parentName: string | null;
  memberPaths: string[];
  memberNames: string[];
  bounds: LayerBounds;
  layout: ComponentLayoutHint;
  suggestedName: string;
  reason: string;
}

export type CleanupMergeKind = "badge" | "component";

export interface CleanupMergeCandidate {
  id: string;
  path: string;
  parentPath: string | null;
  name: string;
  suggestedName: string;
  kind: CleanupMergeKind;
  memberPaths: string[];
  memberNames: string[];
  bounds: LayerBounds;
  layout: ComponentLayoutHint;
  areaRatio: number;
  reason: string;
}

export interface CleanupSliceCandidate {
  path: string;
  layerId: string;
  name: string;
  kind: LayerKind;
  bounds: LayerBounds;
  fileName: string;
  formats: string[];
  scales: number[];
  reason: string;
}

export interface CleanupSummary {
  nodes: number;
  renames: number;
  findings: number;
  groups: number;
  merges: number;
  slices: number;
  duplicateNames: number;
  genericNames: number;
  emptyGroups: number;
  singleChildGroups: number;
}

export interface CleanupReport {
  generatedAt: string;
  document: { width: number; height: number };
  summary: CleanupSummary;
  renames: CleanupRename[];
  findings: CleanupFinding[];
  groups: CleanupGroupSuggestion[];
  mergeCandidates: CleanupMergeCandidate[];
  slices: CleanupSliceCandidate[];
}

interface NormalizedDetails {
  value: string;
  copyRemoved: boolean;
  separatorsChanged: boolean;
  caseChanged: boolean;
}

function normalizeNameDetails(input: string): NormalizedDetails {
  let value = input.normalize("NFKC").trim();
  const original = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = value.replace(COPY_SUFFIX, "").trim();
    if (next === value) break;
    value = next;
  }
  const copyRemoved = value !== original;
  const beforeSeparators = value;
  value = value
    .replace(/[\\/]+/g, "-")
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/-{2,}/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");
  const separatorsChanged = value !== beforeSeparators;
  const beforeCase = value;
  value = value.replace(/[A-Z]+/g, (match) => match.toLowerCase());
  const caseChanged = value !== beforeCase;
  if (!value) return { value: input.trim(), copyRemoved, separatorsChanged, caseChanged };
  value = value.slice(0, MAX_RENAME_LENGTH).replace(/[-._]+$/g, "");
  return { value, copyRemoved, separatorsChanged, caseChanged };
}

export function normalizeLayerName(input: string): string {
  return normalizeNameDetails(input).value;
}

export function isGenericLayerName(input: string): boolean {
  return GENERIC_NAME.test(input.normalize("NFKC").trim());
}

function boundsArea(bounds: LayerBounds): number {
  return bounds.width * bounds.height;
}

function documentBounds(width: number, height: number): LayerBounds {
  return { x: 0, y: 0, width, height };
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function expandBounds(bounds: LayerBounds, gap: number): Box {
  return {
    left: bounds.x - gap,
    top: bounds.y - gap,
    right: bounds.x + bounds.width + gap,
    bottom: bounds.y + bounds.height + gap,
  };
}

function boxesIntersect(a: Box, b: Box): boolean {
  return a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;
}

function slugify(name: string): string {
  return (
    normalizeLayerName(name)
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 80) || "layer"
  );
}

function isAssetLeaf(node: LayerNode): boolean {
  return (
    node.children.length === 0 &&
    (node.kind === "pixel" || node.kind === "shape" || node.kind === "smart-object")
  );
}

function isAssetGroup(role: string | undefined): boolean {
  return role !== undefined && SLICE_GROUP_ROLES.has(role);
}

function uniqueRoleName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  const name = `${base}-${suffix}`;
  used.add(name);
  return name;
}

function inferClusterRole(
  members: LayerNode[],
  bounds: LayerBounds,
  context: RoleContext,
): ComponentRoleInfo | null {
  const synthetic: LayerNode = {
    id: "__cluster__",
    name: "__cluster__",
    path: "__cluster__",
    kind: "group",
    bounds,
    visible: true,
    locked: false,
    opacity: 100,
    children: members,
  };
  return inferComponentRoles([synthetic], context).get(synthetic.path) ?? null;
}

export interface CleanupInput {
  layers: LayerNode[];
  width: number;
  height: number;
  now?: Date;
}

export function analyzeLayers(input: CleanupInput): CleanupReport {
  const width = Math.max(1, Math.round(input.width || 1));
  const height = Math.max(1, Math.round(input.height || 1));
  const context: RoleContext = { width, height };
  const roles = inferComponentRoles(input.layers, context);
  const doc = documentBounds(width, height);
  const docArea = boundsArea(doc);
  const findings: CleanupFinding[] = [];
  const renames: CleanupRename[] = [];
  const groups: CleanupGroupSuggestion[] = [];
  const mergeCandidates: CleanupMergeCandidate[] = [];
  const mergeRoots = new Set<string>();
  const mergeNameScopes = new Map<string, Set<string>>();
  const sliceCandidates: CleanupSliceCandidate[] = [];
  let findingSeq = 0;

  const addFinding = (
    rule: CleanupRuleId,
    path: string | null,
    message: string,
    severity: CleanupFinding["severity"] = "info",
  ): void => {
    findings.push({ id: `finding-${findingSeq}`, rule, severity, path, message });
    findingSeq += 1;
  };

  const insideNamedComponent = (path: string): boolean => {
    let prefix = path;
    while (prefix.includes("/")) {
      prefix = prefix.slice(0, prefix.lastIndexOf("/"));
      if (roles.get(prefix)?.nameable) return true;
    }
    return false;
  };

  const collectRenames = (nodes: LayerNode[]): void => {
    const used = new Set<string>();
    const targets = new Map<string, string>();
    for (const node of nodes) {
      const info = roles.get(node.path);
      if (!info?.nameable) used.add(normalizeLayerName(node.name));
    }
    for (const node of nodes) {
      const info = roles.get(node.path);
      if (!info?.nameable) continue;
      const newName = uniqueRoleName(info.role, used);
      targets.set(node.path, newName);
      if (newName === node.name) continue;
      renames.push({
        path: node.path,
        layerId: node.id,
        originalName: node.name,
        newName,
        role: info.role,
        reason: `结构角色：${info.label} · ${info.basis}`,
      });
    }

    const byName = new Map<string, LayerNode[]>();
    for (const node of nodes) {
      const key = normalizeLayerName(node.name);
      const list = byName.get(key) ?? [];
      list.push(node);
      byName.set(key, list);
    }
    for (const duplicates of byName.values()) {
      for (const node of duplicates.slice(1)) {
        if (node.kind === "text" && insideNamedComponent(node.path)) continue;
        const target = targets.get(node.path);
        addFinding(
          "duplicate-name",
          node.path,
          target
            ? `与同级图层重名；已按结构角色建议改为 ${target}`
            : "与同级图层重名；结构未能推断角色，保留原名待复核",
          "warn",
        );
      }
    }

    for (const node of nodes) {
      if (roles.get(node.path)?.nameable) continue;
      if (node.kind === "text" && insideNamedComponent(node.path)) continue;
      if (isGenericLayerName(node.name)) {
        addFinding(
          "generic-name",
          node.path,
          `“${node.name}”是通用名称；结构未能推断角色，保留原名待复核`,
        );
      }
    }

    for (const node of nodes) collectRenames(node.children);
  };

  const suggestGrouping = (
    parent: LayerNode | null,
    children: LayerNode[],
    parentBounds: LayerBounds,
  ): void => {
    if (children.length < MIN_GROUPING_CHILDREN) return;
    const parentArea = Math.max(1, boundsArea(parentBounds));
    const candidates = children.filter(
      (child) =>
        child.kind !== "group" &&
        child.kind !== "adjustment" &&
        child.visible &&
        child.bounds &&
        (child.bounds.width >= 2 || child.bounds.height >= 2) &&
        boundsArea(child.bounds) <= parentArea * 0.8,
    );
    if (candidates.length < 2) return;
    if (parent && candidates.length === children.length) return;

    const gap = Math.min(24, Math.max(4, Math.round(Math.min(width, height) * GROUPING_GAP_RATIO)));
    const boxes = candidates.map((child) => expandBounds(child.bounds as LayerBounds, gap));
    const roots = candidates.map((_, index) => index);
    const find = (index: number): number => {
      let current = index;
      while (roots[current] !== current) {
        roots[current] = roots[roots[current]];
        current = roots[current];
      }
      return current;
    };
    for (let a = 0; a < boxes.length; a += 1) {
      for (let b = a + 1; b < boxes.length; b += 1) {
        if (!boxesIntersect(boxes[a], boxes[b])) continue;
        const rootA = find(a);
        const rootB = find(b);
        if (rootA !== rootB) roots[rootB] = rootA;
      }
    }
    const clusters = new Map<number, LayerNode[]>();
    for (let index = 0; index < candidates.length; index += 1) {
      const root = find(index);
      const list = clusters.get(root) ?? [];
      list.push(candidates[index]);
      clusters.set(root, list);
    }

    const orderedClusters = [...clusters.values()]
      .filter((members) => members.length >= 2)
      .sort((a, b) => a[0].path.localeCompare(b[0].path));
    const clusteredPaths = new Set(orderedClusters.flatMap((members) => members.map((m) => m.path)));
    const usedNames = new Set(
      children
        .filter((child) => !clusteredPaths.has(child.path))
        .map((child) => normalizeLayerName(child.name)),
    );

    for (const members of orderedClusters) {
      const bounds = unionBounds(members) ?? parentBounds;
      const layout = inferComponentLayout(members);
      const roleInfo = inferClusterRole(members, bounds, context);
      const base = roleInfo?.nameable ? roleInfo.role : `${layout.direction}-cluster`;
      const suggestedName = uniqueRoleName(base, usedNames);
      groups.push({
        id: `group:${parent?.path ?? "root"}:${members.map((member) => member.path).join("+")}`,
        parentPath: parent?.path ?? null,
        parentName: parent?.name ?? null,
        memberPaths: members.map((member) => member.path),
        memberNames: members.map((member) => member.name),
        bounds,
        layout,
        suggestedName,
        reason: roleInfo?.nameable
          ? `${members.length} 个同级图层边界相邻且未编组；结构角色：${roleInfo.label}（${roleInfo.basis}）`
          : `${members.length} 个同级图层边界相邻且未编组；按边界聚类为${layout.direction === "row" ? "横向" : layout.direction === "column" ? "纵向" : "叠加"}布局`,
      });
    }
  };

  const nestedInMerge = (path: string): boolean => {
    let prefix = path;
    while (prefix.includes("/")) {
      prefix = prefix.slice(0, prefix.lastIndexOf("/"));
      if (mergeRoots.has(prefix)) return true;
    }
    return false;
  };

  const suggestMerge = (node: LayerNode, parent: LayerNode | null): void => {
    if (nestedInMerge(node.path) || mergeRoots.has(node.path)) return;
    const members = node.children.filter(
      (child) => child.visible && child.bounds && boundsArea(child.bounds) > 0,
    );
    if (members.length < MIN_MERGE_CHILDREN) return;
    const union = unionBounds(members);
    if (!union) return;
    const unionArea = boundsArea(union);
    const memberArea = members.reduce((sum, child) => sum + boundsArea(child.bounds as LayerBounds), 0);
    const compactness = memberArea > 0 ? unionArea / memberArea : Number.POSITIVE_INFINITY;
    const areaRatio = unionArea / docArea;
    if (areaRatio > MERGE_MAX_AREA_RATIO || compactness > MERGE_MAX_COMPACTNESS) return;

    const info = roles.get(node.path);
    const role = info?.nameable ? info.role : undefined;
    const badgeSignal = role === "badge" || role === "badge-group";
    const componentSignal = role !== undefined && MERGE_COMPONENT_ROLES.has(role);
    const descendants = flattenLayers(node.children);
    const hasText = descendants.some((child) => child.kind === "text");
    if (!hasText && !badgeSignal && !componentSignal) return;

    const scopeKey = node.path.includes("/")
      ? node.path.slice(0, node.path.lastIndexOf("/"))
      : "__root__";
    let scope = mergeNameScopes.get(scopeKey);
    if (!scope) {
      const siblings = parent?.children ?? input.layers;
      scope = new Set(
        siblings
          .filter((sibling) => sibling.path !== node.path)
          .map((sibling) => normalizeLayerName(sibling.name)),
      );
      mergeNameScopes.set(scopeKey, scope);
    }
    const base = (badgeSignal || componentSignal) && role ? role : "component";
    const suggestedName = uniqueRoleName(`${base}-merged`, scope);
    const structure = info?.nameable
      ? `结构角色：${roleLabel(info.role)}（${info.basis}）`
      : "子层包含文本且边界紧凑";
    mergeRoots.add(node.path);
    mergeCandidates.push({
      id: `merge:${node.path}`,
      path: node.path,
      parentPath: node.path.includes("/") ? node.path.slice(0, node.path.lastIndexOf("/")) : null,
      name: node.name,
      suggestedName,
      kind: badgeSignal ? "badge" : "component",
      memberPaths: members.map((member) => member.path),
      memberNames: members.map((member) => member.name),
      bounds: union,
      layout: inferComponentLayout(members),
      areaRatio: Math.round(areaRatio * 1000) / 1000,
      reason: `${members.length} 个可见子图层集中在 ${union.width}×${union.height} 区域（占画布 ${(areaRatio * 100).toFixed(1)}%），${structure}；建议合并为单层素材`,
    });
  };

  const visit = (
    nodes: LayerNode[],
    parent: LayerNode | null,
    parentVisible: boolean,
    inheritedBounds: LayerBounds,
  ): void => {
    if (parentVisible) suggestGrouping(parent, nodes, parent?.bounds ?? inheritedBounds);

    for (const node of nodes) {
      const effectiveVisible = parentVisible && node.visible;
      if (node.kind === "group" && node.children.length === 0) {
        addFinding("empty-group", node.path, "空组；确认后可在编辑器中删除", "warn");
      }
      if (node.kind === "group" && node.children.length === 1) {
        addFinding(
          "single-child-group",
          node.path,
          `仅含 1 个子图层（${node.children[0].name}），可考虑解组以减少层级`,
        );
      }

      const ownBounds =
        node.bounds && node.bounds.width > 0 && node.bounds.height > 0
          ? node.bounds
          : undefined;
      const sliceBounds =
        ownBounds ?? (node.kind === "group" ? unionBounds(node.children) : undefined);
      const roleInfo = roles.get(node.path);
      const assetCandidate =
        isAssetLeaf(node) || (node.kind === "group" && isAssetGroup(roleInfo?.role));
      if (
        effectiveVisible &&
        assetCandidate &&
        sliceBounds &&
        !(node.clipping === true && node.children.length === 0) &&
        roleInfo?.role !== "background" &&
        sliceBounds.width >= MIN_SLICE_SIZE &&
        sliceBounds.height >= MIN_SLICE_SIZE &&
        boundsArea(sliceBounds) <= docArea * FULL_BLEED_RATIO
      ) {
        const roleText = roleInfo?.nameable ? `结构角色 ${roleLabel(roleInfo.role)}，` : "";
        sliceCandidates.push({
          path: node.path,
          layerId: node.id,
          name: node.name,
          kind: node.kind,
          bounds: sliceBounds,
          fileName: "",
          formats: ["png"],
          scales: [1, 2],
          reason:
            node.kind === "group"
              ? `${roleText}边界 ${sliceBounds.width}×${sliceBounds.height} 的组件组`
              : `${roleText}可见${layerKindLabel(node.kind)}图层，边界 ${sliceBounds.width}×${sliceBounds.height}`,
        });
      }

      if (effectiveVisible && node.kind === "group") suggestMerge(node, parent);

      if (node.children.length > 0) {
        visit(
          node.children,
          node,
          effectiveVisible,
          sliceBounds ?? inheritedBounds,
        );
      }
    }
  };

  collectRenames(input.layers);
  visit(input.layers, null, true, doc);

  sliceCandidates.sort(
    (a, b) =>
      boundsArea(b.bounds) - boundsArea(a.bounds) || a.path.localeCompare(b.path),
  );
  const usedFileNames = new Map<string, number>();
  const slices = sliceCandidates.map((candidate) => {
    const slug = slugify(candidate.name);
    const seen = usedFileNames.get(slug) ?? 0;
    usedFileNames.set(slug, seen + 1);
    return {
      ...candidate,
      fileName: `${seen === 0 ? slug : `${slug}-${seen + 1}`}.png`,
    };
  });

  mergeCandidates.sort((a, b) => a.path.localeCompare(b.path));

  const countRule = (rule: CleanupRuleId): number =>
    findings.filter((finding) => finding.rule === rule).length;

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    document: { width, height },
    summary: {
      nodes: flattenLayers(input.layers).length,
      renames: renames.length,
      findings: findings.length,
      groups: groups.length,
      merges: mergeCandidates.length,
      slices: slices.length,
      duplicateNames: countRule("duplicate-name"),
      genericNames: countRule("generic-name"),
      emptyGroups: countRule("empty-group"),
      singleChildGroups: countRule("single-child-group"),
    },
    renames,
    findings,
    groups,
    mergeCandidates,
    slices,
  };
}

export interface AssetManifestOutput {
  fileName: string;
  scale: number;
  width: number;
  height: number;
}

export interface AssetManifestEntry {
  id: string;
  name: string;
  sourcePath: string;
  sourceLayerId: string;
  kind: LayerKind;
  bounds: LayerBounds;
  formats: string[];
  scales: number[];
  outputs: AssetManifestOutput[];
  status: "candidate";
}

export interface AssetManifest {
  schema: "layerforge.asset-manifest.draft";
  schemaVersion: "0.1.0";
  generatedAt: string;
  status: {
    validated: false;
    pixels: "not-generated";
    note: string;
  };
  project: { id: string; name: string };
  source: {
    fileName: string;
    sha256: string;
    width: number;
    height: number;
    depth: number;
    colorMode: string;
  };
  document: {
    engine: EngineMode;
    documentId: string;
    revision: string;
  };
  assets: AssetManifestEntry[];
  notes: string[];
}

export function buildAssetManifest(options: {
  project: ProjectRecord;
  snapshot: DocumentSnapshot;
  engine: EngineMode;
  report: CleanupReport;
  now?: Date;
}): AssetManifest {
  const { project, snapshot, engine, report } = options;
  return {
    schema: "layerforge.asset-manifest.draft",
    schemaVersion: "0.1.0",
    generatedAt: (options.now ?? new Date()).toISOString(),
    status: {
      validated: false,
      pixels: "not-generated",
      note: "Rule-based slice candidates. No pixel files were produced.",
    },
    project: { id: project.id, name: project.name },
    source: {
      fileName: project.source.fileName,
      sha256: project.source.sha256,
      width: project.source.width,
      height: project.source.height,
      depth: project.source.depth,
      colorMode: project.source.colorModeLabel,
    },
    document: {
      engine,
      documentId: snapshot.documentId,
      revision: snapshot.revision,
    },
    assets: report.slices.map((slice) => {
      const stem = slice.fileName.replace(/\.png$/i, "");
      return {
        id: `asset:${slice.path}`,
        name: slice.name,
        sourcePath: slice.path,
        sourceLayerId: slice.layerId,
        kind: slice.kind,
        bounds: slice.bounds,
        formats: slice.formats,
        scales: slice.scales,
        outputs: slice.scales.map((scale) => ({
          fileName: scale === 1 ? slice.fileName : `${stem}@${scale}x.png`,
          scale,
          width: Math.max(1, Math.round(slice.bounds.width * scale)),
          height: Math.max(1, Math.round(slice.bounds.height * scale)),
        })),
        status: "candidate" as const,
      };
    }),
    notes: [
      "切图候选由本地规则生成，未执行逐图层渲染；当前 Patchy 协议只提供整文档预览。",
      "编组与合并建议需经可写引擎执行并另存重开；本清单只记录候选，不代表已写入 PSD。",
      "本清单不能作为 Photoshop 兼容性或资产交付证据。",
    ],
  };
}

export function assetManifestFileName(project: ProjectRecord): string {
  return `${sanitizeFileName(project.name)}-assets.json`;
}

export function downloadAssetManifest(manifest: AssetManifest, fileName: string): void {
  downloadJson(manifest, fileName);
}
