<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ProjectRecord } from "@/lib/domain";
import { formatBytes } from "@/lib/format";
import { defaultProjectName, useProjectsStore } from "@/stores/projects";
import AppIcon from "./AppIcon.vue";
import ModalDialog from "./ModalDialog.vue";

const props = defineProps<{
  open: boolean;
  initialFile?: File | null;
}>();

const emit = defineEmits<{
  close: [];
  imported: [project: ProjectRecord];
}>();

const projects = useProjectsStore();
const file = ref<File | null>(null);
const name = ref("");
const error = ref<string | null>(null);
const dragging = ref(false);
const busy = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const previousSuggestion = ref("");

const fileName = computed(() => file.value?.name ?? "");
const sizeLabel = computed(() => (file.value ? formatBytes(file.value.size) : ""));

function isPsd(file: File): boolean {
  return /\.(psd|psb)$/i.test(file.name);
}

function pick(candidate: File | undefined): void {
  if (!candidate) return;
  error.value = null;
  if (!isPsd(candidate)) {
    error.value = "仅支持 .psd 或 .psb 文件";
    return;
  }
  const suggested = defaultProjectName(candidate.name);
  if (!name.value.trim() || name.value === previousSuggestion.value) {
    name.value = suggested;
  }
  previousSuggestion.value = suggested;
  file.value = candidate;
}

function onFileChange(event: Event): void {
  pick((event.target as HTMLInputElement).files?.[0]);
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  pick(event.dataTransfer?.files?.[0]);
}

function reset(): void {
  file.value = props.initialFile ?? null;
  const suggestion = file.value ? defaultProjectName(file.value.name) : "";
  name.value = suggestion;
  previousSuggestion.value = suggestion;
  error.value = null;
  dragging.value = false;
  busy.value = false;
  if (fileInput.value) fileInput.value.value = "";
}

watch(
  () => props.open,
  (open) => {
    if (open) reset();
  },
);

async function submit(): Promise<void> {
  if (busy.value) return;
  if (!file.value) {
    error.value = "请选择一个 PSD 或 PSB 文件";
    return;
  }
  busy.value = true;
  error.value = null;
  try {
    const project = await projects.createFromFile(file.value, name.value);
    emit("imported", project);
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <ModalDialog
    :open="open"
    title="导入 PSD 项目"
    subtitle="源文件只保存在本机 IndexedDB，不会上传到服务器。"
    :close-on-backdrop="!busy"
    @close="!busy && emit('close')"
  >
    <form id="import-project-form" class="import-form" @submit.prevent="submit">
      <div
        class="dropzone"
        :class="{ 'is-dragging': dragging, 'has-file': file }"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <input
          ref="fileInput"
          id="import-file"
          class="file-input"
          type="file"
          accept=".psd,.psb,image/vnd.adobe.photoshop"
          :disabled="busy"
          @change="onFileChange"
        />
        <label for="import-file" class="dropzone__label">
          <span class="dropzone__icon">
            <AppIcon name="upload" :size="20" />
          </span>
          <template v-if="file">
            <strong class="dropzone__name">{{ fileName }}</strong>
            <span class="dropzone__meta">{{ sizeLabel }} · 点击可重新选择</span>
          </template>
          <template v-else>
            <strong class="dropzone__name">选择或拖入 PSD / PSB</strong>
            <span class="dropzone__meta">支持最大 1.5 GB；仅本地只读解析</span>
          </template>
        </label>
      </div>

      <div class="field">
        <label for="import-name">项目名称</label>
        <input
          id="import-name"
          v-model="name"
          class="input"
          type="text"
          maxlength="80"
          placeholder="例如：首页视觉稿"
          :disabled="busy"
          data-autofocus
        />
      </div>

      <div class="callout callout--accent">
        <AppIcon class="callout__icon" name="info" :size="15" />
        <div>
          <div class="callout__title">导入会做什么</div>
          使用文件头校验格式，并用 ag-psd 只读解析图层树。本步骤不会修改 PSD、不会压缩图像，也不代表
          Patchy 或 Photoshop 兼容性已验证。
        </div>
      </div>

      <p v-if="error" class="form-error">
        <AppIcon name="warning" :size="14" />
        {{ error }}
      </p>
    </form>

    <template #footer>
      <button class="btn btn--ghost" type="button" :disabled="busy" @click="emit('close')">
        取消
      </button>
      <button
        class="btn btn--primary"
        type="submit"
        form="import-project-form"
        :disabled="busy || !file"
      >
        <AppIcon :name="busy ? 'loader' : 'upload'" :size="15" :class="{ spin: busy }" />
        {{ busy ? "正在导入…" : "导入并打开" }}
      </button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.import-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dropzone {
  position: relative;
  border: 1.5px dashed var(--border-strong);
  border-radius: 11px;
  background: var(--surface-2);
  transition: border-color 140ms ease, background 140ms ease;
}

.dropzone:hover,
.dropzone.is-dragging {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.dropzone.has-file {
  border-style: solid;
  border-color: var(--success-border);
  background: var(--success-soft);
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.dropzone__label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 24px 18px;
  cursor: pointer;
  text-align: center;
}

.dropzone__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  margin-bottom: 4px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--accent);
}

.dropzone.has-file .dropzone__icon {
  border-color: var(--success-border);
  color: var(--success);
}

.dropzone__name {
  font-size: 13px;
  color: var(--text);
  overflow-wrap: anywhere;
}

.dropzone__meta {
  font-size: 11.5px;
  color: var(--muted);
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
