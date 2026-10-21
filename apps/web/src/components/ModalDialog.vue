<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppIcon from "./AppIcon.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    subtitle?: string;
    wide?: boolean;
    closeOnBackdrop?: boolean;
  }>(),
  { wide: false, closeOnBackdrop: true },
);

const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);
const titleId = `dialog-title-${Math.random().toString(36).slice(2, 9)}`;

function close(): void {
  emit("close");
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && props.open) {
    event.preventDefault();
    close();
  }
}

function onBackdrop(): void {
  if (props.closeOnBackdrop) close();
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    await nextTick();
    const focusable =
      panel.value?.querySelector<HTMLElement>("[data-autofocus]") ??
      panel.value?.querySelector<HTMLElement>(
        "input:not([disabled]), button:not([disabled]), select, textarea, a[href]",
      );
    focusable?.focus();
  },
);

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="open" class="dialog-overlay" @mousedown.self="onBackdrop">
        <section
          ref="panel"
          class="dialog"
          :class="{ 'dialog--wide': wide }"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
        >
          <header class="dialog__header">
            <div class="dialog__titles">
              <h2 :id="titleId">{{ title }}</h2>
              <p v-if="subtitle">{{ subtitle }}</p>
            </div>
            <button class="btn btn--ghost btn--icon btn--sm" type="button" aria-label="关闭" @click="close">
              <AppIcon name="x" :size="16" />
            </button>
          </header>
          <div class="dialog__body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="dialog__footer">
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
