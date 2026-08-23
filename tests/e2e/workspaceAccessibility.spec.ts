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
  await select.press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox')).toHaveCount(0);

  await page.keyboard.press('n');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
