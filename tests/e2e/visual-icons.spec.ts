import { test, expect, type Locator, type Page } from '@playwright/test';
import { BASE, FIXTURES, login, setColorMode } from './helpers';

// Visual fix wave: stroke icons (CSS masks) instead of Elastic's filled font glyphs, and no empty band in Settings.

const SOFT = { light: 'rgb(95, 98, 101)', dark: 'rgb(171, 172, 175)' };

/** The ::before of an element is drawn through a CSS mask (a stroke icon), not a font glyph. */
async function expectMasked(loc: Locator, what: string, pseudo = '::before') {
  const s = await loc.first().evaluate((e, p) => {
    const c = getComputedStyle(e, p);
    return { content: c.content, mask: c.maskImage || (c as any).webkitMaskImage || 'none', bg: c.backgroundColor, color: c.color };
  }, pseudo);
  expect(s.mask, `${what}: mask`).toContain('data:image/svg+xml');
  expect(s.content, `${what}: no font glyph`).toBe('""');
  return s;
}

for (const mode of ['light', 'dark'] as const) {
  test.describe(`stroke icons (${mode})`, () => {
    test.beforeEach(async ({ context, page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await setColorMode(context, mode);
    });

    test('mail: search bar, list paperclip, folder-actions and list-options menus', async ({ page }) => {
      await login(page);
      const bar = page.locator('#quiet-list-header .searchbar');
      await expectMasked(bar.locator('form'), 'search magnifier');
      await expectMasked(bar.locator('a.unread'), 'search envelope');
      await expectMasked(bar.locator('a.options'), 'search chevron');
      const clip = page.locator('#messagelist tbody tr', { hasText: FIXTURES['with-2-attachments'] }).locator('span.attachment span');
      await expectMasked(clip, 'list paperclip');

      await page.click('#quiet-folder-actions');
      for (const c of ['expunge', 'purge', 'read', 'folders']) {
        const s = await expectMasked(page.locator(`.popover .menu a.${c}`), `folder menu ${c}`);
        expect(s.color, `folder menu ${c} colour`).toBe(SOFT[mode]);
      }
      await page.keyboard.press('Escape');
      await page.click('#quiet-list-options');
      for (const c of ['listoptions', 'select.all', 'select.invert', 'read']) {
        await expectMasked(page.locator(`.popover .menu a.${c.replace('.', '.')}`), `list menu ${c}`);
      }
    });

    test('compose: From pencil, address-book picker, TinyMCE toolbar', async ({ page }) => {
      await login(page);
      await page.goto(`${BASE}/?_task=mail&_action=compose`);
      await expect(page.locator('#compose-subject')).toBeVisible();
      await expectMasked(page.locator('#compose_from .input-group-text.edit'), 'From pencil');
      await expectMasked(page.locator('#compose_to .input-group-text.recipient'), 'address-book picker');
      await page.locator('#quiet-bar-type').selectOption('html');
      await expect(page.locator('.tox-tinymce')).toBeVisible();
      // open the second row ("More") so every button is laid out, then check each icon
      await page.locator('.tox-tinymce .tox-toolbar button[aria-label="More"]').click();
      await expect(page.locator('.tox-tinymce button[aria-label="Source code"]')).toBeVisible();
      const icons = page.locator('.tox-tinymce .tox-toolbar button:visible svg');
      expect(await icons.count()).toBeGreaterThanOrEqual(20);
      const kinds = await icons.evaluateAll((els) => els.map((e) => { const c = getComputedStyle(e); return `${c.fill}|${c.strokeWidth}`; }));
      for (const k of kinds) expect(k, 'toolbar icons are strokes, not fills').toBe('none|1.8px');
    });

    test('Contacts and Settings: toolbar, address books, sections', async ({ page }) => {
      await login(page);
      await page.goto(`${BASE}/?_task=addressbook`);
      await expect(page.locator('#layout-content > .header .toolbar a.create')).toBeVisible();
      for (const c of ['create', 'print', 'delete', 'search', 'import', 'export']) {
        await expectMasked(page.locator(`#layout-content > .header .toolbar a.${c}`), `contacts toolbar ${c}`);
      }
      const ab = await expectMasked(page.locator('#layout-sidebar .listing li.addressbook a'), 'address book');
      expect(ab.color).toBe(SOFT[mode]);
      await page.goto(`${BASE}/?_task=settings`);
      await expect(page.locator('#sections-table tr.general')).toBeVisible();
      for (const c of ['general', 'mailbox', 'mailview', 'compose', 'addressbook', 'folders', 'server', 'encryption']) {
        const s = await expectMasked(page.locator(`#sections-table tr.${c} td.section`), `section ${c}`);
        expect(s.color, `section ${c} colour`).toBe(SOFT[mode]);
      }
      await expectMasked(page.locator('#layout-sidebar li.preferences > a'), 'Preferences');
      await expectMasked(page.locator('#layout-sidebar li.identities > a'), 'Identities');
    });
  });
}

test('1024: the folder-pane toggle is a stroke icon', async ({ page, context }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await setColorMode(context, 'light');
  await login(page);
  await expectMasked(page.locator('#layout-list > .header a.back-sidebar-button'), 'folder toggle');
});

test.describe('Settings has no empty band', () => {
  test.beforeEach(async ({ context, page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setColorMode(context, 'light');
    await login(page);
  });

  test('sections list starts at the top of the card; the content card has no empty header', async ({ page }) => {
    await page.goto(`${BASE}/?_task=settings`);
    await expect(page.locator('#sections-table tr.general')).toBeVisible();
    const list = (await page.locator('#layout-list').boundingBox())!;
    const first = (await page.locator('#sections-table tr.general').boundingBox())!;
    expect(first.y - list.y, 'first section row sits at the card top').toBeLessThanOrEqual(8);
    await expect(page.locator('#layout-list > .header')).toBeHidden();
    await expect(page.locator('#layout-content > .header')).toBeHidden();
  });

  test('headers with a toolbar stay (Contacts, Settings > Folders)', async ({ page }) => {
    await page.goto(`${BASE}/?_task=addressbook`);
    await expect(page.locator('#layout-content > .header')).toBeVisible();
    await expect(page.locator('#layout-content > .header .toolbar a.create')).toBeVisible();
    await page.goto(`${BASE}/?_task=settings&_action=folders`);
    await expect(page.locator('#layout-content > .header .toolbar a.create')).toBeVisible();
  });
});

for (const mode of ['light', 'dark'] as const) {
  test(`Settings form frame sits on the card surface (${mode})`, async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setColorMode(context, mode);
    await login(page);
    await page.goto(`${BASE}/?_task=settings`);
    await page.locator('#sections-table tr.general').click();
    const f = page.frameLocator('#preferences-frame');
    await expect(f.locator('body.formcontainer')).toBeVisible();
    expect(await f.locator('body').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(mode === 'light' ? 'rgb(255, 255, 255)' : 'rgb(37, 38, 40)');
    expect(await page.locator('#layout-content .iframe-wrapper').evaluate((e) => getComputedStyle(e).overflow)).toBe('hidden');
  });
}

test('Settings at 1024: no empty band above the content', async ({ page, context }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await setColorMode(context, 'light');
  await login(page);
  await page.goto(`${BASE}/?_task=settings`);
  await expect(page.locator('#layout-content > .header')).toBeHidden();
  const c = (await page.locator('#layout-content').boundingBox())!;
  const w = (await page.locator('#layout-content .iframe-wrapper').boundingBox())!;
  expect(w.y - c.y).toBeLessThanOrEqual(2);
});
