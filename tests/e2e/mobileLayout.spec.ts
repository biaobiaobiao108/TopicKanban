import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/');
  const password = page.locator('input[name="password"]');
  if (await password.count()) {
    await password.fill('admin');
    await page.getByRole('button', { name: '进入工作台' }).click();
  }
  await expect(page).toHaveURL(/\/today$/);
}

async function expectNoHorizontalOverflow(page: Page) {
  const layout = await page.evaluate(() => {
    const main = document.querySelector('main');
    return {
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      mainScrollWidth: main?.scrollWidth || 0,
      mainClientWidth: main?.clientWidth || 0,
    };
  });

  expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.documentClientWidth + 1);
  expect(layout.mainScrollWidth).toBeLessThanOrEqual(layout.mainClientWidth + 1);
}

test('移动底栏在手机宽度内保留核心入口与菜单，工作台不再渲染全局顶栏', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/today');

    const bottomNav = page.getByTestId('mobile-bottom-nav');
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.locator('button')).toHaveCount(6);
    await expect(bottomNav.locator('button[aria-label="今日"]')).toHaveCount(1);
    await expect(bottomNav.locator('button[aria-label^="看板"]')).toHaveCount(1);
    await expect(bottomNav.locator('button[aria-label="商单"]')).toHaveCount(1);
    await expect(bottomNav.locator('button[aria-label="设置"]')).toHaveCount(1);
    await expect(bottomNav.getByRole('button', { name: '打开菜单', exact: true })).toBeVisible();
    await expect(bottomNav.getByRole('button', { name: '新建选题', exact: true })).toBeVisible();
    await expect(bottomNav.locator('button[aria-label^="日历"]')).toHaveCount(0);
    await expect(page.locator('.navbar-container')).toHaveCount(0);

    const layout = await bottomNav.evaluate((element) => {
      const nav = element.getBoundingClientRect();
      const buttons = [...element.querySelectorAll<HTMLButtonElement>('button')].map((button) => {
        const rect = button.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      });
      return { navLeft: nav.left, navRight: nav.right, buttons };
    });
    expect(layout.navLeft).toBeGreaterThanOrEqual(0);
    expect(layout.navRight).toBeLessThanOrEqual(viewport.width + 1);
    expect(layout.buttons.every((button) => button.left >= 0 && button.right <= viewport.width + 1 && button.width > 0)).toBe(true);
    await expectNoHorizontalOverflow(page);
  }

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/today');
  await expect(page.getByTestId('mobile-bottom-nav')).toBeHidden();
  await expect(page.locator('.navbar-container')).toHaveCount(0);
  const sidebarActions = page.getByTestId('sidebar-quick-actions');
  await expect(sidebarActions).toBeVisible();
  const createButton = sidebarActions.getByRole('button', { name: '新建选题', exact: true });
  const searchButton = sidebarActions.getByRole('button', { name: '全局搜索与指令', exact: true });
  const quickDropButton = sidebarActions.getByRole('button', { name: /打开手机快投灵感箱|手机快投箱中有/ });
  await expect(createButton).toBeVisible();
  await expect(searchButton).toBeVisible();
  await expect(quickDropButton).toBeVisible();
  const actionLayout = await sidebarActions.evaluate((element) => {
    const buttonRects = [...element.querySelectorAll<HTMLButtonElement>('button')].map((button) => {
      const rect = button.getBoundingClientRect();
      return { top: rect.top, left: rect.left, right: rect.right, width: rect.width, height: rect.height };
    });
    return { buttonRects };
  });
  expect(actionLayout.buttonRects).toHaveLength(3);
  expect(actionLayout.buttonRects[0].height).toBeGreaterThan(actionLayout.buttonRects[1].height);
  expect(actionLayout.buttonRects[0].top).toBeLessThan(actionLayout.buttonRects[1].top);
  expect(Math.abs(actionLayout.buttonRects[1].top - actionLayout.buttonRects[2].top)).toBeLessThanOrEqual(1);
  const sidebarRect = await page.locator('aside.sidebar-container').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right };
  });
  expect(actionLayout.buttonRects.every((button) => button.width > 0 && button.left >= sidebarRect.left && button.right <= sidebarRect.right + 1)).toBe(true);
});

test('移动端抽屉保留次级页面入口', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole('button', { name: '打开菜单' }).click();

  const drawer = page.getByRole('dialog', { name: '移动端导航菜单' });
  await expect(drawer).toBeVisible();
  const drawerActions = drawer.getByTestId('mobile-drawer-quick-actions');
  await expect(drawerActions.getByRole('button', { name: '新建选题', exact: true })).toBeVisible();
  await expect(drawerActions.getByRole('button', { name: '全局搜索与指令', exact: true })).toBeVisible();
  await expect(drawerActions.getByRole('button', { name: /打开手机快投灵感箱|手机快投箱中有/ })).toBeVisible();
  const drawerActionLayout = await drawerActions.evaluate((element) => {
    const buttonRects = [...element.querySelectorAll<HTMLButtonElement>('button')]
      .slice(0, 3)
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return { top: rect.top, left: rect.left, right: rect.right, width: rect.width };
      });
    return { buttonRects };
  });
  expect(drawerActionLayout.buttonRects).toHaveLength(3);
  expect(drawerActionLayout.buttonRects[0].top).toBeLessThan(drawerActionLayout.buttonRects[1].top);
  expect(Math.abs(drawerActionLayout.buttonRects[1].top - drawerActionLayout.buttonRects[2].top)).toBeLessThanOrEqual(1);
  expect(drawerActionLayout.buttonRects.every((button) => button.left >= 0 && button.right <= 390)).toBe(true);
  for (const label of ['选题日历', '标签与赛道', '人物档案库', '已发布视频']) {
    await expect(drawer.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  await drawer.getByRole('button', { name: '关闭导航菜单' }).click();
  await expect(drawer).toBeHidden();
});

test('月视图滚动到底时月底日期避开固定底栏', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/calendar?view=month&date=2026-08-15');
    const grid = page.getByTestId('calendar-month-grid');
    await expect(grid).toBeVisible();
    await expect(page.locator('[data-testid="calendar-month-cell"][data-date="2026-08-31"]')).toBeVisible();

    const layout = await grid.evaluate((element) => {
      const scrollArea = element as HTMLElement;
      scrollArea.scrollTop = scrollArea.scrollHeight;
      const finalCell = document.querySelector<HTMLElement>('[data-testid="calendar-month-cell"][data-date="2026-08-31"]');
      const bottomNav = document.querySelector<HTMLElement>('[data-testid="mobile-bottom-nav"]');
      const gridRect = scrollArea.getBoundingClientRect();
      const finalRect = finalCell?.getBoundingClientRect();
      const navRect = bottomNav?.getBoundingClientRect();
      return {
        scrollTop: scrollArea.scrollTop,
        scrollHeight: scrollArea.scrollHeight,
        clientHeight: scrollArea.clientHeight,
        finalBottom: finalRect?.bottom || 0,
        gridBottom: gridRect.bottom,
        navTop: navRect?.top || 0,
      };
    });

    expect(layout.scrollHeight).toBeGreaterThan(layout.clientHeight);
    expect(layout.scrollTop).toBeGreaterThan(0);
    expect(layout.finalBottom).toBeLessThanOrEqual(layout.gridBottom + 1);
    expect(layout.finalBottom).toBeLessThanOrEqual(layout.navTop + 1);
    await expectNoHorizontalOverflow(page);
  }
});

test('主要移动端页面不产生视口级横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  for (const route of ['/today', '/kanban', '/calendar', '/deals', '/settings']) {
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});
