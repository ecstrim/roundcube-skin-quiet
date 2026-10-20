import { test, expect, type Page } from '@playwright/test';
import { BASE, FIXTURES, login, resetPrefs, setColorMode } from './helpers';

// Visual fix wave, open message: one-row under-actions in the pane, card in full view, one separator style.

const frame = (page: Page) => page.frameLocator('#messagecontframe');

async function openPreview(page: Page, id: string, loggedIn = false) {
  if (!loggedIn) await login(page);
  await page.locator('#messagelist tbody tr', { hasText: FIXTURES[id] }).locator('span.subject').click();
  await expect(frame(page).locator('#quiet-sender-actions')).toBeVisible();
}

async function openFull(page: Page, id: string, loggedIn = false) {
  if (!loggedIn) await login(page);
  const uid = await page.locator('#messagelist tbody tr', { hasText: FIXTURES[id] }).evaluate((tr) => String((tr as any).uid));
  await page.goto(`${BASE}/?_task=mail&_mbox=INBOX&_uid=${uid}&_action=show`);
  await expect(page.locator('#message-header .quiet-meta')).toBeVisible();
}

test.beforeEach(async ({ browser }) => resetPrefs(browser));

test('under-box actions stay on one row at 1440 in the reading pane', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setColorMode(context, 'light');
  let first = true;
  for (const id of ['with-2-attachments', 'plain-short']) {
    await openPreview(page, id, !first);
    first = false;
    const tops = await frame(page).locator('#quiet-under-actions a[role="button"]:visible')
      .evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); }));
    expect(tops.length).toBeGreaterThanOrEqual(6);
    expect(Math.max(...tops) - Math.min(...tops), `${id}: centres ${tops}`).toBeLessThanOrEqual(1);
  }
});

test('More menu in the pane carries Print, Download and Show source; full view keeps them inline', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setColorMode(context, 'light');
  await openPreview(page, 'plain-short');
  const f = frame(page);
  await expect(f.locator('#quiet-u-print')).toBeHidden();
  await f.locator('#quiet-u-more').click();
  const [popup] = await Promise.all([page.waitForEvent('popup'), f.locator('.popover #quiet-m-source, .popover a.source').first().click()]);
  expect(popup.url()).toContain('viewsource');
  await popup.close();
  await openFull(page, 'plain-short', true);
  for (const id of ['print', 'download', 'source']) await expect(page.locator(`#quiet-u-${id}`)).toBeVisible();
  await page.locator('#quiet-u-more').click();
  const names = await page.locator('.popover li:visible a').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
  expect(names).not.toContain('Print');
  expect(names).not.toContain('Show source');
});

for (const mode of ['light', 'dark'] as const) {
  test(`full view is a card inset 8px with radius (${mode})`, async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setColorMode(context, mode);
    await openFull(page, 'plain-short');
    const c = page.locator('#layout-content');
    const b = (await c.boundingBox())!;
    expect(Math.round(b.x + b.width)).toBe(1440 - 8);
    expect(Math.round(b.y)).toBe(8);
    expect(Math.round(b.y + b.height)).toBe(900 - 8);
    expect(await c.evaluate((e) => getComputedStyle(e).borderRadius)).toBe('8px');
    // the card differs from the app background around it
    const [card, app] = await Promise.all([c.evaluate((e) => getComputedStyle(e).backgroundColor), page.locator('body').evaluate((e) => getComputedStyle(e).backgroundColor)]);
    expect(card).not.toBe(app);
  });
}

test('sender line: one separator style, one baseline (1440 pane)', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setColorMode(context, 'light');
  await openPreview(page, 'plain-short');
  const list = await frame(page).locator('.quiet-meta').evaluate((meta) => {
    const els = Array.from(meta.querySelectorAll(':scope > :not(.header-links), :scope > .header-links > a')) as HTMLElement[];
    return els.map((el) => {
      const cs = getComputedStyle(el, '::before');
      return { top: Math.round(el.getBoundingClientRect().top), sep: cs.display !== 'none' && cs.content !== 'none' && cs.content !== 'normal' ? cs.content : '', size: cs.fontSize, color: cs.color, m: cs.marginLeft + '/' + cs.marginRight };
    });
  });
  expect(list.length).toBeGreaterThanOrEqual(4);   // To, date, Details, Headers (+ Plain text)
  expect(list.map((i) => i.top), 'items share one baseline').toEqual(list.map(() => list[0].top));
  expect(list[0].sep).toBe('');
  const seps = list.slice(1);
  for (const s of seps) expect(s.sep).toBe('"·"');
  expect(new Set(seps.map((s) => `${s.size} ${s.color} ${s.m}`)).size).toBe(1);
});

test('sender line on a phone: no separator at a wrapped line edge', async ({ browser, context }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  try {
    await openFull(page, 'with-2-attachments');
    const list = await page.locator('.quiet-meta').evaluate((meta) => {
      const els = Array.from(meta.querySelectorAll(':scope > :not(.header-links), :scope > .header-links > a')) as HTMLElement[];
      return els.map((el) => {
        const cs = getComputedStyle(el, '::before');
        return { top: Math.round(el.getBoundingClientRect().top), sep: cs.display !== 'none' && cs.content !== 'none' && cs.content !== 'normal' };
      });
    });
    expect(new Set(list.map((i) => i.top)).size, 'fixture should wrap at 390px').toBeGreaterThan(1);
    list.forEach((it, i) => {
      if (i === 0 || it.top > list[i - 1].top + 2) expect(it.sep, `item ${i} starts a line`).toBe(false);
      else expect(it.sep, `item ${i} follows on the same line`).toBe(true);
    });
  } finally {
    await ctx.close();
  }
});
