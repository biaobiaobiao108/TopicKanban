import { expect, test, type Locator, type Page } from '@playwright/test';

const topic = {
  id: 'e2e-floating-topic',
  title: '浮层回归测试选题',
  summary: '用于验证生产工作台详情页浮层定位的测试选题。',
  hook: '一个浮层测试用的开场钩子',
  storyline: '测试故事线',
  why_now: '测试用的传播时机',
  status: 'production',
  priority: 'medium',
  next_action: '检查详情页浮层',
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

const draft = {
  id: 'e2e-floating-draft',
  topic_id: topic.id,
  title: '浮层测试文案',
  content_html: '<h1>开场</h1><p>测试文案内容。</p>',
  content_json: JSON.stringify({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '开场' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '测试文案内容。' }] },
    ],
  }),
  word_count: 8,
  version: 1,
  updated_at: '2026-08-25T00:00:00.000Z',
};

async function mockWorkspace(page: Page) {
  let currentTopic = { ...topic };
  await page.route('**/api/bootstrap**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        topics: [currentTopic],
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
  await page.route(`**/api/topics/${topic.id}`, async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    currentTopic = { ...currentTopic, ...(route.request().postDataJSON() as Partial<typeof topic>) };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(currentTopic) });
  });
  await page.route(`**/api/topics/${topic.id}/workspace`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ sources: [], timeline: [], citations: [], publish_package: null, draft }),
    });
  });
  await page.route(`**/api/topics/${topic.id}/sources`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.route(`**/api/topics/${topic.id}/timeline`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.route(`**/api/topics/${topic.id}/draft`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ draft, conflict: null }) });
  });
  await page.route(`**/api/topics/${topic.id}/citations`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.route(`**/api/topics/${topic.id}/deals`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
}

async function login(page: Page) {
  await page.goto('/');
  await page.locator('input[name="password"]').fill('admin');
  await page.getByRole('button', { name: '进入工作台' }).click();
  await expect(page).toHaveURL(/\/today$/);
}

async function expectSafeFloatingMenu(page: Page, menu: Locator) {
  await expect(menu).toBeVisible();
  await expect.poll(async () => menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
  })).toBe(true);
  const metrics = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const sample = document.elementFromPoint(rect.left + Math.min(12, rect.width / 2), rect.top + Math.min(12, rect.height / 2));
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      position: style.position,
      zIndex: Number(style.zIndex),
      sampleInside: sample === element || Boolean(sample && element.contains(sample)),
    };
  });

  expect(metrics.position).toBe('fixed');
  expect(metrics.zIndex).toBeGreaterThanOrEqual(100);
  expect(metrics.left).toBeGreaterThanOrEqual(0);
  expect(metrics.top).toBeGreaterThanOrEqual(0);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.sampleInside).toBe(true);
}

test('详情页顶栏浮层跨全部标签页保持可见且可关闭', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await mockWorkspace(page);
  await login(page);

  const tabs = [
    ['overview', '概览与评分'],
    ['sources', '资料与素材'],
    ['timeline', '故事时间线'],
    ['people', '人物与关系'],
    ['deals', '商单'],
    ['script', '文案创作'],
    ['publish', '发布包'],
  ] as const;
  for (const [tab, label] of tabs) {
    await page.goto(`/topics/${topic.id}${tab === 'overview' ? '' : `?tab=${tab}`}`);
    await expect(page.getByRole('heading', { name: topic.title, exact: true })).toBeVisible();
    await expect(page.locator('button[aria-current="page"]')).toHaveText(new RegExp(label));

    const statusTrigger = page.getByTitle('修改选题生产阶段');
    await statusTrigger.click();
    const statusMenu = page.locator('[aria-label="活跃生产阶段"]');
    await expect(statusTrigger).toHaveAttribute('aria-expanded', 'true');
    await expectSafeFloatingMenu(page, statusMenu);
    await page.keyboard.press('Escape');
    await expect(statusMenu).toHaveCount(0);

    const priorityTrigger = page.getByTitle('设置选题优先级');
    await priorityTrigger.click();
    const priorityMenu = page.locator('[aria-label="优先级设定"]');
    await expectSafeFloatingMenu(page, priorityMenu);
    await page.mouse.click(4, 4);
    await expect(priorityMenu).toHaveCount(0);

    if (tab === 'sources') {
      const platformFilter = page.getByRole('combobox', { name: '来源平台筛选' });
      await platformFilter.click();
      const listbox = page.getByRole('listbox', { name: '来源平台筛选' });
      await expectSafeFloatingMenu(page, listbox.locator('..'));
      await page.keyboard.press('Escape');
      await expect(listbox).toHaveCount(0);
    }
  }

  const statusTrigger = page.getByTitle('修改选题生产阶段');
  await statusTrigger.click();
  await page.locator('[aria-label="活跃生产阶段"]').getByRole('button', { name: '写稿中', exact: true }).click();
  await expect(statusTrigger).toContainText('写稿中');
  await expect(pageErrors).toEqual([]);
});

test('移动端顶栏、底部阶段菜单和更多菜单均不超出视口', async ({ page }) => {
  await mockWorkspace(page);
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/topics/${topic.id}?tab=overview`);

  const statusTrigger = page.getByTitle('修改选题生产阶段');
  await statusTrigger.click();
  await expectSafeFloatingMenu(page, page.locator('[aria-label="活跃生产阶段"]'));
  await page.keyboard.press('Escape');

  const priorityTrigger = page.getByTitle('设置选题优先级');
  await priorityTrigger.click();
  await expectSafeFloatingMenu(page, page.locator('[aria-label="优先级设定"]'));
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '改阶段', exact: true }).click();
  const stageMenu = page.locator('[aria-label="切换生产阶段"]');
  await expectSafeFloatingMenu(page, stageMenu);
  const stageRelation = await stageMenu.evaluate((element) => {
    const menu = element.getBoundingClientRect();
    const trigger = document.querySelector<HTMLButtonElement>('button[aria-expanded="true"][aria-controls]');
    const triggerRect = trigger?.getBoundingClientRect();
    return { menuBottom: menu.bottom, triggerTop: triggerRect?.top || 0 };
  });
  expect(stageRelation.menuBottom).toBeLessThanOrEqual(stageRelation.triggerTop);
  await page.keyboard.press('Escape');
  await expect(stageMenu).toHaveCount(0);

  await page.getByRole('button', { name: '更多', exact: true }).click();
  const moreMenu = page.locator('[aria-label="详情页更多标签"]');
  await expectSafeFloatingMenu(page, moreMenu);
  await moreMenu.getByRole('button', { name: '故事时间线', exact: true }).click();
  await expect(page).toHaveURL(/tab=timeline$/);
});

test('文案页气口菜单使用视口浮层并支持选项选择', async ({ page }) => {
  await mockWorkspace(page);
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/topics/${topic.id}?tab=script`);

  const cueTrigger = page.getByTitle(/插入演播配音气口标记/);
  await expect(cueTrigger).toBeVisible();
  await cueTrigger.click();
  const cueMenu = page.locator('[aria-label="演播气口库"]');
  await expectSafeFloatingMenu(page, cueMenu);
  await cueMenu.locator('button').filter({ hasText: '停顿 1s' }).first().click();
  await expect(cueMenu).toContainText('已插入');
  await page.keyboard.press('Escape');
  await expect(cueMenu).toHaveCount(0);
});
