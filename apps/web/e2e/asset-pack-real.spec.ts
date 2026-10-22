import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { readPsd } from "ag-psd";
import { unzipSync } from "fflate";
import { layoutSummary, type ComponentLayoutHint } from "../src/lib/layout";

const PSD_DIR = process.env.LAYERFORGE_PSD_DIR;
const ARTIFACT_DIR = fileURLToPath(new URL("../../../artifacts/asset-pack", import.meta.url));

interface PackAsset {
  id: string;
  name: string;
  sourcePath: string;
  bounds: { x: number; y: number; width: number; height: number };
  outputs: Array<{
    fileName: string;
    scale: number;
    width: number;
    height: number;
    source: string;
  }>;
  verification: { checked: boolean; mismatched: boolean; mode?: string };
}

interface PackMergedAsset extends PackAsset {
  suggestedName: string;
  sourcePath: string;
  memberPaths: string[];
}

interface TextLikeLayer {
  children?: TextLikeLayer[];
  text?: { text?: string };
}

interface IrNodeLike {
  sourcePath: string;
  sourceLayerId: string;
  logicalGroupId: string | null;
  assetId: string | null;
  children: IrNodeLike[];
}

interface IrLogicalGroupLike {
  id: string;
  rule: string;
  status: string;
  suggestedName: string;
  memberPaths: string[];
  memberIds: string[];
  layout: ComponentLayoutHint;
}

function expectLayout(layout: ComponentLayoutHint): void {
  expect(["row", "column", "stack"]).toContain(layout.direction);
  expect(["start", "center", "end", "mixed"]).toContain(layout.align);
  if (layout.direction === "stack") {
    expect(layout.gap).toBeNull();
  } else {
    expect(typeof layout.gap).toBe("number");
    expect(layout.gap).toBeGreaterThanOrEqual(0);
  }
}

function flattenIrNodes(nodes: IrNodeLike[]): IrNodeLike[] {
  return nodes.flatMap((node) => [node, ...flattenIrNodes(node.children)]);
}

function firstText(layers: TextLikeLayer[] | undefined): string | undefined {
  for (const layer of layers ?? []) {
    if (layer.text?.text) return layer.text.text;
    const nested = firstText(layer.children);
    if (nested) return nested;
  }
  return undefined;
}

async function pickPsd(): Promise<{ fileName: string; filePath: string }> {
  const dir = PSD_DIR as string;
  const requested = process.env.LAYERFORGE_REAL_PSD;
  const names = (await readdir(dir)).filter((name) => /\.(psd|psb)$/i.test(name));
  expect(names.length).toBeGreaterThan(0);
  if (requested) {
    const match = names.find((name) => name === requested || name.includes(requested));
    expect(match, `未找到匹配 ${requested} 的 PSD`).toBeTruthy();
    return { fileName: match as string, filePath: path.join(dir, match as string) };
  }
  const sizes = await Promise.all(
    names.map(async (name) => ({ name, size: (await stat(path.join(dir, name))).size })),
  );
  sizes.sort((left, right) => left.size - right.size);
  return { fileName: sizes[0].name, filePath: path.join(dir, sizes[0].name) };
}

async function importRealPsd(page: Page, fileName: string, filePath: string): Promise<void> {
  await page.goto("/?engine=demo");
  await page.getByRole("button", { name: "导入 PSD" }).click();
  await page.setInputFiles("#import-file", filePath);
  await page.fill("#import-name", `real-${fileName.replace(/\.(psd|psb)$/i, "")}`);
  await page.getByRole("button", { name: "导入并打开" }).click();
  await expect(page.locator(".engine-pill__label")).toHaveText("演示引擎 · 不写入文件", {
    timeout: 120_000,
  });
}

function pngSize(bytes: Uint8Array): { width: number; height: number } {
  expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

test.describe("真实 PSD 资产包", () => {
  test.skip(!PSD_DIR, "设置 LAYERFORGE_PSD_DIR 指向真实 PSD 目录后运行");

  test("合成图切图、PNG 解码校验与预览产物落盘", async ({ page }) => {
    test.setTimeout(600_000);
    const { fileName, filePath } = await pickPsd();
    const psd = readPsd(await readFile(filePath), {
      skipLayerImageData: true,
      skipCompositeImageData: true,
      skipThumbnail: true,
      skipLinkedFilesData: true,
    });
    expect(psd.width).toBeGreaterThan(0);
    const sampleText = firstText(psd.children as unknown as TextLikeLayer[] | undefined);

    await importRealPsd(page, fileName, filePath);
    await page.getByRole("button", { name: "一键整理" }).click();
    const stats = page.locator(".cleanup-panel .stat-chip__value");
    await expect(stats).toHaveCount(5, { timeout: 120_000 });
    const groups = Number(await stats.nth(2).textContent());
    const merges = Number(await stats.nth(3).textContent());
    const slices = Number(await stats.nth(4).textContent());
    expect(slices).toBeGreaterThan(0);
    await expect(page.locator(".cleanup-slice").first()).toBeVisible();
    if (groups > 0) {
      await expect(page.getByText("同步写入 Design IR")).toBeVisible();
    }

    const downloadPromise = page.waitForEvent("download", { timeout: 300_000 });
    await page.getByRole("button", { name: "导出资产包 ZIP" }).click();
    const download = await downloadPromise;
    const zipPath = await download.path();
    const zipBytes = await readFile(zipPath!);
    const entries = unzipSync(new Uint8Array(zipBytes));
    const decoder = new TextDecoder();
    const manifest = JSON.parse(decoder.decode(entries["manifest.json"]));

    expect(manifest.schema).toBe("layerforge.asset-pack");
    expect(manifest.schemaVersion).toBe("0.4.0");
    expect(manifest.status).toMatchObject({
      validated: false,
      pixels: "generated-local-composite-crops",
      isolatedLayerRenders: 0,
    });
    expect(manifest.comparison.method).toBe("composite-crops-and-decode-verification");
    expect(manifest.comparison.render).toMatchObject({
      isolatedAssets: 0,
      isolatedMergedAssets: 0,
    });
    expect(manifest.comparison.render.compositeAssets).toBeGreaterThan(0);
    expect(manifest.source).toMatchObject({
      fileName,
      width: psd.width,
      height: psd.height,
    });
    expect(manifest.analysis.slices).toBe(slices);
    expect(manifest.analysis.merges).toBe(merges);
    expect(manifest.mergeCandidates).toHaveLength(merges);

    const ir = JSON.parse(decoder.decode(entries["design-ir.json"]));
    expect(ir.schemaVersion).toBe("0.4.0");
    expect(ir.logicalGroups).toHaveLength(manifest.analysis.groups);
    const manifestGroupById = new Map(
      (manifest.logicalGroups as IrLogicalGroupLike[]).map((group) => [group.id, group]),
    );
    const irNodeByPath = new Map(
      flattenIrNodes(ir.nodes as IrNodeLike[]).map((node) => [node.sourcePath, node]),
    );
    for (const group of ir.logicalGroups as IrLogicalGroupLike[]) {
      expect(group.rule).toBe("group-cluster");
      expect(group.status).toBe("suggested");
      const source = manifestGroupById.get(group.id);
      if (!source) throw new Error(`manifest 缺少逻辑编组 ${group.id}`);
      expect(group.suggestedName).toBe(source.suggestedName);
      expect(group.memberPaths).toEqual(source.memberPaths);
      expect(group.layout).toEqual(source.layout);
      expectLayout(group.layout);
      for (const memberPath of group.memberPaths) {
        const node = irNodeByPath.get(memberPath);
        if (!node) throw new Error(`IR 缺少编组成员 /${memberPath}`);
        expect(node.logicalGroupId).toBe(group.id);
        expect(group.memberIds).toContain(node.sourceLayerId);
      }
    }

    const assets = manifest.assets as PackAsset[];
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.length + manifest.limits.skippedAssets).toBe(slices);
    for (const asset of assets) {
      const node = irNodeByPath.get(asset.sourcePath);
      if (!node) throw new Error(`IR 缺少切图节点 /${asset.sourcePath}`);
      expect(node.assetId).toBe(asset.id);
    }
    expect(manifest.comparison.verifiedAssets).toBe(assets.length);
    expect(manifest.comparison.mismatchedAssets).toBe(0);
    expect(manifest.comparison.maxChannelDelta).toBeLessThanOrEqual(2);
    expect(manifest.comparison.coverageRatio).toBeGreaterThan(0);
    expect(manifest.comparison.coverageRatio).toBeLessThanOrEqual(1);

    for (const asset of assets) {
      expect(asset.verification).toMatchObject({
        checked: true,
        mismatched: false,
        mode: "composite-crop-match",
      });
      expect(asset.outputs.length).toBeGreaterThan(0);
      expect(asset.outputs.every((output) => output.source.startsWith("composite-"))).toBe(true);
      for (const output of asset.outputs) {
        const bytes = entries[`assets/${output.fileName}`];
        expect(bytes, `缺少 ${output.fileName}`).toBeTruthy();
        expect(pngSize(bytes)).toEqual({ width: output.width, height: output.height });
        expect(output.width).toBe(asset.bounds.width * output.scale);
        expect(output.height).toBe(asset.bounds.height * output.scale);
      }
    }

    for (const merge of manifest.mergeCandidates as Array<{ layout: ComponentLayoutHint }>) {
      expectLayout(merge.layout);
    }

    const mergedAssets = manifest.mergedAssets as PackMergedAsset[];
    expect(mergedAssets.length + manifest.limits.skippedMergedAssets).toBe(merges);
    expect(manifest.analysis.mergedAssets).toBe(mergedAssets.length);
    expect(manifest.comparison.verifiedMergedAssets).toBe(mergedAssets.length);
    expect(manifest.comparison.mismatchedMergedAssets).toBe(0);
    for (const asset of mergedAssets) {
      expect(asset.suggestedName).toContain("-merged");
      expect(asset.memberPaths.length).toBeGreaterThanOrEqual(2);
      expect(asset.verification).toMatchObject({ checked: true, mismatched: false });
      expect(asset.outputs.length).toBeGreaterThan(0);
      for (const output of asset.outputs) {
        const bytes = entries[`merged/${output.fileName}`];
        expect(bytes, `缺少 merged/${output.fileName}`).toBeTruthy();
        expect(pngSize(bytes)).toEqual({ width: output.width, height: output.height });
        expect(output.width).toBe(asset.bounds.width * output.scale);
        expect(output.height).toBe(asset.bounds.height * output.scale);
      }
    }
    for (const file of manifest.files as string[]) {
      expect(entries[file], `清单文件缺少 ${file}`).toBeTruthy();
    }

    const preview = decoder.decode(entries["preview.html"]);
    expect(preview).toContain("页面对比");
    expect(preview).toContain("assets/");
    const pageHtml = decoder.decode(entries["page.html"]);
    expect(pageHtml).toContain("页面骨架");
    expect(pageHtml).toContain(`data-canvas-width="${psd.width}"`);
    expect(pageHtml).toContain(`data-canvas-height="${psd.height}"`);
    expect(pageHtml).toContain('class="lf-page"');
    expect(pageHtml).toContain('class="lf-slice"');
    const renderedAsset = assets.find((asset) =>
      pageHtml.includes(`data-layer-path="/${asset.sourcePath}"`),
    );
    expect(renderedAsset, "页面骨架应至少渲染一个切图节点").toBeTruthy();
    const renderedOutput =
      renderedAsset!.outputs.find((output) => output.scale === 1) ??
      renderedAsset!.outputs[0];
    expect(pageHtml).toContain(`assets/${renderedOutput.fileName}`);
    expect(pageHtml).toContain("display:contents");
    if (ir.logicalGroups.length > 0) {
      expect(pageHtml).toContain("data-component-id=");
      expect(pageHtml).toContain("data-layout-direction=");
    }
    const agentContext = decoder.decode(entries["agent-context.md"]);
    expect(agentContext).toContain("合成图裁切");
    expect(agentContext).toContain(assets[0].name);
    expect(agentContext).toContain("## 逻辑编组建议");
    expect(agentContext).toContain("切图节点的 `assetId`");
    expect(agentContext).toContain("## 文本层");
    expect(agentContext).toContain("merged/");
    if (ir.logicalGroups.length > 0) {
      expect(agentContext).toContain(ir.logicalGroups[0].suggestedName);
      expect(agentContext).toContain(layoutSummary(ir.logicalGroups[0].layout));
      await expect(page.getByText(layoutSummary(ir.logicalGroups[0].layout)).first()).toBeVisible();
    }
    if (mergedAssets.length > 0) {
      expect(agentContext).toContain(`merged/${mergedAssets[0].outputs[0].fileName}`);
    }
    expect(sampleText, "真实 PSD 应包含文本层").toBeTruthy();
    expect(agentContext).toContain(sampleText!.replace(/[|\r\n]+/g, " ").slice(0, 12));

    const outDir = path.join(ARTIFACT_DIR, path.parse(fileName).name);
    await mkdir(outDir, { recursive: true });
    await copyFile(zipPath!, path.join(outDir, "asset-pack.zip"));
    await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    await writeFile(
      path.join(outDir, "comparison.json"),
      JSON.stringify(manifest.comparison, null, 2),
    );
    await writeFile(
      path.join(outDir, "agent-context.md"),
      entries["agent-context.md"],
    );
    await writeFile(path.join(outDir, "preview.html"), entries["preview.html"]);
    await writeFile(path.join(outDir, "page.html"), entries["page.html"]);
    console.log(
      [
        `[asset-pack-real] ${fileName}`,
        `${psd.width}x${psd.height}`,
        `slices=${slices}`,
        `merges=${merges}`,
        `assets=${assets.length}`,
        `outputs=${assets.reduce((sum, asset) => sum + asset.outputs.length, 0)}`,
        `merged=${mergedAssets.length}`,
        `mergedOutputs=${mergedAssets.reduce((sum, asset) => sum + asset.outputs.length, 0)}`,
        `verified=${manifest.comparison.verifiedAssets}`,
        `verifiedMerged=${manifest.comparison.verifiedMergedAssets}`,
        `mismatched=${manifest.comparison.mismatchedAssets}`,
        `mismatchedMerged=${manifest.comparison.mismatchedMergedAssets}`,
        `maxDelta=${manifest.comparison.maxChannelDelta}`,
        `coverage=${manifest.comparison.coverageRatio.toFixed(3)}`,
        `zip=${(zipBytes.byteLength / 1024 / 1024).toFixed(1)}MB`,
        `artifacts=${outDir}`,
      ].join(" | "),
    );
  });
});
