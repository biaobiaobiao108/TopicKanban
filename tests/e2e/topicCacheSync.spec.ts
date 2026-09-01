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
  await expect(page.locator('main h1')).toBeVisible();
}

test('topic mutations stay synchronized across today, database and kanban navigation', async ({ page }) => {
  await login(page);

  const kanbanNav = page.getByRole('navigation').getByRole('button', { name: /选题看板/ });
  const countBefore = readTopicCount(await kanbanNav.innerText());
  const title = `E2E缓存同步-${Date.now()}`;

  await page.getByRole('button', { name: '新选题' }).click();
  await page.getByPlaceholder('例如：大胃袋良子：峨眉山减肥大溃败').fill(title);
  await page.getByRole('button', { name: '立即创建' }).click();

  await expect.poll(async () => readTopicCount(await kanbanNav.innerText())).toBe(countBefore + 1);

  await page.getByRole('navigation').getByRole('button', { name: '选题库' }).click();
  const topicRow = page.locator('tr').filter({ hasText: title });
  await expect(topicRow).toBeVisible();

  await topicRow.getByTitle('移入回收站').click();
  const confirmDialog = page.getByRole('dialog', { name: '移入回收站' });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: '移入回收站', exact: true }).click();
  await expect(topicRow).toHaveCount(0);

  await page.getByRole('navigation').getByRole('button', { name: /选题看板/ }).click();
  await expect.poll(async () => readTopicCount(await kanbanNav.innerText())).toBe(countBefore);
});

test('topic date edits are visible on kanban before delayed saves finish', async ({ page }) => {
  await login(page);

  const title = `E2E日期即时同步-${Date.now()}`;
  await page.getByRole('button', { name: '新选题' }).click();
  await page.getByPlaceholder('例如：大胃袋良子：峨眉山减肥大溃败').fill(title);
  await page.getByRole('button', { name: '立即创建' }).click();
  await page.getByRole('navigation').getByRole('button', { name: /选题看板/ }).click();
  const boardCard = page.locator('[data-topic-id]').filter({ hasText: title });
  await expect(boardCard).toBeVisible();
  const topicId = await boardCard.getAttribute('data-topic-id');
  if (!topicId) throw new Error('看板卡片缺少选题 ID');
  await boardCard.getByRole('heading', { name: title, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/topics/${topicId}$`));

  let pendingSaves = 0;
  let completedSaves = 0;
  let releaseSaves!: () => void;
  const savesReleased = new Promise<void>((resolve) => {
    releaseSaves = resolve;
  });
  let resolveCompleted!: () => void;
  const savesCompleted = new Promise<void>((resolve) => {
    resolveCompleted = resolve;
  });
  await page.route(`**/api/topics/${topicId}`, async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    pendingSaves += 1;
    await savesReleased;
    await route.continue();
    completedSaves += 1;
    if (completedSaves >= 2) resolveCompleted();
  });

  await page.locator('#overview-target-publish-date').fill('20260901');
  await page.locator('#overview-deadline').fill('20260905');
  await expect.poll(() => pendingSaves).toBeGreaterThanOrEqual(2);

  await page.getByRole('button', { name: '返回选题看板' }).click();
  await expect(page).toHaveURL('/kanban');
  const updatedCard = page.locator(`[data-topic-id="${topicId}"]`);
  await expect(updatedCard.getByTestId('topic-schedule-badge')).toContainText('排期');
  await expect(updatedCard.getByTestId('topic-schedule-badge').locator('time')).toHaveAttribute('datetime', '2026-09-01');
  await expect(updatedCard.getByTestId('topic-deadline-badge')).toContainText('截稿');
  await expect(updatedCard.getByTestId('topic-deadline-badge').locator('time')).toHaveAttribute('datetime', '2026-09-05');

  releaseSaves();
  await savesCompleted;

  await page.getByRole('navigation').getByRole('button', { name: '选题库' }).click();
  const topicRow = page.locator('tr').filter({ hasText: title });
  await expect(topicRow).toBeVisible();
  await topicRow.getByTitle('移入回收站').click();
  const confirmDialog = page.getByRole('dialog', { name: '移入回收站' });
  await confirmDialog.getByRole('button', { name: '移入回收站', exact: true }).click();
  await expect(topicRow).toHaveCount(0);
});
