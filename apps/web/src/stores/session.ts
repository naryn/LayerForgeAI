import { computed, ref, shallowRef } from "vue";
import { defineStore } from "pinia";
import type {
  DocumentSnapshot,
  EngineMode,
  LayerNode,
  PixelDiffSummary,
  PlanEntry,
  ProjectRecord,
  RevisionRecord,
} from "@/lib/domain";
import {
  buildAiNamingPrompt,
  buildAiNamingTask,
  collectAiNamingCandidates,
  type AiNamingAcceptedRename,
  type AiNamingCandidate,
} from "@/lib/aiNaming";
import {
  buildLocalAssetPack,
  downloadAssetPack,
  type AssetPackResult,
} from "@/lib/assetPack";
import { PatchyBridgeError } from "@/lib/bridge/protocol";
import {
  analyzeLayers,
  assetManifestFileName,
  buildAssetManifest,
  downloadAssetManifest,
  type CleanupGroupSuggestion,
  type CleanupMergeCandidate,
  type CleanupRename,
  type CleanupReport,
} from "@/lib/cleanup";
import { DemoTransport } from "@/lib/engine/demoTransport";
import { IframePatchyTransport } from "@/lib/engine/iframeTransport";
import { preconditionFor, type EngineTransport } from "@/lib/engine/types";
import {
  diffLayerTrees,
  downloadPsdDiff,
  psdDiffFileName,
  type DiffBaseline,
  type PsdDiffReport,
} from "@/lib/diff";
import { createId, downloadText, sanitizeFileName } from "@/lib/format";
import { findLayerById, findLayerByPath, flattenLayers } from "@/lib/layers";
import { buildDesignIr, designIrFileName, downloadDesignIr } from "@/lib/ir";
import {
  planStats as computePlanStats,
  suggestedNormalizedFileName,
  toSavedPath,
  verifyPlanAgainstLayers,
} from "@/lib/normalize";
import { useProjectsStore } from "./projects";

export type SessionStatus = "idle" | "connecting" | "ready" | "error";
export type SessionLogLevel = "info" | "success" | "warn" | "error";

export interface SessionLogEntry {
  id: string;
  at: string;
  level: SessionLogLevel;
  message: string;
  detail?: string;
}

export interface SessionLayersInput {
  project: ProjectRecord;
  file: File;
  localLayers: LayerNode[];
}

export interface PlanProgress {
  done: number;
  total: number;
}

function describeError(error: unknown): string {
  if (error instanceof PatchyBridgeError) {
    return error.message ? `${error.message}（${error.code}）` : error.code;
  }
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | null {
  return error instanceof PatchyBridgeError ? error.code : null;
}

export const useSessionStore = defineStore("session", () => {
  const projects = useProjectsStore();

  const projectId = ref<string | null>(null);
  const status = ref<SessionStatus>("idle");
  const mode = ref<EngineMode>("inspect");
  const engineLabel = ref("未连接");
  const document = ref<DocumentSnapshot | null>(null);
  const localLayers = shallowRef<LayerNode[]>([]);
  const selectedLayerId = ref<string | null>(null);
  const busy = ref<string | null>(null);
  const planProgress = ref<PlanProgress | null>(null);
  const error = ref<string | null>(null);
  const fallbackReason = ref<string | null>(null);
  const logs = ref<SessionLogEntry[]>([]);
  const lastRevision = ref<RevisionRecord | null>(null);
  const lastDiff = ref<PsdDiffReport | null>(null);
  const lastPixelDiff = ref<PixelDiffSummary | null>(null);
  const undoDepth = ref(0);
  const cleanupReport = ref<CleanupReport | null>(null);

  let diffBaseline: DocumentSnapshot | null = null;
  let diffBaselineKind: DiffBaseline = "session-open";

  let transport: EngineTransport | null = null;

  const project = computed<ProjectRecord | null>(() => {
    if (!projectId.value) return null;
    return projects.items.find((item) => item.id === projectId.value) ?? null;
  });
  const plan = computed<PlanEntry[]>(() => project.value?.plan ?? []);
  const stats = computed(() => computePlanStats(plan.value));
  const layers = computed<LayerNode[]>(() =>
    document.value ? document.value.layers : mode.value === "inspect" ? localLayers.value : [],
  );
  const layerList = computed(() => flattenLayers(layers.value));
  const aiNamingCandidates = computed<AiNamingCandidate[]>(() =>
    cleanupReport.value
      ? collectAiNamingCandidates({ layers: layers.value, report: cleanupReport.value })
      : [],
  );
  const selectedLayer = computed<LayerNode | null>(() => {
    if (!selectedLayerId.value) return null;
    return findLayerById(layers.value, selectedLayerId.value) ?? null;
  });
  const canEdit = computed(
    () => (mode.value === "patchy" || mode.value === "demo") && status.value === "ready",
  );
  const isSimulated = computed(() => mode.value === "demo");
  const isInspect = computed(() => mode.value === "inspect");
  const currentPath = computed(() => document.value?.path ?? null);
  const canUndo = computed(() => canEdit.value && undoDepth.value > 0);

  function pushLog(level: SessionLogLevel, message: string, detail?: string): void {
    logs.value.push({
      id: createId("log"),
      at: new Date().toISOString(),
      level,
      message,
      ...(detail ? { detail } : {}),
    });
    if (logs.value.length > 300) logs.value.splice(0, logs.value.length - 300);
  }

  function clearError(): void {
    error.value = null;
  }

  function dismissFallback(): void {
    fallbackReason.value = null;
  }

  function disposeTransport(): void {
    transport?.dispose();
    transport = null;
  }

  function reset(): void {
    disposeTransport();
    projectId.value = null;
    status.value = "idle";
    mode.value = "inspect";
    engineLabel.value = "未连接";
    document.value = null;
    localLayers.value = [];
    selectedLayerId.value = null;
    busy.value = null;
    planProgress.value = null;
    error.value = null;
    fallbackReason.value = null;
    logs.value = [];
    lastRevision.value = null;
    lastDiff.value = null;
    lastPixelDiff.value = null;
    undoDepth.value = 0;
    cleanupReport.value = null;
    diffBaseline = null;
    diffBaselineKind = "session-open";
  }

  function beginProject(projectRecord: ProjectRecord, local: LayerNode[]): void {
    disposeTransport();
    projectId.value = projectRecord.id;
    localLayers.value = local;
    document.value = null;
    selectedLayerId.value = null;
    status.value = "connecting";
    busy.value = null;
    planProgress.value = null;
    error.value = null;
    fallbackReason.value = null;
    logs.value = [];
    lastRevision.value = null;
    lastDiff.value = null;
    lastPixelDiff.value = null;
    undoDepth.value = 0;
    cleanupReport.value = null;
    diffBaseline = null;
    diffBaselineKind = "session-open";
  }

  function applySnapshot(snapshot: DocumentSnapshot): void {
    cleanupReport.value = null;
    const previous = selectedLayer.value;
    document.value = snapshot;
    if (!previous) {
      selectedLayerId.value = null;
      return;
    }
    const byId = findLayerById(snapshot.layers, previous.id);
    const byPath = byId ? undefined : findLayerByPath(snapshot.layers, previous.path);
    selectedLayerId.value = byId?.id ?? byPath?.id ?? null;
  }

  function enterInspect(
    projectRecord: ProjectRecord,
    local: LayerNode[],
    reason?: string,
  ): void {
    disposeTransport();
    projectId.value = projectRecord.id;
    localLayers.value = local;
    document.value = null;
    selectedLayerId.value = null;
    status.value = "ready";
    mode.value = "inspect";
    engineLabel.value = "本地检查 · 只读";
    busy.value = null;
    planProgress.value = null;
    error.value = null;
    fallbackReason.value = reason ?? null;
    lastPixelDiff.value = null;
    undoDepth.value = 0;
    cleanupReport.value = null;
    diffBaseline = null;
    diffBaselineKind = "session-open";
    if (reason) {
      pushLog("warn", "已切换到本地只读检查", reason);
    } else {
      pushLog("info", "本地只读检查已就绪（ag-psd 解析）");
    }
    if (local.length === 0) {
      pushLog(
        "warn",
        "本地检查没有解析到图层",
        projectRecord.localInspection.warning ?? "文件可能没有图层，或仅包含合并图像",
      );
    }
  }

  async function connectDemo(input: SessionLayersInput): Promise<boolean> {
    beginProject(input.project, input.localLayers);
    mode.value = "demo";
    engineLabel.value = "演示引擎 · 不写入文件";
    pushLog("info", "正在启动演示引擎（模拟协议，不会生成 PSD）");
    const next = new DemoTransport({
      projectName: input.project.name,
      width: input.project.source.width,
      height: input.project.source.height,
      layers: input.localLayers,
    });
    try {
      await next.connect();
      const snapshot = await next.openFile(input.file);
      transport = next;
      document.value = snapshot;
      diffBaseline = snapshot;
      diffBaselineKind = "session-open";
      selectedLayerId.value = snapshot.layers[0]?.id ?? null;
      status.value = "ready";
      pushLog(
        "warn",
        "演示引擎已连接",
        "此模式仅用于 UI 开发和测试，不会保存真实 PSD，也不构成 Patchy 或 Photoshop 证据。",
      );
      return true;
    } catch (reason) {
      next.dispose();
      enterInspect(input.project, input.localLayers, describeError(reason));
      pushLog("error", "演示引擎启动失败", describeError(reason));
      return false;
    }
  }

  async function connectPatchy(
    input: SessionLayersInput & { iframe: HTMLIFrameElement },
  ): Promise<boolean> {
    beginProject(input.project, input.localLayers);
    mode.value = "patchy";
    engineLabel.value = "Patchy 引擎";
    pushLog("info", "正在加载 Patchy WASM 与桥接…");
    const next = new IframePatchyTransport(input.iframe);
    try {
      await next.connect();
      const snapshot = await next.openFile(input.file);
      transport = next;
      document.value = snapshot;
      diffBaseline = snapshot;
      diffBaselineKind = "session-open";
      selectedLayerId.value = snapshot.layers[0]?.id ?? null;
      status.value = "ready";
      pushLog(
        "success",
        "Patchy 引擎已连接并打开文档",
        `documentId=${snapshot.documentId} revision=${snapshot.revision}`,
      );
      return true;
    } catch (reason) {
      next.dispose();
      const message = describeError(reason);
      enterInspect(input.project, input.localLayers, message);
      pushLog("error", "Patchy 连接失败", message);
      return false;
    }
  }

  async function refresh(): Promise<DocumentSnapshot | null> {
    if (status.value !== "ready" || !transport) {
      if (mode.value === "inspect") return null;
      error.value = "引擎尚未连接";
      return null;
    }
    if (busy.value) return null;
    busy.value = "刷新图层状态";
    try {
      const snapshot = await transport.getDocument();
      applySnapshot(snapshot);
      error.value = null;
      pushLog(
        "info",
        `图层状态已刷新：${flattenLayers(snapshot.layers).length} 个节点`,
        `revision=${snapshot.revision} fingerprint=${snapshot.fingerprint.slice(0, 16)}`,
      );
      return snapshot;
    } catch (reason) {
      error.value = describeError(reason);
      pushLog("error", "刷新图层状态失败", describeError(reason));
      return null;
    } finally {
      busy.value = null;
    }
  }

  function selectLayer(layerId: string | null): void {
    if (!layerId) {
      selectedLayerId.value = null;
      return;
    }
    if (findLayerById(layers.value, layerId)) selectedLayerId.value = layerId;
  }

  async function refreshAfterStale(reason: unknown): Promise<void> {
    if (errorCode(reason) !== "STALE_DOCUMENT" || !transport) return;
    try {
      const snapshot = await transport.getDocument();
      applySnapshot(snapshot);
      pushLog("warn", "文档已变化，已自动刷新图层状态，请重试");
    } catch {
      pushLog("warn", "文档已变化，且自动刷新失败");
    }
  }

  async function renameLayer(layerId: string, newName: string): Promise<boolean> {
    if (!transport || !document.value || !canEdit.value || busy.value) return false;
    const snapshot = document.value;
    if (!snapshot) return false;
    const layer = findLayerById(snapshot.layers, layerId);
    if (!layer) {
      error.value = "找不到所选图层";
      return false;
    }
    const trimmed = newName.trim();
    if (!trimmed) {
      error.value = "图层名称不能为空";
      return false;
    }
    busy.value = "重命名图层";
    error.value = null;
    try {
      await transport.renameLayer(layerId, trimmed, preconditionFor(snapshot));
      const updated = await transport.getDocument();
      applySnapshot(updated);
      undoDepth.value += 1;
      pushLog("success", `已重命名：${layer.name} → ${trimmed}`, `path=${layer.path}`);
      return true;
    } catch (reason) {
      await refreshAfterStale(reason);
      error.value = describeError(reason);
      pushLog("error", "重命名失败", `${describeError(reason)} path=${layer.path}`);
      return false;
    } finally {
      busy.value = null;
    }
  }

  async function persistPlan(entries: PlanEntry[]): Promise<boolean> {
    if (!projectId.value) return false;
    try {
      await projects.savePlan(projectId.value, entries);
      return true;
    } catch (reason) {
      const message = `命名计划保存失败：${describeError(reason)}`;
      error.value = message;
      pushLog("error", "命名计划保存失败", describeError(reason));
      return false;
    }
  }

  async function addPlanEntry(layer: LayerNode, newName: string): Promise<boolean> {
    if (!project.value) return false;
    const trimmed = newName.trim();
    if (!trimmed) {
      error.value = "新名称不能为空";
      return false;
    }
    if (trimmed === layer.name) {
      error.value = "新名称与当前名称相同";
      return false;
    }
    const now = new Date().toISOString();
    const existing = plan.value.find((entry) => entry.path === layer.path);
    const next = existing
      ? plan.value.map((entry) =>
          entry.id === existing.id
            ? {
                ...entry,
                layerId: layer.id,
                newName: trimmed,
                status: "draft" as const,
                note: undefined,
                updatedAt: now,
              }
            : entry,
        )
      : [
          ...plan.value,
          {
            id: createId("plan"),
            path: layer.path,
            layerId: layer.id,
            originalName: layer.name,
            newName: trimmed,
            status: "draft" as const,
            updatedAt: now,
          },
        ];
    const saved = await persistPlan(next);
    if (saved) {
      pushLog(existing ? "info" : "success", `${existing ? "更新" : "加入"}命名计划：${layer.name} → ${trimmed}`, `path=${layer.path}`);
    }
    return saved;
  }

  async function setPlanEntryName(entryId: string, newName: string): Promise<boolean> {
    const trimmed = newName.trim();
    if (!trimmed || !project.value) return false;
    const target = plan.value.find((entry) => entry.id === entryId);
    if (!target) return false;
    if (target.status === "verified" || target.status === "applied") return false;
    const next = plan.value.map((entry) =>
      entry.id === entryId
        ? {
            ...entry,
            newName: trimmed,
            status: "draft" as const,
            note: undefined,
            updatedAt: new Date().toISOString(),
          }
        : entry,
    );
    return persistPlan(next);
  }

  async function removePlanEntry(entryId: string): Promise<boolean> {
    if (!project.value) return false;
    const target = plan.value.find((entry) => entry.id === entryId);
    if (!target) return false;
    const next = plan.value.filter((entry) => entry.id !== entryId);
    const saved = await persistPlan(next);
    if (saved) pushLog("info", `已从计划移除：${target.originalName} → ${target.newName}`);
    return saved;
  }

  async function clearVerifiedPlan(): Promise<boolean> {
    if (!project.value) return false;
    const next = plan.value.filter((entry) => entry.status !== "verified");
    if (next.length === plan.value.length) return true;
    const saved = await persistPlan(next);
    if (saved) pushLog("info", "已清除通过重开校验的计划项");
    return saved;
  }

  async function applyPlan(): Promise<{ applied: number; failed: number }> {
    if (!transport || !document.value || !canEdit.value) {
      error.value = "当前引擎不支持修改，请连接 Patchy 或演示引擎";
      return { applied: 0, failed: 0 };
    }
    if (busy.value) return { applied: 0, failed: 0 };
    const candidates = plan.value.filter(
      (entry) => entry.status === "draft" || entry.status === "failed",
    );
    if (candidates.length === 0) {
      pushLog("info", "没有待应用的命名计划");
      return { applied: 0, failed: 0 };
    }
    busy.value = "应用重命名计划";
    planProgress.value = { done: 0, total: candidates.length };
    error.value = null;
    const working = plan.value.map((entry) => ({ ...entry }));
    let applied = 0;
    let failed = 0;
    try {
      for (let index = 0; index < candidates.length; index += 1) {
        const entry = working.find((item) => item.id === candidates[index].id);
        if (!entry) continue;
        busy.value = `应用重命名 ${index + 1}/${candidates.length}`;
        const snapshot = document.value;
        if (!snapshot) break;
        const layer = findLayerByPath(snapshot.layers, entry.path);
        if (!layer) {
          entry.status = "failed";
          entry.note = "当前图层树中找不到该路径";
          failed += 1;
          await persistPlan(working);
          break;
        }
        if (layer.name === entry.newName) {
          entry.status = "applied";
          entry.layerId = layer.id;
          entry.note = "名称已一致，无需重命名";
          applied += 1;
          planProgress.value = { done: index + 1, total: candidates.length };
          await persistPlan(working);
          continue;
        }
        try {
          await transport.renameLayer(layer.id, entry.newName, preconditionFor(snapshot));
          const updated = await transport.getDocument();
          applySnapshot(updated);
          undoDepth.value += 1;
          const after = findLayerByPath(updated.layers, entry.path);
          entry.status = "applied";
          entry.layerId = after?.id ?? layer.id;
          entry.note = undefined;
          entry.updatedAt = new Date().toISOString();
          applied += 1;
          pushLog("success", `计划项已应用：${entry.originalName} → ${entry.newName}`, `path=${entry.path}`);
        } catch (reason) {
          entry.status = "failed";
          entry.note = describeError(reason);
          entry.updatedAt = new Date().toISOString();
          failed += 1;
          error.value = describeError(reason);
          pushLog("error", `计划项应用失败：${entry.originalName}`, describeError(reason));
          await refreshAfterStale(reason);
          await persistPlan(working);
          planProgress.value = { done: index + 1, total: candidates.length };
          break;
        }
        planProgress.value = { done: index + 1, total: candidates.length };
        await persistPlan(working);
      }
      await persistPlan(working);
      pushLog(
        failed > 0 ? "warn" : "success",
        `计划应用结束：${applied} 已应用，${failed} 失败`,
        "修改仍在当前引擎内存中；必须保存并重开后才算持久化。",
      );
      return { applied, failed };
    } finally {
      busy.value = null;
      planProgress.value = null;
    }
  }

  async function rebasePendingPlan(snapshot: DocumentSnapshot): Promise<void> {
    if (!project.value) return;
    let changed = false;
    const next = plan.value.map((entry) => {
      if (entry.status !== "draft" && entry.status !== "failed") return entry;
      if (!entry.layerId) return entry;
      const node = findLayerById(snapshot.layers, entry.layerId);
      if (!node || node.path === entry.path) return entry;
      changed = true;
      return { ...entry, path: node.path };
    });
    if (changed) await persistPlan(next);
  }

  async function applyGroupSuggestions(
    suggestions?: CleanupGroupSuggestion[],
  ): Promise<{ applied: number; failed: number }> {
    const groups = suggestions ?? cleanupReport.value?.groups ?? [];
    if (!transport || !document.value || !canEdit.value || busy.value) {
      error.value = "当前引擎不支持编组，请连接 Patchy 或演示引擎";
      return { applied: 0, failed: 0 };
    }
    if (groups.length === 0) {
      pushLog("info", "没有待应用的编组建议");
      return { applied: 0, failed: 0 };
    }
    const initial = document.value;
    const targets = groups.map((group) => ({
      group,
      ids: group.memberPaths.map((path) => findLayerByPath(initial.layers, path)?.id),
    }));
    let applied = 0;
    let failed = 0;
    busy.value = "应用编组建议";
    error.value = null;
    try {
      for (const target of targets) {
        const label = target.group.suggestedName;
        if (target.ids.some((id) => !id)) {
          failed += 1;
          pushLog("warn", `编组跳过：${label}`, "图层树已变化，找不到全部成员");
          continue;
        }
        const snapshot = document.value;
        if (!snapshot) break;
        busy.value = `编组 ${applied + failed + 1}/${targets.length}：${label}`;
        try {
          const result = await transport.groupLayers(
            target.ids as string[],
            label,
            preconditionFor(snapshot),
          );
          const updated = await transport.getDocument();
          applySnapshot(updated);
          await rebasePendingPlan(updated);
          applied += 1;
          pushLog(
            "success",
            `已编组：${label}`,
            `groupId=${result.groupId} 成员 ${result.layerIds.length} 个 · 修改仅在引擎内存中`,
          );
        } catch (reason) {
          failed += 1;
          error.value = describeError(reason);
          pushLog("error", `编组失败：${label}`, describeError(reason));
          await refreshAfterStale(reason);
          if (errorCode(reason) === "STALE_DOCUMENT") break;
        }
      }
      if (applied > 0) {
        undoDepth.value += applied;
        analyzeCleanup(true);
      }
      pushLog(
        failed > 0 ? "warn" : "success",
        `编组结束：${applied} 已应用，${failed} 失败`,
        "修改尚未写入 PSD；请执行“保存并重开”生成新文件。",
      );
      return { applied, failed };
    } finally {
      busy.value = null;
    }
  }

  async function applyMergeCandidates(
    candidates?: CleanupMergeCandidate[],
  ): Promise<{ applied: number; failed: number }> {
    const merges = candidates ?? cleanupReport.value?.mergeCandidates ?? [];
    if (!transport || !document.value || !canEdit.value || busy.value) {
      error.value = "当前引擎不支持合并，请连接 Patchy 或演示引擎";
      return { applied: 0, failed: 0 };
    }
    if (merges.length === 0) {
      pushLog("info", "没有待应用的合并候选");
      return { applied: 0, failed: 0 };
    }
    const initial = document.value;
    const targets = merges.map((merge) => ({
      merge,
      layerId: findLayerByPath(initial.layers, merge.path)?.id,
    }));
    let applied = 0;
    let failed = 0;
    busy.value = "应用合并候选";
    error.value = null;
    try {
      for (const target of targets) {
        const label = target.merge.suggestedName;
        if (!target.layerId) {
          failed += 1;
          pushLog("warn", `合并跳过：${label}`, `找不到图层路径 /${target.merge.path}`);
          continue;
        }
        const snapshot = document.value;
        if (!snapshot) break;
        busy.value = `合并 ${applied + failed + 1}/${targets.length}：${label}`;
        try {
          const result = await transport.mergeLayers(
            [target.layerId],
            label,
            preconditionFor(snapshot),
          );
          const updated = await transport.getDocument();
          applySnapshot(updated);
          await rebasePendingPlan(updated);
          applied += 1;
          pushLog(
            "success",
            `已合并：${label}`,
            `layerId=${result.layerId} 剩余 ${result.layerIds.length} 层 · 修改仅在引擎内存中`,
          );
        } catch (reason) {
          failed += 1;
          error.value = describeError(reason);
          pushLog("error", `合并失败：${label}`, describeError(reason));
          await refreshAfterStale(reason);
          if (errorCode(reason) === "STALE_DOCUMENT") break;
        }
      }
      if (applied > 0) {
        undoDepth.value += applied;
        analyzeCleanup(true);
      }
      pushLog(
        failed > 0 ? "warn" : "success",
        `合并结束：${applied} 已应用，${failed} 失败`,
        "合并会栅格化组内图层；修改尚未写入 PSD，请执行“保存并重开”生成新文件。",
      );
      return { applied, failed };
    } finally {
      busy.value = null;
    }
  }

  async function undoLastMutation(): Promise<boolean> {
    if (!transport || !document.value || !canEdit.value || busy.value || undoDepth.value <= 0) {
      return false;
    }
    const snapshot = document.value;
    busy.value = "撤销上一步修改";
    error.value = null;
    try {
      const updated = await transport.undo(preconditionFor(snapshot));
      applySnapshot(updated);
      undoDepth.value = Math.max(0, undoDepth.value - 1);
      await rebasePendingPlan(updated);
      analyzeCleanup(true);
      pushLog(
        "success",
        "已撤销最近一次引擎修改",
        `documentId=${updated.documentId} revision=${updated.revision} · 源 PSD 未被改动，仍需保存并重开才会产生新文件`,
      );
      return true;
    } catch (reason) {
      await refreshAfterStale(reason);
      error.value = describeError(reason);
      pushLog("error", "撤销失败", describeError(reason));
      return false;
    } finally {
      busy.value = null;
    }
  }

  function savedPngPath(label: string): string {
    const slug =
      (project.value?.name ?? "project")
        .replace(/[^\w.-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "project";
    return `/saved/${slug}-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.png`;
  }

  async function saveAndReopen(fileName: string): Promise<RevisionRecord | null> {
    if (!transport || !document.value || !project.value || !canEdit.value || busy.value) {
      error.value = "当前引擎不支持保存";
      return null;
    }
    let path: string;
    try {
      path = toSavedPath(fileName);
    } catch (reason) {
      error.value = describeError(reason);
      return null;
    }
    busy.value = "保存并重开";
    error.value = null;
    try {
      const snapshot = document.value;
      if (!snapshot) return null;
      lastPixelDiff.value = null;
      let beforePreviewPath: string | null = null;
      if (mode.value === "patchy") {
        busy.value = "保存并重开：渲染保存前预览";
        try {
          beforePreviewPath = savedPngPath("presave");
          await transport.renderPreview(beforePreviewPath, false);
        } catch (reason) {
          beforePreviewPath = null;
          pushLog("warn", "保存前预览渲染失败，跳过像素对比", describeError(reason));
        }
        busy.value = "保存并重开";
      }
      const reopened = await transport.saveAsAndReopen(path, preconditionFor(snapshot));
      let pixelDiff: PixelDiffSummary | null = null;
      if (beforePreviewPath && mode.value === "patchy") {
        busy.value = "保存并重开：对比保存前后预览";
        try {
          const afterPreviewPath = savedPngPath("postsave");
          await transport.renderPreview(afterPreviewPath, false);
          pixelDiff = await transport.comparePreview(beforePreviewPath, afterPreviewPath);
          lastPixelDiff.value = pixelDiff;
          pushLog(
            pixelDiff.differingPixels === 0 ? "success" : "warn",
            pixelDiff.differingPixels === 0 ? "保存前后预览像素一致" : "保存前后预览存在像素差异",
            `差异 ${pixelDiff.differingPixels}/${pixelDiff.totalPixels}（${(pixelDiff.ratio * 100).toFixed(3)}%）最大通道差 ${pixelDiff.maxDelta}${pixelDiff.bounds ? ` · 区域 ${pixelDiff.bounds.width}×${pixelDiff.bounds.height}` : ""} · 对比对象是预览 PNG，不是 PSD 二进制或 Photoshop 渲染`,
          );
        } catch (reason) {
          pushLog("warn", "保存前后像素对比失败", describeError(reason));
        }
        busy.value = "保存并重开";
      }
      undoDepth.value = 0;
      const diff = diffLayerTrees(diffBaseline ?? snapshot, reopened, {
        simulated: isSimulated.value,
        baseline: diffBaselineKind,
      });
      lastDiff.value = diff;
      applySnapshot(reopened);
      diffBaseline = reopened;
      diffBaselineKind = "previous-save";
      const verification = verifyPlanAgainstLayers(plan.value, reopened.layers);
      await persistPlan(verification.plan);
      const revision: RevisionRecord = {
        id: createId("rev"),
        path,
        documentId: reopened.documentId,
        createdAt: new Date().toISOString(),
        engine: mode.value,
        layerCount: flattenLayers(reopened.layers).length,
        plannedCount: verification.plan.length,
        verifiedCount: verification.verified,
        verified: verification.failed === 0,
        diff: diff.summary,
        ...(pixelDiff ? { pixelDiff } : {}),
      };
      lastRevision.value = revision;
      try {
        if (projectId.value) {
          await projects.recordRevision(projectId.value, revision, reopened.layers);
        }
      } catch (reason) {
        pushLog("warn", "PSD 已保存，但版本记录写入失败", describeError(reason));
      }
      pushLog(
        isSimulated.value ? "warn" : "success",
        isSimulated.value ? "演示引擎模拟了保存并重开" : "PSD 已另存并在浏览器中重开",
        isSimulated.value
          ? `未生成真实 PSD；版本记录与结构对比仅为演示状态（重命名 ${diff.summary.renamed}、几何 ${diff.summary.geometryChanged}、属性 ${diff.summary.restyled}、新增 ${diff.summary.added}、移除 ${diff.summary.removed}）。`
          : `path=${path} documentId=${reopened.documentId} 重开校验 ${verification.verified}/${verification.attempted}；结构对比：重命名 ${diff.summary.renamed}、几何 ${diff.summary.geometryChanged}、属性 ${diff.summary.restyled}、新增 ${diff.summary.added}、移除 ${diff.summary.removed}`,
      );
      if (verification.failed > 0) {
        error.value = `${verification.failed} 个计划项在重开后未找到`;
      }
      return revision;
    } catch (reason) {
      await refreshAfterStale(reason);
      error.value = describeError(reason);
      pushLog("error", "保存并重开失败", describeError(reason));
      return null;
    } finally {
      busy.value = null;
    }
  }

  async function renderPreview(download: boolean) {
    if (!transport || !document.value || !project.value) {
      error.value = "当前引擎不支持渲染";
      return null;
    }
    if (busy.value) return null;
    busy.value = "渲染预览";
    error.value = null;
    const stamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14);
    const path = `/saved/${project.value.name
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "project"}-preview-${stamp}-${Math.random().toString(36).slice(2, 6)}.png`;
    try {
      const result = await transport.renderPreview(path, download);
      if (result.simulated) {
        pushLog("warn", "演示模式不会生成真实 PNG", `path=${path}`);
      } else {
        pushLog(
          download ? "success" : "info",
          download ? "已渲染预览并请求浏览器下载" : "已渲染预览",
          `path=${path} ${result.width}×${result.height}`,
        );
      }
      return result;
    } catch (reason) {
      error.value = describeError(reason);
      pushLog("error", "渲染预览失败", describeError(reason));
      return null;
    } finally {
      busy.value = null;
    }
  }

  function exportIr() {
    if (!project.value) return null;
    const current = document.value;
    const snapshot: DocumentSnapshot = current ?? {
      documentId: "local-inspection",
      revision: "0",
      fingerprint: "",
      width: project.value.source.width,
      height: project.value.source.height,
      layers: localLayers.value,
      capturedAt: new Date().toISOString(),
    };
    if (snapshot.layers.length === 0) {
      error.value = "没有可导出的图层树";
      return null;
    }
    const logicalGroups =
      cleanupReport.value?.groups ??
      analyzeLayers({
        layers: snapshot.layers,
        width: snapshot.width ?? project.value.source.width,
        height: snapshot.height ?? project.value.source.height,
      }).groups;
    const ir = buildDesignIr({
      project: project.value,
      snapshot,
      plan: plan.value,
      engine: mode.value,
      logicalGroups,
    });
    downloadDesignIr(ir, designIrFileName(project.value));
    pushLog(
      "success",
      "Design IR 草稿已导出",
      `该 JSON 尚未经过 M5 发布校验；含 ${ir.logicalGroups.length} 组逻辑编组建议（不写入 PSD）。`,
    );
    return ir;
  }

  function exportDiff(): PsdDiffReport | null {
    if (!lastDiff.value || !project.value) {
      error.value = "还没有可导出的保存前后对比";
      return null;
    }
    const report = lastDiff.value;
    downloadPsdDiff(report, psdDiffFileName(project.value.name));
    pushLog(
      "success",
      "保存前后结构对比已导出",
      `重命名 ${report.summary.renamed}、几何 ${report.summary.geometryChanged}、属性 ${report.summary.restyled}、新增 ${report.summary.added}、移除 ${report.summary.removed}；该报告不是像素级差异。`,
    );
    return report;
  }

  function analyzeCleanup(force = false): CleanupReport | null {
    if (cleanupReport.value && !force) return cleanupReport.value;
    const record = project.value;
    const width = document.value?.width ?? record?.source.width ?? 0;
    const height = document.value?.height ?? record?.source.height ?? 0;
    if (!record || width <= 0 || height <= 0 || layers.value.length === 0) {
      error.value = "没有可分析的图层树";
      return null;
    }
    const report = analyzeLayers({ layers: layers.value, width, height });
    cleanupReport.value = report;
    pushLog(
      "info",
      "一键整理分析完成",
      `命名建议 ${report.summary.renames} · 待复核 ${report.summary.findings} · 编组建议 ${report.summary.groups} · 切图候选 ${report.summary.slices}`,
    );
    return report;
  }

  async function addCleanupRenamesToPlan(
    renames: CleanupRename[],
    options: { note?: string; includeReason?: boolean } = {},
  ): Promise<{ added: number; skipped: number }> {
    if (!project.value) return { added: 0, skipped: 0 };
    const note = options.note ?? "一键整理建议";
    const existingPaths = new Set(plan.value.map((entry) => entry.path));
    const now = new Date().toISOString();
    const additions: PlanEntry[] = [];
    let skipped = 0;
    for (const rename of renames) {
      if (existingPaths.has(rename.path)) {
        skipped += 1;
        continue;
      }
      existingPaths.add(rename.path);
      additions.push({
        id: createId("plan"),
        path: rename.path,
        layerId: rename.layerId,
        originalName: rename.originalName,
        newName: rename.newName,
        status: "draft",
        note: options.includeReason && rename.reason ? `${note}：${rename.reason}`.slice(0, 160) : note,
        updatedAt: now,
      });
    }
    if (additions.length === 0) {
      pushLog("info", "没有新的命名可加入计划", `${note} · ${skipped} 项已在计划中`);
      return { added: 0, skipped };
    }
    const saved = await persistPlan([...plan.value, ...additions]);
    if (saved) {
      pushLog(
        "success",
        `已将 ${additions.length} 项命名加入计划`,
        `${note} · ${skipped} 项已有计划，未覆盖`,
      );
    }
    return { added: saved ? additions.length : 0, skipped };
  }

  function exportAiNamingTask(): number {
    const record = project.value;
    const report = cleanupReport.value;
    if (!record || !report) {
      error.value = "请先执行一键整理分析";
      return 0;
    }
    const candidates = collectAiNamingCandidates({ layers: layers.value, report });
    if (candidates.length === 0) {
      error.value = "没有需要 AI 命名的通用图层";
      return 0;
    }
    const task = buildAiNamingTask({
      project: record,
      layers: layers.value,
      report,
      candidates,
      width: document.value?.width ?? record.source.width,
      height: document.value?.height ?? record.source.height,
    });
    downloadText(
      buildAiNamingPrompt(task),
      `${sanitizeFileName(record.name)}-ai-naming-prompt.md`,
    );
    pushLog(
      "info",
      `已导出 AI 命名任务（${candidates.length} 个候选）`,
      "导入 AI 返回的 JSON 后人工审核，不会直接修改 PSD",
    );
    return candidates.length;
  }

  async function addAiNamingRenamesToPlan(
    renames: AiNamingAcceptedRename[],
  ): Promise<{ added: number; skipped: number }> {
    return addCleanupRenamesToPlan(
      renames.map((rename) => ({
        path: rename.path,
        layerId: rename.layerId,
        originalName: rename.originalName,
        newName: rename.newName,
        reason: rename.reason,
      })),
      { note: "AI 语义命名建议", includeReason: true },
    );
  }

  async function exportAssetPack(): Promise<AssetPackResult | null> {
    const record = project.value;
    if (!record || busy.value) return null;
    const report = cleanupReport.value ?? analyzeCleanup();
    if (!report) return null;
    if (report.slices.length === 0 && report.mergeCandidates.length === 0) {
      error.value = "没有可导出的切图或合并候选";
      return null;
    }
    busy.value = "准备资产包";
    error.value = null;
    try {
      const file = await projects.getFile(record.id);
      if (!file) throw new Error("找不到项目源文件，无法读取 PSD 合成图");
      const snapshot: DocumentSnapshot = document.value ?? {
        documentId: "local-inspection",
        revision: "0",
        fingerprint: "",
        width: record.source.width,
        height: record.source.height,
        layers: localLayers.value,
        capturedAt: new Date().toISOString(),
      };
      const result = await buildLocalAssetPack({
        project: record,
        snapshot,
        plan: plan.value,
        engine: mode.value,
        report,
        file,
        onProgress: (message) => {
          busy.value = message;
        },
      });
      downloadAssetPack(result);
      pushLog(
        "success",
        "资产包已导出",
        `${result.assets.length} 个切图 + ${result.mergedAssets.length} 个合并素材（合成图裁切）· 覆盖率 ${(
          result.comparison.coverageRatio * 100
        ).toFixed(1)}% · PNG 解码校验：切图 ${result.comparison.verifiedAssets} 个、合并素材 ${result.comparison.verifiedMergedAssets} 个，不一致 ${result.comparison.mismatchedAssets + result.comparison.mismatchedMergedAssets} 个`,
      );
      if (result.limits.truncated) {
        pushLog(
          "warn",
          "资产包因体积预算被截断",
          `已用 ${result.limits.bytesUsed} 字节，${result.limits.skippedAssets} 个资产、${result.limits.skippedMergedAssets} 个合并素材未包含`,
        );
      }
      return result;
    } catch (reason) {
      error.value = describeError(reason);
      pushLog("error", "资产包导出失败", describeError(reason));
      return null;
    } finally {
      busy.value = null;
    }
  }

  function exportAssetManifest() {
    const record = project.value;
    if (!record) return null;
    const report = cleanupReport.value ?? analyzeCleanup();
    if (!report) return null;
    const snapshot: DocumentSnapshot = document.value ?? {
      documentId: "local-inspection",
      revision: "0",
      fingerprint: "",
      width: record.source.width,
      height: record.source.height,
      layers: localLayers.value,
      capturedAt: new Date().toISOString(),
    };
    const manifest = buildAssetManifest({
      project: record,
      snapshot,
      engine: mode.value,
      report,
    });
    downloadAssetManifest(manifest, assetManifestFileName(record));
    pushLog(
      manifest.assets.length > 0 ? "success" : "warn",
      "资产清单已导出",
      `${manifest.assets.length} 个切图候选；未生成像素文件，不能作为兼容性证据。`,
    );
    return manifest;
  }

  function suggestedSaveName(): string {
    return project.value
      ? suggestedNormalizedFileName(project.value.name)
      : "normalized.psd";
  }

  function dispose(): void {
    disposeTransport();
    status.value = "idle";
  }

  return {
    projectId,
    status,
    mode,
    engineLabel,
    document,
    localLayers,
    selectedLayerId,
    selectedLayer,
    busy,
    planProgress,
    error,
    fallbackReason,
    logs,
    lastRevision,
    lastDiff,
    lastPixelDiff,
    undoDepth,
    canUndo,
    cleanupReport,
    aiNamingCandidates,
    project,
    plan,
    stats,
    layers,
    layerList,
    canEdit,
    isSimulated,
    isInspect,
    currentPath,
    selectLayer,
    enterInspect,
    connectDemo,
    connectPatchy,
    refresh,
    renameLayer,
    addPlanEntry,
    setPlanEntryName,
    removePlanEntry,
    clearVerifiedPlan,
    applyPlan,
    applyGroupSuggestions,
    applyMergeCandidates,
    undoLastMutation,
    saveAndReopen,
    renderPreview,
    exportDiff,
    exportIr,
    analyzeCleanup,
    addCleanupRenamesToPlan,
    exportAiNamingTask,
    addAiNamingRenamesToPlan,
    exportAssetManifest,
    exportAssetPack,
    suggestedSaveName,
    clearError,
    dismissFallback,
    reset,
    dispose,
  };
});
