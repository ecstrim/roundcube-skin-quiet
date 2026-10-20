import { test, expect, type Page } from '@playwright/test';
import { login, resetPrefs, setColorMode } from './helpers';

test.use({ viewport: { width: 1440, height: 900 } });
// The shared test user's sort/threads prefs persist across specs: start each test from defaults.
test.beforeEach(({ browser }) => resetPrefs(browser));

type Opts = { sortCol?: string; sortOrd?: string; mode?: 'list' | 'threads' };

/** Open List options from the Quiet menu, set the given fields in the dialog and save. */
async function setListOptions(page: Page, o: Opts) {
  await openListOptionsDialog(page);
  const dialog = page.locator('.ui-dialog:visible');
  if (o.sortCol !== undefined) await dialog.locator('select[name="sort_col"]').selectOption(o.sortCol);
  if (o.sortOrd !== undefined) await dialog.locator('select[name="sort_ord"]').selectOption(o.sortOrd);
  if (o.mode !== undefined) await dialog.locator('select[name="mode"]').selectOption(o.mode);
  await dialog.locator('.ui-dialog-buttonpane button.mainaction').click();
  await expect(page.locator('.ui-dialog:visible')).toHaveCount(0);
}

/** Open the List options dialog from the Quiet menu. A click that lands while a closing dialog or popover is still
 *  fading out can leave the menu shut or its item unclickable, so the open is retried (bounded). */
async function openListOptionsDialog(page: Page) {
  await expect(page.locator('.ui-dialog:visible')).toHaveCount(0);
  await expect(page.locator('.popover')).toHaveCount(0);
  const item = page.locator('#quiet-list-options-menu a.listoptions');
  await expect(async () => {
    if (!(await item.isVisible())) await page.click('#quiet-list-options');
    await item.click({ timeout: 2000 });
    await expect(page.locator('.ui-dialog:visible')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
}

const env = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).rcmail.env;
    return { col: e.sort_col || '', ord: e.sort_order || 'ASC', threads: !!e.threads, threading: !!e.threading };
  });

test('title shows current folder name', async ({ page, context }) => {
  await setColorMode(context, 'light');
  await login(page);
  const title = page.locator('#quiet-list-header .quiet-folder-title');
  await expect(title).toBeVisible();
  await expect(title).toHaveText('Inbox');
});

test('search above title', async ({ page }) => {
  await login(page);
  const search = await page.locator('#quiet-list-header #mailsearchform').boundingBox();
  const title = await page.locator('#quiet-list-header .quiet-folder-title').boundingBox();
  expect(search).not.toBeNull();
  expect(title).not.toBeNull();
  expect(search!.y + search!.height).toBeLessThanOrEqual(title!.y + 1);
  // filter sits beside the title, options button after it, multibar slot exists
  await expect(page.locator('#quiet-list-header #searchfilter')).toBeVisible();
  await expect(page.locator('#quiet-list-header #quiet-list-options')).toBeVisible();
  await expect(page.locator('#quiet-list-header #quiet-multibar')).toHaveCount(1);
  const w = await page.locator('#layout-list').evaluate((e) => e.getBoundingClientRect().width);
  expect(w).toBeGreaterThan(330);
  expect(w).toBeLessThan(400);
});

test('filter select narrows the list to unread', async ({ page }) => {
  await login(page);
  await page.locator('#searchfilter').selectOption({ label: 'Unread' });
  await expect.poll(() => page.evaluate(() =>
    Array.from(document.querySelectorAll('#messagelist tbody tr')).every((r) => r.classList.contains('unread')))).toBe(true);
  await page.locator('#searchfilter').selectOption({ label: 'All' });
});

test('list options menu controls sorting and threads', async ({ page }) => {
  await login(page);
  await page.click('#quiet-list-options');
  const menu = page.locator('#quiet-list-options-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByText('Mark all as read')).toBeVisible();
  await page.keyboard.press('Escape');
  // let the popover finish closing: reopening it mid-fade leaves its items unclickable for Playwright
  await expect(menu).toBeHidden();
  await expect(page.locator('.popover')).toHaveCount(0);

  const before = await env(page);
  try {
    // Sorting through the reused Elastic dialog.
    await setListOptions(page, { sortCol: 'subject', sortOrd: 'DESC' });
    await expect.poll(() => env(page).then((e) => `${e.col}/${e.ord}`)).toBe('subject/DESC');
    // Threads: the dialog only offers the choice when the IMAP server has THREAD
    // (the GreenMail dev server does not), so this part runs only where it is available.
    if (before.threads) {
      await setListOptions(page, { mode: 'threads' });
      await expect.poll(() => env(page).then((e) => e.threading)).toBe(true);
    } else {
      await openListOptionsDialog(page);
      await expect(page.locator('.ui-dialog:visible select[name="mode"]')).toHaveCount(0);
      await page.locator('.ui-dialog:visible .ui-dialog-buttonpane button:not(.mainaction)').click();
      await expect(page.locator('.ui-dialog:visible')).toHaveCount(0);
    }
  } finally {
    // Restore through Roundcube's own call (the UI path is what the test covers above; reopening the dialog
    // just to undo it raced the closing dialog and hung the cleanup).
    await page.evaluate(([c, o]) => (window as any).rcmail.set_list_options(null, c, o, 0), [before.col, before.ord]);
    await expect.poll(() => env(page).then((e) => `${e.col}/${e.ord}/${e.threading}`)).toBe(`${before.col}/${before.ord}/false`);
  }
});

test('select all via list options menu', async ({ page }) => {
  await login(page);
  await page.click('#quiet-list-options');
  await page.locator('#quiet-list-options-menu a.select.all').click();
  const n = await page.evaluate(() => (window as any).rcmail.message_list.get_selection().length);
  expect(n).toBeGreaterThan(1);
});

test('unread row has bold accent subject and left accent bar', async ({ page, context }) => {
  await setColorMode(context, 'light');
  await login(page);
  const row = page.locator('#messagelist tbody tr.unread:not(.selected)').first();
  await expect(row).toBeVisible();
  const subj = await row.locator('span.subject').first().evaluate((e) => {
    const c = getComputedStyle(e);
    return { weight: parseInt(c.fontWeight, 10), color: c.color };
  });
  expect(subj.weight).toBeGreaterThanOrEqual(600);
  expect(subj.color).toBe('rgb(23, 105, 178)');
  const bar = await row.locator('td.subject').evaluate((e) => {
    const c = getComputedStyle(e, '::before');
    return { content: c.content, bg: c.backgroundColor, w: c.width, left: c.left };
  });
  expect(bar.content).not.toBe('none');
  expect(bar.bg).toBe('rgb(23, 105, 178)');
  expect(parseFloat(bar.w)).toBe(3);
  expect(bar.left).toBe('0px');
});

test('elastic top toolbar hidden at 1440px', async ({ page }) => {
  await login(page);
  await expect(page.locator('#toolbar-menu')).toBeHidden();
  await expect(page.locator('#layout-content > .header')).toBeHidden();
  // still in the DOM so small screens keep it
  await expect(page.locator('#layout-content > .header #toolbar-menu')).toHaveCount(1);
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 400, height: 800 } });
  test('top toolbar stays available', async ({ page }) => {
    await login(page);
    await expect(page.locator('#layout-list #messagelist-header')).toBeVisible();
    await expect(page.locator('#layout-list a.task-menu-button')).toBeVisible();
    await expect(page.locator('#layout-list #mailsearchform')).toBeVisible();
    // the content header (with the message toolbar) is not display:none by Quiet
    const d = await page.locator('#layout-content > .header').evaluate((e) => getComputedStyle(e).display);
    expect(d).not.toBe('none');
  });
});

test.describe('Quiet list rules are scoped to the mail list page', () => {
  const toolbarVisible = (page: Page, sel: string) =>
    page.locator(sel).evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).length);

  test('settings and contacts keep their toolbars and list width', async ({ page }) => {
    await login(page);
    for (const url of ['/?_task=settings&_action=identities', '/?_task=addressbook']) {
      await page.goto(url);
      await expect(page.locator('#layout-content > .header')).toBeVisible();
      expect(await toolbarVisible(page, '#layout-content > .header a.button:not(.back-list-button), #layout-content > .header .toolbar a')).toBeGreaterThan(0);
      const w = await page.locator('#layout-list').evaluate((e) => e.getBoundingClientRect().width);
      expect(w).not.toBe(360);
      await expect(page.locator('#quiet-list-header')).toHaveCount(0);
    }
  });

  test('full message view: elastic toolbar is replaced by Quiet actions on desktop, kept on phones', async ({ page }) => {
    await login(page);
    await page.locator('#messagelist tbody tr').first().dblclick();
    await expect(page).toHaveURL(/_action=show/);
    // Task 8: the reading actions live in the message itself at desktop widths
    await expect(page.locator('#layout-content > .header')).toBeHidden();
    await expect(page.locator('#quiet-sender-actions')).toBeVisible();
    await page.setViewportSize({ width: 400, height: 800 });
    await expect(page.locator('#layout-content > .header')).toBeVisible();
    expect(await toolbarVisible(page, '#layout-content > .header #toolbar-menu, #layout-content > .header .toolbar a, #layout-content > .header a.button:not(.back-list-button)')).toBeGreaterThan(0);
  });
});
