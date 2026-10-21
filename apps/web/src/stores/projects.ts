import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type {
  LayerNode,
  PlanEntry,
  ProjectRecord,
  RevisionRecord,
} from "@/lib/domain";
import {
  localSnapshotKey,
  projectRepository,
  revisionSnapshotKey,
} from "@/lib/db";
import { createId } from "@/lib/format";
import { countLayers } from "@/lib/layers";
import { inspectPsd, isPsdFileName, sha256Hex } from "@/lib/psd";

const MAX_PSD_BYTES = 1_500_000_000;

function defaultProjectName(fileName: string): string {
  return fileName.replace(/\.(psd|psb)$/i, "").trim() || "未命名项目";
}

export const useProjectsStore = defineStore("projects", () => {
  const items = ref<ProjectRecord[]>([]);
  const loading = ref(false);
  const importing = ref(false);
  const ready = ref(false);
  const error = ref<string | null>(null);

  const sortedItems = computed(() =>
    [...items.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );

  function replaceItem(project: ProjectRecord): void {
    const index = items.value.findIndex((item) => item.id === project.id);
    if (index >= 0) items.value.splice(index, 1, project);
    else items.value.push(project);
  }

  async function load(force = false): Promise<void> {
    if (ready.value && !force) return;
    loading.value = true;
    error.value = null;
    try {
      items.value = await projectRepository.list();
      ready.value = true;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    } finally {
      loading.value = false;
    }
  }

  async function ensure(projectId: string): Promise<ProjectRecord | undefined> {
    const cached = items.value.find((item) => item.id === projectId);
    if (cached) return cached;
    const project = await projectRepository.get(projectId);
    if (project) replaceItem(project);
    return project;
  }

  async function createFromFile(file: File, name: string): Promise<ProjectRecord> {
    if (!isPsdFileName(file.name)) {
      throw new Error("仅支持 .psd 或 .psb 文件");
    }
    if (file.size === 0) throw new Error("文件为空");
    if (file.size > MAX_PSD_BYTES) {
      throw new Error("文件超过 1.5 GB 限制，请拆分或使用桌面工作流");
    }
    importing.value = true;
    error.value = null;
    try {
      const buffer = await file.arrayBuffer();
      const sha256 = await sha256Hex(buffer);
      const inspection = await inspectPsd(buffer);
      const layers = inspection.layers;
      const now = new Date().toISOString();
      const project: ProjectRecord = {
        id: createId("prj"),
        name: name.trim() || defaultProjectName(file.name),
        createdAt: now,
        updatedAt: now,
        source: {
          ...inspection.header,
          fileName: file.name,
          sha256,
          layerCount: countLayers(layers),
        },
        localInspection: {
          layerCount: countLayers(layers),
          parsedWith: "ag-psd",
          ...(inspection.warning ? { warning: inspection.warning } : {}),
        },
        plan: [],
        revisions: [],
      };
      await projectRepository.putSnapshot({
        key: localSnapshotKey(project.id),
        projectId: project.id,
        kind: "local",
        createdAt: now,
        data: { layers },
      });
      await projectRepository.putFile(
        {
          projectId: project.id,
          fileName: file.name,
          size: file.size,
          type: file.type || "image/vnd.adobe.photoshop",
          blob: file,
        },
        project,
      );
      replaceItem(project);
      return project;
    } finally {
      importing.value = false;
    }
  }

  async function getLocalLayers(project: ProjectRecord): Promise<LayerNode[]> {
    const stored = await projectRepository.getSnapshot(localSnapshotKey(project.id));
    if (stored) {
      const data = stored.data as { layers?: LayerNode[] } | undefined;
      if (Array.isArray(data?.layers)) return data.layers;
    }
    const file = await projectRepository.getFile(project.id);
    if (!file) throw new Error("找不到项目源文件");
    const inspection = await inspectPsd(await file.blob.arrayBuffer());
    await projectRepository.putSnapshot({
      key: localSnapshotKey(project.id),
      projectId: project.id,
      kind: "local",
      createdAt: new Date().toISOString(),
      data: { layers: inspection.layers },
    });
    const updated: ProjectRecord = {
      ...project,
      updatedAt: new Date().toISOString(),
      localInspection: {
        layerCount: countLayers(inspection.layers),
        parsedWith: "ag-psd",
        ...(inspection.warning ? { warning: inspection.warning } : {}),
      },
    };
    await projectRepository.put(updated);
    replaceItem(updated);
    return inspection.layers;
  }

  async function getFile(projectId: string): Promise<File | undefined> {
    const stored = await projectRepository.getFile(projectId);
    if (!stored) return undefined;
    return new File([stored.blob], stored.fileName, {
      type: stored.type || "image/vnd.adobe.photoshop",
    });
  }

  async function savePlan(projectId: string, plan: PlanEntry[]): Promise<void> {
    const project = await ensure(projectId);
    if (!project) throw new Error("项目不存在");
    const updated: ProjectRecord = {
      ...project,
      // Store a snapshot: applying a plan mutates the caller's working array in
      // place, and aliasing it here would let later changes hide behind an
      // unchanged array reference, which Vue cannot observe.
      plan: plan.map((entry) => ({ ...entry })),
      updatedAt: new Date().toISOString(),
    };
    await projectRepository.put(updated);
    replaceItem(updated);
  }

  async function recordRevision(
    projectId: string,
    revision: RevisionRecord,
    layers: LayerNode[],
  ): Promise<void> {
    await projectRepository.putSnapshot({
      key: revisionSnapshotKey(projectId, revision.id),
      projectId,
      kind: "revision",
      createdAt: revision.createdAt,
      data: { layers },
    });
    const project = await ensure(projectId);
    if (!project) throw new Error("项目不存在");
    const updated: ProjectRecord = {
      ...project,
      revisions: [revision, ...project.revisions],
      updatedAt: revision.createdAt,
    };
    await projectRepository.put(updated);
    replaceItem(updated);
  }

  async function getRevisionLayers(
    projectId: string,
    revisionId: string,
  ): Promise<LayerNode[] | undefined> {
    const stored = await projectRepository.getSnapshot(
      revisionSnapshotKey(projectId, revisionId),
    );
    const data = stored?.data as { layers?: LayerNode[] } | undefined;
    return Array.isArray(data?.layers) ? data.layers : undefined;
  }

  async function remove(projectId: string): Promise<void> {
    await projectRepository.remove(projectId);
    items.value = items.value.filter((item) => item.id !== projectId);
  }

  function clearError(): void {
    error.value = null;
  }

  return {
    items,
    sortedItems,
    loading,
    importing,
    ready,
    error,
    load,
    ensure,
    createFromFile,
    getLocalLayers,
    getFile,
    savePlan,
    recordRevision,
    getRevisionLayers,
    remove,
    clearError,
  };
});

export { defaultProjectName };
