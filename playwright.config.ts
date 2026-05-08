import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "https://cytogenesis.vercel.app";

// In CI we point at a local prod build (started by `webServer` below) so the
// suite exercises the PR's code, not whatever happens to be on prod.
const isLocalTarget = BASE_URL.startsWith("http://localhost") || BASE_URL.startsWith("http://127.");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: isLocalTarget
    ? {
        command: "pnpm start",
        url: BASE_URL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
});
