import { test, expect } from "@playwright/test";

/**
 * Language selection, end to end.
 *
 * The rest of the suite pins `locale: "hu-HU"` because it asserts Hungarian
 * copy. That pin would also hide the opposite bug — the app quietly serving
 * Hungarian to everyone — so language behaviour is proven HERE, with browser
 * contexts that deliberately ask for something else.
 *
 * This exists because the real failure happened: v1.70.0 made the app follow
 * the browser language, GitHub's runners prefer English, and the navigation
 * silently became "Hobbies" while every Hungarian assertion timed out with no
 * hint about why.
 */

/** Nav labels as they appear in each catalogue, in navLinks order. */
const NAV = {
  hu: ["Főoldal", "Események", "Hobbik", "Klubok", "Rólunk"],
  en: ["Home", "Events", "Hobbies", "Clubs", "About"],
  de: ["Startseite", "Veranstaltungen", "Hobbys", "Klubs", "Über uns"],
};

async function mobileNavLabels(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Menü megnyitása|Open menu|Menü öffnen/ }).click();
  return page.locator("#mobile-nav a").allInnerTexts();
}

test.describe("the browser language decides the initial language", () => {
  test.use({ locale: "en-US" });

  test("an English browser gets English navigation and html lang", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("link", { name: "Hobbies", exact: true }).first()).toBeVisible();
  });
});

test.describe("a language we ship for a collected country", () => {
  test.use({ locale: "de-AT" });

  test("an Austrian browser gets German, not English", async ({ page }) => {
    // de-AT, not de-DE: the country half must not stop the language from
    // resolving, and Austria is one of the countries the catalogue collects
    // from, so this is a visitor we actually expect.
    const labels = await mobileNavLabels(page);
    expect(labels).toEqual(NAV.de);
  });
});

test.describe("a language we do not ship", () => {
  test.use({ locale: "fr-FR" });

  test("falls back to the source language rather than showing keys", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", "hu");
    const body = await page.locator("body").innerText();
    // A blown lookup renders the dotted key itself; that must never reach a page.
    expect(body).not.toContain("nav.hobbies");
    expect(body).not.toContain("country.foreign");
  });
});

test.describe("an explicit choice outranks the browser and survives a reload", () => {
  test.use({ locale: "en-US" });

  test("switching to Hungarian sticks", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.getByTestId("language-switcher").first().selectOption("hu");
    await expect(page.locator("html")).toHaveAttribute("lang", "hu");
    await expect(page.getByRole("link", { name: "Hobbik", exact: true }).first()).toBeVisible();

    // The point of persisting the choice is that it survives the next visit,
    // where the browser would otherwise pull the visitor back to English.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", "hu");
    const labels = await mobileNavLabels(page);
    expect(labels).toEqual(NAV.hu);
  });
});
