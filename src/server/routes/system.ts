import { NativeApp, bodyLimit } from '../native';
import {
  BackupImportLimitError,
  countDatabaseTables,
  exportAllData,
  getStorageStats,
  loadBootstrap,
  replaceAllData,
  vacuumDatabase,
  invalidatePublishedAnalyticsCache,
} from '../repositories';
import { validateBackupData } from '../../lib/backupValidation';
import type { ApiBindings } from '../apiShared';
import {
  MAX_BACKUP_REQUEST_BYTES,
  MAX_LOGIN_REQUEST_BYTES,
  createToken,
  jsonError,
  requireDb,
  timingSafeEqualString,
} from '../apiShared';

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

export function registerSystemRoutes(app: NativeApp): void {
  app.post('/auth/login', bodyLimit({
    maxSize: MAX_LOGIN_REQUEST_BYTES,
    onError: (c) => c.json({ success: false, message: '请求体过大' }, 413),
  }), async (c) => {
    try {
      const clientIp = c.env.CLIENT_IP || 'unknown';

      if (!checkLoginRateLimit(clientIp)) {
        return c.json({ success: false, message: '登录尝试过于频繁，请 1 分钟后再试' }, 429);
      }

      const { password } = await c.req.json<{ password?: string }>();
      const correctPassword = c.env.APP_PASSWORD;
      if (!correctPassword) {
        return c.json({ success: false, message: '访问密码尚未配置，请设置 APP_PASSWORD' }, 503);
      }
      if (!password || !timingSafeEqualString(password, correctPassword)) {
        recordFailedLogin(clientIp);
        return c.json({ success: false, message: '密码错误' }, 401);
      }
      resetFailedLogin(clientIp);
      return c.json({ success: true, token: await createToken(correctPassword) });
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.get('/health', async (c) => {
    try {
      const db = requireDb(c);
      const tablesCount = await countDatabaseTables(db);
      return c.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        runtime: 'bun',
        public_base_url: c.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, '') || '',
        database: {
          connected: true,
          tables: tablesCount,
          message: `SQLite 数据库连接正常 (已检测到 ${tablesCount} 张数据表)`,
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
      const db = requireDb(c);
      return c.json(await loadBootstrap(db, scope === 'core'
        ? { includePeople: false, includeRelationships: false, includePublished: false, includeTags: false }
        : undefined));
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/backup', async (c) => {
    try {
      const data = await exportAllData(requireDb(c));
      if (c.req.query('format') === 'download') {
        return c.body(JSON.stringify(data, null, 2), 200, {
          'Content-Type': 'application/json; charset=UTF-8',
          'Content-Disposition': 'attachment; filename="topic-kanban-backup.json"',
        });
      }
      return c.json({ data });
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
      invalidatePublishedAnalyticsCache();
      return c.json({ success: true });
    } catch (error) {
      if (error instanceof BackupImportLimitError) return jsonError(c, error, 413);
      return jsonError(c, error, 400);
    }
  });

  app.get('/system/storage', async (c) => {
    try {
      const stats = await getStorageStats(requireDb(c));
      return c.json(stats);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post('/system/storage/vacuum', async (c) => {
    try {
      const result = await vacuumDatabase(requireDb(c));
      return c.json(result);
    } catch (error) {
      return jsonError(c, error);
    }
  });

}
