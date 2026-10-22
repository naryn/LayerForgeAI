import type { LayerBounds, LayerKind, LayerNode, ProjectRecord } from "./domain";
import {
  isGenericLayerName,
  normalizeLayerName,
  type CleanupMergeCandidate,
  type CleanupReport,
} from "./cleanup";
import { inferComponentLayout, type ComponentLayoutHint } from "./layout";
import { flattenLayers, unionBounds } from "./layers";

export const AI_NAMING_REQUEST_SCHEMA = "layerforge.ai-naming.request" as const;
export const AI_NAMING_RESPONSE_SCHEMA = "layerforge.ai-naming.response" as const;
export const AI_NAMING_SCHEMA_VERSION = "0.2.0" as const;
export const AI_NAMING_LEGACY_SCHEMA_VERSION = "0.1.0" as const;
export const AI_NAMING_NAME_MAX_LENGTH = 80;

const MAX_OUTLINE_NODES = 500;
const MAX_CONTEXT_NAMES = 12;
const MAX_TEXT_SAMPLES = 3;
const MAX_TEXT_SAMPLE_LENGTH = 48;

export interface AiNamingCandidate {
  path: string;
  layerId: string;
  currentName: string;
  kind: LayerKind;
  bounds: LayerBounds | null;
  visible: boolean;
  parentPath: string | null;
  parentName: string | null;
  siblingIndex: number;
  siblingCount: number;
  siblingNames: string[];
  childNames: string[];
  textSamples: string[];
  layout?: ComponentLayoutHint;
  reasons: string[];
}

export interface AiMergeCandidate {
  path: string;
  kind: "badge" | "component";
  suggestedName: string;
  bounds: LayerBounds;
  areaRatio: number;
  layout: ComponentLayoutHint;
  memberCount: number;
  memberKinds: Array<{ kind: LayerKind; count: number }>;
  textDescendantCount: number;
  nestedGroupCount: number;
  reason: string;
}

export interface AiNamingTask {
  schema: typeof AI_NAMING_REQUEST_SCHEMA;
  schemaVersion: typeof AI_NAMING_SCHEMA_VERSION;
  generatedAt: string;
  project: {
    name: string;
    sourceFileName: string;
    width: number;
    height: number;
    layerCount: number;
  };
  candidates: AiNamingCandidate[];
  mergeCandidates: AiMergeCandidate[];
  outline: string;
}

export interface AiNamingAcceptedRename {
  path: string;
  layerId: string;
  originalName: string;
  newName: string;
  reason: string;
}

export interface AiNamingRejectedRename {
  path: string;
  newName: string;
  originalName?: string;
  reason: string;
}

export type AiMergeDecision = "merge" | "keep";

export interface AiMergeReview {
  path: string;
  layerId: string;
  decision: AiMergeDecision;
  suggestedName: string;
  name?: string;
  reason: string;
}

export interface AiMergeRejected {
  path: string;
  decision?: string;
  name?: string;
  reason: string;
}

export interface AiNamingParseResult {
  accepted: AiNamingAcceptedRename[];
  rejected: AiNamingRejectedRename[];
  mergeReviews: AiMergeReview[];
  rejectedMerges: AiMergeRejected[];
}

export interface AiNamingParseOptions {
  candidates: AiNamingCandidate[];
  layers: LayerNode[];
  mergeCandidates?: AiMergeCandidate[];
}

interface CandidateDraft {
  path: string;
  newName: string;
  reason: string;
  normalized: string;
}

function compact(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function textSamplesOf(node: LayerNode): string[] {
  const samples: string[] = [];
  const visit = (current: LayerNode): void => {
    if (samples.length >= MAX_TEXT_SAMPLES) return;
    if (current.kind === "text" && typeof current.meta?.text === "string") {
      const text = compact(current.meta.text, MAX_TEXT_SAMPLE_LENGTH);
      if (text) samples.push(text);
    }
    for (const child of current.children) visit(child);
  };
  if (node.kind !== "text") {
    for (const child of node.children) visit(child);
  } else {
    visit(node);
  }
  return samples;
}

function effectiveBounds(node: LayerNode): LayerBounds | null {
  if (node.bounds && node.bounds.width > 0 && node.bounds.height > 0) return node.bounds;
  if (node.kind === "group") {
    const union = unionBounds(node.children);
    if (union && union.width > 0 && union.height > 0) return union;
  }
  return null;
}

function candidateFor(
  node: LayerNode,
  parent: LayerNode | null,
  siblings: LayerNode[],
  index: number,
  duplicate: boolean,
): AiNamingCandidate {
  const bounds = effectiveBounds(node);
  const layout =
    node.kind === "group" && node.children.length >= 2
      ? inferComponentLayout(node.children)
      : undefined;
  const reasons = ["通用名称"];
  if (duplicate) reasons.push("同级重名");
  return {
    path: node.path,
    layerId: node.id,
    currentName: node.name,
    kind: node.kind,
    bounds,
    visible: node.visible,
    parentPath: parent?.path ?? null,
    parentName: parent?.name ?? null,
    siblingIndex: index + 1,
    siblingCount: siblings.length,
    siblingNames: siblings
      .filter((sibling) => sibling.path !== node.path)
      .slice(0, MAX_CONTEXT_NAMES)
      .map((sibling) => sibling.name),
    childNames: node.children
      .slice(0, MAX_CONTEXT_NAMES)
      .map((child) => child.name),
    textSamples: textSamplesOf(node),
    ...(layout ? { layout } : {}),
    reasons,
  };
}

export function collectAiNamingCandidates(options: {
  layers: LayerNode[];
  report?: CleanupReport | null;
}): AiNamingCandidate[] {
  const autoRenamed = new Set(options.report?.renames.map((rename) => rename.path) ?? []);
  const candidates: AiNamingCandidate[] = [];
  const walk = (nodes: LayerNode[], parent: LayerNode | null): void => {
    const counts = new Map<string, number>();
    for (const node of nodes) {
      const key = normalizeLayerName(node.name).toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    nodes.forEach((node, index) => {
      const normalized = normalizeLayerName(node.name);
      const generic = isGenericLayerName(node.name) || isGenericLayerName(normalized);
      const duplicate = (counts.get(normalized.toLowerCase()) ?? 0) > 1;
      if (generic && !autoRenamed.has(node.path)) {
        candidates.push(candidateFor(node, parent, nodes, index, duplicate));
      }
      walk(node.children, node);
    });
  };
  walk(options.layers, null);
  return candidates;
}

function memberKindStats(members: LayerNode[]): {
  memberKinds: Array<{ kind: LayerKind; count: number }>;
  textDescendantCount: number;
  nestedGroupCount: number;
} {
  const counts = new Map<LayerKind, number>();
  let textDescendantCount = 0;
  let nestedGroupCount = 0;
  for (const member of members) {
    for (const node of flattenLayers([member])) {
      if (node.kind === "text") textDescendantCount += 1;
      if (node.kind === "group") nestedGroupCount += 1;
      counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
    }
  }
  return {
    memberKinds: [...counts.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((left, right) => right.count - left.count || left.kind.localeCompare(right.kind)),
    textDescendantCount,
    nestedGroupCount,
  };
}

export function toAiMergeCandidates(
  candidates: CleanupMergeCandidate[],
  layers: LayerNode[],
): AiMergeCandidate[] {
  const byPath = new Map(flattenLayers(layers).map((node) => [node.path, node]));
  return candidates.map((candidate) => {
    const members = candidate.memberPaths
      .map((path) => byPath.get(path))
      .filter((node): node is LayerNode => node !== undefined);
    const stats = memberKindStats(members);
    return {
      path: candidate.path,
      kind: candidate.kind,
      suggestedName: candidate.suggestedName,
      bounds: candidate.bounds,
      areaRatio: candidate.areaRatio,
      layout: candidate.layout,
      memberCount: members.length,
      ...stats,
      reason: candidate.reason,
    };
  });
}

function outlineOf(layers: LayerNode[]): string {
  const lines: string[] = [];
  let shown = 0;
  let total = 0;
  const visit = (nodes: LayerNode[], depth: number): void => {
    for (const node of nodes) {
      total += 1;
      if (shown < MAX_OUTLINE_NODES) {
        const indent = "  ".repeat(depth);
        const text =
          node.kind === "text" && typeof node.meta?.text === "string"
            ? ` — "${compact(node.meta.text, MAX_TEXT_SAMPLE_LENGTH)}"`
            : node.children.length > 0
              ? ` (${node.children.length} 子层)`
              : "";
        lines.push(`${indent}- ${node.path} [${node.kind}] "${compact(node.name, 80)}"${text}`);
        shown += 1;
      }
      visit(node.children, depth + 1);
    }
  };
  visit(layers, 0);
  if (total > shown) lines.push(`- … 另有 ${total - shown} 个图层未列出`);
  return lines.join("\n");
}

export function buildAiNamingTask(options: {
  project: ProjectRecord;
  layers: LayerNode[];
  report?: CleanupReport | null;
  candidates?: AiNamingCandidate[];
  mergeCandidates?: AiMergeCandidate[];
  width?: number;
  height?: number;
  now?: Date;
}): AiNamingTask {
  const candidates =
    options.candidates ??
    collectAiNamingCandidates({ layers: options.layers, report: options.report });
  const mergeCandidates =
    options.mergeCandidates ??
    (options.report
      ? toAiMergeCandidates(options.report.mergeCandidates, options.layers)
      : []);
  return {
    schema: AI_NAMING_REQUEST_SCHEMA,
    schemaVersion: AI_NAMING_SCHEMA_VERSION,
    generatedAt: (options.now ?? new Date()).toISOString(),
    project: {
      name: options.project.name,
      sourceFileName: options.project.source.fileName,
      width: Math.max(1, Math.round(options.width ?? options.project.source.width)),
      height: Math.max(1, Math.round(options.height ?? options.project.source.height)),
      layerCount: flattenLayers(options.layers).length,
    },
    candidates,
    mergeCandidates,
    outline: outlineOf(options.layers),
  };
}

export function buildAiNamingPrompt(
  task: AiNamingTask,
  options: { direct?: boolean } = {},
): string {
  const payload = {
    schema: task.schema,
    schemaVersion: task.schemaVersion,
    generatedAt: task.generatedAt,
    project: task.project,
    candidates: task.candidates,
    mergeCandidates: task.mergeCandidates,
  };
  return [
    "# PSD 图层语义命名与合并复核任务",
    "",
    "你正在为一份 PSD 生成图层命名和合并复核计划。请只输出计划 JSON，不要生成代码或修改文件。",
    "",
    "## 文档",
    `- 项目：${task.project.name}`,
    `- 源文件：${task.project.sourceFileName}`,
    `- 画布：${task.project.width}×${task.project.height}`,
    `- 图层总数：${task.project.layerCount}`,
    `- 命名候选数：${task.candidates.length}`,
    `- 合并复核候选数：${task.mergeCandidates.length}`,
    `- 生成时间：${task.generatedAt}`,
    "",
    "## 命名规则",
    `1. 只处理 candidates 中列出的图层，path 必须原样返回，不得新增、删除或猜测路径。`,
    "2. 新名称优先使用小写 kebab-case；中文内容可直接使用中文。只允许字母、数字、点、下划线、连字符，长度 2–80。",
    "3. 不得使用通用名（如 layer-1、rectangle-2、group-3、图层 1、矩形 2）。",
    "4. 同一父级下名称必须唯一，不得与现有兄弟名称冲突。",
    "5. 结合图层文本、父级名称、兄弟名称、尺寸与布局提示命名；layout.direction 的 row/column/stack 分别表示横向排列、纵向排列、叠加。",
    "6. 看不到像素时不要臆测品牌或具体图标，可用描述性结构名。",
    "7. 只为有把握的候选返回条目；没有把握的候选可以省略，保留原名。",
    "8. reason 用中文简述依据，不超过 80 字。",
    "9. 只输出一个 JSON 对象，不要 Markdown 代码围栏，不要解释文字。",
    "",
    "## 合并复核规则",
    `1. 只复核 mergeCandidates 中列出的图层组，path 必须原样返回，不得新增或猜测路径。`,
    "2. decision 只能是 merge 或 keep。组内图层共同构成一个不可再分的 UI 单元（角标、图标按钮、输入框、复选行或紧凑卡片）时用 merge；属于布局容器、区块，或子层需要独立切图/定位时用 keep。",
    "3. 只依据边界、尺寸占比、子层类型统计、文本存在与否、嵌套组数量与布局方向判断；不要依据文案内容决定合并。",
    "4. decision 为 merge 时必须提供 name：优先小写 kebab-case 或中文，2–80 字符，不得是通用名，同一父级下必须唯一。decision 为 keep 时省略 name。",
    "5. 只为有把握的候选返回条目；没有把握的候选可以省略，保持未复核状态。",
    "6. reason 用中文简述依据，不超过 80 字。",
    "7. 合并会把组内图层栅格化为单层，仍需人工审核后执行；不要自动合并整页区块。",
    "",
    "## 图层结构",
    "```text",
    task.outline,
    "```",
    "",
    "## 候选（JSON）",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "",
    "## 输出格式",
    "```json",
    JSON.stringify(
      {
        schema: AI_NAMING_RESPONSE_SCHEMA,
        schemaVersion: AI_NAMING_SCHEMA_VERSION,
        renames: [
          {
            path: task.candidates[0]?.path ?? "0/1",
            newName: "example-name",
            reason: "依据该图层的文本与父级命名",
          },
        ],
        merges: [
          {
            path: task.mergeCandidates[0]?.path ?? "2",
            decision: "merge",
            name: "example-component",
            reason: "子层属于同一紧凑控件，适合栅格化为单层",
          },
        ],
      },
      null,
      2,
    ),
    "```",
    "",
    options.direct
      ? "直接返回上述 JSON 对象，不要保存文件，也不要输出解释文字。"
      : "将上述 JSON 保存为 `.json` 文件后导入 PSD Normalize Studio 审核。",
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function indexLayers(layers: LayerNode[]): {
  byPath: Map<string, LayerNode>;
  childrenByParent: Map<string | null, LayerNode[]>;
} {
  const byPath = new Map<string, LayerNode>();
  const childrenByParent = new Map<string | null, LayerNode[]>();
  const walk = (nodes: LayerNode[], parentPath: string | null): void => {
    childrenByParent.set(parentPath, nodes);
    for (const node of nodes) {
      byPath.set(node.path, node);
      walk(node.children, node.path);
    }
  };
  walk(layers, null);
  return { byPath, childrenByParent };
}

function normalizeComparisonName(value: string): string {
  return normalizeLayerName(value).toLowerCase();
}

function nameValidationError(raw: string): string | null {
  if (!raw) return "新名称不能为空";
  if (/[\\/]/.test(raw)) return "名称不能包含斜杠";
  const normalized = normalizeLayerName(raw);
  if (!normalized) return "规范化后名称为空";
  if (normalized.length > AI_NAMING_NAME_MAX_LENGTH) {
    return `名称超过 ${AI_NAMING_NAME_MAX_LENGTH} 字符`;
  }
  return null;
}

function mergeScopeKey(path: string): string | null {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : null;
}

function sameBounds(left: LayerBounds, right: LayerBounds): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

export function parseAiNamingResponse(
  input: unknown,
  options: AiNamingParseOptions,
): AiNamingParseResult {
  if (!isRecord(input)) throw new Error("AI 命名结果必须是 JSON 对象");
  if (input.schema !== AI_NAMING_RESPONSE_SCHEMA) {
    throw new Error(`schema 必须为 ${AI_NAMING_RESPONSE_SCHEMA}`);
  }
  if (
    input.schemaVersion !== AI_NAMING_SCHEMA_VERSION &&
    input.schemaVersion !== AI_NAMING_LEGACY_SCHEMA_VERSION
  ) {
    throw new Error(`schemaVersion 必须为 ${AI_NAMING_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(input.renames)) throw new Error("renames 必须是数组");
  if (input.merges !== undefined && !Array.isArray(input.merges)) {
    throw new Error("merges 必须是数组");
  }

  const candidateByPath = new Map(options.candidates.map((candidate) => [candidate.path, candidate]));
  const mergeCandidateByPath = new Map(
    (options.mergeCandidates ?? []).map((candidate) => [candidate.path, candidate]),
  );
  const { byPath, childrenByParent } = indexLayers(options.layers);
  const rejected: AiNamingRejectedRename[] = [];
  const rejectedMerges: AiMergeRejected[] = [];
  const drafts = new Map<string, CandidateDraft>();
  const seenPaths = new Set<string>();

  const reject = (entry: {
    path: string;
    newName: string;
    originalName?: string;
    reason: string;
  }): void => {
    rejected.push(entry);
  };

  for (const entry of input.renames) {
    if (!isRecord(entry)) {
      reject({ path: "?", newName: "", reason: "条目必须是对象" });
      continue;
    }
    const pathValue = typeof entry.path === "string" ? entry.path.trim() : "";
    const newNameValue = typeof entry.newName === "string" ? entry.newName.trim() : "";
    if (!pathValue) {
      reject({ path: "?", newName: newNameValue, reason: "缺少 path" });
      continue;
    }
    const candidate = candidateByPath.get(pathValue);
    const node = byPath.get(pathValue);
    const currentName = node?.name ?? candidate?.currentName;
    if (!candidate) {
      reject({
        path: pathValue,
        newName: newNameValue,
        ...(currentName ? { originalName: currentName } : {}),
        reason: "路径不在本次候选列表",
      });
      continue;
    }
    if (!node) {
      reject({
        path: pathValue,
        newName: newNameValue,
        originalName: candidate.currentName,
        reason: "当前图层树中不存在该路径",
      });
      continue;
    }
    if (node.name !== candidate.currentName) {
      reject({
        path: pathValue,
        newName: newNameValue,
        originalName: node.name,
        reason: "图层名称已变化，请重新分析",
      });
      continue;
    }
    if (!newNameValue) {
      reject({
        path: pathValue,
        newName: "",
        originalName: node.name,
        reason: "新名称不能为空",
      });
      continue;
    }
    if (/[\\/]/.test(newNameValue)) {
      reject({
        path: pathValue,
        newName: newNameValue,
        originalName: node.name,
        reason: "名称不能包含斜杠",
      });
      continue;
    }
    const normalized = normalizeLayerName(newNameValue);
    if (!normalized) {
      reject({
        path: pathValue,
        newName: newNameValue,
        originalName: node.name,
        reason: "规范化后名称为空",
      });
      continue;
    }
    if (normalized.length > AI_NAMING_NAME_MAX_LENGTH) {
      reject({
        path: pathValue,
        newName: newNameValue,
        originalName: node.name,
        reason: `名称超过 ${AI_NAMING_NAME_MAX_LENGTH} 字符`,
      });
      continue;
    }
    if (normalizeComparisonName(normalized) === normalizeComparisonName(node.name)) {
      reject({
        path: pathValue,
        newName: normalized,
        originalName: node.name,
        reason: "与当前名称相同",
      });
      continue;
    }
    if (isGenericLayerName(normalized)) {
      reject({
        path: pathValue,
        newName: newNameValue,
        originalName: node.name,
        reason: "仍是通用名称",
      });
      continue;
    }
    if (seenPaths.has(pathValue)) {
      reject({
        path: pathValue,
        newName: newNameValue,
        originalName: node.name,
        reason: "同一路径重复出现",
      });
      continue;
    }
    seenPaths.add(pathValue);
    const reason =
      typeof entry.reason === "string" && entry.reason.trim()
        ? compact(entry.reason, 120)
        : "AI 语义命名";
    drafts.set(pathValue, { path: pathValue, newName: normalized, reason, normalized });
  }

  const mergeReviews: AiMergeReview[] = [];
  const seenMergePaths = new Set<string>();
  const mergeNamesByParent = new Map<string | null, Set<string>>();
  for (const entry of input.merges ?? []) {
    if (!isRecord(entry)) {
      rejectedMerges.push({ path: "?", reason: "条目必须是对象" });
      continue;
    }
    const pathValue = typeof entry.path === "string" ? entry.path.trim() : "";
    const decisionValue = typeof entry.decision === "string" ? entry.decision.trim() : "";
    const nameValue = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!pathValue) {
      rejectedMerges.push({ path: "?", reason: "缺少 path" });
      continue;
    }
    if (seenMergePaths.has(pathValue)) {
      rejectedMerges.push({
        path: pathValue,
        ...(decisionValue ? { decision: decisionValue } : {}),
        ...(nameValue ? { name: nameValue } : {}),
        reason: "同一路径重复出现",
      });
      continue;
    }
    if (decisionValue !== "merge" && decisionValue !== "keep") {
      rejectedMerges.push({
        path: pathValue,
        ...(decisionValue ? { decision: decisionValue } : {}),
        reason: "decision 必须是 merge 或 keep",
      });
      continue;
    }
    const candidate = mergeCandidateByPath.get(pathValue);
    const node = byPath.get(pathValue);
    if (!candidate) {
      rejectedMerges.push({
        path: pathValue,
        decision: decisionValue,
        ...(nameValue ? { name: nameValue } : {}),
        reason: "路径不在本次合并候选列表",
      });
      continue;
    }
    if (!node || node.kind !== "group") {
      rejectedMerges.push({
        path: pathValue,
        decision: decisionValue,
        ...(nameValue ? { name: nameValue } : {}),
        reason: "目标已不是图层组，请重新分析",
      });
      continue;
    }
    const members = node.children.filter(
      (child) => child.visible && child.bounds && child.bounds.width * child.bounds.height > 0,
    );
    const currentBounds = members.length >= 2 ? unionBounds(members) : undefined;
    if (!currentBounds || !sameBounds(currentBounds, candidate.bounds)) {
      rejectedMerges.push({
        path: pathValue,
        decision: decisionValue,
        ...(nameValue ? { name: nameValue } : {}),
        reason: "图层结构或边界已变化，请重新分析",
      });
      continue;
    }
    const reason =
      typeof entry.reason === "string" && entry.reason.trim()
        ? compact(entry.reason, 120)
        : "AI 合并复核";
    if (decisionValue === "keep") {
      seenMergePaths.add(pathValue);
      mergeReviews.push({
        path: pathValue,
        layerId: node.id,
        decision: "keep",
        suggestedName: candidate.suggestedName,
        reason,
      });
      continue;
    }
    const nameError = nameValidationError(nameValue);
    if (nameError) {
      rejectedMerges.push({
        path: pathValue,
        decision: decisionValue,
        ...(nameValue ? { name: nameValue } : {}),
        reason: nameError,
      });
      continue;
    }
    const normalized = normalizeLayerName(nameValue);
    if (isGenericLayerName(normalized)) {
      rejectedMerges.push({
        path: pathValue,
        decision: decisionValue,
        name: nameValue,
        reason: "仍是通用名称",
      });
      continue;
    }
    const parentPath = mergeScopeKey(pathValue);
    const siblings = childrenByParent.get(parentPath) ?? [];
    const mergeRoots = new Set([
      ...mergeReviews.filter((review) => review.decision === "merge").map((review) => review.path),
      pathValue,
    ]);
    const used = new Set<string>(mergeNamesByParent.get(parentPath) ?? []);
    for (const sibling of siblings) {
      if (mergeRoots.has(sibling.path)) continue;
      const draft = drafts.get(sibling.path);
      used.add(draft ? draft.normalized.toLowerCase() : normalizeComparisonName(sibling.name));
    }
    if (used.has(normalized.toLowerCase())) {
      rejectedMerges.push({
        path: pathValue,
        decision: decisionValue,
        name: nameValue,
        reason: "与同级图层名称冲突",
      });
      continue;
    }
    seenMergePaths.add(pathValue);
    mergeReviews.push({
      path: pathValue,
      layerId: node.id,
      decision: "merge",
      suggestedName: candidate.suggestedName,
      name: normalized,
      reason,
    });
    const scopeNames = mergeNamesByParent.get(parentPath) ?? new Set<string>();
    scopeNames.add(normalized.toLowerCase());
    mergeNamesByParent.set(parentPath, scopeNames);
  }

  const approvedMergePaths = mergeReviews
    .filter((review) => review.decision === "merge")
    .map((review) => review.path);
  const mergeRootSet = new Set(approvedMergePaths);
  const insideMerge = (path: string): boolean =>
    approvedMergePaths.some((root) => path === root || path.startsWith(`${root}/`));
  for (const [path, draft] of drafts) {
    if (!insideMerge(path)) continue;
    drafts.delete(path);
    const known = byPath.get(path);
    rejected.push({
      path,
      newName: draft.newName,
      ...(known ? { originalName: known.name } : {}),
      reason: "该图层将由合并复核替换，命名不再适用",
    });
  }

  const acceptedDrafts = new Set<string>();
  const walk = (nodes: LayerNode[], parentPath: string | null): void => {
    const used = new Set<string>(mergeNamesByParent.get(parentPath) ?? []);
    for (const node of nodes) {
      if (!drafts.has(node.path) && !mergeRootSet.has(node.path)) {
        used.add(normalizeComparisonName(node.name));
      }
    }
    for (const node of nodes) {
      const draft = drafts.get(node.path);
      if (!draft) continue;
      if (used.has(draft.normalized.toLowerCase())) {
        const known = byPath.get(node.path);
        used.add(normalizeComparisonName(node.name));
        reject({
          path: node.path,
          newName: draft.newName,
          ...(known ? { originalName: known.name } : {}),
          reason: "与同级图层名称冲突",
        });
        continue;
      }
      used.add(draft.normalized.toLowerCase());
      acceptedDrafts.add(node.path);
    }
  };
  walk(childrenByParent.get(null) ?? [], null);
  for (const [parentPath] of childrenByParent) {
    if (parentPath !== null) walk(childrenByParent.get(parentPath) ?? [], parentPath);
  }

  const accepted: AiNamingAcceptedRename[] = [];
  for (const node of flattenLayers(options.layers)) {
    const draft = drafts.get(node.path);
    if (!draft || !acceptedDrafts.has(node.path)) continue;
    accepted.push({
      path: node.path,
      layerId: node.id,
      originalName: node.name,
      newName: draft.newName,
      reason: draft.reason,
    });
  }
  return { accepted, rejected, mergeReviews, rejectedMerges };
}

export function parseAiNamingResponseText(
  text: string,
  options: AiNamingParseOptions,
): AiNamingParseResult {
  let payload = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(payload);
  if (fence) payload = fence[1].trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (reason) {
    throw new Error(
      `JSON 解析失败：${reason instanceof Error ? reason.message : String(reason)}`,
    );
  }
  return parseAiNamingResponse(parsed, options);
}
