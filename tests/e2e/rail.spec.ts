import { test, expect } from '@playwright/test';
import { login, setColorMode } from './helpers';

test.use({ viewport: { width: 1440, height: 900 } });

test('rail has mail, contacts, settings', async ({ page, context }) => {
  await setColorMode(context, 'light');
  await login(page);
  const links = page.locator('#taskmenu > a:visible');
  const names = await links.evaluateAll((els) =>
    els.map((e) => ['mail', 'contacts', 'settings'].find((c) => e.classList.contains(c)) ?? e.className));
  expect(names.slice(0, 3)).toEqual(['mail', 'contacts', 'settings']);
  const w = await page.locator('#layout-menu').evaluate((e) => e.getBoundingClientRect().width);
  expect(w).toBeLessThanOrEqual(56);
});

test('account popover', async ({ page }) => {
  await login(page);
  await expect(page.locator('#quiet-account')).toBeVisible();
  await expect(page.locator('#quiet-account-menu')).toBeHidden();
  await page.click('#quiet-account');
  const pop = page.locator('#quiet-account-menu');
  await expect(pop).toBeVisible();
  await expect(pop.getByText('About')).toBeVisible();
  await expect(pop.getByText('Dark mode')).toBeVisible();
  await expect(pop.getByText('Logout')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
});

test('dark toggle persists', async ({ page, context }) => {
  await setColorMode(context, 'light');
  await login(page);
  await expect(page.locator('html')).not.toHaveClass(/dark-mode/);
  await page.click('#quiet-account');
  await page.getByText('Dark mode').click();
  await expect(page.locator('html')).toHaveClass(/dark-mode/);
  expect((await context.cookies()).some((c) => c.name === 'colorMode' && c.value === 'dark')).toBe(true);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark-mode/);
});
