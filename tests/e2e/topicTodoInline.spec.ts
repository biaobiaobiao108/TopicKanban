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

async function mockWorkspace(page: Page, options: { withCurrentTodo?: boolean } = {}) {
  const withCurrentTodo = options.withCurrentTodo ?? true;
  let todos = withCurrentTodo ? [currentTodo, makeTodo('e2e-inline-two', '整理第二条', 2), makeTodo('e2e-inline-three', '整理第三条', 3)] : [];
  let currentTopic = { ...topic };
  const settings = { reading_speed: 280, theme: 'light', stale_action_days: 5, default_share_ttl_days: 3, voiceover_cues: [] };
  const normalizeTodos = () => {
    const ordered = [
      ...todos.filter((todo) => !todo.completed_at).sort((a, b) => a.sort_order - b.sort_order),
      ...todos.filter((todo) => Boolean(todo.completed_at)).sort((a, b) => a.sort_order - b.sort_order),
    ];
    const firstPending = ordered.findIndex((todo) => !todo.completed_at);
    todos = ordered.map((todo, index) => ({
      ...todo,
      sort_order: index + 1,
      is_current: index === firstPending ? 1 : 0,
      current_started_at: index === firstPending ? todo.current_started_at || '2026-08-25T00:00:00.000Z' : null,
    }));
    return todos;
  };
  const getTopic = () => ({ ...currentTopic, current_todo: normalizeTodos().find((todo) => todo.is_current === 1 && !todo.completed_at) || null });
  const mutationResponse = () => ({ topic: getTopic(), todos: [...normalizeTodos()] });

  await page.route('**/api/bootstrap**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        topics: [getTopic()], people: [], relationships: [], published: [], tags: [],
        settings,
      }),
    });
  });
  await page.route('**/api/settings', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(settings) });
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
      if (body.title === '模拟创建失败') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '模拟创建失败' }) });
        return;
      }
      const id = `e2e-inline-created-${todos.length}`;
      todos = [...todos, makeTodo(id, body.title, Math.max(...todos.map((todo) => todo.sort_order)) + 1)];
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(route.request().method() === 'GET' ? todos : mutationResponse()) });
  });
  await page.route(`**/api/topics/${topic.id}/todos/reorder`, async (route) => {
    const body = route.request().postDataJSON() as { ids: string[] };
    const order = new Map(body.ids.map((id, index) => [id, index + 1]));
    todos = todos.map((todo) => order.has(todo.id) ? { ...todo, sort_order: order.get(todo.id)! } : todo);
    await new Promise((resolve) => setTimeout(resolve, 180));
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(mutationResponse()) });
  });
  await page.route('**/api/todos/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const pathParts = path.split('/');
    const todoId = pathParts[3] || '';
    const action = pathParts[4] || '';
    const body = route.request().method() === 'PATCH' ? route.request().postDataJSON() as { title?: string } : {};
    if (route.request().method() === 'PATCH' && body.title) {
      todos = todos.map((todo) => todo.id === todoId ? { ...todo, title: body.title! } : todo);
    } else if (route.request().method() === 'POST' && action === 'complete') {
      todos = todos.map((todo) => todo.id === todoId ? { ...todo, completed_at: '2026-09-02T10:00:00.000Z', is_current: 0, current_started_at: null } : todo);
    } else if (route.request().method() === 'POST' && action === 'reopen') {
      todos = todos.map((todo) => todo.id === todoId ? { ...todo, completed_at: null, is_current: 0, current_started_at: null, sort_order: Math.max(...todos.map((item) => item.sort_order)) + 1 } : todo);
    } else if (route.request().method() === 'DELETE') {
      todos = todos.filter((todo) => todo.id !== todoId);
    }
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
  await expect(page.locator('main h1')).toBeVisible();
}

test('执行清单支持连续内联创建、标题编辑和紧凑布局', async ({ page }) => {
  await mockWorkspace(page);
  await login(page);
  await page.goto(`/topics/${topic.id}?tab=todos`);

  const composer = page.getByRole('textbox', { name: '添加待办' });
  await expect(composer).toBeVisible();
  await expect(page.getByText('其他未完成', { exact: false })).toHaveCount(0);
  await expect(page.locator('textarea')).toHaveCount(0);
  await expect(page.getByText('截止日期', { exact: true })).toHaveCount(0);

  const composerShell = page.getByTestId('todo-composer-shell');
  const composerShellBeforeFocus = await composerShell.evaluate((element) => {
    const style = getComputedStyle(element);
    return { borderStyle: style.borderStyle, borderWidth: style.borderWidth, boxShadow: style.boxShadow, outlineStyle: style.outlineStyle, backgroundColor: style.backgroundColor };
  });
  expect(composerShellBeforeFocus).toEqual(expect.objectContaining({ borderStyle: 'solid', borderWidth: '1px', boxShadow: 'none', outlineStyle: 'none' }));
  const composerBeforeFocusBox = await composerShell.boundingBox();
  expect(composerBeforeFocusBox).not.toBeNull();
  await expect(composer).toBeEnabled();
  await composer.click();
  await expect(composer).toBeFocused();
  const globalSelectionStyle = await page.evaluate(() => {
    const style = getComputedStyle(document.body, '::selection');
    return { color: style.color, backgroundColor: style.backgroundColor };
  });
  expect(globalSelectionStyle.color).not.toBe('');
  expect(globalSelectionStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  const composerFocusStyle = await composer.evaluate((element) => {
    const style = getComputedStyle(element);
    return { borderStyle: style.borderStyle, borderWidth: style.borderWidth, boxShadow: style.boxShadow, outlineStyle: style.outlineStyle };
  });
  expect(composerFocusStyle).toEqual({ borderStyle: 'none', borderWidth: '0px', boxShadow: 'none', outlineStyle: 'none' });
  const composerShellFocusStyle = await composerShell.evaluate((element) => {
    const style = getComputedStyle(element);
    return { borderStyle: style.borderStyle, borderWidth: style.borderWidth, borderTopColor: style.borderTopColor, borderBottomColor: style.borderBottomColor, boxShadow: style.boxShadow, outlineStyle: style.outlineStyle };
  });
  expect(composerShellFocusStyle).toEqual(expect.objectContaining({ borderStyle: 'solid', borderWidth: '1px', boxShadow: 'none', outlineStyle: 'none' }));
  expect(composerShellFocusStyle.borderBottomColor).toBe(composerShellFocusStyle.borderTopColor);
  expect(composerShellFocusStyle.backgroundColor).not.toBe(composerShellBeforeFocus.backgroundColor);
  const composerFocusedBox = await composerShell.boundingBox();
  expect(composerFocusedBox).not.toBeNull();
  expect(composerFocusedBox!.width).toBeCloseTo(composerBeforeFocusBox!.width, 0);
  expect(composerFocusedBox!.height).toBeCloseTo(composerBeforeFocusBox!.height, 0);

  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(composer).toBeFocused();
  await expect(composerShell).toHaveCSS('outline-style', 'none');

  await composer.press('Enter');
  await expect(composer).toBeFocused();
  await expect(composer).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('待办标题不能为空', { exact: true })).toBeVisible();

  await composer.fill('新增第一条');
  await composer.press('Enter');
  await expect(page.getByText('新增第一条', { exact: true })).toBeVisible();
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue('');

  await composer.fill('新增第二条');
  await composer.press('Enter');
  await expect(page.getByText('新增第二条', { exact: true })).toBeVisible();
  await expect(composer).toBeFocused();

  await composer.fill('模拟创建失败');
  await composer.press('Enter');
  await expect(composer).toHaveValue('模拟创建失败');
  await expect(page.getByRole('status').filter({ hasText: '模拟创建失败' })).toBeVisible();
  await composer.fill('');

  const editRow = page.locator('[data-testid="todo-row"][data-todo-id="e2e-inline-two"]');
  await editRow.getByTitle('编辑待办').click();
  const editor = page.getByRole('textbox', { name: '编辑待办标题' });
  const editorFocusStyle = await editor.evaluate((element) => {
    const style = getComputedStyle(element);
    return { borderStyle: style.borderStyle, borderWidth: style.borderWidth, boxShadow: style.boxShadow, outlineStyle: style.outlineStyle };
  });
  expect(editorFocusStyle).toEqual({ borderStyle: 'none', borderWidth: '0px', boxShadow: 'none', outlineStyle: 'none' });
  const editorShell = editRow.getByTestId('todo-editor-shell');
  await expect(editorShell).toHaveCSS('box-shadow', 'none');
  await expect(editorShell).toHaveCSS('outline-style', 'none');
  await expect(editorShell).toHaveCSS('background-image', 'none');
  const editorSelectionStyle = await editor.evaluate((element) => {
    const style = getComputedStyle(element, '::selection');
    return { color: style.color, backgroundColor: style.backgroundColor };
  });
  expect(editorSelectionStyle.color).not.toBe('');
  expect(editorSelectionStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  await expect(editRow).toHaveClass(/todo-row-editing/);
  const editorRowStyle = await editRow.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderStyle: style.borderStyle,
      borderTopColor: style.borderTopColor,
      borderRightColor: style.borderRightColor,
      borderBottomColor: style.borderBottomColor,
      borderLeftColor: style.borderLeftColor,
      backgroundImage: style.backgroundImage,
      boxShadow: style.boxShadow,
    };
  });
  expect(editorRowStyle).toEqual(expect.objectContaining({ borderStyle: 'solid', backgroundImage: 'none', boxShadow: 'none' }));
  expect(new Set([
    editorRowStyle.borderTopColor,
    editorRowStyle.borderRightColor,
    editorRowStyle.borderBottomColor,
    editorRowStyle.borderLeftColor,
  ]).size).toBe(1);
  await editor.fill('第二条已修改');
  await editor.press('Enter');
  await expect(page.getByText('第二条已修改', { exact: true })).toBeVisible();

  await editRow.getByTitle('编辑待办').click();
  await page.getByRole('textbox', { name: '编辑待办标题' }).fill('第二条失焦保存');
  await page.getByRole('textbox', { name: '编辑待办标题' }).blur();
  await expect(page.getByText('第二条失焦保存', { exact: true })).toBeVisible();

  await editRow.getByTitle('编辑待办').click();
  const emptyEditor = page.getByRole('textbox', { name: '编辑待办标题' });
  await emptyEditor.fill('');
  await emptyEditor.press('Enter');
  await expect(emptyEditor).toBeVisible();
  await expect(emptyEditor).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert').filter({ hasText: '待办标题不能为空' })).toBeVisible();
  await emptyEditor.press('Escape');

  await editRow.getByTitle('编辑待办').click();
  const cancelledEditor = page.getByRole('textbox', { name: '编辑待办标题' });
  await cancelledEditor.fill('这次应该取消');
  await cancelledEditor.press('Escape');
  await expect(page.getByText('第二条失焦保存', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '编辑待办标题' })).toHaveCount(0);

  const currentCheckbox = page.getByRole('checkbox', { name: '完成待办：确认当前行动' });
  const currentRow = page.locator('[data-testid="todo-row"][data-todo-id="e2e-inline-current"]');
  await expect(currentRow).toHaveAttribute('aria-current', 'true');
  const currentRowStyle = await currentRow.evaluate((element) => {
    const style = getComputedStyle(element);
    return { borderInlineStartWidth: style.borderInlineStartWidth, boxShadow: style.boxShadow };
  });
  expect(currentRowStyle.borderInlineStartWidth).toBe('1px');
  expect(currentRowStyle.boxShadow).toBe('none');
  await page.evaluate(() => {
    const root = document.documentElement;
    root.classList.remove('theme-warm-paper', 'theme-nordic-frost', 'theme-parisian-dawn', 'theme-midnight-obsidian', 'theme-kyoto-zen');
    root.classList.add('dark');
  });
  const pendingRow = page.locator('[data-testid="todo-row"][data-todo-id="e2e-inline-two"]');
  await expect(pendingRow).toHaveCSS('background-color', 'rgb(28, 25, 23)');
  await currentCheckbox.click();
  await expect(page.getByRole('checkbox', { name: '撤销完成：确认当前行动' })).toBeChecked();
  await expect(page.locator('[data-testid="todo-row"][data-todo-id="e2e-inline-two"]')).toHaveAttribute('data-current', 'true');
  await page.getByRole('checkbox', { name: '撤销完成：确认当前行动' }).click();
  await expect(page.getByRole('checkbox', { name: '完成待办：确认当前行动' })).not.toBeChecked();
});

test('今日聚焦可从当前行动弹窗打开执行清单页签', async ({ page }) => {
  await mockWorkspace(page, { withCurrentTodo: false });
  await login(page);

  const setActionButton = page.getByRole('button', { name: '设置当前行动', exact: true }).first();
  await expect(setActionButton).toBeVisible();
  await setActionButton.click();

  const dialog = page.getByRole('dialog', { name: '当前行动' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '打开执行清单', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/topics/${topic.id}\\?tab=todos$`));
  await expect(page.getByRole('heading', { name: '执行清单', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '选题概览', exact: true })).toHaveCount(0);
});

test('执行清单拖拽时保留源卡片占位并完成排序', async ({ page }) => {
  await mockWorkspace(page);
  await login(page);
  await page.goto(`/topics/${topic.id}?tab=todos`);

  const source = page.locator('[data-testid="todo-row"][data-todo-id="e2e-inline-three"]');
  const sourceHandle = source.getByTestId('todo-drag-handle');
  const sourceBefore = await source.boundingBox();
  expect(sourceBefore).not.toBeNull();
  expect(sourceBefore!.height).toBeLessThanOrEqual(44);
  const sourceHandleBox = await sourceHandle.boundingBox();
  expect(sourceHandleBox).not.toBeNull();

  const reorderRequest = page.waitForRequest((request) => request.url().includes(`/api/topics/${topic.id}/todos/reorder`));
  const reorderResponse = page.waitForResponse((response) => response.url().includes(`/api/topics/${topic.id}/todos/reorder`) && response.ok());
  await page.mouse.move(sourceHandleBox!.x + sourceHandleBox!.width / 2, sourceHandleBox!.y + sourceHandleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceHandleBox!.x + sourceHandleBox!.width / 2 + 16, sourceHandleBox!.y + sourceHandleBox!.height / 2 + 16, { steps: 3 });
  await expect(page.getByTestId('todo-drag-preview')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('todo-dragging'))).toBe(true);
  await expect(sourceHandle).toHaveCSS('cursor', 'grabbing');
  await expect(page.getByTestId('todo-drag-preview')).toHaveCSS('cursor', 'grabbing');
  const previewBox = await page.getByTestId('todo-drag-preview').boundingBox();
  expect(previewBox).not.toBeNull();
  expect(previewBox!.width).toBeCloseTo(sourceBefore!.width, 0);
  expect(previewBox!.height).toBeCloseTo(sourceBefore!.height, 0);
  const sourceDuring = await source.boundingBox();
  expect(sourceDuring?.height).toBeCloseTo(sourceBefore!.height, 0);
  const currentTarget = page.locator('[data-testid="todo-row"][data-todo-id="e2e-inline-current"]');
  const currentTargetBox = await currentTarget.boundingBox();
  expect(currentTargetBox).not.toBeNull();
  await page.mouse.move(currentTargetBox!.x + currentTargetBox!.width / 2, currentTargetBox!.y + currentTargetBox!.height / 2, { steps: 8 });
  await page.mouse.up();
  await reorderRequest;

  const controlsDuringReorder = await page.locator('[data-testid="todo-row"] input[type="checkbox"], #todo-composer-input').evaluateAll((elements) => elements.map((element) => (element as HTMLInputElement).disabled));
  expect(controlsDuringReorder).not.toContain(true);
  await reorderResponse;

  const ids = await page.locator('[data-testid="todo-row"]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-todo-id')));
  expect(ids.indexOf('e2e-inline-three')).toBeLessThan(ids.indexOf('e2e-inline-current'));
  await expect(page.locator('[data-testid="todo-row"][data-todo-id="e2e-inline-three"]')).toHaveAttribute('data-current', 'true');
  await expect(page.getByTestId('todo-drag-preview')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('todo-dragging'))).toBe(false);
  await expect(sourceHandle).toHaveCSS('cursor', 'grab');
});
