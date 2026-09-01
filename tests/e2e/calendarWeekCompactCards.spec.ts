import { expect, test, type Page } from '@playwright/test';

const deal = {
  id: 'e2e-calendar-deal',
  title: '新品发布合作视频',
  brand_name: '星河品牌',
  agency_name: '',
  contact_name: '测试联系人',
  contact_channel: '微信',
  source: 'brand_direct',
  deliverable_type: 'custom_video',
  status: 'producing',
  contract_status: 'signed',
  contract_summary: '已签署测试合同',
  brief: '验证日历周视图紧凑商单卡片。',
  requirements: '',
  restrictions: '',
  amount_cents: 128000,
  payment_status: 'unpaid',
  paid_at: null,
  delivery_due_date: '2026-08-28',
  publish_date: null,
  next_action: '确认脚本交付时间',
  next_action_due_date: '2026-08-27',
  published_video_id: null,
  created_at: '2026-08-25T00:00:00.000Z',
  updated_at: '2026-08-25T00:00:00.000Z',
  primary_topic_id: null,
  primary_topic_title: null,
  linked_topic_count: 0,
};

const dealDetail = {
  ...deal,
  topics: [],
  activities: [],
  published_video: null,
};

const calendarTopic = {
  id: 'e2e-calendar-topic',
  title: '日历返回链路测试选题',
  summary: '验证选题日历各类事项的返回链路。',
  hook: '验证日历跳转返回',
  storyline: '从日历进入选题详情后返回原周视图。',
  why_now: '上线前回归测试。',
  status: 'production',
  priority: 'medium',
  current_todo: { id: 'e2e-calendar-todo', topic_id: 'e2e-calendar-topic', title: '确认返回链路', is_current: 1, current_started_at: '2026-08-25T00:00:00.000Z', completed_at: null, sort_order: 1, created_at: '2026-08-25T00:00:00.000Z', updated_at: '2026-08-25T00:00:00.000Z' },
  target_publish_date: '2026-08-28',
  deadline: '2026-08-28',
  score_character: 2,
  score_conflict: 2,
  score_contrast: 2,
  score_material: 2,
  score_story: 2,
  is_pinned: 0,
  sort_order: 0,
  created_at: '2026-08-25T00:00:00.000Z',
  updated_at: '2026-08-25T00:00:00.000Z',
  tags: [],
  people: [],
  commercial_deals_count: 0,
};

const publishedVideo = {
  id: 'e2e-calendar-published',
  topic_id: null,
  title: '日历返回链路已发布视频',
  url: '',
  bvid: '',
  published_at: '2026-08-28',
  views: 128,
  likes: 12,
  coins: 3,
  favorites: 4,
  comments: 1,
  notes: '',
  updated_at: '2026-08-28T00:00:00.000Z',
};

async function mockWorkspace(page: Page, options: { includeCalendarContent?: boolean } = {}) {
  const includeCalendarContent = options.includeCalendarContent === true;
  const topics = includeCalendarContent ? [calendarTopic] : [];
  const published = includeCalendarContent ? [publishedVideo] : [];
  await page.route('**/api/bootstrap**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        topics,
        people: [],
        relationships: [],
        published,
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
  await page.route('**/api/today/focus', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ topics: [], total_active: 0 }),
    });
  });
  await page.route('**/api/todos', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(includeCalendarContent ? [calendarTopic.current_todo] : []) });
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
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(published) });
  });
  await page.route('**/api/published/page*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: published,
        page: 1,
        page_size: 30,
        total: published.length,
        total_pages: published.length > 0 ? 1 : 0,
      }),
    });
  });
  await page.route('**/api/topics/page*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: topics,
        page: 1,
        page_size: 100,
        total: topics.length,
        total_pages: topics.length > 0 ? 1 : 0,
      }),
    });
  });
  await page.route('**/api/topics?*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: topics,
        page: 1,
        page_size: 30,
        total: topics.length,
        total_pages: topics.length > 0 ? 1 : 0,
      }),
    });
  });
  await page.route('**/api/deals/page*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: [deal],
        page: 1,
        page_size: 100,
        total: 1,
        total_pages: 1,
        summary: {
          active_count: 1,
          due_soon_count: 1,
          needs_action_count: 0,
          unpaid_amount_cents: deal.amount_cents,
          unpaid_count: 1,
        },
      }),
    });
  });
  await page.route(`**/api/deals/${deal.id}`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(dealDetail) });
  });
  await page.route(`**/api/topics/${calendarTopic.id}/workspace`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ sources: [], timeline: [], citations: [], publish_package: null, draft: null }),
    });
  });
  await page.route(`**/api/topics/${calendarTopic.id}/sources`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.route(`**/api/topics/${calendarTopic.id}/timeline`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.route(`**/api/topics/${calendarTopic.id}/draft`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ draft: null, conflict: null }) });
  });
  await page.route(`**/api/topics/${calendarTopic.id}/citations`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.route(`**/api/topics/${calendarTopic.id}/deals`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
}

async function login(page: Page) {
  await page.goto('/');
  await page.locator('input[name="password"]').fill('admin');
  await page.getByRole('button', { name: '进入工作台' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator('main h1')).toBeVisible();
}

test('周视图按日期纵向排列并展示舒展商单卡片', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await mockWorkspace(page);
  await login(page);

  await page.goto('/calendar?view=week&date=2026-08-28');
  await expect(page.getByRole('heading', { name: '选题日历', exact: true })).toBeVisible();

  const event = page.getByTestId('calendar-event').filter({ hasText: '星河品牌' });
  await expect(event).toBeVisible();
  await expect(event).toContainText('制作中');
  await expect(event).not.toContainText('收集箱');

  const layout = await event.evaluate((element) => ({
    cardWidth: element.getBoundingClientRect().width,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    titleLines: (() => {
      const title = element.querySelector<HTMLElement>('[data-testid="calendar-event-title"]');
      if (!title) return 0;
      return Math.round(title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight));
    })(),
  }));
  expect(layout.cardWidth).toBeGreaterThan(240);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.titleLines).toBeLessThanOrEqual(2);

  const weekLayout = await page.getByTestId('calendar-week-grid').evaluate((element) => {
    const days = [...element.querySelectorAll<HTMLElement>('[data-testid="calendar-week-day"]')];
    return {
      dayCount: days.length,
      topPositions: days.map((day) => day.getBoundingClientRect().top),
      rightEdge: element.getBoundingClientRect().right,
    };
  });
  expect(weekLayout.dayCount).toBe(7);
  expect(weekLayout.topPositions.every((top, index, positions) => index === 0 || top > positions[index - 1])).toBe(true);
  expect(weekLayout.rightEdge).toBeLessThanOrEqual(1281);

  await event.click();
  await expect(page).toHaveURL(/\/deals\/e2e-calendar-deal$/);
  const dealBackBar = page.getByTestId('back-navigation-bar');
  await expect(dealBackBar).toBeVisible();
  await expect(dealBackBar).toHaveClass(/min-h-16/);
  const backButton = page.getByRole('button', { name: '返回选题日历' });
  await expect(backButton).toBeVisible();
  await backButton.click();
  await expect(page).toHaveURL('/calendar?view=week&date=2026-08-28');
  await expect(page.getByRole('button', { name: '周视图' })).toHaveClass(/bg-white/);
  expect(pageErrors).toEqual([]);
});

test('手机端周视图卡片自动单列且不产生横向溢出', async ({ page }) => {
  await mockWorkspace(page, { includeCalendarContent: true });
  await login(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar?view=week&date=2026-08-28');
  await expect(page.getByTestId('calendar-week-grid')).toBeVisible();

  const layout = await page.getByTestId('calendar-week-grid').evaluate((element) => {
    const days = [...element.querySelectorAll<HTMLElement>('[data-testid="calendar-week-day"]')];
    const cards = [...element.querySelectorAll<HTMLElement>('[data-testid="calendar-event"]')];
    return {
      dayCount: days.length,
      gridScrollWidth: element.scrollWidth,
      gridClientWidth: element.clientWidth,
      cardWidths: cards.map((card) => card.getBoundingClientRect().width),
    };
  });

  expect(layout.dayCount).toBe(7);
  expect(layout.gridScrollWidth).toBeLessThanOrEqual(layout.gridClientWidth + 1);
  expect(layout.cardWidths.every((width) => width > 0 && width < 390)).toBe(true);
});

test('看板排期与截稿徽标使用一致的语义字体', async ({ page }) => {
  await mockWorkspace(page, { includeCalendarContent: true });
  await login(page);

  await page.goto('/kanban');
  const card = page.locator(`[data-topic-id="${calendarTopic.id}"]`);
  await expect(card).toBeVisible();

  const badgeStyles = await card.evaluate((element) => {
    const schedule = element.querySelector<HTMLElement>('[data-testid="topic-schedule-badge"]');
    const deadline = element.querySelector<HTMLElement>('[data-testid="topic-deadline-badge"]');
    const meta = element.querySelector<HTMLElement>('[data-testid="topic-card-meta"]');
    if (!schedule || !deadline || !meta) return null;

    const scheduleStyle = getComputedStyle(schedule);
    const deadlineStyle = getComputedStyle(deadline);
    const scheduleDate = schedule.querySelector<HTMLElement>('time');
    const deadlineDate = deadline.querySelector<HTMLElement>('time');

    return {
      schedule: {
        fontFamily: scheduleStyle.fontFamily,
        fontSize: scheduleStyle.fontSize,
        fontWeight: scheduleStyle.fontWeight,
        lineHeight: scheduleStyle.lineHeight,
        whiteSpace: scheduleStyle.whiteSpace,
      },
      deadline: {
        fontFamily: deadlineStyle.fontFamily,
        fontSize: deadlineStyle.fontSize,
        fontWeight: deadlineStyle.fontWeight,
        lineHeight: deadlineStyle.lineHeight,
        whiteSpace: deadlineStyle.whiteSpace,
      },
      dates: {
        scheduleFontFamily: scheduleDate ? getComputedStyle(scheduleDate).fontFamily : '',
        deadlineFontFamily: deadlineDate ? getComputedStyle(deadlineDate).fontFamily : '',
        scheduleVariant: scheduleDate ? getComputedStyle(scheduleDate).fontVariantNumeric : '',
        deadlineVariant: deadlineDate ? getComputedStyle(deadlineDate).fontVariantNumeric : '',
      },
      colors: {
        schedule: scheduleStyle.color,
        deadline: deadlineStyle.color,
      },
      classNames: {
        schedule: schedule.className,
        deadline: deadline.className,
      },
      metaBackground: getComputedStyle(meta).backgroundColor,
    };
  });

  expect(badgeStyles).not.toBeNull();
  expect(badgeStyles?.schedule).toEqual(badgeStyles?.deadline);
  expect(badgeStyles?.classNames.schedule).toContain('text-rose-');
  expect(badgeStyles?.classNames.deadline).toContain('text-amber-');
  expect(badgeStyles?.schedule.fontFamily).not.toContain('JetBrains Mono');
  expect(badgeStyles?.colors.schedule).not.toBe(badgeStyles?.colors.deadline);
  expect(badgeStyles?.dates.scheduleFontFamily).toBe(badgeStyles?.dates.deadlineFontFamily);
  expect(badgeStyles?.dates.scheduleVariant).toContain('tabular-nums');
  expect(badgeStyles?.dates.deadlineVariant).toContain('tabular-nums');
  expect(badgeStyles?.metaBackground).toBe('rgba(0, 0, 0, 0)');

  const themeVariants = [
    [],
    ['theme-warm-paper'],
    ['theme-nordic-frost'],
    ['theme-parisian-dawn'],
    ['theme-midnight-obsidian', 'dark'],
    ['theme-kyoto-zen'],
  ];
  const themeClasses = [
    'theme-warm-paper',
    'theme-nordic-frost',
    'theme-parisian-dawn',
    'theme-midnight-obsidian',
    'theme-kyoto-zen',
  ];
  for (const classes of themeVariants) {
    await page.evaluate(({ classes, themeClasses }) => {
      document.documentElement.classList.remove(...themeClasses, 'dark');
      document.documentElement.classList.add(...classes);
    }, { classes, themeClasses });
    const themeStyles = await card.evaluate((element) => {
      const column = element.closest<HTMLElement>('[data-column-status]');
      const count = column?.querySelector<HTMLElement>('.kanban-column-count');
      const schedule = element.querySelector<HTMLElement>('[data-testid="topic-schedule-badge"]');
      const meta = element.querySelector<HTMLElement>('[data-testid="topic-card-meta"]');
      return {
        countBackground: count ? getComputedStyle(count).backgroundColor : '',
        scheduleBackground: schedule ? getComputedStyle(schedule).backgroundColor : '',
        metaBackground: meta ? getComputedStyle(meta).backgroundColor : '',
      };
    });
    expect(themeStyles.countBackground).not.toBe(themeStyles.metaBackground);
    expect(themeStyles.scheduleBackground).not.toBe(themeStyles.countBackground);
    expect(themeStyles.metaBackground).toBe('rgba(0, 0, 0, 0)');
  }
  await page.evaluate(({ themeClasses }) => {
    document.documentElement.classList.remove(...themeClasses, 'dark');
  }, { themeClasses });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/kanban');
  const mobileCard = page.locator(`[data-topic-id="${calendarTopic.id}"]`);
  await expect(mobileCard).toBeVisible();
  const mobileLayout = await mobileCard.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    scheduleWidth: element.querySelector<HTMLElement>('[data-testid="topic-schedule-badge"]')?.getBoundingClientRect().width || 0,
    deadlineWidth: element.querySelector<HTMLElement>('[data-testid="topic-deadline-badge"]')?.getBoundingClientRect().width || 0,
  }));
  expect(mobileLayout.scrollWidth).toBeLessThanOrEqual(mobileLayout.clientWidth + 1);
  expect(mobileLayout.scheduleWidth).toBeGreaterThan(0);
  expect(mobileLayout.deadlineWidth).toBeGreaterThan(0);

  await page.goto('/calendar?view=week&date=2026-08-28');
  const plannedEvent = page.locator('[data-testid="calendar-event"][data-calendar-event-type="planned_publish"]').filter({ hasText: calendarTopic.title });
  const deadlineEvent = page.locator('[data-testid="calendar-event"][data-calendar-event-type="deadline"]').filter({ hasText: calendarTopic.title });
  await expect(plannedEvent).toBeVisible();
  await expect(deadlineEvent).toBeVisible();
  const eventTypography = await Promise.all([plannedEvent, deadlineEvent].map((event) => event.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
    };
  })));
  expect(eventTypography[0]).toEqual(eventTypography[1]);
});

test('行动日期在当天显示相对语义并在跨日后自动变为逾期', async ({ page }) => {
  await page.clock.install({ time: '2026-08-28T00:00:00+08:00' });
  await mockWorkspace(page, { includeCalendarContent: true });
  await login(page);

  await page.goto('/kanban');
  const card = page.locator(`[data-topic-id="${calendarTopic.id}"]`);
  const scheduleTime = card.locator('[data-testid="topic-schedule-badge"] time');
  const deadlineTime = card.locator('[data-testid="topic-deadline-badge"] time');
  await expect(scheduleTime).toHaveText('今天');
  await expect(deadlineTime).toHaveText('今天');
  await expect(scheduleTime).toHaveAttribute('data-date-state', 'today');
  await expect(scheduleTime).toHaveAttribute('title', '今天，2026年8月28日');
  await expect(scheduleTime).toHaveAttribute('aria-label', '今天，2026年8月28日');

  await page.goto('/calendar?view=agenda&date=2026-08-28');
  await expect(page.getByRole('heading', { name: '今天 排期与待办' })).toBeVisible();

  await page.clock.fastForward('24:00:01');
  await page.goto('/kanban');
  await expect(scheduleTime).toHaveText('已逾期 1 天');
  await expect(deadlineTime).toHaveText('已逾期 1 天');
  await expect(scheduleTime).toHaveAttribute('data-date-state', 'overdue');
  await expect(scheduleTime).toHaveAttribute('title', '已逾期 1 天，2026年8月28日');
  await expect(scheduleTime).toHaveAttribute('aria-label', '已逾期 1 天，2026年8月28日');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLayout = await card.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(mobileLayout.scrollWidth).toBeLessThanOrEqual(mobileLayout.clientWidth + 1);

  await page.goto('/deals');
  await expect(page.getByTestId('deal-card').filter({ hasText: '星河品牌' }).locator('time.action-date')).toHaveText('已逾期 1 天');
});

test('直接打开商单详情时返回按钮回退到商单中心', async ({ page }) => {
  await mockWorkspace(page);
  await login(page);

  await page.goto(`/deals/${deal.id}`);
  const backButton = page.getByRole('button', { name: '返回商单中心' });
  await expect(backButton).toBeVisible();
  await backButton.click();
  await expect(page).toHaveURL(/\/deals$/);
  await expect(page.getByRole('heading', { name: '商单中心', exact: true })).toBeVisible();
});

test('日历各类事项跳转后都能返回原周视图', async ({ page }) => {
  const pageErrors: Error[] = [];
  const bootstrapUrls: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  page.on('request', (request) => {
    if (request.url().includes('/api/bootstrap')) bootstrapUrls.push(request.url());
  });
  await mockWorkspace(page, { includeCalendarContent: true });
  await login(page);

  const calendarUrl = '/calendar?view=week&date=2026-08-28';
  const backBarHeights: number[] = [];
  await page.goto(calendarUrl);
  await expect(page.getByRole('heading', { name: '选题日历', exact: true })).toBeVisible();
  expect(bootstrapUrls.some((url) => {
    const parsed = new URL(url);
    return parsed.pathname === '/api/bootstrap' && parsed.searchParams.get('scope') === 'core';
  })).toBe(true);

  await page.reload();
  await expect(page.getByRole('heading', { name: '选题日历', exact: true })).toBeVisible();
  await expect(page.locator('[data-testid="calendar-event"][data-calendar-event-type="planned_publish"]').filter({ hasText: calendarTopic.title })).toBeVisible();

  for (const eventType of ['planned_publish', 'deadline']) {
    const event = page.locator(`[data-testid="calendar-event"][data-calendar-event-type="${eventType}"]`).filter({ hasText: calendarTopic.title });
    await expect(event).toBeVisible();
    await event.click();
    await expect(page).toHaveURL(new RegExp(`/topics/${calendarTopic.id}$`));
    const topicBackBar = page.getByTestId('back-navigation-bar');
    await expect(topicBackBar).toBeVisible();
    backBarHeights.push(await topicBackBar.evaluate((element) => element.getBoundingClientRect().height));
    const backButton = page.getByRole('button', { name: '返回选题日历' });
    await expect(backButton).toBeVisible();
    await backButton.click();
    await expect(page).toHaveURL(calendarUrl);
  }

  const publishedEvent = page.locator('[data-testid="calendar-event"][data-calendar-event-type="published"]').filter({ hasText: publishedVideo.title });
  await expect(publishedEvent).toBeVisible();
  await publishedEvent.click();
  await expect(page).toHaveURL('/published');
  const publishedBackBar = page.getByTestId('back-navigation-bar');
  await expect(publishedBackBar).toBeVisible();
  backBarHeights.push(await publishedBackBar.evaluate((element) => element.getBoundingClientRect().height));
  const publishedBackButton = page.getByRole('button', { name: '返回选题日历' });
  await expect(publishedBackButton).toBeVisible();
  await publishedBackButton.click();
  await expect(page).toHaveURL(calendarUrl);
  await expect(page.getByRole('button', { name: '周视图' })).toHaveClass(/bg-white/);
  expect(new Set(backBarHeights)).toEqual(new Set([64]));
  expect(pageErrors).toEqual([]);
});
