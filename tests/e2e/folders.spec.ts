import { test, expect } from '@playwright/test';
import { login, setColorMode } from './helpers';

test.use({ viewport: { width: 1440, height: 900 } });

test('new mail button opens compose', async ({ page, context }) => {
  await setColorMode(context, 'light');
  await login(page);
  const btn = page.locator('#layout-sidebar #quiet-newmail');
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(page).toHaveURL(/_action=compose/);
});

test('selected folder is a pill', async ({ page, context }) => {
  await setColorMode(context, 'light');
  await login(page);
  const li = page.locator('#mailboxlist li.mailbox.selected > a').first();
  await expect(li).toBeVisible();
  const s = await li.evaluate((e) => {
    const c = getComputedStyle(e);
    return { bg: c.backgroundColor, radius: c.borderTopLeftRadius };
  });
  expect(s.bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(s.bg).not.toBe('transparent');
  expect(s.radius).toBe('6px');
});

test('unread count shown on INBOX', async ({ page }) => {
  await login(page);
  const count = page.locator('#mailboxlist li.inbox .unreadcount').first();
  await expect(count).toBeVisible();
  expect(parseInt((await count.textContent()) ?? '0', 10)).toBeGreaterThan(0);
});

test('folder actions menu has Empty, Compact, Manage folders', async ({ page }) => {
  await login(page);
  const trigger = page.locator('#quiet-folder-actions');
  await expect(trigger).toBeVisible();
  await trigger.click();
  const menu = page.locator('#mailboxoptions-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByText('Empty', { exact: true })).toBeVisible();
  await expect(menu.getByText('Compact', { exact: true })).toBeVisible();
  await expect(menu.getByText('Manage folders')).toBeVisible();
  await expect(menu.locator('a.purge')).toHaveCount(1);
  await expect(menu.locator('a.expunge')).toHaveCount(1);
  await expect(menu.locator('a.folders')).toHaveAttribute('href', /_task=settings&_action=folders/);
});

test('quota text at bottom of pane', async ({ page }) => {
  await login(page);
  const q = page.locator('#layout-sidebar #quotadisplay');
  await expect(q).toBeVisible();
  const [qb, lb, sb] = await Promise.all([
    q.boundingBox(),
    page.locator('#mailboxlist').boundingBox(),
    page.locator('#layout-sidebar').boundingBox(),
  ]);
  expect(qb!.y).toBeGreaterThan(lb!.y);
  expect(qb!.y + qb!.height).toBeGreaterThan(sb!.y + sb!.height - 60);
  await expect(q.locator('.count')).toContainText(/\S/);
});
