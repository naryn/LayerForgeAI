import { describe, expect, it } from "vitest";
import type { LayerNode, Precondition } from "../domain";
import { DemoTransport } from "./demoTransport";

function fixtures(): LayerNode[] {
  return [
    { id: "l1", name: "背景", path: "0", kind: "pixel", visible: true, locked: false, opacity: 100, children: [] },
    { id: "l2", name: "标题", path: "1", kind: "text", visible: true, locked: false, opacity: 100, children: [] },
  ];
}

function makeTransport(): DemoTransport {
  return new DemoTransport({ projectName: "演示项目", width: 320, height: 200, layers: fixtures() });
}

async function opened(): Promise<DemoTransport> {
  const transport = makeTransport();
  await transport.connect();
  await transport.openFile(new File(["psd"], "demo.psd"));
  return transport;
}

async function preconditionFor(transport: DemoTransport): Promise<Precondition> {
  const snapshot = await transport.getDocument();
  return {
    documentId: snapshot.documentId,
    revision: snapshot.revision,
    fingerprint: snapshot.fingerprint,
  };
}

describe("DemoTransport 文档生命周期", () => {
  it("打开文档前拒绝读取", async () => {
    const transport = makeTransport();
    await transport.connect();
    await expect(transport.getDocument()).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
  });

  it("openFile 返回带演示指纹的快照", async () => {
    const transport = await opened();
    const snapshot = await transport.getDocument();
    expect(snapshot.documentId).toBe("demo-doc-1");
    expect(snapshot.revision).toBe("0");
    expect(snapshot.fingerprint).toMatch(/^demo-0-/);
    expect(snapshot.width).toBe(320);
    expect(snapshot.height).toBe(200);
    expect(snapshot.name).toBe("演示项目");
    expect(snapshot.layers.map((layer) => layer.name)).toEqual(["背景", "标题"]);
  });

  it("dispose 之后所有操作都报 DISPOSED", async () => {
    const transport = await opened();
    transport.dispose();
    await expect(transport.getDocument()).rejects.toMatchObject({ code: "DISPOSED" });
    await expect(transport.openFile(new File(["x"], "a.psd"))).rejects.toMatchObject({
      code: "DISPOSED",
    });
  });
});

describe("DemoTransport.renameLayer", () => {
  it("需要 documentId 与 revision 前置条件", async () => {
    const transport = await opened();
    await expect(
      transport.renameLayer("l1", "新名", { documentId: "", revision: "0" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_REQUIRED" });
  });

  it("拒绝空名称与超长名称", async () => {
    const transport = await opened();
    const precondition = await preconditionFor(transport);
    await expect(transport.renameLayer("l1", "   ", precondition)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    await expect(
      transport.renameLayer("l1", "a".repeat(4097), precondition),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("文档 id 不匹配时报 DOCUMENT_NOT_FOUND", async () => {
    const transport = await opened();
    await expect(
      transport.renameLayer("l1", "新名", { documentId: "other", revision: "0" }),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
  });

  it("revision 或 fingerprint 过期时报 STALE_DOCUMENT", async () => {
    const transport = await opened();
    const precondition = await preconditionFor(transport);
    await expect(
      transport.renameLayer("l1", "新名", { ...precondition, revision: "9" }),
    ).rejects.toMatchObject({ code: "STALE_DOCUMENT" });
    await expect(
      transport.renameLayer("l1", "新名", { ...precondition, fingerprint: "bad" }),
    ).rejects.toMatchObject({ code: "STALE_DOCUMENT" });
  });

  it("找不到图层时报 INVALID_REQUEST", async () => {
    const transport = await opened();
    const precondition = await preconditionFor(transport);
    await expect(transport.renameLayer("missing", "新名", precondition)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });

  it("改名成功后递增 revision，同名时保持不变", async () => {
    const transport = await opened();
    const precondition = await preconditionFor(transport);
    const renamed = await transport.renameLayer("l1", "新背景", precondition);
    expect(renamed).toEqual({ layerId: "l1", name: "新背景" });

    const next = await transport.getDocument();
    expect(next.revision).toBe("1");
    expect(next.fingerprint).toMatch(/^demo-1-/);
    expect(next.layers[0].name).toBe("新背景");

    const same = await transport.renameLayer("l1", "新背景", {
      documentId: next.documentId,
      revision: next.revision,
      fingerprint: next.fingerprint,
    });
    expect(same.name).toBe("新背景");
    expect((await transport.getDocument()).revision).toBe("1");
  });
});

describe("DemoTransport.renderPreview", () => {
  it("只允许 /saved/*.png 路径", async () => {
    const transport = await opened();
    await expect(transport.renderPreview("/tmp/preview.png", false)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });

  it("拒绝覆盖已生成的预览", async () => {
    const transport = await opened();
    const first = await transport.renderPreview("/saved/a.png", true);
    expect(first.simulated).toBe(true);
    expect(first.downloaded).toBe(false);
    expect(first.note).toMatch(/不会生成真实 PNG/);
    await expect(transport.renderPreview("/saved/a.png", false)).rejects.toMatchObject({
      code: "SCRIPT_ERROR",
    });
  });
});

describe("DemoTransport.saveAsAndReopen", () => {
  it("只允许新的 /saved/*.psd|psb 路径", async () => {
    const transport = await opened();
    const precondition = await preconditionFor(transport);
    await expect(
      transport.saveAsAndReopen("/saved/a.png", precondition),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("拒绝覆盖已有保存目标", async () => {
    const transport = await opened();
    const precondition = await preconditionFor(transport);
    await transport.saveAsAndReopen("/saved/out.psd", precondition);
    const next = await preconditionFor(transport);
    await expect(transport.saveAsAndReopen("/saved/out.psd", next)).rejects.toMatchObject({
      code: "SCRIPT_ERROR",
    });
  });

  it("保存并重开后返回新文档与路径，revision 归零", async () => {
    const transport = await opened();
    const precondition = await preconditionFor(transport);
    await transport.renameLayer("l1", "已改", precondition);
    const afterRename = await preconditionFor(transport);

    const snapshot = await transport.saveAsAndReopen("/saved/out.psd", afterRename);
    expect(snapshot.documentId).toBe("demo-doc-2");
    expect(snapshot.revision).toBe("0");
    expect(snapshot.path).toBe("/saved/out.psd");
    expect(snapshot.layers[0].name).toBe("已改");
  });
});

function groupFixtures(): LayerNode[] {
  const bounds = { x: 0, y: 0, width: 40, height: 30 };
  return [
    { id: "a", name: "底", path: "0", kind: "pixel", bounds, visible: true, locked: false, opacity: 100, children: [] },
    { id: "b", name: "标题", path: "1", kind: "text", bounds, visible: true, locked: false, opacity: 100, children: [] },
    { id: "c", name: "按钮", path: "2", kind: "shape", bounds, visible: true, locked: false, opacity: 100, children: [] },
  ];
}

async function openedGroupTransport(): Promise<DemoTransport> {
  const transport = new DemoTransport({
    projectName: "编组项目",
    width: 320,
    height: 200,
    layers: groupFixtures(),
  });
  await transport.connect();
  await transport.openFile(new File(["psd"], "group.psd"));
  return transport;
}

describe("DemoTransport.groupLayers", () => {
  it("需要前置条件、有效名称与至少两个同级图层", async () => {
    const transport = await openedGroupTransport();
    const precondition = await preconditionFor(transport);
    await expect(
      transport.groupLayers(["a", "c"], "组合", { documentId: "", revision: "0" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_REQUIRED" });
    await expect(transport.groupLayers(["a", "c"], "  ", precondition)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    await expect(transport.groupLayers(["a"], "组合", precondition)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });

  it("按原始顺序把选中间层放进新组并递增 revision", async () => {
    const transport = await openedGroupTransport();
    const precondition = await preconditionFor(transport);
    const result = await transport.groupLayers(["c", "a"], "角标组", precondition);
    expect(result.name).toBe("角标组");
    expect(result.layerIds).toEqual(["a", "c"]);

    const snapshot = await transport.getDocument();
    expect(snapshot.revision).toBe("1");
    expect(snapshot.layers.map((layer) => layer.name)).toEqual(["角标组", "标题"]);
    const group = snapshot.layers[0];
    expect(group.kind).toBe("group");
    expect(group.children.map((layer) => layer.id)).toEqual(["a", "c"]);
    expect(group.children.map((layer) => layer.path)).toEqual(["0/0", "0/1"]);
    expect(snapshot.layers[1].path).toBe("1");
  });

  it("拒绝跨父级与重复 id", async () => {
    const transport = await openedGroupTransport();
    const precondition = await preconditionFor(transport);
    await transport.groupLayers(["a", "c"], "组", precondition);
    const next = await preconditionFor(transport);
    await expect(transport.groupLayers(["a", "a"], "组", next)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    await expect(
      transport.groupLayers(["a", "b"], "组", next),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});

describe("DemoTransport.mergeLayers", () => {
  it("合并组为单个像素层并保留合并名称", async () => {
    const transport = await openedGroupTransport();
    const precondition = await preconditionFor(transport);
    const group = await transport.groupLayers(["a", "b", "c"], "卡片", precondition);
    const afterGroup = await preconditionFor(transport);
    const result = await transport.mergeLayers([group.groupId], "卡片-merged", afterGroup);

    expect(result.name).toBe("卡片-merged");
    expect(result.layerIds).toEqual([result.layerId]);
    const snapshot = await transport.getDocument();
    expect(snapshot.revision).toBe("2");
    expect(snapshot.layers).toHaveLength(1);
    expect(snapshot.layers[0]).toMatchObject({
      id: result.layerId,
      name: "卡片-merged",
      kind: "pixel",
      path: "0",
      meta: { demoMerged: true },
    });
    expect(snapshot.layers[0].children).toEqual([]);
  });

  it("合并后保存并重开仍保留单层结构", async () => {
    const transport = await openedGroupTransport();
    const precondition = await preconditionFor(transport);
    const group = await transport.groupLayers(["a", "c"], "组合", precondition);
    const merged = await transport.mergeLayers(
      [group.groupId],
      "组合-merged",
      await preconditionFor(transport),
    );
    const snapshot = await transport.saveAsAndReopen(
      "/saved/group.psd",
      await preconditionFor(transport),
    );
    expect(snapshot.layers).toHaveLength(2);
    expect(snapshot.layers[0]).toMatchObject({
      id: merged.layerId,
      name: "组合-merged",
      kind: "pixel",
    });
    expect(snapshot.layers[1].name).toBe("标题");
  });
});

describe("DemoTransport.undo", () => {
  it("撤销最近一次编组并恢复原图层树", async () => {
    const transport = await openedGroupTransport();
    await transport.groupLayers(["a", "c"], "角标组", await preconditionFor(transport));
    const afterGroup = await preconditionFor(transport);

    const restored = await transport.undo(afterGroup);
    expect(restored.revision).toBe("2");
    expect(restored.layers.map((layer) => layer.name)).toEqual(["底", "标题", "按钮"]);
    expect(restored.layers.map((layer) => layer.path)).toEqual(["0", "1", "2"]);
    expect(restored.layers.every((layer) => layer.kind !== "group")).toBe(true);
  });

  it("撤销合并后恢复组结构，保存并重开后清空撤销历史", async () => {
    const transport = await openedGroupTransport();
    const group = await transport.groupLayers(["a", "c"], "组合", await preconditionFor(transport));
    await transport.mergeLayers([group.groupId], "组合-merged", await preconditionFor(transport));

    const restored = await transport.undo(await preconditionFor(transport));
    expect(restored.layers.map((layer) => layer.name)).toEqual(["组合", "标题"]);
    expect(restored.layers[0].children.map((layer) => layer.id)).toEqual(["a", "c"]);

    const reopened = await transport.saveAsAndReopen(
      "/saved/group-undo.psd",
      await preconditionFor(transport),
    );
    const precondition = {
      documentId: reopened.documentId,
      revision: reopened.revision,
      fingerprint: reopened.fingerprint,
    };
    await expect(transport.undo(precondition)).rejects.toMatchObject({ code: "SCRIPT_ERROR" });
  });

  it("没有历史或前置条件缺失时拒绝撤销", async () => {
    const transport = await opened();
    await expect(
      transport.undo({ documentId: "", revision: "0" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_REQUIRED" });
    await expect(transport.undo(await preconditionFor(transport))).rejects.toMatchObject({
      code: "SCRIPT_ERROR",
    });
  });
});

describe("DemoTransport.comparePreview", () => {
  it("只对比已生成的预览，并标记为模拟结果", async () => {
    const transport = await opened();
    await transport.renderPreview("/saved/before.png", false);
    await transport.renderPreview("/saved/after.png", false);
    const result = await transport.comparePreview("/saved/before.png", "/saved/after.png");
    expect(result.simulated).toBe(true);
    expect(result.differingPixels).toBe(0);
    expect(result.totalPixels).toBe(320 * 200);
  });
});