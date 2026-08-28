import { expect, test, type Page } from '@playwright/test';

const deal = {
  id: 'e2e-calendar-deal',
  title: '新品发布合作视频',
  brand_name: '星河品牌',
  agency_name: '',
  contact_name: '测试联系人',
  contact_channel: '微信',
  source: 'brand_direct',
  deliverable_type: 'custom_video',
  status: 'producing',
  contract_status: 'signed',
  contract_summary: '已签署测试合同',
  brief: '验证日历周视图紧凑商单卡片。',
  requirements: '',
  restrictions: '',
  amount_cents: 128000,
  payment_status: 'unpaid',
  paid_at: null,
  delivery_due_date: '2026-08-28',
  publish_date: null,
  next_action: '确认脚本交付时间',
  next_action_due_date: '2026-08-27',
  published_video_id: null,
  created_at: '2026-08-25T00:00:00.000Z',
  updated_at: '2026-08-25T00:00:00.000Z',
  primary_topic_id: null,
  primary_topic_title: null,
  linked_topic_count: 0,
};

const dealDetail = {
  ...deal,
  topics: [],
  activities: [],
  published_video: null,
};

async function mockWorkspace(page: Page) {
  await page.route('**/api/bootstrap**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        topics: [],
        people: [],
        relationships: [],
        published: [],
        tags: [],
        settings: {
          reading_speed: 280,
          theme: 'light',
          stale_action_days: 5,
          default_share_ttl_days: 3,
          voiceover_cues: ['[停顿 1s]', '[重音]'],
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
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/published', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/deals/page*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: [deal],
        page: 1,
        page_size: 100,
        total: 1,
        total_pages: 1,
        summary: {
          active_count: 1,
          due_soon_count: 1,
          needs_action_count: 0,
          unpaid_amount_cents: deal.amount_cents,
          unpaid_count: 1,
        },
      }),
    });
  });
  await page.route(`**/api/deals/${deal.id}`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(dealDetail) });
  });
}

async function login(page: Page) {
  await page.goto('/');
  await page.locator('input[name="password"]').fill('admin');
  await page.getByRole('button', { name: '进入工作台' }).click();
  await expect(page).toHaveURL(/\/today$/);
}

test('周视图商单卡片保持紧凑且可返回原周视图', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await mockWorkspace(page);
  await login(page);

  await page.goto('/calendar?view=week&date=2026-08-28');
  await expect(page.getByRole('heading', { name: '选题日历', exact: true })).toBeVisible();

  const event = page.getByTestId('calendar-event').filter({ hasText: '星河品牌' });
  await expect(event).toBeVisible();
  await expect(event).toContainText('制作中');
  await expect(event).not.toContainText('收集箱');

  const layout = await event.evaluate((element) => ({
    cardWidth: element.getBoundingClientRect().width,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    titleLines: (() => {
      const title = element.querySelector<HTMLElement>('[data-testid="calendar-event-title"]');
      if (!title) return 0;
      return Math.round(title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight));
    })(),
  }));
  expect(layout.cardWidth).toBeGreaterThan(0);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.titleLines).toBeLessThanOrEqual(1);

  await event.click();
  await expect(page).toHaveURL(/\/deals\/e2e-calendar-deal$/);
  const backButton = page.getByRole('button', { name: '返回选题日历' });
  await expect(backButton).toBeVisible();
  await backButton.click();
  await expect(page).toHaveURL('/calendar?view=week&date=2026-08-28');
  await expect(page.getByRole('button', { name: '周视图' })).toHaveClass(/bg-white/);
  expect(pageErrors).toEqual([]);
});

test('直接打开商单详情时返回按钮回退到商单中心', async ({ page }) => {
  await mockWorkspace(page);
  await login(page);

  await page.goto(`/deals/${deal.id}`);
  const backButton = page.getByRole('button', { name: '返回商单中心' });
  await expect(backButton).toBeVisible();
  await backButton.click();
  await expect(page).toHaveURL(/\/deals$/);
  await expect(page.getByRole('heading', { name: '商单中心', exact: true })).toBeVisible();
});
