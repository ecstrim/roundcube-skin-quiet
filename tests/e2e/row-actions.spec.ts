import { test, expect, type Page } from '@playwright/test';
import { BASE, BASE_PLAIN, BASE_THREADS, FIXTURES, login, reseed } from './helpers';

// Hover quick actions on message-list rows: one click acts on that one message,
// without selecting or opening it and without changing the current selection.

test.use({ viewport: { width: 1440, height: 900 } });

type Action = 'delete' | 'archive' | 'flag' | 'read';

const row = (page: Page, id: string) => page.locator('#messagelist tbody tr', { hasText: FIXTURES[id] });
const actions = (page: Page, id: string) => row(page, id).locator('.quiet-row-actions');
const button = (page: Page, id: string, a: Action) => actions(page, id).locator(`button[data-action="${a}"]`);

const uidOf = (page: Page, id: string) => row(page, id).evaluate((tr) => String((tr as any).uid));
const selection = (page: Page) =>
  page.evaluate(() => ((window as any).rcmail.message_list.get_selection(false) as unknown[]).map(String));
const rowState = (page: Page, uid: string) =>
  page.evaluate((u) => {
    const r = (window as any).rcmail.message_list.rows[u];
    return r ? { flagged: !!r.flagged, unread: !!r.unread, deleted: !!r.deleted } : null;
  }, uid);
const previewId = (page: Page) => page.evaluate(() => {
  const p = (window as any).rcmail.preview_id;
  return p === undefined ? null : String(p);
});
const frame = (page: Page) => page.frameLocator('#messagecontframe');
/** The group is faded out (not display:none) so the focused row's buttons stay reachable with Tab. */
const shown = (page: Page, id: string) => actions(page, id).evaluate((g) => getComputedStyle(g).opacity === '1');
/** rcmail ignores commands (e.g. the Delete key) while the preview is still loading. */
const idle = (page: Page) => expect.poll(() => page.evaluate(() => !(window as any).rcmail.busy)).toBe(true);

/** Removed from the list the way Roundcube removes rows: hidden and dropped from message_list.rows. */
async function expectGone(page: Page, id: string) {
  await expect(row(page, id)).toBeHidden();
  expect(await page.evaluate((frag) => Object.values((window as any).rcmail.message_list.rows)
    .some((r: any) => (r.obj as HTMLElement).textContent!.includes(frag)), FIXTURES[id])).toBe(false);
}

/** Click a row and wait until it is shown in the reading pane. */
async function openMessage(page: Page, id: string): Promise<string> {
  const uid = await uidOf(page, id);
  await row(page, id).locator('span.subject').click();
  await expect.poll(() => previewId(page)).toBe(uid);
  await expect(frame(page).locator('body')).toContainText(FIXTURES[id]);
  await idle(page);
  return uid;
}

/** Hover a row and click one of its quick actions; resolves once the server answered. */
async function hoverAction(page: Page, id: string, a: Action, httpAction: string) {
  await row(page, id).hover();
  const btn = button(page, id, a);
  await expect.poll(() => shown(page, id)).toBe(true);
  const resp = page.waitForResponse((r) => r.url().includes(`_action=${httpAction}`) && r.request().method() === 'POST');
  await btn.click();
  await resp;
}

/** Mark the preview frame's window so a later reload/blank of the frame is detectable. */
const markFrame = (page: Page) => page.evaluate(() => {
  ((document.getElementById('messagecontframe') as HTMLIFrameElement).contentWindow as any).__quietMarker = 1;
});
const frameMarked = (page: Page) => page.evaluate(() =>
  ((document.getElementById('messagecontframe') as HTMLIFrameElement).contentWindow as any).__quietMarker === 1);

/** Reload the list from the server (Roundcube's own refresh of the current folder). */
async function reloadList(page: Page) {
  await page.reload();
  await expect(page.locator('#messagelist tbody tr').first()).toBeVisible();
}

test.describe('on the main instance', () => {
  test.beforeEach(() => reseed('main'));
  test.afterAll(() => reseed('main'));

  test('hover shows actions replacing time', async ({ page }) => {
    await login(page);
    const r = row(page, 'html-basic');
    expect(await shown(page, 'html-basic')).toBe(false);
    await expect(r.locator('span.date')).toBeVisible();

    await r.hover();
    const group = actions(page, 'html-basic');
    await expect.poll(() => shown(page, 'html-basic')).toBe(true);
    await expect(group).toHaveAttribute('role', 'toolbar');
    await expect(r.locator('span.date')).toBeHidden();
    // Delete, Archive (plugin on), Flag, Mark read/unread: labelled, in that order.
    const labels = await group.locator('button').evaluateAll((bs) =>
      bs.map((b) => ({ a: b.getAttribute('data-action'), label: b.getAttribute('aria-label'), title: b.getAttribute('title') })));
    expect(labels.map((l) => l.a)).toEqual(['delete', 'archive', 'flag', 'read']);
    for (const l of labels) {
      expect(l.label, `${l.a} aria-label`).toBeTruthy();
      expect(l.title, `${l.a} title`).toBe(l.label);
    }
    // At the top right of the row, on the sender line, where the date was.
    const g = (await group.boundingBox())!;
    const rb = (await r.boundingBox())!;
    expect(g.y).toBeLessThan(rb.y + rb.height / 2);
    expect(g.x + g.width).toBeGreaterThan(rb.x + rb.width - 80);
    // Hovering does not select.
    expect(await selection(page)).toEqual([]);
    // Moving away hides the group again.
    await page.mouse.move(5, 5);
    await expect.poll(() => shown(page, 'html-basic')).toBe(false);
    await expect(r.locator('span.date')).toBeVisible();
  });

  test('hover delete on other row keeps preview', async ({ page }) => {
    await login(page);
    const open = await openMessage(page, 'plain-short');
    await markFrame(page);
    await hoverAction(page, 'html-basic', 'delete', 'move');

    await expectGone(page, 'html-basic');
    expect(await selection(page)).toEqual([open]);
    await expect(row(page, 'plain-short')).toHaveClass(/selected/);
    await page.waitForTimeout(500);
    expect(await previewId(page)).toBe(open);
    expect(await frameMarked(page)).toBe(true);
    await expect(frame(page).locator('body')).toContainText(FIXTURES['plain-short']);

    // Server side: gone from the Inbox for real.
    await reloadList(page);
    await expect(row(page, 'html-basic')).toHaveCount(0);
    await expect(row(page, 'plain-short')).toHaveCount(1);
  });

  test('hover delete on open row clears preview', async ({ page }) => {
    await login(page);
    await openMessage(page, 'plain-short');
    await hoverAction(page, 'plain-short', 'delete', 'move');

    await expectGone(page, 'plain-short');
    expect(await selection(page)).toEqual([]);
    expect(await previewId(page)).toBeNull();
    await expect(frame(page).locator('body')).not.toContainText(FIXTURES['plain-short']);
    await page.waitForTimeout(500);
    // Nothing else was opened in its place.
    expect(await previewId(page)).toBeNull();
    expect(await selection(page)).toEqual([]);
  });

  test('hover archive moves to Archive', async ({ page }) => {
    await login(page, BASE);
    const open = await openMessage(page, 'plain-short');
    await hoverAction(page, 'html-basic', 'archive', 'plugin.move2archive');

    await expectGone(page, 'html-basic');
    expect(await selection(page)).toEqual([open]);
    expect(await previewId(page)).toBe(open);

    await page.goto(`${BASE}/?_task=mail&_mbox=Archive`);
    await expect(row(page, 'html-basic')).toHaveCount(1);
    // Inside the archive folder there is nothing to archive to.
    await row(page, 'html-basic').hover();
    await expect(button(page, 'html-basic', 'delete')).toBeVisible();
    await expect(button(page, 'html-basic', 'archive')).toHaveCount(0);
  });

  test('flag toggles flagged class', async ({ page }) => {
    await login(page);
    const open = await openMessage(page, 'plain-short');
    const uid = await uidOf(page, 'html-basic');
    await expect(row(page, 'html-basic')).not.toHaveClass(/(^|\s)flagged(\s|$)/);
    const before = await button(page, 'html-basic', 'flag').getAttribute('aria-label');

    await hoverAction(page, 'html-basic', 'flag', 'mark');
    await expect(row(page, 'html-basic')).toHaveClass(/(^|\s)flagged(\s|$)/);
    expect((await rowState(page, uid))!.flagged).toBe(true);
    expect(await button(page, 'html-basic', 'flag').getAttribute('aria-label')).not.toBe(before);
    expect(await selection(page)).toEqual([open]);
    expect(await previewId(page)).toBe(open);

    await reloadList(page);
    await expect(row(page, 'html-basic')).toHaveClass(/(^|\s)flagged(\s|$)/);

    await hoverAction(page, 'html-basic', 'flag', 'mark');
    await expect(row(page, 'html-basic')).not.toHaveClass(/(^|\s)flagged(\s|$)/);
    expect(await selection(page)).toEqual([]);
  });

  test('read toggles unread class', async ({ page }) => {
    await login(page);
    const open = await openMessage(page, 'plain-short');
    await expect(row(page, 'html-basic')).toHaveClass(/(^|\s)unread(\s|$)/);
    const before = await button(page, 'html-basic', 'read').getAttribute('aria-label');

    await hoverAction(page, 'html-basic', 'read', 'mark');
    await expect(row(page, 'html-basic')).not.toHaveClass(/(^|\s)unread(\s|$)/);
    expect(await button(page, 'html-basic', 'read').getAttribute('aria-label')).not.toBe(before);
    expect(await selection(page)).toEqual([open]);
    expect(await previewId(page)).toBe(open);

    await reloadList(page);
    await expect(row(page, 'html-basic')).not.toHaveClass(/(^|\s)unread(\s|$)/);

    await hoverAction(page, 'html-basic', 'read', 'mark');
    await expect(row(page, 'html-basic')).toHaveClass(/(^|\s)unread(\s|$)/);
  });

  test('delete respects flag_for_deletion', async ({ page }) => {
    await login(page);
    const open = await openMessage(page, 'plain-short');
    await page.evaluate(() => { (window as any).rcmail.env.flag_for_deletion = true; });
    const uid = await uidOf(page, 'html-basic');

    await hoverAction(page, 'html-basic', 'delete', 'mark');
    await expect(row(page, 'html-basic')).toHaveCount(1);
    await expect(row(page, 'html-basic')).toHaveClass(/(^|\s)deleted(\s|$)/);
    expect((await rowState(page, uid))!.deleted).toBe(true);
    expect(await selection(page)).toEqual([open]);
    expect(await previewId(page)).toBe(open);
  });

  test('keyboard delete and navigation still work', async ({ page }) => {
    await login(page);
    const first = await openMessage(page, 'plain-short');
    // Only the focused row's buttons are in the tab order.
    const tabbable = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#messagelist tbody tr')).map((tr) => ({
        focused: tr.classList.contains('focused'),
        tab: Array.from(tr.querySelectorAll('.quiet-row-actions button')).map((b) => b.getAttribute('tabindex')),
      })));
    for (const t of tabbable) expect(t.tab.every((v) => v === (t.focused ? '0' : '-1'))).toBe(true);
    expect(tabbable.filter((t) => t.focused)).toHaveLength(1);

    await page.keyboard.press('ArrowDown');
    await expect.poll(() => selection(page)).not.toEqual([first]);
    const next = (await selection(page))[0];
    expect(next).toBeTruthy();
    await expect.poll(() => previewId(page)).toBe(next);
    await idle(page);
    await expect(page.locator('#messagelist tbody tr.focused button[data-action="delete"]')).toHaveAttribute('tabindex', '0');

    const resp = page.waitForResponse((r) => r.url().includes('_action=move'));
    await page.keyboard.press('Delete');
    await resp;
    await expect.poll(() => page.evaluate((u) => !!(window as any).rcmail.message_list.rows[u], next)).toBe(false);
    await expect.poll(() => selection(page)).not.toEqual([next]);
    await idle(page);

    // Tab from the focused row reaches its quick actions, which then show.
    await page.mouse.move(5, 5);
    await page.keyboard.press('Tab');
    const active = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement;
      return { action: a.getAttribute('data-action'), focusedRow: !!a.closest('tr.focused'),
        opacity: getComputedStyle(a.closest('.quiet-row-actions')!).opacity };
    });
    expect(active).toEqual({ action: 'delete', focusedRow: true, opacity: '1' });
  });

  for (const a of ['flag', 'read'] as const) {
    test(`${a} on a low row keeps scroll position and focus`, async ({ page }) => {
      await login(page);
      // Reach "list not focused, no focused row": open a message, hover-delete it, click into search.
      await openMessage(page, 'plain-short');
      await hoverAction(page, 'plain-short', 'delete', 'move');
      await page.locator('#mailsearchform').click();
      expect(await page.evaluate(() => {
        const l = (window as any).rcmail.message_list;
        return { focused: !!l.focused, last: l.last_selected ?? null, sel: l.get_selection().length };
      })).toEqual({ focused: false, last: null, sel: 0 });
      const low = page.locator('#messagelist tbody tr:visible').last();
      await page.locator('#messagelist-content').evaluate((e) => { e.scrollTop = e.scrollHeight; });
      const scrollTop = () => page.locator('#messagelist-content').evaluate((e) => Math.round(e.scrollTop));
      const focusedUid = () => page.evaluate(() => {
        const f = document.querySelector('#messagelist tbody tr.focused') as any;
        return f ? String(f.uid) : null;
      });
      const before = { top: await scrollTop(), focused: await focusedUid() };
      expect(before.top).toBeGreaterThan(200);

      await low.hover();
      await expect.poll(() => low.locator('.quiet-row-actions').evaluate((g) => getComputedStyle(g).opacity)).toBe('1');
      const resp = page.waitForResponse((r) => r.url().includes('_action=mark'));
      await low.locator(`button[data-action="${a}"]`).click();
      await resp;

      await expect(low).toHaveClass(a === 'flag' ? /(^|\s)flagged(\s|$)/ : /^(?!.*\bunread\b)/);
      expect(await scrollTop()).toBe(before.top);
      expect(await focusedUid()).toBe(before.focused);
      expect(await selection(page)).toEqual([]);
    });
  }

  test('hover delete of the focused (unselected) row moves focus to the next row', async ({ page }) => {
    await login(page);
    const uid = await openMessage(page, 'plain-short');
    const nextUid = await row(page, 'plain-short').evaluate((tr) => {
      let n = tr.nextElementSibling as any;
      while (n && n.style.display === 'none') n = n.nextElementSibling;
      return String(n.uid);
    });
    // Ctrl-click: deselect it, it stays the list's focused row.
    await row(page, 'plain-short').locator('span.subject').click({ modifiers: ['Control'] });
    await expect.poll(() => selection(page)).toEqual([]);
    expect(await page.evaluate(() => String((window as any).rcmail.message_list.last_selected))).toBe(uid);

    await hoverAction(page, 'plain-short', 'delete', 'move');
    await expectGone(page, 'plain-short');
    expect(await page.evaluate(() => String((window as any).rcmail.message_list.last_selected))).toBe(nextUid);
    await expect(page.locator('#messagelist tbody tr.focused:visible')).toHaveCount(1);
    expect(await page.locator('#messagelist tbody tr.focused:visible').evaluate((tr) => String((tr as any).uid))).toBe(nextUid);

    // Arrow navigation continues from there instead of jumping back to the first row.
    // (With nothing selected, Roundcube's arrow keys move the focus cursor without selecting.)
    const afterNext = await page.evaluate((u) => {
      let n = ((window as any).rcmail.message_list.rows[u].obj as HTMLElement).nextElementSibling as any;
      while (n && n.style.display === 'none') n = n.nextElementSibling;
      return String(n.uid);
    }, nextUid);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => String((window as any).rcmail.message_list.last_selected))).toBe(afterNext);
    await expect(page.locator('#messagelist tbody tr.focused:visible')).toHaveCount(1);
  });

  test('hover delete in Trash deletes permanently', async ({ page }) => {
    await login(page);
    await hoverAction(page, 'html-basic', 'delete', 'move');
    await expectGone(page, 'html-basic');

    await page.goto(`${BASE}/?_task=mail&_mbox=Trash`);
    await expect(row(page, 'html-basic')).toHaveCount(1);
    const posted: string[] = [];
    page.on('request', (r) => { if (r.method() === 'POST') posted.push(r.url()); });
    await hoverAction(page, 'html-basic', 'delete', 'delete');
    await expectGone(page, 'html-basic');
    expect(posted.some((u) => u.includes('_action=delete'))).toBe(true);
    expect(posted.some((u) => u.includes('_action=move'))).toBe(false);

    // Trash is now empty: wait for the reloaded list to report its count.
    await page.reload();
    await expect.poll(() => page.evaluate(() => (window as any).rcmail?.env?.messagecount)).toBe(0);
    await expect(row(page, 'html-basic')).toHaveCount(0);
  });
});

test('no archive button without plugin', async ({ page }) => {
  await login(page, BASE_PLAIN);
  const r = row(page, 'html-basic');
  await r.hover();
  await expect.poll(() => shown(page, 'html-basic')).toBe(true);
  const list = await actions(page, 'html-basic').locator('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('data-action')));
  expect(list).toEqual(['delete', 'flag', 'read']);
  await expect(page.locator('#messagelist button[data-action="archive"]')).toHaveCount(0);
});

test('hover actions in thread mode act on one message', async ({ page }) => {
  reseed('threads');
  await login(page, BASE_THREADS);
  const rc = (fn: string) => page.evaluate(fn);
  expect(await page.evaluate(() => !!(window as any).rcmail.env.threads)).toBe(true);
  try {
    await page.evaluate(() => (window as any).rcmail.set_list_options(null, undefined, undefined, 1));
    await expect.poll(() => page.evaluate(() => !!(window as any).rcmail.env.threading)).toBe(true);
    await expect(row(page, 'thread-a-1')).toBeVisible();
    await rc('rcmail.command("expand-all")');
    await expect(row(page, 'thread-a-2')).toBeVisible();
    await expect(row(page, 'thread-a-3')).toBeVisible();

    const open = await openMessage(page, 'plain-short');
    // Delete a reply inside the thread: only that one message goes.
    await hoverAction(page, 'thread-a-2', 'delete', 'move');
    await expectGone(page, 'thread-a-2');
    await expect(row(page, 'thread-a-1')).toBeVisible();
    await expect(row(page, 'thread-a-3')).toBeVisible();
    expect(await selection(page)).toEqual([open]);
    expect(await previewId(page)).toBe(open);

    // Flag the collapsed thread root: the root only, not its replies.
    await rc('rcmail.command("collapse-all")');
    await expect(row(page, 'thread-a-3')).toBeHidden();
    const root = await uidOf(page, 'thread-a-1');
    const reply = await uidOf(page, 'thread-a-3');
    await hoverAction(page, 'thread-a-1', 'flag', 'mark');
    expect((await rowState(page, root))!.flagged).toBe(true);
    expect((await rowState(page, reply))!.flagged).toBe(false);
    expect(await selection(page)).toEqual([open]);

    // Server state matches.
    await reloadList(page);
    await rc('rcmail.command("expand-all")');
    await expect(row(page, 'thread-a-2')).toHaveCount(0);
    await expect(row(page, 'thread-a-1')).toHaveClass(/(^|\s)flagged(\s|$)/);
    await expect(row(page, 'thread-a-3')).not.toHaveClass(/(^|\s)flagged(\s|$)/);
  } finally {
    await page.evaluate(() => (window as any).rcmail.set_list_options(null, undefined, undefined, 0));
    await expect.poll(() => page.evaluate(() => !!(window as any).rcmail.env.threading)).toBe(false);
    reseed('threads');
  }
});
