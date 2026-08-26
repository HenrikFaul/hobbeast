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

/**
 * The map route crashed once on a constant that survived a refactor while the
 * project's `typecheck` script — which points at a tsconfig with `files: []` —
 * reported success. Only loading the route catches that class of mistake, so
 * every lazily-loaded route worth having gets a boot test here.
 */
test("map search route boots without runtime errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/events/map", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: /Hol vannak programok/i })).toBeVisible();
  // The error boundary replaces the page content when a render throws.
  await expect(page.getByText("Valami félbeszakította az oldalt")).toHaveCount(0);
  expect(errors, `runtime errors: ${errors.join(" | ")}`).toEqual([]);
});
