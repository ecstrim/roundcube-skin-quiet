import { test, expect, type Page } from '@playwright/test';
import { BASE, contrast, login, setColorMode, setScheme } from './helpers';

// Colour schemes: picked in the account menu, stored in the quietScheme cookie, applied as a variant stylesheet.

test.use({ viewport: { width: 1440, height: 900 } });

const SCHEMES = {
  lake:   { light: 'rgb(23, 105, 178)', dark: 'rgb(109, 174, 241)', fill: { light: 'rgb(23, 105, 178)', dark: 'rgb(24, 94, 158)' } },
  cobalt: { light: 'rgb(43, 79, 196)',  dark: 'rgb(157, 179, 255)', fill: { light: 'rgb(43, 79, 196)',  dark: 'rgb(58, 94, 208)' } },
  teal:   { light: 'rgb(15, 118, 110)', dark: 'rgb(92, 207, 192)',  fill: { light: 'rgb(15, 118, 110)', dark: 'rgb(15, 118, 110)' } },
  indigo: { light: 'rgb(79, 70, 184)',  dark: 'rgb(165, 160, 245)', fill: { light: 'rgb(79, 70, 184)',  dark: 'rgb(91, 82, 201)' } },
} as const;
type Scheme = keyof typeof SCHEMES;

const css = (loc: ReturnType<Page['locator']>, prop: string) => loc.evaluate((e, p) => (getComputedStyle(e) as any)[p] as string, prop);
const unreadSubject = (page: Page) => page.locator('#messagelist tbody tr.unread:not(.selected) span.subject a').first();
const newMail = (page: Page) => page.locator('#layout-sidebar #quiet-newmail');
const swatch = (page: Page, s: Scheme) => page.locator(`#quiet-account-menu .quiet-schemes button[data-scheme="${s}"]`);

test('account menu shows four named swatches, Lake blue checked by default', async ({ page, context }) => {
  await setScheme(context, 'lake');
  await login(page);
  await page.click('#quiet-account');
  await expect(page.locator('#quiet-schemes-label')).toHaveText('Color scheme');
  const names = await page.locator('#quiet-account-menu .quiet-schemes button').evaluateAll((bs) =>
    bs.map((b) => [b.getAttribute('data-scheme'), b.getAttribute('aria-label'), b.getAttribute('aria-checked')]));
  expect(names).toEqual([
    ['lake', 'Lake blue', 'true'], ['cobalt', 'Cobalt', 'false'], ['teal', 'Deep teal', 'false'], ['indigo', 'Ink indigo', 'false'],
  ]);
});

test('picking a scheme applies it live (page and reading pane), keeps the menu open and survives a reload', async ({ page, context }) => {
  await setColorMode(context, 'light');
  await setScheme(context, 'lake');
  await login(page);
  await page.locator('#messagelist tbody tr').first().locator('span.subject').click();
  const frame = page.frameLocator('#messagecontframe');
  await expect(frame.locator('#quiet-body-box')).toBeVisible();

  await page.click('#quiet-account');
  await swatch(page, 'teal').click();
  await expect(page.locator('#quiet-account-menu')).toBeVisible();
  await expect(swatch(page, 'teal')).toHaveAttribute('aria-checked', 'true');
  await expect(swatch(page, 'lake')).toHaveAttribute('aria-checked', 'false');
  await expect.poll(() => css(newMail(page), 'backgroundColor')).toBe(SCHEMES.teal.fill.light);
  await expect(frame.locator('html')).toHaveAttribute('data-quiet-scheme', 'teal');
  await expect.poll(() => frame.locator('link[rel="stylesheet"][href*="/styles/scheme-teal.min.css"]').count()).toBe(1);
  expect(await frame.locator('link[rel="stylesheet"][href*="/styles/styles.min.css"]').count()).toBe(0);
  expect((await context.cookies()).find((c) => c.name === 'quietScheme')?.value).toBe('teal');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-quiet-scheme', 'teal');
  expect(await css(newMail(page), 'backgroundColor')).toBe(SCHEMES.teal.fill.light);

  // back to the default: cookie removed, default stylesheet again
  await page.click('#quiet-account');
  await swatch(page, 'lake').click();
  await expect.poll(() => css(newMail(page), 'backgroundColor')).toBe(SCHEMES.lake.fill.light);
  await expect(page.locator('html')).not.toHaveAttribute('data-quiet-scheme', /./);
  expect((await context.cookies()).some((c) => c.name === 'quietScheme')).toBe(false);
  await page.keyboard.press('Escape');
  await expect(page.locator('#quiet-account-menu')).toBeHidden();
});

test('an unknown cookie value falls back to Lake blue', async ({ page, context }) => {
  await context.addCookies([{ name: 'quietScheme', value: 'neon', domain: new URL(BASE).hostname, path: '/' }]);
  await setColorMode(context, 'light');
  await login(page);
  await expect(page.locator('html')).not.toHaveAttribute('data-quiet-scheme', /./);
  expect(await css(newMail(page), 'backgroundColor')).toBe(SCHEMES.lake.fill.light);
});

for (const scheme of Object.keys(SCHEMES) as Scheme[]) {
  for (const mode of ['light', 'dark'] as const) {
    test(`${scheme} (${mode}): accent on unread rows and buttons, text >= 4.5:1`, async ({ page, context }) => {
      await setColorMode(context, mode);
      await setScheme(context, scheme);
      await login(page);
      await page.mouse.move(1400, 880);
      const s = SCHEMES[scheme];
      const subj = unreadSubject(page);
      expect(await css(subj, 'color')).toBe(s[mode]);
      const btn = newMail(page);
      const fill = await css(btn, 'backgroundColor');
      expect(fill).toBe(s.fill[mode]);
      expect(contrast(await css(btn, 'color'), fill)).toBeGreaterThanOrEqual(4.5);
      const rowBg = await css(page.locator('#messagelist tbody tr.unread:not(.selected) td.subject').first(), 'backgroundColor');
      const paneBg = rowBg === 'rgba(0, 0, 0, 0)' ? await css(page.locator('#layout-list'), 'backgroundColor') : rowBg;
      expect(contrast(s[mode], paneBg), `${s[mode]} on ${paneBg}`).toBeGreaterThanOrEqual(4.5);
      // the selected-row tint keeps primary and secondary text readable
      const sel = page.locator('#messagelist tbody tr').nth(2);
      await sel.locator('span.subject').click();
      await page.mouse.move(1400, 880);
      const selBg = await css(sel.locator('td.subject'), 'backgroundColor');
      for (const part of ['span.fromto', 'span.subject a', 'span.date']) {
        const fg = await css(sel.locator(part), 'color');
        expect(contrast(fg, selBg), `${part} ${fg} on ${selBg}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
}

test('mobile browser bar colour follows the scheme and dark mode', async ({ page, context }) => {
  const meta = () => page.locator('meta[name="theme-color"]').getAttribute('content');
  await setColorMode(context, 'light');
  await setScheme(context, 'lake');
  await login(page);
  expect(await meta()).toBe('rgb(240, 240, 241)');
  await page.click('#quiet-account');
  await swatch(page, 'teal').click();
  await expect.poll(meta).toBe('rgb(238, 241, 241)');
  await page.click('#quiet-account-menu a.theme');                       // dark mode on
  await expect.poll(meta).toBe('rgb(23, 27, 27)');
  await page.reload();
  await expect.poll(meta).toBe('rgb(23, 27, 27)');
});
