import { test, expect, type Page } from '@playwright/test';
import { contrast, login, reseed, resetPrefs, setColorMode } from './helpers';

// Visual fix wave, mail screens: card layout, selected rows, hover actions, folder tree, unread styling, phone list.

const rows = (page: Page) => page.locator('#messagelist tbody tr');
const subjectOf = (page: Page, n: number) => rows(page).nth(n).locator('span.subject');
const idle = (page: Page) => expect.poll(() => page.evaluate(() => !(window as any).rcmail.busy)).toBe(true);
const css = (loc: ReturnType<Page['locator']>, prop: string) => loc.evaluate((e, p) => (getComputedStyle(e) as any)[p] as string, prop);

test.beforeEach(({ browser }) => resetPrefs(browser));

/** The seeded inbox is all unread: flip one row to read in the client only (no server write) so both kinds exist. */
const makeOneRead = (page: Page) => page.evaluate(() => {
  const rc = (window as any).rcmail;
  const uid = Object.keys(rc.message_list.rows)[3];
  rc.set_message(uid, 'unread', false);
});

for (const mode of ['light', 'dark'] as const) {
  for (const width of [1440, 1024]) {
    test(`reading pane is the right half of one card (${width}, ${mode})`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 800 });
      await setColorMode(context, mode);
      await login(page);
      const b = (await page.locator('#layout-content').boundingBox())!;
      expect(Math.round(b.x + b.width)).toBe(width - 8);
      expect(Math.round(b.y)).toBe(8);
      expect(Math.round(b.y + b.height)).toBe(800 - 8);
      expect(await css(page.locator('#layout-content'), 'borderRadius')).toBe('0px 8px 8px 0px');
      const l = (await page.locator('#layout-list').boundingBox())!;
      expect(Math.round(l.x + l.width)).toBe(Math.round(b.x));
      expect(await css(page.locator('#layout-list'), 'borderRadius')).toBe('8px 0px 0px 8px');
    });
  }
}

test('selected row at 1024 keeps its time and the subject ellipsis', async ({ page, context }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await setColorMode(context, 'light');
  await login(page);
  await subjectOf(page, 1).click();
  await idle(page);
  await page.mouse.move(900, 600);
  const tr = rows(page).nth(1);
  const date = (await tr.locator('span.date').boundingBox())!;
  const subj = (await tr.locator('span.subject').boundingBox())!;
  const flags = (await tr.locator('td.flags').boundingBox())!;
  // nothing paints over the time: the flags column neither overlaps it nor has a fill
  const overlap = date.x < flags.x + flags.width && flags.x < date.x + date.width && date.y < flags.y + flags.height && flags.y < date.y + date.height;
  expect(overlap).toBe(false);
  expect(await css(tr.locator('td.flags'), 'backgroundColor')).toBe('rgba(0, 0, 0, 0)');
  expect(await css(tr.locator('td.flags'), 'borderBottomWidth')).toBe('0px');
  // the time text is wholly visible: its box is not clipped by the row
  const rowBox = (await tr.boundingBox())!;
  expect(date.x + date.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
  expect(await tr.locator('span.date').evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  expect(await css(tr.locator('span.subject'), 'textOverflow')).toBe('ellipsis');
  expect(subj.x + subj.width).toBeLessThanOrEqual(flags.x + 1 + (flags.width > 0 ? flags.width : 0));
});

test('all four hover actions are visible and clickable at 1024', async ({ page, context }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await setColorMode(context, 'light');
  await login(page);
  const tr = rows(page).nth(2);
  await tr.hover();
  const btns = tr.locator('.quiet-row-actions button');
  await expect(btns).toHaveCount(4);
  await expect.poll(() => css(tr.locator('.quiet-row-actions'), 'opacity')).toBe('1');
  const rowBox = (await tr.boundingBox())!;
  for (let i = 0; i < 4; i++) {
    const b = (await btns.nth(i).boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 0.5);
    // the button is what a click at its centre would hit (nothing sits on top of it)
    const hit = await btns.nth(i).evaluate((e) => {
      const r = e.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return top === e || e.contains(top);
    });
    expect(hit, `button ${i} is covered`).toBe(true);
  }
});

test.describe('folder tree', () => {
  for (const mode of ['light', 'dark'] as const) {
    test(`subfolders are indented, no top border, no tinted li (${mode})`, async ({ page, context }) => {
      await setColorMode(context, mode);
      await login(page);
      const parent = page.locator('#mailboxlist li.mailbox', { hasText: /^Projects/ }).first();
      const sub = page.locator('#mailboxlist li.mailbox li.mailbox > a').first();
      await expect(sub).toBeVisible();
      const pa = parent.locator('> a');
      const padSub = parseFloat(await css(sub, 'paddingLeft'));
      const padTop = parseFloat(await css(pa, 'paddingLeft'));
      expect(padSub).toBeGreaterThan(padTop + 8);
      const ulBorder = await css(parent.locator('> ul'), 'borderTopWidth');
      expect(ulBorder).toBe('0px');
      expect(await css(sub, 'borderTopWidth')).toBe('0px');
      // selected folder: only the pill is filled; li and its ul have no fill or borders
      const sel = page.locator('#mailboxlist li.mailbox.selected').first();
      expect(await css(sel, 'backgroundColor')).toBe('rgba(0, 0, 0, 0)');
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        expect(await css(sel, `border${side}Width`)).toBe('0px');
        expect(await css(sel.locator('> a'), `border${side}Width`)).toBe('0px');
      }
    });
  }
});

test.describe('multi-select contrast', () => {
  test.beforeEach(() => reseed('main'));
  test.afterAll(() => reseed('main'));
  for (const mode of ['light', 'dark'] as const) {
    test(`sender, subject and time on selected rows are >= 4.5:1 (${mode})`, async ({ page, context }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await setColorMode(context, mode);
      await login(page);
      await subjectOf(page, 0).click();
      await idle(page);
      await subjectOf(page, 2).click({ modifiers: ['Shift'] });
      await expect(page.locator('#quiet-multibar')).toBeVisible();
      await page.mouse.move(1200, 700);
      const bg = await css(rows(page).nth(1).locator('td.subject'), 'backgroundColor');
      for (const sel of ['span.fromto', 'span.subject a', 'span.date']) {
        const fg = await css(rows(page).nth(1).locator(sel), 'color');
        expect(contrast(fg, bg), `${sel} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

test.describe('unread rows', () => {
  for (const mode of ['light', 'dark'] as const) {
    test(`sender bold, subject and time bold accent (${mode})`, async ({ page, context }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await setColorMode(context, mode);
      await login(page);
      await makeOneRead(page);
      const tr = page.locator('#messagelist tbody tr.unread:not(.selected)').nth(1);
      await tr.scrollIntoViewIfNeeded();
      await page.mouse.move(1300, 800);
      const w = async (sel: string) => parseInt(await css(tr.locator(sel), 'fontWeight'), 10);
      expect(await w('span.subject')).toBeGreaterThanOrEqual(600);
      expect(await w('span.subject a')).toBeGreaterThanOrEqual(600);
      expect(await w('span.fromto')).toBeGreaterThanOrEqual(600);
      const accent = mode === 'light' ? 'rgb(23, 105, 178)' : 'rgb(109, 174, 241)';
      expect(await w('span.date')).toBeGreaterThanOrEqual(600);
      expect(await css(tr.locator('span.date'), 'color')).toBe(accent);
      expect(await css(tr.locator('span.subject a'), 'color')).toBe(accent);
      // read rows stay neutral
      const readRow = page.locator('#messagelist tbody tr:not(.unread):not(.selected)').first();
      expect(await css(readRow.locator('span.date'), 'color')).not.toBe(accent);
      expect(await w('span.subject')).toBeGreaterThanOrEqual(600);
    });
  }
});

test.describe('phone list', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  for (const mode of ['light', 'dark'] as const) {
    test(`accent bar and subject on unread only, no hover swap to size (${mode})`, async ({ page, context }) => {
      await setColorMode(context, mode);
      await login(page);
      const accent = mode === 'light' ? 'rgb(23, 105, 178)' : 'rgb(109, 174, 241)';
      await makeOneRead(page);
      const unread = page.locator('#messagelist tbody tr.unread').first();
      expect(await unread.locator('td.subject').evaluate((e) => getComputedStyle(e, '::before').backgroundColor)).toBe(accent);
      expect(await css(unread.locator('span.subject'), 'color')).toBe(accent);
      const glyph = await unread.locator('span.msgicon.status.unread').evaluate((e) => getComputedStyle(e, '::before').content);
      expect(['none', 'normal']).toContain(glyph);
      const read = page.locator('#messagelist tbody tr:not(.unread)').first();
      const content = await read.locator('span.msgicon.status').evaluate((e) => getComputedStyle(e, '::before').content);
      expect(['none', 'normal']).toContain(content);
      // hovering a row keeps the time
      await unread.hover();
      expect(await css(unread.locator('span.date'), 'display')).not.toBe('none');
      expect(await css(unread.locator('span.size'), 'display')).toBe('none');
    });
  }
});

test('phone: subject starts at the same x on read and unread rows', async ({ browser, context }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  try {
    await login(page);
    await makeOneRead(page);
    const x = (sel: string) => page.locator(sel).first().evaluate((e) => Math.round(e.getBoundingClientRect().left));
    const unread = await x('#messagelist tbody tr.unread span.subject');
    const read = await x('#messagelist tbody tr:not(.unread) span.subject');
    expect(read).toBe(unread);
    expect(await x('#messagelist tbody tr.unread span.fromto')).toBe(await x('#messagelist tbody tr:not(.unread) span.fromto'));
  } finally { await ctx.close(); }
});

test('1024: folder-pane button is on the search row, no empty row above it', async ({ page, context }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await setColorMode(context, 'light');
  await login(page);
  const btn = (await page.locator('#layout-list > .header a.back-sidebar-button').boundingBox())!;
  const search = (await page.locator('#quiet-list-header .searchbar').boundingBox())!;
  const list = (await page.locator('#layout-list').boundingBox())!;
  expect(Math.abs((btn.y + btn.height / 2) - (search.y + search.height / 2))).toBeLessThanOrEqual(2);
  expect(btn.x + btn.width).toBeLessThanOrEqual(search.x);
  expect(search.y - list.y).toBeLessThanOrEqual(20);
});
