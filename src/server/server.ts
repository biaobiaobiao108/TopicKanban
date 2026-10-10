import { createApp } from './app';
import { isPathInside, joinPath, resolvePath } from './bunPaths';
import { initializeSqliteDatabase } from './sqlite';
import type { ApiBindings } from './apiShared';

export interface ServerOptions {
  development?: boolean;
  frontendRoutes?: Record<string, unknown>;
  port?: number;
  databasePath?: string;
}

const DEFAULT_STATIC_FILES = [
  'icon.png',
  'apple-touch-icon.png',
  'favicon.ico',
  '_headers',
  'manifest.webmanifest',
  'sw.js',
  'icon-192.png',
  'icon-512.png',
];

const BLOCKED_STATIC_FILE_NAMES = new Set([
  'agents.md',
  'bun.lock',
  'bun.lockb',
  'compose.yml',
  'credentials.json',
  'docker-compose.yml',
  'dockerfile',
  'id_ed25519',
  'id_rsa',
  'npm-shrinkwrap.json',
  'package-lock.json',
  'package.json',
  'pnpm-lock.yaml',
  'readme.md',
  'secrets.json',
  'tsconfig.json',
  'yarn.lock',
]);

const BLOCKED_STATIC_FILE_SUFFIX = /(?:\.map(?:\.[a-z0-9_-]+)?|\.pem|\.key|\.crt|\.cer|\.p12|\.pfx|\.der|\.jks|\.env(?:\.[^/]*)?|\.db(?:-(?:wal|shm|journal))?|\.sqlite\d?(?:-(?:wal|shm|journal))?|\.sql|\.log|\.bak|\.backup|\.old|\.orig|\.swp|\.tmp)$/i;

function isSafeStaticFilePath(relativePath: string): boolean {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  if (!normalizedPath || normalizedPath.startsWith('/') || /^[a-z]:\//i.test(normalizedPath)) return false;

  const segments = normalizedPath.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) return false;

  const fileName = segments[segments.length - 1]?.toLowerCase();
  if (!fileName) return false;
  return !BLOCKED_STATIC_FILE_NAMES.has(fileName)
    && !BLOCKED_STATIC_FILE_SUFFIX.test(fileName);
}

export function resolveServerPort(configuredPort?: string, explicitPort?: number): number {
  return explicitPort ?? (Number(configuredPort) || 3030);
}

export async function discoverStaticFiles(staticRoot: string): Promise<Set<string>> {
  const staticFiles = new Set(DEFAULT_STATIC_FILES);
  try {
    for await (const file of new Bun.Glob('*').scan({ cwd: staticRoot, onlyFiles: true, dot: true })) {
      if (file !== 'index.html' && file !== 'server.js' && file !== 'assets' && isSafeStaticFilePath(file)) {
        staticFiles.add(file);
      }
    }
  } catch {
    // The runner image may only contain dist/, so retain known static routes when a directory is absent.
  }
  return staticFiles;
}

export async function startServer(options: ServerOptions = {}) {
  process.title = 'topickanban';

  const distPath = resolvePath(process.cwd(), 'dist');
  const hasDist = await Bun.file(joinPath(distPath, 'index.html')).exists();

  const isDevelopment = options.development !== undefined
    ? options.development
    : (Bun.env.NODE_ENV === 'development' ? true : (Bun.env.NODE_ENV === 'production' ? false : !hasDist));
  const isProduction = !isDevelopment;
  const port = resolveServerPort(Bun.env.PORT, options.port);
  const dataDir = Bun.env.DATA_DIR || resolvePath(process.cwd(), 'data');
  const dbFilePath = options.databasePath || joinPath(dataDir, 'kanban.db');
  const schemaDir = resolvePath(process.cwd(), 'drizzle');

  console.log(`[Kanban Server] Initializing SQLite database at: ${dbFilePath}`);
  const { db, sqlite } = await initializeSqliteDatabase(dbFilePath, schemaDir);

  const appPassword = Bun.env.APP_PASSWORD || (isProduction ? '' : 'admin');
  const quickDropToken = Bun.env.QUICK_DROP_TOKEN || '';
  const publicBaseUrl = (Bun.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  const trustProxyHeaders = /^(1|true|yes|on)$/i.test(Bun.env.TRUST_PROXY_HEADERS || '');

  const bindings: ApiBindings = {
    DB: db,
    APP_PASSWORD: appPassword,
    QUICK_DROP_TOKEN: quickDropToken,
    PUBLIC_BASE_URL: publicBaseUrl,
    TRUST_PROXY_HEADERS: trustProxyHeaders,
  };

  const apiApp = createApp(bindings);

  function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (isProduction) headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' https://api.bilibili.com; worker-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' https://api.bilibili.com https://www.youtube.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  }

  async function serveFile(filePath: string, extraHeaders?: HeadersInit): Promise<Response> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return new Response('Not Found', { status: 404 });
  const response = new Response(file);
  const headers = new Headers(response.headers);
  if (extraHeaders) {
    for (const [name, value] of new Headers(extraHeaders)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  }

  function safeAssetPath(relativePath: string): string | null {
    if (!isSafeStaticFilePath(relativePath)) return null;
    const root = resolvePath(distPath, 'assets');
    const candidate = resolvePath(root, relativePath);
    return isPathInside(root, candidate) ? candidate : null;
  }

  function assetPathFromRequest(request: Request): string | null {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith('/assets/')) return null;
  try {
    return decodeURIComponent(pathname.slice('/assets/'.length));
  } catch {
    return null;
  }
  }

  const frontendRoutes: Record<string, unknown> = { ...(options.frontendRoutes ?? {}) };
  if (isProduction && hasDist) {
    console.log(`[Kanban Server] Serving static files from: ${distPath}`);
    frontendRoutes['/assets/*'] = {
      GET: async (request: Request) => {
        const relativePath = assetPathFromRequest(request);
        const assetPath = relativePath === null ? null : safeAssetPath(relativePath);
        if (!assetPath) return withSecurityHeaders(new Response('Forbidden', { status: 403 }));
        return withSecurityHeaders(await serveFile(assetPath, {
          'Cache-Control': 'public, max-age=31536000, immutable',
        }));
      },
    };
  }

  const publicDir = resolvePath(process.cwd(), 'public');
  const staticRoot = isProduction && hasDist ? distPath : publicDir;
  const staticFiles = await discoverStaticFiles(staticRoot);

  for (const fileName of staticFiles) {
    const staticHeaders: HeadersInit = fileName === 'manifest.webmanifest'
      ? {
          'Content-Type': 'application/manifest+json; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
      : fileName === 'sw.js'
        ? {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Service-Worker-Allowed': '/',
          }
        : {};
    frontendRoutes[`/${fileName}`] = {
      GET: () => serveFile(joinPath(staticRoot, fileName), staticHeaders).then(withSecurityHeaders),
    };
  }

  const server = Bun.serve({
    development: isDevelopment ? { hmr: true } : false,
    routes: {
      ...apiApp.toBunRoutes(withSecurityHeaders),
      ...frontendRoutes,
    } as any,
    fetch: async (request, server) => {
      const requestPath = new URL(request.url).pathname;
      if (requestPath.startsWith('/api/')) {
        return withSecurityHeaders(await apiApp.fetch(request, server.requestIP(request)?.address));
      }
      if (isDevelopment) {
        return withSecurityHeaders(new Response('Not Found', { status: 404 }));
      }
      if (!hasDist) {
        return withSecurityHeaders(new Response('喵爪看板 API Server is running. Frontend dist not built yet.'));
      }
      return withSecurityHeaders(await serveFile(joinPath(distPath, 'index.html'), {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      }));
    },
    port,
  });

  let databaseClosed = false;
  const closeDatabase = () => {
    if (databaseClosed) return;
    sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    sqlite.close();
    databaseClosed = true;
  };
  const runningServer = Object.assign(server, { closeDatabase });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🐾 喵爪看板 (MiaoZhua Kanban)`);
  console.log(`🚀 服务已启动: http://localhost:${server.port}`);
  if (publicBaseUrl) console.log(`🌐 反代公开域名: ${publicBaseUrl}`);
  console.log(`🗄️  本地 SQLite: ${dbFilePath}`);
  if (appPassword) {
    console.log(`🔑 访问密码: ${Bun.env.APP_PASSWORD ? '已自定义配置' : 'admin (本地开发默认密码)'}`);
  } else {
    console.log(`⚠️  警告: APP_PASSWORD 未配置，登录可能受限。建议设置 APP_PASSWORD 环境变量。`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  let isShuttingDown = false;
  const handleShutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[Kanban Server] 接收到 ${signal} 信号，正在平滑关闭服务...`);

    server.stop().then(() => {
      try {
        closeDatabase();
        console.log('[Kanban Server] SQLite 数据已安全检查点并关闭连接。');
      } catch (error) {
        console.error('[Kanban Server] 关闭 SQLite 时出错:', error);
      }
      process.exit(0);
    });

    setTimeout(() => {
      console.error('[Kanban Server] 平滑关闭超时，强制退出。');
      process.exit(1);
    }, 5000).unref();
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  return runningServer;
}

if (import.meta.main) await startServer();
