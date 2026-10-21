import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { readPsd } from "ag-psd";

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

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
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
      pixelsMatch: reopened.rgbaSha256 === before.rgbaSha256,
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
    expect.soft(manifest.pixelsMatch, "保存重开后合成像素应与保存前一致").toBe(true);
  });
}

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
