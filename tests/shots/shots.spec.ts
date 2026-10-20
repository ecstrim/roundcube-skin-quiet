import { test, type Page } from '@playwright/test';
import { BASE, login, setColorMode } from './../e2e/helpers';

// `make shots`: screenshots of every screen for visual review, written to test-results/shots/ (git-ignored).

const OUT = 'test-results/shots';
const SIZES = [
  { name: '1440-light', w: 1440, h: 900, mode: 'light' },
  { name: '1440-dark', w: 1440, h: 900, mode: 'dark' },
  { name: '1024-light', w: 1024, h: 768, mode: 'light' },
  { name: '390-light', w: 390, h: 844, mode: 'light' },
  { name: '390-dark', w: 390, h: 844, mode: 'dark' },
] as const;

const settle = (page: Page) => page.waitForTimeout(600);

for (const s of SIZES) {
  test(`shots ${s.name}`, async ({ page, context }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: s.w, height: s.h });
    await setColorMode(context, s.mode);
    const shot = async (n: string) => { await settle(page); await page.screenshot({ path: `${OUT}/${n}-${s.name}.png` }); };

    await page.goto(`${BASE}/`);
    await page.locator('#rcmloginuser').waitFor();
    await shot('login');

    await login(page);
    await shot('mail');

    // open the html fixture in full view
    const uid = await page.evaluate(() => {
      const row = Array.from(document.querySelectorAll('#messagelist tbody tr')).find((r) => /Fixture html-basic:/.test(r.textContent || ''))!;
      return (window as any).rcmail.html_identifier_decode(row.id.replace('rcmrow', ''));
    });
    await page.goto(`${BASE}/?_task=mail&_mbox=INBOX&_uid=${uid}&_action=show`);
    await shot('message');

    if (s.w > 1200) {
      // a dialog (all headers) over the open message
      await page.goto(`${BASE}/?_task=mail&_mbox=INBOX&_uid=${uid}&_action=show`);
      await page.locator('#message-header .header-links a.headers-all').click();
      await page.locator('.ui-dialog:visible').waitFor();
      await page.frameLocator('.ui-dialog:visible iframe').locator('body').getByText('Message-ID').waitFor().catch(() => {});
      await shot('dialog');
    }

    await page.goto(`${BASE}/?_task=mail&_action=compose`);
    await page.locator('#compose-subject').waitFor();
    await shot('compose');

    await page.goto(`${BASE}/?_task=addressbook`);
    await shot('contacts');

    await page.goto(`${BASE}/?_task=settings`);
    await shot('settings');
    await page.goto(`${BASE}/?_task=settings&_action=preferences`);
    await shot('settings-prefs');
  });
}
