import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/');
  const password = page.locator('input[name="password"]');
  if (await password.count()) {
    await password.fill('admin');
    await page.getByRole('button', { name: '进入工作台' }).click();
  }
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator('main h1')).toBeVisible();
}

test('非今日页面不加载完整 Today 聚焦列表', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/api/')) apiRequests.push(pathname);
  });

  await login(page);
  expect(apiRequests).toContain('/api/today/focus');
  expect(apiRequests).toContain('/api/topics/summary');

  apiRequests.length = 0;
  await page.goto('/kanban');
  await expect(page.locator('main h1')).toBeVisible();
  expect(apiRequests).not.toContain('/api/today/focus');
});

test('退出登录后清理会话缓存，重新登录重新获取数量摘要', async ({ page }) => {
  const summaryRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/topics/summary') summaryRequests.push(request.url());
  });

  await login(page);
  const firstLoginSummaryCount = summaryRequests.length;
  expect(firstLoginSummaryCount).toBeGreaterThan(0);

  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.locator('input[name="password"]')).toBeVisible();

  summaryRequests.length = 0;
  await login(page);
  expect(summaryRequests.length).toBeGreaterThan(0);
});
