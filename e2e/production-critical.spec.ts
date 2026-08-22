import { expect, test } from '@playwright/test';

const fixtureEmail = process.env.HOBBEAST_E2E_USER_EMAIL;
const fixturePassword = process.env.HOBBEAST_E2E_USER_PASSWORD;
const fixtureEventId = process.env.HOBBEAST_E2E_EVENT_ID;
const allowMutations = process.env.HOBBEAST_E2E_ALLOW_MUTATIONS === '1';

test.describe('fail-closed unauthenticated routes', () => {
  for (const route of ['/profile', '/community', '/organizer', '/admin']) {
    test(`${route} requires authentication`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/auth(?:\?|$)/);
      await expect(page.getByRole('heading', { name: /Üdv újra|Csatlakozz/i })).toBeVisible();
    });
  }

  test('auth form has labelled, keyboard-reachable controls', async ({ page }) => {
    await page.goto('/auth');
    const email = page.getByLabel('E-mail');
    const password = page.getByLabel('Jelszó');
    const submit = page.getByRole('button', { name: 'Bejelentkezés', exact: true });
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(submit).toBeVisible();
    await email.focus();
    await expect(email).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(password).toBeFocused();
  });
});

test.describe('production-like authenticated critical path', () => {
  test.skip(
    !fixtureEmail || !fixturePassword || !fixtureEventId || !allowMutations,
    'Requires a disposable staging persona/event and HOBBEAST_E2E_ALLOW_MUTATIONS=1.',
  );

  test('login -> discovery -> atomic RSVP -> organizer/admin trust surfaces', async ({ page }) => {
    await page.goto('/auth');
    await page.getByLabel('E-mail').fill(fixtureEmail!);
    await page.getByLabel('Jelszó').fill(fixturePassword!);
    await page.getByRole('button', { name: 'Bejelentkezés', exact: true }).click();
    await expect(page).not.toHaveURL(/\/auth(?:\?|$)/);

    await page.goto('/events');
    await expect(page.getByRole('heading', { name: /Események/i })).toBeVisible();

    await page.goto(`/events/${fixtureEventId}`);
    await expect(page.locator('h1')).toBeVisible();
    const join = page.getByRole('button', { name: 'Csatlakozom', exact: true }).first();
    if (await join.isVisible()) {
      await join.click();
      await expect(page.getByText(/Sikeresen csatlakoztál|várólistára/i)).toBeVisible();
    }

    await page.goto(`/organizer?event=${fixtureEventId}`);
    await expect(page.getByRole('heading', { name: /Organizer mode|Szervezői mód/i })).toBeVisible();

    await page.goto('/admin?tab=operations');
    await expect(page.getByRole('heading', { name: 'Admin felület' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Operations control plane/i })).toBeVisible();
  });
});
