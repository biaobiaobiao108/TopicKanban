import { expect, test, type Locator, type Page } from '@playwright/test';

type TestTopic = {
  id: string;
  title: string;
  summary: string;
  hook: string;
  storyline: string;
  why_now: string;
  status: 'inbox' | 'approved' | 'scripting' | 'production';
  priority: 'medium';
  current_todo: null;
  target_publish_date: string | null;
  deadline: null;
  score_character: number;
  score_conflict: number;
  score_contrast: number;
  score_material: number;
  score_story: number;
  is_pinned: 0;
  sort_order: number;
  created_at: string;
  updated_at: string;
  tags: never[];
  people: never[];
  commercial_deals_count: number;
  deleted_at: null;
};

function makeTopic(
  id: string,
  title: string,
  status: TestTopic['status'],
  sortOrder: number,
  targetPublishDate: string | null = null,
): TestTopic {
  return {
    id,
    title,
    summary: `用于拖拽回归：${title}`,
    hook: '验证拖拽交互',
    storyline: '拖拽后保持稳定排序。',
    why_now: '防止拖拽回归。',
    status,
    priority: 'medium',
    current_todo: null,
    target_publish_date: targetPublishDate,
    deadline: null,
    score_character: 1,
    score_conflict: 1,
    score_contrast: 1,
    score_material: 1,
    score_story: 1,
    is_pinned: 0,
    sort_order: sortOrder,
    created_at: '2026-08-25T00:00:00.000Z',
    updated_at: '2026-08-25T00:00:00.000Z',
    tags: [],
    people: [],
    commercial_deals_count: 0,
    deleted_at: null,
  };
}

async function mockWorkspace(
  page: Page,
  options: { failReorder?: boolean; calendar?: boolean } = {},
) {
  const state: {
    topics: TestTopic[];
    reorderRequests: Array<Array<{ id: string; status: TestTopic['status']; sort_order: number }>>;
  } = {
    topics: options.calendar
      ? [makeTopic('e2e-calendar-drag-topic', '日历拖拽回归选题', 'production', 1)]
      : [
          makeTopic('e2e-kanban-one', '看板拖拽第一张', 'inbox', 1),
          makeTopic('e2e-kanban-two', '看板拖拽第二张', 'inbox', 2),
          makeTopic('e2e-kanban-approved', '已立项目标卡片', 'approved', 1),
        ],
    reorderRequests: [],
  };
  const settings = {
    reading_speed: 280,
    theme: 'light',
    stale_action_days: 5,
    default_share_ttl_days: 3,
    voiceover_cues: [],
  };

  await page.route('**/api/bootstrap**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ topics: state.topics, people: [], relationships: [], published: [], tags: [], settings }),
    });
  });
  await page.route('**/api/settings', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(settings) });
  });
  await page.route('**/api/today/focus', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ topics: [], total_active: state.topics.length }) });
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
  await page.route('**/api/todos', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/published', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/deals/page*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [], page: 1, page_size: 100, total: 0, total_pages: 0 }),
    });
  });
  await page.route('**/api/topics?*', async (route) => {
    const url = new URL(route.request().url());
    const status = url.searchParams.get('status');
    const items = state.topics
      .filter((topic) => !status || topic.status === status)
      .filter((topic) => !topic.deleted_at)
      .sort((a, b) => a.sort_order - b.sort_order);
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items, page: 1, page_size: 30, total: items.length, total_pages: items.length ? 1 : 0 }),
    });
  });
  await page.route('**/api/topics/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname.endsWith('/reorder/batch')) {
      const body = request.postDataJSON() as { updates: Array<{ id: string; status: TestTopic['status']; sort_order: number }> };
      state.reorderRequests.push(body.updates);
      if (options.failReorder) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '模拟拖拽保存失败' }) });
        return;
      }
      const updates = new Map(body.updates.map((update) => [update.id, update]));
      state.topics = state.topics.map((topic) => {
        const update = updates.get(topic.id);
        return update ? { ...topic, status: update.status, sort_order: update.sort_order } : topic;
      });
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, updated_at: new Date().toISOString() }) });
      return;
    }

    const topicId = decodeURIComponent(pathname.split('/')[3] || '');
    const topic = state.topics.find((item) => item.id === topicId);
    if (!topic) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: '选题不存在' }) });
      return;
    }

    if (request.method() === 'PATCH') {
      const updates = request.postDataJSON() as Partial<TestTopic>;
      state.topics = state.topics.map((item) => item.id === topicId ? { ...item, ...updates } : item);
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(state.topics.find((item) => item.id === topicId)) });
  });

  return state;
}

async function login(page: Page) {
  await page.goto('/');
  await page.locator('input[name="password"]').fill('admin');
  await page.getByRole('button', { name: '进入工作台' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator('main h1')).toBeVisible();
}

async function dragPointer(page: Page, start: Locator, draggedCard: Locator, target: Locator) {
  const startBox = await start.boundingBox();
  const draggedBox = await draggedCard.boundingBox();
  const targetBox = await target.boundingBox();
  if (!startBox || !draggedBox || !targetBox) throw new Error('拖拽测试元素缺少布局尺寸');

  const startPoint = { x: startBox.x + startBox.width / 2, y: startBox.y + startBox.height / 2 };
  const pointerOffset = {
    x: draggedBox.x + draggedBox.width / 2 - startPoint.x,
    y: draggedBox.y + draggedBox.height / 2 - startPoint.y,
  };
  await page.mouse.move(startPoint.x, startPoint.y);
  await page.mouse.down();
  await page.mouse.move(startPoint.x + 12, startPoint.y + 4, { steps: 2 });
  await expect(draggedCard).toHaveClass(/transition-none/);

  const dragStyle = await draggedCard.evaluate((element) => {
    const style = getComputedStyle(element);
    return { transitionProperty: style.transitionProperty, willChange: style.willChange };
  });
  expect(dragStyle.transitionProperty).not.toContain('transform');
  expect(dragStyle.willChange).toContain('transform');

  await page.mouse.move(
    targetBox.x + targetBox.width / 2 - pointerOffset.x,
    targetBox.y + targetBox.height / 2 - pointerOffset.y,
    { steps: 10 },
  );
  await page.mouse.up();
}

test('看板同列拖拽不插值 transform，并在释放后立即稳定', async ({ page }) => {
  const state = await mockWorkspace(page);
  await login(page);
  await page.goto('/kanban');

  const source = page.locator('[data-topic-id="e2e-kanban-one"]');
  const target = page.locator('[data-topic-id="e2e-kanban-two"]');
  await expect(source).toBeVisible();
  await dragPointer(page, source, source, target);

  await expect(page.getByTestId('kanban-drag-overlay')).toHaveCount(0);
  await expect.poll(() => state.reorderRequests.length).toBe(1);
  await expect.poll(async () => page.locator('[data-column-status="inbox"] [data-topic-id]').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-topic-id')))).toEqual([
    'e2e-kanban-two',
    'e2e-kanban-one',
  ]);
});

test('看板跨列拖拽同时更新原列和目标列顺序', async ({ page }) => {
  const state = await mockWorkspace(page);
  await login(page);
  await page.goto('/kanban');

  const source = page.locator('[data-topic-id="e2e-kanban-one"]');
  const targetColumn = page.locator('[data-column-status="approved"]');
  await expect(source).toBeVisible();
  await dragPointer(page, source, source, targetColumn);

  await expect(page.getByTestId('kanban-drag-overlay')).toHaveCount(0);
  await expect.poll(() => state.reorderRequests.length).toBe(1);
  const updates = state.reorderRequests[0];
  expect(updates).toEqual(expect.arrayContaining([
    { id: 'e2e-kanban-one', status: 'approved', sort_order: 1 },
    { id: 'e2e-kanban-approved', status: 'approved', sort_order: 2 },
    { id: 'e2e-kanban-two', status: 'inbox', sort_order: 1 },
  ]));
});

test('看板拖拽保存失败时恢复列、卡片和已加载列表', async ({ page }) => {
  const state = await mockWorkspace(page, { failReorder: true });
  await login(page);
  await page.goto('/kanban');

  const source = page.locator('[data-topic-id="e2e-kanban-one"]');
  const targetColumn = page.locator('[data-column-status="approved"]');
  await expect(source).toBeVisible();
  await dragPointer(page, source, source, targetColumn);

  await expect(page.getByTestId('kanban-drag-overlay')).toHaveCount(0);
  await expect.poll(() => state.reorderRequests.length).toBe(1);
  await expect(page.locator('[data-column-status="inbox"] [data-topic-id="e2e-kanban-one"]')).toBeVisible();
  await expect(page.locator('[data-column-status="approved"] [data-topic-id="e2e-kanban-one"]')).toHaveCount(0);
});

test('日历未排期池拖拽到日期后不保留释放动画', async ({ page }) => {
  const state = await mockWorkspace(page, { calendar: true });
  await login(page);
  await page.goto('/calendar?view=month&date=2026-09-03');

  const card = page.getByTestId('unscheduled-topic-card');
  const handle = card.getByRole('button', { name: /拖拽「日历拖拽回归选题」/ });
  const targetDate = page.locator('[data-testid="calendar-month-cell"][data-date="2026-09-10"]');
  await expect(card).toBeVisible();
  await expect(targetDate).toBeVisible();
  await dragPointer(page, handle, card, targetDate);

  await expect(page.getByTestId('calendar-drag-overlay')).toHaveCount(0);
  await expect.poll(() => state.topics.find((topic) => topic.id === 'e2e-calendar-drag-topic')?.target_publish_date).toMatch(/^2026-09-\d{2}$/);
  await expect(card).toHaveCount(0);
});

test('日历已有选题定档表单的日期字段高度和占位提示保持一致', async ({ page }) => {
  await mockWorkspace(page, { calendar: true });
  await login(page);
  await page.goto('/calendar?view=agenda&date=2026-09-03');

  await page.getByRole('button', { name: '在此日期排期定档' }).click();
  const dialog = page.getByRole('dialog', { name: /排期定档/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('计划发布日期', { exact: true })).toBeVisible();
  await expect(dialog.getByText('计划发布日期 (YYYYMMDD / YYYY-MM-DD)', { exact: true })).toHaveCount(0);

  const dateInputs = dialog.locator('input[placeholder*="YYYYMMDD"]');
  await expect(dateInputs).toHaveCount(2);
  const dateStyles = await dateInputs.evaluateAll((inputs) => inputs.map((input) => {
    const style = getComputedStyle(input);
    return {
      height: style.height,
      className: input.className,
    };
  }));
  expect(dateStyles[0].height).toBe(dateStyles[1].height);
  expect(dateStyles.every(({ className }) => className.includes('placeholder:text-stone-400/60'))).toBe(true);
});
