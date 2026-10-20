import { test, expect } from '@playwright/test';
import { BASE, BASE_PLAIN, USER, PASS, login, setColorMode, collectConsoleErrors } from './helpers';

test('card centered with product name, separator, title', async ({ page, context }) => {
  await setColorMode(context, 'light');
  await page.goto(`${BASE}/`);
  const card = page.locator('#login-form');
  await expect(card.getByText('Quiet Mail')).toBeVisible();
  await expect(card.locator('hr')).toBeVisible();
  await expect(page.locator('#quiet-login-title')).toHaveText('Login'); // Roundcube's localized "login" label
  // order: name above hr above title
  const y = async (sel: string) => (await page.locator(sel).boundingBox())!.y;
  expect(await y('#quiet-login-name')).toBeLessThan(await y('#quiet-login-sep'));
  expect(await y('#quiet-login-sep')).toBeLessThan(await y('#quiet-login-title'));
  // centered horizontally, card on the app background
  const vp = page.viewportSize()!;
  const box = (await card.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThan(2);
  expect(box.width).toBeLessThanOrEqual(380);
  const radius = await card.evaluate((e) => getComputedStyle(e).borderTopLeftRadius);
  expect(radius).toBe('10px');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(240, 240, 241)');
  await expect(page.locator('#login-form label[for=rcmloginuser]')).toBeVisible();
  await expect(page.locator('#rcmloginsubmit')).toHaveCSS('text-transform', 'none');
  const btn = (await page.locator('#rcmloginsubmit').boundingBox())!;
  expect(btn.width).toBeGreaterThan(box.width - 80);
});

test('support link under card when support_url set', async ({ page }) => {
  await page.goto(`${BASE}/`);
  const link = page.locator('#login-footer a.support-link');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://example.org/help');
  const card = (await page.locator('#login-form').boundingBox())!;
  expect((await link.boundingBox())!.y).toBeGreaterThan(card.y + card.height);
});

for (const base of [BASE, BASE_PLAIN]) {
  test(`host field hidden by default (${base})`, async ({ page }) => {
    await page.goto(`${base}/`);
    await expect(page.locator('#rcmloginuser')).toBeVisible();
    await expect(page.locator('#rcmloginhost')).not.toBeVisible();
  });
}

test('dark card colors', async ({ page, context }) => {
  await setColorMode(context, 'dark');
  await page.goto(`${BASE}/`);
  await expect(page.locator('html')).toHaveClass(/dark-mode/);
  const bg = (sel: string) => page.locator(sel).evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(await bg('#login-form')).toBe('rgb(37, 38, 40)');
  expect(await bg('#layout')).toBe('rgb(26, 27, 28)');
  expect(await bg('#rcmloginsubmit')).toBe('rgb(24, 94, 158)');
});

test('phone width: 16px gutters, no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto(`${BASE}/`);
  const box = (await page.locator('#login-form').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(15);
  expect(Math.round(box.x + box.width)).toBeLessThanOrEqual(375 - 15);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('login works', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await login(page);
  expect(errors).toEqual([]);
});

// Error path: session-expired message must stay visible inside the viewport with the centered flex layout.
for (const mode of ['light', 'dark'] as const) {
  for (const [name, w, h] of [['desktop', 1440, 900], ['phone', 375, 700]] as const) {
    test(`error message visible in viewport (${mode}, ${name})`, async ({ page, context }) => {
      await setColorMode(context, mode);
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`${BASE}/?_task=login&_err=session`);
      const msg = page.locator('#messagestack .error, #messagestack .alert, #messagestack > div').first();
      await expect(msg).toBeVisible();
      const b = (await msg.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(w);
      expect(b.y + b.height).toBeLessThanOrEqual(h);
    });
  }
}
