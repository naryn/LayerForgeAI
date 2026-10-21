<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { RevisionRecord } from "@/lib/domain";
import { toSavedPath } from "@/lib/normalize";
import { useSessionStore } from "@/stores/session";
import AppIcon from "./AppIcon.vue";
import ModalDialog from "./ModalDialog.vue";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  close: [];
  saved: [revision: RevisionRecord];
}>();

const session = useSessionStore();
const fileName = ref("");
const error = ref<string | null>(null);
const saving = ref(false);

const pathPreview = computed(() => {
  try {
    return toSavedPath(fileName.value);
  } catch {
    return "—";
  }
});

const canSubmit = computed(() => {
  if (!fileName.value.trim() || saving.value || session.busy) return false;
  try {
    toSavedPath(fileName.value);
    return true;
  } catch {
    return false;
  }
});

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    fileName.value = session.suggestedSaveName();
    error.value = null;
    saving.value = false;
  },
);

function setFileBase(base: string): void {
  fileName.value = `${base}.psd`;
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  error.value = null;
  saving.value = true;
  try {
    const revision = await session.saveAndReopen(fileName.value);
    if (revision) {
      emit("saved", revision);
      emit("close");
    } else {
      error.value = session.error ?? "保存并重开失败";
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <ModalDialog
    :open="open"
    title="保存并重开校验"
    subtitle="在新路径另存 PSD，关闭后重新打开，验证命名是否真正持久化。"
    :close-on-backdrop="!saving"
    @close="!saving && emit('close')"
  >
    <form id="save-project-form" class="save-form" @submit.prevent="submit">
      <div class="field">
        <label for="save-file-name">新文件名</label>
        <div class="name-row">
          <input
            id="save-file-name"
            v-model="fileName"
            class="input input--mono"
            type="text"
            spellcheck="false"
            placeholder="project-normalized.psd"
            :disabled="saving"
            data-autofocus
          />
          <button
            class="btn btn--ghost btn--sm"
            type="button"
            title="使用当前时间戳重新生成"
            :disabled="saving"
            @click="setFileBase(session.suggestedSaveName().replace(/\.psd$/i, ''))"
          >
            重新生成
          </button>
        </div>
        <span class="field-hint">
          保存路径：<span class="mono">{{ pathPreview }}</span>
        </span>
      </div>

      <div v-if="session.isSimulated" class="callout callout--warn">
        <AppIcon class="callout__icon" name="warning" :size="15" />
        <div>
          <div class="callout__title">当前是演示引擎</div>
          演示模式只模拟保存与重开流程，不会生成真实 PSD 文件，也不能作为 Patchy 或 Photoshop
          兼容性证据。
        </div>
      </div>
      <div v-else class="callout callout--accent">
        <AppIcon class="callout__icon" name="info" :size="15" />
        <div>
          <div class="callout__title">不会覆盖源文件</div>
          仅允许写入新的 <span class="mono">/saved/*.psd</span> 或
          <span class="mono">*.psb</span> 路径；若路径已存在，Patchy 会拒绝覆盖。保存完成后 PSD
          下载由 Patchy 自己的保存协调器发起。
        </div>
      </div>

      <div class="field">
        <span class="field-label">将执行</span>
        <ol class="steps">
          <li>应用当前命名计划后，另存为上述新路径。</li>
          <li>关闭原文档并重新打开保存结果。</li>
          <li>按图层路径核对计划项，并记录版本快照。</li>
        </ol>
      </div>

      <p v-if="error" class="form-error">
        <AppIcon name="warning" :size="14" />
        {{ error }}
      </p>
    </form>

    <template #footer>
      <button class="btn btn--ghost" type="button" :disabled="saving" @click="emit('close')">
        取消
      </button>
      <button
        class="btn btn--primary"
        type="submit"
        form="save-project-form"
        :disabled="!canSubmit"
      >
        <AppIcon :name="saving ? 'loader' : 'save'" :size="15" :class="{ spin: saving }" />
        {{ saving ? "正在保存并重开…" : "保存并重开" }}
      </button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.save-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.name-row {
  display: flex;
  gap: 8px;
}

.name-row .input {
  flex: 1;
  min-width: 0;
}

.steps {
  margin: 0;
  padding-left: 18px;
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.7;
}

.form-error {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 9px 11px;
  border: 1px solid var(--danger-border);
  border-radius: 8px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 12px;
  line-height: 1.5;
}
</style>
