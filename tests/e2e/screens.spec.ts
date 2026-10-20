import { test, expect, type Page } from '@playwright/test';
import { BASE, FIXTURES, login, setColorMode, collectConsoleErrors } from './helpers';

// Contacts, Settings, dialogs and narrow widths: same style as mail, no special layout.

const PANE = { light: 'rgb(255, 255, 255)', dark: 'rgb(37, 38, 40)' };
const bg = (page: Page, sel: string) => page.locator(sel).evaluate((e) => getComputedStyle(e).backgroundColor);
const radius = (loc: ReturnType<Page['locator']>) =>
  loc.evaluate((e) => {
    const t = (e.closest('.popover, .ui-dialog') ?? e) as HTMLElement;
    const c = getComputedStyle(t);
    return [c.borderTopLeftRadius, c.borderTopRightRadius, c.borderBottomLeftRadius, c.borderBottomRightRadius];
  });

test.describe('contacts and settings', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const mode of ['light', 'dark'] as const) {
    test(`contacts and settings render in ${mode} mode with no console errors`, async ({ page, context }) => {
      await setColorMode(context, mode);
      const errors = collectConsoleErrors(page);
      await login(page);
      for (const url of ['?_task=addressbook', '?_task=settings', '?_task=settings&_action=identities']) {
        await page.goto(`${BASE}/${url}`);
        await expect(page.locator('#layout-list')).toBeVisible();
        // same panes as mail: list and content on the pane surface, rounded like the mail panes
        expect(await bg(page, '#layout-list')).toBe(PANE[mode]);
        expect(await bg(page, '#layout-content')).toBe(PANE[mode]);
        expect(await radius(page.locator('#layout-list'))).toEqual(['8px', '0px', '8px', '0px']);
        // side pane is transparent over the app background, like the folder pane
        expect(await bg(page, '#layout-sidebar')).toBe('rgba(0, 0, 0, 0)');
      }
      expect(errors).toEqual([]);
    });
  }

  test('settings and contacts selected row uses the Quiet selection tint', async ({ page, context }) => {
    await setColorMode(context, 'light');
    await login(page);
    await page.goto(`${BASE}/?_task=settings&_action=preferences`);
    await page.locator('#sections-table tr').first().click();
    await expect(page.locator('#sections-table tr.selected td').first()).toBeVisible();
    expect(await page.locator('#sections-table tr.selected td').first().evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(234, 242, 251)');
  });
});

test.describe('dialogs use the card style', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const mode of ['light', 'dark'] as const) {
    test(`all-headers dialog and move-folder selector, ${mode}`, async ({ page, context }) => {
      await setColorMode(context, mode);
      await login(page);
      await page.locator('#messagelist tbody tr', { hasText: FIXTURES['plain-short'] }).locator('span.subject').click();
      const f = page.frameLocator('#messagecontframe');
      await f.locator('#message-header .header-links a.headers-all').click();
      const dlg = page.locator('.ui-dialog:visible');
      await expect(dlg).toBeVisible();
      expect(await radius(dlg)).toEqual(['8px', '8px', '8px', '8px']);
      expect(await dlg.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(PANE[mode]);
      const borderColor = await dlg.evaluate((e) => getComputedStyle(e).borderTopColor);
      expect(borderColor).toBe(mode === 'light' ? 'rgb(223, 224, 226)' : 'rgb(57, 58, 60)');
      await page.keyboard.press('Escape');
      await page.locator('.ui-dialog:visible .ui-dialog-titlebar-close, .ui-dialog:visible button.cancel').first().click({ timeout: 2000 }).catch(() => {});

      await page.goto(`${BASE}/?_task=mail&_mbox=INBOX`);
      await page.locator('#messagelist tbody tr', { hasText: FIXTURES['plain-short'] }).locator('span.subject').click();
      await expect(f.locator('#quiet-sender-actions')).toBeVisible();
      await f.locator('#quiet-under-actions a.move').click();
      const sel = page.locator('#folder-selector');
      await expect(sel).toBeVisible();
      expect(await radius(sel)).toEqual(['8px', '8px', '8px', '8px']);
      expect(await sel.evaluate((e) => getComputedStyle(e.closest('.popover') ?? e).backgroundColor)).toBe(PANE[mode]);
    });
  }
});

test.describe('dialog footer', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // Regression: the jqueryui plugin theme (loaded after the skin) reset the footer to padding 0 / height 4rem,
  // so the buttons sat flush against the content above (visible on the framed About dialog).
  const gaps = (page: Page) => page.locator('.ui-dialog:visible').evaluate((d) => {
    const pane = d.querySelector('.ui-dialog-buttonpane')!.getBoundingClientRect();
    const c = d.querySelector('.ui-dialog-content') as HTMLElement;
    const contentEnd = c.getBoundingClientRect().bottom - parseFloat(getComputedStyle(c).paddingBottom);  // where its text ends
    const btn = d.querySelector('.ui-dialog-buttonpane button')!.getBoundingClientRect();
    return { above: Math.round(btn.top - contentEnd), below: Math.round(pane.bottom - btn.bottom) };
  });

  test('About (framed) and a confirm dialog keep the buttons off the content', async ({ page }) => {
    await login(page);
    await page.evaluate(() => (window as any).UI.about_dialog(document.querySelector('a.about')));
    await expect(page.locator('.ui-dialog:visible .ui-dialog-buttonpane button').first()).toBeVisible();
    const about = await gaps(page);
    expect(about.above, 'About: gap above the buttons').toBeGreaterThanOrEqual(12);
    expect(Math.abs(about.above - about.below), 'About: buttons centred in the footer').toBeLessThanOrEqual(4);
    await page.locator('.ui-dialog:visible .ui-dialog-titlebar-close').click();

    await page.evaluate(() => (window as any).rcmail.confirm_dialog('Footer test', 'delete', () => {}));
    await expect(page.locator('.ui-dialog:visible .ui-dialog-buttonpane button').first()).toBeVisible();
    const confirm = await gaps(page);
    expect(confirm.above, 'confirm: gap above the buttons').toBeGreaterThanOrEqual(12);
    expect(confirm.below, 'confirm: gap below the buttons').toBeGreaterThanOrEqual(12);
  });
});

test.describe('narrow widths', () => {
  test('phone 390px: read, reply, delete, compose reachable', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setColorMode(context, 'light');
    const errors = collectConsoleErrors(page);
    await login(page);
    const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(await noHScroll()).toBe(true);
    // compose reachable from the list view
    await expect(page.locator('#layout-list a.compose, #layout-list .toolbar a.compose, #layout-list a.button.compose').first()).toBeAttached();
    // read: opening a message switches to the content view
    await page.locator('#messagelist tbody tr', { hasText: FIXTURES['plain-short'] }).locator('span.subject').click();
    await expect(page.locator('#messagecontframe')).toBeVisible();
    await expect(page.frameLocator('#messagecontframe').locator('#message-header')).toBeVisible();
    expect(await noHScroll()).toBe(true);
    // reply and delete live behind the header's toolbar button and are tappable inside the viewport
    await page.locator('#layout-content > .header a.toolbar-menu-button').click();
    for (const a of ['reply', 'delete']) {
      const b = page.locator(`.popover #toolbar-menu a.${a}, #toolbar-menu a.${a}`).filter({ visible: true }).first();
      await expect(b).toBeVisible();
      const r = (await b.boundingBox())!;
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(390);
    }
    await page.keyboard.press('Escape');
    // compose opens and fits
    await page.goto(`${BASE}/?_task=mail&_action=compose`);
    await expect(page.locator('#compose-subject')).toBeVisible();
    await expect(page.locator('#composebody')).toBeVisible();
    expect(await noHScroll()).toBe(true);
    expect(errors).toEqual([]);
  });

  test('1024px: layout usable', async ({ page, context }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await setColorMode(context, 'light');
    const errors = collectConsoleErrors(page);
    await login(page);
    const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(await noHScroll()).toBe(true);
    // list and preview side by side
    const list = (await page.locator('#layout-list').boundingBox())!;
    expect(list.width).toBeGreaterThan(200);
    await page.locator('#messagelist tbody tr', { hasText: FIXTURES['plain-short'] }).locator('span.subject').click();
    const frame = page.frameLocator('#messagecontframe');
    await expect(frame.locator('#quiet-sender-actions, #message-header').first()).toBeVisible();
    const content = (await page.locator('#layout-content').boundingBox())!;
    expect(content.width).toBeGreaterThan(300);
    expect(content.x + content.width).toBeLessThanOrEqual(1024 + 1);
    // Elastic's collapsed sidebar: folder list opens from the list header's menu button
    const folders = page.locator('#layout-sidebar');
    const toggle = page.locator('#layout-list a.back-sidebar-button, #layout-list .header a.back-sidebar-button').first();
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(folders).toBeVisible();
    await expect(folders.locator('.folderlist li').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
