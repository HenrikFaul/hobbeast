import { defineConfig } from "@playwright/test";

const configuredAppUrl = String(process.env.PLAYWRIGHT_TEST_BASE_URL || "").trim();
const appUrl = configuredAppUrl || "http://127.0.0.1:4179";
const appPort = new URL(appUrl).port || "4179";

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
    command: `bun run dev -- --host 127.0.0.1 --port ${appPort}`,
    url: appUrl,
    // A generic process on the old dev port can satisfy Playwright's URL probe
    // while serving a completely different application. Reuse is therefore an
    // explicit opt-in through PLAYWRIGHT_TEST_BASE_URL only.
    reuseExistingServer: Boolean(configuredAppUrl) && !process.env.CI,
    timeout: 120_000,
  },
});
