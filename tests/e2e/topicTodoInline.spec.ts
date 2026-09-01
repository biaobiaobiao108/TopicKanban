import { expect, test, type Page } from '@playwright/test';

const currentTodo = {
  id: 'e2e-inline-current',
  topic_id: 'e2e-inline-topic',
  title: '确认当前行动',
  is_current: 1,
  current_started_at: '2026-08-25T00:00:00.000Z',
  completed_at: null,
  sort_order: 1,
  created_at: '2026-08-25T00:00:00.000Z',
  updated_at: '2026-08-25T00:00:00.000Z',
};

const topic = {
  id: 'e2e-inline-topic',
  title: 'Todo 内联交互测试选题',
  summary: '验证 Todo 列表内联创建、编辑和拖动排序。',
  hook: '验证 Todo 交互',
  storyline: '先创建，再编辑，最后排序。',
  why_now: '上线前回归测试。',
  status: 'production',
  priority: 'medium',
  current_todo: currentTodo,
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
};

const makeTodo = (id: string, title: string, sortOrder: number) => ({
  id,
  topic_id: topic.id,
  title,
  is_current: 0,
  current_started_at: null,
  completed_at: null,
  sort_order: sortOrder,
  created_at: '2026-08-25T00:00:00.000Z',
  updated_at: '2026-08-25T00:00:00.000Z',
});

async function mockWorkspace(page: Page) {
  let todos = [currentTodo, makeTodo('e2e-inline-two', '整理第二条', 2), makeTodo('e2e-inline-three', '整理第三条', 3)];
  let currentTopic = { ...topic };
  const getTopic = () => ({ ...currentTopic, current_todo: todos.find((todo) => todo.is_current === 1 && !todo.completed_at) || null });
  const mutationResponse = () => ({ topic: getTopic(), todos: [...todos].sort((a, b) => a.sort_order - b.sort_order) });

  await page.route('**/api/bootstrap**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        topics: [getTopic()], people: [], relationships: [], published: [], tags: [],
        settings: { reading_speed: 280, theme: 'light', stale_action_days: 5, default_share_ttl_days: 3, voiceover_cues: [] },
      }),
    });
  });
  await page.route('**/api/today/focus', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ topics: [getTopic()], total_active: 1 }) });
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
  await page.route(`**/api/topics/${topic.id}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      currentTopic = { ...currentTopic, ...(route.request().postDataJSON() as Partial<typeof topic>) };
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(getTopic()) });
  });
  await page.route(`**/api/topics/${topic.id}/todos`, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { title: string };
      const id = `e2e-inline-created-${todos.length}`;
      todos = [...todos, makeTodo(id, body.title, Math.max(...todos.map((todo) => todo.sort_order)) + 1)];
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(route.request().method() === 'GET' ? todos : mutationResponse()) });
  });
  await page.route(`**/api/topics/${topic.id}/todos/reorder`, async (route) => {
    const body = route.request().postDataJSON() as { ids: string[] };
    const order = new Map(body.ids.map((id, index) => [id, index + 1]));
    todos = todos.map((todo) => order.has(todo.id) ? { ...todo, sort_order: order.get(todo.id)! } : todo);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(mutationResponse()) });
  });
  await page.route(`**/api/todos/${currentTodo.id}`, async (route) => {
    const body = route.request().postDataJSON() as { title?: string };
    todos = todos.map((todo) => todo.id === currentTodo.id && body.title ? { ...todo, title: body.title } : todo);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(mutationResponse()) });
  });
  await page.route(`**/api/todos/e2e-inline-two`, async (route) => {
    const body = route.request().postDataJSON() as { title?: string };
    todos = todos.map((todo) => todo.id === 'e2e-inline-two' && body.title ? { ...todo, title: body.title } : todo);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(mutationResponse()) });
  });
  await page.route(`**/api/topics/${topic.id}/workspace`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ sources: [], timeline: [], citations: [], publish_package: null, draft: null }) });
  });
  await page.route(`**/api/topics/${topic.id}/sources`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.route(`**/api/topics/${topic.id}/timeline`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.route(`**/api/topics/${topic.id}/draft`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ draft: null, conflict: null }) });
  });
  await page.route(`**/api/topics/${topic.id}/citations`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.route(`**/api/topics/${topic.id}/deals`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
}

async function login(page: Page) {
  await page.goto('/');
  await page.locator('input[name="password"]').fill('admin');
  await page.getByRole('button', { name: '进入工作台' }).click();
  await expect(page).toHaveURL(/\/today$/);
}

test('执行清单支持连续内联创建、标题编辑和紧凑布局', async ({ page }) => {
  await mockWorkspace(page);
  await login(page);
  await page.goto(`/topics/${topic.id}?tab=todos`);

  const composer = page.getByRole('textbox', { name: '添加待办' });
  await expect(composer).toBeVisible();
  await expect(page.locator('textarea')).toHaveCount(0);
  await expect(page.getByText('截止日期', { exact: true })).toHaveCount(0);

  await composer.fill('新增第一条');
  await composer.press('Enter');
  await expect(page.getByText('新增第一条', { exact: true })).toBeVisible();
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue('');

  await composer.fill('新增第二条');
  await composer.press('Enter');
  await expect(page.getByText('新增第二条', { exact: true })).toBeVisible();
  await expect(composer).toBeFocused();

  const editRow = page.locator('[data-testid="todo-row"][data-todo-id="e2e-inline-two"]');
  await editRow.getByTitle('编辑待办').click();
  const editor = page.getByRole('textbox', { name: '编辑待办标题' });
  await editor.fill('第二条已修改');
  await editor.press('Enter');
  await expect(page.getByText('第二条已修改', { exact: true })).toBeVisible();

  await editRow.getByTitle('编辑待办').click();
  await page.getByRole('textbox', { name: '编辑待办标题' }).fill('第二条失焦保存');
  await page.getByRole('textbox', { name: '编辑待办标题' }).blur();
  await expect(page.getByText('第二条失焦保存', { exact: true })).toBeVisible();

  await editRow.getByTitle('编辑待办').click();
  const cancelledEditor = page.getByRole('textbox', { name: '编辑待办标题' });
  await cancelledEditor.fill('这次应该取消');
  await cancelledEditor.press('Escape');
  await expect(page.getByText('第二条失焦保存', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '编辑待办标题' })).toHaveCount(0);
});

test('执行清单拖拽时保留源卡片占位并完成排序', async ({ page }) => {
  await mockWorkspace(page);
  await login(page);
  await page.goto(`/topics/${topic.id}?tab=todos`);

  const source = page.locator('[data-testid="todo-row"][data-todo-id="e2e-inline-three"]');
  const target = page.locator('[data-testid="todo-row"][data-todo-id="e2e-inline-two"]');
  const sourceHandle = source.getByRole('button', { name: '拖动排序' });
  const sourceBefore = await source.boundingBox();
  expect(sourceBefore).not.toBeNull();
  expect(sourceBefore!.height).toBeLessThanOrEqual(44);
  const sourceHandleBox = await sourceHandle.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceHandleBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  const reorderRequest = page.waitForRequest((request) => request.url().includes(`/api/topics/${topic.id}/todos/reorder`));
  await page.mouse.move(sourceHandleBox!.x + sourceHandleBox!.width / 2, sourceHandleBox!.y + sourceHandleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceHandleBox!.x + sourceHandleBox!.width / 2 + 16, sourceHandleBox!.y + sourceHandleBox!.height / 2 + 16, { steps: 3 });
  await expect(page.getByTestId('todo-drag-preview')).toBeVisible();
  const sourceDuring = await source.boundingBox();
  expect(sourceDuring?.height).toBeCloseTo(sourceBefore!.height, 0);
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 8 });
  await page.mouse.up();
  await reorderRequest;

  const ids = await page.locator('[data-testid="todo-row"]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-todo-id')));
  expect(ids.indexOf('e2e-inline-three')).toBeLessThan(ids.indexOf('e2e-inline-two'));
  await expect(page.getByTestId('todo-drag-preview')).toHaveCount(0);
});
