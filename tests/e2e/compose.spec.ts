import { test, expect, type Browser, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, BASE_PLAIN, login, setColorMode } from './helpers';

// Compose (mockup ComposeDark): top strip, fields, attachments row, formatting bar, body box, Send/Save under the box.

test.use({ viewport: { width: 1440, height: 900 } });

const COMPOSE = (base: string) => `${base}/?_task=mail&_action=compose`;

/** Open a fresh compose screen and wait until the editor is ready. */
async function openCompose(page: Page, base: string = BASE) {
  await login(page, base);
  await page.goto(COMPOSE(base));
  await expect(page.locator('#quiet-compose-top')).toBeVisible();
  await expect(page.locator('#compose-subject')).toBeVisible();
}

/**
 * Mail sent through the stack's GreenMail SMTP. Roundcube refuses klaus@localhost (no dotted domain), and GreenMail
 * delivers to any other address by auto-creating a mailbox whose login and password are the address itself.
 * So the end-to-end tests send to RECIPIENT and read that mailbox through a second, fresh login.
 */
const RECIPIENT = 'quiet-recipient@example.org';

async function expectDelivered(browser: Browser, subject: string, base: string = BASE) {
  const ctx = await browser.newContext({ baseURL: base });
  try {
    const p = await ctx.newPage();
    await p.goto(`${base}/`);
    await p.fill('#rcmloginuser', RECIPIENT);
    await p.fill('#rcmloginpwd', RECIPIENT);
    await p.click('#rcmloginsubmit');
    await p.waitForURL(/_task=mail/);
    await expect(p.locator('#messagelist tbody tr', { hasText: subject })).toHaveCount(1, { timeout: 15_000 });
  } finally {
    await ctx.close();
  }
}

/** Type a recipient into Elastic's recipient widget (the real textarea only follows the visible input). */
async function setTo(page: Page, addr: string) {
  const input = page.locator('#compose_to .recipient-input input');
  await input.fill(addr);
  await input.press(',');
  await expect(page.locator('#compose_to .recipient-input li.recipient')).toHaveCount(1);
}

const box = async (loc: ReturnType<Page['locator']>) => (await loc.boundingBox())!;

/** Visible text of every actionable element under a selector. */
const visibleActions = (page: Page, root: string) => page.locator(root).evaluate((el) => {
  const vis = (e: Element) => {
    const r = (e as HTMLElement).getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  return Array.from(el.querySelectorAll('a, button'))
    .filter((e) => vis(e) && !e.closest('.popupmenu'))
    .map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim());
});

test.describe('compose (desktop, light)', () => {
  test.beforeEach(async ({ context }) => { await setColorMode(context, 'light'); });

  test('top strip has only Signature, Responses, Options, Discard; no Send', async ({ page }) => {
    await openCompose(page);
    expect(await visibleActions(page, '#quiet-compose-top')).toEqual(['Signature', 'Responses', 'Options', 'Discard']);
    await expect(page.locator('#quiet-compose-top .send, #quiet-compose-top [data-command="send"]')).toHaveCount(0);
    // right-aligned: the last button ends near the strip's right edge
    const top = await box(page.locator('#quiet-compose-top'));
    const discard = await box(page.locator('#quiet-compose-top a', { hasText: 'Discard' }));
    expect(discard.x + discard.width).toBeGreaterThan(top.x + top.width - 40);
    // Discard is danger text
    const color = await page.locator('#quiet-compose-top a', { hasText: 'Discard' }).evaluate((e) => getComputedStyle(e).color);
    expect(color).toBe('rgb(177, 14, 28)');
  });

  test('Discard leaves compose', async ({ page }) => {
    await openCompose(page);
    await page.locator('#quiet-compose-top a', { hasText: 'Discard' }).click();
    await page.waitForURL(/_task=mail(&|$)(?!.*_action=compose)/);
    await expect(page.locator('#messagelist tbody tr').first()).toBeVisible();
  });

  test('Options popover holds priority, return receipt, DSN, save-sent folder, editor type', async ({ page }) => {
    await openCompose(page);
    const pop = page.locator('#layout-sidebar.sidebar-right');
    await expect(pop).toBeHidden();
    await page.locator('#quiet-options-button').click();
    await expect(pop).toBeVisible();
    for (const sel of ['#compose-priority', '#compose-mdn', '#compose-dsn', '#compose-store-target', '#compose-keep-formatting', '#quiet-editor-type']) {
      await expect(pop.locator(sel), sel).toBeVisible();
    }
    // the options are real: priority changes the hidden form value
    await pop.locator('#compose-priority').selectOption({ label: 'High' });
    await expect(page.locator('input[name="_priority"]').first()).toHaveValue('2');
    // Escape closes
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();
  });

  test('editor type select in Options switches HTML and plain', async ({ page }) => {
    await openCompose(page);
    await page.locator('#quiet-options-button').click();
    await page.locator('#quiet-editor-type').selectOption('html');
    await expect(page.locator('.tox-tinymce')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('#quiet-options-button').click();
    await expect(page.locator('#quiet-editor-type')).toHaveValue('html');
    await page.locator('#quiet-editor-type').selectOption('plain');
    await expect(page.locator('.tox-tinymce')).toHaveCount(0);
  });

  test('Cc, Bcc, Reply-To, Followup-To links reveal their fields', async ({ page }) => {
    await openCompose(page);
    const row = page.locator('#compose_to');
    // the links sit at the right of the To row
    const r = await box(row);
    const l = await box(row.locator('.quiet-addhdr').first());
    expect(l.x).toBeGreaterThan(r.x + r.width / 2);
    for (const [name, field] of [['Cc', 'cc'], ['Bcc', 'bcc'], ['Reply-To', 'replyto'], ['Followup-To', 'followupto']]) {
      const link = row.locator('.quiet-addhdr', { hasText: new RegExp(`^${name}$`) });
      await expect(link, name).toBeVisible();
      await expect(page.locator(`#compose_${field}`), `${name} hidden first`).toBeHidden();
      await link.click();
      await expect(page.locator(`#compose_${field}`), `${name} revealed`).toBeVisible();
    }
  });

  test('recipient picker (address book) is kept', async ({ page }) => {
    await openCompose(page);
    await page.locator('#compose_to a.recipient').click();
    await expect(page.locator('#recipient-dialog')).toBeVisible();
  });

  test('Attach button sits right in attachments row and uploads', async ({ page }) => {
    await openCompose(page);
    const row = page.locator('#quiet-compose-attachments');
    await expect(row).toBeVisible();
    const attach = row.locator('#quiet-attach');
    await expect(attach).toBeVisible();
    const rb = await box(row);
    const ab = await box(attach);
    expect(ab.x + ab.width).toBeGreaterThan(rb.x + rb.width - 30);
    const sub = await box(page.locator('#compose_subject'));
    expect(rb.y).toBeGreaterThan(sub.y + sub.height - 2);

    const dir = mkdtempSync(join(tmpdir(), 'quiet-att-'));
    const file = join(dir, 'disk-order.txt');
    writeFileSync(file, 'two replacement disks\n');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), attach.click()]);
    await chooser.setFiles(file);
    const chip = row.locator('#attachment-list li');
    await expect(chip).toHaveCount(1);
    await expect(chip).toContainText('disk-order.txt');
  });

  test('Send and Save draft under the body box, left', async ({ page }) => {
    await openCompose(page);
    const bar = page.locator('#quiet-compose-bottom');
    const send = bar.locator('.send');
    const save = bar.locator('.save, .draft').first();
    await expect(send).toBeVisible();
    await expect(save).toBeVisible();
    const body = await box(page.locator('#composebodycontainer'));
    const s = await box(send);
    const d = await box(save);
    expect(s.y).toBeGreaterThanOrEqual(body.y + body.height - 2);
    expect(s.x).toBeLessThan(body.x + 80);
    expect(d.x).toBeGreaterThan(s.x + s.width - 1);
    expect(d.x).toBeLessThan(body.x + 300);
    // Send is the primary accent button
    expect(await send.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(23, 105, 178)');
    // top strip never carries Send or Save
    expect(await visibleActions(page, '#quiet-compose-top')).not.toContain('Send');
  });

  test('send works end to end', async ({ page, browser }) => {
    await openCompose(page);
    const subject = `Quiet compose ${Date.now()}`;
    await setTo(page, RECIPIENT);
    await page.fill('#compose-subject', subject);
    await page.fill('#composebody', 'Hello from the Quiet compose test.');
    await page.locator('#quiet-compose-bottom .send').click();
    await page.waitForURL(/_task=mail(&|$)(?!.*_action=compose)/, { timeout: 20_000 });
    await expect(page.locator('#messagelist tbody tr').first()).toBeVisible();
    await expectDelivered(browser, subject);
  });

  test('rail and folder pane are visible', async ({ page }) => {
    await openCompose(page);
    await expect(page.locator('#layout-menu')).toBeVisible();
    await expect(page.locator('#taskmenu a.mail')).toBeVisible();
    const folders = page.locator('#quiet-compose-folders');
    await expect(folders).toBeVisible();
    await expect(folders.locator('a', { hasText: 'Inbox' })).toBeVisible();
    await expect(folders.locator('a', { hasText: 'Sent' })).toBeVisible();
    // no leftover right-hand options column
    const b = await box(page.locator('#layout-content'));
    expect(b.x + b.width).toBeGreaterThan(1400 - 20);
  });

  test('no folder pane in the compose popup window', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/?_task=mail&_action=compose&_extwin=1`);
    await expect(page.locator('#compose-subject')).toBeVisible();
    await expect(page.locator('#quiet-compose-folders')).toHaveCount(0);
  });

  test('drag and drop upload adds an attachment chip', async ({ page }) => {
    await openCompose(page);
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['dropped bytes\n'], 'dropped.txt', { type: 'text/plain' }));
      const target = document.getElementById('quiet-compose-attachments')!;
      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
      }
    });
    const chip = page.locator('#quiet-compose-attachments #attachment-list li');
    await expect(chip).toHaveCount(1);
    await expect(chip).toContainText('dropped.txt');
  });

  test('folder pane link leaves compose', async ({ page }) => {
    await openCompose(page);
    await page.locator('#quiet-compose-folders a', { hasText: 'Inbox' }).click();
    await page.waitForURL(/_task=mail(&|$)(?!.*_action=compose)/);
    await expect(page.locator('#messagelist tbody tr').first()).toBeVisible();
  });
});

test.describe('compose formatting bar and editor', () => {
  test('HTML mode: reduced toolbar, nothing lost, labelled switch on the right', async ({ page, context }) => {
    await setColorMode(context, 'light');
    await openCompose(page);
    await page.locator('#quiet-options-button').click();
    await page.locator('#quiet-editor-type').selectOption('html');
    await page.keyboard.press('Escape');
    const tb = page.locator('.tox-tinymce .tox-toolbar-overlord .tox-toolbar').first();
    await expect(tb).toBeVisible();
    for (const label of ['Bold', 'Italic', 'Underline', 'Bullet list', 'Numbered list', 'Insert/edit link', 'Insert/edit image']) {
      await expect(tb.locator(`button[aria-label="${label}"]`), label).toBeVisible();
    }
    // Everything else stays reachable behind the "More" button (second toolbar row)
    const align = page.locator('.tox-tinymce button[aria-label="Align left"]');
    await expect(align).toBeHidden();
    await tb.locator('button[aria-label="More"]').click();
    await expect(align).toBeVisible();
    for (const label of ['Source code', 'Undo', 'Redo', 'Insert/edit link'.replace('/edit link', '/edit link')]) {
      await expect(page.locator(`.tox-tinymce button[aria-label="${label}"]`).first(), label).toBeVisible();
    }
    await tb.locator('button[aria-label="More"]').click();
    await expect(align).toBeHidden();
    // the plain switch is the labelled select at the right end of the bar (TinyMCE's own icon button is hidden)
    await expect(tb.locator('button[aria-label*="plain" i]')).toBeHidden();
    const sw = page.locator('#quiet-bar-type');
    await expect(sw).toBeVisible();
    const tbb = await box(tb);
    const swb = await box(sw);
    expect(swb.x + swb.width).toBeGreaterThan(tbb.x + tbb.width - 60);
  });

  for (const mode of ['light', 'dark'] as const) {
    test(`editor body white in ${mode} mode`, async ({ page, context }) => {
      await setColorMode(context, mode);
      await openCompose(page);
      await page.locator('#quiet-options-button').click();
      await page.locator('#quiet-editor-type').selectOption('html');
      await page.keyboard.press('Escape');
      const body = page.frameLocator('iframe.tox-edit-area__iframe').locator('body');
      await expect(body).toBeVisible();
      expect(await body.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
      expect(await body.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(36, 36, 36)');
    });
  }
});

test.describe('compose reachability (no Roundcube capability may disappear)', () => {
  test.beforeEach(async ({ context }) => { await setColorMode(context, 'light'); });

  // Elastic's compose commands and where Quiet puts each one.
  test('every Elastic compose command has a reachable control', async ({ page }) => {
    await openCompose(page);
    const reachable = async (sel: string) => {
      const l = page.locator(sel).filter({ visible: true });
      expect(await l.count(), sel).toBeGreaterThan(0);
    };
    // top strip
    await reachable('#quiet-compose-top a.signature');           // insert-sig
    await reachable('#quiet-compose-top a.responses');           // responses menu
    await reachable('#quiet-compose-top a.quiet-options');       // options + attachments sidebar
    await reachable('#quiet-compose-top a.quiet-discard');       // leave compose
    // bottom
    await reachable('#quiet-compose-bottom .send');              // send
    await reachable('#quiet-compose-bottom .save');              // savedraft
    // attachments row
    await reachable('#quiet-attach');                            // upload_input
    expect(await page.locator('#quiet-compose-attachments #attachment-list').count()).toBe(1);
    // headers
    await reachable('#compose_from #_from');
    await reachable('#compose_to a.recipient');                  // address-book picker
    // extwin (Open in new window)
    await reachable('#quiet-compose-bottom .extwin, #quiet-compose-top .extwin');
    // sidebar options live in the popover (checked in the Options test); the elements exist exactly once
    for (const sel of ['#compose-priority', '#compose-mdn', '#compose-dsn', '#compose-store-target', '#compose-keep-formatting']) {
      expect(await page.locator(sel).count(), sel).toBe(1);
    }
    // plugin toolbar container + spell menu + encryption menu stay in the DOM
    for (const sel of ['#spell-menu', '#encryption-menu', '#responses-menu', '#headers-menu', '#attachmentmenu']) {
      expect(await page.locator(sel).count(), sel).toBe(1);
    }
  });

  test('responses menu opens', async ({ page }) => {
    await openCompose(page);
    await page.locator('#quiet-compose-top a.responses').click();
    await expect(page.locator('#responses-menu')).toBeVisible();
  });

  test('Save draft works', async ({ page }) => {
    await openCompose(page);
    await page.fill('#compose-subject', `Quiet draft ${Date.now()}`);
    await setTo(page, 'anna@example.org');
    await page.locator('#quiet-compose-bottom .save').click();
    await expect(page.locator('#messagestack .confirmation, #messagestack .loading, #messagestack div').first()).toBeVisible();
  });

  test('spellcheck control exists when spell languages are configured', async ({ page }) => {
    await openCompose(page, BASE_PLAIN);
    const has = await page.evaluate(() => Object.keys((window as any).rcmail.env.spell_langs || {}).length > 0);
    const spell = page.locator('#quiet-spell a.spellcheck, #quiet-spell .spellcheck');
    if (has) await expect(spell.first()).toBeVisible();
    else await expect(page.locator('#quiet-spell')).toHaveCount(0);
  });
});

test.describe('compose on a phone', () => {
  test.use({ viewport: { width: 400, height: 800 } });
  test.beforeEach(async ({ context }) => { await setColorMode(context, 'light'); });

  test('can write and reach attach and options', async ({ page }) => {
    await login(page);
    await page.goto(COMPOSE(BASE));
    await expect(page.locator('#compose-subject')).toBeVisible();
    await expect(page.locator('#quiet-compose-folders')).toBeHidden();
    await setTo(page, 'anna@example.org');
    await page.fill('#compose-subject', `Quiet phone ${Date.now()}`);
    await page.fill('#composebody', 'phone body');
    await expect(page.locator('#quiet-attach')).toBeVisible();
    // options sidebar opens via Elastic's "Options and attachments" control
    await page.evaluate(() => (window as any).UI.show_sidebar());
    await expect(page.locator('#compose-priority')).toBeVisible();
  });

  test('send on phone', async ({ page, browser }) => {
    await login(page);
    await page.goto(COMPOSE(BASE));
    const subject = `Quiet phone send ${Date.now()}`;
    await setTo(page, RECIPIENT);
    await page.fill('#compose-subject', subject);
    await page.fill('#composebody', 'phone body');
    const send = page.locator('.send').filter({ visible: true }).first();
    await expect(send).toBeVisible();
    await send.click();
    await page.waitForURL(/_task=mail(&|$)(?!.*_action=compose)/, { timeout: 20_000 });
    await expectDelivered(browser, subject);
  });
});
