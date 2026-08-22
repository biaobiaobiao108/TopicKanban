import type { Hono } from 'hono';
import type { AppSettings } from '../types';
import { DEFAULT_APP_SETTINGS } from '../types';
import {
  BackupImportLimitError,
  exportAllData,
  loadBootstrap,
  replaceAllData,
} from './database';
import { validateBackupData } from '../lib/backupValidation';
import type { ApiBindings } from './apiShared';
import { createToken, jsonError, requireDb } from './apiShared';

async function getKvSettings(kv?: KVNamespace): Promise<AppSettings> {
  if (!kv) return DEFAULT_APP_SETTINGS;
  try {
    const settings = await kv.get<AppSettings>('app_settings', 'json');
    if (settings && Number.isFinite(settings.reading_speed)) {
      const validThemes = ['light', 'dark', 'warm_paper', 'system'];
      const validFontSizes = ['compact', 'standard', 'large'];
      const validLineHeights = ['normal', 'relaxed', 'loose'];

      return {
        reading_speed: settings.reading_speed > 0 ? settings.reading_speed : DEFAULT_APP_SETTINGS.reading_speed,
        theme: validThemes.includes(settings.theme) ? settings.theme : DEFAULT_APP_SETTINGS.theme,
        editor_font_size: validFontSizes.includes(settings.editor_font_size as string) ? settings.editor_font_size : DEFAULT_APP_SETTINGS.editor_font_size,
        editor_line_height: validLineHeights.includes(settings.editor_line_height as string) ? settings.editor_line_height : DEFAULT_APP_SETTINGS.editor_line_height,
        typewriter_mode_default: typeof settings.typewriter_mode_default === 'boolean' ? settings.typewriter_mode_default : DEFAULT_APP_SETTINGS.typewriter_mode_default,
        stale_action_days: Number.isFinite(settings.stale_action_days) && (settings.stale_action_days as number) > 0 ? settings.stale_action_days : DEFAULT_APP_SETTINGS.stale_action_days,
        default_share_ttl_days: Number.isFinite(settings.default_share_ttl_days) && (settings.default_share_ttl_days as number) > 0 ? settings.default_share_ttl_days : DEFAULT_APP_SETTINGS.default_share_ttl_days,
        reviewer_branding: typeof settings.reviewer_branding === 'string' ? settings.reviewer_branding : DEFAULT_APP_SETTINGS.reviewer_branding,
      };
    }
  } catch {
    // fallback to default
  }
  return DEFAULT_APP_SETTINGS;
}

export function registerSystemRoutes(app: Hono<{ Bindings: ApiBindings }>): void {
  app.post('/auth/login', async (c) => {
    try {
      const { password } = await c.req.json<{ password?: string }>();
      const correctPassword = c.env.APP_PASSWORD;
      if (!correctPassword) {
        return c.json({ success: false, message: '云端访问密码尚未配置，请设置 APP_PASSWORD' }, 503);
      }
      if (password !== correctPassword) return c.json({ success: false, message: '密码错误' }, 401);
      return c.json({ success: true, token: await createToken(correctPassword) });
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.get('/health', async (c) => {
    try {
      const db = requireDb(c);
      const tableCheck = await db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table'")
        .first<{ count: number }>();
      return c.json({
        status: 'online', timestamp: new Date().toISOString(), environment: 'cloudflare_pages',
        d1: { connected: true, tables: tableCheck?.count || 0, message: `D1 连接正常 (已检测到 ${tableCheck?.count || 0} 张数据表)` },
        kv: {
          connected: !!c.env.KV,
          message: c.env.KV ? 'KV 已绑定（用于全局偏好设置与轻量边缘交互）' : 'KV 未绑定',
        },
        quick_drop: {
          configured: !!c.env.QUICK_DROP_TOKEN,
          message: c.env.QUICK_DROP_TOKEN ? '独立快投 Token 已配置' : 'QUICK_DROP_TOKEN 未配置',
        },
      });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/bootstrap', async (c) => {
    try {
      const [kvSettings, db] = await Promise.all([
        getKvSettings(c.env.KV),
        Promise.resolve(requireDb(c)),
      ]);
      return c.json(await loadBootstrap(db, kvSettings));
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/backup', async (c) => {
    try {
      const kvSettings = await getKvSettings(c.env.KV);
      return c.json({ data: await exportAllData(requireDb(c), kvSettings) });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.put('/backup', async (c) => {
    try {
      const { data } = await c.req.json<{ data?: unknown }>();
      const validation = validateBackupData(data);
      if (!validation.success) return c.json({ error: validation.error }, 400);
      await replaceAllData(requireDb(c), validation.data);
      if (c.env.KV && validation.data.settings) {
        await c.env.KV.put('app_settings', JSON.stringify(validation.data.settings));
      }
      return c.json({ success: true });
    } catch (error) {
      if (error instanceof BackupImportLimitError) return jsonError(c, error, 413);
      return jsonError(c, error, 400);
    }
  });

  app.get('/settings', async (c) => {
    return c.json(await getKvSettings(c.env.KV));
  });

  app.put('/settings', async (c) => {
    try {
      const settings = await c.req.json<AppSettings>();
      const speed = Number(settings.reading_speed);
      if (!Number.isFinite(speed) || speed <= 0 || speed > 1000) {
        return c.json({ error: 'reading_speed must be between 1 and 1000' }, 400);
      }
      const validThemes = ['light', 'dark', 'warm_paper', 'system'];
      const theme = validThemes.includes(settings.theme) ? settings.theme : DEFAULT_APP_SETTINGS.theme;
      const validFontSizes = ['compact', 'standard', 'large'];
      const editorFontSize = validFontSizes.includes(settings.editor_font_size as string) ? settings.editor_font_size : DEFAULT_APP_SETTINGS.editor_font_size;
      const validLineHeights = ['normal', 'relaxed', 'loose'];
      const editorLineHeight = validLineHeights.includes(settings.editor_line_height as string) ? settings.editor_line_height : DEFAULT_APP_SETTINGS.editor_line_height;
      const typewriterModeDefault = typeof settings.typewriter_mode_default === 'boolean' ? settings.typewriter_mode_default : DEFAULT_APP_SETTINGS.typewriter_mode_default;
      const staleDays = Number(settings.stale_action_days);
      const staleActionDays = Number.isFinite(staleDays) && staleDays > 0 && staleDays <= 30 ? staleDays : DEFAULT_APP_SETTINGS.stale_action_days;
      const ttlDays = Number(settings.default_share_ttl_days);
      const defaultShareTtlDays = Number.isFinite(ttlDays) && ttlDays > 0 && ttlDays <= 365 ? ttlDays : DEFAULT_APP_SETTINGS.default_share_ttl_days;
      const reviewerBranding = typeof settings.reviewer_branding === 'string' ? settings.reviewer_branding.slice(0, 100).trim() : DEFAULT_APP_SETTINGS.reviewer_branding;

      const updatedSettings: AppSettings = {
        reading_speed: speed,
        theme,
        editor_font_size: editorFontSize,
        editor_line_height: editorLineHeight,
        typewriter_mode_default: typewriterModeDefault,
        stale_action_days: staleActionDays,
        default_share_ttl_days: defaultShareTtlDays,
        reviewer_branding: reviewerBranding,
      };

      if (c.env.KV) {
        await c.env.KV.put('app_settings', JSON.stringify(updatedSettings));
      }
      return c.json(updatedSettings);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });
}
