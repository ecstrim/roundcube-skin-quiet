import { test, expect, type Page } from '@playwright/test';
import { BASE, login, setColorMode } from './helpers';

// Contacts/Settings toolbars, error page, generated icons and the phone menu (follow-up pass after the screen sweep).

const box = (page: Page, sel: string, pseudo?: string) =>
  page.locator(sel).first().evaluate((e, p) => {
    const r = e.getBoundingClientRect();
    if (!p) return { x: r.x, y: r.y, w: r.width, h: r.height };
    const c = getComputedStyle(e, p);
    return { x: r.x, y: r.y, w: parseFloat(c.width) || 0, h: parseFloat(c.height) || 0 };
  }, pseudo);

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Contacts toolbar: icon beside its label, one row', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/?_task=addressbook`);
    const create = page.locator('#layout-content > .header .toolbar a.create');
    await expect(create).toBeVisible();
    const tops = await page.locator('#layout-content > .header .toolbar a:not(.dropdown):visible')
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size, `tops ${tops}`).toBe(1);
    const a = await box(page, '#layout-content > .header .toolbar a.create');
    const label = await box(page, '#layout-content > .header .toolbar a.create span.inner');
    expect(a.h).toBeLessThanOrEqual(34);              // not Elastic's tall stacked button
    expect(label.x).toBeGreaterThan(a.x + 18);        // label sits right of the icon, not under it
  });

  test('sidebar and folder-list icons have a real box (no zero-height glyphs)', async ({ page }) => {
    await login(page);
    expect((await box(page, '#layout-sidebar .folderlist li.inbox > a', '::before')).h).toBeGreaterThan(10);
    await page.goto(`${BASE}/?_task=addressbook`);
    expect((await box(page, '#layout-sidebar .listing.iconized li.addressbook a', '::before')).h).toBeGreaterThan(10);
    await page.goto(`${BASE}/?_task=settings`);
    expect((await box(page, '#layout-sidebar .listing.iconized li.preferences > a', '::before')).h).toBeGreaterThan(10);
  });

  for (const mode of ['light', 'dark'] as const) {
    test(`error page is a card with a Back button (${mode})`, async ({ page, context }) => {
      await setColorMode(context, mode);
      await login(page);
      await page.goto(`${BASE}/?_task=mail&_action=show&_uid=999999&_mbox=INBOX`);
      const card = page.locator('.boxerror');
      await expect(card).toBeVisible();
      await expect(page.locator('#layout-content > .header')).toBeHidden();
      const w = (await card.boundingBox())!.width;
      expect(w).toBeLessThanOrEqual(560);
      const back = card.locator('a.quiet-error-back');
      await expect(back).toHaveText('Back');
      await back.click();
      await expect(page).not.toHaveURL(/_uid=999999/);
    });
  }
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('off-canvas menu: colour swatches visible, account button hidden, icons on the label line', async ({ page }) => {
    await login(page);
    await page.locator('a.task-menu-button').first().click();
    const swatches = page.locator('.quiet-schemes button[data-scheme]');
    await expect(swatches).toHaveCount(4);
    for (const b of await swatches.all()) {
      const r = (await b.boundingBox())!;
      expect(r.width).toBeGreaterThanOrEqual(20);
      expect(r.height).toBeLessThanOrEqual(26);
    }
    await expect(page.locator('#quiet-account')).toBeHidden();
    const link = page.locator('#taskmenu a.contacts');
    const lr = (await link.boundingBox())!;
    const ic = await link.evaluate((e) => ({ h: parseFloat(getComputedStyle(e, '::before').height) }));
    expect(ic.h).toBeGreaterThan(lr.height * 0.5);    // the icon box spans the row, so the centred icon meets the text
  });
});
