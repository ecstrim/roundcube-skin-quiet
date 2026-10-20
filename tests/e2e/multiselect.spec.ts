import { test, expect, type Page } from '@playwright/test';
import { BASE, BASE_PLAIN, login, reseed, resetPrefs, setColorMode } from './helpers';

// Multi-select: action bar next to the folder title, "N messages selected" in the reading pane.

test.use({ viewport: { width: 1440, height: 900 } });

const rows = (page: Page) => page.locator('#messagelist tbody tr');
const subjectOf = (page: Page, n: number) => rows(page).nth(n).locator('span.subject');
const bar = (page: Page) => page.locator('#quiet-multibar');
const btn = (page: Page, a: string) => bar(page).locator(`button[data-action="${a}"]`);
const selection = (page: Page) =>
  page.evaluate(() => ((window as any).rcmail.message_list.get_selection(false) as unknown[]).map(String));
const idle = (page: Page) => expect.poll(() => page.evaluate(() => !(window as any).rcmail.busy)).toBe(true);

/** Click row 0 then Shift-click row 2: a range of three. */
async function selectThree(page: Page) {
  await subjectOf(page, 0).click();
  await idle(page);
  await subjectOf(page, 2).click({ modifiers: ['Shift'] });
  await expect(bar(page)).toBeVisible();
}

test.describe('multi-select', () => {
  test.beforeEach(async ({ context }) => { reseed('main'); await setColorMode(context, 'light'); });
  test.afterAll(() => reseed('main'));

  test('shift-click selects range and shows bar with count', async ({ page }) => {
    await login(page);
    await selectThree(page);
    expect(await selection(page)).toHaveLength(3);
    await expect(bar(page)).toContainText('3 selected');
    await expect(page.locator('body')).toHaveClass(/quiet-multi/);
    // selected rows use the multi-select tint (#d0e3f7)
    const bg = await rows(page).nth(1).locator('td.subject').evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg).toBe('rgb(208, 227, 247)');
  });

  test('selected rows use the dark multi-select tint in dark mode', async ({ page, context }) => {
    await setColorMode(context, 'dark');
    await login(page);
    await selectThree(page);
    const bg = await rows(page).nth(1).locator('td.subject').evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg).toBe('rgb(52, 78, 104)');
  });

  test('ctrl-click toggles', async ({ page }) => {
    await login(page);
    await selectThree(page);
    await subjectOf(page, 1).click({ modifiers: ['Control'] });
    await expect(bar(page)).toContainText('2 selected');
    await subjectOf(page, 4).click({ modifiers: ['Control'] });
    await expect(bar(page)).toContainText('3 selected');
    expect(await selection(page)).toHaveLength(3);
  });

  test('bar has Delete (labelled), Archive, Flag, Mark read, Move, clear', async ({ page }) => {
    await login(page);
    await selectThree(page);
    await expect(btn(page, 'delete')).toHaveText(/Delete/);
    for (const a of ['archive', 'flag', 'read', 'move', 'clear']) await expect(btn(page, a)).toBeVisible();
    for (const a of ['archive', 'flag', 'read', 'move', 'clear'])
      expect(await btn(page, a).getAttribute('aria-label')).toBeTruthy();
  });

  test('no Archive button without the archive plugin', async ({ page }) => {
    await login(page, BASE_PLAIN);
    await selectThree(page);
    await expect(btn(page, 'delete')).toBeVisible();
    await expect(btn(page, 'archive')).toHaveCount(0);
  });

  test('hover actions hidden while >1 selected', async ({ page }) => {
    await login(page);
    await selectThree(page);
    await rows(page).nth(4).hover();
    const shown = await rows(page).nth(4).locator('.quiet-row-actions').evaluate((g) => getComputedStyle(g).display);
    expect(shown).toBe('none');
  });

  test('reading pane shows "3 messages selected"', async ({ page }) => {
    await login(page);
    await selectThree(page);
    const empty = page.locator('#quiet-multi-empty');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('3 messages selected');
    await expect(page.locator('#messagecontframe')).toBeHidden();
  });

  test('flag and mark read act on all selected', async ({ page }) => {
    await login(page);
    await selectThree(page);
    const sel = await selection(page);
    const state = (key: string) => page.evaluate(([s, k]) =>
      (s as string[]).map((u) => !!(window as any).rcmail.message_list.rows[u][k as string]), [sel, key]);
    await btn(page, 'flag').click();
    await expect.poll(() => state('flagged')).toEqual([true, true, true]);
    expect(await selection(page)).toHaveLength(3);
    await btn(page, 'flag').click();
    await expect.poll(() => state('flagged')).toEqual([false, false, false]);
    await btn(page, 'read').click();
    await expect.poll(() => state('unread')).toEqual([false, false, false]);
  });

  test('delete removes all selected', async ({ page }) => {
    await login(page);
    const count = () => page.evaluate(() => Object.keys((window as any).rcmail.message_list.rows).length);
    const before = await count();
    await selectThree(page);
    await btn(page, 'delete').click();
    await expect.poll(count).toBe(before - 3);
    await expect(bar(page)).toBeHidden();
  });

  test('clear (x) empties selection and hides bar', async ({ page }) => {
    await login(page);
    await selectThree(page);
    await btn(page, 'clear').click();
    expect(await selection(page)).toHaveLength(0);
    await expect(bar(page)).toBeHidden();
    await expect(page.locator('#quiet-multi-empty')).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/quiet-multi/);
  });

  test('single selection hides bar and opens message', async ({ page }) => {
    await login(page);
    await selectThree(page);
    await subjectOf(page, 1).click();
    await expect(bar(page)).toBeHidden();
    await expect(page.locator('#messagecontframe')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).rcmail.preview_id !== undefined)).toBe(true);
    await expect(page.locator('#quiet-list-header .quiet-folder-title')).toBeVisible();
  });
});

test('move opens the folder selector', async ({ page, context }) => {
  reseed('main');
  await setColorMode(context, 'light');
  await login(page);
  await selectThree(page);
  await btn(page, 'move').click();
  await expect(page.locator('#folder-selector')).toBeVisible();
  await page.screenshot({ path: 'test-results/multi-move.png' });
});

test('select all (all pages) shows the folder total', async ({ page, context, browser }) => {
  reseed('main');
  await resetPrefs(browser);
  await setColorMode(context, 'light');
  await login(page);
  const setPageSize = async (n: number) => {
    await page.goto(`${BASE}/?_task=settings&_action=edit-prefs&_section=mailbox&_framed=1`);
    await page.fill('input[name="_mail_pagesize"]', String(n));
    await Promise.all([page.waitForLoadState('load'), page.evaluate(() => (document.querySelector('form') as HTMLFormElement).submit())]);
  };
  await setPageSize(10);
  try {
    await page.goto(`${BASE}/?_task=mail&_mbox=INBOX`);
    await expect(rows(page).first()).toBeVisible();
    const total = await page.evaluate(() => parseInt((window as any).rcmail.env.messagecount, 10));
    expect(total).toBeGreaterThan(10);
    await page.evaluate(() => (window as any).rcmail.command('select-all', ''));
    await expect(bar(page)).toContainText(`${total} selected`);
    await expect(page.locator('#quiet-multi-empty')).toContainText(`${total} messages selected`);
    // not all rows are loaded, so Flag cannot know they are all flagged: it flags
    expect(await btn(page, 'flag').getAttribute('aria-label')).toBe('Flag');
    // a plain page-select drops back to the loaded count
    await page.evaluate(() => (window as any).rcmail.command('select-all', 'page'));
    await expect(bar(page)).toContainText('10 selected');
  } finally {
    await setPageSize(50);
  }
});
