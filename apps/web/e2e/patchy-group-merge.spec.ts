import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { readPsd, writePsdBuffer } from "ag-psd";

const siteEntry = fileURLToPath(new URL("../public/patchy/patchy.html", import.meta.url));
const artifactDir = fileURLToPath(new URL("../../../artifacts/patchy-roundtrip", import.meta.url));
const enabled = process.env.LAYERFORGE_REAL_PATCHY === "1" && existsSync(siteEntry);

type Rgba = [number, number, number, number];

function solidData(width: number, height: number, color: Rgba): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
    data[index + 3] = color[3];
  }
  return { width, height, data } as ImageData;
}

function fixtureBytes(): Buffer {
  const tile = (): ImageData => solidData(24, 16, [30, 90, 210, 255]);
  return Buffer.from(
    new Uint8Array(
      writePsdBuffer({
        width: 160,
        height: 100,
        imageData: solidData(160, 100, [246, 248, 250, 255]),
        children: [
          { name: "page-background", imageData: solidData(160, 100, [246, 248, 250, 255]) },
          { name: "hero-title", imageData: tile(), top: 10, left: 10 },
          { name: "hero-cta", imageData: tile(), top: 10, left: 38 },
          { name: "icon-star", imageData: tile(), top: 10, left: 66 },
          { name: "icon-heart", imageData: tile(), top: 10, left: 94 },
          {
            name: "badge",
            children: [
              {
                name: "badge-count",
                imageData: solidData(12, 12, [200, 40, 40, 255]),
                top: 70,
                left: 120,
              },
              {
                name: "badge-icon",
                imageData: solidData(8, 8, [255, 255, 255, 255]),
                top: 74,
                left: 126,
              },
            ],
          },
        ],
      }),
    ),
  );
}

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

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
): Promise<string> {
  const [file] = await Promise.all([page.waitForEvent("download"), action()]);
  const target = path.join(targetDir, file.suggestedFilename());
  await file.saveAs(target);
  return target;
}

function childNames(layer: { children?: Array<{ name?: string }> }): string[] {
  return (layer.children ?? []).map((child) => child.name ?? "");
}

test("真实 Patchy：一键编组/合并写入内存，另存重开后结构与像素保持", async ({ page }) => {
  test.skip(!enabled, "Needs a staged bridge-enabled Patchy site and LAYERFORGE_REAL_PATCHY=1");
  test.setTimeout(900_000);
  await rm(artifactDir, { recursive: true, force: true });
  await mkdir(artifactDir, { recursive: true });

  const consoleLog: string[] = [];
  page.on("console", (message) => consoleLog.push(`[${message.type()}] ${message.text()}`));
  page.on("pageerror", (error) => consoleLog.push(`[pageerror] ${error.message}`));

  await page.goto("/");
  await page.getByRole("button", { name: "导入 PSD" }).click();
  await page.setInputFiles("#import-file", {
    name: "patchy-group-merge.psd",
    mimeType: "image/vnd.adobe.photoshop",
    buffer: fixtureBytes(),
  });
  await page.fill("#import-name", "patchy 编组合并");
  await page.getByRole("button", { name: "导入并打开" }).click();

  await expect(page.locator(".engine-pill__label")).toHaveText("Patchy 引擎", {
    timeout: 300_000,
  });
  await expect(page.locator(".engine-pill__state")).toHaveText("就绪", {
    timeout: 300_000,
  });

  const previewButton = page.getByTitle("渲染预览并下载 PNG");
  const beforePath = await download(page, () => previewButton.click(), artifactDir);
  const before = await pixelDigest(page, beforePath);

  await page.getByRole("button", { name: "一键整理" }).click();
  const stats = page.locator(".cleanup-panel .stat-chip__value");
  await expect(stats.nth(2)).toHaveText("1");
  await expect(stats.nth(3)).toHaveText("1");

  await page.getByRole("button", { name: /一键编组（1）/ }).click();
  await expect(stats.nth(2)).toHaveText("0", { timeout: 120_000 });
  await expect(
    page.locator(".tree-name").filter({ hasText: "row-cluster" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /撤销上一步/ }).click();
  await expect(stats.nth(2)).toHaveText("1", { timeout: 120_000 });
  await expect(
    page.locator(".tree-name").filter({ hasText: "row-cluster" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /撤销上一步/ })).toBeDisabled();

  await page.getByRole("button", { name: /一键编组（1）/ }).click();
  await expect(stats.nth(2)).toHaveText("0", { timeout: 120_000 });
  await expect(
    page.locator(".tree-name").filter({ hasText: "row-cluster" }),
  ).toBeVisible();
  const groupedPath = await download(page, () => previewButton.click(), artifactDir);
  const grouped = await pixelDigest(page, groupedPath);
  expect(grouped).toEqual(before);

  await page.getByRole("button", { name: /一键合并（1）/ }).click();
  await expect(stats.nth(3)).toHaveText("0", { timeout: 120_000 });
  await expect(
    page.locator(".tree-name").filter({ hasText: "icon-button-merged" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /撤销上一步/ }).click();
  await expect(stats.nth(3)).toHaveText("1", { timeout: 120_000 });
  await expect(
    page.locator(".tree-name").filter({ hasText: "icon-button-merged" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".tree-name").filter({ hasText: /^badge$/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: /一键合并（1）/ }).click();
  await expect(stats.nth(3)).toHaveText("0", { timeout: 120_000 });
  await expect(
    page.locator(".tree-name").filter({ hasText: "icon-button-merged" }),
  ).toBeVisible();
  const mergedPath = await download(page, () => previewButton.click(), artifactDir);
  const merged = await pixelDigest(page, mergedPath);
  expect(merged).toEqual(before);

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
  );
  await expect(page.getByTestId("diff-card")).toContainText("保存前后结构对比", {
    timeout: 120_000,
  });
  await expect(
    page.locator(".tree-name").filter({ hasText: "row-cluster" }),
  ).toBeVisible({ timeout: 120_000 });
  await expect(
    page.locator(".tree-name").filter({ hasText: "icon-button-merged" }),
  ).toBeVisible();

  await expect(page.getByTestId("pixel-diff")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("pixel-diff-differing")).toHaveText("0");
  await expect(page.getByTestId("pixel-diff-ratio")).toHaveText("0.000%");
  const uiPixelDiff = {
    differingPixels: Number(await page.getByTestId("pixel-diff-differing").innerText()),
    ratio: await page.getByTestId("pixel-diff-ratio").innerText(),
  };

  const reopenedPath = await download(page, () => previewButton.click(), artifactDir);
  const reopened = await pixelDigest(page, reopenedPath);
  expect(reopened).toEqual(before);

  const psdBytes = await readFile(psdPath);
  expect(psdBytes.subarray(0, 4).toString("latin1")).toBe("8BPS");
  const psd = readPsd(psdBytes, {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
  });
  const roots = psd.children ?? [];
  const group = roots.find((layer) => layer.name === "row-cluster");
  expect(group, "group must persist in the saved PSD").toBeTruthy();
  expect(childNames(group!)).toEqual(["hero-title", "hero-cta", "icon-star", "icon-heart"]);
  const mergedLayer = roots.find((layer) => layer.name === "icon-button-merged");
  expect(mergedLayer, "merged layer must persist in the saved PSD").toBeTruthy();
  expect(childNames(mergedLayer!)).toEqual([]);
  expect(roots.some((layer) => layer.name === "badge")).toBe(false);
  expect(roots.some((layer) => layer.name === "badge-count")).toBe(false);

  const manifest = {
    engine: "patchy-wasm",
    fixture: {
      name: "patchy-group-merge.psd",
      sha256: sha256(fixtureBytes()),
      width: 160,
      height: 100,
    },
    output: {
      psd: { path: psdPath, sha256: sha256(psdBytes) },
      before: { path: beforePath, ...before },
      grouped: { path: groupedPath, ...grouped },
      merged: { path: mergedPath, ...merged },
      reopened: { path: reopenedPath, ...reopened },
    },
    pixelsMatch: true,
    pixelDiff: uiPixelDiff,
    photoshopVerified: false,
    m0Accepted: false,
    note: "Real Patchy WASM bridge evidence on a synthetic PSD. Photoshop warning-free open remains unverified.",
  };
  await writeFile(path.join(artifactDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(artifactDir, "browser-console.log"), `${consoleLog.join("\n")}\n`);
  expect(consoleLog.filter((line) => /^\[(?:error|pageerror)\]/.test(line))).toEqual([]);
});
