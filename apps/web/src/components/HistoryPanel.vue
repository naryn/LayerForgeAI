<script setup lang="ts">
import { computed } from "vue";
import type { LayerDiffEntry } from "@/lib/diff";
import type { EngineMode, RevisionRecord } from "@/lib/domain";
import { formatBytes, formatDateTime, shortHash } from "@/lib/format";
import { useSessionStore } from "@/stores/session";
import AppIcon from "./AppIcon.vue";

const session = useSessionStore();
const project = computed(() => session.project);

const ENGINE_LABELS: Record<EngineMode, string> = {
  patchy: "Patchy",
  demo: "演示",
  inspect: "检查",
};

const revisions = computed<RevisionRecord[]>(() => {
  const list = project.value?.revisions ?? [];
  const last = session.lastRevision;
  if (last && !list.some((revision) => revision.id === last.id)) {
    return [last, ...list];
  }
  return list;
});

const warning = computed(() => project.value?.localInspection.warning);
const diff = computed(() => session.lastDiff);
const pixelDiff = computed(() => session.lastPixelDiff);
const psdCompare = computed(() => session.lastPsdCompare);
const psdComparePercent = computed(() =>
  `${((psdCompare.value?.pixel.ratio ?? 0) * 100).toFixed(3)}%`,
);
const psdCompareBadge = computed(() => {
  if (!psdCompare.value) return { label: "", className: "" };
  if (psdCompare.value.identicalBinary) {
    return { label: "字节一致", className: "badge--success" };
  }
  const { pixel, layerPixels } = psdCompare.value;
  const compositeDirty = pixel.available && pixel.differingPixels > 0;
  const layerDirty = layerPixels.available && layerPixels.differing > 0;
  if (compositeDirty || layerDirty) {
    return { label: "存在像素差异", className: "badge--warn" };
  }
  if (pixel.available && layerPixels.available) {
    return { label: "合成与逐层一致", className: "badge--success" };
  }
  if (pixel.available) return { label: "合成像素一致", className: "badge--success" };
  if (layerPixels.available) return { label: "逐层像素一致", className: "badge--success" };
  return { label: "结构已解析", className: "badge--warn" };
});
const psdLayerEntries = computed(
  () => psdCompare.value?.layerPixels.entries.slice(0, 4) ?? [],
);
const psdLayerEntryMore = computed(() =>
  Math.max(
    0,
    (psdCompare.value?.layerPixels.entries.length ?? 0) - psdLayerEntries.value.length,
  ),
);
const pixelPercent = computed(() =>
  `${((pixelDiff.value?.ratio ?? 0) * 100).toFixed(3)}%`,
);
const pixelBadge = computed(() => {
  if (!pixelDiff.value) return { label: "", className: "" };
  if (pixelDiff.value.simulated) return { label: "模拟对比", className: "badge--warn" };
  return pixelDiff.value.differingPixels === 0
    ? { label: "逐像素一致", className: "badge--success" }
    : { label: "存在差异", className: "badge--warn" };
});
const visibleDiffEntries = computed(() => diff.value?.entries.slice(0, 6) ?? []);
const hiddenDiffEntries = computed(() =>
  Math.max(0, (diff.value?.entries.length ?? 0) - visibleDiffEntries.value.length),
);

function fileName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

function diffEntryTitle(entry: LayerDiffEntry): string {
  if (entry.status === "added") return entry.nameAfter ?? entry.afterPath ?? entry.layerId;
  if (entry.status === "removed") return entry.nameBefore ?? entry.beforePath ?? entry.layerId;
  if (entry.nameBefore && entry.nameAfter && entry.nameBefore !== entry.nameAfter) {
    return `${entry.nameBefore} → ${entry.nameAfter}`;
  }
  return entry.nameAfter ?? entry.afterPath ?? entry.layerId;
}

function diffEntryDetail(entry: LayerDiffEntry): string {
  if (entry.status === "added") return "新增图层";
  if (entry.status === "removed") return "已移除";
  return entry.changes.map((item) => item.label).join(" · ");
}
</script>

<template>
  <section class="history panel">
    <header class="history__header">
      <span class="panel-title">版本与来源</span>
      <span class="badge badge--muted">{{ revisions.length }} 个版本</span>
    </header>

    <div class="history__body scroll-area">
      <section v-if="project" class="source-card">
        <div class="source-card__head">
          <span class="source-card__icon"><AppIcon name="file" :size="15" /></span>
          <div class="source-card__title">
            <strong>{{ project.source.fileName }}</strong>
            <span>{{ project.source.fileSize ? formatBytes(project.source.fileSize) : "—" }}</span>
          </div>
        </div>
        <div class="kv-list">
          <div class="kv-row">
            <span class="kv-key">画布</span>
            <span class="kv-value">{{ project.source.width }} × {{ project.source.height }}</span>
          </div>
          <div class="kv-row">
            <span class="kv-key">模式 / 位深</span>
            <span class="kv-value">{{ project.source.colorModeLabel }} / {{ project.source.depth }} bit</span>
          </div>
          <div class="kv-row">
            <span class="kv-key">图层节点</span>
            <span class="kv-value">{{ project.source.layerCount }}</span>
          </div>
          <div class="kv-row">
            <span class="kv-key">SHA-256</span>
            <span class="kv-value mono" :title="project.source.sha256">
              {{ shortHash(project.source.sha256, 18) }}
            </span>
          </div>
          <div class="kv-row">
            <span class="kv-key">本地解析</span>
            <span class="kv-value">{{ project.localInspection.parsedWith }} · 只读</span>
          </div>
        </div>
        <p v-if="warning" class="source-warning">
          <AppIcon name="warning" :size="12" />
          {{ warning }}
        </p>
      </section>

      <section v-if="diff" class="diff-card" data-testid="diff-card">
        <div class="diff-card__head">
          <span class="diff-card__icon"><AppIcon name="history" :size="15" /></span>
          <div class="diff-card__title">
            <strong>保存前后结构对比</strong>
            <span>
              {{ diff.baseline === "previous-save" ? "相对上次保存" : "相对打开时" }} ·
              {{ diff.before.layerCount }} → {{ diff.after.layerCount }} 节点 ·
              {{ formatDateTime(diff.generatedAt) }}
            </span>
          </div>
          <span class="badge" :class="diff.simulated ? 'badge--warn' : 'badge--success'">
            {{ diff.simulated ? "模拟保存" : "引擎图层树" }}
          </span>
        </div>

        <div class="diff-stats">
          <span class="diff-stat" :class="{ 'is-dirty': diff.summary.renamed > 0 }">
            <strong data-testid="diff-renamed">{{ diff.summary.renamed }}</strong>
            重命名
          </span>
          <span class="diff-stat" :class="{ 'is-dirty': diff.summary.geometryChanged > 0 }">
            <strong>{{ diff.summary.geometryChanged }}</strong>
            几何
          </span>
          <span class="diff-stat" :class="{ 'is-dirty': diff.summary.restyled > 0 }">
            <strong>{{ diff.summary.restyled }}</strong>
            属性
          </span>
          <span class="diff-stat" :class="{ 'is-dirty': diff.summary.added > 0 }">
            <strong>{{ diff.summary.added }}</strong>
            新增
          </span>
          <span class="diff-stat" :class="{ 'is-dirty': diff.summary.removed > 0 }">
            <strong>{{ diff.summary.removed }}</strong>
            移除
          </span>
          <span class="diff-stat">
            <strong>{{ diff.summary.unchanged }}</strong>
            未变
          </span>
        </div>

        <ul v-if="visibleDiffEntries.length" class="diff-entries">
          <li
            v-for="entry in visibleDiffEntries"
            :key="`${entry.status}:${entry.layerId}:${entry.beforePath ?? entry.afterPath ?? ''}`"
            class="diff-entry"
          >
            <span class="diff-entry__mark" :class="`is-${entry.status}`">
              {{ entry.status === "added" ? "+" : entry.status === "removed" ? "−" : "~" }}
            </span>
            <span class="diff-entry__title" :title="diffEntryTitle(entry)">
              {{ diffEntryTitle(entry) }}
            </span>
            <span class="diff-entry__detail" :title="diffEntryDetail(entry)">
              {{ diffEntryDetail(entry) }}
            </span>
          </li>
        </ul>
        <p v-else class="diff-card__clean">保存后图层树与保存前一致。</p>
        <p v-if="hiddenDiffEntries > 0" class="diff-card__more">
          还有 {{ hiddenDiffEntries }} 项变更，导出 JSON 查看全部。
        </p>

        <p v-if="diff.simulated" class="diff-card__warning">
          <AppIcon name="warning" :size="12" />
          演示引擎的保存为模拟，本对比只用于界面测试，不能作为 Patchy / Photoshop 证据。
        </p>
        <p class="diff-card__note">
          对比对象是保存前后引擎返回的图层树，不是 PSD 二进制，也不是像素差异。
        </p>
        <p v-if="pixelDiff" class="diff-card__note">
          像素对比见下方卡片；两者都不构成 Photoshop 兼容性证据。
        </p>
        <button
          class="btn btn--ghost btn--sm diff-card__export"
          type="button"
          @click="session.exportDiff()"
        >
          <AppIcon name="download" :size="13" />
          导出对比 JSON
        </button>
      </section>

      <section v-if="pixelDiff" class="diff-card diff-card--pixels" data-testid="pixel-diff">
        <div class="diff-card__head">
          <span class="diff-card__icon"><AppIcon name="image" :size="15" /></span>
          <div class="diff-card__title">
            <strong>保存前后像素对比</strong>
            <span>{{ pixelDiff.width }} × {{ pixelDiff.height }} · Patchy 预览 PNG</span>
          </div>
          <span class="badge" :class="pixelBadge.className">{{ pixelBadge.label }}</span>
        </div>

        <div class="diff-stats diff-stats--pixels">
          <span class="diff-stat" :class="{ 'is-dirty': pixelDiff.differingPixels > 0 }">
            <strong data-testid="pixel-diff-differing">{{ pixelDiff.differingPixels }}</strong>
            差异像素
          </span>
          <span class="diff-stat">
            <strong>{{ pixelDiff.totalPixels }}</strong>
            总像素
          </span>
          <span class="diff-stat">
            <strong data-testid="pixel-diff-ratio">{{ pixelPercent }}</strong>
            占比
          </span>
          <span class="diff-stat" :class="{ 'is-dirty': pixelDiff.maxDelta > 0 }">
            <strong>{{ pixelDiff.maxDelta }}</strong>
            最大通道差
          </span>
        </div>

        <p v-if="pixelDiff.bounds" class="diff-card__note">
          差异区域 x={{ pixelDiff.bounds.x }} y={{ pixelDiff.bounds.y }} ·
          {{ pixelDiff.bounds.width }}×{{ pixelDiff.bounds.height }}
        </p>
        <p v-else-if="pixelDiff.differingPixels === 0" class="diff-card__clean">
          保存前后预览 PNG 逐像素一致。
        </p>
        <p v-if="pixelDiff.simulated" class="diff-card__warning">
          <AppIcon name="warning" :size="12" />
          演示引擎未生成真实 PNG，该对比仅用于界面测试。
        </p>
        <p class="diff-card__note">
          对比对象是保存前后 Patchy 渲染的预览 PNG，不是 PSD 二进制逐字节比较，
          也不能替代 Photoshop 打开验证。
        </p>
      </section>

      <section v-if="psdCompare" class="diff-card diff-card--psd" data-testid="psd-compare">
        <div class="diff-card__head">
          <span class="diff-card__icon"><AppIcon name="file" :size="15" /></span>
          <div class="diff-card__title">
            <strong>原 PSD 独立对比</strong>
            <span>
              导入源 ↔ 保存文件 · ag-psd 独立解析 ·
              {{ formatDateTime(psdCompare.generatedAt) }}
            </span>
          </div>
          <span class="badge" :class="psdCompareBadge.className">
            {{ psdCompareBadge.label }}
          </span>
        </div>

        <div class="diff-stats">
          <span class="diff-stat">
            <strong data-testid="psd-compare-layers">
              {{ psdCompare.source.layerCount }} → {{ psdCompare.saved.layerCount }}
            </strong>
            图层节点
          </span>
          <span class="diff-stat" :class="{ 'is-dirty': psdCompare.structure.renamed > 0 }">
            <strong>{{ psdCompare.structure.renamed }}</strong>
            命名
          </span>
          <span class="diff-stat" :class="{ 'is-dirty': psdCompare.structure.geometryChanged > 0 }">
            <strong>{{ psdCompare.structure.geometryChanged }}</strong>
            几何 / 路径
          </span>
          <span class="diff-stat" :class="{ 'is-dirty': psdCompare.structure.added > 0 }">
            <strong>{{ psdCompare.structure.added }}</strong>
            新增
          </span>
          <span class="diff-stat" :class="{ 'is-dirty': psdCompare.structure.removed > 0 }">
            <strong>{{ psdCompare.structure.removed }}</strong>
            移除
          </span>
          <span class="diff-stat">
            <strong>{{ psdCompare.structure.restyled }}</strong>
            属性
          </span>
        </div>

        <template v-if="psdCompare.pixel.available">
          <div class="diff-stats diff-stats--pixels">
            <span class="diff-stat" :class="{ 'is-dirty': psdCompare.pixel.differingPixels > 0 }">
              <strong data-testid="psd-compare-pixel-differing">
                {{ psdCompare.pixel.differingPixels }}
              </strong>
              差异像素 / {{ psdCompare.pixel.totalPixels }}
            </span>
            <span class="diff-stat">
              <strong data-testid="psd-compare-pixel-ratio">{{ psdComparePercent }}</strong>
              合成图占比
            </span>
            <span class="diff-stat" :class="{ 'is-dirty': psdCompare.pixel.maxDelta > 0 }">
              <strong>{{ psdCompare.pixel.maxDelta }}</strong>
              最大通道差
            </span>
          </div>
          <p v-if="psdCompare.pixel.bounds" class="diff-card__note">
            差异区域 x={{ psdCompare.pixel.bounds.x }} y={{ psdCompare.pixel.bounds.y }} ·
            {{ psdCompare.pixel.bounds.width }}×{{ psdCompare.pixel.bounds.height }}
          </p>
          <p v-else-if="psdCompare.pixel.differingPixels === 0" class="diff-card__clean">
            两份 PSD 的内嵌合成图逐像素一致（容差 {{ psdCompare.pixel.tolerance }}）。
          </p>
        </template>
        <p v-else class="diff-card__warning" data-testid="psd-compare-pixel-unavailable">
          <AppIcon name="warning" :size="12" />
          合成图对比不可用：{{ psdCompare.pixel.reason }}
        </p>

        <template v-if="psdCompare.layerPixels.available">
          <div class="diff-stats diff-stats--pixels">
            <span class="diff-stat">
              <strong data-testid="psd-compare-layer-identical">
                {{ psdCompare.layerPixels.identical }}/{{ psdCompare.layerPixels.compared }}
              </strong>
              逐层一致
            </span>
            <span
              class="diff-stat"
              :class="{ 'is-dirty': psdCompare.layerPixels.differing > 0 }"
            >
              <strong data-testid="psd-compare-layer-differing">
                {{ psdCompare.layerPixels.differing }}
              </strong>
              差异图层
            </span>
            <span class="diff-stat">
              <strong data-testid="psd-compare-layer-total">
                {{ psdCompare.layerPixels.totalPixels }}
              </strong>
              比较像素
            </span>
            <span
              class="diff-stat"
              :class="{ 'is-dirty': psdCompare.layerPixels.maxDelta > 0 }"
            >
              <strong>{{ psdCompare.layerPixels.maxDelta }}</strong>
              逐层最大通道差
            </span>
          </div>
          <ul v-if="psdLayerEntries.length" class="diff-entries">
            <li
              v-for="entry in psdLayerEntries"
              :key="`${entry.layerId}:${entry.afterPath}`"
              class="diff-entry"
            >
              <span
                class="diff-entry__mark"
                :class="entry.status === 'differing' ? 'is-changed' : 'is-removed'"
              >
                {{ entry.status === "differing" ? "~" : "?" }}
              </span>
              <span class="diff-entry__title" :title="entry.name">{{ entry.name }}</span>
              <span class="diff-entry__detail" :title="entry.reason ?? ''">
                {{
                  entry.status === "differing"
                    ? `${entry.differingPixels}/${entry.totalPixels} 差异`
                    : entry.reason
                }}
              </span>
            </li>
          </ul>
          <p v-if="psdLayerEntryMore > 0" class="diff-card__more">
            还有 {{ psdLayerEntryMore }} 个逐层结果，导出 JSON 查看全部。
          </p>
          <p v-if="psdCompare.layerPixels.unpaired > 0" class="diff-card__note">
            {{ psdCompare.layerPixels.unpaired }} 个叶层未配对（编组、合并、新增或移除），
            不计入逐层差异。
          </p>
          <p v-if="psdCompare.layerPixels.truncated" class="diff-card__warning">
            <AppIcon name="warning" :size="12" />
            逐层比较达到 {{ psdCompare.layerPixels.maxPixels.toLocaleString() }} 像素上限，
            其余匹配图层未比较。
          </p>
        </template>
        <p v-else class="diff-card__warning" data-testid="psd-compare-layer-unavailable">
          <AppIcon name="warning" :size="12" />
          逐层像素对比不可用：{{ psdCompare.layerPixels.reason }}
        </p>

        <div class="psd-hash">
          <span class="mono" :title="psdCompare.source.sha256">
            源 {{ shortHash(psdCompare.source.sha256, 20) }} ·
            {{ formatBytes(psdCompare.source.header.fileSize) }}
          </span>
          <span class="mono" :title="psdCompare.saved.sha256">
            存 {{ shortHash(psdCompare.saved.sha256, 20) }} ·
            {{ formatBytes(psdCompare.saved.header.fileSize) }}
          </span>
        </div>

        <p class="diff-card__note">
          对比双方均由 ag-psd 独立解析；合成图像素来自 PSD 内嵌预览，逐层像素来自图层缓存，
          都不是 Photoshop 渲染。结构性新增/移除包含编组、合并造成的路径变化，需结合计划解读。
        </p>
        <button
          class="btn btn--ghost btn--sm diff-card__export"
          type="button"
          @click="session.exportPsdCompare()"
        >
          <AppIcon name="download" :size="13" />
          导出原 PSD 对比 JSON
        </button>
      </section>

      <div class="history__divider">
        <span>保存记录</span>
      </div>

      <div v-if="revisions.length === 0" class="empty-state history-empty">
        <span class="empty-state__icon"><AppIcon name="history" :size="20" /></span>
        <h3>还没有保存记录</h3>
        <p>完成一次“保存并重开”后，这里会记录版本路径、重开校验结果与图层快照。</p>
      </div>

      <ol v-else class="revision-list">
        <li v-for="revision in revisions" :key="revision.id" class="revision">
          <div class="revision__top">
            <span class="revision__file" :title="revision.path">{{ fileName(revision.path) }}</span>
            <span v-if="revision.verified" class="badge badge--success">
              <AppIcon name="check" :size="11" /> 重开已验证
            </span>
            <span v-else class="badge badge--danger">校验未通过</span>
          </div>
          <div class="revision__meta">
            <span>{{ formatDateTime(revision.createdAt) }}</span>
            <span class="revision__dot">·</span>
            <span>{{ ENGINE_LABELS[revision.engine] }}</span>
            <span class="revision__dot">·</span>
            <span>{{ revision.layerCount }} 节点</span>
          </div>
          <div class="revision__checks">
            <span>计划 {{ revision.plannedCount }}</span>
            <span class="revision__dot">·</span>
            <span>验证 {{ revision.verifiedCount }}</span>
            <span class="revision__dot">·</span>
            <span class="mono" :title="revision.documentId">{{ shortHash(revision.documentId, 12) }}</span>
          </div>
          <div v-if="revision.diff" class="revision__diff">
            <span>结构对比</span>
            <span class="revision__dot">·</span>
            <span>命名 {{ revision.diff.renamed }}</span>
            <span class="revision__dot">·</span>
            <span>几何 {{ revision.diff.geometryChanged }}</span>
            <span class="revision__dot">·</span>
            <span>属性 {{ revision.diff.restyled }}</span>
            <span class="revision__dot">·</span>
            <span>+{{ revision.diff.added }} / −{{ revision.diff.removed }}</span>
          </div>
          <div v-if="revision.pixelDiff" class="revision__diff revision__pixels">
            <span>像素对比</span>
            <span class="revision__dot">·</span>
            <span>{{ revision.pixelDiff.differingPixels }}/{{ revision.pixelDiff.totalPixels }}</span>
            <span class="revision__dot">·</span>
            <span>{{ (revision.pixelDiff.ratio * 100).toFixed(3) }}%</span>
            <span class="revision__dot">·</span>
            <span>最大通道差 {{ revision.pixelDiff.maxDelta }}</span>
          </div>
          <div v-if="revision.psdCompare" class="revision__diff revision__psd">
            <span>原 PSD 对比</span>
            <span class="revision__dot">·</span>
            <span>
              {{ revision.psdCompare.sourceLayers }} →
              {{ revision.psdCompare.savedLayers }} 图层
            </span>
            <span class="revision__dot">·</span>
            <span v-if="revision.psdCompare.pixelAvailable">
              {{ revision.psdCompare.pixelDiffering }}/{{ revision.psdCompare.pixelTotal }} 像素
            </span>
            <span v-else>合成图不可用</span>
            <span v-if="revision.psdCompare.layerPixelAvailable" class="revision__dot">·</span>
            <span v-if="revision.psdCompare.layerPixelAvailable">
              逐层 {{ revision.psdCompare.layerPixelIdentical ?? 0 }}/{{
                revision.psdCompare.layerPixelCompared ?? 0
              }}
              一致
            </span>
            <span v-if="revision.psdCompare.identicalBinary" class="revision__dot">·</span>
            <span v-if="revision.psdCompare.identicalBinary">SHA-256 相同</span>
          </div>
          <p v-if="revision.engine === 'demo'" class="revision__note">
            演示版本：未生成真实 PSD，记录仅用于界面测试。
          </p>
        </li>
      </ol>

      <p class="history__note">
        版本记录保存图层树快照，不保存 PSD 二进制；源文件仍以导入时的本地副本为准。
      </p>
    </div>
  </section>
</template>

<style scoped>
.history {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.history__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--border);
}

.history__body {
  flex: 1;
  overflow: auto;
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.source-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-2);
}

.source-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.source-card__icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  color: var(--accent);
  flex: 0 0 auto;
}

.source-card__title {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.source-card__title strong {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-card__title span {
  font-size: 10.5px;
  color: var(--muted);
}

.source-card .kv-list {
  padding: 0 2px;
}

.source-card .kv-row {
  grid-template-columns: 84px minmax(0, 1fr);
  padding: 5px 0;
  font-size: 11.5px;
}

.source-warning {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  padding: 6px 7px;
  border-radius: 5px;
  background: var(--warn-soft);
  color: var(--warn);
  font-size: 10.5px;
  line-height: 1.45;
}

.diff-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--accent-ring);
  border-radius: 9px;
  background:
    linear-gradient(180deg, var(--accent-soft), transparent 62%),
    var(--surface-2);
}

.diff-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.diff-card__icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  color: var(--accent);
  flex: 0 0 auto;
}

.diff-card__title {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.diff-card__title strong {
  font-size: 12px;
}

.diff-card__title span {
  font-size: 10.5px;
  color: var(--muted);
}

.diff-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
}

.diff-stats--pixels {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.diff-stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 5px 7px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font-size: 9.5px;
  color: var(--muted);
}

.diff-stat strong {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.diff-stat.is-dirty {
  border-color: var(--accent-ring);
  background: var(--accent-soft);
}

.diff-stat.is-dirty strong {
  color: var(--accent-2);
}

.diff-entries {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.diff-entry {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 5px;
  background: var(--surface);
  font-size: 10.5px;
}

.diff-entry__mark {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
}

.diff-entry__mark.is-changed {
  background: var(--accent-soft);
  color: var(--accent-2);
}

.diff-entry__mark.is-added {
  background: var(--success-soft);
  color: var(--success);
}

.diff-entry__mark.is-removed {
  background: var(--danger-soft);
  color: var(--danger);
}

.diff-entry__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--text-2);
}

.diff-entry__detail {
  justify-self: end;
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 9.5px;
  color: var(--muted);
}

.diff-card__clean,
.diff-card__more {
  font-size: 10.5px;
  color: var(--muted);
}

.diff-card__warning {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  padding: 6px 7px;
  border-radius: 5px;
  background: var(--warn-soft);
  color: var(--warn);
  font-size: 10px;
  line-height: 1.45;
}

.diff-card__note {
  font-size: 10px;
  line-height: 1.5;
  color: var(--muted);
}

.diff-card__export {
  align-self: flex-start;
}

.psd-hash {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 9.5px;
  color: var(--muted);
}

.psd-hash .mono {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history__divider {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.history__divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--border);
}

.history-empty {
  padding: 28px 10px;
}

.revision-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.revision {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.revision__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.revision__file {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-2);
}

.revision__meta,
.revision__checks {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  font-size: 10.5px;
  color: var(--muted);
}

.revision__dot {
  opacity: 0.5;
}

.revision__diff {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  font-size: 10px;
  color: var(--text-2);
}

.revision__note {
  margin-top: 2px;
  padding: 5px 7px;
  border-radius: 5px;
  background: var(--warn-soft);
  color: var(--warn);
  font-size: 10px;
  line-height: 1.45;
}

.history__note {
  margin-top: auto;
  padding-top: 4px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--muted);
}
</style>
