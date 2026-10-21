<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { LayerKind } from "@/lib/domain";
import type { PlanStatus } from "@/lib/domain";
import { layerKindLabel } from "@/lib/layers";
import { useSessionStore } from "@/stores/session";
import AppIcon from "./AppIcon.vue";
import type { IconName } from "./icons";

const emit = defineEmits<{ "open-plan": [] }>();

const session = useSessionStore();
const layer = computed(() => session.selectedLayer);
const planEntry = computed(() =>
  layer.value ? session.plan.find((entry) => entry.path === layer.value?.path) : undefined,
);

const KIND_ICONS: Record<LayerKind, IconName> = {
  group: "group",
  pixel: "image",
  text: "text",
  adjustment: "adjustment",
  shape: "shape",
  "smart-object": "smart-object",
  unknown: "layers",
};

const STATUS_LABELS: Record<PlanStatus, string> = {
  draft: "草稿",
  applied: "已应用",
  verified: "已验证",
  failed: "失败",
};

const renameDraft = ref("");
const planDraft = ref("");
const renameBusy = ref(false);
const planBusy = ref(false);

const kindIcon = computed(() => (layer.value ? KIND_ICONS[layer.value.kind] : "layers"));
const canRename = computed(() => {
  const target = layer.value;
  const trimmed = renameDraft.value.trim();
  return Boolean(
    target &&
      session.canEdit &&
      !session.busy &&
      trimmed &&
      trimmed !== target.name,
  );
});
const canPlan = computed(() => {
  const target = layer.value;
  const trimmed = planDraft.value.trim();
  return Boolean(target && !session.busy && trimmed && trimmed !== target.name);
});
const destination = computed(() => planDraft.value.trim() || "—");

watch(
  () => [layer.value?.id, layer.value?.name] as const,
  () => {
    renameDraft.value = layer.value?.name ?? "";
  },
  { immediate: true },
);

watch(
  () => [layer.value?.path, planEntry.value?.newName] as const,
  () => {
    planDraft.value = planEntry.value?.newName ?? "";
  },
  { immediate: true },
);

async function submitRename(): Promise<void> {
  const target = layer.value;
  if (!target || !canRename.value) return;
  const nextName = renameDraft.value.trim();
  renameBusy.value = true;
  try {
    const ok = await session.renameLayer(target.id, nextName);
    if (ok) renameDraft.value = nextName;
  } finally {
    renameBusy.value = false;
  }
}

async function submitPlan(): Promise<void> {
  const target = layer.value;
  if (!target || !canPlan.value) return;
  const nextName = planDraft.value.trim();
  planBusy.value = true;
  try {
    const ok = await session.addPlanEntry(target, nextName);
    if (ok) {
      planDraft.value = nextName;
      emit("open-plan");
    }
  } finally {
    planBusy.value = false;
  }
}
</script>

<template>
  <section class="inspector panel">
    <header class="inspector__header">
      <span class="panel-title">图层检查器</span>
      <span v-if="layer" class="badge badge--muted">{{ layerKindLabel(layer.kind) }}</span>
    </header>

    <div v-if="!layer" class="empty-state inspector__empty">
      <span class="empty-state__icon"><AppIcon name="circle-dot" :size="20" /></span>
      <h3>未选择图层</h3>
      <p>在左侧图层树中选择一个节点，查看属性、重命名或加入命名计划。</p>
    </div>

    <div v-else class="inspector__body scroll-area">
      <section class="layer-hero">
        <span class="layer-hero__icon" :class="`kind-${layer.kind}`">
          <AppIcon :name="kindIcon" :size="18" />
        </span>
        <div class="layer-hero__text">
          <h3 :title="layer.name">{{ layer.name }}</h3>
          <p class="mono" :title="layer.path">/{{ layer.path }}</p>
        </div>
      </section>

      <div class="flag-row">
        <span class="badge" :class="layer.visible ? 'badge--success' : 'badge--muted'">
          <AppIcon :name="layer.visible ? 'eye' : 'eye-off'" :size="12" />
          {{ layer.visible ? "可见" : "隐藏" }}
        </span>
        <span v-if="layer.locked" class="badge badge--warn">
          <AppIcon name="lock" :size="12" /> 锁定
        </span>
        <span v-if="layer.clipping" class="badge badge--outline">剪贴蒙版</span>
        <span v-if="layer.children.length" class="badge badge--outline">
          {{ layer.children.length }} 个子图层
        </span>
      </div>

      <div v-if="session.isInspect" class="callout callout--warn">
        <AppIcon class="callout__icon" name="lock" :size="15" />
        <div>
          <div class="callout__title">本地只读检查</div>
          当前图层树来自 ag-psd 解析，只能查看和编辑本地命名计划，不能回写 PSD。连接 Patchy
          引擎后才能执行重命名与保存。
        </div>
      </div>

      <div v-if="session.isSimulated" class="callout callout--warn">
        <AppIcon class="callout__icon" name="warning" :size="15" />
        <div>
          <div class="callout__title">演示引擎</div>
          修改仅存在于内存，不会生成 PSD，也不能作为 Patchy 或 Photoshop 兼容性证据。
        </div>
      </div>

      <section class="section">
        <header class="section__header">
          <h4>直接重命名</h4>
          <span v-if="!session.canEdit" class="badge badge--muted">只读</span>
        </header>
        <form class="rename-form" @submit.prevent="submitRename">
          <input
            v-model="renameDraft"
            class="input"
            type="text"
            maxlength="200"
            aria-label="图层新名称"
            :disabled="!session.canEdit || Boolean(session.busy) || renameBusy"
            :placeholder="session.canEdit ? '输入新的图层名' : '连接可写引擎后可重命名'"
            data-autofocus
          />
          <button
            class="btn btn--primary btn--sm"
            type="submit"
            :disabled="!canRename || renameBusy"
          >
            <AppIcon
              :name="renameBusy ? 'loader' : 'edit'"
              :size="13"
              :class="{ spin: renameBusy }"
            />
            重命名
          </button>
        </form>
        <p class="section__hint">
          直接重命名会立刻作用于当前引擎文档，并刷新 revision。需要“保存并重开”后才算持久化。
        </p>
      </section>

      <section class="section">
        <header class="section__header">
          <h4>命名计划</h4>
          <span v-if="planEntry" class="badge" :class="planEntry.status === 'failed' ? 'badge--danger' : planEntry.status === 'verified' ? 'badge--success' : 'badge--accent'">
            {{ STATUS_LABELS[planEntry.status] }}
          </span>
        </header>

        <div v-if="planEntry" class="plan-current">
          <div class="plan-current__names">
            <span class="plan-current__from">{{ planEntry.originalName }}</span>
            <AppIcon name="arrow-right" :size="13" />
            <span class="plan-current__to">{{ planEntry.newName }}</span>
          </div>
          <p v-if="planEntry.note" class="plan-current__note">{{ planEntry.note }}</p>
        </div>

        <form class="rename-form" @submit.prevent="submitPlan">
          <input
            v-model="planDraft"
            class="input"
            type="text"
            maxlength="200"
            aria-label="计划中的新名称"
            placeholder="计划使用的语义化名称"
            :disabled="Boolean(session.busy) || planBusy || planEntry?.status === 'verified'"
          />
          <button
            class="btn btn--sm"
            type="submit"
            :disabled="!canPlan || planBusy || planEntry?.status === 'verified'"
          >
            <AppIcon :name="planBusy ? 'loader' : planEntry ? 'refresh' : 'plus'" :size="13" :class="{ spin: planBusy }" />
            {{ planEntry ? "更新" : "加入" }}
          </button>
        </form>
        <p class="section__hint">
          计划保存在本机，不会立即修改文档。目标名称：<span class="mono">{{ destination }}</span>
        </p>
        <button
          v-if="planEntry"
          class="link-button"
          type="button"
          @click="emit('open-plan')"
        >
          在命名计划中查看
          <AppIcon name="arrow-right" :size="12" />
        </button>
      </section>

      <section class="section">
        <header class="section__header">
          <h4>属性</h4>
        </header>
        <div class="kv-list">
          <div class="kv-row">
            <span class="kv-key">类型</span>
            <span class="kv-value">{{ layerKindLabel(layer.kind) }}</span>
          </div>
          <div class="kv-row">
            <span class="kv-key">路径</span>
            <span class="kv-value mono">/{{ layer.path }}</span>
          </div>
          <div class="kv-row">
            <span class="kv-key">图层 ID</span>
            <span class="kv-value mono" :title="layer.id">{{ layer.id }}</span>
          </div>
          <div class="kv-row">
            <span class="kv-key">边界</span>
            <span class="kv-value mono">
              <template v-if="layer.bounds">
                {{ layer.bounds.width }}×{{ layer.bounds.height }} @ ({{ layer.bounds.x }},
                {{ layer.bounds.y }})
              </template>
              <template v-else>—</template>
            </span>
          </div>
          <div class="kv-row">
            <span class="kv-key">不透明度</span>
            <span class="kv-value">{{ layer.opacity }}%</span>
          </div>
          <div class="kv-row">
            <span class="kv-key">混合模式</span>
            <span class="kv-value">{{ layer.blendMode ?? "—" }}</span>
          </div>
          <div v-if="layer.meta" class="kv-row">
            <span class="kv-key">附加信息</span>
            <span class="kv-value">
              <span v-for="(value, key) in layer.meta" :key="key" class="meta-tag">
                {{ key }}={{ value }}
              </span>
            </span>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.inspector {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.inspector__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--border);
}

.inspector__empty {
  flex: 1;
}

.inspector__body {
  flex: 1;
  overflow: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.layer-hero {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.layer-hero__icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--text-2);
  flex: 0 0 auto;
}

.layer-hero__icon.kind-text {
  color: #b7791f;
  background: #fdf8ee;
  border-color: #f0e0c2;
}

.layer-hero__icon.kind-adjustment {
  color: #8b5cf6;
  background: #f7f3ff;
  border-color: #e8defb;
}

.layer-hero__icon.kind-shape {
  color: #0f9f7a;
  background: #eefaf6;
  border-color: #c9eee3;
}

.layer-hero__icon.kind-smart-object {
  color: #c2418e;
  background: #fdf2f8;
  border-color: #f3d4e6;
}

.layer-hero__icon.kind-group {
  color: #5a6b86;
}

.layer-hero__text {
  min-width: 0;
}

.layer-hero__text h3 {
  font-size: 13.5px;
  font-weight: 650;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layer-hero__text p {
  margin-top: 2px;
  font-size: 10.5px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}

.section:first-of-type {
  border-top: 0;
  padding-top: 0;
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

.section__hint {
  font-size: 11px;
  line-height: 1.55;
  color: var(--muted);
}

.rename-form {
  display: flex;
  gap: 6px;
}

.rename-form .input {
  flex: 1;
  min-width: 0;
  height: 32px;
  font-size: 12px;
}

.rename-form .btn {
  flex: 0 0 auto;
}

.plan-current {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
}

.plan-current__names {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--muted);
  min-width: 0;
}

.plan-current__from {
  text-decoration: line-through;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-current__to {
  color: var(--accent-2);
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-current__note {
  margin-top: 4px;
  font-size: 10.5px;
  color: var(--warn);
  line-height: 1.45;
}

.link-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 11.5px;
  font-weight: 600;
}

.link-button:hover {
  text-decoration: underline;
}

.meta-tag {
  display: inline-block;
  margin: 0 4px 3px 0;
  padding: 0 5px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 16px;
}
</style>
