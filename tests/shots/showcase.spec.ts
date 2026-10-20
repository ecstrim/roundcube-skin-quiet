import { test, type Browser, type Page } from '@playwright/test';
import { BASE, setColorMode, setScheme } from './../e2e/helpers';

// `make showcase`: the README screenshots, written to docs/screenshots/ (committed). Uses the `demo` mailbox seeded
// by dev/seed/showcase.py, never the e2e fixtures.

const OUT = 'docs/screenshots';
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
type Mode = 'light' | 'dark';
type Scheme = 'lake' | 'cobalt' | 'teal' | 'indigo';

const settle = (page: Page) => page.waitForTimeout(800);

async function open(browser: Browser, viewport: { width: number; height: number }, mode: Mode, scheme: Scheme = 'lake', scale = 1) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale });
  await setColorMode(context, mode);
  await setScheme(context, scheme);
  const page = await context.newPage();
  await page.goto(`${BASE}/`);
  await page.fill('#rcmloginuser', 'demo');
  await page.fill('#rcmloginpwd', 'demo');
  await page.click('#rcmloginsubmit');
  await page.waitForURL(/_task=mail/);
  await page.locator('#messagelist tbody tr').first().waitFor();
  return page;
}

/** Click the roadmap mail and wait for it to render (preview pane on desktop, full view on phone). */
async function openRoadmap(page: Page) {
  await page.locator('#messagelist tbody tr', { hasText: 'Q4 roadmap review' }).click();
  await page.frameLocator('#messagecontframe').getByText('Next steps', { exact: true }).waitFor();
  await page.mouse.move(700, 880);
}

test.describe.configure({ mode: 'serial' });

test('identity', async ({ browser }) => {
  // Name the demo identity so From and the account initial read "Alex Morgan".
  const page = await open(browser, DESKTOP, 'light');
  await page.goto(`${BASE}/?_task=settings&_action=identities`);
  await page.locator('#identities-table tbody tr').first().click();
  const frame = page.frameLocator('#preferences-frame');
  await frame.locator('input[name="_name"]').fill('Alex Morgan');
  await frame.locator('input[name="_email"]').fill('alex@example.com');
  await page.frame({ name: 'preferences-frame' })!.evaluate(() => (window as any).rcmail.command('save'));
  await page.frameLocator('#preferences-frame').locator('input[name="_name"]').waitFor();
  await settle(page);
  await page.context().close();
});

for (const mode of ['light', 'dark'] as const) {
  test(`mail ${mode}`, async ({ browser }) => {
    const page = await open(browser, DESKTOP, mode);
    await openRoadmap(page);
    await settle(page);
    await page.screenshot({ path: `${OUT}/mail-${mode}.png` });
    await page.context().close();
  });
}

for (const scheme of ['cobalt', 'teal', 'indigo'] as const) {
  test(`scheme ${scheme}`, async ({ browser }) => {
    const page = await open(browser, DESKTOP, 'light', scheme);
    await openRoadmap(page);
    await settle(page);
    await page.screenshot({ path: `${OUT}/scheme-${scheme}.png` });
    await page.context().close();
  });
}

test('compose', async ({ browser }) => {
  const page = await open(browser, DESKTOP, 'light');
  await page.goto(`${BASE}/?_task=mail&_action=compose`);
  await page.locator('#compose-subject').waitFor();
  await page.locator('#compose_to .recipient-input input').fill('Priya Shah <priya@example.com>, ');
  await page.fill('#compose-subject', 'Re: Q4 roadmap review: notes and next steps');
  await page.fill('#composebody', 'Hi Priya,\n\nThanks for the summary, that matches my notes. Tuesday works for the backlog review.\n\nAlex');
  await page.locator('#compose-subject').click();
  await settle(page);
  await page.screenshot({ path: `${OUT}/compose.png` });
  await page.context().close();
});

test('login', async ({ browser }) => {
  const context = await browser.newContext({ viewport: DESKTOP });
  await setColorMode(context, 'light');
  const page = await context.newPage();
  await page.goto(`${BASE}/`);
  await page.locator('#rcmloginuser').waitFor();
  await settle(page);
  await page.screenshot({ path: `${OUT}/login.png` });
  await context.close();
});

test('phone', async ({ browser }) => {
  const light = await open(browser, PHONE, 'light', 'lake', 2);
  await settle(light);
  await light.screenshot({ path: `${OUT}/phone-list.png` });
  await light.context().close();

  const dark = await open(browser, PHONE, 'dark', 'lake', 2);
  await dark.locator('#messagelist tbody tr', { hasText: 'Q4 roadmap review' }).click();
  await dark.frameLocator('#messagecontframe').getByText('Next steps', { exact: true }).waitFor();
  await settle(dark);
  await dark.screenshot({ path: `${OUT}/phone-message.png` });
  await dark.context().close();
});
