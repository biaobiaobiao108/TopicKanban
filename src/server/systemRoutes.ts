import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppSettings } from '../types';
import { DEFAULT_APP_SETTINGS, DEFAULT_VOICEOVER_CUES, APP_THEMES, type AppTheme } from '../types';
import {
  BackupImportLimitError,
  exportAllData,
  loadBootstrap,
  replaceAllData,
} from './database';
import { validateBackupData } from '../lib/backupValidation';
import type { ApiBindings } from './apiShared';
import {
  MAX_BACKUP_REQUEST_BYTES,
  MAX_LOGIN_REQUEST_BYTES,
  createToken,
  jsonError,
  requireDb,
} from './apiShared';

async function getKvSettings(kv?: KVNamespace, defaultPublicBaseUrl?: string): Promise<AppSettings> {
  if (!kv) return { ...DEFAULT_APP_SETTINGS, public_base_url: defaultPublicBaseUrl || '' };
  try {
    const settings = await kv.get<AppSettings>('app_settings', 'json');
    if (settings && Number.isFinite(settings.reading_speed)) {
      const validFontSizes = ['compact', 'standard', 'large'];
      const validLineHeights = ['normal', 'relaxed', 'loose'];
      const voiceoverCues = Array.isArray(settings.voiceover_cues)
        ? settings.voiceover_cues
        : (DEFAULT_APP_SETTINGS.voiceover_cues || DEFAULT_VOICEOVER_CUES);

      return {
        reading_speed: settings.reading_speed > 0 ? settings.reading_speed : DEFAULT_APP_SETTINGS.reading_speed,
        theme: APP_THEMES.includes(settings.theme) ? settings.theme : DEFAULT_APP_SETTINGS.theme,
        editor_font_size: validFontSizes.includes(settings.editor_font_size as string) ? settings.editor_font_size : DEFAULT_APP_SETTINGS.editor_font_size,
        editor_line_height: validLineHeights.includes(settings.editor_line_height as string) ? settings.editor_line_height : DEFAULT_APP_SETTINGS.editor_line_height,
        typewriter_mode_default: typeof settings.typewriter_mode_default === 'boolean' ? settings.typewriter_mode_default : DEFAULT_APP_SETTINGS.typewriter_mode_default,
        stale_action_days: Number.isFinite(settings.stale_action_days) && (settings.stale_action_days as number) > 0 ? settings.stale_action_days : DEFAULT_APP_SETTINGS.stale_action_days,
        default_share_ttl_days: Number.isFinite(settings.default_share_ttl_days) && (settings.default_share_ttl_days as number) > 0 ? settings.default_share_ttl_days : DEFAULT_APP_SETTINGS.default_share_ttl_days,
        reviewer_branding: typeof settings.reviewer_branding === 'string' ? settings.reviewer_branding : DEFAULT_APP_SETTINGS.reviewer_branding,
        public_base_url: typeof settings.public_base_url === 'string' && settings.public_base_url.trim() ? settings.public_base_url.trim().replace(/\/+$/, '') : (defaultPublicBaseUrl || ''),
        voiceover_cues: voiceoverCues,
      };
    }
  } catch {
    // fallback to default
  }
  return { ...DEFAULT_APP_SETTINGS, public_base_url: defaultPublicBaseUrl || '' };
}

const failedLoginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_RECORDS = 10_000;

function pruneLoginAttempts(now: number): void {
  for (const [ip, record] of failedLoginAttempts) {
    if (record.resetAt <= now) failedLoginAttempts.delete(ip);
  }
  while (failedLoginAttempts.size > MAX_LOGIN_RECORDS) {
    const first = failedLoginAttempts.keys().next().value as string | undefined;
    if (!first) break;
    failedLoginAttempts.delete(first);
  }
}

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  pruneLoginAttempts(now);
  const record = failedLoginAttempts.get(ip);
  if (!record || record.resetAt <= now) {
    return true;
  }
  return record.count < 10;
}

function recordFailedLogin(ip: string): void {
  const now = Date.now();
  const record = failedLoginAttempts.get(ip);
  if (!record || record.resetAt <= now) {
    failedLoginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
  } else {
    record.count += 1;
  }
}

function resetFailedLogin(ip: string): void {
  failedLoginAttempts.delete(ip);
}

export function registerSystemRoutes(app: Hono<{ Bindings: ApiBindings }>): void {
  app.post('/auth/login', bodyLimit({
    maxSize: MAX_LOGIN_REQUEST_BYTES,
    onError: (c) => c.json({ success: false, message: '请求体过大' }, 413),
  }), async (c) => {
    try {
      const clientIp = c.env.CLIENT_IP
        || (c.env.ENVIRONMENT === 'cloudflare_pages'
          ? c.req.header('cf-connecting-ip') || 'unknown'
          : 'unknown');

      if (!checkLoginRateLimit(clientIp)) {
        return c.json({ success: false, message: '登录尝试过于频繁，请 1 分钟后再试' }, 429);
      }

      const { password } = await c.req.json<{ password?: string }>();
      const correctPassword = c.env.APP_PASSWORD;
      if (!correctPassword) {
        return c.json({ success: false, message: '云端访问密码尚未配置，请设置 APP_PASSWORD' }, 503);
      }
      if (password !== correctPassword) {
        recordFailedLogin(clientIp);
        return c.json({ success: false, message: '密码错误' }, 401);
      }
      resetFailedLogin(clientIp);
      return c.json({ success: true, token: await createToken(correctPassword) });
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

function detectEnvironment(c: { env: ApiBindings }): 'node_container' | 'cloudflare_pages' {
  if (c.env.ENVIRONMENT === 'node_container') return 'node_container';
  if (c.env.ENVIRONMENT === 'cloudflare_pages') return 'cloudflare_pages';

  // Check whether DB or KV is using local better-sqlite3 adapters
  const isLocalAdapter = Boolean((c.env.DB as unknown as { sqlite?: unknown })?.sqlite || (c.env.KV as unknown as { sqlite?: unknown })?.sqlite);
  if (isLocalAdapter) return 'node_container';

  // Check Cloudflare Workers / Pages environment indicators
  const isCloudflare = (typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers')
    || typeof WebSocketPair !== 'undefined'
    || Boolean((globalThis as unknown as { caches?: { default?: unknown } }).caches?.default);
  if (isCloudflare) return 'cloudflare_pages';

  return 'cloudflare_pages';
}

  app.get('/health', async (c) => {
    try {
      const db = requireDb(c);
      const tableCheck = await db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table'")
        .first<{ count: number }>();
      const kvSettings = await getKvSettings(c.env.KV, c.env.PUBLIC_BASE_URL);
      const environment = detectEnvironment(c);
      const tablesCount = tableCheck?.count || 0;
      return c.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        environment,
        public_base_url: kvSettings.public_base_url || c.env.PUBLIC_BASE_URL || '',
        d1: {
          connected: true,
          tables: tablesCount,
          message: environment === 'node_container'
            ? `本地 SQLite 数据库连接正常 (已检测到 ${tablesCount} 张数据表)`
            : `Cloudflare D1 (SQLite) 数据库连接正常 (已检测到 ${tablesCount} 张数据表)`,
        },
        kv: {
          connected: !!c.env.KV,
          message: c.env.KV
            ? (environment === 'node_container'
                ? '本地 SQLite KV 存储已就绪（用于全局偏好设置与轻量持久交互）'
                : 'Cloudflare KV 命名空间已绑定（用于全局偏好设置与轻量持久交互）')
            : 'KV 未绑定',
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
      const scope = c.req.query('scope');
      const [kvSettings, db] = await Promise.all([
        getKvSettings(c.env.KV, c.env.PUBLIC_BASE_URL),
        Promise.resolve(requireDb(c)),
      ]);
      return c.json(await loadBootstrap(db, kvSettings, scope === 'core'
        ? { includePeople: false, includeRelationships: false, includePublished: false, includeTags: false }
        : undefined));
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/backup', async (c) => {
    try {
      const kvSettings = await getKvSettings(c.env.KV, c.env.PUBLIC_BASE_URL);
      return c.json({ data: await exportAllData(requireDb(c), kvSettings) });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.put('/backup', bodyLimit({
    maxSize: MAX_BACKUP_REQUEST_BYTES,
    onError: (c) => c.json({ error: 'Backup request body is too large' }, 413),
  }), async (c) => {
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
    return c.json(await getKvSettings(c.env.KV, c.env.PUBLIC_BASE_URL));
  });

  app.put('/settings', async (c) => {
    try {
      const settings = await c.req.json<AppSettings>();
      const speed = Number(settings.reading_speed);
      if (!Number.isFinite(speed) || speed <= 0 || speed > 1000) {
        return c.json({ error: 'reading_speed must be between 1 and 1000' }, 400);
      }
      const theme = APP_THEMES.includes(settings.theme) ? settings.theme : DEFAULT_APP_SETTINGS.theme;
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
      const publicBaseUrl = typeof settings.public_base_url === 'string' ? settings.public_base_url.slice(0, 200).trim().replace(/\/+$/, '') : '';
      const voiceoverCues = Array.isArray(settings.voiceover_cues)
        ? settings.voiceover_cues.map((s) => String(s).slice(0, 50).trim()).filter(Boolean)
        : (DEFAULT_APP_SETTINGS.voiceover_cues || DEFAULT_VOICEOVER_CUES);

      const updatedSettings: AppSettings = {
        reading_speed: speed,
        theme,
        editor_font_size: editorFontSize,
        editor_line_height: editorLineHeight,
        typewriter_mode_default: typewriterModeDefault,
        stale_action_days: staleActionDays,
        default_share_ttl_days: defaultShareTtlDays,
        reviewer_branding: reviewerBranding,
        public_base_url: publicBaseUrl,
        voiceover_cues: voiceoverCues,
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
