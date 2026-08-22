import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './createApp';
import { initializeSqliteDatabase } from './adapters/localSqlite';
import { createLocalKVNamespace } from './adapters/localKv';
import type { ApiBindings } from './apiShared';

const port = Number(process.env.PORT) || 3000;
const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const dbFilePath = path.join(dataDir, 'kanban.db');
const schemaDir = path.resolve(process.cwd(), 'drizzle');

console.log(`[Kanban Server] Initializing SQLite database at: ${dbFilePath}`);
const { d1, sqlite } = initializeSqliteDatabase(dbFilePath, schemaDir);
const kv = createLocalKVNamespace(sqlite);

const appPassword = process.env.APP_PASSWORD || '';
const quickDropToken = process.env.QUICK_DROP_TOKEN || '';
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');

const serverBindings: ApiBindings = {
  DB: d1,
  KV: kv,
  APP_PASSWORD: appPassword,
  QUICK_DROP_TOKEN: quickDropToken,
  PUBLIC_BASE_URL: publicBaseUrl,
};

// Root Hono App
const mainApp = new Hono<{ Bindings: ApiBindings }>();

// Attach environment bindings
mainApp.use('*', async (c, next) => {
  const existing = (c.env || {}) as Partial<ApiBindings>;
  c.env = {
    ...existing,
    ...serverBindings,
  };
  await next();
});

// Mount API routes
const apiApp = createApp();
mainApp.route('/', apiApp);

// Static file serving for SPA
const distPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  console.log(`[Kanban Server] Serving static files from: ${distPath}`);
  
  // Serve static assets
  mainApp.use('/assets/*', serveStatic({ root: './dist' }));
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
      return c.html(html);
    }
    return c.text('Topic Kanban Studio - Build files not found. Please run pnpm build.', 404);
  });
} else {
  console.log(`[Kanban Server] dist directory not found at ${distPath}. Running in API-only mode.`);
  mainApp.get('/', (c) => c.text('Topic Kanban API Server is running. Frontend dist not built yet.'));
}

serve({
  fetch: mainApp.fetch,
  port,
}, (info) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🎬 叙事类视频选题生产工作台 (Topic Kanban Studio)`);
  console.log(`🚀 服务已启动: http://localhost:${info.port}`);
  if (publicBaseUrl) {
    console.log(`🌐 反代公开域名: ${publicBaseUrl}`);
  }
  console.log(`🗄️  本地 SQLite: ${dbFilePath}`);
  if (!appPassword) {
    console.log(`⚠️  警告: APP_PASSWORD 未配置，登录可能受限。建议设置 APP_PASSWORD 环境变量。`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
