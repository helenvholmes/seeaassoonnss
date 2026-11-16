import { defineConfig, devices } from "@playwright/test";

// Browser tests for things unit tests cannot see: clicks, drags, keys and scrolling
// in the real editor and reader. Run with `npm run test:e2e`.
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}/seasons/`,
    viewport: { width: 1400, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/seasons/e2e/editor-quote`,
    env: { E2E: "1" },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
