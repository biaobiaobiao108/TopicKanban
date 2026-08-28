import { getConnInfo, serveStatic } from 'hono/bun';
import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './createApp';
import { initializeSqliteDatabase } from './adapters/localSqlite';
import { createLocalKVNamespace } from './adapters/localKv';
import type { ApiBindings } from './apiShared';

const isProduction = process.env.NODE_ENV === 'production';
const defaultPort = isProduction ? 3030 : 8787;
const port = Number(process.env.PORT) || defaultPort;
const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const dbFilePath = path.join(dataDir, 'kanban.db');
const schemaDir = path.resolve(process.cwd(), 'drizzle');

console.log(`[Kanban Server] Initializing SQLite database at: ${dbFilePath}`);
const { d1, sqlite } = initializeSqliteDatabase(dbFilePath, schemaDir);
const kv = createLocalKVNamespace(sqlite);

const appPassword = process.env.APP_PASSWORD || (isProduction ? '' : 'admin');
const quickDropToken = process.env.QUICK_DROP_TOKEN || '';
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');

const serverBindings: ApiBindings = {
  DB: d1,
  KV: kv,
  APP_PASSWORD: appPassword,
  QUICK_DROP_TOKEN: quickDropToken,
  PUBLIC_BASE_URL: publicBaseUrl,
  ENVIRONMENT: 'node_container',
};

// Root Hono App
const mainApp = new Hono<{ Bindings: ApiBindings }>();

// Attach environment bindings
mainApp.use('*', async (c, next) => {
  const existing = (c.env || {}) as Partial<ApiBindings>;
  const remoteAddress = getConnInfo(c).remote.address;
  c.env = {
    ...existing,
    ...serverBindings,
    CLIENT_IP: remoteAddress || 'unknown',
  };
  await next();
});

// Security headers middleware
mainApp.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (isProduction) c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  c.header('Cross-Origin-Resource-Policy', 'same-origin');
  c.header('Content-Security-Policy', "default-src 'self'; script-src 'self' https://api.bilibili.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://api.bilibili.com https://www.youtube.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
});

// Mount API routes
const apiApp = createApp();
mainApp.route('/', apiApp);

// Static file serving for SPA
const distPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  console.log(`[Kanban Server] Serving static files from: ${distPath}`);
  
  // Serve static assets with immutable cache
  mainApp.use('/assets/*', serveStatic({ root: './dist' }));
  mainApp.use('/icon.png', serveStatic({ path: './dist/icon.png' }));
  mainApp.use('/apple-touch-icon.png', serveStatic({ path: './dist/apple-touch-icon.png' }));
  mainApp.use('/favicon.ico', serveStatic({ path: './dist/favicon.ico' }));
  mainApp.use('/_headers', serveStatic({ path: './dist/_headers' }));

  // Fallback for all other non-API routes to index.html (SPA routing)
  mainApp.get('*', async (c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: 'Not found' }, 404);
    }
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, 'utf-8');
      c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      c.header('Pragma', 'no-cache');
      c.header('Expires', '0');
      return c.html(html);
    }
    return c.text('Topic Kanban Studio - Build files not found. Please run bun run build.', 404);
  });
} else {
  console.log(`[Kanban Server] dist directory not found at ${distPath}. Running in API-only mode.`);
  mainApp.get('/', (c) => c.text('Topic Kanban API Server is running. Frontend dist not built yet.'));
}

const server = Bun.serve({
  fetch: mainApp.fetch,
  port,
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`🎬 叙事类视频选题生产工作台 (Topic Kanban Studio)`);
console.log(`🚀 服务已启动: http://localhost:${server.port}`);
if (publicBaseUrl) {
  console.log(`🌐 反代公开域名: ${publicBaseUrl}`);
}
console.log(`🗄️  本地 SQLite: ${dbFilePath}`);
if (appPassword) {
  console.log(`🔑 访问密码: ${process.env.APP_PASSWORD ? '已自定义配置' : 'admin (本地开发默认密码)'}`);
} else {
  console.log(`⚠️  警告: APP_PASSWORD 未配置，登录可能受限。建议设置 APP_PASSWORD 环境变量。`);
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Graceful shutdown on SIGTERM / SIGINT
let isShuttingDown = false;
const handleShutdown = (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Kanban Server] 接收到 ${signal} 信号，正在平滑关闭服务...`);
  
  server.stop().then(() => {
    try {
      sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      sqlite.close();
      console.log('[Kanban Server] SQLite 数据已安全检查点并关闭连接。');
    } catch (err) {
      console.error('[Kanban Server] 关闭 SQLite 时出错:', err);
    }
    process.exit(0);
  });

  // Force close if graceful shutdown takes too long (5s)
  setTimeout(() => {
    console.error('[Kanban Server] 平滑关闭超时，强制退出。');
    process.exit(1);
  }, 5000).unref();
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
