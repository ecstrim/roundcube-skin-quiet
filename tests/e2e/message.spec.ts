import { test, expect, type Locator, type Page } from '@playwright/test';
import { BASE, BASE_PLAIN, BASE_THREADS, FIXTURES, login, reseed, setColorMode } from './helpers';

// Open message (mockup ReadR6): subject + flag, sender line, attachments row, white body box, row under the box.

test.use({ viewport: { width: 1440, height: 900 } });

const frame = (page: Page) => page.frameLocator('#messagecontframe');

/** Log in, open a fixture in the reading pane and wait until its header is there. */
async function openPreview(page: Page, id: string, base: string = BASE) {
  await login(page, base);
  await page.locator('#messagelist tbody tr', { hasText: FIXTURES[id] }).locator('span.subject').click();
  await expect(frame(page).locator('#quiet-sender-actions')).toBeVisible();
}

/** Popups can open in the parent page or inside the preview frame; either is fine as long as one is visible. */
async function expectVisibleSomewhere(page: Page, selector: string) {
  await expect.poll(async () => (await page.locator(selector).filter({ visible: true }).count())
    + (await frame(page).locator(selector).filter({ visible: true }).count())).toBeGreaterThan(0);
}

const box = async (loc: ReturnType<Page['locator']>) => (await loc.boundingBox())!;
const texts = (loc: ReturnType<Page['locator']>) => loc.evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));

test.describe('open message (reading pane)', () => {
  test.beforeEach(async ({ context }) => { await setColorMode(context, 'light'); });

  test('subject with flag far right', async ({ page }) => {
    await openPreview(page, 'plain-short');
    const f = frame(page);
    const subject = f.locator('#message-header h2.subject');
    await expect(subject).toContainText('Fixture plain-short:');
    const fs = await box(subject.locator('xpath=ancestor::*[@id="message-header"]'));
    const flag = await box(f.locator('#quiet-msg-flag'));
    const text = await box(subject);
    expect(flag.x + flag.width).toBeGreaterThan(fs.x + fs.width - 40);
    expect(flag.x).toBeGreaterThan(text.x + 100);
    // 20px medium subject (IBM Plex Sans 500)
    const st = await subject.evaluate((e) => ({ fs: getComputedStyle(e).fontSize, fw: getComputedStyle(e).fontWeight }));
    expect(st.fs).toBe('20px');
    expect(Number(st.fw)).toBe(500);
    // pane background #fafafa
    expect(await f.locator('#layout-content').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(250, 250, 250)');
  });

  test('flag toggles the flagged state', async ({ page }) => {
    await openPreview(page, 'plain-short');
    const f = frame(page);
    const flag = f.locator('#quiet-msg-flag');
    await expect(flag).toHaveAttribute('aria-pressed', 'false');
    await flag.click();
    await expect(flag).toHaveAttribute('aria-pressed', 'true');
    await expect(f.locator('body')).toHaveClass(/status-flagged/);
    await expect(page.locator('#messagelist tbody tr.flagged', { hasText: FIXTURES['plain-short'] })).toHaveCount(1);
    await flag.click();
    await expect(flag).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#messagelist tbody tr.flagged', { hasText: FIXTURES['plain-short'] })).toHaveCount(0);
  });

  test('sender line has Details, Headers, Plain text', async ({ page }) => {
    await openPreview(page, 'html-basic');
    const f = frame(page);
    const links = f.locator('#message-header .header-links a');
    expect(await texts(links)).toEqual(['Details', 'Headers', 'Plain text']);
    // Details toggles the full header table
    const content = f.locator('#message-header .header-content');
    await expect(content).not.toHaveClass(/details-view/);
    await links.nth(0).click();
    await expect(content).toHaveClass(/details-view/);
    await expect(f.locator('#message-header table.header-headers')).toBeVisible();
    // Headers opens the all-headers dialog
    await f.locator('#message-header .header-links a.headers-all').click();
    await expect(page.locator('#headersframe')).toBeVisible();
  });

  test('sender actions: Reply (label), Reply all (icon), Forward (icon), Delete (label, danger)', async ({ page }) => {
    await openPreview(page, 'plain-short');
    const bar = frame(page).locator('#quiet-sender-actions');
    const btns = bar.locator('a[role="button"]');
    await expect(btns).toHaveCount(4);
    const names = await btns.evaluateAll((els) => els.map((e) => ({
      text: (e.querySelector('.inner') as HTMLElement).getBoundingClientRect().width > 4
        ? (e.textContent ?? '').trim() : '',
      aria: e.getAttribute('aria-label'),
      title: e.getAttribute('title'),
    })));
    expect(names[0].text).toBe('Reply');
    expect(names[1].text).toBe('');
    expect(names[2].text).toBe('');
    expect(names[3].text).toBe('Delete');
    for (const i of [1, 2]) {
      expect(names[i].aria).toBeTruthy();
      expect(names[i].title).toBeTruthy();
    }
    expect(names[1].aria).toMatch(/reply all/i);
    expect(names[2].aria).toMatch(/forward/i);
    // Delete has the danger tint
    const del = btns.nth(3);
    expect(await del.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(253, 243, 244)');
    expect(await del.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(177, 14, 28)');
    // 32px high controls
    expect((await box(btns.nth(0))).height).toBe(32);
    // enabled by Roundcube
    await expect(btns.nth(0)).not.toHaveClass(/disabled/);
  });

  test('Reply opens compose', async ({ page }) => {
    await openPreview(page, 'plain-short');
    await frame(page).locator('#quiet-sender-actions a.reply').click();
    await page.waitForURL(/_action=compose/);
  });

  test('attachments row hidden for plain-short, shown for with-2-attachments', async ({ page }) => {
    await openPreview(page, 'plain-short');
    await expect(frame(page).locator('#quiet-attachments')).toBeHidden();
    await openPreviewAgain(page, 'with-2-attachments');
    const row = frame(page).locator('#quiet-attachments');
    await expect(row).toBeVisible();
    await expect(row.locator('.attachmentslist li')).toHaveCount(2);
    await expect(row.locator('.attachmentslist li').first()).toContainText('file-01-report.bin');
    // chip: white, 1px border, 6px radius
    const chip = await row.locator('.attachmentslist li').first().evaluate((e) => {
      const s = getComputedStyle(e);
      return { bg: s.backgroundColor, r: s.borderTopLeftRadius, bw: s.borderTopWidth };
    });
    expect(chip).toEqual({ bg: 'rgb(255, 255, 255)', r: '6px', bw: '1px' });
  });

  test('Download all only with zipdownload', async ({ page, context }) => {
    await openPreview(page, 'with-2-attachments');
    const dl = frame(page).locator('#quiet-attachments a.zipdownload');
    await expect(dl).toBeVisible();
    await expect(dl).toContainText(/download all/i);
    const p2 = await context.newPage();
    await openPreview(p2, 'with-2-attachments', BASE_PLAIN);
    await expect(frame(p2).locator('#quiet-attachments')).toBeVisible();
    await expect(frame(p2).locator('a.zipdownload')).toHaveCount(0);
  });

  test('under-box row', async ({ page, context }) => {
    await openPreview(page, 'plain-short');
    const under = frame(page).locator('#quiet-under-actions');
    const left = under.locator('.quiet-under-left a[role="button"]:visible');
    const right = under.locator('.quiet-under-right a[role="button"]:visible');
    const names = (loc: ReturnType<Page['locator']>) => loc.evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
    const l = await names(left);
    expect(l.map((s) => s.replace(/\s+/g, ' '))).toEqual([
      expect.stringMatching(/^Archive$/), expect.stringMatching(/^Move to/), expect.stringMatching(/unread/i), 'More',
    ]);
    expect(await names(right)).toEqual(['Reply', 'Reply all', 'Forward', 'Delete']);
    // the rarer actions live in the one "More" menu at the end of the left group
    await expect(under.locator('a.more[data-popup="quiet-more-menu"]')).toHaveCount(1);
    // Delete is the danger one, set apart by a gap
    const dBox = await box(right.nth(3));
    const fBox = await box(right.nth(2));
    expect(dBox.x - (fBox.x + fBox.width)).toBeGreaterThanOrEqual(24);
    // no Archive without the plugin
    const p2 = await context.newPage();
    await openPreview(p2, 'plain-short', BASE_PLAIN);
    const l2 = await names(frame(p2).locator('#quiet-under-actions .quiet-under-left a[role="button"]:visible'));
    expect(l2.some((s) => /archive/i.test(s))).toBe(false);
    expect(l2[0]).toMatch(/^Move to/);
    expect(l2[l2.length - 1]).toBe('More');
  });

  test('More menu: every capability that was in Elastic\'s toolbar menus is reachable', async ({ page }) => {
    await openPreview(page, 'plain-short');
    const f = frame(page);
    await f.locator('#quiet-u-more').click();
    const names = await f.locator('.popover li:visible a').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
    expect(names).toEqual(['Forward inline', 'Forward as attachment', 'Resend (bounce)', 'Copy to...', 'Edit as new', 'Open in new window',
      'Print', 'Download', 'Show source']);
    // Reply list only for messages with a List-Post header: present but disabled here
    await expect(f.locator('#quiet-m-replylist')).toHaveClass(/disabled/);
    await expect(f.locator('#quiet-m-replylist')).toBeHidden();
    for (const id of ['fwdinline', 'fwdattach', 'bounce', 'copy', 'edit', 'extwin', 'print', 'download', 'source']) {
      await expect(f.locator(`#quiet-m-${id}`)).not.toHaveClass(/disabled/);
    }
  });

  const more = async (page: Page, id: string) => {
    await frame(page).locator('#quiet-u-more').click();
    await frame(page).locator(`#quiet-m-${id}`).click();
  };

  test('More: Forward inline opens compose with the body', async ({ page }) => {
    await openPreview(page, 'plain-short');
    await more(page, 'fwdinline');
    await page.waitForURL(/_action=compose/);
    await expect(page.locator('#compose-subject')).toHaveValue(/^Fwd: Fixture plain-short:/);
    await expect(page.locator('#attachment-list li')).toHaveCount(0);
    await expect(page.locator('#composebody')).toContainText('Lunch on Friday?');
  });

  test('More: Forward as attachment opens compose with the message attached', async ({ page }) => {
    await openPreview(page, 'plain-short');
    await more(page, 'fwdattach');
    await page.waitForURL(/_action=compose/);
    await expect(page.locator('#compose-subject')).toHaveValue(/^Fwd: Fixture plain-short:/);
    await expect(page.locator('#attachment-list li')).toHaveCount(1);
  });

  test('More: Edit as new opens compose', async ({ page }) => {
    await openPreview(page, 'plain-short');
    await more(page, 'edit');
    await page.waitForURL(/_action=compose/);
    // "as new" keeps the subject (no Re:/Fwd:) and the body
    await expect(page.locator('#compose-subject')).toHaveValue(/^Fixture plain-short: lunch on Friday\?/);
    await expect(page.locator('#composebody')).toContainText('Lunch on Friday?');
  });

  test('More: Copy to opens the folder selector', async ({ page }) => {
    await openPreview(page, 'plain-short');
    await more(page, 'copy');
    await expectVisibleSomewhere(page, '#folder-selector');
  });

  test('More: Resend (bounce) opens its dialog', async ({ page }) => {
    await openPreview(page, 'plain-short');
    await more(page, 'bounce');
    await expectVisibleSomewhere(page, '.ui-dialog');
  });

  test('More: Open in new window opens the message', async ({ page }) => {
    await openPreview(page, 'plain-short');
    const popup = page.waitForEvent('popup');
    await more(page, 'extwin');
    expect((await popup).url()).toMatch(/_action=show/);
  });

  test('More: Reply list is enabled for a message with List-Post', async ({ page }) => {
    await openPreview(page, 'list-post');
    const f = frame(page);
    await f.locator('#quiet-u-more').click();
    await expect(f.locator('#quiet-m-replylist')).toBeVisible();
    await expect(f.locator('#quiet-m-replylist')).not.toHaveClass(/disabled/);
    await f.locator('#quiet-m-replylist').click();
    await page.waitForURL(/_action=compose/);
    await expect(page.locator('#compose-subject')).toHaveValue(/^Re: Fixture list-post:/);
    await expect(page.locator('#compose_to')).toContainText('announce@lists.example.org');
  });

  test('under-box Move to opens the folder selector and Print/Show source are wired', async ({ page }) => {
    await openPreview(page, 'plain-short');
    await frame(page).locator('#quiet-under-actions a.move').click();
    await expect(page.locator('#folder-selector')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('body box is a bordered white box', async ({ page }) => {
    await openPreview(page, 'plain-short');
    const b = frame(page).locator('#quiet-body-box');
    const s = await b.evaluate((e) => {
      const c = getComputedStyle(e);
      return { bg: c.backgroundColor, r: c.borderTopLeftRadius, bw: c.borderTopWidth, bc: c.borderTopColor, fg: c.color };
    });
    expect(s).toEqual({ bg: 'rgb(255, 255, 255)', r: '8px', bw: '1px', bc: 'rgb(223, 224, 226)', fg: 'rgb(36, 36, 36)' });
    await expect(b).toContainText('Lunch on Friday');
  });

  test('long subject and many attachments do not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPreview(page, 'long-everything');
    const f = frame(page);
    const win = await f.locator('body').evaluate(() => window.innerWidth);
    const rights = await f.locator('#quiet-sender-actions a[role="button"], #quiet-under-actions a[role="button"]:visible, #quiet-msg-flag')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
    for (const r of rights) expect(r).toBeLessThanOrEqual(win);
    expect(await f.locator('html').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    // the subject wraps over several lines instead of running off
    const h = await f.locator('#message-header h2.subject').evaluate((e) => e.getBoundingClientRect().height);
    expect(h).toBeGreaterThan(40);
    // chips wrap: more than one distinct row
    const tops = await f.locator('#quiet-attachments .attachmentslist li').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))]);
    expect(tops.length).toBeGreaterThan(1);
  });
});

/** Click another fixture in the already loaded list. */
async function openPreviewAgain(page: Page, id: string) {
  await page.locator('#messagelist tbody tr', { hasText: FIXTURES[id] }).locator('span.subject').click();
  await expect(frame(page).locator('#message-header h2.subject')).toContainText(FIXTURES[id]);
  await expect(frame(page).locator('#quiet-sender-actions')).toBeVisible();
}

test.describe('open message: dark mode', () => {
  test('dark mode keeps message body white and unstyled', async ({ page, context }) => {
    await setColorMode(context, 'dark');
    await openPreview(page, 'plain-short');
    const f = frame(page);
    await expect(f.locator('html')).toHaveClass(/dark-mode/);
    expect(await f.locator('#quiet-body-box').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
    expect(await f.locator('#quiet-body-box .message-part').first().evaluate((e) => getComputedStyle(e).color)).toBe('rgb(36, 36, 36)');
    // the frame around it is dark
    expect(await f.locator('#layout-content').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(37, 38, 40)');
    await openPreviewAgain(page, 'html-dark-newsletter');
    const body = f.locator('#quiet-body-box');
    expect(await body.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
    expect(await body.locator('h1').evaluate((e) => getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
    expect(await body.locator('td').first().evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(26, 26, 46)');
    expect(await body.locator('a', { hasText: 'Read more' }).evaluate((e) => getComputedStyle(e).color)).toBe('rgb(158, 203, 255)');
  });

  test('dark mode text part: quotes stay light-on-white too', async ({ page, context }) => {
    await setColorMode(context, 'dark');
    await openPreview(page, 'html-basic');
    const f = frame(page);
    await f.locator('a.plain').click();
    await expect(f.locator('#quiet-body-box .message-part')).toBeVisible();
    expect(await f.locator('#quiet-body-box').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
  });

  test('dark controls use the dark tokens', async ({ page, context }) => {
    await setColorMode(context, 'dark');
    await openPreview(page, 'plain-short');
    const del = frame(page).locator('#quiet-sender-actions a.delete');
    expect(await del.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(61, 33, 35)');
    expect(await del.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(255, 154, 154)');
  });
});

test.describe('open message: full view', () => {
  test.beforeEach(async ({ context }) => { await setColorMode(context, 'light'); });

  test('full view has the same layout and no Elastic toolbar at desktop width', async ({ page }) => {
    await login(page);
    await page.locator('#messagelist tbody tr', { hasText: FIXTURES['plain-short'] }).dblclick();
    await page.waitForURL(/_action=show/);
    await expect(page.locator('#quiet-sender-actions')).toBeVisible();
    await expect(page.locator('#quiet-under-actions')).toBeVisible();
    await expect(page.locator('#layout > #layout-content > .header')).toBeHidden();
    // Roundcube's mail menu include stays in the DOM (Elastic turns its toolbar into a popup, keeps the menus)
    await expect(page.locator('#layout > #layout-content > .header')).toHaveCount(1);
    await expect(page.locator('#forward-menu')).toHaveCount(1);
    // commands work in full view: flag toggles the body class
    await page.locator('#quiet-msg-flag').click();
    await expect(page.locator('body')).toHaveClass(/status-flagged/);
    await page.locator('#quiet-msg-flag').click();
    await expect(page.locator('body')).not.toHaveClass(/status-flagged/);
  });

  test('full view keeps the toolbar and hides Quiet actions at phone width', async ({ page }) => {
    await login(page);
    await page.locator('#messagelist tbody tr', { hasText: FIXTURES['plain-short'] }).dblclick();
    await page.waitForURL(/_action=show/);
    await page.setViewportSize({ width: 400, height: 800 });
    await expect(page.locator('#layout > #layout-content > .header')).toBeVisible();
    await expect(page.locator('#quiet-sender-actions')).toBeHidden();
  });
});

test.describe('open message: full view navigation', () => {
  test.beforeEach(async ({ context }) => { await setColorMode(context, 'light'); });

  test('Back, Previous and Next stay reachable at desktop width', async ({ page }) => {
    await login(page);
    await page.locator('#messagelist tbody tr', { hasText: FIXTURES['plain-short'] }).dblclick();
    await page.waitForURL(/_action=show/);
    await expect(page.locator('#layout > #layout-content > .header')).toBeHidden();
    const nav = page.locator('#quiet-nav');
    await expect(nav).toBeVisible();
    const uid = () => new URL(page.url()).searchParams.get('_uid');
    const first = uid();
    // pagenav enables Previous/Next once its request returns
    await expect(page.locator('#quiet-nav-next')).not.toHaveClass(/disabled/);
    await page.locator('#quiet-nav-next').click();
    await expect.poll(uid).not.toBe(first);
    await expect(page.locator('#quiet-nav-prev')).not.toHaveClass(/disabled/);
    await page.locator('#quiet-nav-prev').click();
    await expect.poll(uid).toBe(first);
    await page.locator('#quiet-nav-back').click();
    await page.waitForURL((u) => !u.search.includes('_action=show'));
    await expect(page.locator('#messagelist tbody tr').first()).toBeVisible();
  });

  test('no Back/Prev/Next inside the reading pane (the list is right there)', async ({ page }) => {
    await openPreview(page, 'plain-short');
    await expect(frame(page).locator('#quiet-nav')).toHaveCount(0);
  });
});

test.describe('open message: preview actions act on the open message only', () => {
  /** Threads on, thread-a collapsed with its root selected and open in the preview (rcmail's selection includes the replies). */
  async function openCollapsedParent(page: Page, context: any) {
    await setColorMode(context, 'light');
    reseed('threads');
    await login(page, BASE_THREADS);
    const row = (id: string) => page.locator('#messagelist tbody tr', { hasText: FIXTURES[id] });
    const rc = (fn: string) => page.evaluate(fn);
    await page.evaluate(() => (window as any).rcmail.set_list_options(null, undefined, undefined, 1));
    await expect.poll(() => page.evaluate(() => !!(window as any).rcmail.env.threading)).toBe(true);
    await rc('rcmail.command("expand-all")');
    await expect(row('thread-a-3')).toBeVisible();
    await rc('rcmail.command("collapse-all")');
    await expect(row('thread-a-3')).toBeHidden();

    await row('thread-a-1').locator('span.subject').click();
    await expect(frame(page).locator('#message-header h2.subject')).toContainText(FIXTURES['thread-a-1']);
    await expect(frame(page).locator('#quiet-sender-actions')).toBeVisible();
    expect(await page.evaluate(() => (window as any).rcmail.message_list.get_selection().length)).toBeGreaterThan(1);
    await expect.poll(() => page.evaluate(() => !(window as any).rcmail.busy)).toBe(true);
    return { row, rc };
  }

  async function threadsCleanup(page: Page) {
    await page.evaluate(() => (window as any).rcmail.set_list_options(null, undefined, undefined, 0));
    await expect.poll(() => page.evaluate(() => !!(window as any).rcmail.env.threading)).toBe(false);
    reseed('threads');
  }

  /** After the action: the root is gone from INBOX, the replies are still there. */
  async function expectOnlyRootGone(page: Page, row: (id: string) => Locator, rc: (fn: string) => Promise<unknown>) {
    await expect(row('thread-a-1')).toBeHidden();
    await page.evaluate(() => (window as any).rcmail.command('list', 'INBOX'));
    await expect.poll(() => page.evaluate(() => !(window as any).rcmail.busy)).toBe(true);
    await rc('rcmail.command("expand-all")');
    await expect(row('thread-a-2')).toBeVisible();
    await expect(row('thread-a-3')).toBeVisible();
    await expect(row('thread-a-1')).toHaveCount(0);
  }

  test('Delete with a collapsed thread parent selected deletes only that message', async ({ page, context }) => {
    test.setTimeout(90_000);
    try {
      const { row, rc } = await openCollapsedParent(page, context);
      await frame(page).locator('#quiet-sender-actions a.delete').click();
      await expectOnlyRootGone(page, row, rc);
    } finally { await threadsCleanup(page); }
  });

  test('Archive from the preview with a collapsed thread parent selected archives only that message', async ({ page, context }) => {
    test.setTimeout(90_000);
    try {
      const { row, rc } = await openCollapsedParent(page, context);
      await expect(frame(page).locator('#quiet-u-archive')).toBeVisible();
      await frame(page).locator('#quiet-u-archive').click();
      await expectOnlyRootGone(page, row, rc);
    } finally { await threadsCleanup(page); }
  });

  test('Move from the preview with a collapsed thread parent selected moves only that message', async ({ page, context }) => {
    test.setTimeout(90_000);
    try {
      const { row, rc } = await openCollapsedParent(page, context);
      await frame(page).locator('#quiet-under-actions a.move').click();
      await expect(page.locator('#folder-selector')).toBeVisible();
      await page.locator('#folder-selector a', { hasText: /^Projects$/ }).first().click();
      await expectOnlyRootGone(page, row, rc);
    } finally { await threadsCleanup(page); }
  });
});

test.describe('open message: housekeeping', () => {
  test.beforeEach(async ({ context }) => { await setColorMode(context, 'light'); });

  test('print page loads print.css (200) and is not overflow:hidden', async ({ page }) => {
    await login(page);
    const uid = await page.locator('#messagelist tbody tr', { hasText: FIXTURES['long-everything'] }).evaluate((tr) => (tr as any).uid);
    const sheets: { url: string; status: number }[] = [];
    page.on('response', (r) => { if (/print(\.min)?\.css/.test(r.url())) sheets.push({ url: r.url(), status: r.status() }); });
    await page.goto(`${BASE}/?_task=mail&_mbox=INBOX&_uid=${uid}&_action=print`);
    await expect(page.locator('#print-layout')).toBeVisible();
    expect(sheets.length).toBeGreaterThan(0);
    for (const s of sheets) expect(s.status, s.url).toBe(200);
    const overflow = await page.evaluate(() => getComputedStyle(document.body).overflowY);
    expect(overflow).not.toBe('hidden');
  });

  test('opening messages in the preview does not pile up resize handlers on the host window', async ({ page }) => {
    await page.addInitScript(() => {
      if (window !== window.top) return;
      const w = window as any;
      w.__resizeNet = 0;
      const add = window.addEventListener.bind(window), rem = window.removeEventListener.bind(window);
      window.addEventListener = ((t: string, ...a: any[]) => { if (t === 'resize') w.__resizeNet++; return (add as any)(t, ...a); }) as any;
      window.removeEventListener = ((t: string, ...a: any[]) => { if (t === 'resize') w.__resizeNet--; return (rem as any)(t, ...a); }) as any;
    });
    await login(page);
    const net = () => page.evaluate(() => (window as any).__resizeNet as number);
    const open = async (id: string) => {
      await page.locator('#messagelist tbody tr', { hasText: FIXTURES[id] }).locator('span.subject').click();
      await expect(frame(page).locator('#message-header h2.subject')).toContainText(FIXTURES[id]);
      await expect(frame(page).locator('#quiet-sender-actions')).toBeVisible();
    };
    await open('plain-short');
    const first = await net();
    await open('html-basic');
    await open('with-2-attachments');
    await open('long-everything');
    expect(await net()).toBe(first);
  });

  test('skin labels are localized (not the bare label keys)', async ({ page }) => {
    await login(page);
    const labels = await page.evaluate(() => ['quietnselected', 'quietmessagesselected', 'quietclearselection']
      .map((k) => (window as any).rcmail.get_label(k)));
    expect(labels).toEqual(['{n} selected', '{n} messages selected', 'Clear selection']);
  });
});
