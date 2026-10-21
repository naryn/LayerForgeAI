import { describe, expect, it } from "vitest";
import type { DocumentSnapshot, LayerNode } from "./domain";
import { diffLayerTrees, psdDiffFileName } from "./diff";

type LayerFixture = Pick<LayerNode, "id" | "name" | "path"> & Partial<LayerNode>;

function layer(fixture: LayerFixture): LayerNode {
  return {
    kind: "pixel",
    visible: true,
    locked: false,
    opacity: 100,
    children: [],
    ...fixture,
  };
}

function snapshot(layers: LayerNode[], revision = "0"): DocumentSnapshot {
  return {
    documentId: "doc-1",
    revision,
    fingerprint: "fingerprint",
    name: "fixture.psd",
    width: 1280,
    height: 720,
    layers,
    capturedAt: "2026-10-20T00:00:00.000Z",
  };
}

describe("diffLayerTrees", () => {
  it("identifies renames and keeps an untouched layer out of entries", () => {
    const before = snapshot([
      layer({ id: "a", name: "图层 1", path: "0" }),
      layer({ id: "b", name: "icon", path: "1" }),
    ]);
    const after = snapshot([
      layer({ id: "a", name: "hero-title", path: "0" }),
      layer({ id: "b", name: "icon", path: "1" }),
    ], "1");

    const report = diffLayerTrees(before, after, {
      now: new Date("2026-10-20T12:00:00.000Z"),
    });

    expect(report.schema).toBe("layerforge.psd-diff");
    expect(report.schemaVersion).toBe("0.1.0");
    expect(report.evidence).toBe("engine-layer-tree");
    expect(report.simulated).toBe(false);
    expect(report.generatedAt).toBe("2026-10-20T12:00:00.000Z");
    expect(report.summary).toMatchObject({
      beforeLayers: 2,
      afterLayers: 2,
      renamed: 1,
      geometryChanged: 0,
      restyled: 0,
      added: 0,
      removed: 0,
      unchanged: 1,
    });
    expect(report.entries).toHaveLength(1);
    expect(report.entries[0]).toMatchObject({
      layerId: "a",
      status: "changed",
      matchedBy: "id",
      nameBefore: "图层 1",
      nameAfter: "hero-title",
    });
    expect(report.entries[0].changes).toEqual([
      { field: "name", label: "名称", before: "图层 1", after: "hero-title" },
    ]);
    expect(report.notes.join(" ")).toContain("不是 PSD 二进制，也不是像素差异");
  });

  it("classifies geometry and style changes, with name taking precedence", () => {
    const before = snapshot([
      layer({
        id: "a",
        name: "button",
        path: "0",
        bounds: { x: 10, y: 20, width: 80, height: 40 },
        opacity: 100,
        meta: { fontSize: 14 },
      }),
      layer({ id: "b", name: "label", path: "1", visible: true }),
      layer({ id: "c", name: "both", path: "2" }),
    ]);
    const after = snapshot([
      layer({
        id: "a",
        name: "button",
        path: "0",
        bounds: { x: 12, y: 20, width: 80, height: 40 },
        opacity: 80,
        meta: { fontSize: 16 },
      }),
      layer({ id: "b", name: "label", path: "1", visible: false }),
      layer({ id: "c", name: "both-renamed", path: "2", visible: false }),
    ], "1");

    const report = diffLayerTrees(before, after);

    expect(report.summary.geometryChanged).toBe(1);
    expect(report.summary.restyled).toBe(1);
    expect(report.summary.renamed).toBe(1);
    const byId = new Map(report.entries.map((entry) => [entry.layerId, entry]));
    expect(byId.get("a")?.changes.map((change) => change.field)).toEqual([
      "bounds",
      "opacity",
      "fontSize",
    ]);
    expect(byId.get("b")?.changes.map((change) => change.field)).toEqual(["visible"]);
    expect(byId.get("c")?.changes.map((change) => change.field)).toEqual([
      "name",
      "visible",
    ]);
  });

  it("matches by path when layer ids change, reporting the new id", () => {
    const before = snapshot([layer({ id: "old-1", name: "Title", path: "0/0" })]);
    const after = snapshot([layer({ id: "new-1", name: "Title", path: "0/0" })], "1");

    const report = diffLayerTrees(before, after);

    expect(report.summary.renamed).toBe(0);
    expect(report.summary.unchanged).toBe(1);
    expect(report.entries).toHaveLength(0);

    const renamed = diffLayerTrees(
      before,
      snapshot([layer({ id: "new-1", name: "Hero Title", path: "0/0" })], "1"),
    );
    expect(renamed.entries[0]).toMatchObject({
      layerId: "new-1",
      matchedBy: "path",
      status: "changed",
      nameBefore: "Title",
      nameAfter: "Hero Title",
    });
  });

  it("counts added and removed layers", () => {
    const before = snapshot([
      layer({ id: "a", name: "keep", path: "0" }),
      layer({ id: "b", name: "legacy-badge", path: "1" }),
    ]);
    const after = snapshot([
      layer({ id: "a", name: "keep", path: "0" }),
      layer({ id: "c", name: "cta-panel", path: "1/0" }),
    ], "1");

    const report = diffLayerTrees(before, after);

    expect(report.summary).toMatchObject({
      added: 1,
      removed: 1,
      unchanged: 1,
      renamed: 0,
      geometryChanged: 0,
      restyled: 0,
    });
    expect(report.entries.map((entry) => entry.status).sort()).toEqual([
      "added",
      "removed",
    ]);
    expect(report.entries.find((entry) => entry.status === "removed")).toMatchObject({
      layerId: "b",
      beforePath: "1",
      nameBefore: "legacy-badge",
    });
    expect(report.entries.find((entry) => entry.status === "added")).toMatchObject({
      layerId: "c",
      afterPath: "1/0",
      nameAfter: "cta-panel",
    });
  });

  it("treats missing clipping as false and keeps texts style changes in meta", () => {
    const before = snapshot([
      layer({
        id: "a",
        name: "text",
        path: "0",
        meta: { text: "原价", bold: true },
      }),
    ]);
    const after = snapshot([
      layer({
        id: "a",
        name: "text",
        path: "0",
        clipping: false,
        meta: { text: "现价", bold: true },
      }),
    ], "1");

    const report = diffLayerTrees(before, after);

    expect(report.summary.restyled).toBe(1);
    expect(report.entries[0].changes).toEqual([
      { field: "text", label: "文本", before: "原价", after: "现价" },
    ]);
  });

  it("returns a clean report and flags simulated saves", () => {
    const tree = [layer({ id: "a", name: "hero", path: "0" })];
    const clean = diffLayerTrees(snapshot(tree), snapshot(tree, "1"));
    expect(clean.entries).toHaveLength(0);
    expect(clean.summary.unchanged).toBe(1);
    expect(clean.baseline).toBe("session-open");
    expect(clean.notes.join(" ")).toContain("本次会话打开文档时");
    expect(clean.notes.join(" ")).toContain("协议 v1 未提供");

    const subsequent = diffLayerTrees(snapshot(tree), snapshot(tree, "1"), {
      baseline: "previous-save",
    });
    expect(subsequent.baseline).toBe("previous-save");
    expect(subsequent.notes.join(" ")).toContain("上一次成功保存后");

    const simulated = diffLayerTrees(snapshot(tree), snapshot(tree, "1"), {
      simulated: true,
    });
    expect(simulated.simulated).toBe(true);
    expect(simulated.notes.join(" ")).toContain("演示引擎的保存为模拟");
  });
});

describe("psdDiffFileName", () => {
  it("builds a sanitized dated file name", () => {
    expect(psdDiffFileName("伊拉克 / 商详", new Date("2026-10-20T08:00:00.000Z"))).toBe(
      "伊拉克-商详-psd-diff-20261020.json",
    );
  });
});
