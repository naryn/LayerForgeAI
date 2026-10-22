import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";

const PSD_DIR = process.env.LAYERFORGE_PSD_DIR;
const siteEntry = fileURLToPath(new URL("../public/patchy/patchy.html", import.meta.url));
const enabled =
  process.env.LAYERFORGE_REAL_PATCHY === "1" && existsSync(siteEntry) && Boolean(PSD_DIR);
const artifactRoot = fileURLToPath(new URL("../../../artifacts/asset-pack-patchy", import.meta.url));

interface PackOutput {
  fileName: string;
  scale: number;
  width: number;
  height: number;
  source: string;
}

interface PackAsset {
  sourcePath: string;
  bounds: { x: number; y: number; width: number; height: number };
  outputs: PackOutput[];
  verification: { checked: boolean; mismatched: boolean; mode: string };
}

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function pickPsd(): Promise<{ fileName: string; filePath: string }> {
  const dir = PSD_DIR as string;
  const requested = process.env.LAYERFORGE_ASSET_PACK_PSD;
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

function pngSize(bytes: Uint8Array): { width: number; height: number } {
  expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function transparentPixels(
  page: Page,
  bytes: Uint8Array,
): Promise<{ width: number; height: number; transparent: number; opaque: number }> {
  const base64 = Buffer.from(bytes).toString("base64");
  return page.evaluate(async (encoded) => {
    const data = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([data], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D canvas unavailable");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let transparent = 0;
    let opaque = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] === 0) transparent += 1;
      else if (pixels[index] === 255) opaque += 1;
    }
    return { width: bitmap.width, height: bitmap.height, transparent, opaque };
  }, base64);
}

test.describe("真实 Patchy 资产包", () => {
  test.skip(!enabled, "Needs staged Patchy site, LAYERFORGE_REAL_PATCHY=1 and LAYERFORGE_PSD_DIR");

  test("逐层隔离切图、透明度证据与源文件不变", async ({ page }) => {
    test.skip(!PSD_DIR, "设置 LAYERFORGE_PSD_DIR 指向真实 PSD 目录后运行");
    test.setTimeout(1_800_000);
    const { fileName, filePath } = await pickPsd();
    test.skip(!existsSync(filePath), `未找到 ${filePath}`);
    const sourceSha256 = await sha256File(filePath);
    const consoleLog: string[] = [];
    page.on("console", (message) => consoleLog.push(`[${message.type()}] ${message.text()}`));
    page.on("pageerror", (error) => consoleLog.push(`[pageerror] ${error.message}`));

    await page.goto("/");
    await page.getByRole("button", { name: "导入 PSD" }).click();
    await page.setInputFiles("#import-file", filePath);
    await page.fill("#import-name", `patchy-pack-${path.parse(fileName).name}`);
    await page.getByRole("button", { name: "导入并打开" }).click();
    await expect(page.locator(".engine-pill__label")).toHaveText("Patchy 引擎", {
      timeout: 600_000,
    });
    await expect(page.locator(".engine-pill__state")).toHaveText("就绪", { timeout: 600_000 });

    await page.getByRole("button", { name: "一键整理" }).click();
    const stats = page.locator(".cleanup-panel .stat-chip__value");
    await expect(stats).toHaveCount(5, { timeout: 300_000 });
    const slices = Number(await stats.nth(4).textContent());
    const merges = Number(await stats.nth(3).textContent());
    expect(slices).toBeGreaterThan(0);

    const downloadPromise = page.waitForEvent("download", { timeout: 900_000 });
    await page.getByRole("button", { name: "导出资产包 ZIP" }).click();
    const download = await downloadPromise;
    const zipBytes = await readFile((await download.path())!);
    const entries = unzipSync(new Uint8Array(zipBytes));
    const decoder = new TextDecoder();
    const manifest = JSON.parse(decoder.decode(entries["manifest.json"]));

    expect(manifest.schema).toBe("layerforge.asset-pack");
    expect(manifest.schemaVersion).toBe("0.4.0");
    console.log(
      `[asset-pack-patchy] status=${JSON.stringify(manifest.status)} ` +
        `render=${JSON.stringify(manifest.comparison.render)} ` +
        `notes=${JSON.stringify(manifest.comparison.notes)}`,
    );
    expect(manifest.status.validated).toBe(false);
    expect([
      "patchy-isolated-layer-renders",
      "patchy-isolated-layer-renders-with-composite-fallback",
    ]).toContain(manifest.status.pixels);
    expect(manifest.status.isolatedLayerRenders).toBeGreaterThan(0);
    expect(manifest.document.engine).toBe("patchy");
    expect(manifest.comparison.method).toBe(
      "isolated-layer-renders-with-composite-fallback",
    );
    expect(manifest.comparison.render.isolatedAssets).toBeGreaterThan(0);
    expect(manifest.comparison.mismatchedAssets).toBe(0);
    expect(manifest.comparison.mismatchedMergedAssets).toBe(0);

    const assets = manifest.assets as PackAsset[];
    const isolatedAssets = assets.filter((asset) =>
      asset.outputs.some((output) => output.scale === 1 && output.source === "isolated-layer"),
    );
    expect(isolatedAssets.length).toBeGreaterThan(0);
    expect(isolatedAssets.length).toBe(manifest.comparison.render.isolatedAssets);
    for (const asset of assets) {
      const oneX = asset.outputs.find((output) => output.scale === 1);
      expect(oneX).toBeTruthy();
      expect(asset.verification.mode).toBe(
        oneX!.source === "isolated-layer"
          ? "isolated-render-decode"
          : "composite-crop-match",
      );
      expect(asset.verification.mismatched).toBe(false);
      for (const output of asset.outputs) {
        const bytes = entries[`assets/${output.fileName}`];
        expect(bytes, `缺少 assets/${output.fileName}`).toBeTruthy();
        expect(pngSize(bytes)).toEqual({ width: output.width, height: output.height });
        if (output.scale === 1 && output.source === "isolated-layer") {
          expect(asset.bounds).toMatchObject({
            x: expect.any(Number),
            y: expect.any(Number),
            width: output.width,
            height: output.height,
          });
        }
      }
    }

    const mergedAssets = manifest.mergedAssets as PackAsset[];
    expect(mergedAssets.length).toBe(manifest.analysis.mergedAssets);
    for (const asset of mergedAssets) {
      expect(asset.verification.mismatched).toBe(false);
      for (const output of asset.outputs) {
        const bytes = entries[`merged/${output.fileName}`];
        expect(bytes, `缺少 merged/${output.fileName}`).toBeTruthy();
        expect(pngSize(bytes)).toEqual({ width: output.width, height: output.height });
      }
    }

    let alpha:
      | { asset: string; width: number; height: number; transparent: number; opaque: number }
      | null = null;
    for (const asset of isolatedAssets.slice(0, 12)) {
      const oneX = asset.outputs.find(
        (output) => output.scale === 1 && output.source === "isolated-layer",
      );
      if (!oneX) continue;
      const bytes = entries[`assets/${oneX.fileName}`];
      const sample = await transparentPixels(page, bytes);
      expect(sample.width).toBe(asset.bounds.width);
      expect(sample.height).toBe(asset.bounds.height);
      alpha = { asset: asset.sourcePath, ...sample };
      if (sample.transparent > 0) break;
    }
    expect(alpha, "应至少有一个可解码的隔离渲染资产").not.toBeNull();
    expect(alpha!.transparent, "隔离渲染应包含透明像素").toBeGreaterThan(0);

    const pageHtml = decoder.decode(entries["page.html"]);
    expect(pageHtml).toContain("页面骨架");
    expect(pageHtml).toContain(`data-canvas-width="${manifest.source.width}"`);
    expect(pageHtml).toContain(`data-canvas-height="${manifest.source.height}"`);
    expect(pageHtml).toContain('class="lf-page"');
    expect(pageHtml).toContain("display:contents");
    expect((pageHtml.match(/class="lf-slice"/g) ?? []).length).toBe(assets.length);
    const firstOutput = assets[0]?.outputs.find((output) => output.scale === 1);
    expect(firstOutput).toBeTruthy();
    expect(pageHtml).toContain(`assets/${firstOutput!.fileName}`);

    const agentContext = decoder.decode(entries["agent-context.md"]);
    expect(agentContext).toContain("逐层隔离渲染");
    expect(agentContext).toContain("隔离渲染只含目标图层");

    const sourceShaAfter = await sha256File(filePath);
    expect(sourceShaAfter, "原始 PSD 不得被覆盖").toBe(sourceSha256);
    expect(consoleLog.filter((line) => /^\[pageerror\]/.test(line))).toEqual([]);

    const outDir = path.join(artifactRoot, path.parse(fileName).name);
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "asset-pack.zip"), zipBytes);
    await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    await writeFile(
      path.join(outDir, "alpha-sample.json"),
      `${JSON.stringify({ ...alpha }, null, 2)}\n`,
    );
    await writeFile(path.join(outDir, "browser-console.log"), `${consoleLog.join("\n")}\n`);
    await writeFile(path.join(outDir, "page.html"), entries["page.html"]);
    const source = {
      fileName,
      path: filePath,
      sha256: sourceSha256,
      unchanged: true,
      slices,
      merges,
      isolatedAssets: manifest.comparison.render.isolatedAssets,
      compositeAssets: manifest.comparison.render.compositeAssets,
      isolatedMergedAssets: manifest.comparison.render.isolatedMergedAssets,
      compositeMergedAssets: manifest.comparison.render.compositeMergedAssets,
      isolatedFailures: manifest.comparison.render.isolatedFailures,
      zipBytes: zipBytes.byteLength,
      createdAt: new Date().toISOString(),
    };
    await writeFile(path.join(outDir, "run.json"), `${JSON.stringify(source, null, 2)}\n`);
    console.log(
      [
        `[asset-pack-patchy] ${fileName}`,
        `isolated=${source.isolatedAssets}`,
        `composite=${source.compositeAssets}`,
        `isolatedMerged=${source.isolatedMergedAssets}`,
        `compositeMerged=${source.compositeMergedAssets}`,
        `fallbacks=${source.isolatedFailures}`,
        `transparentSample=${alpha!.transparent}/${alpha!.width * alpha!.height}`,
        `zip=${(zipBytes.byteLength / 1024 / 1024).toFixed(1)}MB`,
        `artifacts=${outDir}`,
      ].join(" | "),
    );
  });
});
