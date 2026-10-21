<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  parseAiNamingResponseText,
  type AiNamingParseResult,
} from "@/lib/aiNaming";
import { useSessionStore } from "@/stores/session";
import AppIcon from "./AppIcon.vue";
import ModalDialog from "./ModalDialog.vue";

const MAX_ACCEPTED_ROWS = 80;
const MAX_REJECTED_ROWS = 20;

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; applied: [] }>();

const session = useSessionStore();
const candidates = computed(() => session.aiNamingCandidates);
const plannedPaths = computed(() => new Set(session.plan.map((entry) => entry.path)));
const result = ref<AiNamingParseResult | null>(null);
const selectedPaths = ref<Set<string>>(new Set());
const message = ref<{ kind: "info" | "error"; text: string } | null>(null);
const importing = ref(false);
const applying = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

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

function reset(): void {
  result.value = null;
  selectedPaths.value = new Set();
  message.value = null;
  importing.value = false;
  applying.value = false;
}

watch(
  () => props.open,
  (open) => {
    if (open) reset();
  },
);

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
      layers: session.layers,
    });
    result.value = parsed;
    selectedPaths.value = new Set(
      parsed.accepted
        .filter((rename) => !plannedPaths.value.has(rename.path))
        .map((rename) => rename.path),
    );
    if (parsed.accepted.length === 0 && parsed.rejected.length === 0) {
      message.value = { kind: "info", text: "AI 结果中没有命名建议。" };
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
    subtitle="本地导出 · 人工审核 · 不调用外部接口"
    wide
    @close="emit('close')"
  >
    <div class="ai-naming">
      <div class="ai-naming__intro">
        <div class="ai-naming__badges">
          <span class="badge badge--accent">{{ candidates.length }} 个候选</span>
          <span class="badge badge--outline">严格 JSON 校验</span>
        </div>
        <p>
          规则无法从文本推断的通用名会进入候选。下载提示词交给任意 AI 工具，导入其 JSON
          输出；通过路径、同级重名与名称规范校验后，再人工选择加入命名计划。
        </p>
      </div>

      <div class="ai-naming__actions">
        <button
          class="btn btn--ghost btn--sm"
          type="button"
          :disabled="candidates.length === 0"
          @click="downloadTask"
        >
          <AppIcon name="download" :size="13" />
          下载 AI 命名任务
        </button>
        <button
          class="btn btn--primary btn--sm"
          type="button"
          :disabled="candidates.length === 0 || importing"
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
          提示词包含图层路径、名称、尺寸和文本内容，不包含像素；只有你主动交给 AI
          工具时才会离开本机。导入结果不会直接修改 PSD，必须加入计划并应用。
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

      <div v-if="candidates.length === 0" class="empty-state ai-naming__empty">
        <span class="empty-state__icon"><AppIcon name="sparkles" :size="20" /></span>
        <h3>没有需要 AI 命名的图层</h3>
        <p>规则未能推断的通用名会出现在这里；文本层会优先由本地规则命名。</p>
      </div>

      <section v-if="result" class="ai-review" data-testid="ai-naming-review">
        <header class="ai-review__header">
          <h3>导入结果审核</h3>
          <div class="ai-review__summary">
            <span class="badge badge--success">{{ result.accepted.length }} 项通过</span>
            <span v-if="result.rejected.length > 0" class="badge badge--warn">
              {{ result.rejected.length }} 项需修正
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
