import { createRouter, createWebHistory } from "vue-router";
import ProjectListView from "@/views/ProjectListView.vue";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "projects",
      component: ProjectListView,
      meta: { title: "项目" },
    },
    {
      path: "/project/:id",
      name: "editor",
      component: () => import("@/views/EditorView.vue"),
      meta: { title: "编辑器" },
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: () => import("@/views/NotFoundView.vue"),
      meta: { title: "页面不存在" },
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

router.afterEach((route) => {
  document.title = route.name === "projects"
    ? "LayerForge — PSD Normalize Studio"
    : `${String(route.meta.title ?? "工作台")} · LayerForge`;
});
