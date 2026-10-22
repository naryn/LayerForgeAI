import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { decodePngDigests } from "./lib/png-digest.mjs";

// Browser evidence check. This proves the WASM round trip and pixel equality.
// The Photoshop conclusion is read from the adjacent open-check evidence, never
// assumed: without a CLEAN log and a passing evidence verification it stays false.
const artifactDir = process.env.M0_ARTIFACT_DIR;
if (!artifactDir) throw new Error("M0_ARTIFACT_DIR is required");
const expectedPatchyCommit = "d1ff95235e00af296868d4253e03391ca002ee9d";

const requiredFiles = [
  "m0-normalized.psd",
  "m0-before.png",
  "m0-after.png",
  "m0-reopened.png",
  "manifest.json",
  "browser-console.log",
  "playwright-trace.zip",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (message) => { throw new Error(`M0 browser evidence invalid: ${message}`); };

for (const name of requiredFiles) {
  const info = await stat(path.join(artifactDir, name));
  if (!info.isFile() || info.size === 0) fail(`${name} is missing or empty`);
}

const manifest = JSON.parse(await readFile(path.join(artifactDir, "manifest.json"), "utf8"));
if (manifest.patchyCommit !== expectedPatchyCommit) fail("Patchy commit is not the pinned M0 commit");
if (manifest.result?.protocolVersion !== 2) fail("bridge protocol version is not 2");
if (manifest.crossOriginIsolated !== true) fail("crossOriginIsolated was not true");
if (!manifest.result?.renamed || manifest.result.renamed === manifest.result.originalName) {
  fail("renamed layer evidence is absent");
}
if (manifest.result.reopenedDocumentId === manifest.result.sourceDocumentId) {
  fail("reopened document identity was not refreshed");
}

const sourceBytes = await readFile(manifest.source.path);
if (sha256(sourceBytes) !== manifest.source.sha256) fail("source PSD hash changed");

const expected = {
  psd: path.join(artifactDir, "m0-normalized.psd"),
  before: path.join(artifactDir, "m0-before.png"),
  after: path.join(artifactDir, "m0-after.png"),
};
for (const [key, filePath] of Object.entries(expected)) {
  if (path.resolve(manifest.output[key].path) !== path.resolve(filePath)) {
    fail(`${key} path escapes the evidence directory or has an unexpected name`);
  }
  if (sha256(await readFile(filePath)) !== manifest.output[key].sha256) {
    fail(`${key} file hash does not match manifest`);
  }
}

const psdHeader = await readFile(expected.psd);
if (psdHeader.subarray(0, 4).toString("latin1") !== "8BPS") fail("output is not an 8BPS PSD file");
if (psdHeader.subarray(4, 6).toString("hex") !== "0001") fail("output is not a PSD version 1 file");

const browser = await chromium.launch({ headless: true });
let recomputed;
try {
  recomputed = await decodePngDigests(browser, {
    before: expected.before,
    after: expected.after,
  });
} finally {
  await browser.close();
}
if (JSON.stringify(recomputed.before) !== JSON.stringify(recomputed.after)) {
  fail("before/after decoded RGBA pixels differ");
}
for (const key of ["before", "after"]) {
  for (const field of ["width", "height", "rgbaSha256"]) {
    if (manifest.output[key][field] !== recomputed[key][field]) {
      fail(`${key}.${field} does not match independently decoded PNG`);
    }
  }
}

const consoleLog = await readFile(path.join(artifactDir, "browser-console.log"), "utf8");
if (/^\[(?:error|pageerror)\]/m.test(consoleLog)) fail("browser console contains an error");

const readOptional = async (name) => {
  try {
    return (await readFile(path.join(artifactDir, name), "utf8")).replace(/^\uFEFF/, "");
  } catch {
    return null;
  }
};
const isWindowsPath = (value) => /^[A-Za-z]:[\\/]/.test(value ?? "");
const scope = isWindowsPath(manifest.source.path) || isWindowsPath(artifactDir)
  ? "windows-wasm-browser"
  : "macos-wasm-browser";

const photoshop = { verified: false, note: "Photoshop open check log is absent." };
const openLog = await readOptional("photoshop-open-check.log");
if (openLog !== null) {
  const lines = openLog.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const cleanLines = lines.filter((line) => line.startsWith("CLEAN "));
  const driverText = await readOptional("photoshop-open-check-driver.json");
  const evidenceText = await readOptional("evidence-verification.json");
  if (lines.length !== 1 || cleanLines.length !== 1) {
    photoshop.note = "Photoshop open check log is not exactly one CLEAN result.";
  } else if (driverText === null || evidenceText === null) {
    photoshop.note = "Photoshop driver record or evidence verification is missing.";
  } else {
    const driver = JSON.parse(driverText);
    const evidence = JSON.parse(evidenceText);
    if (driver.verdict !== cleanLines[0]) {
      photoshop.note = "Photoshop driver verdict does not match the open check log.";
    } else if (evidence.ok !== true || evidence.photoshop !== cleanLines[0]) {
      photoshop.note = "Evidence verification did not pass the Photoshop open check.";
    } else if (path.resolve(cleanLines[0].slice("CLEAN ".length).trim()) !== path.resolve(expected.psd)) {
      photoshop.note = "Photoshop reported CLEAN for a different file than the normalized PSD.";
    } else {
      photoshop.verified = true;
      photoshop.note = "Photoshop opened the normalized PSD without warnings.";
    }
  }
}

const verification = {
  ok: true,
  scope,
  verifiedAt: new Date().toISOString(),
  patchyCommit: manifest.patchyCommit,
  protocolVersion: manifest.result.protocolVersion,
  sourcePath: manifest.source.path,
  sourceSha256: manifest.source.sha256,
  outputPsdSha256: manifest.output.psd.sha256,
  rgbaSha256: recomputed.before.rgbaSha256,
  dimensions: { width: recomputed.before.width, height: recomputed.before.height },
  photoshopVerified: photoshop.verified,
  m0Accepted: photoshop.verified,
  note: photoshop.note,
};
await writeFile(
  path.join(artifactDir, "browser-evidence-verification.json"),
  `${JSON.stringify(verification, null, 2)}\n`,
);
console.log(JSON.stringify(verification));
