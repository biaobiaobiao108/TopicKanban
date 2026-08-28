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

async function mockMonthOverflowWorkspace(page: Page) {
  const topics = Array.from({ length: 4 }, (_, index) => ({
    id: `e2e-month-overflow-${index + 1}`,
    title: `月视图超量事项 ${index + 1}`,
    summary: '',
    hook: '',
    storyline: '',
    why_now: '',
    status: 'approved',
    priority: 'medium',
    next_action: '',
    target_publish_date: '2026-08-15',
    deadline: null,
    next_action_deferred_until: null,
    score_character: 1,
    score_conflict: 1,
    score_contrast: 1,
    score_material: 1,
    score_story: 1,
    is_pinned: 0,
    sort_order: index,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    tags: [],
    people: [],
    commercial_deals_count: 0,
  }));

  await page.route('**/api/bootstrap**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        topics,
        people: [],
        relationships: [],
        published: [],
        tags: [],
        settings: {
          reading_speed: 280,
          theme: 'light',
          stale_action_days: 5,
          default_share_ttl_days: 3,
          voiceover_cues: ['[停顿 1s]', '[重音]'],
        },
      }),
    });
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
  await page.route('**/api/published', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/published/page*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [], page: 1, page_size: 30, total: 0, total_pages: 0 }),
    });
  });
  await page.route('**/api/topics/page*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: topics, page: 1, page_size: 100, total: topics.length, total_pages: 1 }),
    });
  });
  await page.route('**/api/deals/page*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: [],
        page: 1,
        page_size: 100,
        total: 0,
        total_pages: 0,
        summary: {
          active_count: 0,
          due_soon_count: 0,
          needs_action_count: 0,
          unpaid_amount_cents: 0,
          unpaid_count: 0,
        },
      }),
    });
  });
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

test('month cells expose hidden event count and open all events', async ({ page }) => {
  await mockMonthOverflowWorkspace(page);
  await login(page);

  await page.goto('/calendar?view=month&date=2026-08-15');
  const cell = page.locator('[data-testid="calendar-month-cell"][data-date="2026-08-15"]');
  await expect(cell).toBeVisible();
  await expect(cell.getByTestId('calendar-event')).toHaveCount(3);

  const overflow = cell.getByTestId('calendar-month-overflow');
  await expect(overflow).toHaveText('+1');
  await expect(overflow).toHaveAttribute('aria-label', '2026-08-15 还有 1 项事项，查看全部');

  const cardBounds = await cell.evaluate((element) => {
    const cellBottom = element.getBoundingClientRect().bottom;
    const cards = [...element.querySelectorAll<HTMLElement>('[data-testid="calendar-event"]')];
    return {
      cardCount: cards.length,
      lastCardBottom: cards.at(-1)?.getBoundingClientRect().bottom || 0,
      cellBottom,
    };
  });
  expect(cardBounds.cardCount).toBe(3);
  expect(cardBounds.lastCardBottom).toBeLessThanOrEqual(cardBounds.cellBottom + 1);

  await overflow.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('2026-08-15');
  await expect(dialog.getByTestId('calendar-event')).toHaveCount(4);
  await expect(dialog).toContainText('月视图超量事项 4');
});
