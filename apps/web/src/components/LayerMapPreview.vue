<script setup lang="ts">
import { computed } from "vue";
import type { LayerKind, LayerNode } from "@/lib/domain";
import { flattenLayers } from "@/lib/layers";

const props = defineProps<{
  layers: LayerNode[];
  width?: number;
  height?: number;
  selectedId: string | null;
}>();

const viewWidth = computed(() => (props.width && props.width > 0 ? props.width : 1000));
const viewHeight = computed(() => (props.height && props.height > 0 ? props.height : 700));

const boxes = computed(() =>
  flattenLayers(props.layers)
    .filter((layer) => layer.bounds && layer.bounds.width > 0 && layer.bounds.height > 0)
    .map((layer) => ({
      id: layer.id,
      name: layer.name,
      kind: layer.kind as LayerKind,
      x: layer.bounds?.x ?? 0,
      y: layer.bounds?.y ?? 0,
      width: layer.bounds?.width ?? 0,
      height: layer.bounds?.height ?? 0,
      selected: layer.id === props.selectedId,
      group: layer.kind === "group",
      hidden: !layer.visible,
    })),
);
</script>

<template>
  <div class="map-wrap" aria-hidden="true">
    <div class="map-grid"></div>
    <svg
      v-if="boxes.length"
      class="map-svg"
      :viewBox="`0 0 ${viewWidth} ${viewHeight}`"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="由图层边界生成的结构示意图"
    >
      <rect
        v-for="box in boxes"
        :key="box.id"
        :x="box.x"
        :y="box.y"
        :width="box.width"
        :height="box.height"
        :class="['map-box', `kind-${box.kind}`, { 'is-selected': box.selected, 'is-group': box.group, 'is-hidden': box.hidden }]"
        rx="2"
        vector-effect="non-scaling-stroke"
      >
        <title>{{ box.name }}</title>
      </rect>
    </svg>
    <div v-else class="map-empty">
      <p>没有可用的图层边界</p>
    </div>
  </div>
</template>

<style scoped>
.map-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 8px;
  background: #f8f9fb;
  box-shadow: inset 0 0 0 1px var(--border);
}

.map-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(45deg, rgba(15, 20, 27, 0.035) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(15, 20, 27, 0.035) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(15, 20, 27, 0.035) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(15, 20, 27, 0.035) 75%);
  background-size: 18px 18px;
  background-position: 0 0, 0 9px, 9px -9px, -9px 0;
}

.map-svg {
  position: absolute;
  inset: 24px;
  width: calc(100% - 48px);
  height: calc(100% - 48px);
}

.map-box {
  fill: rgba(122, 162, 255, 0.08);
  stroke: rgba(79, 124, 255, 0.65);
  stroke-width: 1;
}

.map-box.is-group {
  fill: transparent;
  stroke: rgba(90, 107, 134, 0.55);
  stroke-dasharray: 4 3;
}

.map-box.is-hidden {
  opacity: 0.35;
}

.map-box.kind-text {
  stroke: rgba(183, 121, 31, 0.72);
  fill: rgba(240, 179, 90, 0.09);
}

.map-box.kind-adjustment {
  stroke: rgba(139, 92, 246, 0.72);
  fill: rgba(139, 92, 246, 0.08);
}

.map-box.kind-shape {
  stroke: rgba(15, 159, 122, 0.72);
  fill: rgba(77, 212, 172, 0.08);
}

.map-box.kind-smart-object {
  stroke: rgba(194, 65, 142, 0.72);
  fill: rgba(194, 65, 142, 0.08);
}

.map-box.is-selected {
  fill: rgba(79, 124, 255, 0.2);
  stroke: #2f5ee8;
  stroke-width: 2.5;
  stroke-dasharray: none;
}

.map-box:not(.is-selected):hover {
  fill: rgba(79, 124, 255, 0.18);
}

.map-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 12px;
}
</style>
