import { defineConfig } from "@playwright/test";

const appUrl = "http://127.0.0.1:8080";

export default defineConfig({
  testDir: "./e2e",
  // Vite's first transform on a cold Windows/CI install can exceed Playwright's
  // 30s default even though subsequent route loads are fast.
  timeout: 90_000,
  use: {
    baseURL: appUrl,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run dev -- --host 127.0.0.1",
    url: appUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
