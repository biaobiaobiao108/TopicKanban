import { expect, test, type Page } from '@playwright/test';

const topic = {
  id: 'e2e-publish-topic',
  title: 'E2E 发布包测试选题',
  summary: '这是用于验证发布包生成器的测试摘要。',
  hook: '一个测试用的封面短句',
  storyline: '测试故事线',
  why_now: '测试用的传播时机',
  status: 'production',
  priority: 'medium',
  next_action: '验证发布包',
  score_character: 2,
  score_conflict: 2,
  score_contrast: 2,
  score_material: 2,
  score_story: 2,
  is_pinned: 0,
  sort_order: 0,
  created_at: '2026-08-25T00:00:00.000Z',
  updated_at: '2026-08-25T00:00:00.000Z',
  tags: [{ id: 'e2e-tag', name: '测试标签' }],
  people: [],
};

const workspace = {
  sources: [],
  timeline: [],
  citations: [],
  draft: {
    id: 'e2e-draft',
    topic_id: topic.id,
    title: topic.title,
    content_html: '<h1>开场</h1><p>测试文案内容。</p><h2>第一次反转</h2><p>更多测试文案内容。</p>',
    content_json: JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '开场' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '测试文案内容。' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '第一次反转' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '更多测试文案内容。' }] },
      ],
    }),
    word_count: 18,
    version: 1,
    updated_at: '2026-08-25T00:00:00.000Z',
  },
};

async function mockWorkspace(page: Page, draft = workspace.draft) {
  await page.route('**/api/bootstrap**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        topics: [topic],
        people: [],
        relationships: [],
        published: [],
        tags: topic.tags,
        settings: {
          reading_speed: 280,
          theme: 'light',
          stale_action_days: 5,
          default_share_ttl_days: 3,
        },
      }),
    });
  });
  await page.route('**/api/topics/trash', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/people', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/relationships', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/tags', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(topic.tags) });
  });
  await page.route(`**/api/topics/${topic.id}/workspace`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ...workspace, draft }),
    });
  });
}

async function login(page: Page) {
  await page.goto('/');
  await page.locator('input[name="password"]').fill('admin');
  await page.getByRole('button', { name: '进入工作台' }).click();
}

test('发布包可编辑、复制并导出 Markdown', async ({ page }) => {
  await mockWorkspace(page);
  await login(page);
  await page.goto(`/topics/${topic.id}?tab=publish`);

  await expect(page.getByRole('heading', { name: 'B站发布包' })).toBeVisible();
  await expect(page.getByLabel('投稿标题')).toHaveValue(topic.title);
  await expect(page.locator('input[name^="chapter_title_"]')).toHaveCount(2);

  await page.getByLabel('视频简介').fill('这是用户临时修改后的简介。');
  await page.getByRole('button', { name: '手动添加章节' }).click();
  await expect(page.locator('input[name^="chapter_title_"]')).toHaveCount(3);
  await expect(page.getByText('当前发布包有未保存的临时修改，离开页面后会丢失。')).toBeVisible();

  await page.getByRole('button', { name: '复制完整发布包', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '已复制完整发布包' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('B站发布包-');
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  expect(await page.locator('body').evaluate((body) => body.textContent?.includes('B站发布包'))).toBe(true);
});

test('没有草稿时阻止复制和导出发布包', async ({ page }) => {
  await mockWorkspace(page, null);
  await login(page);
  await page.goto(`/topics/${topic.id}?tab=publish`);

  await expect(page.getByRole('heading', { name: '缺少必要内容' })).toBeVisible();
  await expect(page.getByText('文案正文为空')).toBeVisible();
  await expect(page.getByRole('button', { name: '复制完整发布包', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Markdown', exact: true })).toBeDisabled();
});
