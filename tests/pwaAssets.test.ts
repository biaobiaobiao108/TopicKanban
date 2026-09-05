import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../src/server/server';

const projectRoot = process.cwd();
let server: Awaited<ReturnType<typeof startServer>> | null = null;

function readPngDimensions(fileName: string): { width: number; height: number } {
  const data = fs.readFileSync(path.join(projectRoot, 'public', fileName));
  expect(data.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

afterEach(async () => {
  if (server) {
    await server.stop(true);
    server = null;
  }
});

describe('PWA static assets', () => {
  it('defines an installable standalone manifest and exact-size icons', () => {
    const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
    expect(indexHtml).toContain('<link rel="manifest" href="./public/manifest.webmanifest" />');

    const manifest = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'public', 'manifest.webmanifest'), 'utf8'),
    ) as {
      name?: string;
      short_name?: string;
      start_url?: string;
      scope?: string;
      display?: string;
      icons?: Array<{ src?: string; sizes?: string; type?: string }>;
    };

    expect(manifest.name).toBe('选题生产工作台');
    expect(manifest.short_name).toBe('选题工作台');
    expect(manifest.start_url).toBe('/today');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons).toEqual([
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ]);
    expect(readPngDimensions('icon-192.png')).toEqual({ width: 192, height: 192 });
    expect(readPngDimensions('icon-512.png')).toEqual({ width: 512, height: 512 });
  });

  it('serves the manifest and service worker with update-safe headers', async () => {
    server = await startServer({ development: true, port: 0 });
    const baseUrl = `http://localhost:${server.port}`;

    const manifestResponse = await fetch(`${baseUrl}/manifest.webmanifest`);
    expect(manifestResponse.status).toBe(200);
    expect(manifestResponse.headers.get('content-type')).toContain('application/manifest+json');
    expect(manifestResponse.headers.get('cache-control')).toContain('no-cache');

    const serviceWorkerResponse = await fetch(`${baseUrl}/sw.js`);
    expect(serviceWorkerResponse.status).toBe(200);
    expect(serviceWorkerResponse.headers.get('content-type')).toContain('application/javascript');
    expect(serviceWorkerResponse.headers.get('cache-control')).toContain('no-cache');
    expect(serviceWorkerResponse.headers.get('service-worker-allowed')).toBe('/');
  });

  it('keeps API responses outside the service worker cache boundary', () => {
    const serviceWorkerSource = fs.readFileSync(path.join(projectRoot, 'public', 'sw.js'), 'utf8');
    expect(serviceWorkerSource).toContain("if (isApiRequest(url)) return;");
    expect(serviceWorkerSource).toContain("url.pathname.startsWith('/api/')");
    expect(serviceWorkerSource).toContain("const CACHE_NAME = 'topic-kanban-shell-v1';");
  });

  it('injects the generated asset list into the production service worker', () => {
    const buildSource = fs.readFileSync(path.join(projectRoot, 'scripts', 'build.ts'), 'utf8');
    const serviceWorkerSource = fs.readFileSync(path.join(projectRoot, 'public', 'sw.js'), 'utf8');
    expect(buildSource).toContain('const precacheUrls = [');
    expect(buildSource).toContain('const PRECACHE_URLS = ${JSON.stringify(precacheUrls)};');
    expect(serviceWorkerSource).toContain('const PRECACHE_URLS = [];');

    const distServiceWorkerPath = path.join(projectRoot, 'dist', 'sw.js');
    if (fs.existsSync(distServiceWorkerPath)) {
      const distServiceWorkerSource = fs.readFileSync(distServiceWorkerPath, 'utf8');
      expect(distServiceWorkerSource).toContain("'/assets/");
      expect(distServiceWorkerSource).not.toContain('const PRECACHE_URLS = [];');
    }
  });
});
