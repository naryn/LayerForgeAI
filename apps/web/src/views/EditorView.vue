<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { LayerNode, ProjectRecord, RevisionRecord } from "@/lib/domain";
import { formatBytes, shortHash, truncateMiddle } from "@/lib/format";
import {
  checkPatchySite,
  PATCHY_SITE_URL,
  type PatchySiteStatus,
} from "@/lib/engine/iframeTransport";
import { useProjectsStore } from "@/stores/projects";
import { useSessionStore } from "@/stores/session";
import ActivityLog from "@/components/ActivityLog.vue";
import AppIcon from "@/components/AppIcon.vue";
import CleanupPanel from "@/components/CleanupPanel.vue";
import HistoryPanel from "@/components/HistoryPanel.vue";
import InspectorPanel from "@/components/InspectorPanel.vue";
import LayerMapPreview from "@/components/LayerMapPreview.vue";
import LayerTree from "@/components/LayerTree.vue";
import PlanPanel from "@/components/PlanPanel.vue";
import SaveAsDialog from "@/components/SaveAsDialog.vue";

type TabKey = "inspector" | "plan" | "cleanup" | "history";

const route = useRoute();
const router = useRouter();
const projects = useProjectsStore();
const session = useSessionStore();

const demoAllowed = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === "1";
const requestedEngine = computed(() => {
  const value = route.query.engine;
  return typeof value === "string" ? value : null;
});

const project = ref<ProjectRecord | null>(null);
const localLayers = ref<LayerNode[]>([]);
const sourceFile = ref<File | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const iframeSrc = ref<string | null>(null);
const iframeEl = ref<HTMLIFrameElement | null>(null);
const patchyStatus = ref<PatchySiteStatus | null>(null);
const activeTab = ref<TabKey>("inspector");
const logOpen = ref(false);
const saveOpen = ref(false);
const retrying = ref(false);

const source = computed(() => project.value?.source ?? null);
const statusText = computed(() => {
  switch (session.status) {
    case "connecting":
      return "连接中…";
    case "ready":
      return "就绪";
    case "error":
      return "错误";
    default:
      return "未连接";
  }
});

const engineDot = computed(() => {
  if (session.status === "connecting") return "dot--warn dot--pulse";
  if (session.mode === "patchy") return session.status === "ready" ? "dot--success" : "dot--warn";
  if (session.mode === "demo") return "dot--warn";
  return "dot--accent";
});

const modeNote = computed(() => {
  if (session.mode === "patchy") return "Patchy 引擎 · 同源 iframe 实时文档";
  if (session.mode === "demo") return "演示结构图 · 非真实渲染，不生成 PSD";
  return "本地结构示意图 · 非真实渲染，只读";
});

const saveDisabled = computed(() => !session.canEdit || Boolean(session.busy));
const saveLabel = computed(() =>
  session.isSimulated ? "模拟保存并重开" : "保存并重开",
);
const previewDisabled = computed(
  () => !session.document || session.isInspect || Boolean(session.busy),
);
const refreshDisabled = computed(
  () => session.status !== "ready" || session.isInspect || Boolean(session.busy),
);
const viewWidth = computed(() => session.document?.width ?? source.value?.width ?? 0);
const viewHeight = computed(() => session.document?.height ?? source.value?.height ?? 0);

const projectMeta = computed(() => {
  const meta = source.value;
  if (!meta) return "";
  return [
    `${meta.width} × ${meta.height}`,
    meta.colorModeLabel,
    `${meta.depth} bit`,
    formatBytes(meta.fileSize),
    `${meta.layerCount} 图层节点`,
  ].join(" · ");
});

function describe(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function selectInitialLayer(): void {
  if (session.selectedLayerId) return;
  const first = session.layerList[0];
  if (first) session.selectLayer(first.id);
}

async function connectPatchy(): Promise<boolean> {
  const record = project.value;
  const file = sourceFile.value;
  if (!record || !file) return false;
  iframeSrc.value = PATCHY_SITE_URL;
  await nextTick();
  const frame = iframeEl.value;
  if (!frame) {
    session.enterInspect(record, localLayers.value, "Patchy iframe 未能挂载");
    iframeSrc.value = null;
    return false;
  }
  const ok = await session.connectPatchy({
    project: record,
    file,
    localLayers: localLayers.value,
    iframe: frame,
  });
  if (!ok) iframeSrc.value = null;
  else selectInitialLayer();
  return ok;
}

async function probeAndConnect(): Promise<void> {
  const record = project.value;
  if (!record || !sourceFile.value) return;
  retrying.value = true;
  session.clearError();
  try {
    const status = await checkPatchySite();
    patchyStatus.value = status;
    if (!status.available) {
      session.enterInspect(
        record,
        localLayers.value,
        status.reason ?? "未检测到可用的 Patchy 构建",
      );
      selectInitialLayer();
      return;
    }
    await connectPatchy();
  } catch (reason) {
    session.enterInspect(record, localLayers.value, describe(reason));
    iframeSrc.value = null;
  } finally {
    retrying.value = false;
  }
}

async function startEngine(): Promise<void> {
  const record = project.value;
  const file = sourceFile.value;
  if (!record || !file) return;
  if (requestedEngine.value === "demo") {
    if (!demoAllowed) {
      session.enterInspect(
        record,
        localLayers.value,
        "演示引擎仅在开发构建或 VITE_ENABLE_DEMO=1 时可用",
      );
      selectInitialLayer();
      return;
    }
    await session.connectDemo({ project: record, file, localLayers: localLayers.value });
    selectInitialLayer();
    return;
  }
  await probeAndConnect();
}

async function useDemo(): Promise<void> {
  const record = project.value;
  const file = sourceFile.value;
  if (!record || !file || !demoAllowed || session.busy) return;
  iframeSrc.value = null;
  await session.connectDemo({ project: record, file, localLayers: localLayers.value });
  selectInitialLayer();
}

async function loadProject(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  project.value = null;
  localLayers.value = [];
  sourceFile.value = null;
  iframeSrc.value = null;
  patchyStatus.value = null;
  activeTab.value = "inspector";
  logOpen.value = false;
  saveOpen.value = false;
  session.dispose();

  const id = String(route.params.id ?? "");
  await projects.load();
  const record = await projects.ensure(id);
  if (!record) {
    loadError.value = "项目不存在或已被删除。返回项目库重新导入。";
    loading.value = false;
    return;
  }
  project.value = record;
  try {
    const [layers, file] = await Promise.all([
      projects.getLocalLayers(record),
      projects.getFile(record.id),
    ]);
    if (!file) throw new Error("找不到项目源文件，可能已被浏览器清理");
    localLayers.value = layers;
    sourceFile.value = file;
  } catch (reason) {
    loadError.value = `无法读取项目源文件：${describe(reason)}`;
    loading.value = false;
    return;
  }
  project.value = projects.items.find((item) => item.id === record.id) ?? record;
  loading.value = false;
  await nextTick();
  await startEngine();
}

function goBack(): void {
  void router.push({ name: "projects" });
}

function openSave(): void {
  if (saveDisabled.value) return;
  saveOpen.value = true;
}

function onSaved(revision: RevisionRecord): void {
  activeTab.value = "history";
  if (revision.verified) logOpen.value = true;
}

async function renderPreview(): Promise<void> {
  await session.renderPreview(true);
}

function exportIr(): void {
  session.exportIr();
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    if (!session.canEdit) return;
    event.preventDefault();
    if (!saveOpen.value) openSave();
  }
}

watch(
  () => route.params.id,
  (next, previous) => {
    if (previous !== undefined && next !== previous) void loadProject();
  },
);

watch(
  () => project.value?.name,
  (name) => {
    if (name) document.title = `${name} · LayerForge`;
  },
  { immediate: true },
);

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  void loadProject();
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  session.dispose();
});
</script>

<template>
  <div class="editor-view">
    <header class="editor-topbar">
      <div class="topbar-left">
        <button class="btn btn--ghost btn--icon back-button" type="button" aria-label="返回项目库" title="返回项目库" @click="goBack">
          <AppIcon name="arrow-left" :size="17" />
        </button>
        <div class="editor-brand">
          <span class="editor-brand__mark"><AppIcon name="layers" :size="16" /></span>
          <div class="editor-brand__text">
            <span>LayerForge</span>
            <strong>PSD Normalize Studio</strong>
          </div>
        </div>
        <span class="topbar-divider" aria-hidden="true"></span>
        <div v-if="project" class="project-heading">
          <div class="project-heading__title">
            <h1>{{ project.name }}</h1>
            <span class="badge badge--muted">{{ project.source.fileName }}</span>
          </div>
          <p>{{ projectMeta }}</p>
        </div>
      </div>

      <div class="topbar-right">
        <span class="engine-pill" :class="`engine-pill--${session.mode}`">
          <span class="dot" :class="engineDot"></span>
          <span class="engine-pill__label">{{ session.engineLabel }}</span>
          <span class="engine-pill__state">{{ statusText }}</span>
        </span>
        <div class="toolbar-actions">
          <button
            class="btn btn--ghost btn--sm toolbar-button"
            type="button"
            title="刷新图层状态"
            :disabled="refreshDisabled"
            @click="session.refresh()"
          >
            <AppIcon name="refresh" :size="14" :class="{ spin: session.busy === '刷新图层状态' }" />
            <span class="action-label">刷新</span>
          </button>
          <button
            class="btn btn--ghost btn--sm toolbar-button"
            type="button"
            title="渲染预览并下载 PNG"
            :disabled="previewDisabled"
            @click="renderPreview"
          >
            <AppIcon name="image" :size="14" />
            <span class="action-label">预览</span>
          </button>
          <button
            class="btn btn--ghost btn--sm toolbar-button"
            type="button"
            title="按规则分析命名、结构与切图候选"
            aria-label="一键整理"
            :disabled="session.layerList.length === 0"
            @click="activeTab = 'cleanup'"
          >
            <AppIcon name="sparkles" :size="14" />
            <span class="action-label">一键整理</span>
          </button>
          <button
            class="btn btn--ghost btn--sm toolbar-button"
            type="button"
            title="导出未验证的 Design IR 草稿"
            :disabled="session.layerList.length === 0"
            @click="exportIr"
          >
            <AppIcon name="download" :size="14" />
            <span class="action-label">IR 草稿</span>
          </button>
          <button
            class="btn btn--primary btn--sm save-button"
            type="button"
            :disabled="saveDisabled"
            :title="session.canEdit ? '另存为新 PSD 并重新打开验证' : '需要可写的 Patchy 或演示引擎'"
            @click="openSave"
          >
            <AppIcon name="save" :size="14" />
            {{ saveLabel }}
          </button>
          <button
            class="btn btn--ghost btn--icon btn--sm log-toggle"
            :class="{ 'is-active': logOpen }"
            type="button"
            :aria-label="logOpen ? '关闭活动日志' : '打开活动日志'"
            :title="logOpen ? '关闭活动日志' : '打开活动日志'"
            @click="logOpen = !logOpen"
          >
            <AppIcon name="terminal" :size="15" />
            <span v-if="session.logs.length" class="log-badge">{{ session.logs.length }}</span>
          </button>
        </div>
      </div>
    </header>

    <div v-if="loading" class="editor-state">
      <div class="state-card panel">
        <AppIcon name="loader" :size="22" class="spin" />
        <h2>正在打开项目</h2>
        <p>读取本地图层快照并检测可用的 Patchy 引擎…</p>
      </div>
    </div>

    <div v-else-if="loadError" class="editor-state">
      <div class="state-card panel">
        <span class="state-card__icon state-card__icon--danger"><AppIcon name="warning" :size="22" /></span>
        <h2>无法打开项目</h2>
        <p>{{ loadError }}</p>
        <button class="btn btn--primary" type="button" @click="goBack">
          <AppIcon name="arrow-left" :size="14" />
          返回项目库
        </button>
      </div>
    </div>

    <template v-else-if="project">
      <div class="notice-stack">
        <div v-if="session.error" class="callout callout--danger notice">
          <AppIcon class="callout__icon" name="warning" :size="15" />
          <div class="notice__content">
            <div class="callout__title">操作未完成</div>
            <span>{{ session.error }}</span>
          </div>
          <button class="btn btn--ghost btn--icon btn--sm" type="button" aria-label="关闭错误提示" @click="session.clearError()">
            <AppIcon name="x" :size="13" />
          </button>
        </div>

        <div v-if="session.isSimulated" class="callout callout--warn notice">
          <AppIcon class="callout__icon" name="warning" :size="15" />
          <div class="notice__content">
            <div class="callout__title">演示引擎 · 结果不可作为证据</div>
            保存、预览和重开均为协议模拟，不会生成真实 PSD，也不代表 Patchy 或 Photoshop 兼容性。
          </div>
        </div>

        <div v-else-if="session.isInspect" class="callout callout--warn notice">
          <AppIcon class="callout__icon" name="lock" :size="15" />
          <div class="notice__content">
            <div class="callout__title">本地只读检查</div>
            <span>
              {{ session.fallbackReason ?? "未连接 Patchy 引擎" }}
              <span class="notice__sep">·</span>
              图层树来自 ag-psd 只读解析，可查看和编辑命名计划，但不能重命名或保存。
            </span>
          </div>
          <div class="notice__actions">
            <button class="btn btn--sm" type="button" :disabled="retrying" @click="probeAndConnect">
              <AppIcon :name="retrying ? 'loader' : 'link'" :size="13" :class="{ spin: retrying }" />
              重试连接 Patchy
            </button>
            <button
              v-if="demoAllowed"
              class="btn btn--ghost btn--sm"
              type="button"
              :disabled="Boolean(session.busy)"
              @click="useDemo"
            >
              使用演示引擎
            </button>
          </div>
        </div>
      </div>

      <div class="editor-workspace">
        <LayerTree
          class="editor-left"
          :layers="session.layers"
          :selected-id="session.selectedLayerId"
          :engine-label="session.engineLabel"
          @select="session.selectLayer"
        />

        <section class="canvas panel">
          <header class="canvas__bar">
            <div class="canvas__bar-left">
              <span class="panel-title">画布</span>
              <span class="badge" :class="session.mode === 'patchy' ? 'badge--success' : 'badge--muted'">
                {{ session.mode === "patchy" ? "Patchy" : "结构示意" }}
              </span>
            </div>
            <div class="canvas__bar-right">
              <span v-if="viewWidth && viewHeight" class="mono">{{ viewWidth }} × {{ viewHeight }}</span>
              <span v-if="session.document" class="divider">·</span>
              <span v-if="session.document" class="mono" title="当前引擎文档 revision">
                rev {{ session.document.revision }}
              </span>
              <span v-if="session.document?.fingerprint" class="divider">·</span>
              <span v-if="session.document?.fingerprint" class="mono" :title="session.document.fingerprint">
                fp {{ shortHash(session.document.fingerprint, 8) }}
              </span>
            </div>
          </header>

          <div class="canvas__viewport">
            <div v-if="iframeSrc" v-show="session.mode === 'patchy'" class="iframe-host">
              <iframe
                ref="iframeEl"
                :src="iframeSrc"
                title="Patchy 引擎"
                class="patchy-frame"
              ></iframe>
            </div>

            <div v-show="session.mode !== 'patchy'" class="map-host">
              <LayerMapPreview
                :layers="session.layers"
                :width="viewWidth"
                :height="viewHeight"
                :selected-id="session.selectedLayerId"
              />
              <div class="map-caption">
                <span class="badge badge--outline">结构示意</span>
                <p>依图层边界绘制，不代表 PSD 的最终渲染效果。</p>
              </div>
            </div>

            <div v-if="session.status === 'connecting'" class="connecting-overlay">
              <span class="connecting-overlay__spinner">
                <AppIcon name="loader" :size="22" class="spin" />
              </span>
              <strong>正在加载 Patchy WASM</strong>
              <p>首次连接需要下载引擎并等待桥接入口就绪，完成后会自动打开当前 PSD。</p>
            </div>
          </div>

          <footer class="canvas__foot">
            <div class="canvas__foot-left">
              <span class="dot" :class="engineDot"></span>
              <span>{{ modeNote }}</span>
            </div>
            <div class="canvas__foot-right">
              <span v-if="session.busy" class="busy-inline">
                <AppIcon name="loader" :size="12" class="spin" />
                {{ session.busy }}
              </span>
              <span v-else-if="session.selectedLayer" class="mono" :title="session.selectedLayer.path">
                {{ truncateMiddle(session.selectedLayer.path, 34) }}
              </span>
              <span v-else>在左侧选择图层</span>
            </div>
          </footer>
        </section>

        <aside class="editor-right">
          <nav class="tabs" role="tablist" aria-label="侧边面板">
            <button
              class="tab"
              :class="{ 'is-active': activeTab === 'inspector' }"
              type="button"
              role="tab"
              :aria-selected="activeTab === 'inspector'"
              @click="activeTab = 'inspector'"
            >
              <AppIcon name="circle-dot" :size="13" />
              检查器
            </button>
            <button
              class="tab"
              :class="{ 'is-active': activeTab === 'plan' }"
              type="button"
              role="tab"
              :aria-selected="activeTab === 'plan'"
              @click="activeTab = 'plan'"
            >
              <AppIcon name="edit" :size="13" />
              计划
              <span v-if="session.stats.total" class="tab__count">{{ session.stats.total }}</span>
            </button>
            <button
              class="tab"
              :class="{ 'is-active': activeTab === 'cleanup' }"
              type="button"
              role="tab"
              :aria-selected="activeTab === 'cleanup'"
              @click="activeTab = 'cleanup'"
            >
              <AppIcon name="sparkles" :size="13" />
              整理
              <span v-if="session.cleanupReport?.summary.renames" class="tab__count">
                {{ session.cleanupReport.summary.renames }}
              </span>
            </button>
            <button
              class="tab"
              :class="{ 'is-active': activeTab === 'history' }"
              type="button"
              role="tab"
              :aria-selected="activeTab === 'history'"
              @click="activeTab = 'history'"
            >
              <AppIcon name="history" :size="13" />
              历史
              <span v-if="project.revisions.length" class="tab__count">{{ project.revisions.length }}</span>
            </button>
          </nav>

          <InspectorPanel
            v-if="activeTab === 'inspector'"
            class="side-panel"
            @open-plan="activeTab = 'plan'"
          />
          <PlanPanel v-else-if="activeTab === 'plan'" class="side-panel" />
          <CleanupPanel
            v-else-if="activeTab === 'cleanup'"
            class="side-panel"
            @open-plan="activeTab = 'plan'"
          />
          <HistoryPanel v-else class="side-panel" />
        </aside>
      </div>

      <ActivityLog :open="logOpen" @close="logOpen = false" />

      <footer class="statusbar">
        <div class="statusbar__left">
          <span class="dot" :class="engineDot"></span>
          <span class="statusbar__engine">{{ session.engineLabel }}</span>
          <span class="statusbar__sep">·</span>
          <span>{{ statusText }}</span>
          <span v-if="session.currentPath" class="statusbar__sep">·</span>
          <span v-if="session.currentPath" class="mono statusbar__path" :title="session.currentPath">
            {{ truncateMiddle(session.currentPath, 44) }}
          </span>
          <span class="badge badge--warn gate-chip" title="Photoshop 2026 无警告打开仍待验证">
            M0 门禁未通过
          </span>
        </div>
        <div class="statusbar__right">
          <span v-if="session.document">revision {{ session.document.revision }}</span>
          <span v-if="session.document?.fingerprint" class="mono" :title="session.document.fingerprint">
            fp {{ shortHash(session.document.fingerprint, 10) }}
          </span>
          <span>{{ session.layerList.length }} 节点</span>
          <span>计划 {{ session.stats.verified }}/{{ session.stats.total }} 已验证</span>
          <span v-if="session.stats.failed" class="statusbar__failed">{{ session.stats.failed }} 失败</span>
        </div>
      </footer>

      <SaveAsDialog :open="saveOpen" @close="saveOpen = false" @saved="onSaved" />
    </template>
  </div>
</template>

<style scoped>
.editor-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 560px;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% -20%, rgba(63, 106, 224, 0.055), transparent 48%),
    var(--bg);
}

.editor-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: var(--header-height);
  padding: 0 12px 0 8px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  flex: 0 0 auto;
}

.topbar-left,
.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.topbar-left {
  flex: 1;
}

.topbar-right {
  flex: 0 0 auto;
}

.back-button {
  flex: 0 0 auto;
  color: var(--text-2);
}

.editor-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.editor-brand__mark {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--surface-inverse);
  color: #dbe6ff;
}

.editor-brand__text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.editor-brand__text span {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--muted);
  text-transform: uppercase;
}

.editor-brand__text strong {
  font-size: 11px;
  font-weight: 650;
  color: var(--text-2);
}

.topbar-divider {
  width: 1px;
  height: 24px;
  background: var(--border);
  margin: 0 3px;
  flex: 0 0 auto;
}

.project-heading {
  min-width: 0;
  padding-right: 8px;
}

.project-heading__title {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.project-heading h1 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13.5px;
  letter-spacing: -0.01em;
}

.project-heading__title .badge {
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-heading p {
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--muted);
}

.engine-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 27px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  font-size: 10.5px;
  white-space: nowrap;
}

.engine-pill__label {
  font-weight: 650;
  color: var(--text-2);
}

.engine-pill__state {
  color: var(--muted);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.toolbar-button {
  height: 30px;
  padding: 0 8px;
}

.save-button {
  margin-left: 2px;
}

.log-toggle {
  position: relative;
  margin-left: 2px;
}

.log-toggle.is-active {
  background: var(--accent-soft);
  color: var(--accent-2);
}

.log-badge {
  position: absolute;
  top: -2px;
  right: -3px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border: 1px solid var(--surface);
  border-radius: 999px;
  background: var(--accent);
  color: #ffffff;
  font-size: 8.5px;
  font-weight: 700;
  line-height: 12px;
  text-align: center;
}

.editor-state {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 24px;
}

.state-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  width: min(420px, 100%);
  padding: 34px 28px;
  text-align: center;
}

.state-card h2 {
  font-size: 16px;
}

.state-card p {
  max-width: 340px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.65;
}

.state-card__icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 13px;
  background: var(--surface-2);
  color: var(--text-2);
}

.state-card__icon--danger {
  background: var(--danger-soft);
  color: var(--danger);
}

.notice-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px 0;
  flex: 0 0 auto;
}

.notice {
  padding: 8px 11px;
  align-items: center;
}

.notice__content {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  line-height: 1.5;
}

.notice__content .callout__title {
  font-size: 11.5px;
}

.notice__actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
}

.notice__sep {
  margin: 0 3px;
  opacity: 0.5;
}

.editor-workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 268px minmax(0, 1fr) 344px;
  gap: 9px;
  padding: 9px 10px;
}

.editor-left {
  min-height: 0;
}

.canvas {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.canvas__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  flex: 0 0 auto;
}

.canvas__bar-left,
.canvas__bar-right {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.canvas__bar-right {
  overflow: hidden;
  font-size: 10px;
  color: var(--muted);
  white-space: nowrap;
}

.divider {
  opacity: 0.55;
}

.canvas__viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  padding: 16px;
  background:
    radial-gradient(circle at 50% 45%, rgba(63, 106, 224, 0.06), transparent 65%),
    var(--surface-2);
  overflow: hidden;
}

.iframe-host,
.map-host {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--border);
  background: var(--surface);
}

.patchy-frame {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
  background: #ffffff;
}

.map-host {
  padding: 0;
}

.map-caption {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 9px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-sm);
}

.map-caption p {
  color: var(--muted);
  font-size: 10px;
}

.connecting-overlay {
  position: absolute;
  inset: 16px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: 8px;
  background: rgba(246, 248, 251, 0.9);
  backdrop-filter: blur(3px);
  text-align: center;
}

.connecting-overlay__spinner {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  margin-bottom: 3px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--surface);
  color: var(--accent);
  box-shadow: var(--shadow-sm);
}

.connecting-overlay strong {
  font-size: 13px;
}

.connecting-overlay p {
  max-width: 320px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
}

.canvas__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 12px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
  font-size: 10.5px;
  color: var(--muted);
  flex: 0 0 auto;
}

.canvas__foot-left,
.canvas__foot-right {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.canvas__foot-right {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.busy-inline {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--accent-2);
}

.editor-right {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.editor-right .tabs {
  flex: 0 0 auto;
}

.editor-right .tab {
  flex: 1;
  padding: 0 8px;
}

.side-panel {
  flex: 1;
  min-height: 0;
}

.statusbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 30px;
  padding: 0 12px;
  border-top: 1px solid var(--border);
  background: var(--surface);
  font-size: 10px;
  color: var(--muted);
  flex: 0 0 auto;
}

.statusbar__left,
.statusbar__right {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  white-space: nowrap;
}

.statusbar__left {
  overflow: hidden;
}

.statusbar__engine {
  font-weight: 650;
  color: var(--text-2);
}

.statusbar__sep {
  opacity: 0.45;
}

.statusbar__path {
  overflow: hidden;
  text-overflow: ellipsis;
}

.statusbar__right {
  flex: 0 0 auto;
  gap: 12px;
}

.statusbar__failed {
  color: var(--danger);
  font-weight: 600;
}

.gate-chip {
  height: 18px;
  margin-left: 4px;
  font-size: 9px;
}

@media (max-width: 1280px) {
  .editor-workspace {
    grid-template-columns: 240px minmax(0, 1fr) 316px;
  }

  .action-label {
    display: none;
  }

  .toolbar-button {
    width: 30px;
    padding: 0;
  }

  .project-heading__title .badge {
    display: none;
  }
}

@media (max-width: 1040px) {
  .editor-brand__text,
  .topbar-divider {
    display: none;
  }

  .engine-pill__label {
    display: none;
  }

  .editor-workspace {
    grid-template-columns: 220px minmax(0, 1fr) 300px;
  }

  .statusbar__right span:nth-child(2) {
    display: none;
  }
}

@media (max-width: 900px) {
  .editor-view {
    height: auto;
    min-height: 100vh;
    overflow: visible;
  }

  .editor-topbar {
    flex-wrap: wrap;
    height: auto;
    padding: 8px 10px;
    gap: 8px;
  }

  .topbar-left,
  .topbar-right {
    width: 100%;
  }

  .topbar-right {
    justify-content: space-between;
  }

  .editor-workspace {
    grid-template-columns: 1fr;
    grid-auto-rows: minmax(320px, auto);
  }

  .editor-left,
  .canvas,
  .editor-right {
    min-height: 360px;
  }

  .editor-right {
    height: 520px;
  }

  .activity-log {
    margin: 0 10px;
  }

  .notice {
    flex-wrap: wrap;
  }

  .notice__actions {
    width: 100%;
    padding-left: 25px;
  }

  .statusbar {
    flex-wrap: wrap;
    height: auto;
    padding: 6px 10px;
  }
}
</style>
