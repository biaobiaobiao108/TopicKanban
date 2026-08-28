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

async function measureMonthGrid(page: Page) {
  const grid = page.getByTestId('calendar-month-grid');
  await expect(grid).toBeVisible();
  return grid.evaluate((element: HTMLElement) => {
    const cells = [...element.querySelectorAll<HTMLElement>('[data-testid="calendar-month-cell"]')];
    const rows = Array.from({ length: Math.ceil(cells.length / 7) }, (_, index) => {
      const row = cells.slice(index * 7, index * 7 + 7);
      const first = row[0]?.getBoundingClientRect();
      const last = row[row.length - 1]?.getBoundingClientRect();
      return first && last ? { top: first.top, bottom: first.bottom, right: last.right } : null;
    }).filter((row): row is { top: number; bottom: number; right: number } => Boolean(row));
    const rect = element.getBoundingClientRect();
    return {
      cellCount: cells.length,
      rows,
      bodyTop: rect.top,
      scrollHeight: element.scrollHeight,
    };
  });
}

test('current month grid keeps row borders and backgrounds aligned', async ({ page }) => {
  await login(page);
  await page.goto('/calendar');
  await expect(page.getByRole('heading', { name: '选题日历', exact: true })).toBeVisible();

  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.reload();
    const layout = await measureMonthGrid(page);

    expect(layout.cellCount % 7).toBe(0);
    expect(layout.cellCount).toBeGreaterThanOrEqual(35);
    expect(layout.rows.length).toBe(layout.cellCount / 7);
    for (let index = 1; index < layout.rows.length; index += 1) {
      expect(layout.rows[index].top).toBeGreaterThanOrEqual(layout.rows[index - 1].bottom - 1);
    }
    expect(layout.rows.at(-1)?.bottom || 0).toBeLessThanOrEqual(layout.bodyTop + layout.scrollHeight + 1);
    expect(layout.rows.every((row) => row.right <= viewport.width + 1)).toBe(true);
  }
});
