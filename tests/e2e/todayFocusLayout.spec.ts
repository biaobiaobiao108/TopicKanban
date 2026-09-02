import { expect, test } from '@playwright/test';

test('今日聚焦两列保持固定高度，近期轨迹始终展开并在面板内滚动', async ({ page }) => {
  await page.route('**/api/today/focus', async (route) => {
    const response = await route.fetch();
    const data = await response.json() as { topics: Array<Record<string, unknown>>; total_active: number };
    const seed = data.topics[0] || {
      id: 'e2e-today-layout-seed',
      title: '布局测试选题',
      summary: '',
      hook: '',
      storyline: '',
      why_now: '',
      status: 'approved',
      priority: 'medium',
      current_todo: null,
      target_publish_date: null,
      deadline: null,
      score_character: 1,
      score_conflict: 1,
      score_contrast: 1,
      score_material: 1,
      score_story: 1,
      is_pinned: 0,
      sort_order: 0,
      created_at: '2026-08-25T00:00:00.000Z',
      updated_at: '2026-08-25T00:00:00.000Z',
      tags: [],
      people: [],
      commercial_deals_count: 0,
      sources_count: 0,
      verified_sources_count: 0,
      draft_word_count: 0,
    };
    const topics = Array.from({ length: 8 }, (_, index) => ({
      ...seed,
      id: `e2e-today-layout-${index}`,
      title: `今日聚焦布局测试 ${index + 1}`,
      current_todo: null,
      is_pinned: 0,
      updated_at: new Date(Date.UTC(2026, 8, 2, 10, index)).toISOString(),
    }));
    await route.fulfill({ response, body: JSON.stringify({ ...data, topics, total_active: topics.length }) });
  });

  await page.goto('/');
  await page.locator('input[name="password"]').fill('admin');
  await page.getByRole('button', { name: '进入工作台' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('heading', { name: '今日生产聚焦', exact: true, level: 1 })).toBeVisible();

  const actionColumn = page.getByTestId('today-action-progress-column');
  const recentColumn = page.getByTestId('today-recent-activity-column');
  const actionPanel = page.getByTestId('today-action-progress-panel');
  const recentPanel = page.getByTestId('today-recent-activity-panel');
  await expect(actionColumn).toHaveCSS('height', '352px');
  await expect(recentColumn).toHaveCSS('height', '352px');

  const getHeights = async () => {
    const [actionColumnBox, recentColumnBox, actionPanelBox, recentPanelBox] = await Promise.all([
      actionColumn.boundingBox(),
      recentColumn.boundingBox(),
      actionPanel.boundingBox(),
      recentPanel.boundingBox(),
    ]);
    return [actionColumnBox?.height, recentColumnBox?.height, actionPanelBox?.height, recentPanelBox?.height];
  };

  const initialHeights = await getHeights();
  expect(initialHeights[0]).toBeCloseTo(initialHeights[1] || 0, 0);
  expect(initialHeights[2]).toBeCloseTo(initialHeights[3] || 0, 0);
  await expect(page.getByRole('button', { name: '收起近期轨迹' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /展开另外/ })).toHaveCount(0);
  await expect(page.getByTestId('today-recent-activity-item')).toHaveCount(8);
  await expect(page.getByText('近期活跃选题', { exact: true })).toBeVisible();
  await expect(page.getByTestId('today-recent-activity-count')).toHaveText('8');

  const initialScrollState = await page.getByTestId('today-recent-activity-scroll').evaluate((element) => ({
    overflowY: getComputedStyle(element).overflowY,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(initialScrollState.overflowY).toBe('auto');
  expect(initialScrollState.scrollHeight).toBeGreaterThan(initialScrollState.clientHeight);

  const scrollState = await page.getByTestId('today-recent-activity-scroll').evaluate((element) => ({
    overflowY: getComputedStyle(element).overflowY,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(scrollState.overflowY).toBe('auto');
  expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
});
