import { test, expect } from "@playwright/test";

/**
 * Sprint 1.3 characterization smoke test.
 *
 * Loads the landing page against the running dev server and verifies the
 * app boots without a hard runtime error. Extend, do not rewrite: add new
 * `test(...)` blocks for each critical flow instead of altering this one.
 */
test("landing page renders without runtime errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("body")).toBeVisible();
  await expect(page).toHaveTitle(/.+/);
  expect(errors, `runtime errors: ${errors.join(" | ")}`).toEqual([]);
});
