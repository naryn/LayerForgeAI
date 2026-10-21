<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type {
  CleanupGroupSuggestion,
  CleanupMergeCandidate,
  CleanupRename,
  CleanupRuleId,
} from "@/lib/cleanup";
import { layoutSummary } from "@/lib/layout";
import { layerKindLabel } from "@/lib/layers";
import { useSessionStore } from "@/stores/session";
import AiNamingDialog from "./AiNamingDialog.vue";
import AppIcon from "./AppIcon.vue";

const emit = defineEmits<{ "open-plan": [] }>();

const MAX_RENAME_ROWS = 120;
const MAX_FINDING_ROWS = 60;
const MAX_SLICE_ROWS = 60;
const MAX_MERGE_ROWS = 40;

const RULE_LABELS: Record<CleanupRuleId, string> = {
  "normalize-name": "命名规范化",
  "duplicate-name": "同级重名",
  "generic-name": "通用名称",
  "empty-group": "空组",
  "single-child-group": "单子组",
  "group-cluster": "编组建议",
  "slice-candidate": "切图候选",
};

const session = useSessionStore();
const report = computed(() => session.cleanupReport);
const adding = ref(false);
const packing = ref(false);
const grouping = ref(false);
const merging = ref(false);
const aiDialogOpen = ref(false);
const selectedPaths = ref<Set<string>>(new Set());
const aiCandidates = computed(() => session.aiNamingCandidates);

const plannedPaths = computed(() => new Set(session.plan.map((entry) => entry.path)));
const availableRenames = computed(
  () => report.value?.renames.filter((rename) => !plannedPaths.value.has(rename.path)) ?? [],
);
const selectedRenames = computed(() =>
  availableRenames.value.filter((rename) => selectedPaths.value.has(rename.path)),
);
const allSelected = computed(
  () =>
    availableRenames.value.length > 0 &&
    selectedRenames.value.length === availableRenames.value.length,
);
const visibleFindings = computed(() => report.value?.findings.slice(0, MAX_FINDING_ROWS) ?? []);
const hiddenFindings = computed(() =>
  report.value ? Math.max(0, report.value.findings.length - MAX_FINDING_ROWS) : 0,
);
const visibleRenames = computed(() => report.value?.renames.slice(0, MAX_RENAME_ROWS) ?? []);
const hiddenRenames = computed(() =>
  report.value ? Math.max(0, report.value.renames.length - MAX_RENAME_ROWS) : 0,
);
const visibleSlices = computed(() => report.value?.slices.slice(0, MAX_SLICE_ROWS) ?? []);
const hiddenSlices = computed(() =>
  report.value ? Math.max(0, report.value.slices.length - MAX_SLICE_ROWS) : 0,
);
const visibleMerges = computed(() => report.value?.mergeCandidates.slice(0, MAX_MERGE_ROWS) ?? []);
const hiddenMerges = computed(() =>
  report.value ? Math.max(0, report.value.mergeCandidates.length - MAX_MERGE_ROWS) : 0,
);

const findingRules = computed(() => {
  const counts = new Map<CleanupRuleId, number>();
  for (const finding of report.value?.findings ?? []) {
    counts.set(finding.rule, (counts.get(finding.rule) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([rule]) => rule !== "normalize-name" && rule !== "group-cluster" && rule !== "slice-candidate")
    .map(([rule, count]) => ({ rule, label: RULE_LABELS[rule], count }));
});

watch(
  () => report.value,
  (value) => {
    selectedPaths.value = new Set(value?.renames.map((rename) => rename.path) ?? []);
  },
  { immediate: true },
);

onMounted(() => {
  if (!session.cleanupReport) session.analyzeCleanup();
});

function isSelected(rename: CleanupRename): boolean {
  return selectedPaths.value.has(rename.path);
}

function toggle(rename: CleanupRename): void {
  const next = new Set(selectedPaths.value);
  if (next.has(rename.path)) next.delete(rename.path);
  else next.add(rename.path);
  selectedPaths.value = next;
}

function toggleAll(): void {
  selectedPaths.value = allSelected.value
    ? new Set()
    : new Set(availableRenames.value.map((rename) => rename.path));
}

async function addToPlan(): Promise<void> {
  if (selectedRenames.value.length === 0 || session.busy) return;
  adding.value = true;
  try {
    const result = await session.addCleanupRenamesToPlan(selectedRenames.value);
    if (result.added > 0) emit("open-plan");
  } finally {
    adding.value = false;
  }
}

function exportManifest(): void {
  session.exportAssetManifest();
}

async function exportPack(): Promise<void> {
  if (packing.value || session.busy) return;
  packing.value = true;
  try {
    await session.exportAssetPack();
  } finally {
    packing.value = false;
  }
}

async function groupAll(): Promise<void> {
  if (grouping.value || session.busy || !session.canEdit) return;
  grouping.value = true;
  try {
    await session.applyGroupSuggestions();
  } finally {
    grouping.value = false;
  }
}

async function groupOne(group: CleanupGroupSuggestion): Promise<void> {
  if (grouping.value || session.busy || !session.canEdit) return;
  grouping.value = true;
  try {
    await session.applyGroupSuggestions([group]);
  } finally {
    grouping.value = false;
  }
}

async function mergeAll(): Promise<void> {
  if (merging.value || session.busy || !session.canEdit) return;
  merging.value = true;
  try {
    await session.applyMergeCandidates();
  } finally {
    merging.value = false;
  }
}

async function mergeOne(merge: CleanupMergeCandidate): Promise<void> {
  if (merging.value || session.busy || !session.canEdit) return;
  merging.value = true;
  try {
    await session.applyMergeCandidates([merge]);
  } finally {
    merging.value = false;
  }
}

async function undoLast(): Promise<void> {
  if (!session.canUndo || session.busy) return;
  await session.undoLastMutation();
}

function onAiApplied(): void {
  aiDialogOpen.value = false;
  emit("open-plan");
}
</script>

<template>
  <section class="cleanup-panel panel">
    <header class="cleanup-panel__header">
      <span class="panel-title">一键整理</span>
      <span v-if="report" class="badge badge--accent">{{ report.summary.renames }} 项命名</span>
    </header>

    <div class="cleanup-panel__body scroll-area">
      <div class="intro">
        <div class="intro__title">
          <AppIcon name="sparkles" :size="14" />
          规则分析 · 本地执行
        </div>
        <p>
          按边界与层级结构推断组件角色（按钮、输入框、角标、图标按钮等）生成命名建议，不读取
          图层名或 T 文案；同时检测结构问题，并按空间关系给出编组、合并与切图候选。命名可直接
          进入计划，结构无法判断的通用名可导出为 AI 命名任务并在审核后加入；逻辑编组连同布局
          提示写入 Design IR 供 AI 拆分组件，切图可导出为真实 PNG 资产包（合成图裁切，非逐图层渲染）。
        </p>
      </div>

      <div class="actions">
        <button
          class="btn btn--ghost btn--sm"
          type="button"
          :disabled="session.layerList.length === 0"
          @click="session.analyzeCleanup(true)"
        >
          <AppIcon name="refresh" :size="13" />
          重新分析
        </button>
        <button
          class="btn btn--ghost btn--sm cleanup-undo"
          type="button"
          :disabled="!session.canUndo || Boolean(session.busy)"
          :title="session.canUndo ? '撤销最近一次引擎内修改（不影响源 PSD）' : '没有可撤销的引擎修改'"
          @click="undoLast"
        >
          <AppIcon
            :name="session.busy === '撤销上一步修改' ? 'loader' : 'history'"
            :size="13"
            :class="{ spin: session.busy === '撤销上一步修改' }"
          />
          撤销上一步{{ session.undoDepth > 0 ? `（${session.undoDepth}）` : "" }}
        </button>
        <button
          class="btn btn--primary btn--sm cleanup-add"
          type="button"
          :disabled="selectedRenames.length === 0 || adding || Boolean(session.busy)"
          @click="addToPlan"
        >
          <AppIcon
            :name="adding ? 'loader' : 'plus'"
            :size="13"
            :class="{ spin: adding }"
          />
          生成命名计划（{{ selectedRenames.length }} 项）
        </button>
        <button
          class="btn btn--ghost btn--sm cleanup-export"
          type="button"
          :disabled="!report || report.slices.length === 0 || packing || Boolean(session.busy)"
          @click="exportManifest"
        >
          <AppIcon name="file" :size="13" />
          导出资产清单
        </button>
        <button
          class="btn btn--primary btn--sm cleanup-pack"
          type="button"
          :disabled="!report || report.slices.length === 0 || packing || Boolean(session.busy)"
          @click="exportPack"
        >
          <AppIcon :name="packing ? 'loader' : 'package'" :size="13" :class="{ spin: packing }" />
          {{ packing ? "生成中…" : "导出资产包 ZIP" }}
        </button>
      </div>
      <p v-if="packing && session.busy" class="section__hint">{{ session.busy }}</p>
      <p v-if="session.undoDepth > 0" class="section__hint">
        可撤销 {{ session.undoDepth }} 步引擎内修改；撤销只影响当前引擎内存，源 PSD 不会被改动。
      </p>

      <div v-if="!report" class="empty-state cleanup-empty">
        <span class="empty-state__icon"><AppIcon name="sparkles" :size="20" /></span>
        <h3>还没有分析结果</h3>
        <p>点击“重新分析”检查当前图层树。分析只读取结构、边界与名称，不会修改文档。</p>
      </div>

      <template v-else>
        <div class="stats-strip">
          <div class="stat-chip">
            <span class="stat-chip__value">{{ report.summary.renames }}</span>
            <span class="stat-chip__label">命名</span>
          </div>
          <div class="stat-chip">
            <span class="stat-chip__value">{{ report.summary.findings }}</span>
            <span class="stat-chip__label">复核</span>
          </div>
          <div class="stat-chip">
            <span class="stat-chip__value">{{ report.summary.groups }}</span>
            <span class="stat-chip__label">编组</span>
          </div>
          <div class="stat-chip">
            <span class="stat-chip__value">{{ report.summary.merges }}</span>
            <span class="stat-chip__label">合并</span>
          </div>
          <div class="stat-chip">
            <span class="stat-chip__value">{{ report.summary.slices }}</span>
            <span class="stat-chip__label">切图</span>
          </div>
        </div>

        <div v-if="!session.canEdit" class="callout callout--warn">
          <AppIcon class="callout__icon" name="lock" :size="14" />
          <div>当前引擎只读：可以分析与生成计划，但应用命名需要连接 Patchy 或演示引擎。</div>
        </div>

        <section class="section">
          <header class="section__header">
            <h4>命名建议</h4>
            <span class="section__meta">{{ selectedRenames.length }}/{{ availableRenames.length }} 已选</span>
          </header>
          <p class="section__hint">名称来自结构角色推断，不读取图层名或 T 文案；文本层本身不会被改名。</p>
          <label v-if="availableRenames.length > 1" class="select-all">
            <input
              type="checkbox"
              :checked="allSelected"
              aria-label="全选命名建议"
              @change="toggleAll"
            />
            全选可加入计划的命名建议
          </label>
          <ul v-if="report.renames.length > 0" class="rename-list">
            <li
              v-for="rename in visibleRenames"
              :key="rename.path"
              class="rename-row"
              :class="{ 'is-planned': plannedPaths.has(rename.path) }"
            >
              <input
                class="rename-row__check"
                type="checkbox"
                :checked="isSelected(rename) && !plannedPaths.has(rename.path)"
                :disabled="plannedPaths.has(rename.path)"
                :aria-label="`选择 ${rename.originalName}`"
                @change="toggle(rename)"
              />
              <div class="rename-row__main">
                <div class="rename-row__names">
                  <span class="rename-row__from" :title="rename.originalName">{{ rename.originalName }}</span>
                  <AppIcon name="arrow-right" :size="12" />
                  <span class="rename-row__to" :title="rename.newName">{{ rename.newName }}</span>
                </div>
                <div class="rename-row__meta">
                  <span class="mono" :title="rename.path">/{{ rename.path }}</span>
                  <span>{{ rename.reason }}</span>
                </div>
              </div>
              <span v-if="plannedPaths.has(rename.path)" class="badge badge--muted">已在计划</span>
            </li>
          </ul>
          <p v-if="report.renames.length === 0" class="section__hint">当前结构未识别出可命名的组件角色。</p>
          <p v-if="hiddenRenames > 0" class="section__hint">仅显示前 {{ MAX_RENAME_ROWS }} 项，另有 {{ hiddenRenames }} 项未展示。</p>
        </section>

        <section class="section">
          <header class="section__header">
            <h4>AI 语义命名</h4>
            <span class="section__meta">{{ aiCandidates.length }} 个候选</span>
          </header>
          <div v-if="aiCandidates.length > 0" class="callout">
            <AppIcon class="callout__icon" name="info" :size="14" />
            <div>
              结构规则无法判断的通用名图层可导出为 AI 命名任务。提示词包含图层路径、名称、尺寸
              与文本，不含像素；导入 JSON 后需人工审核才会进入计划。
            </div>
          </div>
          <button
            class="btn btn--ghost btn--sm cleanup-ai"
            type="button"
            :disabled="session.layerList.length === 0"
            @click="aiDialogOpen = true"
          >
            <AppIcon name="sparkles" :size="13" />
            AI 语义命名{{ aiCandidates.length > 0 ? `（${aiCandidates.length}）` : "" }}
          </button>
          <p v-if="aiCandidates.length === 0" class="section__hint">
            没有待 AI 命名的通用图层。
          </p>
        </section>

        <section class="section">
          <header class="section__header">
            <h4>待复核</h4>
            <span class="section__meta">{{ report.summary.duplicateNames }} 重名 · {{ report.summary.genericNames }} 通用名</span>
          </header>
          <div v-if="findingRules.length > 0" class="rule-chips">
            <span v-for="item in findingRules" :key="item.rule" class="badge badge--warn">
              {{ item.label }} {{ item.count }}
            </span>
          </div>
          <ul v-if="visibleFindings.length > 0" class="finding-list">
            <li v-for="finding in visibleFindings" :key="finding.id" class="finding-row">
              <span class="finding-row__rule">{{ RULE_LABELS[finding.rule] }}</span>
              <div class="finding-row__text">
                <span v-if="finding.path" class="mono">/{{ finding.path }}</span>
                <p>{{ finding.message }}</p>
              </div>
            </li>
          </ul>
          <p v-else class="section__hint">未发现空组、单子组、同级重名或通用名称。</p>
          <p v-if="hiddenFindings > 0" class="section__hint">另有 {{ hiddenFindings }} 条未展示。</p>
        </section>

        <section class="section">
          <header class="section__header">
            <h4>逻辑编组建议</h4>
            <span class="section__meta">{{ report.summary.groups }} 组</span>
            <button
              v-if="report.groups.length > 0"
              class="btn btn--ghost btn--sm cleanup-group-apply"
              type="button"
              :disabled="!session.canEdit || grouping || Boolean(session.busy)"
              @click="groupAll"
            >
              <AppIcon :name="grouping ? 'loader' : 'layers'" :size="13" :class="{ spin: grouping }" />
              一键编组（{{ report.groups.length }}）
            </button>
          </header>
          <div v-if="report.groups.length > 0" class="callout callout--warn">
            <AppIcon class="callout__icon" name="info" :size="14" />
            <div>
              一键编组会把成员写入当前 Patchy/演示引擎的文档内存，并同步写入 Design IR
              （logicalGroups / logicalGroupId）供 AI 拆分组件；尚未保存到 PSD，需执行“保存并重开”。
            </div>
          </div>
          <ul v-if="report.groups.length > 0" class="group-list">
            <li v-for="group in report.groups" :key="group.id" class="group-card cleanup-group">
              <div class="group-card__top">
                <strong>{{ group.suggestedName }}</strong>
                <span class="badge badge--outline">{{ group.memberNames.length }} 个图层</span>
              </div>
              <p class="group-card__members">
                {{ group.memberNames.join("、") }}
              </p>
              <p class="group-card__meta">
                父级 {{ group.parentName ?? "根图层" }} · {{ group.bounds.width }}×{{ group.bounds.height }} ·
                {{ layoutSummary(group.layout) }}
              </p>
              <div class="cleanup-card-actions">
                <button
                  class="btn btn--ghost btn--sm"
                  type="button"
                  :disabled="!session.canEdit || grouping || Boolean(session.busy)"
                  @click="groupOne(group)"
                >
                  <AppIcon name="layers" :size="12" />
                  仅编组这一组
                </button>
              </div>
            </li>
          </ul>
          <p v-else class="section__hint">没有发现需要编组的相邻同级图层。</p>
        </section>

        <section class="section">
          <header class="section__header">
            <h4>合并候选</h4>
            <span class="section__meta">{{ report.summary.merges }} 组</span>
            <button
              v-if="report.mergeCandidates.length > 0"
              class="btn btn--ghost btn--sm cleanup-merge-apply"
              type="button"
              :disabled="!session.canEdit || merging || Boolean(session.busy)"
              @click="mergeAll"
            >
              <AppIcon :name="merging ? 'loader' : 'package'" :size="13" :class="{ spin: merging }" />
              一键合并（{{ report.mergeCandidates.length }}）
            </button>
          </header>
          <div v-if="report.mergeCandidates.length > 0" class="callout callout--warn">
            <AppIcon class="callout__icon" name="info" :size="14" />
            <div>这些紧凑组的结构角色为角标、按钮、输入框或图标按钮等组件，适合合并为单层素材。合并会把组内图层栅格化为一个图层并写入当前引擎内存；导出资产包时仍会为每组生成 <code>merged/</code> 合成裁剪图。</div>
          </div>
          <ul v-if="visibleMerges.length > 0" class="group-list">
            <li v-for="merge in visibleMerges" :key="merge.id" class="group-card cleanup-merge">
              <div class="group-card__top">
                <strong>{{ merge.suggestedName }}</strong>
                <span class="badge badge--outline">{{ merge.kind === "badge" ? "角标" : "组件" }}</span>
              </div>
              <p class="group-card__members">{{ merge.memberNames.join("、") }}</p>
              <p class="group-card__meta">
                /{{ merge.path }} · {{ merge.bounds.width }}×{{ merge.bounds.height }} ·
                {{ layoutSummary(merge.layout) }} · 占画布 {{ (merge.areaRatio * 100).toFixed(1) }}%
              </p>
              <p class="group-card__meta">{{ merge.reason }}</p>
              <div class="cleanup-card-actions">
                <button
                  class="btn btn--ghost btn--sm"
                  type="button"
                  :disabled="!session.canEdit || merging || Boolean(session.busy)"
                  @click="mergeOne(merge)"
                >
                  <AppIcon name="package" :size="12" />
                  仅合并这一组
                </button>
              </div>
            </li>
          </ul>
          <p v-else class="section__hint">没有发现尺寸紧凑、结构角色可合并的组件组。</p>
          <p v-if="hiddenMerges > 0" class="section__hint">另有 {{ hiddenMerges }} 个未展示，导出清单会包含全部候选。</p>
        </section>

        <section class="section">
          <header class="section__header">
            <h4>切图候选</h4>
            <span class="section__meta">{{ report.summary.slices }} 个</span>
          </header>
          <ul v-if="visibleSlices.length > 0" class="slice-list">
            <li v-for="slice in visibleSlices" :key="slice.path" class="slice-row cleanup-slice">
              <div class="slice-row__main">
                <span class="slice-row__name" :title="slice.name">{{ slice.name }}</span>
                <span class="slice-row__file mono">{{ slice.fileName }}</span>
              </div>
              <div class="slice-row__meta">
                <span class="badge badge--outline">{{ layerKindLabel(slice.kind) }}</span>
                <span class="mono">{{ slice.bounds.width }}×{{ slice.bounds.height }}</span>
                <span class="mono">{{ slice.bounds.width * 2 }}×{{ slice.bounds.height * 2 }} @2x</span>
              </div>
            </li>
          </ul>
          <p v-else class="section__hint">没有符合规则的可见图形候选。</p>
          <p v-if="hiddenSlices > 0" class="section__hint">另有 {{ hiddenSlices }} 个未展示，导出清单会包含全部候选。</p>
        </section>

        <div class="footnote">
          <AppIcon name="info" :size="13" />
          资产包从 PSD 扁平合成图裁切，含 1x/@2x PNG、页面对比、IR 与 AI 编码上下文；
          不是逐图层隔离渲染，也不构成 Patchy 或 Photoshop 证据。编组与合并会先写入当前引擎内存，
          必须另存为新 PSD 并重开后才算持久化。
        </div>
      </template>
    </div>
    <AiNamingDialog
      :open="aiDialogOpen"
      @close="aiDialogOpen = false"
      @applied="onAiApplied"
    />
  </section>
</template>

<style scoped>
.cleanup-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.cleanup-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--border);
}

.cleanup-panel__body {
  flex: 1;
  overflow: auto;
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.intro {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
}

.intro__title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--accent-2);
}

.intro p {
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--muted);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.actions .btn {
  flex: 1 1 auto;
}

.stats-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 5px;
}

.stat-chip {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
}

.stat-chip__value {
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  color: var(--text);
}

.stat-chip__label {
  font-size: 10px;
  color: var(--muted);
}

.cleanup-empty {
  padding: 30px 12px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.section__header h4 {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-2);
}

.section__meta {
  font-size: 10px;
  color: var(--muted);
}

.section__hint {
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--muted);
}

.select-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  color: var(--text-2);
  cursor: pointer;
}

.rename-list,
.finding-list,
.group-list,
.slice-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rename-row {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 7px 8px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
}

.rename-row.is-planned {
  opacity: 0.65;
}

.rename-row__check {
  margin-top: 2px;
  flex: 0 0 auto;
}

.rename-row__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rename-row__names {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  font-size: 11.5px;
}

.rename-row__from {
  max-width: 44%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  text-decoration: line-through;
}

.rename-row__to {
  max-width: 52%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--accent-2);
  font-weight: 650;
}

.rename-row__meta {
  display: flex;
  gap: 7px;
  min-width: 0;
  font-size: 9.5px;
  color: var(--muted);
}

.rename-row__meta .mono {
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rule-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.finding-row {
  display: flex;
  gap: 7px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  font-size: 10.5px;
  line-height: 1.45;
}

.finding-row__rule {
  flex: 0 0 auto;
  color: var(--warn);
  font-weight: 650;
}

.finding-row__text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.finding-row__text .mono {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: 9.5px;
}

.group-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 9px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
}

.group-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11.5px;
}

.group-card__members {
  font-size: 10.5px;
  line-height: 1.45;
  color: var(--text-2);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.group-card__meta {
  font-size: 9.5px;
  color: var(--muted);
}

.cleanup-card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 3px;
}

.slice-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 7px 8px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
}

.slice-row__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.slice-row__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  font-weight: 600;
}

.slice-row__file {
  flex: 0 0 auto;
  max-width: 52%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 9.5px;
  color: var(--accent-2);
}

.slice-row__meta {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 9.5px;
  color: var(--muted);
}

.footnote {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  padding-top: 2px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--muted);
}
</style>
