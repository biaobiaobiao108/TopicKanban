import { expect, test } from '@playwright/test';

test('workspace login, keyboard select and modal semantics work', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/');
  await page.locator('input[name="password"]').fill('admin');
  await page.getByRole('button', { name: '进入工作台' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('heading', { name: '选题生产工作台' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '今日生产聚焦', exact: true, level: 1 })).toBeVisible();

  await page.goto('/kanban');
  await expect(page.getByRole('heading', { name: '选题全景看板', exact: true, level: 1 })).toBeVisible();
  const select = page.getByRole('combobox').first();
  await expect(select).toBeVisible();
  await expect(select).toHaveAttribute('aria-label', '优先级筛选');
  await select.press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox')).toHaveCount(0);

  const quickDropButton = page.getByRole('button', {
    name: /打开手机快投灵感箱/,
  });
  await quickDropButton.click();
  await expect(page.getByRole('dialog', { name: '手机快投灵感箱' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '手机快投灵感箱' })).toHaveCount(0);

  await page.keyboard.press('n');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const commandInput = page.getByPlaceholder(/输入指令、搜索选题/);
  await page.keyboard.press('Control+/');
  await expect(commandInput).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(commandInput).toHaveCount(0);

  await page.getByRole('button', { name: /全局搜索与指令/ }).click();
  await page.getByRole('button', { name: '? 快捷键大全' }).click();
  await expect(page.getByText('全局呼出此指令面板（任何输入框、正文聚焦或专注全屏均可用）')).toBeVisible();
  await commandInput.fill('? 搜索');
  await expect(page.getByText('全局呼出此指令面板（任何输入框、正文聚焦或专注全屏均可用）')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(pageErrors).toEqual([]);
});

test('command palette search input keeps theme focus states clean', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[name="password"]').fill('admin');
  await page.getByRole('button', { name: '进入工作台' }).click();
  await expect(page).toHaveURL(/\/today$/);

  const themeStates = [
    { name: '经典浅色', classes: [] },
    { name: '深色专注', classes: ['dark'] },
    { name: '暖沙纸境', classes: ['theme-warm-paper'] },
    { name: '北欧冷杉', classes: ['theme-nordic-frost'] },
    { name: '巴黎晨光', classes: ['theme-parisian-dawn'] },
    { name: '深海星图', classes: ['theme-midnight-obsidian', 'dark'] },
    { name: '京都茶席', classes: ['theme-kyoto-zen'] },
    { name: '跟随系统', classes: ['dark'] },
  ];
  const customThemeClasses = [
    'theme-warm-paper',
    'theme-nordic-frost',
    'theme-parisian-dawn',
    'theme-midnight-obsidian',
    'theme-kyoto-zen',
  ];

  const searchInput = page.getByPlaceholder('输入指令、搜索选题、#赛道、@人物、>动作、?帮助...');
  const dialog = page.getByRole('dialog', { name: '全局指令搜索面板' });

  for (const themeState of themeStates) {
    await page.evaluate(({ classes, customThemeClasses }) => {
      const root = document.documentElement;
      root.classList.remove('dark', ...customThemeClasses);
      root.classList.add(...classes);
    }, { classes: themeState.classes, customThemeClasses });

    await page.getByRole('button', { name: /全局搜索与指令/ }).first().click();
    await expect(dialog).toBeVisible();
    await searchInput.click();

    const pointerFocusStyle = await searchInput.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        borderStyle: style.borderStyle,
        boxShadow: style.boxShadow,
        outlineStyle: style.outlineStyle,
        keyboardFocused: element.getAttribute('data-keyboard-focused'),
      };
    });
    expect(pointerFocusStyle).toEqual({
      borderStyle: 'none',
      boxShadow: 'none',
      outlineStyle: 'none',
      keyboardFocused: null,
    });

    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(searchInput).toBeFocused();

    const keyboardFocusStyle = await searchInput.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
        keyboardFocused: element.getAttribute('data-keyboard-focused'),
      };
    });
    expect(keyboardFocusStyle).toEqual({
      outlineStyle: 'solid',
      outlineWidth: '2px',
      boxShadow: 'none',
      keyboardFocused: 'true',
    });

    await page.keyboard.type('搜索');
    await expect(searchInput).toHaveValue('搜索');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
});

test('一级模块使用统一页面标题且商单副标题已移除', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[name="password"]').fill('admin');
  await page.getByRole('button', { name: '进入工作台' }).click();
  await expect(page).toHaveURL(/\/today$/);

  const modules = [
    { path: '/today', title: '今日生产聚焦' },
    { path: '/kanban', title: '选题全景看板' },
    { path: '/people', title: '互联网人物档案与关系库' },
    { path: '/tags', title: '标签与创作赛道资产' },
    { path: '/published', title: '已发布视频复盘与数据沉淀' },
    { path: '/deals', title: '商单中心' },
    { path: '/database', title: '选题库' },
    { path: '/settings', title: '偏好设置与数据管理' },
  ];

  for (const module of modules) {
    await page.goto(module.path);
    await expect(page.locator('[data-page-header]')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: module.title, exact: true, level: 1 })).toBeVisible();
  }

  await page.goto('/deals');
  await expect(
    page.getByText('把客户的执行单，变成可交付、可回款的一条生产线。', {
      exact: true,
    })
  ).toHaveCount(0);
});

test('商单快速创建弹窗中的下拉菜单不会被裁剪', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[name="password"]').fill('admin');
  await page.getByRole('button', { name: '进入工作台' }).click();
  await expect(page).toHaveURL(/\/today$/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/deals');
  await page.getByRole('button', { name: '记录新商单' }).click();
  const dialog = page.getByRole('dialog', { name: '记录新商单' });
  await expect(dialog).toBeVisible();

  const sourceSelect = dialog.getByRole('combobox', { name: '商单来源' });
  await sourceSelect.click();
  const sourceOption = page.getByRole('option', { name: '花火', exact: true });
  await expect(sourceOption).toBeVisible();
  const sourcePopover = page.getByRole('listbox').locator('..');
  const sourceBounds = await sourcePopover.boundingBox();
  expect(sourceBounds).not.toBeNull();
  expect(sourceBounds?.x).toBeGreaterThanOrEqual(0);
  expect((sourceBounds?.x || 0) + (sourceBounds?.width || 0)).toBeLessThanOrEqual(390);
  expect(sourceBounds?.y).toBeGreaterThanOrEqual(0);
  expect((sourceBounds?.y || 0) + (sourceBounds?.height || 0)).toBeLessThanOrEqual(844);
  await page.keyboard.press('Escape');

  const deliverableSelect = dialog.getByRole('combobox', { name: '交付类型' });
  await deliverableSelect.click();
  const deliverableOption = page.getByRole('option', { name: '动态推广', exact: true });
  await expect(deliverableOption).toBeVisible();
  const deliverablePopover = page.getByRole('listbox').locator('..');
  const deliverableBounds = await deliverablePopover.boundingBox();
  expect(deliverableBounds).not.toBeNull();
  expect(deliverableBounds?.x).toBeGreaterThanOrEqual(0);
  expect((deliverableBounds?.x || 0) + (deliverableBounds?.width || 0)).toBeLessThanOrEqual(390);
  expect(deliverableBounds?.y).toBeGreaterThanOrEqual(0);
  expect((deliverableBounds?.y || 0) + (deliverableBounds?.height || 0)).toBeLessThanOrEqual(844);
});

test('dark theme keeps kanban selects and database pagination readable', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/');
  await page.locator('input[name="password"]').fill('admin');
  await page.getByRole('button', { name: '进入工作台' }).click();
  await expect(page).toHaveURL(/\/today$/);

  await page.getByRole('button', { name: /全局搜索与指令/ }).click();
  const commandInput = page.getByPlaceholder(/输入指令、搜索选题/);
  await commandInput.fill('深色专注');
  const themeAction = page.getByRole('button', { name: /外观：深色专注/ });
  await expect(themeAction).toBeVisible();
  const settingsSave = page.waitForResponse(
    (response) => response.url().includes('/api/settings') && response.request().method() === 'PUT'
  );
  await themeAction.click();
  await settingsSave;
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.goto('/kanban');
  await expect(page.getByRole('heading', { name: '选题全景看板' })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  for (const label of ['优先级筛选', '标签筛选', '看板排序方式']) {
    const select = page.getByRole('combobox', { name: label });
    await expect(select).toBeVisible();
    await expect.poll(async () => select.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgb(255, 255, 255)');
  }

  const prioritySelect = page.getByRole('combobox', { name: '优先级筛选' });
  await prioritySelect.press('Enter');
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await expect
    .poll(async () => listbox.evaluate((element) => getComputedStyle(element.parentElement || element).backgroundColor))
    .not.toBe('rgb(255, 255, 255)');
  await page.keyboard.press('Escape');

  await page.goto('/kanban');
  await expect(page.getByRole('heading', { name: '选题全景看板' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('button', { name: /^已立项/ })
    .first()
    .click();
  const statusTrigger = page.getByRole('button', { name: '流转' }).first();
  if (await statusTrigger.count()) {
    const mobileTopicCard = page.locator('[data-topic-id]').first();
    if (await mobileTopicCard.count()) {
      await expect(mobileTopicCard).toHaveAttribute('tabindex', '-1');
    }
    await statusTrigger.click();
    const statusMenuHeading = page.getByText('活跃生产阶段').last();
    await expect(statusMenuHeading).toBeVisible();
    const menuBounds = await statusMenuHeading.evaluate((element) => {
      const rect = element.parentElement?.getBoundingClientRect();
      return rect
        ? {
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
            position: getComputedStyle(element.parentElement as HTMLElement).position,
          }
        : null;
    });
    expect(menuBounds).not.toBeNull();
    expect(menuBounds?.left).toBeGreaterThanOrEqual(0);
    expect(menuBounds?.right).toBeLessThanOrEqual(390);
    expect(menuBounds?.top).toBeGreaterThanOrEqual(0);
    expect(menuBounds?.bottom).toBeLessThanOrEqual(844);
    expect(menuBounds?.position).toBe('fixed');
    await page.keyboard.press('Escape');
  }

  await page.goto('/database');
  await expect(page.getByRole('heading', { name: '选题库' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '选题库', exact: true, level: 1 })).toBeVisible();
  const mobilePaginationButton = page.getByRole('button', { name: '上一页' }).last();
  await expect(mobilePaginationButton).toBeVisible();
  await expect
    .poll(async () => mobilePaginationButton.evaluate((element) => getComputedStyle(element.parentElement || element).backgroundColor))
    .not.toBe('rgb(245, 245, 244)');
  const mobileCard = page.locator('article').first();
  if (await mobileCard.count()) {
    await expect
      .poll(async () => mobileCard.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe('rgb(255, 255, 255)');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
});

test('商单中心支持分页、进行中筛选、详情就地编辑和长标题', async ({ page, request }) => {
  await page.goto('/');
  await page.locator('input[name="password"]').fill('admin');
  await page.getByRole('button', { name: '进入工作台' }).click();
  await expect(page).toHaveURL(/\/today$/);

  const runId = `e2e-${Date.now()}`;
  const dealIds: string[] = [];
  let publishedVideoId: string | null = null;
  const authResponse = await request.post('/api/auth/login', {
    data: { password: 'admin' },
  });
  expect(authResponse.status()).toBe(200);
  const authToken = ((await authResponse.json()) as { token?: string }).token || '';
  const api = async (path: string, method: string, body?: Record<string, unknown>) => {
    const response = await request.fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${authToken || ''}`,
        'Content-Type': 'application/json',
      },
      data: body,
    });
    return {
      status: response.status(),
      data: (await response.json().catch(() => null)) as { id?: string },
    };
  };

  try {
    for (let index = 0; index < 26; index += 1) {
      const response = await api('/api/deals', 'POST', {
        title: `${runId}-商单-${index}`,
        brand_name: `${runId}-品牌`,
        status: index === 25 ? 'delivered' : 'communicating',
        deliverable_type: 'custom_video',
      });
      expect(response.status).toBe(201);
      if (response.data.id) dealIds.push(response.data.id);
    }

    await page.goto('/deals');
    const search = page.locator('input[name="deal_search"]');
    await search.fill(runId);
    await expect(page.locator('[data-testid="deal-card"]')).toHaveCount(24);
    await expect(page.getByText('显示 1-24 / 共 25 单', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '下一页' }).click();
    await expect(page.getByText('显示 25-25 / 共 25 单', { exact: true })).toBeVisible();

    const pageSizeSelect = page.getByRole('combobox', { name: '每页商单数量' });
    await pageSizeSelect.click();
    await page.getByRole('option', { name: '每页 12 张', exact: true }).click();
    await expect(page.locator('[data-testid="deal-card"]')).toHaveCount(12);
    await expect(page.getByText('显示 1-12 / 共 25 单', { exact: true })).toBeVisible();
    await page.reload();
    await search.fill(runId);
    await expect(pageSizeSelect).toHaveText(/每页 12 张/);
    await expect(page.locator('[data-testid="deal-card"]')).toHaveCount(12);

    const scopeToggle = page.getByRole('button', { name: '显示进行中' });
    await expect(scopeToggle).toHaveAttribute('aria-pressed', 'true');
    await scopeToggle.click();
    await expect(scopeToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText(`${runId}-商单-24`, { exact: true })).toBeVisible();
    const statusFilter = page.getByRole('combobox', { name: '按商单阶段筛选' });
    await statusFilter.click();
    await page.getByRole('option', { name: '已交付', exact: true }).click();
    await expect(page.locator('[data-testid="deal-card"]')).toHaveCount(1);

    const longVideoTitle = `这是一条用于验证商单详情页换行能力的超长发布视频标题-${'边界测试'.repeat(20)}`;
    const publishedResponse = await api('/api/published', 'POST', {
      title: longVideoTitle,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD',
      bvid: 'BV1xx411c7mD',
      published_at: '2026-08-27',
    });
    expect(publishedResponse.status).toBe(201);
    publishedVideoId = publishedResponse.data.id || null;
    expect(publishedVideoId).toBeTruthy();
    const linkResponse = await api(`/api/deals/${dealIds[0]}/link-published`, 'POST', { published_video_id: publishedVideoId });
    expect(linkResponse.status).toBe(200);

    await page.goto(`/deals/${dealIds[0]}`);
    await expect(page.getByRole('heading', { name: `${runId}-商单-0`, exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: '直接修改商单阶段' })).toBeVisible();
    await page.getByRole('combobox', { name: '直接修改商单阶段' }).click();
    await page.getByRole('option', { name: '制作中', exact: true }).click();
    await expect(page.getByText('制作前还没有绑定主选题', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '编辑', exact: true }).first().click();
    await page.locator('input[name="brand_name"]').fill(`${runId}-已编辑品牌`);
    await page.getByRole('button', { name: '保存修改' }).click();
    await expect(page.getByText(`${runId}-已编辑品牌`, { exact: true })).toBeVisible();
    await expect(page.getByText(longVideoTitle, { exact: true }).last()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByText(longVideoTitle, { exact: true }).last()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      await dialog.accept();
    });
    await page.getByRole('button', { name: '删除商单' }).click();
    await expect(page).toHaveURL(/\/deals$/);
  } finally {
    for (const dealId of dealIds) await api(`/api/deals/${dealId}`, 'DELETE');
    if (publishedVideoId) await api(`/api/published/${publishedVideoId}`, 'DELETE');
  }
});
