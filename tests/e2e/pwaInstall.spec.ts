import { devices, expect, test } from '@playwright/test';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('input[name="password"]').fill('admin');
  await page.getByRole('button', { name: '进入工作台' }).click();
  await expect(page).toHaveURL(/\/today$/);
}

test('PWA manifest and service worker are available from the app shell', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest/);
  const manifest = await page.evaluate(async () => {
    const response = await fetch('/manifest.webmanifest');
    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      body: await response.json() as { display?: string; start_url?: string },
    };
  });
  expect(manifest.status).toBe(200);
  expect(manifest.contentType).toContain('application/manifest+json');
  expect(manifest.body.display).toBe('standalone');
  expect(manifest.body.start_url).toBe('/today');

  await expect.poll(
    () => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration('/'))),
    { timeout: 10_000 },
  ).toBe(true);
  await page.reload();
  await expect.poll(
    () => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL || ''),
    { timeout: 10_000 },
  ).toContain('/sw.js');
  expect(pageErrors).toEqual([]);
});

test('Android install prompt uses the native beforeinstallprompt event', async ({ page }) => {
  await login(page);

  await page.evaluate(() => {
    (window as Window & { pwaPromptCalled?: boolean }).pwaPromptCalled = false;
    const installEvent = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperties(installEvent, {
      prompt: {
        value: async () => {
          (window as Window & { pwaPromptCalled?: boolean }).pwaPromptCalled = true;
        },
      },
      userChoice: {
        value: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
      },
    });
    window.dispatchEvent(installEvent);
  });

  const installButton = page.getByRole('button', { name: '安装到手机' }).first();
  await expect(installButton).toBeVisible();
  await installButton.click();
  await expect.poll(() => page.evaluate(() => (window as Window & { pwaPromptCalled?: boolean }).pwaPromptCalled)).toBe(true);
  await expect(page.getByRole('status')).toContainText('已打开安装提示');
});

test('iOS shows Add to Home Screen guidance and keeps mobile layout within the viewport', async ({ browser }) => {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  try {
    await login(page);
    await expect(page.getByRole('button', { name: '添加到主屏幕' }).first()).toBeVisible();
    await page.getByRole('button', { name: '添加到主屏幕' }).first().click();
    await expect(page.getByRole('dialog', { name: '安装到手机' })).toContainText('打开分享菜单');

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '打开菜单' }).click();
    await expect(page.getByRole('dialog', { name: '移动端导航菜单' }).getByRole('button', { name: '添加到主屏幕' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  } finally {
    await context.close();
  }
});

test('standalone display mode hides install prompts', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      if (query === '(display-mode: standalone)') {
        return {
          matches: true,
          media: query,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        } as MediaQueryList;
      }
      return originalMatchMedia(query);
    };
  });
  await login(page);
  await expect(page.getByRole('button', { name: /安装到手机|添加到主屏幕|查看安装说明/ })).toHaveCount(0);
});

test('PWA chrome color follows the selected application theme', async ({ page }) => {
  await login(page);
  await page.goto('/settings');

  await page.getByRole('button', { name: /深色专注/ }).click();
  await expect.poll(() => page.evaluate(() => ({
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    statusBar: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute('content'),
  }))).toEqual({ themeColor: '#1c1917', statusBar: 'black-translucent' });

  await page.getByRole('button', { name: /经典浅色/ }).click();
  await expect.poll(() => page.evaluate(() => ({
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    statusBar: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute('content'),
  }))).toEqual({ themeColor: '#ffffff', statusBar: 'default' });
});
