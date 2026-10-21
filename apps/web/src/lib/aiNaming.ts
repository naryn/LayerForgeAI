import type { LayerBounds, LayerKind, LayerNode, ProjectRecord } from "./domain";
import { isGenericLayerName, normalizeLayerName, type CleanupReport } from "./cleanup";
import { inferComponentLayout, type ComponentLayoutHint } from "./layout";
import { flattenLayers, unionBounds } from "./layers";

export const AI_NAMING_REQUEST_SCHEMA = "layerforge.ai-naming.request" as const;
export const AI_NAMING_RESPONSE_SCHEMA = "layerforge.ai-naming.response" as const;
export const AI_NAMING_SCHEMA_VERSION = "0.1.0" as const;
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

export interface AiNamingParseResult {
  accepted: AiNamingAcceptedRename[];
  rejected: AiNamingRejectedRename[];
}

export interface AiNamingParseOptions {
  candidates: AiNamingCandidate[];
  layers: LayerNode[];
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
  width?: number;
  height?: number;
  now?: Date;
}): AiNamingTask {
  const candidates =
    options.candidates ??
    collectAiNamingCandidates({ layers: options.layers, report: options.report });
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
    outline: outlineOf(options.layers),
  };
}

export function buildAiNamingPrompt(task: AiNamingTask): string {
  const payload = {
    schema: task.schema,
    schemaVersion: task.schemaVersion,
    generatedAt: task.generatedAt,
    project: task.project,
    candidates: task.candidates,
  };
  return [
    "# PSD 图层语义命名任务",
    "",
    "你正在为一份 PSD 的图层生成语义化命名建议。请只输出命名计划，不要生成代码或修改文件。",
    "",
    "## 文档",
    `- 项目：${task.project.name}`,
    `- 源文件：${task.project.sourceFileName}`,
    `- 画布：${task.project.width}×${task.project.height}`,
    `- 图层总数：${task.project.layerCount}`,
    `- 候选数：${task.candidates.length}`,
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
      },
      null,
      2,
    ),
    "```",
    "",
    "将上述 JSON 保存为 `.json` 文件后导入 PSD Normalize Studio 审核。",
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

export function parseAiNamingResponse(
  input: unknown,
  options: AiNamingParseOptions,
): AiNamingParseResult {
  if (!isRecord(input)) throw new Error("AI 命名结果必须是 JSON 对象");
  if (input.schema !== AI_NAMING_RESPONSE_SCHEMA) {
    throw new Error(`schema 必须为 ${AI_NAMING_RESPONSE_SCHEMA}`);
  }
  if (input.schemaVersion !== AI_NAMING_SCHEMA_VERSION) {
    throw new Error(`schemaVersion 必须为 ${AI_NAMING_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(input.renames)) throw new Error("renames 必须是数组");

  const candidateByPath = new Map(options.candidates.map((candidate) => [candidate.path, candidate]));
  const { byPath, childrenByParent } = indexLayers(options.layers);
  const rejected: AiNamingRejectedRename[] = [];
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

  const acceptedDrafts = new Set<string>();
  const walk = (nodes: LayerNode[]): void => {
    const used = new Set<string>();
    for (const node of nodes) {
      if (!drafts.has(node.path)) used.add(normalizeComparisonName(node.name));
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
  walk(childrenByParent.get(null) ?? []);
  for (const [parentPath] of childrenByParent) {
    if (parentPath !== null) walk(childrenByParent.get(parentPath) ?? []);
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
  return { accepted, rejected };
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
