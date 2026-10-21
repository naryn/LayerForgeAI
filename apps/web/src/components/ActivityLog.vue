<script setup lang="ts">
import { computed } from "vue";
import type { SessionLogLevel } from "@/stores/session";
import { formatClock } from "@/lib/format";
import { useSessionStore } from "@/stores/session";
import AppIcon from "./AppIcon.vue";
import type { IconName } from "./icons";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const session = useSessionStore();
const entries = computed(() => [...session.logs].reverse());

const DOT_CLASS: Record<SessionLogLevel, string> = {
  info: "dot--accent",
  success: "dot--success",
  warn: "dot--warn",
  error: "dot--danger",
};

const ICONS: Record<SessionLogLevel, IconName> = {
  info: "info",
  success: "check-circle",
  warn: "warning",
  error: "x",
};
</script>

<template>
  <Transition name="log-drawer">
    <section v-if="open" class="activity-log panel" aria-label="活动日志">
      <header class="activity-log__header">
        <div class="activity-log__title">
          <AppIcon name="terminal" :size="14" />
          <span class="panel-title">活动日志</span>
          <span class="badge badge--muted">{{ entries.length }}</span>
          <span class="activity-log__engine">{{ session.engineLabel }}</span>
        </div>
        <button
          class="btn btn--ghost btn--icon btn--sm"
          type="button"
          aria-label="关闭活动日志"
          @click="emit('close')"
        >
          <AppIcon name="x" :size="14" />
        </button>
      </header>
      <div class="activity-log__body scroll-area">
        <div v-if="entries.length === 0" class="activity-log__empty">
          尚无日志。打开文件或执行桥接操作后会显示在这里。
        </div>
        <ol v-else class="log-list">
          <li v-for="entry in entries" :key="entry.id" class="log-entry">
            <span class="log-time mono">{{ formatClock(entry.at) }}</span>
            <span class="dot" :class="DOT_CLASS[entry.level]"></span>
            <span class="log-icon" :class="`level-${entry.level}`">
              <AppIcon :name="ICONS[entry.level]" :size="12" />
            </span>
            <div class="log-text">
              <span class="log-message">{{ entry.message }}</span>
              <span v-if="entry.detail" class="log-detail">{{ entry.detail }}</span>
            </div>
          </li>
        </ol>
      </div>
      <footer class="activity-log__footer">
        页面内最多保留 300 条；日志仅用于本地调试，不会上传。
      </footer>
    </section>
  </Transition>
</template>

<style scoped>
.activity-log {
  display: flex;
  flex-direction: column;
  max-height: 220px;
  min-height: 0;
  overflow: hidden;
}

.activity-log__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px 6px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  flex: 0 0 auto;
}

.activity-log__title {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  color: var(--text-2);
}

.activity-log__engine {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10.5px;
  color: var(--muted);
}

.activity-log__body {
  flex: 1;
  overflow: auto;
  padding: 4px 0;
  background: var(--surface);
}

.activity-log__empty {
  padding: 20px;
  color: var(--muted);
  font-size: 11.5px;
  text-align: center;
}

.log-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.log-entry {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 4px 12px;
  font-size: 11.5px;
  line-height: 1.45;
}

.log-entry:hover {
  background: var(--surface-2);
}

.log-time {
  flex: 0 0 auto;
  padding-top: 1px;
  font-size: 10px;
  color: var(--muted);
}

.log-entry > .dot {
  margin-top: 5px;
}

.log-icon {
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--muted);
}

.log-icon.level-success {
  color: var(--success);
}

.log-icon.level-warn {
  color: var(--warn);
}

.log-icon.level-error {
  color: var(--danger);
}

.log-text {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 6px;
  min-width: 0;
  color: var(--text-2);
}

.log-message {
  font-weight: 550;
}

.log-detail {
  color: var(--muted);
  word-break: break-word;
}

.activity-log__footer {
  flex: 0 0 auto;
  padding: 5px 12px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
  font-size: 10px;
  color: var(--muted);
}

.log-drawer-enter-active,
.log-drawer-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}

.log-drawer-enter-from,
.log-drawer-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
