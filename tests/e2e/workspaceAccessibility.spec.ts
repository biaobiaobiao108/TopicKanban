import { expect, test } from '@playwright/test';

test('workspace login, keyboard select and modal semantics work', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/');
  await page.locator('input[name="password"]').fill('admin');
  await page.getByRole('button', { name: '进入工作台' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('heading', { name: '选题生产工作台' })).toBeVisible();

  await page.goto('/kanban');
  const select = page.getByRole('combobox').first();
  await expect(select).toBeVisible();
  await expect(select).toHaveAttribute('aria-label', '优先级筛选');
  await select.press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox')).toHaveCount(0);

  const quickDropButton = page.getByRole('button', { name: /打开手机快投灵感箱/ });
  await quickDropButton.click();
  await expect(page.getByRole('dialog', { name: '手机快投灵感箱' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '手机快投灵感箱' })).toHaveCount(0);

  await page.keyboard.press('n');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: /全局搜索与指令/ }).click();
  const commandInput = page.getByPlaceholder(/输入指令、搜索选题/);
  await page.getByRole('button', { name: '? 快捷键大全' }).click();
  await expect(page.getByText('全局呼出此指令面板（任何输入框、正文聚焦或专注全屏均可用）')).toBeVisible();
  await commandInput.fill('? 搜索');
  await expect(page.getByText('全局呼出此指令面板（任何输入框、正文聚焦或专注全屏均可用）')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(pageErrors).toEqual([]);
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
  const settingsSave = page.waitForResponse((response) => response.url().includes('/api/settings') && response.request().method() === 'PUT');
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
  await expect.poll(async () => listbox.evaluate((element) => getComputedStyle(element.parentElement || element).backgroundColor)).not.toBe('rgb(255, 255, 255)');
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 390, height: 844 });
  const statusTrigger = page.getByRole('button', { name: '流转' }).first();
  if (await statusTrigger.count()) {
    await statusTrigger.click();
    const statusMenuHeading = page.getByText('活跃生产阶段').last();
    await expect(statusMenuHeading).toBeVisible();
    const menuBounds = await statusMenuHeading.evaluate((element) => {
      const rect = element.parentElement?.getBoundingClientRect();
      return rect ? {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        position: getComputedStyle(element.parentElement as HTMLElement).position,
      } : null;
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
  const mobilePaginationButton = page.getByRole('button', { name: '上一页' }).last();
  await expect(mobilePaginationButton).toBeVisible();
  await expect.poll(async () => mobilePaginationButton.evaluate((element) => getComputedStyle(element.parentElement || element).backgroundColor)).not.toBe('rgb(245, 245, 244)');
  const mobileCard = page.locator('article').first();
  if (await mobileCard.count()) {
    await expect.poll(async () => mobileCard.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgb(255, 255, 255)');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
});
