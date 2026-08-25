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
    await expect(page.getByRole('heading', { name: 'A város tele van közös történetekkel.' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Programot keresek/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto('/events', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Események/i })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Eseményszűrők' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto('/explore', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Amit szeretsz, hozd közénk/i })).toBeVisible();
    await expect(page.getByLabel('Hobbi keresése')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Üdv újra/i })).toBeVisible();
    await expect(page.getByLabel('E-mail')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto('/about', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Élmény, közösség, barátok, értékek/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}

test('home hero does not load motion media when reduced motion is requested', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const motionMediaRequests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'media' || /\.(?:mp4|webm)(?:[?#]|$)/i.test(request.url())) {
      motionMediaRequests.push(request.url());
    }
  });

  await page.goto('/', { waitUntil: 'load' });
  await expect(page.getByTestId('hero-poster')).toBeVisible();
  // The desktop motion enhancement is intentionally delayed; give that path
  // enough time to prove it never mounts or requests media in reduced mode.
  await page.waitForTimeout(750);
  await expect(page.getByTestId('hero-motion-video')).toHaveCount(0);
  await expect(page.locator('[data-testid="hero-motion-video"] source')).toHaveCount(0);
  await expect(page.getByTestId('hero-motion-toggle')).toHaveCount(0);
  expect(motionMediaRequests).toEqual([]);
});

test('home hero motion control is accessible and its media assets load cleanly on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  const assetRequestErrors: string[] = [];
  page.on('requestfailed', (request) => {
    if (request.resourceType() === 'image' || request.resourceType() === 'media') {
      assetRequestErrors.push(`${request.failure()?.errorText ?? 'request failed'}: ${request.url()}`);
    }
  });
  page.on('response', (response) => {
    const resourceType = response.request().resourceType();
    if ((resourceType === 'image' || resourceType === 'media') && response.status() >= 400) {
      assetRequestErrors.push(`${response.status()}: ${response.url()}`);
    }
  });

  await page.goto('/', { waitUntil: 'load' });
  await expect(page.getByTestId('hero-poster')).toBeVisible();
  await expect(page.getByTestId('hero-poster')).toHaveAttribute('data-hero-variant', /^(day|night)$/);

  const video = page.getByTestId('hero-motion-video');
  const toggle = page.getByTestId('hero-motion-toggle');
  const videoAvailable = await video
    .waitFor({ state: 'attached', timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  const videoCount = videoAvailable ? await video.count() : 0;
  if (videoAvailable) {
    await expect(toggle).toBeVisible();
  }
  const toggleCount = await toggle.count();

  expect(videoCount, 'An eligible desktop hero must load one real motion clip').toBe(1);
  expect(toggleCount, 'The motion video and its control must be rendered together').toBe(videoCount);

  if (videoCount > 0) {
    expect(videoCount).toBe(1);
    await expect(video).toBeVisible();
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-label', /\S/);
    const source = await video.locator('source').getAttribute('src');
    expect(source).toMatch(/hero-together-(day|night)\.mp4/);
    expect(source).not.toContain('hero-budapest-night-motion');

    const controlBounds = await toggle.boundingBox();
    expect(controlBounds, 'The motion control must have a rendered hit target').not.toBeNull();
    expect(controlBounds!.width).toBeGreaterThanOrEqual(44);
    expect(controlBounds!.height).toBeGreaterThanOrEqual(44);

    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThan(0);

    const initialLabel = await toggle.getAttribute('aria-label');
    const initiallyPaused = await video.evaluate((element: HTMLVideoElement) => element.paused);

    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Space');

    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(!initiallyPaused);
    await expect.poll(() => toggle.getAttribute('aria-label')).not.toBe(initialLabel);

    const toggledLabel = await toggle.getAttribute('aria-label');
    await page.keyboard.press('Enter');

    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(initiallyPaused);
    await expect.poll(() => toggle.getAttribute('aria-label')).not.toBe(toggledLabel);

    if (await video.evaluate((element: HTMLVideoElement) => element.paused)) {
      await toggle.click();
    }
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);

    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);
  }

  expect(assetRequestErrors).toEqual([]);
});

test('photographic hobby cards preserve the full category drill-down state machine', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/explore', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('img', { name: 'Baráti könyvklub közösen olvas és beszélget' })).toBeVisible();

  await expect(page.getByTestId('category-visual')).toHaveCount(17);
  await expect(page.locator('[data-testid="category-visual"] img')).toHaveCount(17);
  expect(await page.locator('[data-testid="category-visual"] img').evaluateAll((images) =>
    images.every((image) => Boolean((image as HTMLImageElement).getAttribute('src'))),
  )).toBe(true);
  expect(await page.locator('[data-testid="category-visual"] img').evaluateAll((images) =>
    images.slice(0, 4).every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0),
  )).toBe(true);

  await page.getByRole('button', { name: 'Sport & Mozgás kategória megnyitása' }).click();
  await expect(page.getByRole('heading', { name: 'Válassz egy közelebbi irányt' })).toBeVisible();

  await page.getByRole('button', { name: 'Labdajátékok alkategória megnyitása' }).click();
  await expect(page.getByRole('heading', { name: 'Találd meg a neked való tevékenységet' })).toBeVisible();

  await page.getByRole('button', { name: /Vissza/ }).click();
  await expect(page.getByRole('heading', { name: 'Válassz egy közelebbi irányt' })).toBeVisible();
  await page.getByRole('button', { name: /Vissza/ }).click();
  await expect(page.getByRole('heading', { name: 'Milyen élményre vágysz?' })).toBeVisible();
  await expect(page.getByTestId('category-visual')).toHaveCount(17);
});

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
