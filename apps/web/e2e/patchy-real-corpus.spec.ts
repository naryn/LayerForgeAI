import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { readPsd } from "ag-psd";
import { unzipSync } from "fflate";

const PSD_DIR = process.env.LAYERFORGE_PSD_DIR;
const siteEntry = fileURLToPath(new URL("../public/patchy/patchy.html", import.meta.url));
const enabled =
  process.env.LAYERFORGE_REAL_PATCHY === "1" && existsSync(siteEntry) && Boolean(PSD_DIR);
const artifactRoot = fileURLToPath(new URL("../../../artifacts/patchy-corpus", import.meta.url));

const CASES = process.env.LAYERFORGE_CORPUS_CASES
  ? process.env.LAYERFORGE_CORPUS_CASES.split(",").map((entry, index) => {
      const [fileName, slug] = entry.split("|");
      return { fileName: fileName.trim(), slug: (slug ?? `case-${index + 1}`).trim() };
    })
  : [
      { fileName: "Payment1_D.psd", slug: "payment1-nordic" },
      { fileName: "Payment2_D.psd", slug: "payment2-nordic" },
      { fileName: "Detial_D_0708.psd", slug: "detail-nordic" },
      { fileName: "Store_D.psd", slug: "store-nordic" },
    ];

interface MemorySample {
  usedBytes?: number;
  peakUsedBytes?: number;
  heapBytes?: number;
  historyBytes?: number;
  limitBytes?: number;
  jsHeapUsedBytes?: number;
}

interface CleanupStats {
  renames: number;
  findings: number;
  groups: number;
  merges: number;
  slices: number;
}

interface LogEntry {
  level: string;
  message: string;
  detail: string;
}

interface PackOutput {
  fileName: string;
  scale: number;
  width: number;
  height: number;
  source: string;
}

interface PackAsset {
  name: string;
  sourcePath: string;
  kind: string;
  bounds: { x: number; y: number; width: number; height: number };
  outputs: PackOutput[];
  verification: { mismatched: boolean; mode: string };
}

interface PackManifest {
  schema: string;
  schemaVersion: string;
  document: { engine: string };
  status: {
    validated: boolean;
    pixels: string;
    isolatedLayerRenders: number;
    compositeCrops: number;
  };
  comparison: { mismatchedAssets: number; mismatchedMergedAssets: number };
  analysis: { slices: number; mergedAssets: number };
  assets: PackAsset[];
  mergedAssets: PackAsset[];
}

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function pngSize(bytes: Uint8Array): { width: number; height: number } {
  expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function pixelDigest(
  page: Page,
  filePath: string,
): Promise<{ width: number; height: number; rgbaSha256: string }> {
  const base64 = (await readFile(filePath)).toString("base64");
  return page.evaluate(async (encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D canvas unavailable");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const digest = await crypto.subtle.digest("SHA-256", pixels);
    return {
      width: bitmap.width,
      height: bitmap.height,
      rgbaSha256: [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(""),
    };
  }, base64);
}

async function download(
  page: Page,
  action: () => Promise<void>,
  targetDir: string,
  stem: string,
): Promise<string> {
  const [file] = await Promise.all([page.waitForEvent("download"), action()]);
  const extension = path.extname(file.suggestedFilename()) || ".bin";
  const target = path.join(targetDir, `${stem}${extension}`);
  await file.saveAs(target);
  return target;
}

interface PixelDiff {
  sameSize: boolean;
  width: number;
  height: number;
  totalPixels: number;
  differingPixels: number;
  ratio: number;
  maxDelta: number;
  bounds: { x: number; y: number; width: number; height: number } | null;
}

async function pixelDiff(page: Page, beforePath: string, afterPath: string): Promise<PixelDiff> {
  const [beforeBytes, afterBytes] = await Promise.all([
    readFile(beforePath),
    readFile(afterPath),
  ]);
  return page.evaluate(
    async ([beforeEncoded, afterEncoded]) => {
      const decode = async (encoded: string) => {
        const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("2D canvas unavailable");
        context.drawImage(bitmap, 0, 0);
        return {
          width: bitmap.width,
          height: bitmap.height,
          data: context.getImageData(0, 0, bitmap.width, bitmap.height).data,
        };
      };
      const before = await decode(beforeEncoded);
      const after = await decode(afterEncoded);
      if (before.width !== after.width || before.height !== after.height) {
        return {
          sameSize: false,
          width: before.width,
          height: before.height,
          totalPixels: 0,
          differingPixels: 0,
          ratio: 0,
          maxDelta: 0,
          bounds: null,
        };
      }
      let differingPixels = 0;
      let maxDelta = 0;
      let minX = before.width;
      let minY = before.height;
      let maxX = -1;
      let maxY = -1;
      for (let index = 0; index < before.data.length; index += 4) {
        let delta = 0;
        for (let channel = 0; channel < 4; channel += 1) {
          delta = Math.max(delta, Math.abs(before.data[index + channel] - after.data[index + channel]));
        }
        if (delta === 0) continue;
        differingPixels += 1;
        maxDelta = Math.max(maxDelta, delta);
        const pixel = index / 4;
        const x = pixel % before.width;
        const y = Math.floor(pixel / before.width);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      const totalPixels = before.width * before.height;
      return {
        sameSize: true,
        width: before.width,
        height: before.height,
        totalPixels,
        differingPixels,
        ratio: differingPixels / totalPixels,
        maxDelta,
        bounds:
          differingPixels > 0
            ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
            : null,
      };
    },
    [beforeBytes.toString("base64"), afterBytes.toString("base64")],
  );
}

async function cleanupStats(page: Page): Promise<CleanupStats> {
  const values = await page.locator(".cleanup-panel .stat-chip__value").allTextContents();
  return {
    renames: Number(values[0] ?? 0),
    findings: Number(values[1] ?? 0),
    groups: Number(values[2] ?? 0),
    merges: Number(values[3] ?? 0),
    slices: Number(values[4] ?? 0),
  };
}

async function appliedCount(page: Page, marker: string): Promise<number> {
  return page.locator(".activity-log .log-entry").evaluateAll(
    (entries, expected) =>
      entries.filter((entry) => entry.textContent?.includes(expected)).length,
    `${marker}：`,
  );
}

interface PsdLayerNode {
  name?: string;
  children?: PsdLayerNode[];
}

function layerAtPath(roots: PsdLayerNode[], layerPath: string): PsdLayerNode | null {
  let nodes = roots;
  let current: PsdLayerNode | null = null;
  for (const segment of layerPath.split("/").filter(Boolean)) {
    const index = Number(segment);
    if (!Number.isInteger(index) || index < 0) return null;
    current = nodes[index] ?? null;
    if (!current) return null;
    nodes = current.children ?? [];
  }
  return current;
}

function countNodes(roots: PsdLayerNode[]): number {
  return roots.reduce((sum, node) => sum + 1 + countNodes(node.children ?? []), 0);
}

function findLayersByName(roots: PsdLayerNode[], name: string): PsdLayerNode[] {
  const found: PsdLayerNode[] = [];
  const visit = (nodes: PsdLayerNode[]): void => {
    for (const node of nodes) {
      if (node.name === name) found.push(node);
      visit(node.children ?? []);
    }
  };
  visit(roots);
  return found;
}

function nameCounts(roots: PsdLayerNode[]): Map<string, number> {
  const counts = new Map<string, number>();
  const visit = (nodes: PsdLayerNode[]): void => {
    for (const node of nodes) {
      if (node.name) counts.set(node.name, (counts.get(node.name) ?? 0) + 1);
      visit(node.children ?? []);
    }
  };
  visit(roots);
  return counts;
}

function outlineNameAt(outline: string, targetPath: string): string | null {
  const pattern = /^\s*- (\S+) \[[^\]]+\] "(.*?)"(?: — ".*")?(?: \(\d+ 子层\))?$/;
  for (const line of outline.split("\n")) {
    const match = pattern.exec(line);
    if (match && match[1] === targetPath) return match[2] as string;
  }
  return null;
}

async function nodeCount(page: Page): Promise<number> {
  const text = await page
    .locator(".statusbar__right span")
    .filter({ hasText: /节点$/ })
    .first()
    .innerText();
  return Number(text.replace(/[^0-9]/g, ""));
}

async function sampleMemory(page: Page): Promise<MemorySample | null> {
  const frame = page.frames().find((item) => item.url().includes("/patchy/patchy.html"));
  if (!frame) return null;
  try {
    return await frame.evaluate(() => {
      const scope = globalThis as unknown as {
        patchyMemStats?: Record<string, number>;
        performance: Performance & { memory?: { usedJSHeapSize: number } };
      };
      const stats = scope.patchyMemStats;
      if (!stats) {
        return scope.performance.memory
          ? { jsHeapUsedBytes: scope.performance.memory.usedJSHeapSize }
          : null;
      }
      return {
        usedBytes: stats.usedBytes,
        peakUsedBytes: stats.peakUsedBytes,
        heapBytes: stats.heapBytes,
        historyBytes: stats.historyBytes,
        limitBytes: stats.limitBytes,
      };
    });
  } catch {
    return null;
  }
}

async function readLogs(page: Page): Promise<LogEntry[]> {
  if ((await page.locator(".activity-log").count()) === 0) {
    await page.getByRole("button", { name: "打开活动日志" }).click();
  }
  return page.locator(".activity-log .log-entry").evaluateAll((entries) =>
    entries.map((entry) => ({
      level: entry.querySelector(".dot")?.className ?? "",
      message: entry.querySelector(".log-message")?.textContent?.trim() ?? "",
      detail: entry.querySelector(".log-detail")?.textContent?.trim() ?? "",
    })),
  );
}

for (const { fileName, slug } of CASES) {
  test(`真实语料 ${fileName}：Patchy 导入、整理、编组/合并与另存重开`, async ({ page }) => {
    test.skip(!enabled, "Needs staged Patchy site, LAYERFORGE_REAL_PATCHY=1 and LAYERFORGE_PSD_DIR");
    test.skip(!PSD_DIR, "设置 LAYERFORGE_PSD_DIR 指向真实 PSD 目录后运行");
    const filePath = path.join(PSD_DIR as string, fileName);
    test.skip(!existsSync(filePath), `未找到 ${filePath}`);
    test.setTimeout(1_800_000);

    const artifactDir = path.join(artifactRoot, slug);
    await rm(artifactDir, { recursive: true, force: true });
    await mkdir(artifactDir, { recursive: true });

    const sourceSize = (await stat(filePath)).size;
    const sourceSha256 = await sha256File(filePath);
    const consoleLog: string[] = [];
    page.on("console", (message) => consoleLog.push(`[${message.type()}] ${message.text()}`));
    page.on("pageerror", (error) => consoleLog.push(`[pageerror] ${error.message}`));

    await page.addInitScript(() => {
      (globalThis as { patchyExtraEnv?: Record<string, string> }).patchyExtraEnv = {
        PATCHY_MEM_STATS: "1",
      };
    });

    await page.goto("/");
    const importStarted = Date.now();
    await page.getByRole("button", { name: "导入 PSD" }).click();
    await page.setInputFiles("#import-file", filePath);
    await page.fill("#import-name", `corpus-${slug}`);
    await page.getByRole("button", { name: "导入并打开" }).click();
    await expect(page.locator(".engine-pill__label")).toHaveText("Patchy 引擎", {
      timeout: 600_000,
    });
    await expect(page.locator(".engine-pill__state")).toHaveText("就绪", { timeout: 600_000 });
    const importMs = Date.now() - importStarted;
    const memoryAfterLoad = await sampleMemory(page);

    await page.getByRole("button", { name: "打开活动日志" }).click();
    const previewButton = page.getByTitle("渲染预览并下载 PNG");
    const beforePath = await download(page, () => previewButton.click(), artifactDir, "before");
    const before = await pixelDigest(page, beforePath);

    const cleanupStarted = Date.now();
    await page.getByRole("button", { name: "一键整理" }).click();
    await expect(page.locator(".cleanup-panel .stat-chip__value")).toHaveCount(5, {
      timeout: 300_000,
    });
    const statsAfterCleanup = await cleanupStats(page);
    expect(statsAfterCleanup.slices, "Patchy 路径应产出切图候选").toBeGreaterThan(0);
    const cleanupMs = Date.now() - cleanupStarted;

    let groupOutcome = "no-candidates";
    let groupMs: number | null = null;
    let groupedPath: string | null = null;
    let grouped = null as { width: number; height: number; rgbaSha256: string } | null;
    let groupedDiff: PixelDiff | null = null;
    const firstGroup = page.locator(".cleanup-group").first();
    if ((await firstGroup.count()) > 0) {
      const groupStarted = Date.now();
      const appliedGroupsBefore = await appliedCount(page, "已编组");
      await firstGroup.getByRole("button", { name: "仅编组这一组" }).click();
      await expect(page.locator(".activity-log .log-list")).toContainText("编组结束", {
        timeout: 600_000,
      });
      groupMs = Date.now() - groupStarted;
      groupOutcome =
        (await appliedCount(page, "已编组")) > appliedGroupsBefore ? "applied" : "failed";
      if (groupOutcome === "applied") {
        groupedPath = await download(page, () => previewButton.click(), artifactDir, "grouped");
        grouped = await pixelDigest(page, groupedPath);
        groupedDiff = await pixelDiff(page, beforePath, groupedPath);
      }
    }

    let mergeOutcome = "no-candidates";
    let mergeMs: number | null = null;
    let mergedPath: string | null = null;
    let merged = null as { width: number; height: number; rgbaSha256: string } | null;
    let mergedDiff: PixelDiff | null = null;
    const firstMerge = page.locator(".cleanup-merge").first();
    if ((await firstMerge.count()) > 0) {
      const mergeStarted = Date.now();
      const appliedMergesBefore = await appliedCount(page, "已合并");
      await firstMerge.getByRole("button", { name: "仅合并这一组" }).click();
      await expect(page.locator(".activity-log .log-list")).toContainText("合并结束", {
        timeout: 600_000,
      });
      mergeMs = Date.now() - mergeStarted;
      mergeOutcome =
        (await appliedCount(page, "已合并")) > appliedMergesBefore ? "applied" : "failed";
      if (mergeOutcome === "applied") {
        mergedPath = await download(page, () => previewButton.click(), artifactDir, "merged");
        merged = await pixelDigest(page, mergedPath);
        mergedDiff = await pixelDiff(page, groupedPath ?? beforePath, mergedPath);
      }
    }

    const statsAfterEdits = await cleanupStats(page);
    const memoryAfterEdits = await sampleMemory(page);

    const saveStarted = Date.now();
    const psdPath = await download(
      page,
      async () => {
        await page.locator(".save-button").click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "保存并重开", exact: true })
          .click();
      },
      artifactDir,
      "saved",
    );
    await expect(page.getByTestId("diff-card")).toContainText("保存前后结构对比", {
      timeout: 600_000,
    });
    await expect(page.getByTestId("pixel-diff")).toBeVisible({ timeout: 600_000 });
    const uiPixelDiffering = Number(
      await page.getByTestId("pixel-diff-differing").innerText(),
    );
    const uiPixelRatio = await page.getByTestId("pixel-diff-ratio").innerText();
    const saveMs = Date.now() - saveStarted;
    const memoryAfterSave = await sampleMemory(page);

    const reopenedPath = await download(page, () => previewButton.click(), artifactDir, "reopened");
    const reopened = await pixelDigest(page, reopenedPath);
    const reopenedDiff = await pixelDiff(
      page,
      mergedPath ?? groupedPath ?? beforePath,
      reopenedPath,
    );
    expect(uiPixelDiffering, "UI 像素差异应与独立计算的 PNG 差异一致").toBe(
      reopenedDiff.differingPixels,
    );
    expect(uiPixelRatio).toBe(`${(reopenedDiff.ratio * 100).toFixed(3)}%`);
    const sourceShaAfter = await sha256File(filePath);
    const logs = await readLogs(page);
    const problems = logs.filter((entry) => entry.level.includes("danger"));
    const warnings = logs.filter((entry) => entry.level.includes("warn"));
    const applied = logs
      .filter((entry) => /^已(编组|合并)：/.test(entry.message))
      .map((entry) => entry.message);

    const psdBytes = await readFile(psdPath);
    expect(psdBytes.subarray(0, 4).toString("latin1")).toBe("8BPS");
    const savedPsd = readPsd(psdBytes, {
      skipLayerImageData: true,
      skipCompositeImageData: true,
      skipThumbnail: true,
    });
    const savedRoots = (savedPsd.children ?? []).map((layer) => layer.name ?? "");

    const manifest = {
      engine: "patchy-wasm",
      source: {
        fileName,
        path: filePath,
        size: sourceSize,
        sha256: sourceSha256,
        unchanged: sourceShaAfter === sourceSha256,
      },
      timingMs: {
        import: importMs,
        cleanup: cleanupMs,
        group: groupMs,
        merge: mergeMs,
        saveAndReopen: saveMs,
      },
      memory: {
        afterLoad: memoryAfterLoad,
        afterEdits: memoryAfterEdits,
        afterSave: memoryAfterSave,
      },
      cleanup: {
        afterCleanup: statsAfterCleanup,
        afterEdits: statsAfterEdits,
        groupOutcome,
        mergeOutcome,
      },
      output: {
        psd: { path: psdPath, sha256: await sha256File(psdPath), roots: savedRoots.length },
        before: { path: beforePath, ...before },
        grouped: groupedPath && grouped ? { path: groupedPath, ...grouped } : null,
        merged: mergedPath && merged ? { path: mergedPath, ...merged } : null,
        reopened: { path: reopenedPath, ...reopened },
      },
      diffs: {
        group: groupedDiff,
        merge: mergedDiff,
        saveAndReopen: reopenedDiff,
      },
      uiPixelDiff: { differingPixels: uiPixelDiffering, ratio: uiPixelRatio },
      // Group/merge intentionally change the composite; save/reopen fidelity is
      // measured against the last preview rendered before saving, not the import.
      pixelsMatch:
        reopened.rgbaSha256 === (merged ?? grouped ?? before).rgbaSha256,
      applied,
      warnings,
      problems,
      photoshopVerified: false,
      m0Accepted: false,
      note: "Real Patchy WASM import/cleanup/group/merge/save evidence on a production PSD. Photoshop warning-free open remains unverified.",
    };
    await writeFile(path.join(artifactDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(path.join(artifactDir, "browser-console.log"), `${consoleLog.join("\n")}\n`);

    expect(sourceShaAfter, "原始 PSD 不得被覆盖").toBe(sourceSha256);
    expect(consoleLog.filter((line) => /^\[pageerror\]/.test(line))).toEqual([]);
    expect(reopened.width).toBe(before.width);
    expect(reopened.height).toBe(before.height);
    expect
      .soft(manifest.pixelsMatch, "保存重开后合成像素应与保存前最后一次预览一致")
      .toBe(true);
  });
}

test("真实语料 AI 合并复核：任务导出、人工确认、保存重开与资产包", async ({ page }) => {
  test.skip(!enabled, "Needs staged Patchy site, LAYERFORGE_REAL_PATCHY=1 and LAYERFORGE_PSD_DIR");
  test.skip(!PSD_DIR, "设置 LAYERFORGE_PSD_DIR 指向真实 PSD 目录后运行");
  const fileName = process.env.LAYERFORGE_AI_MERGE_PSD ?? "Payment1_D.psd";
  const filePath = path.join(PSD_DIR as string, fileName);
  test.skip(!existsSync(filePath), `未找到 ${filePath}`);
  test.setTimeout(1_800_000);

  const slug = fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  const artifactDir = path.join(artifactRoot, `ai-merge-${slug}`);
  await rm(artifactDir, { recursive: true, force: true });
  await mkdir(artifactDir, { recursive: true });

  const sourceSize = (await stat(filePath)).size;
  const sourceSha256 = await sha256File(filePath);
  const originalPsd = readPsd(await readFile(filePath), {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
  });
  const sourceRoots = (originalPsd.children ?? []) as PsdLayerNode[];
  const sourceLayerCount = countNodes(sourceRoots);
  const sourceRootCount = sourceRoots.length;

  const consoleLog: string[] = [];
  page.on("console", (message) => consoleLog.push(`[${message.type()}] ${message.text()}`));
  page.on("pageerror", (error) => consoleLog.push(`[pageerror] ${error.message}`));

  await page.addInitScript(() => {
    (globalThis as { patchyExtraEnv?: Record<string, string> }).patchyExtraEnv = {
      PATCHY_MEM_STATS: "1",
    };
  });

  await page.goto("/");
  const importStarted = Date.now();
  await page.getByRole("button", { name: "导入 PSD" }).click();
  await page.setInputFiles("#import-file", filePath);
  await page.fill("#import-name", `ai-merge-${slug}`);
  await page.getByRole("button", { name: "导入并打开" }).click();
  await expect(page.locator(".engine-pill__label")).toHaveText("Patchy 引擎", {
    timeout: 600_000,
  });
  await expect(page.locator(".engine-pill__state")).toHaveText("就绪", { timeout: 600_000 });
  const importMs = Date.now() - importStarted;
  const nodesAfterImport = await nodeCount(page);
  const memoryAfterLoad = await sampleMemory(page);

  await page.getByRole("button", { name: "打开活动日志" }).click();
  const previewButton = page.getByTitle("渲染预览并下载 PNG");
  const beforePath = await download(page, () => previewButton.click(), artifactDir, "before");
  const before = await pixelDigest(page, beforePath);

  const cleanupStarted = Date.now();
  await page.getByRole("button", { name: "一键整理" }).click();
  await expect(page.locator(".cleanup-panel .stat-chip__value")).toHaveCount(5, {
    timeout: 300_000,
  });
  const statsAfterCleanup = await cleanupStats(page);
  expect(statsAfterCleanup.merges, "真实语料应产出合并候选").toBeGreaterThan(0);
  expect(statsAfterCleanup.slices, "真实语料应产出切图候选").toBeGreaterThan(0);
  const cleanupMs = Date.now() - cleanupStarted;

  const aiButton = page.getByRole("button", { name: /AI 语义命名/ });
  await aiButton.click();
  const dialog = page.getByRole("dialog", { name: "AI 语义命名" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("组合并复核", { timeout: 120_000 });

  const promptPath = await download(
    page,
    () => dialog.getByRole("button", { name: "下载 AI 命名任务" }).click(),
    artifactDir,
    "ai-task",
  );
  const prompt = await readFile(promptPath, "utf8");
  const marker = "## 候选（JSON）\n```json\n";
  const start = prompt.indexOf(marker);
  expect(start, "AI task JSON block must be present").toBeGreaterThan(-1);
  const end = prompt.indexOf("\n```", start + marker.length);
  expect(end, "AI task JSON block must be terminated").toBeGreaterThan(start);
  const task = JSON.parse(prompt.slice(start + marker.length, end)) as {
    project: { layerCount: number };
    mergeCandidates: Array<{
      path: string;
      kind: "badge" | "component";
      suggestedName: string;
      bounds: { x: number; y: number; width: number; height: number };
      memberCount: number;
      textDescendantCount: number;
      nestedGroupCount: number;
      reason: string;
    }>;
  };
  expect(task.project.layerCount).toBe(nodesAfterImport);
  expect(task.mergeCandidates.length).toBeGreaterThan(0);

  const outlineMarker = "## 图层结构\n```text\n";
  const outlineStart = prompt.indexOf(outlineMarker);
  const outlineEnd = prompt.indexOf("\n```", outlineStart + outlineMarker.length);
  const outline =
    outlineStart >= 0 && outlineEnd > outlineStart
      ? prompt.slice(outlineStart + outlineMarker.length, outlineEnd)
      : "";

  const candidateEntries = task.mergeCandidates.map((candidate) => {
    const sourceNode = layerAtPath(sourceRoots, candidate.path);
    const outlineName = outlineNameAt(outline, candidate.path);
    return { candidate, sourceNode, outlineName };
  });
  const aligned = candidateEntries.filter((entry) => {
    const node = entry.sourceNode;
    if (!node?.name || (node.children?.length ?? 0) < 2) return false;
    return !entry.outlineName || entry.outlineName === node.name;
  });
  expect(
    aligned.length,
    "至少一个合并候选路径应能在源 PSD 中按相同路径解析为同名图层组",
  ).toBeGreaterThan(0);
  const { candidate, sourceNode, outlineName } = aligned[0]!;
  const sourceGroupName = sourceNode!.name as string;
  const sourceSubtreeCount = countNodes([sourceNode!]);
  const sourceGroupNameCount = findLayersByName(sourceRoots, sourceGroupName).length;
  const aiMergedName = `ai-merge-${candidate.path.replace(/\//g, "-")}`;
  expect(aiMergedName.length).toBeLessThanOrEqual(40);

  const response = {
    schema: "layerforge.ai-naming.response",
    schemaVersion: "0.2.0",
    renames: [],
    merges: [
      {
        path: candidate.path,
        decision: "merge",
        name: aiMergedName,
        reason: "真实语料回归：合并候选经人工确认后栅格化为单层",
      },
    ],
  };
  await writeFile(
    path.join(artifactDir, "ai-response.json"),
    `${JSON.stringify(response, null, 2)}\n`,
  );

  const importAndApply = async (): Promise<void> => {
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "ai-merge.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(response)),
    });
    const review = dialog.getByTestId("ai-merge-review");
    await expect(review).toBeVisible();
    await expect(review).toContainText("建议合并");
    await expect(review).toContainText(aiMergedName);
    await expect(review).toContainText(`/${candidate.path}`);
    await dialog.getByTestId("apply-ai-merges").click();
    await expect(dialog.getByTestId("ai-naming-message")).toContainText("1 项已合并", {
      timeout: 600_000,
    });
  };

  const aiApplyStarted = Date.now();
  await importAndApply();
  const aiApplyMs = Date.now() - aiApplyStarted;
  await dialog.getByRole("button", { name: "取消" }).click();

  const nodesAfterMerge = await nodeCount(page);
  expect(nodesAfterMerge).toBe(nodesAfterImport - sourceSubtreeCount + 1);
  const memoryAfterMerge = await sampleMemory(page);

  const mergedPath = await download(page, () => previewButton.click(), artifactDir, "merged");
  const merged = await pixelDigest(page, mergedPath);
  const mergeDiff = await pixelDiff(page, beforePath, mergedPath);
  expect(merged.width).toBe(before.width);
  expect(merged.height).toBe(before.height);
  expect(mergeDiff.ratio, "合并栅格化不应改变整页内容").toBeLessThan(0.02);

  const undoStarted = Date.now();
  await page.getByRole("button", { name: /撤销上一步/ }).click();
  await expect(page.locator(".activity-log .log-list")).toContainText("已撤销最近一次引擎修改", {
    timeout: 600_000,
  });
  const undoMs = Date.now() - undoStarted;
  expect(await nodeCount(page)).toBe(nodesAfterImport);
  const undoPath = await download(page, () => previewButton.click(), artifactDir, "undo");
  const undo = await pixelDigest(page, undoPath);
  const undoDiff = await pixelDiff(page, beforePath, undoPath);
  expect(undo.rgbaSha256, "撤销后预览应恢复到合并前").toBe(before.rgbaSha256);
  expect(undoDiff.differingPixels).toBe(0);

  await aiButton.click();
  await expect(dialog).toBeVisible();
  await importAndApply();
  await dialog.getByRole("button", { name: "取消" }).click();
  expect(await nodeCount(page)).toBe(nodesAfterMerge);

  const saveStarted = Date.now();
  const psdPath = await download(
    page,
    async () => {
      await page.locator(".save-button").click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "保存并重开", exact: true })
        .click();
    },
    artifactDir,
    "saved",
  );
  await expect(page.getByTestId("diff-card")).toContainText("保存前后结构对比", {
    timeout: 600_000,
  });
  await expect(page.getByTestId("pixel-diff")).toBeVisible({ timeout: 600_000 });
  const uiPixelDiffering = Number(
    await page.getByTestId("pixel-diff-differing").innerText(),
  );
  const uiPixelRatio = await page.getByTestId("pixel-diff-ratio").innerText();
  await expect(page.getByTestId("psd-compare")).toBeVisible({ timeout: 600_000 });
  const comparePath = await download(
    page,
    () => page.getByRole("button", { name: "导出原 PSD 对比 JSON" }).click(),
    artifactDir,
    "psd-compare",
  );
  const psdCompare = JSON.parse(await readFile(comparePath, "utf8")) as {
    schema: string;
    evidence: string;
    source: { layerCount: number };
    saved: { layerCount: number };
    pixel: {
      available: boolean;
      differingPixels: number;
      ratio: number;
      maxDelta: number;
    };
    layerPixels: {
      available: boolean;
      compared: number;
      identical: number;
      differing: number;
      unpaired: number;
      differingPixels: number;
    };
  };
  const saveMs = Date.now() - saveStarted;
  const memoryAfterSave = await sampleMemory(page);

  const reopenedPath = await download(page, () => previewButton.click(), artifactDir, "reopened");
  const reopened = await pixelDigest(page, reopenedPath);
  const reopenedDiff = await pixelDiff(page, mergedPath, reopenedPath);
  expect(uiPixelDiffering, "UI 像素差异应与独立计算的 PNG 差异一致").toBe(
    reopenedDiff.differingPixels,
  );
  expect(uiPixelRatio).toBe(`${(reopenedDiff.ratio * 100).toFixed(3)}%`);

  await page.getByRole("tab", { name: /整理/ }).click();
  await expect(page.locator(".cleanup-panel .stat-chip__value")).toHaveCount(5, {
    timeout: 300_000,
  });
  const statsAfterReopen = await cleanupStats(page);
  expect(statsAfterReopen.slices, "保存重开后应自动重新分析出切图").toBeGreaterThan(0);
  expect(statsAfterReopen.slices, "重开分析应反映合并后的图层树").toBeLessThan(
    statsAfterCleanup.slices,
  );
  expect(statsAfterReopen.merges).toBeLessThan(statsAfterCleanup.merges);

  const packStarted = Date.now();
  const [packDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 1_200_000 }),
    page.getByRole("button", { name: "导出资产包 ZIP" }).click(),
  ]);
  const packPath = path.join(artifactDir, "asset-pack.zip");
  await packDownload.saveAs(packPath);
  const packMs = Date.now() - packStarted;
  const packBytes = await readFile(packPath);
  const packEntries = unzipSync(new Uint8Array(packBytes));
  const packManifest = JSON.parse(
    new TextDecoder().decode(packEntries["manifest.json"]),
  ) as PackManifest;

  expect(packManifest.schema).toBe("layerforge.asset-pack");
  expect(packManifest.schemaVersion).toBe("0.4.0");
  expect(packManifest.document.engine).toBe("patchy");
  expect([
    "patchy-isolated-layer-renders",
    "patchy-isolated-layer-renders-with-composite-fallback",
  ]).toContain(packManifest.status.pixels);
  expect(packManifest.status.isolatedLayerRenders, "资产包应包含隔离渲染").toBeGreaterThan(0);
  expect(packManifest.comparison.mismatchedAssets).toBe(0);
  expect(packManifest.comparison.mismatchedMergedAssets).toBe(0);
  expect(packManifest.analysis.slices, "资产包切图数应与保存重开后的分析一致").toBe(
    statsAfterReopen.slices,
  );
  const mergedAsset = packManifest.assets.find((asset) => asset.sourcePath === candidate.path);
  expect(mergedAsset, "AI 合并层应作为切图进入资产包").toBeTruthy();
  expect(mergedAsset!.name).toBe(aiMergedName);
  const mergedBounds = mergedAsset!.bounds;
  const overlapWidth = Math.max(
    0,
    Math.min(mergedBounds.x + mergedBounds.width, candidate.bounds.x + candidate.bounds.width) -
      Math.max(mergedBounds.x, candidate.bounds.x),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(mergedBounds.y + mergedBounds.height, candidate.bounds.y + candidate.bounds.height) -
      Math.max(mergedBounds.y, candidate.bounds.y),
  );
  const candidateOverlapRatio =
    (overlapWidth * overlapHeight) / (candidate.bounds.width * candidate.bounds.height);
  expect(
    candidateOverlapRatio,
    "合并层边界应与分析时的可见联合边界基本重合（允许效果外扩与栅格取整）",
  ).toBeGreaterThanOrEqual(0.95);
  expect(mergedAsset!.verification.mismatched).toBe(false);
  const mergedOneX = mergedAsset!.outputs.find((output) => output.scale === 1);
  expect(mergedOneX, "AI 合并切图应有 1x 输出").toBeTruthy();
  expect(mergedOneX!.source, "AI 合并层应走隔离渲染").toBe("isolated-layer");
  expect(mergedAsset!.verification.mode).toBe("isolated-render-decode");
  const mergedPng = packEntries[`assets/${mergedOneX!.fileName}`];
  expect(mergedPng, "资产包 ZIP 应包含 AI 合并层 PNG").toBeTruthy();
  expect(pngSize(mergedPng)).toEqual({
    width: mergedBounds.width,
    height: mergedBounds.height,
  });
  console.log(
    `[ai-merge-pack] assets=${packManifest.analysis.slices} ` +
      `mergedAssets=${packManifest.analysis.mergedAssets} ` +
      `isolated=${packManifest.status.isolatedLayerRenders} ` +
      `mergedLayer=${mergedAsset!.name}@${mergedOneX!.fileName} ` +
      `bounds=${mergedBounds.width}x${mergedBounds.height} ` +
      `zip=${(packBytes.byteLength / 1024 / 1024).toFixed(1)}MB`,
  );

  const sourceShaAfter = await sha256File(filePath);
  const logs = await readLogs(page);
  const problems = logs.filter((entry) => entry.level.includes("danger"));
  const warnings = logs.filter((entry) => entry.level.includes("warn"));
  const applied = logs
    .filter((entry) => /^已合并：/.test(entry.message))
    .map((entry) => entry.message);
  const aiApplied = logs.filter((entry) => entry.message === "AI 合并复核已执行");
  expect(applied, "两次合并执行都应写入活动日志").toEqual([
    `已合并：${aiMergedName}`,
    `已合并：${aiMergedName}`,
  ]);
  expect(aiApplied.length).toBe(2);

  const psdBytes = await readFile(psdPath);
  expect(psdBytes.subarray(0, 4).toString("latin1")).toBe("8BPS");
  const savedPsd = readPsd(psdBytes, {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
  });
  const savedRoots = (savedPsd.children ?? []) as PsdLayerNode[];
  const savedTotal = countNodes(savedRoots);
  const expectedSavedTotal = sourceLayerCount - sourceSubtreeCount + 1;
  const savedMerged = findLayersByName(savedRoots, aiMergedName);
  expect(savedMerged, "AI 命名的合并层应写入保存 PSD").toHaveLength(1);
  expect(savedMerged[0]?.children ?? [], "合并层应是叶子图层").toHaveLength(0);
  expect(savedTotal).toBe(expectedSavedTotal);
  const savedPathNode = layerAtPath(savedRoots, candidate.path);
  expect(savedPathNode?.name, "合并层应保留原组在父级中的位置").toBe(aiMergedName);
  expect(savedPathNode?.children ?? []).toHaveLength(0);
  const sourceNameCounts = nameCounts(sourceRoots);
  const subtreeNameCounts = nameCounts([sourceNode!]);
  const savedNameCounts = nameCounts(savedRoots);
  for (const [name, removed] of subtreeNameCounts) {
    if (name === aiMergedName) continue;
    expect(
      savedNameCounts.get(name) ?? 0,
      `原组内名称 "${name}" 的出现次数应减少 ${removed}`,
    ).toBe((sourceNameCounts.get(name) ?? 0) - removed);
  }
  const savedGroupNameCount = savedNameCounts.get(sourceGroupName) ?? 0;
  const pathReplaced = savedPathNode?.name === aiMergedName;

  expect(psdCompare.schema).toBe("layerforge.psd-compare");
  expect(psdCompare.evidence).toBe("ag-psd-independent");
  expect(psdCompare.saved.layerCount).toBe(savedTotal);

  const manifest = {
    engine: "patchy-wasm",
    feature: "ai-merge-review-real-corpus",
    source: {
      fileName,
      path: filePath,
      size: sourceSize,
      sha256: sourceSha256,
      unchanged: sourceShaAfter === sourceSha256,
      layerCount: sourceLayerCount,
      rootCount: sourceRootCount,
    },
    timingMs: {
      import: importMs,
      cleanup: cleanupMs,
      aiApply: aiApplyMs,
      undo: undoMs,
      saveAndReopen: saveMs,
      assetPack: packMs,
    },
    memory: {
      afterLoad: memoryAfterLoad,
      afterMerge: memoryAfterMerge,
      afterSave: memoryAfterSave,
    },
    cleanup: statsAfterCleanup,
    cleanupAfterReopen: statsAfterReopen,
    aiTask: {
      prompt: { path: promptPath, sha256: await sha256File(promptPath) },
      candidate: {
        ...candidate,
        sourceGroupName,
        outlineName,
        sourceChildCount: sourceNode!.children?.length ?? 0,
        sourceSubtreeCount,
      },
      response: { name: aiMergedName, path: candidate.path },
    },
    nodes: {
      afterImport: nodesAfterImport,
      projectLayerCount: task.project.layerCount,
      afterMerge: nodesAfterMerge,
      sourcePsd: sourceLayerCount,
      savedPsd: savedTotal,
      expectedSavedPsd: expectedSavedTotal,
    },
    output: {
      psd: { path: psdPath, sha256: await sha256File(psdPath) },
      before: { path: beforePath, ...before },
      merged: { path: mergedPath, ...merged },
      undo: { path: undoPath, ...undo },
      reopened: { path: reopenedPath, ...reopened },
      prompt: promptPath,
      compare: { path: comparePath, sha256: await sha256File(comparePath) },
    },
    diffs: { merge: mergeDiff, undo: undoDiff, saveAndReopen: reopenedDiff },
    structural: {
      savedMergedLayers: savedMerged.length,
      mergedLayerIsLeaf: (savedMerged[0]?.children ?? []).length === 0,
      savedGroupNameCount,
      sourceGroupNameCount,
      pathReplaced,
    },
    psdCompare: {
      evidence: psdCompare.evidence,
      sourceLayers: psdCompare.source.layerCount,
      savedLayers: psdCompare.saved.layerCount,
      compositePixel: {
        available: psdCompare.pixel.available,
        differingPixels: psdCompare.pixel.differingPixels,
        ratio: psdCompare.pixel.ratio,
        maxDelta: psdCompare.pixel.maxDelta,
      },
      layerPixel: psdCompare.layerPixels,
    },
    uiPixelDiff: { differingPixels: uiPixelDiffering, ratio: uiPixelRatio },
    assetPack: {
      zip: { path: packPath, bytes: packBytes.byteLength, sha256: await sha256File(packPath) },
      schema: packManifest.schema,
      schemaVersion: packManifest.schemaVersion,
      slices: packManifest.analysis.slices,
      mergedAssets: packManifest.analysis.mergedAssets,
      isolatedLayerRenders: packManifest.status.isolatedLayerRenders,
      compositeCrops: packManifest.status.compositeCrops,
      mismatchedAssets: packManifest.comparison.mismatchedAssets,
      mismatchedMergedAssets: packManifest.comparison.mismatchedMergedAssets,
      aiMerged: {
        name: mergedAsset!.name,
        path: mergedAsset!.sourcePath,
        candidateBounds: candidate.bounds,
        bounds: mergedAsset!.bounds,
        candidateOverlapRatio,
        oneX: mergedOneX!.fileName,
        source: mergedOneX!.source,
      },
    },
    pixelsMatch: reopened.rgbaSha256 === merged.rgbaSha256,
    applied,
    aiApplied: aiApplied.length,
    warnings,
    problems,
    photoshopVerified: false,
    m0Accepted: false,
    note: "Real Patchy WASM AI merge review plus asset pack evidence on a production PSD. Save/reopen differences are subject to the documented shape/slice vector save convention; the open check is warning-free open only, not visual acceptance.",
  };
  await writeFile(path.join(artifactDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(artifactDir, "browser-console.log"), `${consoleLog.join("\n")}\n`);

  expect(sourceShaAfter, "原始 PSD 不得被覆盖").toBe(sourceSha256);
  expect(consoleLog.filter((line) => /^\[pageerror\]/.test(line))).toEqual([]);
  expect(reopened.width).toBe(before.width);
  expect(reopened.height).toBe(before.height);
  expect.soft(reopenedDiff.ratio, "保存重开差异应保持在已知形状/切片保真范围内").toBeLessThan(0.02);
});

test("保存保真：Payment1 原样另存重开后像素与结构对比", async ({ page }) => {
  test.skip(!enabled, "Needs staged Patchy site, LAYERFORGE_REAL_PATCHY=1 and LAYERFORGE_PSD_DIR");
  test.skip(!PSD_DIR, "设置 LAYERFORGE_PSD_DIR 指向真实 PSD 目录后运行");
  const fileName = process.env.LAYERFORGE_PRESERVE_PSD ?? "Payment1_D.psd";
  const filePath = path.join(PSD_DIR as string, fileName);
  test.skip(!existsSync(filePath), `未找到 ${filePath}`);
  test.setTimeout(1_200_000);

  const artifactDir = path.join(artifactRoot, "save-fidelity-noop");
  await rm(artifactDir, { recursive: true, force: true });
  await mkdir(artifactDir, { recursive: true });

  const sourceSha256 = await sha256File(filePath);
  const originalPsd = readPsd(await readFile(filePath), {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
  });
  const rootsBefore = (originalPsd.children ?? []).map((layer) => layer.name ?? "");

  await page.addInitScript(() => {
    (globalThis as { patchyExtraEnv?: Record<string, string> }).patchyExtraEnv = {
      PATCHY_MEM_STATS: "1",
    };
  });
  await page.goto("/");
  const importStarted = Date.now();
  await page.getByRole("button", { name: "导入 PSD" }).click();
  await page.setInputFiles("#import-file", filePath);
  await page.fill("#import-name", "save-fidelity");
  await page.getByRole("button", { name: "导入并打开" }).click();
  await expect(page.locator(".engine-pill__label")).toHaveText("Patchy 引擎", { timeout: 600_000 });
  await expect(page.locator(".engine-pill__state")).toHaveText("就绪", { timeout: 600_000 });
  const importMs = Date.now() - importStarted;

  const previewButton = page.getByTitle("渲染预览并下载 PNG");
  const firstPath = await download(page, () => previewButton.click(), artifactDir, "before-a");
  const secondPath = await download(page, () => previewButton.click(), artifactDir, "before-b");
  const first = await pixelDigest(page, firstPath);
  const second = await pixelDigest(page, secondPath);
  const renderNoise = await pixelDiff(page, firstPath, secondPath);

  const saveStarted = Date.now();
  const psdPath = await download(
    page,
    async () => {
      await page.locator(".save-button").click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "保存并重开", exact: true })
        .click();
    },
    artifactDir,
    "saved",
  );
  await expect(page.getByTestId("diff-card")).toContainText("保存前后结构对比", {
    timeout: 600_000,
  });
  await expect(page.getByTestId("pixel-diff")).toBeVisible({ timeout: 600_000 });
  const uiPixelDiffering = Number(
    await page.getByTestId("pixel-diff-differing").innerText(),
  );
  const saveMs = Date.now() - saveStarted;
  const reopenedPath = await download(page, () => previewButton.click(), artifactDir, "reopened");
  const reopened = await pixelDigest(page, reopenedPath);
  const saveDiff = await pixelDiff(page, firstPath, reopenedPath);
  expect(uiPixelDiffering, "UI 像素差异应与独立计算的 PNG 差异一致").toBe(
    saveDiff.differingPixels,
  );
  const sourceShaAfter = await sha256File(filePath);

  const psdBytes = await readFile(psdPath);
  expect(psdBytes.subarray(0, 4).toString("latin1")).toBe("8BPS");
  const savedPsd = readPsd(psdBytes, {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
  });
  const rootsAfter = (savedPsd.children ?? []).map((layer) => layer.name ?? "");

  const manifest = {
    engine: "patchy-wasm",
    source: { fileName, path: filePath, sha256: sourceSha256, unchanged: sourceShaAfter === sourceSha256 },
    timingMs: { import: importMs, saveAndReopen: saveMs },
    renderDeterministic: first.rgbaSha256 === second.rgbaSha256,
    renderNoise,
    output: {
      psd: { path: psdPath, sha256: await sha256File(psdPath) },
      before: { path: firstPath, ...first },
      reopened: { path: reopenedPath, ...reopened },
    },
    rootsBefore,
    rootsAfter,
    rootsMatch: JSON.stringify(rootsBefore) === JSON.stringify(rootsAfter),
    saveDiff,
    pixelsMatch: first.rgbaSha256 === reopened.rgbaSha256,
    photoshopVerified: false,
    m0Accepted: false,
    note: "No-edit save fidelity on a production PSD. Isolates Patchy save/reopen from group/merge edits.",
  };
  await writeFile(path.join(artifactDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  expect(sourceShaAfter, "原始 PSD 不得被覆盖").toBe(sourceSha256);
  expect.soft(manifest.renderDeterministic, "同一文档连续两次预览应一致").toBe(true);
  expect.soft(saveDiff.differingPixels, "原样另存重开后像素应与保存前一致").toBe(0);
  expect.soft(manifest.rootsMatch, "原样另存重开后图层结构应与原文件一致").toBe(true);
});
