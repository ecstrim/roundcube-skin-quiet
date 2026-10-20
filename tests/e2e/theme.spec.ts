import { test, expect, type Page } from '@playwright/test';
import { BASE, login, setColorMode, collectConsoleErrors } from './helpers';

// "App background" = computed background-color of #layout.
const appBg = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.querySelector('#layout')!).backgroundColor);

test('skin is quiet', async ({ page }) => {
  await login(page);
  expect(await page.evaluate(() => (window as any).rcmail.env.skin)).toBe('quiet');
});

test('light tokens', async ({ page, context }) => {
  await setColorMode(context, 'light');
  await login(page);
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(font.startsWith('"IBM Plex Sans"')).toBe(true);
  // the bundled faces actually load (regular, medium, semibold)
  await page.evaluate(() => document.fonts.ready);
  for (const w of [400, 500, 600]) {
    expect(await page.evaluate((w) => document.fonts.check(`${w} 14px "IBM Plex Sans"`), w)).toBe(true);
  }
  expect(await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'IBM Plex Sans' && f.status === 'loaded'))).toBe(true);
  expect(await appBg(page)).toBe('rgb(240, 240, 241)');
});

test('dark tokens via cookie', async ({ page, context }) => {
  await setColorMode(context, 'dark');
  await login(page);
  await expect(page.locator('html')).toHaveClass(/dark-mode/);
  expect(await appBg(page)).toBe('rgb(26, 27, 28)');
});

for (const mode of ['light', 'dark'] as const) {
  test(`no console errors in ${mode} mode`, async ({ page, context }) => {
    await setColorMode(context, mode);
    const errors = collectConsoleErrors(page);
    // login page
    await page.goto(`${BASE}/`);
    await expect(page.locator('#rcmloginuser')).toBeVisible();
    await login(page);
    for (const url of [
      '?_task=mail&_mbox=INBOX',
      '?_task=mail&_action=compose',
      '?_task=addressbook',
      '?_task=settings',
    ]) {
      await page.goto(`${BASE}/${url}`);
      await page.waitForLoadState('networkidle');
    }
    expect(errors).toEqual([]);
  });
}
