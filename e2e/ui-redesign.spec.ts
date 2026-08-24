import { expect, test, type Page } from '@playwright/test';

const viewports = [
  { name: 'compact mobile', width: 320, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 1000 },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}

for (const viewport of viewports) {
  test(`consumer UI stays usable without horizontal overflow on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect(page.getByRole('heading', { name: 'Találd meg a te embereidet.' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Programot keresek/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto('/events', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Események/i })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Eseményszűrők' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto('/explore', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Fedezd fel a hobbidat/i })).toBeVisible();
    await expect(page.getByLabel('Hobbi keresése')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Üdv újra/i })).toBeVisible();
    await expect(page.getByLabel('E-mail')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}

test('mobile navigation and additive home discovery entry points preserve routing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const menu = page.getByRole('button', { name: 'Menü megnyitása' });
  await menu.click();
  await expect(page.getByRole('button', { name: 'Menü bezárása' })).toBeVisible();
  await page.getByRole('link', { name: 'Hobbik', exact: true }).click();
  await expect(page).toHaveURL(/\/explore$/);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const search = page.getByLabel('Program vagy hobbi keresése');
  await search.fill('társasjáték');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/events\?q=t%C3%A1rsasj%C3%A1t%C3%A9k&mode=search$/);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Kategóriák szerint/i }).click();
  await expect(page).toHaveURL(/\/events\?mode=categories$/);
  await expect(page.getByRole('dialog', { name: 'Kategóriák' })).toBeVisible();
});
