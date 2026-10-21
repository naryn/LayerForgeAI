<script setup lang="ts">
import { computed } from "vue";
import type { LayerKind, LayerNode } from "@/lib/domain";
import AppIcon from "./AppIcon.vue";
import type { IconName } from "./icons";

const props = defineProps<{
  node: LayerNode;
  depth: number;
  selectedId: string | null;
  expanded: Set<string>;
  forceExpanded: boolean;
}>();

const emit = defineEmits<{
  select: [layerId: string];
  toggle: [path: string];
}>();

const KIND_ICONS: Record<LayerKind, IconName> = {
  group: "group",
  pixel: "image",
  text: "text",
  adjustment: "adjustment",
  shape: "shape",
  "smart-object": "smart-object",
  unknown: "layers",
};

const hasChildren = computed(() => props.node.children.length > 0);
const open = computed(() => props.forceExpanded || props.expanded.has(props.node.path));
const selected = computed(() => props.node.id === props.selectedId);
const kindIcon = computed(() => KIND_ICONS[props.node.kind]);

function select(): void {
  emit("select", props.node.id);
}

function toggle(): void {
  if (hasChildren.value) emit("toggle", props.node.path);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    select();
  } else if (event.key === "ArrowRight" && hasChildren.value && !open.value) {
    event.preventDefault();
    toggle();
  } else if (event.key === "ArrowLeft" && hasChildren.value && open.value) {
    event.preventDefault();
    toggle();
  }
}
</script>

<template>
  <div class="tree-node">
    <div
      class="tree-row"
      :class="{ 'is-selected': selected, 'is-hidden': !node.visible }"
      :style="{ paddingLeft: `${8 + depth * 14}px` }"
      role="treeitem"
      :aria-selected="selected"
      :aria-expanded="hasChildren ? open : undefined"
      tabindex="0"
      @click="select"
      @dblclick="toggle"
      @keydown="onKeydown"
    >
      <button
        v-if="hasChildren"
        class="tree-twisty"
        type="button"
        :aria-label="open ? '折叠图层组' : '展开图层组'"
        @click.stop="toggle"
      >
        <AppIcon :name="open ? 'chevron-down' : 'chevron-right'" :size="14" />
      </button>
      <span v-else class="tree-twisty tree-twisty--placeholder" aria-hidden="true"></span>
      <span class="tree-kind" :class="`kind-${node.kind}`">
        <AppIcon :name="kindIcon" :size="14" />
      </span>
      <span class="tree-name" :title="node.name">{{ node.name }}</span>
      <span v-if="node.clipping" class="tree-tag" title="剪贴蒙版">C</span>
      <span v-if="node.locked" class="tree-flag" title="已锁定">
        <AppIcon name="lock" :size="12" />
      </span>
      <span v-if="!node.visible" class="tree-flag" title="已隐藏">
        <AppIcon name="eye-off" :size="12" />
      </span>
      <span v-if="hasChildren" class="tree-count">{{ node.children.length }}</span>
    </div>
    <div v-if="hasChildren && open" class="tree-children" role="group">
      <LayerTreeItem
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :selected-id="selectedId"
        :expanded="expanded"
        :force-expanded="forceExpanded"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding-right: 8px;
  border-radius: 6px;
  cursor: default;
  color: var(--text-2);
  outline: none;
  user-select: none;
}

.tree-row:hover {
  background: var(--surface-3);
}

.tree-row:focus-visible {
  box-shadow: inset 0 0 0 2px var(--accent);
}

.tree-row.is-selected {
  background: var(--accent-soft);
  color: var(--text);
}

.tree-row.is-selected .tree-name {
  color: var(--accent-2);
  font-weight: 600;
}

.tree-row.is-hidden .tree-name {
  opacity: 0.55;
}

.tree-twisty {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  flex: 0 0 auto;
}

.tree-twisty:hover {
  background: var(--border);
  color: var(--text);
}

.tree-twisty--placeholder {
  cursor: default;
}

.tree-kind {
  display: grid;
  place-items: center;
  width: 18px;
  color: var(--muted);
  flex: 0 0 auto;
}

.tree-kind.kind-text {
  color: #b7791f;
}

.tree-kind.kind-adjustment {
  color: #8b5cf6;
}

.tree-kind.kind-shape {
  color: #0f9f7a;
}

.tree-kind.kind-smart-object {
  color: #c2418e;
}

.tree-kind.kind-group {
  color: #5a6b86;
}

.tree-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  line-height: 1.4;
}

.tree-flag {
  display: grid;
  place-items: center;
  color: var(--muted);
  flex: 0 0 auto;
}

.tree-tag {
  flex: 0 0 auto;
  font-size: 9px;
  font-weight: 700;
  color: #8b5cf6;
  border: 1px solid color-mix(in srgb, #8b5cf6 35%, transparent);
  border-radius: 3px;
  padding: 0 3px;
  line-height: 14px;
}

.tree-count {
  margin-left: auto;
  flex: 0 0 auto;
  font-size: 10px;
  color: var(--muted);
  background: var(--surface-2);
  border-radius: 999px;
  padding: 0 5px;
  line-height: 15px;
  font-variant-numeric: tabular-nums;
}
</style>
