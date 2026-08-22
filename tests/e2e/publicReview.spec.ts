import { expect, test } from '@playwright/test';

test('can leave a public review route without breaking React hooks', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/share/invalid-token');
  await expect(page.getByRole('heading', { name: '审稿链接不可用' })).toBeVisible();
  await page.getByRole('link', { name: '登录创作者工作台' }).click();

  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('heading', { name: '选题生产工作台' })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('sanitizes executable HTML in public review snapshots', async ({ page }) => {
  await page.route('**/api/public/share/xss-proof', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'xss-proof',
        topic_id: 'topic-1',
        topic_title: '安全审稿',
        content_html: '<h1>正文</h1><img src="x" onerror="window.__xssProof=1337"><script>window.__xssProof=1337</script><span class="script-citation" data-citation-id="citation-1">引用</span>',
        word_count: 2,
        reading_speed: 280,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    });
  });

  await page.goto('/share/xss-proof');
  await expect(page.getByRole('heading', { name: '安全审稿' })).toBeVisible();
  await expect(page.locator('[data-citation-id="citation-1"]')).toHaveText('引用');
  await expect(page.locator('article script')).toHaveCount(0);
  await expect(page.locator('article [onerror]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as typeof window & { __xssProof?: number }).__xssProof)).toBeUndefined();
});
