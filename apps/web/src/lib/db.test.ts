import { reactive } from "vue";
import { describe, expect, it } from "vitest";
import type { ProjectRecord, StoredProjectFile, StoredSnapshot } from "./domain";
import {
  localSnapshotKey,
  ProjectRepository,
  revisionSnapshotKey,
  toPlain,
} from "./db";

let counter = 0;

function makeProject(overwrite: Partial<ProjectRecord> = {}): ProjectRecord {
  counter += 1;
  const now = new Date(2026, 0, 1, 0, 0, counter).toISOString();
  return {
    id: `prj_${counter}`,
    name: `项目 ${counter}`,
    createdAt: now,
    updatedAt: now,
    source: {
      version: 1,
      channels: 3,
      width: 100,
      height: 80,
      depth: 8,
      colorMode: 3,
      colorModeLabel: "RGB",
      fileSize: 512,
      fileName: "a.psd",
      sha256: "deadbeef",
      layerCount: 2,
    },
    localInspection: { layerCount: 2, parsedWith: "ag-psd" },
    plan: [
      {
        id: "p1",
        path: "0",
        originalName: "旧",
        newName: "新",
        status: "draft",
        updatedAt: now,
      },
    ],
    revisions: [],
    ...overwrite,
  };
}

function makeFile(projectId: string): StoredProjectFile {
  return {
    projectId,
    fileName: "a.psd",
    size: 3,
    type: "image/vnd.adobe.photoshop",
    blob: new Blob([new Uint8Array([1, 2, 3])]),
  };
}

describe("toPlain", () => {
  it("深度复制普通对象与数组", () => {
    const input = { a: 1, nested: { b: [1, 2, { c: 3 }] } };
    const plain = toPlain(input);
    expect(plain).toEqual(input);
    expect(plain).not.toBe(input);
    expect(plain.nested).not.toBe(input.nested);
    expect(plain.nested.b[2]).not.toBe(input.nested.b[2]);
  });

  it("剥离 Vue 响应式代理", () => {
    const source = reactive({ id: "x", plan: [{ path: "0" }] });
    const plain = toPlain(source);
    expect(plain).toEqual({ id: "x", plan: [{ path: "0" }] });
    expect(isProxy(plain)).toBe(false);
    expect(isProxy(plain.plan)).toBe(false);
  });

  it("保留 Blob、Date 等类实例的身份", () => {
    const blob = new Blob(["x"]);
    const date = new Date();
    expect(toPlain(blob)).toBe(blob);
    expect(toPlain(date)).toBe(date);
    expect(toPlain({ blob, date })).toEqual({ blob, date });
  });
});

function isProxy(value: unknown): boolean {
  return Boolean((value as { __v_isReactive?: boolean } | null)?.__v_isReactive);
}

describe("ProjectRepository", () => {
  it("写入后可读回，并按 updatedAt 倒序排列", async () => {
    const repository = new ProjectRepository();
    const older = makeProject({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const newer = makeProject({ updatedAt: "2026-06-01T00:00:00.000Z" });
    await repository.put(older);
    await repository.put(newer);

    expect(await repository.get(older.id)).toEqual(older);
    const ids = (await repository.list()).map((item) => item.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
  });

  it("接受响应式对象（回归：结构化克隆拒绝 Proxy）", async () => {
    const repository = new ProjectRepository();
    const project = makeProject();
    const reactiveProject = reactive(project);
    await expect(repository.put(reactiveProject)).resolves.toBeUndefined();
    const stored = await repository.get(project.id);
    expect(stored?.plan).toEqual(project.plan);
    expect(isProxy(stored)).toBe(false);
  });

  it("保存与读取源文件记录", async () => {
    const repository = new ProjectRepository();
    const project = makeProject();
    const file = makeFile(project.id);
    await repository.putFile(file, project);

    const storedFile = await repository.getFile(project.id);
    expect(storedFile?.fileName).toBe("a.psd");
    expect(storedFile?.size).toBe(3);
    // putFile 同时更新项目记录
    expect((await repository.get(project.id))?.id).toBe(project.id);
  });

  it("保存与读取快照", async () => {
    const repository = new ProjectRepository();
    const project = makeProject();
    const snapshot: StoredSnapshot = {
      key: localSnapshotKey(project.id),
      projectId: project.id,
      kind: "local",
      createdAt: "2026-01-01T00:00:00.000Z",
      data: { layers: [{ path: "0" }] },
    };
    await repository.putSnapshot(snapshot);
    expect(await repository.getSnapshot(localSnapshotKey(project.id))).toEqual(snapshot);
  });

  it("删除项目时级联清理源文件与快照", async () => {
    const repository = new ProjectRepository();
    const project = makeProject();
    await repository.putFile(makeFile(project.id), project);
    await repository.putSnapshot({
      key: revisionSnapshotKey(project.id, "rev1"),
      projectId: project.id,
      kind: "revision",
      createdAt: "2026-01-01T00:00:00.000Z",
      data: { layers: [] },
    });

    await repository.remove(project.id);

    expect(await repository.get(project.id)).toBeUndefined();
    expect(await repository.getFile(project.id)).toBeUndefined();
    expect(await repository.getSnapshot(revisionSnapshotKey(project.id, "rev1"))).toBeUndefined();
  });

  it("读取不存在的记录返回 undefined", async () => {
    const repository = new ProjectRepository();
    expect(await repository.get("prj_missing")).toBeUndefined();
    expect(await repository.getFile("prj_missing")).toBeUndefined();
    expect(await repository.getSnapshot("local:prj_missing")).toBeUndefined();
  });
});