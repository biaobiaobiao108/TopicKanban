import { expect, test, type Page } from '@playwright/test';

const tags = [
  { id: 'mobile-tag-a', name: '人物故事', color: 'rose' },
  { id: 'mobile-tag-b', name: '互联网争议', color: 'indigo' },
];

const topics = [
  ...Array.from({ length: 3 }, (_, index) => ({
    id: `mobile-inbox-${index}`,
    title: `收集箱选题 ${index + 1}`,
    status: 'inbox',
    sort_order: index,
    tags: [tags[0]],
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    id: `mobile-approved-${index}`,
    title: `已立项选题 ${index + 1}`,
    status: 'approved',
    sort_order: index,
    tags: [tags[1]],
  })),
].map((topic) => ({
  summary: '',
  hook: '',
  storyline: '',
  why_now: '',
  priority: 'medium',
  score_character: 1,
  score_conflict: 1,
  score_contrast: 1,
  score_material: 1,
  score_story: 1,
  is_pinned: 0,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  people: [],
  commercial_deals_count: 0,
  ...topic,
}));

const longKanbanTopics = Array.from({ length: 60 }, (_, index) => ({
  ...topics[index % topics.length],
  id: `mobile-long-${index}`,
  title: `${index < 30 ? '收集箱' : '已立项'} 长列表选题 ${index + 1}`,
  status: index < 30 ? 'inbox' : 'approved',
  sort_order: index,
}));

async function mockWorkspace(page: Page, workspaceTopics = topics) {
  await page.route('**/api/bootstrap**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        topics: workspaceTopics,
        people: [],
        relationships: [],
        published: [],
        tags,
        settings: {
          reading_speed: 280,
          theme: 'light',
          stale_action_days: 5,
          default_share_ttl_days: 3,
          voiceover_cues: [],
        },
      }),
    });
  });

  const emptyListRoutes = [
    '**/api/topics/trash',
    '**/api/todos',
    '**/api/people',
    '**/api/relationships',
    '**/api/tags',
    '**/api/published',
  ];
  for (const routePattern of emptyListRoutes) {
    await page.route(routePattern, async (route) => {
      await route.fulfill({ contentType: 'application/json', body: '[]' });
    });
  }

  await page.route('**/api/tags/page*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: tags.map((tag) => ({
          ...tag,
          stats: { count: 3, in_progress_count: 0, published_count: 0, words_total: 0, avg_score: 0 },
        })),
        page: 1,
        page_size: 30,
        total: tags.length,
        total_pages: 1,
        summary: { tagged_topics: topics.length, total_topics: topics.length },
      }),
    });
  });

  await page.route(/\/api\/topics\?/, async (route) => {
    const url = new URL(route.request().url());
    const status = url.searchParams.get('status');
    const tagId = url.searchParams.get('tag_id');
    const statusList = status?.split(',').filter(Boolean);
    const items = workspaceTopics.filter((topic) => (
      (!statusList?.length || statusList.includes(topic.status))
      && (!tagId || topic.tags?.some((tag) => tag.id === tagId))
    ));
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items, page: 1, page_size: 30, total: items.length, total_pages: 1 }),
    });
  });

  await page.route('**/api/published/page*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [], page: 1, page_size: 30, total: 0, total_pages: 0 }),
    });
  });

  await page.route('**/api/deals/page*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: [], page: 1, page_size: 30, total: 0, total_pages: 0,
        summary: { active_count: 0, due_soon_count: 0, needs_action_count: 0, unpaid_amount_cents: 0, unpaid_count: 0 },
      }),
    });
  });
}

async function login(page: Page) {
  await page.goto('/');
  const password = page.locator('input[name="password"]');
  if (await password.count()) {
    await password.fill('admin');
    await page.getByRole('button', { name: '进入工作台' }).click();
  }
  await expect(page).toHaveURL(/\/today$/);
}

async function expectNoViewportOverflow(page: Page) {
  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    mainWidth: document.querySelector('main')?.scrollWidth || 0,
    mainClientWidth: document.querySelector('main')?.clientWidth || 0,
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.documentClientWidth + 1);
  expect(layout.mainWidth).toBeLessThanOrEqual(layout.mainClientWidth + 1);
}

test('移动端看板使用单列阶段视图并提供平滑阶段切换', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWorkspace(page);
  await login(page);
  await page.goto('/kanban');

  await expect(page.getByTestId('kanban-mobile-stage')).toBeVisible();
  await expect(page.getByTestId('kanban-mobile-stage').locator('.kanban-column-container')).toHaveCount(1);
  await expect(page.getByTestId('kanban-desktop-board')).toBeHidden();
  await expectNoViewportOverflow(page);

  const approvedStage = page.getByRole('button', { name: /已立项/ }).last();
  await approvedStage.click();
  await expect(page.getByTestId('kanban-mobile-stage')).toContainText('已立项');
  const animationName = await page.getByTestId('kanban-mobile-stage').evaluate((element) => getComputedStyle(element).animationName);
  expect(animationName).toContain('mobile-stage-enter');
});

test('移动端标签页使用单一选题流和单一滚动上下文', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await mockWorkspace(page);
  await login(page);
  await page.goto('/tags');

  await expect(page.getByTestId('tags-mobile-picker')).toBeVisible();
  await expect(page.locator('.tags-sidebar-panel')).toBeHidden();
  await expect(page.getByTestId('tags-topic-stream')).toBeVisible();

  const picker = page.getByTestId('tags-mobile-picker').getByRole('combobox');
  await picker.click();
  await page.getByRole('option', { name: '#互联网争议' }).click();
  await expect(page.getByTestId('tags-topic-stream')).toContainText('已立项选题');

  const scrollableElements = await page.getByTestId('tags-page').evaluate((root) => (
    [...root.querySelectorAll<HTMLElement>('*')].filter((element) => {
      const style = getComputedStyle(element);
      return element.scrollHeight > element.clientHeight + 1 && ['auto', 'scroll'].includes(style.overflowY);
    }).length
  ));
  expect(scrollableElements).toBeLessThanOrEqual(1);
  await expectNoViewportOverflow(page);
});

test('移动端长看板阶段栏保持完整高度且不被长列表挤压', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWorkspace(page, longKanbanTopics);
  await login(page);
  await page.goto('/kanban');

  const stageTabs = page.getByTestId('kanban-mobile-stage-tabs');
  await expect(stageTabs).toBeVisible();
  const layout = await stageTabs.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const buttons = [...element.querySelectorAll<HTMLButtonElement>('button')].map((button) => {
      const buttonRect = button.getBoundingClientRect();
      return { top: buttonRect.top, bottom: buttonRect.bottom };
    });
    return {
      height: rect.height,
      bottom: rect.bottom,
      buttonsInside: buttons.every((button) => button.top >= rect.top && button.bottom <= rect.bottom),
    };
  });
  expect(layout.height).toBeGreaterThanOrEqual(36);
  expect(layout.buttonsInside).toBe(true);
  await expectNoViewportOverflow(page);
});

test('减少动态效果时移动端阶段动画会降级为即时切换', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWorkspace(page);
  await login(page);
  await page.goto('/kanban');

  const animationDuration = await page.getByTestId('kanban-mobile-stage').evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(animationDuration)).toBeLessThanOrEqual(0.01);
});
