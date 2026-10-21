import { devices, defineConfig } from "@playwright/test";

const PORT = 5173;
const BASE_URL = `http://127.0.0.1:${PORT}`;
// Set PLAYWRIGHT_CHANNEL=chrome (or msedge) to reuse an installed browser when
// the Playwright browser download is unavailable on this machine.
const channel = process.env.PLAYWRIGHT_CHANNEL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // The device preset carries its own 1280x720 viewport, so the intended
      // desktop layout must be reapplied after spreading it.
      use: {
        ...devices["Desktop Chrome"],
        ...(channel ? { channel } : {}),
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    // The dev server is used because the demo engine is gated behind
    // import.meta.env.DEV (or VITE_ENABLE_DEMO=1 in a production build).
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});