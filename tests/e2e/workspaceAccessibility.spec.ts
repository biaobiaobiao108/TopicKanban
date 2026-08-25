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
