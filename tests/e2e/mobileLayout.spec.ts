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

test('移动底栏在手机宽度内只显示核心入口，顶部新增入口仅保留桌面端', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/today');

    const bottomNav = page.getByTestId('mobile-bottom-nav');
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.locator('button')).toHaveCount(5);
    await expect(bottomNav.locator('button[aria-label="今日"]')).toHaveCount(1);
    await expect(bottomNav.locator('button[aria-label^="看板"]')).toHaveCount(1);
    await expect(bottomNav.locator('button[aria-label="商单"]')).toHaveCount(1);
    await expect(bottomNav.locator('button[aria-label="设置"]')).toHaveCount(1);
    await expect(bottomNav.getByRole('button', { name: '新建选题', exact: true })).toBeVisible();
    await expect(bottomNav.locator('button[aria-label^="日历"]')).toHaveCount(0);
    await expect(page.locator('.navbar-container button[aria-label="新选题"]')).toBeHidden();

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
  await expect(page.locator('.navbar-container button[aria-label="新选题"]')).toBeVisible();
});

test('移动端抽屉保留次级页面入口', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole('button', { name: '打开菜单' }).click();

  const drawer = page.getByRole('dialog', { name: '移动端导航菜单' });
  await expect(drawer).toBeVisible();
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
