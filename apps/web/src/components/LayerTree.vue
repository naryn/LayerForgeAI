<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { LayerNode } from "@/lib/domain";
import { filterLayerTree, flattenLayers } from "@/lib/layers";
import AppIcon from "./AppIcon.vue";
import LayerTreeItem from "./LayerTreeItem.vue";

const props = defineProps<{
  layers: LayerNode[];
  selectedId: string | null;
  engineLabel: string;
}>();

const emit = defineEmits<{ select: [layerId: string] }>();

const query = ref("");
const expanded = ref<Set<string>>(new Set());

const filteredTree = computed(() => filterLayerTree(props.layers, query.value));
const total = computed(() => flattenLayers(props.layers).length);
const shown = computed(() => flattenLayers(filteredTree.value).length);
const forceExpanded = computed(() => query.value.trim().length > 0);

watch(
  () => props.layers,
  (layers) => {
    const groups = flattenLayers(layers).filter((layer) => layer.children.length > 0);
    const valid = new Set(groups.map((layer) => layer.path));
    if (expanded.value.size === 0) {
      expanded.value = new Set(
        layers.filter((layer) => layer.children.length > 0).map((layer) => layer.path),
      );
    } else {
      expanded.value = new Set([...expanded.value].filter((path) => valid.has(path)));
    }
  },
  { immediate: true },
);

function toggle(path: string): void {
  const next = new Set(expanded.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  expanded.value = next;
}

function expandAll(): void {
  expanded.value = new Set(
    flattenLayers(props.layers)
      .filter((layer) => layer.children.length > 0)
      .map((layer) => layer.path),
  );
}

function collapseAll(): void {
  expanded.value = new Set();
}
</script>

<template>
  <section class="layer-tree panel">
    <header class="layer-tree__header">
      <div class="layer-tree__headline">
        <span class="panel-title">图层</span>
        <span class="badge badge--muted mono">{{ shown }}/{{ total }}</span>
      </div>
      <div class="layer-tree__actions">
        <button class="btn btn--ghost btn--icon btn--sm" type="button" aria-label="展开全部图层" title="展开全部" @click="expandAll">
          <AppIcon name="chevron-down" :size="15" />
        </button>
        <button class="btn btn--ghost btn--icon btn--sm" type="button" aria-label="折叠全部图层" title="折叠全部" @click="collapseAll">
          <AppIcon name="chevron-right" :size="15" />
        </button>
      </div>
    </header>

    <div class="layer-tree__search">
      <span class="search-icon"><AppIcon name="search" :size="15" /></span>
      <input
        v-model="query"
        class="search-input"
        type="search"
        placeholder="搜索图层名或类型"
        aria-label="搜索图层"
      />
      <button v-if="query" class="search-clear" type="button" aria-label="清除搜索" @click="query = ''">
        <AppIcon name="x" :size="13" />
      </button>
    </div>

    <div class="layer-tree__list scroll-area" role="tree" aria-label="PSD 图层树">
      <LayerTreeItem
        v-for="node in filteredTree"
        :key="node.id"
        :node="node"
        :depth="0"
        :selected-id="selectedId"
        :expanded="expanded"
        :force-expanded="forceExpanded"
        @select="emit('select', $event)"
        @toggle="toggle"
      />
      <div v-if="filteredTree.length === 0" class="layer-tree__empty">
        <AppIcon name="layers" :size="24" />
        <p>{{ query ? "没有匹配的图层" : "尚未读取到图层" }}</p>
      </div>
    </div>

    <footer class="layer-tree__footer">
      <span class="dot dot--accent"></span>
      <span class="layer-tree__engine">{{ engineLabel }}</span>
    </footer>
  </section>
</template>

<style scoped>
.layer-tree {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.layer-tree__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px 6px 14px;
}

.layer-tree__headline {
  display: flex;
  align-items: center;
  gap: 8px;
}

.layer-tree__actions {
  display: flex;
  gap: 1px;
}

.layer-tree__search {
  position: relative;
  margin: 4px 10px 8px;
}

.search-icon {
  position: absolute;
  top: 50%;
  left: 10px;
  display: grid;
  place-items: center;
  color: var(--muted);
  transform: translateY(-50%);
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: 32px;
  padding: 0 28px 0 31px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-2);
  color: var(--text);
  font-size: 12px;
  outline: none;
}

.search-input::placeholder {
  color: var(--muted);
}

.search-input:focus {
  border-color: var(--accent);
  background: var(--surface);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 13%, transparent);
}

.search-input::-webkit-search-cancel-button {
  display: none;
}

.search-clear {
  position: absolute;
  top: 50%;
  right: 6px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transform: translateY(-50%);
}

.search-clear:hover {
  background: var(--border);
  color: var(--text);
}

.layer-tree__list {
  flex: 1;
  overflow: auto;
  padding: 0 6px 12px;
}

.layer-tree__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 16px;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}

.layer-tree__footer {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
  font-size: 11px;
  color: var(--muted);
}

.layer-tree__engine {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
