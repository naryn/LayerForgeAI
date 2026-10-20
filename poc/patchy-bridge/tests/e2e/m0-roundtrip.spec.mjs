import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const fixture = process.env.M0_PSD_FIXTURE;
const artifactDir = process.env.M0_ARTIFACT_DIR;
const patchyCommit = process.env.M0_PATCHY_COMMIT;
if (!fixture) throw new Error("M0_PSD_FIXTURE must name an approved PSD/PSB fixture");
if (!artifactDir) throw new Error("M0_ARTIFACT_DIR must name a new evidence directory");
if (!patchyCommit) throw new Error("M0_PATCHY_COMMIT is required");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function pixelDigest(page, filePath) {
  const base64 = (await readFile(filePath)).toString("base64");
  return page.evaluate(async (encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const digest = await crypto.subtle.digest("SHA-256", pixels);
    return {
      width: bitmap.width,
      height: bitmap.height,
      rgbaSha256: [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0")).join(""),
    };
  }, base64);
}

test("rename, save a copy, reopen, verify, and preserve rendered pixels", async ({ page, context }) => {
  await mkdir(path.dirname(artifactDir), { recursive: true });
  await mkdir(artifactDir);
  const sourceBefore = await readFile(fixture);
  const sourceHash = sha256(sourceBefore);
  const consoleLog = [];
  const fatalConsole = [];
  page.on("console", (message) => {
    const line = `[${message.type()}] ${message.text()}`;
    consoleLog.push(line);
    if (message.type() === "error") fatalConsole.push(line);
  });
  page.on("pageerror", (error) => {
    const line = `[pageerror] ${error.stack || error.message}`;
    consoleLog.push(line);
    fatalConsole.push(line);
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

  try {
  const downloadPromises = [];
  const downloadNames = [];
  page.on("download", (download) => {
    downloadNames.push(download.suggestedFilename());
    const target = path.join(artifactDir, download.suggestedFilename());
    downloadPromises.push(download.saveAs(target).then(() => target));
  });

  await page.addInitScript(() => localStorage.setItem("qt-v0-Patchy-Patchy-preferences/guiScalePercent", "100"));
  await page.goto("http://127.0.0.1:8973/patchy.html?m0=1", { waitUntil: "load" });
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);
  await page.waitForFunction(() => Boolean(window.__patchyM0Harness));
  await page.setInputFiles("#patchy-m0-fixture", fixture);
  const result = await page.evaluate(() => window.__patchyM0Harness.run());

  await expect.poll(() => downloadPromises.length).toBe(3);
  await Promise.all(downloadPromises);
  expect(downloadNames.sort()).toEqual(["m0-after.png", "m0-before.png", "m0-normalized.psd"]);
  const beforePath = path.join(artifactDir, "m0-before.png");
  const afterPath = path.join(artifactDir, "m0-after.png");
  const psdPath = path.join(artifactDir, "m0-normalized.psd");
  for (const required of [beforePath, afterPath, psdPath]) {
    expect((await stat(required)).size).toBeGreaterThan(0);
  }

  const beforePixels = await pixelDigest(page, beforePath);
  const afterPixels = await pixelDigest(page, afterPath);
  expect(afterPixels).toEqual(beforePixels);
  expect(result.renamed).not.toBe(result.originalName);
  expect(result.reopenedDocumentId).not.toBe(result.sourceDocumentId);
  const protocolChecks = result.protocolChecks?.checks ?? {};
  const expectedChecks = [
    "invalidOpenPath",
    "invalidPreviewPath",
    "missingPrecondition",
    "previewOverwrite",
    "psdOverwrite",
    "stalePrecondition",
    "stateUnchanged",
    "unknownOperation",
  ];
  expect(Object.keys(protocolChecks).sort()).toEqual(expectedChecks.sort());
  for (const name of expectedChecks) {
    expect(protocolChecks[name]?.passed, `${name} must pass`).toBe(true);
  }
  expect(await readFile(fixture)).toEqual(sourceBefore);
  expect(fatalConsole).toEqual([]);

  await page.screenshot({ path: path.join(artifactDir, "m0-reopened.png"), timeout: 60_000 });
  const manifest = {
    patchyCommit,
    result,
    source: { path: fixture, sha256: sourceHash },
    output: {
      psd: { path: psdPath, sha256: sha256(await readFile(psdPath)) },
      before: { path: beforePath, sha256: sha256(await readFile(beforePath)), ...beforePixels },
      after: { path: afterPath, sha256: sha256(await readFile(afterPath)), ...afterPixels },
    },
    crossOriginIsolated: true,
  };
  await writeFile(path.join(artifactDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await context.tracing.stop({ path: path.join(artifactDir, "playwright-trace.zip") });
    await writeFile(path.join(artifactDir, "browser-console.log"), `${consoleLog.join("\n")}\n`);
  }
});

