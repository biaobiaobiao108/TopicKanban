import { expect, test, type Page } from '@playwright/test';

function readTopicCount(label: string): number {
  const match = label.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : 0;
}

async function login(page: Page) {
  await page.goto('/');
  const password = page.locator('input[name="password"]');
  if (await password.count()) {
    await password.fill('admin');
    const todayFocusResponse = page.waitForResponse((response) => (
      response.url().includes('/api/today/focus')
      && response.request().method() === 'GET'
      && response.ok()
    ));
    await page.getByRole('button', { name: '进入工作台' }).click();
    await todayFocusResponse;
  }
  await expect(page).toHaveURL(/\/today$/);
}

test('topic mutations stay synchronized across today, database and kanban navigation', async ({ page }) => {
  await login(page);

  const kanbanNav = page.getByRole('navigation').getByRole('button', { name: /选题看板/ });
  const countBefore = readTopicCount(await kanbanNav.innerText());
  const title = `E2E缓存同步-${Date.now()}`;

  await page.getByRole('button', { name: '新选题' }).click();
  await page.getByPlaceholder('例如：大胃袋良子：峨眉山减肥大溃败').fill(title);
  await page.getByRole('button', { name: '立即创建' }).click();

  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect.poll(async () => readTopicCount(await kanbanNav.innerText())).toBe(countBefore + 1);

  await page.getByRole('navigation').getByRole('button', { name: '选题库' }).click();
  const topicRow = page.locator('tr').filter({ hasText: title });
  await expect(topicRow).toBeVisible();

  page.on('dialog', (dialog) => dialog.accept());
  await topicRow.getByTitle('移入回收站').click();
  await expect(topicRow).toHaveCount(0);

  await page.getByRole('navigation').getByRole('button', { name: /选题看板/ }).click();
  await expect.poll(async () => readTopicCount(await kanbanNav.innerText())).toBe(countBefore);
});
