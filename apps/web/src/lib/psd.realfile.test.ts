import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeLayers, isGenericLayerName, normalizeLayerName } from "./cleanup";
import { collectAiNamingCandidates } from "./aiNaming";
import { flattenLayers, kindBreakdown, layerKindLabel } from "./layers";
import { inspectPsd } from "./psd";

const PSD_DIR = process.env.LAYERFORGE_PSD_DIR;
const suites = PSD_DIR ? describe : describe.skip;

suites(`真实 PSD 解析与一键整理（目录来自 LAYERFORGE_PSD_DIR）`, () => {
  it("每个文件都能读出头信息并规范化图层树", async () => {
    const names = (await readdir(PSD_DIR as string)).filter((name) => /\.(psd|psb)$/i.test(name));
    expect(names.length).toBeGreaterThan(0);

    const report: string[] = [];

    for (const name of names) {
      const buffer = await readFile(path.join(PSD_DIR as string, name));
      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer;

      const inspection = await inspectPsd(arrayBuffer);
      const all = flattenLayers(inspection.layers);
      const paths = new Set(all.map((layer) => layer.path));
      const analysis = analyzeLayers({
        layers: inspection.layers,
        width: inspection.header.width,
        height: inspection.header.height,
      });
      const aiCandidates = collectAiNamingCandidates({
        layers: inspection.layers,
        report: analysis,
      });

      const zeroByKind = new Map<string, number>();
      for (const layer of all) {
        if (layer.bounds && (layer.bounds.width > 0 || layer.bounds.height > 0)) continue;
        const label = layerKindLabel(layer.kind);
        zeroByKind.set(label, (zeroByKind.get(label) ?? 0) + 1);
      }

      report.push(
        [
          name,
          `${inspection.header.width}x${inspection.header.height}`,
          inspection.header.colorModeLabel,
          `depth=${inspection.header.depth}`,
          `top=${inspection.layers.length}`,
          `total=${all.length}`,
          `paths=${paths.size}`,
          `opacity<100=${all.filter((layer) => layer.opacity < 100).length}`,
          `zero-bounds=${[...zeroByKind.entries()].map(([label, count]) => `${label}:${count}`).join(",") || "无"}`,
          `kinds=${kindBreakdown(inspection.layers).map((entry) => `${layerKindLabel(entry.kind)}:${entry.count}`).join(",")}`,
          `renames=${analysis.summary.renames}`,
          `generic=${analysis.summary.genericNames}`,
          `aiCandidates=${aiCandidates.length}`,
          `duplicates=${analysis.summary.duplicateNames}`,
          `empty=${analysis.summary.emptyGroups}`,
          `single=${analysis.summary.singleChildGroups}`,
          `groups=${analysis.summary.groups}`,
          `merges=${analysis.summary.merges}`,
          `slices=${analysis.summary.slices}`,
          inspection.warning ? `WARNING=${inspection.warning}` : "ok",
        ].join(" | "),
      );

      expect(inspection.header.width).toBeGreaterThan(0);
      expect(inspection.header.height).toBeGreaterThan(0);
      expect(inspection.warning).toBeUndefined();
      expect(all.length).toBeGreaterThan(0);
      // paths are the verification key, so they must be stable and unique
      expect(paths.size).toBe(all.length);
      for (const layer of all) {
        expect(layer.opacity).toBeGreaterThanOrEqual(0);
        expect(layer.opacity).toBeLessThanOrEqual(100);
        expect(layer.name.length).toBeGreaterThan(0);
        if (layer.children.length > 0) expect(layer.kind).toBe("group");
      }

      expect(analysis.summary.nodes).toBe(all.length);
      expect(new Set(analysis.renames.map((rename) => rename.path)).size).toBe(
        analysis.renames.length,
      );
      for (const rename of analysis.renames) {
        const source = all.find((layer) => layer.path === rename.path);
        expect(source?.name).toBe(rename.originalName);
        expect(rename.newName).not.toBe(rename.originalName);
        expect(normalizeLayerName(rename.newName)).toBe(rename.newName);
      }
      expect(new Set(analysis.mergeCandidates.map((merge) => merge.path)).size).toBe(
        analysis.mergeCandidates.length,
      );
      for (const merge of analysis.mergeCandidates) {
        expect(all.some((layer) => layer.path === merge.path)).toBe(true);
        expect(merge.memberPaths.length).toBeGreaterThanOrEqual(2);
        expect(merge.areaRatio).toBeLessThanOrEqual(0.08);
        expect(merge.bounds.width).toBeGreaterThan(0);
        expect(merge.bounds.height).toBeGreaterThan(0);
      }
      expect(new Set(analysis.slices.map((slice) => slice.path)).size).toBe(
        analysis.slices.length,
      );
      for (const slice of analysis.slices) {
        expect(all.some((layer) => layer.path === slice.path)).toBe(true);
        expect(slice.bounds.width).toBeGreaterThan(0);
        expect(slice.bounds.height).toBeGreaterThan(0);
      }
      expect(new Set(aiCandidates.map((candidate) => candidate.path)).size).toBe(
        aiCandidates.length,
      );
      const renamedPaths = new Set(analysis.renames.map((rename) => rename.path));
      for (const candidate of aiCandidates) {
        expect(all.some((layer) => layer.path === candidate.path)).toBe(true);
        expect(renamedPaths.has(candidate.path)).toBe(false);
        expect(
          isGenericLayerName(candidate.currentName) ||
            isGenericLayerName(normalizeLayerName(candidate.currentName)),
        ).toBe(true);
        expect(candidate.reasons.length).toBeGreaterThan(0);
        expect(candidate.parentPath === null || typeof candidate.parentPath === "string").toBe(
          true,
        );
      }
    }

    console.log(`\n${report.join("\n")}\n`);
  }, 600_000);
});