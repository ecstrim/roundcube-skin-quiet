import { test, expect, type Page } from '@playwright/test';
import { BASE, login, setColorMode } from './helpers';

// Visual fix wave, compose: box above Send at short heights, labelled HTML / Plain text switch, phone colours.

const COMPOSE = `${BASE}/?_task=mail&_action=compose`;

async function openCompose(page: Page) {
  await login(page);
  await page.goto(COMPOSE);
  await expect(page.locator('#compose-subject')).toBeVisible();
  await expect(page.locator('#composebody, .tox-tinymce').first()).toBeVisible();
}

const css = (loc: ReturnType<Page['locator']>, prop: string) => loc.evaluate((e, p) => (getComputedStyle(e) as any)[p] as string, prop);

for (const [w, h] of [[1024, 768], [1440, 700]]) {
  test(`editor box ends above the Send row (${w}x${h}, plain and HTML)`, async ({ page, context }) => {
    await page.setViewportSize({ width: w, height: h });
    await setColorMode(context, 'light');
    await openCompose(page);
    const barBox = () => page.locator('#quiet-compose-bottom').boundingBox().then((b) => b!);
    let bar = await barBox();
    const form = (await page.locator('#compose-content > form').boundingBox())!;
    const plain = (await page.locator('#composebody').boundingBox())!;
    expect(plain.y + plain.height, 'plain box bottom vs Send row').toBeLessThanOrEqual(bar.y - 4);
    expect(plain.y + plain.height).toBeLessThanOrEqual(form.y + form.height);
    expect(plain.height).toBeGreaterThanOrEqual(299);
    // the Send row is pinned to the bottom of the card and the box fills the space above it
    const card = (await page.locator('#layout-content').boundingBox())!;
    expect(card.y + card.height - (bar.y + bar.height)).toBeLessThanOrEqual(20);
    expect(bar.y - (plain.y + plain.height)).toBeLessThanOrEqual(30);
    await page.locator('#quiet-bar-type').selectOption('html');
    await expect(page.locator('.tox-tinymce')).toBeVisible();
    bar = await barBox();
    const edit = (await page.locator('.tox-tinymce .tox-edit-area').boundingBox())!;
    expect(edit.y + edit.height, 'HTML box bottom vs Send row').toBeLessThanOrEqual(bar.y - 4);
  });
}

test.describe('HTML / Plain text switch', () => {
  for (const mode of ['light', 'dark'] as const) {
    test(`labelled select in both editor modes (${mode})`, async ({ page, context }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await setColorMode(context, mode);
      await openCompose(page);
      const sw = page.locator('#quiet-bar-type');
      await expect(sw).toBeVisible();
      const label = () => sw.evaluate((e) => (e as HTMLSelectElement).selectedOptions[0].textContent!.trim());
      expect(await label()).toBe('Plain text');
      const b = (await sw.boundingBox())!;
      const bar = (await page.locator('#composebodycontainer .editor-toolbar').boundingBox())!;
      expect(b.width).toBeGreaterThan(60);                       // a word, not an icon
      expect(b.x + b.width).toBeGreaterThan(bar.x + bar.width - 12);   // right end of the bar
      expect(b.y).toBeGreaterThanOrEqual(bar.y);
      expect(b.y + b.height).toBeLessThanOrEqual(bar.y + bar.height);
      // Elastic's icon switch is gone
      await expect(page.locator('#composebodycontainer .editor-toolbar .mce-i-html')).toBeHidden();
      // switching works and the label follows
      await sw.selectOption('html');
      await expect(page.locator('.tox-tinymce')).toBeVisible();
      expect(await label()).toBe('HTML');
      await expect(page.locator('.tox-tinymce button[aria-label*="plain" i]')).toBeHidden();
      const tb = (await page.locator('.tox-tinymce .tox-toolbar').first().boundingBox())!;
      const b2 = (await sw.boundingBox())!;
      expect(b2.x + b2.width).toBeGreaterThan(tb.x + tb.width - 12);
      expect(b2.y).toBeGreaterThanOrEqual(tb.y);
      expect(b2.y + b2.height).toBeLessThanOrEqual(tb.y + tb.height);
      // the Options popover select stays in step
      await page.locator('#quiet-options-button').click();
      await expect(page.locator('#quiet-editor-type')).toHaveValue('html');
      await page.locator('#quiet-editor-type').selectOption('plain');
      await expect(page.locator('.tox-tinymce')).toHaveCount(0);
      await expect(sw).toHaveValue('plain');
    });
  }

  test('Spell button does not overlap the switch', async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setColorMode(context, 'light');
    await openCompose(page);
    const spell = page.locator('#quiet-spell');
    if (await spell.count() === 0) test.skip(true, 'no spell languages configured');
    const s = (await spell.boundingBox())!;
    const w = (await page.locator('#quiet-bar-type').boundingBox())!;
    expect(s.x + s.width).toBeLessThanOrEqual(w.x + 1);
  });
});

test.describe('phone compose', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const bar = { light: 'rgb(243, 243, 243)', dark: 'rgb(46, 46, 46)' };
  for (const mode of ['light', 'dark'] as const) {
    test(`editor stays white, Attach and bar use Quiet colours (${mode})`, async ({ page, context }) => {
      await setColorMode(context, mode);
      await openCompose(page);
      expect(await css(page.locator('#composebody'), 'backgroundColor')).toBe('rgb(255, 255, 255)');
      expect(await css(page.locator('#composebody'), 'color')).toBe('rgb(36, 36, 36)');
      const attach = page.locator('#quiet-attach');
      expect(await css(attach, 'backgroundColor')).toBe('rgba(0, 0, 0, 0)');
      expect(await css(attach, 'color')).toBe(mode === 'light' ? 'rgb(35, 36, 37)' : 'rgb(232, 232, 233)');
      expect(await css(page.locator('#composebodycontainer .editor-toolbar'), 'backgroundColor')).toBe(bar[mode]);
      // HTML mode: TinyMCE's bar is on the same token and the edit area is white
      await page.locator('#quiet-bar-type').selectOption('html');
      await expect(page.locator('.tox-tinymce')).toBeVisible();
      expect(await css(page.locator('.tox-tinymce .tox-toolbar').first(), 'backgroundColor')).toBe(bar[mode]);
      expect(await css(page.locator('.tox-tinymce .tox-edit-area'), 'backgroundColor')).toBe('rgb(255, 255, 255)');
    });
  }
});
