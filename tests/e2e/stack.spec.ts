import { test, expect } from '@playwright/test';
import { BASE_PLAIN, FIXTURES, login } from './helpers';

test('stack serves Roundcube 1.6.20 and login works', async ({ page }) => {
  await login(page);
  expect(page.url()).toContain('_task=mail');
  await expect(page.locator('#messagelist tbody tr')).not.toHaveCount(0);
  expect(await page.locator('#messagelist tbody tr').count()).toBeGreaterThanOrEqual(45);
  // rcversion encodes major*10000 + minor*100 + patch.
  expect(await page.evaluate(() => (window as any).rcmail.env.rcversion)).toBe(10620);
});

test('seeded fixtures present', async ({ page }) => {
  await login(page);
  for (const [id, fragment] of Object.entries(FIXTURES)) {
    const rows = page.locator('#messagelist tbody tr', { hasText: fragment });
    await expect(rows, `fixture ${id}`).toHaveCount(1);
    await expect(rows.first()).toBeVisible();
  }
});

test('plain instance has no archive plugin', async ({ page }) => {
  await login(page, BASE_PLAIN);
  const archive = await page.evaluate(() => (window as any).rcmail.env.archive_folder);
  expect(archive).toBeUndefined();
});

test('main instance has archive plugin configured', async ({ page }) => {
  await login(page);
  const archive = await page.evaluate(() => (window as any).rcmail.env.archive_folder);
  expect(archive).toBe('Archive');
});
