import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

export const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8460';
export const BASE_PLAIN = process.env.BASE_URL_PLAIN ?? 'http://127.0.0.1:8461';
/** Roundcube on Dovecot (IMAP THREAD available), archive + zipdownload plugins. */
export const BASE_THREADS = process.env.BASE_URL_THREADS ?? 'http://127.0.0.1:8462';
export const USER = 'klaus';
export const PASS = 'klaus';

/** Fixture ID -> unique subject fragment shown in the message list. */
export const FIXTURES: Record<string, string> = {
  'plain-short': 'Fixture plain-short:',
  'list-post': 'Fixture list-post:',
  'html-basic': 'Fixture html-basic:',
  'html-dark-newsletter': 'Fixture html-dark-newsletter:',
  'with-2-attachments': 'Fixture with-2-attachments:',
  'long-everything': 'Fixture long-everything:',
  'thread-a-1': 'Fixture thread-a-1:',
  'thread-a-2': 'Fixture thread-a-2:',
  'thread-a-3': 'Fixture thread-a-3:',
};

/** Log in as the test user and wait for the mail view. */
export async function login(page: Page, base: string = BASE): Promise<void> {
  await page.goto(`${base}/`);
  await page.fill('#rcmloginuser', USER);
  await page.fill('#rcmloginpwd', PASS);
  await page.click('#rcmloginsubmit');
  await page.waitForURL(/_task=mail/);
  await expect(page.locator('#messagelist tbody tr').first()).toBeVisible();
}

/** Force Elastic/Quiet colour mode via the `colorMode` cookie (call before navigating). */
export async function setColorMode(context: BrowserContext, mode: 'light' | 'dark'): Promise<void> {
  const url = new URL(BASE);
  await context.addCookies([{ name: 'colorMode', value: mode, domain: url.hostname, path: '/' }]);
}

/** Pick a Quiet colour scheme via the `quietScheme` cookie (call before navigating). 'lake' = the default, no cookie. */
export async function setScheme(context: BrowserContext, scheme: 'lake' | 'cobalt' | 'teal' | 'indigo'): Promise<void> {
  const url = new URL(BASE);
  await context.clearCookies({ name: 'quietScheme' });
  if (scheme !== 'lake') await context.addCookies([{ name: 'quietScheme', value: scheme, domain: url.hostname, path: '/' }]);
}

/** Collect console errors and uncaught page errors; returns the live array. */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

/**
 * Wipe and refill a dev mailbox with dev/seed/seed.py (for tests that delete or move mail).
 * 'main' is the GreenMail server behind BASE and BASE_PLAIN, 'threads' the Dovecot one behind BASE_THREADS.
 * Needs the e2e container (SEED_IMAP / SEED_IMAP_THREADS = host:port on the compose network).
 */
export function reseed(target: 'main' | 'threads' = 'main'): void {
  const hp = (target === 'main' ? process.env.SEED_IMAP : process.env.SEED_IMAP_THREADS) ?? '';
  const [host, port] = hp.split(':');
  if (!host || !port) throw new Error(`reseed(${target}): SEED_IMAP${target === 'main' ? '' : '_THREADS'} not set (run via make e2e)`);
  execFileSync('python3', ['-I', 'dev/seed/seed.py'], {
    env: { ...process.env, IMAP_HOST: host, IMAP_PORT: port },
    stdio: 'pipe',
    timeout: 90_000,
  });
}

/**
 * Reset the persisted list prefs (sort column/order, threads, page size) of the shared test user to defaults.
 * Specs share one Roundcube user, so a spec that changes these must not leave them behind, and specs that
 * depend on them call this in beforeEach. Uses its own browser context (own session).
 */
export async function resetPrefs(browser: Browser, base: string = BASE): Promise<void> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await login(page, base);
    const dirty = await page.evaluate(() => {
      const e = (window as any).rcmail.env;
      return (e.sort_col || '') !== '' || (e.sort_order || 'DESC') !== 'DESC' || !!e.threading || parseInt(e.pagesize, 10) !== 50;
    });
    if (!dirty) return;
    await page.evaluate(() => (window as any).rcmail.set_list_options(null, '', 'DESC', 0));
    await page.waitForLoadState('networkidle');
    await page.goto(`${base}/?_task=settings&_action=edit-prefs&_section=mailbox&_framed=1`);
    await page.fill('input[name="_mail_pagesize"]', '50');
    await Promise.all([page.waitForLoadState('load'), page.evaluate(() => (document.querySelector('form') as HTMLFormElement).submit())]);
  } finally {
    await ctx.close();
  }
}

/** Parse "rgb(r, g, b)" / "rgba(r, g, b, a)" into [r, g, b]. */
export function parseRgb(css: string): [number, number, number] {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`not a colour: ${css}`);
  const [r, g, b] = m[1].split(',').map((x) => parseFloat(x));
  return [r, g, b];
}

/** WCAG contrast ratio between two computed colours (alpha ignored: pass opaque colours). */
export function contrast(fg: string, bg: string): number {
  const lum = ([r, g, b]: [number, number, number]) => {
    const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const [a, b] = [lum(parseRgb(fg)), lum(parseRgb(bg))];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
