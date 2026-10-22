<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import {
  parseAiNamingResponseText,
  type AiMergeReview,
  type AiNamingParseResult,
} from "@/lib/aiNaming";
import { flattenLayers } from "@/lib/layers";
import {
  AI_NAMING_MODEL_PRESETS,
  clearAiNamingModelConfig,
  isAiNamingModelConfigured,
  loadAiNamingModelConfig,
  requestAiNamingCompletion,
  saveAiNamingModelConfig,
  validateAiNamingModelConfig,
  type AiNamingModelConfig,
  type AiNamingModelPreset,
} from "@/lib/aiNamingClient";
import { useSessionStore } from "@/stores/session";
import AppIcon from "./AppIcon.vue";
import ModalDialog from "./ModalDialog.vue";

const MAX_ACCEPTED_ROWS = 80;
const MAX_REJECTED_ROWS = 20;

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; applied: [] }>();

const session = useSessionStore();
const candidates = computed(() => session.aiNamingCandidates);
const mergeCandidates = computed(() => session.aiMergeCandidates);
const workCount = computed(() => candidates.value.length + mergeCandidates.value.length);
const livePaths = computed(() => new Set(flattenLayers(session.layers).map((node) => node.path)));
const plannedPaths = computed(() => new Set(session.plan.map((entry) => entry.path)));
const result = ref<AiNamingParseResult | null>(null);
const selectedPaths = ref<Set<string>>(new Set());
const selectedMergePaths = ref<Set<string>>(new Set());
const message = ref<{ kind: "info" | "error"; text: string } | null>(null);
const importing = ref(false);
const generating = ref(false);
const applying = ref(false);
const applyingMerges = ref(false);
const modelOpen = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const model = reactive<AiNamingModelConfig>(loadAiNamingModelConfig());
let generationController: AbortController | null = null;

const modelReady = computed(() => isAiNamingModelConfigured(model));
const busy = computed(
  () => importing.value || generating.value || applying.value || applyingMerges.value,
);

const mergeReviewByPath = computed(
  () => new Map(mergeCandidates.value.map((candidate) => [candidate.path, candidate])),
);
const mergeReviews = computed<AiMergeReview[]>(() => result.value?.mergeReviews ?? []);
const availableMergeReviews = computed(() =>
  mergeReviews.value.filter(
    (review) => review.decision === "merge" && livePaths.value.has(review.path),
  ),
);
const selectedMergeReviews = computed(() =>
  availableMergeReviews.value.filter((review) => selectedMergePaths.value.has(review.path)),
);
const allMergesSelected = computed(
  () =>
    availableMergeReviews.value.length > 0 &&
    selectedMergeReviews.value.length === availableMergeReviews.value.length,
);
const visibleRejectedMerges = computed(
  () => result.value?.rejectedMerges.slice(0, MAX_REJECTED_ROWS) ?? [],
);
const hiddenRejectedMerges = computed(() =>
  result.value ? Math.max(0, result.value.rejectedMerges.length - MAX_REJECTED_ROWS) : 0,
);
const mergeDecisions = computed(
  () => mergeReviews.value.filter((review) => review.decision === "merge").length,
);
const keepDecisions = computed(
  () => mergeReviews.value.filter((review) => review.decision === "keep").length,
);

const selectableAccepted = computed(
  () =>
    result.value?.accepted.filter((rename) => !plannedPaths.value.has(rename.path)) ?? [],
);
const selectedRenames = computed(
  () =>
    result.value?.accepted.filter(
      (rename) =>
        selectedPaths.value.has(rename.path) && !plannedPaths.value.has(rename.path),
    ) ?? [],
);
const allSelected = computed(
  () =>
    selectableAccepted.value.length > 0 &&
    selectedRenames.value.length === selectableAccepted.value.length,
);
const visibleAccepted = computed(
  () => result.value?.accepted.slice(0, MAX_ACCEPTED_ROWS) ?? [],
);
const hiddenAccepted = computed(() =>
  result.value ? Math.max(0, result.value.accepted.length - MAX_ACCEPTED_ROWS) : 0,
);
const visibleRejected = computed(
  () => result.value?.rejected.slice(0, MAX_REJECTED_ROWS) ?? [],
);
const hiddenRejected = computed(() =>
  result.value ? Math.max(0, result.value.rejected.length - MAX_REJECTED_ROWS) : 0,
);

function cancelGeneration(): void {
  generationController?.abort();
  generationController = null;
}

function reset(): void {
  cancelGeneration();
  result.value = null;
  selectedPaths.value = new Set();
  selectedMergePaths.value = new Set();
  message.value = null;
  importing.value = false;
  generating.value = false;
  applying.value = false;
  applyingMerges.value = false;
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      cancelGeneration();
      return;
    }
    reset();
    Object.assign(model, loadAiNamingModelConfig());
    modelOpen.value = !isAiNamingModelConfigured(model);
  },
);

function adoptResult(parsed: AiNamingParseResult): void {
  result.value = parsed;
  selectedPaths.value = new Set(
    parsed.accepted
      .filter((rename) => !plannedPaths.value.has(rename.path))
      .map((rename) => rename.path),
  );
  selectedMergePaths.value = new Set(
    parsed.mergeReviews
      .filter((review) => review.decision === "merge" && livePaths.value.has(review.path))
      .map((review) => review.path),
  );
}

function toggle(path: string): void {
  const next = new Set(selectedPaths.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  selectedPaths.value = next;
}

function toggleAll(): void {
  selectedPaths.value = allSelected.value
    ? new Set()
    : new Set(selectableAccepted.value.map((rename) => rename.path));
}

function toggleMerge(path: string): void {
  const next = new Set(selectedMergePaths.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  selectedMergePaths.value = next;
}

function toggleAllMerges(): void {
  selectedMergePaths.value = allMergesSelected.value
    ? new Set()
    : new Set(availableMergeReviews.value.map((review) => review.path));
}

function mergeCandidateInfo(path: string) {
  return mergeReviewByPath.value.get(path);
}

async function applyMerges(): Promise<void> {
  const reviews = selectedMergeReviews.value;
  if (reviews.length === 0 || applyingMerges.value || session.busy) return;
  applyingMerges.value = true;
  message.value = null;
  try {
    const outcome = await session.applyAiMergeReviews(reviews);
    if (outcome.applied > 0 || outcome.failed > 0 || outcome.skipped > 0) {
      const live = new Set(flattenLayers(session.layers).map((node) => node.path));
      if (result.value) {
        result.value = {
          ...result.value,
          accepted: result.value.accepted.filter((rename) => live.has(rename.path)),
          mergeReviews: result.value.mergeReviews.filter((review) => live.has(review.path)),
        };
      }
      selectedMergePaths.value = new Set(
        [...selectedMergePaths.value].filter((path) => live.has(path)),
      );
      selectedPaths.value = new Set([...selectedPaths.value].filter((path) => live.has(path)));
      message.value = {
        kind: outcome.failed > 0 ? "error" : "info",
        text: `AI 合并复核执行：${outcome.applied} 项已合并、${outcome.failed} 项失败${
          outcome.skipped > 0 ? `、${outcome.skipped} 项候选已过期` : ""
        }。修改仅在引擎内存，需“保存并重开”写入新 PSD。`,
      };
      if (outcome.applied === 0 && session.error) {
        message.value = { kind: "error", text: session.error };
      }
    }
  } finally {
    applyingMerges.value = false;
  }
}

function downloadTask(): void {
  message.value = null;
  const count = session.exportAiNamingTask();
  if (count > 0) {
    message.value = {
      kind: "info",
      text: `已下载 ${count} 个候选的提示词。把 Markdown 交给 AI 工具，保存其 JSON 输出后再导入。`,
    };
  }
}

function applyPreset(preset: AiNamingModelPreset): void {
  message.value = null;
  model.baseUrl = preset.baseUrl;
  model.model = preset.model;
}

function saveModel(): void {
  message.value = null;
  const errors = validateAiNamingModelConfig(model);
  if (errors.length > 0) {
    modelOpen.value = true;
    message.value = { kind: "error", text: errors.join("；") };
    return;
  }
  const saved = saveAiNamingModelConfig(model);
  if (!saved) {
    message.value = {
      kind: "error",
      text: "浏览器拒绝保存配置；本次打开期间仍可使用当前配置。",
    };
    return;
  }
  message.value = {
    kind: "info",
    text: model.rememberKey
      ? "配置已保存，API Key 仅写入本浏览器 localStorage。"
      : "配置已保存（未记住 API Key）。",
  };
}

function clearModel(): void {
  clearAiNamingModelConfig();
  Object.assign(model, loadAiNamingModelConfig());
  message.value = { kind: "info", text: "模型配置已清除。" };
}

async function generateWithModel(): Promise<void> {
  if (generating.value) return;
  message.value = null;
  const errors = validateAiNamingModelConfig(model);
  if (errors.length > 0) {
    modelOpen.value = true;
    message.value = { kind: "error", text: errors.join("；") };
    return;
  }
  const task = session.buildAiNamingRequestTask();
  if (!task) {
    message.value = {
      kind: "error",
      text: "没有可复核的命名或合并候选，请先执行一键整理分析。",
    };
    return;
  }
  const controller = new AbortController();
  generationController = controller;
  generating.value = true;
  result.value = null;
  selectedPaths.value = new Set();
  try {
    const completion = await requestAiNamingCompletion({
      task,
      config: { ...model },
      signal: controller.signal,
    });
    const parsed = parseAiNamingResponseText(completion.text, {
      candidates: task.candidates,
      mergeCandidates: task.mergeCandidates,
      layers: session.layers,
    });
    adoptResult(parsed);
    const seconds = (completion.durationMs / 1000).toFixed(1);
    const modelLabel = (completion.model ?? model.model).slice(0, 80);
    const tokens = completion.usage?.totalTokens
      ? ` · ${completion.usage.totalTokens} tokens`
      : "";
    const mergeCount = parsed.mergeReviews.filter((review) => review.decision === "merge").length;
    const keepCount = parsed.mergeReviews.filter((review) => review.decision === "keep").length;
    session.logAiNamingModelRun(
      `${modelLabel} · ${seconds}s${tokens} · ${parsed.accepted.length} 项命名 / ${mergeCount} 项合并 / ${keepCount} 项保留`,
    );
    message.value = {
      kind: "info",
      text: `模型 ${modelLabel} 用时 ${seconds}s：${parsed.accepted.length} 项命名通过、${parsed.rejected.length} 项需修正；合并复核 ${mergeCount} 项建议合并、${keepCount} 项建议保留。请人工审核后加入计划或执行合并。`,
    };
  } catch (reason) {
    if (controller.signal.aborted) return;
    result.value = null;
    selectedPaths.value = new Set();
    message.value = {
      kind: "error",
      text: reason instanceof Error ? reason.message : String(reason),
    };
  } finally {
    if (generationController === controller) {
      generationController = null;
      generating.value = false;
    }
  }
}

function chooseFile(): void {
  message.value = null;
  fileInput.value?.click();
}

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  importing.value = true;
  message.value = null;
  try {
    const parsed = parseAiNamingResponseText(await file.text(), {
      candidates: candidates.value,
      mergeCandidates: mergeCandidates.value,
      layers: session.layers,
    });
    adoptResult(parsed);
    if (
      parsed.accepted.length === 0 &&
      parsed.rejected.length === 0 &&
      parsed.mergeReviews.length === 0 &&
      parsed.rejectedMerges.length === 0
    ) {
      message.value = { kind: "info", text: "AI 结果中没有命名或合并建议。" };
    }
  } catch (reason) {
    result.value = null;
    selectedPaths.value = new Set();
    message.value = {
      kind: "error",
      text: reason instanceof Error ? reason.message : String(reason),
    };
  } finally {
    importing.value = false;
  }
}

async function apply(): Promise<void> {
  if (selectedRenames.value.length === 0 || applying.value) return;
  applying.value = true;
  try {
    const outcome = await session.addAiNamingRenamesToPlan(selectedRenames.value);
    if (outcome.added > 0) {
      emit("applied");
      return;
    }
    message.value = {
      kind: "info",
      text: `没有新增命名，${outcome.skipped} 项已在计划中。`,
    };
  } finally {
    applying.value = false;
  }
}
</script>

<template>
  <ModalDialog
    :open="open"
    title="AI 语义命名"
    subtitle="可选模型调用 · 命名与合并复核 · 人工审核"
    wide
    @close="emit('close')"
  >
    <div class="ai-naming">
      <div class="ai-naming__intro">
        <div class="ai-naming__badges">
          <span class="badge badge--accent">{{ candidates.length }} 个命名候选</span>
          <span v-if="mergeCandidates.length > 0" class="badge badge--warn">
            {{ mergeCandidates.length }} 组合并复核
          </span>
          <span class="badge badge--outline">严格 JSON 校验</span>
          <span class="badge" :class="modelReady ? 'badge--success' : 'badge--muted'">
            {{ modelReady ? "模型已配置" : "模型未配置" }}
          </span>
        </div>
        <p>
          本地规则无法推断的通用名与合并候选会进入任务。可直接调用 OpenAI 兼容模型，也可下载提示词
          离线处理；命名会经过路径、同级重名与名称规范校验，合并复核会校验图层组边界与名称冲突，
          再由人工选择加入计划或执行合并。
        </p>
      </div>

      <details
        class="ai-model"
        :open="modelOpen"
        data-testid="ai-model-settings"
        @toggle="modelOpen = ($event.target as HTMLDetailsElement).open"
      >
        <summary class="ai-model__summary">
          <AppIcon name="settings" :size="13" />
          <span>模型配置</span>
          <span class="badge" :class="modelReady ? 'badge--success' : 'badge--muted'">
            {{ modelReady ? model.model : "未配置" }}
          </span>
          <span class="ai-model__chevron"><AppIcon name="chevron-down" :size="13" /></span>
        </summary>
        <div class="ai-model__body">
          <div class="ai-model__presets">
            <span class="ai-model__presets-label">预设</span>
            <button
              v-for="preset in AI_NAMING_MODEL_PRESETS"
              :key="preset.id"
              class="btn btn--ghost btn--sm"
              type="button"
              :title="preset.note"
              @click="applyPreset(preset)"
            >
              {{ preset.label }}
            </button>
          </div>
          <div class="ai-model__grid">
            <label class="ai-model__field">
              <span>接口地址（Base URL）</span>
              <input
                v-model="model.baseUrl"
                class="input"
                type="url"
                placeholder="https://api.deepseek.com/v1"
                autocomplete="off"
                spellcheck="false"
                aria-label="模型接口地址"
              />
            </label>
            <label class="ai-model__field">
              <span>模型</span>
              <input
                v-model="model.model"
                class="input"
                type="text"
                placeholder="deepseek-chat"
                autocomplete="off"
                spellcheck="false"
                aria-label="模型名称"
              />
            </label>
            <label class="ai-model__field">
              <span>API Key</span>
              <input
                v-model="model.apiKey"
                class="input"
                type="password"
                placeholder="本地模型可留空"
                autocomplete="off"
                aria-label="模型 API Key"
              />
            </label>
          </div>
          <div class="ai-model__checks">
            <label class="ai-model__check">
              <input v-model="model.rememberKey" type="checkbox" />
              记住 API Key（写入本浏览器 localStorage）
            </label>
            <label class="ai-model__check">
              <input v-model="model.jsonMode" type="checkbox" />
              发送 response_format JSON 模式
            </label>
          </div>
          <div class="ai-model__actions">
            <button class="btn btn--ghost btn--sm" type="button" @click="saveModel">
              <AppIcon name="save" :size="13" />
              保存配置
            </button>
            <button class="btn btn--ghost btn--sm" type="button" @click="clearModel">
              <AppIcon name="trash" :size="13" />
              清除
            </button>
            <span class="ai-model__hint">
              浏览器直接请求该地址，需接口允许 CORS；Key 不会写入日志或 PSD。
            </span>
          </div>
        </div>
      </details>

      <div class="ai-naming__actions">
        <button
          class="btn btn--primary btn--sm"
          type="button"
          :disabled="workCount === 0 || busy"
          @click="generateWithModel"
        >
          <AppIcon
            :name="generating ? 'loader' : 'sparkles'"
            :size="13"
            :class="{ spin: generating }"
          />
          {{ generating ? "模型生成中…" : "调用模型生成" }}
        </button>
        <button
          class="btn btn--ghost btn--sm"
          type="button"
          :disabled="workCount === 0 || busy"
          @click="downloadTask"
        >
          <AppIcon name="download" :size="13" />
          下载 AI 命名任务
        </button>
        <button
          class="btn btn--ghost btn--sm"
          type="button"
          :disabled="workCount === 0 || busy"
          @click="chooseFile"
        >
          <AppIcon
            :name="importing ? 'loader' : 'upload'"
            :size="13"
            :class="{ spin: importing }"
          />
          {{ importing ? "读取中…" : "导入 AI 结果 JSON" }}
        </button>
        <input
          ref="fileInput"
          class="sr-only"
          type="file"
          accept=".json,application/json"
          aria-label="AI 命名结果 JSON"
          @change="onFile"
        />
      </div>

      <div class="callout">
        <AppIcon class="callout__icon" name="info" :size="14" />
        <div>
          直接调用时，提示词（图层路径、名称、尺寸、结构统计和文本内容，不含像素）会发送到你配置的
          接口；下载提示词则只在你主动交给 AI 工具时离开本机。命名必须加入计划并应用，合并必须由你
          勾选后单独执行，且只写入当前引擎内存。
        </div>
      </div>

      <div
        v-if="message"
        class="callout"
        :class="message.kind === 'error' ? 'callout--danger' : 'callout--accent'"
        data-testid="ai-naming-message"
      >
        <AppIcon class="callout__icon" :name="message.kind === 'error' ? 'warning' : 'check'" :size="14" />
        <div>{{ message.text }}</div>
      </div>

      <div v-if="workCount === 0" class="empty-state ai-naming__empty">
        <span class="empty-state__icon"><AppIcon name="sparkles" :size="20" /></span>
        <h3>没有需要 AI 复核的图层</h3>
        <p>规则未能推断的通用名与紧凑组件组会出现在这里；文本层会优先由本地规则命名。</p>
      </div>

      <section v-if="result" class="ai-review" data-testid="ai-naming-review">
        <header class="ai-review__header">
          <h3>AI 结果审核</h3>
          <div class="ai-review__summary">
            <span class="badge badge--success">{{ result.accepted.length }} 项命名通过</span>
            <span v-if="mergeDecisions > 0" class="badge badge--accent">
              {{ mergeDecisions }} 项合并建议
            </span>
            <span v-if="keepDecisions > 0" class="badge badge--muted">
              {{ keepDecisions }} 项保留建议
            </span>
            <span v-if="result.rejected.length > 0" class="badge badge--warn">
              {{ result.rejected.length }} 项命名需修正
            </span>
            <span v-if="result.rejectedMerges.length > 0" class="badge badge--warn">
              {{ result.rejectedMerges.length }} 项合并需修正
            </span>
          </div>
        </header>

        <div v-if="selectableAccepted.length > 0" class="ai-review__toolbar">
          <label class="select-all">
            <input
              type="checkbox"
              :checked="allSelected"
              aria-label="全选 AI 命名建议"
              @change="toggleAll"
            />
            全选可加入计划的命名
          </label>
          <span class="section__meta">{{ selectedRenames.length }}/{{ selectableAccepted.length }} 已选</span>
        </div>

        <ul v-if="result.accepted.length > 0" class="ai-review__list scroll-area">
          <li
            v-for="rename in visibleAccepted"
            :key="rename.path"
            class="ai-review__row"
            :class="{ 'is-planned': plannedPaths.has(rename.path) }"
          >
            <input
              type="checkbox"
              :checked="selectedPaths.has(rename.path) && !plannedPaths.has(rename.path)"
              :disabled="plannedPaths.has(rename.path)"
              :aria-label="`选择 ${rename.originalName}`"
              @change="toggle(rename.path)"
            />
            <div class="ai-review__main">
              <div class="ai-review__names">
                <span class="ai-review__from" :title="rename.originalName">
                  {{ rename.originalName }}
                </span>
                <AppIcon name="arrow-right" :size="12" />
                <span class="ai-review__to" :title="rename.newName">{{ rename.newName }}</span>
              </div>
              <div class="ai-review__meta">
                <span class="mono" :title="rename.path">/{{ rename.path }}</span>
                <span>{{ rename.reason }}</span>
              </div>
            </div>
            <span v-if="plannedPaths.has(rename.path)" class="badge badge--muted">已在计划</span>
          </li>
        </ul>
        <p v-if="hiddenAccepted > 0" class="section__hint">
          仅显示前 {{ MAX_ACCEPTED_ROWS }} 项，另有 {{ hiddenAccepted }} 项通过。
        </p>
        <p v-if="result.accepted.length === 0" class="section__hint">
          没有通过校验的命名建议。
        </p>

        <details v-if="result.rejected.length > 0" class="ai-review__rejected">
          <summary>查看被拒绝的 {{ result.rejected.length }} 项</summary>
          <ul>
            <li v-for="rejection in visibleRejected" :key="`${rejection.path}-${rejection.newName}`">
              <span class="mono">/{{ rejection.path }}</span>
              <span v-if="rejection.newName" class="mono">{{ rejection.newName }}</span>
              <span>{{ rejection.reason }}</span>
            </li>
          </ul>
          <p v-if="hiddenRejected > 0" class="section__hint">
            另有 {{ hiddenRejected }} 项未展示。
          </p>
        </details>

        <section
          v-if="mergeReviews.length > 0 || (result?.rejectedMerges.length ?? 0) > 0"
          class="ai-merge"
          data-testid="ai-merge-review"
        >
          <header class="ai-review__header">
            <h3>合并复核</h3>
            <span class="section__meta">规则候选已校验边界与同级重名</span>
          </header>

          <div v-if="availableMergeReviews.length > 0" class="ai-review__toolbar">
            <label class="select-all">
              <input
                type="checkbox"
                :checked="allMergesSelected"
                aria-label="全选合并复核建议"
                @change="toggleAllMerges"
              />
              全选要执行的合并
            </label>
            <span class="section__meta">
              {{ selectedMergeReviews.length }}/{{ availableMergeReviews.length }} 已选
            </span>
          </div>

          <ul v-if="mergeReviews.length > 0" class="ai-review__list scroll-area">
            <li
              v-for="review in mergeReviews"
              :key="`merge:${review.path}`"
              class="ai-review__row"
            >
              <input
                v-if="review.decision === 'merge'"
                type="checkbox"
                :checked="selectedMergePaths.has(review.path)"
                :disabled="!livePaths.has(review.path)"
                :aria-label="`选择合并 ${review.name ?? review.path}`"
                @change="toggleMerge(review.path)"
              />
              <div class="ai-review__main">
                <div class="ai-review__names">
                  <span class="ai-review__from" :title="mergeCandidateInfo(review.path)?.suggestedName">
                    {{ mergeCandidateInfo(review.path)?.suggestedName ?? "规则候选" }}
                  </span>
                  <template v-if="review.decision === 'merge'">
                    <AppIcon name="arrow-right" :size="12" />
                    <span class="ai-review__to" :title="review.name">{{ review.name }}</span>
                  </template>
                  <span
                    class="badge"
                    :class="review.decision === 'merge' ? 'badge--success' : 'badge--muted'"
                  >
                    {{ review.decision === "merge" ? "建议合并" : "建议保留" }}
                  </span>
                </div>
                <div class="ai-review__meta">
                  <span class="mono" :title="review.path">/{{ review.path }}</span>
                  <span v-if="mergeCandidateInfo(review.path)">
                    {{ mergeCandidateInfo(review.path)?.bounds.width }}×{{
                      mergeCandidateInfo(review.path)?.bounds.height
                    }}
                    · {{ mergeCandidateInfo(review.path)?.memberCount }} 个子层 ·
                    {{ mergeCandidateInfo(review.path)?.kind === "badge" ? "角标" : "组件" }}
                  </span>
                  <span>{{ review.reason }}</span>
                </div>
              </div>
            </li>
          </ul>
          <p v-if="mergeReviews.length === 0" class="section__hint">没有通过校验的合并复核建议。</p>

          <details v-if="result.rejectedMerges.length > 0" class="ai-review__rejected">
            <summary>查看被拒绝的 {{ result.rejectedMerges.length }} 项合并</summary>
            <ul>
              <li
                v-for="rejection in visibleRejectedMerges"
                :key="`merge-rejected:${rejection.path}-${rejection.name ?? rejection.decision ?? ''}`"
              >
                <span class="mono">/{{ rejection.path }}</span>
                <span v-if="rejection.name" class="mono">{{ rejection.name }}</span>
                <span>{{ rejection.reason }}</span>
              </li>
            </ul>
            <p v-if="hiddenRejectedMerges > 0" class="section__hint">
              另有 {{ hiddenRejectedMerges }} 项未展示。
            </p>
          </details>

          <div v-if="availableMergeReviews.length > 0" class="ai-merge__actions">
            <button
              class="btn btn--primary btn--sm"
              type="button"
              data-testid="apply-ai-merges"
              :disabled="selectedMergeReviews.length === 0 || busy || !session.canEdit"
              @click="applyMerges"
            >
              <AppIcon
                :name="applyingMerges ? 'loader' : 'package'"
                :size="13"
                :class="{ spin: applyingMerges }"
              />
              {{ applyingMerges ? "合并中…" : `合并所选（${selectedMergeReviews.length}）` }}
            </button>
            <span class="ai-merge__hint">
              合并会栅格化组内图层，只写入引擎内存；可撤销，保存并重开后才写入新 PSD。
            </span>
          </div>
        </section>
      </section>
    </div>

    <template #footer>
      <button class="btn btn--ghost btn--sm" type="button" @click="emit('close')">取消</button>
      <button
        class="btn btn--primary btn--sm"
        type="button"
        :disabled="selectedRenames.length === 0 || applying"
        @click="apply"
      >
        <AppIcon
          :name="applying ? 'loader' : 'plus'"
          :size="13"
          :class="{ spin: applying }"
        />
        {{ applying ? "加入中…" : `加入命名计划（${selectedRenames.length} 项）` }}
      </button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.ai-naming {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-naming__intro {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-naming__intro p {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-2);
}

.ai-naming__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ai-naming__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ai-naming__empty {
  padding: 24px 12px;
}

.ai-model {
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-2);
}

.ai-model__summary {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 11px;
  cursor: pointer;
  list-style: none;
  font-size: 11.5px;
  font-weight: 650;
  color: var(--text-2);
}

.ai-model__summary::-webkit-details-marker {
  display: none;
}

.ai-model__summary .badge {
  margin-left: auto;
  max-width: 42%;
  overflow: hidden;
  display: inline-block;
  line-height: 21px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-model__chevron {
  display: inline-flex;
  transition: transform 140ms ease;
}

.ai-model[open] .ai-model__chevron {
  transform: rotate(180deg);
}

.ai-model__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 11px 11px;
}

.ai-model__presets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.ai-model__presets-label {
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.ai-model__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  gap: 8px;
}

.ai-model__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  font-size: 10.5px;
  font-weight: 650;
  color: var(--text-2);
}

.ai-model__field:first-child {
  grid-column: 1 / -1;
}

.ai-model__field .input {
  font-size: 12px;
}

.ai-model__checks {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.ai-model__check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  color: var(--text-2);
}

.ai-model__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.ai-model__hint {
  flex: 1 1 220px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--muted);
}

@media (max-width: 640px) {
  .ai-model__grid {
    grid-template-columns: 1fr;
  }

  .ai-model__field:first-child {
    grid-column: auto;
  }
}

.ai-review {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.ai-review__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ai-review__header h3 {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-2);
}

.ai-review__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.ai-review__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ai-review__list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 280px;
  overflow: auto;
}

.ai-review__row {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 7px 8px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
}

.ai-review__row.is-planned {
  opacity: 0.65;
}

.ai-review__row > input {
  margin-top: 2px;
  flex: 0 0 auto;
}

.ai-review__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ai-review__names {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  font-size: 11.5px;
}

.ai-review__from {
  max-width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  text-decoration: line-through;
}

.ai-review__to {
  max-width: 54%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--accent-2);
  font-weight: 650;
}

.ai-review__meta {
  display: flex;
  gap: 7px;
  min-width: 0;
  font-size: 9.5px;
  color: var(--muted);
}

.ai-review__meta .mono {
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-merge {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.ai-merge__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.ai-merge__hint {
  flex: 1 1 240px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--muted);
}

.ai-review__rejected {
  font-size: 10.5px;
  color: var(--muted);
}

.ai-review__rejected summary {
  cursor: pointer;
  color: var(--warn);
}

.ai-review__rejected ul {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}

.ai-review__rejected li {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 5px 7px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-2);
}
</style>
