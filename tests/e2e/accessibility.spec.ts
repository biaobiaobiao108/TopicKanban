import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const authenticatedRoutes = [
  '/today',
  '/calendar',
  '/kanban',
  '/people',
  '/tags',
  '/published',
  '/deals',
  '/database',
  '/settings',
];

const accessibilityTopic = {
  id: 'e2e-accessibility-topic',
  title: '无障碍回归测试选题',
  summary: '用于验证选题详情页的表单和导航结构。',
  hook: '详情页无障碍检查用开场钩子',
  storyline: '详情页无障碍检查用故事线',
  why_now: '详情页无障碍检查用传播时机',
  status: 'production',
  priority: 'medium',
  next_action: '检查详情页无障碍结构',
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

async function login(page: Page) {
  await page.goto('/');
  await page.locator('input[name="password"]').fill('admin');
  await page.getByRole('button', { name: '进入工作台' }).click();
  await expect(page).toHaveURL(/\/today$/);
}

async function expectNoAccessibilityViolations(page: Page, route: string) {
  await page.waitForTimeout(350);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({ target: node.target, html: node.html })),
    })),
    `${route} 存在无障碍问题`,
  ).toEqual([]);
}

test('主要工作台页面通过 axe 无障碍检查', async ({ page }) => {
  await login(page);

  for (const route of authenticatedRoutes) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('main')).toHaveAttribute('tabindex', '-1');
    await expectNoAccessibilityViolations(page, route);
  }
});

test('选题详情页直接打开时通过 axe 无障碍检查', async ({ page }) => {
  await login(page);
  await page.route('**/api/bootstrap**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        topics: [accessibilityTopic],
        people: [],
        relationships: [],
        published: [],
        tags: [],
        settings: {
          reading_speed: 280,
          theme: 'light',
          stale_action_days: 5,
          default_share_ttl_days: 3,
          voiceover_cues: [],
        },
      }),
    });
  });
  await page.goto(`/topics/${accessibilityTopic.id}`);
  await expect(page.locator('main h1')).toHaveText(accessibilityTopic.title);
  await expectNoAccessibilityViolations(page, 'topic-detail');
});

test('指令面板和快速新建弹层支持焦点循环与恢复', async ({ page }) => {
  await login(page);
  await page.waitForTimeout(100);

  const quickCreateTrigger = page.locator('button[aria-label="新选题"]:visible').first();
  await quickCreateTrigger.focus();
  await quickCreateTrigger.click();
  const quickCreateDialog = page.getByRole('dialog').last();
  await expect(quickCreateDialog).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await expectNoAccessibilityViolations(page, 'quick-create-dialog');

  const quickCreateFocusable = quickCreateDialog.locator(
    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  await quickCreateFocusable.last().focus();
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', '关闭弹窗');
  await page.keyboard.press('Escape');
  await expect(quickCreateDialog).toBeHidden();
  await expect(quickCreateTrigger).toBeFocused();

  const desktopCommandPaletteTrigger = page.locator('aside').getByRole('button', { name: '全局搜索与指令' });
  const mobileMenuTrigger = page.getByRole('button', { name: '打开菜单' });
  const commandPaletteTrigger = desktopCommandPaletteTrigger;
  if (await mobileMenuTrigger.isVisible()) {
    await mobileMenuTrigger.focus();
    await page.keyboard.press('Control+/');
  } else {
    await commandPaletteTrigger.focus();
    await commandPaletteTrigger.click();
  }
  const commandPalette = page.getByRole('dialog', { name: '全局指令搜索面板' });
  await expect(commandPalette).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await expect(page.locator('input[aria-label="搜索指令和选题"]')).toBeFocused();
  await expectNoAccessibilityViolations(page, 'command-palette');

  const paletteFocusable = commandPalette.locator(
    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  await paletteFocusable.last().focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('input[aria-label="搜索指令和选题"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(commandPalette).toBeHidden();
  if (await mobileMenuTrigger.isVisible()) {
    await expect(mobileMenuTrigger).toBeFocused();
  } else {
    await expect(commandPaletteTrigger).toBeFocused();
  }
});
