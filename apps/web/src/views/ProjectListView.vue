<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { ProjectRecord } from "@/lib/domain";
import { formatBytes, formatDateTime, shortHash } from "@/lib/format";
import { useProjectsStore } from "@/stores/projects";
import AppIcon from "@/components/AppIcon.vue";
import ImportProjectDialog from "@/components/ImportProjectDialog.vue";
import ModalDialog from "@/components/ModalDialog.vue";

const router = useRouter();
const route = useRoute();
const projects = useProjectsStore();

const importOpen = ref(false);
const importFile = ref<File | null>(null);
const deleteTarget = ref<ProjectRecord | null>(null);
const deleting = ref(false);
const deleteError = ref<string | null>(null);

const totalLayers = computed(() =>
  projects.items.reduce((sum, project) => sum + project.source.layerCount, 0),
);
const totalRevisions = computed(() =>
  projects.items.reduce((sum, project) => sum + project.revisions.length, 0),
);

function openImport(file: File | null = null): void {
  importFile.value = file;
  importOpen.value = true;
}

function editorRoute(projectId: string) {
  const engine = route.query.engine;
  return {
    name: "editor" as const,
    params: { id: projectId },
    query: typeof engine === "string" ? { engine } : {},
  };
}

function onImported(project: ProjectRecord): void {
  importOpen.value = false;
  importFile.value = null;
  void router.push(editorRoute(project.id));
}

function openProject(project: ProjectRecord): void {
  void router.push(editorRoute(project.id));
}

function pendingPlan(project: ProjectRecord): number {
  return project.plan.filter((entry) => entry.status === "draft" || entry.status === "failed").length;
}

function verifiedPlan(project: ProjectRecord): number {
  return project.plan.filter((entry) => entry.status === "verified").length;
}

function askDelete(project: ProjectRecord): void {
  deleteError.value = null;
  deleteTarget.value = project;
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value;
  if (!target || deleting.value) return;
  deleting.value = true;
  deleteError.value = null;
  try {
    await projects.remove(target.id);
    deleteTarget.value = null;
  } catch (reason) {
    deleteError.value = reason instanceof Error ? reason.message : String(reason);
  } finally {
    deleting.value = false;
  }
}

onMounted(() => {
  void projects.load();
});
</script>

<template>
  <div class="projects-view">
    <header class="topbar">
      <div class="brand">
        <span class="brand__mark"><AppIcon name="layers" :size="19" /></span>
        <div class="brand__text">
          <strong>LayerForge</strong>
          <span>PSD Normalize Studio</span>
        </div>
      </div>
      <div class="topbar__right">
        <span class="badge badge--warn">M0 门禁未通过</span>
        <span class="badge badge--outline">M1 · Web Workbench</span>
        <button class="btn btn--primary" type="button" @click="openImport()">
          <AppIcon name="plus" :size="15" />
          导入 PSD
        </button>
      </div>
    </header>

    <main class="projects-main scroll-area">
      <section class="hero">
        <div class="hero__copy">
          <p class="eyebrow">
            <span class="eyebrow__line"></span>
            Local-first PSD normalization
          </p>
          <h1>
            把 PSD 图层整理成<br />
            <span>可验证的设计结构</span>
          </h1>
          <p class="lede">
            在浏览器里检查图层树、编写语义化命名计划，通过 Patchy 引擎另存重开来验证结果。
            源文件、图层快照与版本记录都留在本机。
          </p>
          <div class="hero__actions">
            <button class="btn btn--primary btn--lg" type="button" @click="openImport()">
              <AppIcon name="upload" :size="16" />
              导入第一个 PSD
            </button>
            <a class="btn btn--lg" href="#project-library">
              查看项目库
              <AppIcon name="arrow-right" :size="15" />
            </a>
          </div>
          <div class="hero__points">
            <span class="point"><AppIcon name="database" :size="13" /> IndexedDB 本地存储</span>
            <span class="point"><AppIcon name="link" :size="13" /> Patchy bridge v1</span>
            <span class="point"><AppIcon name="grid" :size="13" /> Design IR 草稿</span>
          </div>
        </div>

        <aside class="gate-card panel">
          <header class="gate-card__head">
            <div>
              <span class="panel-title">交付门禁</span>
              <h2>M0 证据状态</h2>
            </div>
            <span class="badge badge--danger"><span class="dot dot--danger"></span>BLOCKED</span>
          </header>
          <div class="gate-list">
            <div class="gate-row">
              <span class="gate-row__label">Patchy 桥接 PoC</span>
              <span class="badge badge--success">已完成</span>
            </div>
            <div class="gate-row">
              <span class="gate-row__label">Photoshop 2026 无警告打开</span>
              <span class="badge badge--danger">未验证</span>
            </div>
            <div class="gate-row">
              <span class="gate-row__label">M1 Web 工作台</span>
              <span class="badge badge--warn">开发中</span>
            </div>
          </div>
          <p class="gate-card__note">
            Web UI 依据项目所有者授权先行开发，不代表 M0 已通过，也不宣称 Photoshop
            兼容性。修改能力依赖经过桥接编译的 Patchy WASM。
          </p>
          <div class="gate-card__foot">
            <AppIcon name="shield" :size="13" />
            未验证的能力会明确标注，不用演示结果替代真实证据。
          </div>
        </aside>
      </section>

      <section id="project-library" class="library">
        <header class="section-head">
          <div class="section-head__title">
            <h2>项目库</h2>
            <span class="badge badge--muted">{{ projects.items.length }} 个本地项目</span>
          </div>
          <div class="section-head__meta">
            <span v-if="projects.items.length">
              {{ totalLayers }} 个图层节点 · {{ totalRevisions }} 次保存记录
            </span>
            <button
              class="btn btn--ghost btn--sm"
              type="button"
              :disabled="projects.loading"
              @click="projects.load(true)"
            >
              <AppIcon
                name="refresh"
                :size="14"
                :class="{ spin: projects.loading }"
              />
              刷新
            </button>
          </div>
        </header>

        <div v-if="projects.error" class="callout callout--danger library__error">
          <AppIcon class="callout__icon" name="warning" :size="15" />
          <div>
            <div class="callout__title">无法读取项目库</div>
            {{ projects.error }}
            <button class="text-link" type="button" @click="projects.clearError()">关闭</button>
          </div>
        </div>

        <div v-if="projects.loading && projects.items.length === 0" class="loading-grid">
          <div v-for="index in 3" :key="index" class="skeleton-card"></div>
        </div>

        <div v-else-if="projects.sortedItems.length === 0" class="empty-library panel">
          <span class="empty-library__icon"><AppIcon name="folder" :size="26" /></span>
          <h3>项目库还是空的</h3>
          <p>
            导入一个 PSD 或 PSB 文件开始。导入只做本地只读解析，不会改动原文件；编辑与保存需要连接
            Patchy 引擎。
          </p>
          <button class="btn btn--primary" type="button" @click="openImport()">
            <AppIcon name="upload" :size="15" />
            选择 PSD 文件
          </button>
        </div>

        <div v-else class="project-grid">
          <article
            v-for="item in projects.sortedItems"
            :key="item.id"
            class="project-card panel"
            tabindex="0"
            role="button"
            :aria-label="`打开项目 ${item.name}`"
            @click="openProject(item)"
            @keydown.enter.prevent="openProject(item)"
            @keydown.space.prevent="openProject(item)"
          >
            <header class="project-card__head">
              <span class="project-card__icon"><AppIcon name="file" :size="18" /></span>
              <div class="project-card__title">
                <h3 :title="item.name">{{ item.name }}</h3>
                <span class="mono" :title="item.source.fileName">{{ item.source.fileName }}</span>
              </div>
              <button
                class="btn btn--ghost btn--icon btn--sm project-card__delete"
                type="button"
                aria-label="删除项目"
                title="删除项目"
                @click.stop="askDelete(item)"
              >
                <AppIcon name="trash" :size="14" />
              </button>
            </header>

            <div class="project-card__badges">
              <span class="badge badge--outline">{{ item.source.width }} × {{ item.source.height }}</span>
              <span class="badge badge--outline">{{ item.source.colorModeLabel }}</span>
              <span class="badge badge--outline">{{ item.source.depth }} bit</span>
            </div>

            <div class="project-card__stats">
              <div class="mini-stat">
                <strong>{{ item.source.layerCount }}</strong>
                <span>图层节点</span>
              </div>
              <div class="mini-stat">
                <strong>{{ item.plan.length }}</strong>
                <span>命名计划</span>
              </div>
              <div class="mini-stat">
                <strong>{{ item.revisions.length }}</strong>
                <span>保存版本</span>
              </div>
            </div>

            <div class="project-card__progress">
              <span v-if="pendingPlan(item) > 0" class="badge badge--accent">
                {{ pendingPlan(item) }} 项待应用
              </span>
              <span v-if="verifiedPlan(item) > 0" class="badge badge--success">
                {{ verifiedPlan(item) }} 项已验证
              </span>
              <span v-if="pendingPlan(item) === 0 && verifiedPlan(item) === 0" class="badge badge--muted">
                尚未执行命名流程
              </span>
            </div>

            <footer class="project-card__foot">
              <span class="project-card__time">
                <AppIcon name="clock" :size="12" />
                {{ formatDateTime(item.updatedAt) }}
              </span>
              <span class="project-card__hash mono" :title="item.source.sha256">
                {{ shortHash(item.source.sha256, 12) }}
              </span>
              <span class="project-card__open">
                打开
                <AppIcon name="arrow-right" :size="13" />
              </span>
            </footer>
          </article>
        </div>
      </section>

      <section class="feature-grid">
        <article class="feature panel">
          <span class="feature__icon"><AppIcon name="database" :size="18" /></span>
          <h3>本地优先</h3>
          <p>
            PSD 二进制、图层树快照与命名计划存入 IndexedDB。没有账号、没有上传，关闭页面后仍可在本机继续。
          </p>
        </article>
        <article class="feature panel">
          <span class="feature__icon"><AppIcon name="check-circle" :size="18" /></span>
          <h3>重开才算验证</h3>
          <p>
            命名先写入计划，再应用到引擎，最后另存为新 PSD 并重新打开核对。只有重开验证通过的项才标记为已验证。
          </p>
        </article>
        <article class="feature panel">
          <span class="feature__icon"><AppIcon name="shield" :size="18" /></span>
          <h3>边界清晰</h3>
          <p>
            本地检查只读；演示引擎只用于 UI 测试且不生成文件；Design IR 为未校验草稿。所有限制都在界面中标注。
          </p>
        </article>
      </section>
    </main>

    <footer class="app-footer">
      <span>LayerForgeAI · PSD Normalize Studio Web</span>
      <span class="app-footer__dot">·</span>
      <span>M1 前端工作台</span>
      <span class="app-footer__dot">·</span>
      <span class="app-footer__warn">M0 门禁仍未通过，当前界面不构成兼容性证据</span>
    </footer>

    <ImportProjectDialog
      :open="importOpen"
      :initial-file="importFile"
      @close="importOpen = false"
      @imported="onImported"
    />

    <ModalDialog
      :open="deleteTarget !== null"
      title="删除本地项目"
      subtitle="此操作会删除本机的源文件副本、图层快照与版本记录，无法撤销。"
      :close-on-backdrop="!deleting"
      @close="!deleting && (deleteTarget = null)"
    >
      <div v-if="deleteTarget" class="delete-body">
        <p>
          将删除项目 <strong>{{ deleteTarget.name }}</strong>
          及其本地源文件（{{ formatBytes(deleteTarget.source.fileSize) }}）、
          {{ deleteTarget.revisions.length }} 个版本记录。
        </p>
        <div class="callout callout--warn">
          <AppIcon class="callout__icon" name="warning" :size="15" />
          <div>原始 PSD 文件不会被修改，但本应用中的项目与命名计划将永久丢失。</div>
        </div>
        <p v-if="deleteError" class="delete-error">{{ deleteError }}</p>
      </div>
      <template #footer>
        <button class="btn btn--ghost" type="button" :disabled="deleting" @click="deleteTarget = null">
          取消
        </button>
        <button class="btn btn--danger" type="button" :disabled="deleting" @click="confirmDelete">
          <AppIcon :name="deleting ? 'loader' : 'trash'" :size="14" :class="{ spin: deleting }" />
          {{ deleting ? "正在删除…" : "确认删除" }}
        </button>
      </template>
    </ModalDialog>
  </div>
</template>

<style scoped>
.projects-view {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: var(--header-height);
  padding: 0 26px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(12px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand__mark {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--surface-inverse);
  color: #dbe6ff;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.brand__text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.brand__text strong {
  font-size: 14px;
  letter-spacing: -0.01em;
}

.brand__text span {
  font-size: 10px;
  color: var(--muted);
  letter-spacing: 0.02em;
}

.topbar__right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.projects-main {
  flex: 1;
  width: min(1180px, 100%);
  margin: 0 auto;
  padding: 46px 26px 40px;
  display: flex;
  flex-direction: column;
  gap: 48px;
  overflow: visible;
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
  gap: 42px;
  align-items: center;
}

.eyebrow {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 18px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent-2);
}

.eyebrow__line {
  width: 26px;
  height: 2px;
  border-radius: 2px;
  background: var(--accent);
}

.hero h1 {
  font-size: clamp(34px, 4.6vw, 52px);
  font-weight: 720;
  letter-spacing: -0.035em;
  line-height: 1.12;
  color: var(--text);
}

.hero h1 span {
  background: linear-gradient(100deg, var(--accent-2), #0c7c55 85%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.lede {
  max-width: 540px;
  margin-top: 18px;
  font-size: 14.5px;
  line-height: 1.75;
  color: var(--text-2);
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 26px;
}

.hero__points {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 22px;
  color: var(--muted);
  font-size: 11.5px;
}

.point {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.gate-card {
  padding: 18px;
  border-radius: var(--radius-lg);
  background:
    linear-gradient(180deg, rgba(63, 106, 224, 0.035), transparent 45%),
    var(--surface);
  box-shadow: var(--shadow-md);
}

.gate-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.gate-card__head h2 {
  margin-top: 4px;
  font-size: 17px;
  letter-spacing: -0.02em;
}

.gate-list {
  display: flex;
  flex-direction: column;
  margin-top: 16px;
  border-top: 1px solid var(--border);
}

.gate-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

.gate-row__label {
  font-size: 12px;
  color: var(--text-2);
}

.gate-card__note {
  margin-top: 14px;
  font-size: 11px;
  line-height: 1.65;
  color: var(--muted);
}

.gate-card__foot {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 9px;
  border-radius: 7px;
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 10.5px;
  line-height: 1.5;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.section-head__title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-head__title h2 {
  font-size: 17px;
  letter-spacing: -0.02em;
}

.section-head__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: var(--muted);
}

.library__error {
  margin-bottom: 12px;
}

.text-link {
  margin-left: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: inherit;
  font-weight: 700;
  text-decoration: underline;
}

.loading-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.skeleton-card {
  height: 210px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background:
    linear-gradient(100deg, var(--surface-2) 30%, var(--surface) 50%, var(--surface-2) 70%);
  background-size: 240% 100%;
  animation: shimmer 1.4s linear infinite;
}

@keyframes shimmer {
  to {
    background-position: -140% 0;
  }
}

.empty-library {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 56px 24px;
  text-align: center;
}

.empty-library__icon {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  margin-bottom: 2px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-2);
  color: var(--muted);
}

.empty-library h3 {
  font-size: 15px;
}

.empty-library p {
  max-width: 430px;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.project-card {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 15px;
  cursor: pointer;
  outline: none;
  transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
}

.project-card:hover,
.project-card:focus-visible {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--border));
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.project-card__head {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  min-width: 0;
}

.project-card__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--accent);
  flex: 0 0 auto;
}

.project-card__title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.project-card__title h3 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13.5px;
  letter-spacing: -0.01em;
}

.project-card__title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--muted);
}

.project-card__delete {
  margin: -3px -4px 0 0;
  opacity: 0;
  transition: opacity 120ms ease;
}

.project-card:hover .project-card__delete,
.project-card:focus-within .project-card__delete {
  opacity: 1;
}

.project-card__delete:hover {
  color: var(--danger);
  background: var(--danger-soft);
}

.project-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.project-card__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--border);
}

.mini-stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 7px 9px;
  background: var(--surface-2);
}

.mini-stat strong {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}

.mini-stat span {
  font-size: 9.5px;
  color: var(--muted);
}

.project-card__progress {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-height: 21px;
}

.project-card__foot {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: auto;
  padding-top: 9px;
  border-top: 1px solid var(--border);
  font-size: 10px;
  color: var(--muted);
}

.project-card__time {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.project-card__hash {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-card__open {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  color: var(--accent);
  font-weight: 650;
  font-size: 10.5px;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.feature {
  padding: 17px;
}

.feature__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  margin-bottom: 10px;
  border-radius: 9px;
  background: var(--accent-soft);
  color: var(--accent-2);
}

.feature h3 {
  margin-bottom: 5px;
  font-size: 13px;
}

.feature p {
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--muted);
}

.app-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 7px;
  padding: 18px 24px 22px;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 10.5px;
}

.app-footer__dot {
  opacity: 0.5;
}

.app-footer__warn {
  color: var(--warn);
}

.delete-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-2);
}

.delete-error {
  padding: 8px 10px;
  border: 1px solid var(--danger-border);
  border-radius: 7px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 12px;
}

@media (max-width: 1020px) {
  .hero {
    grid-template-columns: 1fr;
    gap: 28px;
  }

  .gate-card {
    max-width: 520px;
  }

  .project-grid,
  .feature-grid,
  .loading-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .topbar {
    padding: 0 14px;
  }

  .topbar__right .badge {
    display: none;
  }

  .brand__text span {
    display: none;
  }

  .projects-main {
    padding: 28px 14px 30px;
    gap: 34px;
  }

  .hero h1 {
    font-size: 33px;
  }

  .section-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .section-head__meta {
    width: 100%;
    justify-content: space-between;
  }

  .project-grid,
  .feature-grid,
  .loading-grid {
    grid-template-columns: 1fr;
  }

  .project-card__delete {
    opacity: 1;
  }
}
</style>
