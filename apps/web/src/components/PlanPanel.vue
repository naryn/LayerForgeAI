<script setup lang="ts">
import { computed, ref } from "vue";
import type { PlanEntry, PlanStatus } from "@/lib/domain";
import { useSessionStore } from "@/stores/session";
import AppIcon from "./AppIcon.vue";

const session = useSessionStore();
const stats = computed(() => session.stats);
const pending = computed(() => stats.value.pending);
const editingId = ref<string | null>(null);
const editDraft = ref("");
const removingId = ref<string | null>(null);

const STATUS_LABELS: Record<PlanStatus, string> = {
  draft: "草稿",
  applied: "已应用",
  verified: "已验证",
  failed: "失败",
};

const STATUS_CLASSES: Record<PlanStatus, string> = {
  draft: "badge--muted",
  applied: "badge--accent",
  verified: "badge--success",
  failed: "badge--danger",
};

const progressPercent = computed(() => {
  const progress = session.planProgress;
  if (!progress || progress.total === 0) return 0;
  return Math.round((progress.done / progress.total) * 100);
});

function startEdit(entry: PlanEntry): void {
  editingId.value = entry.id;
  editDraft.value = entry.newName;
}

function cancelEdit(): void {
  editingId.value = null;
  editDraft.value = "";
}

async function commitEdit(entry: PlanEntry): Promise<void> {
  const nextName = editDraft.value.trim();
  if (!nextName || nextName === entry.newName) {
    cancelEdit();
    return;
  }
  const ok = await session.setPlanEntryName(entry.id, nextName);
  if (ok) cancelEdit();
}

async function remove(entry: PlanEntry): Promise<void> {
  removingId.value = entry.id;
  try {
    await session.removePlanEntry(entry.id);
  } finally {
    removingId.value = null;
  }
}

async function applyPlan(): Promise<void> {
  await session.applyPlan();
}

async function clearVerified(): Promise<void> {
  await session.clearVerifiedPlan();
}
</script>

<template>
  <section class="plan-panel panel">
    <header class="plan-panel__header">
      <span class="panel-title">命名计划</span>
      <span class="badge badge--muted">{{ stats.total }} 项</span>
    </header>

    <div class="plan-panel__body scroll-area">
      <div class="stats-strip">
        <div class="stat-chip">
          <span class="stat-chip__value">{{ stats.draft }}</span>
          <span class="stat-chip__label">草稿</span>
        </div>
        <div class="stat-chip">
          <span class="stat-chip__value">{{ stats.applied }}</span>
          <span class="stat-chip__label">已应用</span>
        </div>
        <div class="stat-chip stat-chip--success">
          <span class="stat-chip__value">{{ stats.verified }}</span>
          <span class="stat-chip__label">已验证</span>
        </div>
        <div class="stat-chip" :class="{ 'stat-chip--danger': stats.failed > 0 }">
          <span class="stat-chip__value">{{ stats.failed }}</span>
          <span class="stat-chip__label">失败</span>
        </div>
      </div>

      <div class="actions">
        <button
          class="btn btn--primary btn--sm"
          type="button"
          :disabled="!session.canEdit || pending === 0 || Boolean(session.busy)"
          @click="applyPlan"
        >
          <AppIcon
            :name="session.busy === '应用重命名计划' ? 'loader' : 'play'"
            :size="13"
            :class="{ spin: session.busy === '应用重命名计划' }"
          />
          {{ pending > 0 ? `应用 ${pending} 项` : "没有待处理项" }}
        </button>
        <button
          class="btn btn--ghost btn--sm"
          type="button"
          :disabled="stats.verified === 0 || Boolean(session.busy)"
          @click="clearVerified"
        >
          清除已验证
        </button>
      </div>

      <div v-if="session.planProgress" class="progress-block">
        <div class="progress-block__meta">
          <span>{{ session.busy }}</span>
          <span class="mono">{{ session.planProgress.done }}/{{ session.planProgress.total }}</span>
        </div>
        <div class="progress">
          <div class="progress__bar" :style="{ width: `${progressPercent}%` }"></div>
        </div>
      </div>

      <div v-if="!session.canEdit" class="callout callout--warn">
        <AppIcon class="callout__icon" name="lock" :size="14" />
        <div>当前引擎为只读或尚未连接，计划可以编辑，但无法应用。请连接 Patchy 或演示引擎。</div>
      </div>

      <div v-if="session.plan.length === 0" class="empty-state plan-empty">
        <span class="empty-state__icon"><AppIcon name="sparkles" :size="20" /></span>
        <h3>还没有命名计划</h3>
        <p>在图层检查器中选中图层，输入目标名称并加入计划。计划会保存在本机 IndexedDB。</p>
      </div>

      <ol v-else class="plan-list">
        <li v-for="entry in session.plan" :key="entry.id" class="plan-item">
          <div class="plan-item__top">
            <span class="badge" :class="STATUS_CLASSES[entry.status]">
              {{ STATUS_LABELS[entry.status] }}
            </span>
            <span class="plan-item__path mono" :title="entry.path">/{{ entry.path }}</span>
            <div class="plan-item__actions">
              <button
                v-if="entry.status === 'draft' || entry.status === 'failed'"
                class="icon-action"
                type="button"
                title="编辑目标名称"
                aria-label="编辑目标名称"
                @click="startEdit(entry)"
              >
                <AppIcon name="edit" :size="13" />
              </button>
              <button
                v-if="entry.status === 'draft' || entry.status === 'failed'"
                class="icon-action icon-action--danger"
                type="button"
                title="从计划移除"
                aria-label="从计划移除"
                :disabled="removingId === entry.id || Boolean(session.busy)"
                @click="remove(entry)"
              >
                <AppIcon
                  :name="removingId === entry.id ? 'loader' : 'trash'"
                  :size="13"
                  :class="{ spin: removingId === entry.id }"
                />
              </button>
            </div>
          </div>

          <div v-if="editingId === entry.id" class="plan-item__editor">
            <input
              v-model="editDraft"
              class="input input--mono"
              type="text"
              maxlength="200"
              autofocus
              aria-label="计划目标名称"
              @keydown.enter.prevent="commitEdit(entry)"
              @keydown.esc.prevent="cancelEdit"
            />
            <button class="btn btn--primary btn--sm" type="button" @click="commitEdit(entry)">
              保存
            </button>
            <button class="btn btn--ghost btn--sm" type="button" @click="cancelEdit">
              取消
            </button>
          </div>
          <div v-else class="plan-item__names">
            <span class="plan-item__from" :title="entry.originalName">{{ entry.originalName }}</span>
            <AppIcon name="arrow-right" :size="13" />
            <span class="plan-item__to" :title="entry.newName">{{ entry.newName }}</span>
          </div>

          <p v-if="entry.note" class="plan-item__note">{{ entry.note }}</p>
        </li>
      </ol>

      <div class="plan-panel__footnote">
        <AppIcon name="info" :size="13" />
        应用只修改当前引擎内存；必须执行“保存并重开”才会验证持久化。
      </div>
    </div>
  </section>
</template>

<style scoped>
.plan-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.plan-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--border);
}

.plan-panel__body {
  flex: 1;
  overflow: auto;
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stats-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
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

.stat-chip--success .stat-chip__value {
  color: var(--success);
}

.stat-chip--danger .stat-chip__value {
  color: var(--danger);
}

.actions {
  display: flex;
  gap: 6px;
}

.actions .btn {
  flex: 1;
}

.progress-block {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.progress-block__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 10.5px;
  color: var(--muted);
}

.plan-empty {
  padding: 32px 12px;
}

.plan-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.plan-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  transition: border-color 120ms ease, box-shadow 120ms ease;
}

.plan-item:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
}

.plan-item__top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.plan-item__path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--muted);
}

.plan-item__actions {
  display: flex;
  gap: 1px;
  flex: 0 0 auto;
}

.icon-action {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
}

.icon-action:hover {
  background: var(--surface-3);
  color: var(--text);
}

.icon-action--danger:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.icon-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.plan-item__names {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
}

.plan-item__from {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  text-decoration: line-through;
}

.plan-item__to {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--accent-2);
  font-weight: 650;
}

.plan-item__editor {
  display: flex;
  gap: 5px;
}

.plan-item__editor .input {
  flex: 1;
  min-width: 0;
  height: 30px;
}

.plan-item__note {
  padding: 5px 7px;
  border-radius: 5px;
  background: var(--surface-2);
  color: var(--warn);
  font-size: 10.5px;
  line-height: 1.45;
}

.plan-panel__footnote {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  padding-top: 2px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--muted);
}
</style>
