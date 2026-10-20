import { chromium } from '@playwright/test';
import { resetPrefs, BASE, BASE_PLAIN, BASE_THREADS } from './helpers';

/** Start every run from default list prefs (earlier aborted runs may have left sort/threads/page size behind). */
export default async function globalSetup(): Promise<void> {
  const browser = await chromium.launch();
  try {
    for (const base of [BASE, BASE_PLAIN, BASE_THREADS]) await resetPrefs(browser, base);
  } finally {
    await browser.close();
  }
}
