import { defineConfig } from "@playwright/test";
import path from "node:path";

const patchyRoot = process.env.PATCHY_ROOT;
if (!patchyRoot) throw new Error("PATCHY_ROOT must point to the complete pinned Patchy checkout");
const siteRoot = process.env.PATCHY_WASM_SITE
  ?? path.join(patchyRoot, "build", "package", "wasm-site");
const serveScript = path.join(patchyRoot, "scripts", "wasm", "serve.mjs");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 300_000,
  expect: { timeout: 120_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["line"]],
  use: {
    browserName: "chromium",
    acceptDownloads: true,
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: `node "${serveScript}" "${siteRoot}" 8973`,
    url: "http://127.0.0.1:8973/patchy.html",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

