<script setup lang="ts">
import { useRouter } from "vue-router";
import AppIcon from "@/components/AppIcon.vue";

const router = useRouter();
</script>

<template>
  <main class="not-found">
    <div class="not-found__card panel">
      <span class="not-found__mark"><AppIcon name="layers" :size="24" /></span>
      <p class="not-found__code mono">404 / LAYER_NOT_FOUND</p>
      <h1>这个图层不在画布里</h1>
      <p class="not-found__text">
        页面地址不存在，或项目已被删除。返回项目库继续处理本地 PSD。
      </p>
      <div class="not-found__actions">
        <button class="btn btn--primary" type="button" @click="router.push({ name: 'projects' })">
          <AppIcon name="arrow-left" :size="15" />
          返回项目库
        </button>
        <button class="btn btn--ghost" type="button" @click="router.back()">
          回到上一页
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.not-found {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 24px;
}

.not-found__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: min(460px, 100%);
  padding: 44px 32px;
  text-align: center;
}

.not-found__mark {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  margin-bottom: 4px;
  border-radius: 14px;
  background: var(--surface-inverse);
  color: #dbe6ff;
}

.not-found__code {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.not-found h1 {
  font-size: 22px;
  letter-spacing: -0.02em;
}

.not-found__text {
  max-width: 320px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
}

.not-found__actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
</style>
