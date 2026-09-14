import { afterEach, describe, expect, it } from 'bun:test';
import { startServer } from '../src/server/server';

let server: Awaited<ReturnType<typeof startServer>> | null = null;

async function readPngDimensions(fileName: string): Promise<{ width: number; height: number }> {
  const data = new Uint8Array(await Bun.file(`public/${fileName}`).arrayBuffer());
  expect(Array.from(data.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

afterEach(async () => {
  if (server) {
    await server.stop(true);
    server = null;
  }
});

describe('PWA static assets', () => {
  it('defines an installable standalone manifest and exact-size icons', async () => {
    const indexHtml = await Bun.file('index.html').text();
    expect(indexHtml).toContain('<link rel="manifest" href="./public/manifest.webmanifest" />');

    const manifest = JSON.parse(
      await Bun.file('public/manifest.webmanifest').text(),
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
    await expect(readPngDimensions('icon-192.png')).resolves.toEqual({ width: 192, height: 192 });
    await expect(readPngDimensions('icon-512.png')).resolves.toEqual({ width: 512, height: 512 });
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

  it('keeps API responses outside the service worker cache boundary', async () => {
    const serviceWorkerSource = await Bun.file('public/sw.js').text();
    expect(serviceWorkerSource).toContain("if (isApiRequest(url)) return;");
    expect(serviceWorkerSource).toContain("url.pathname.startsWith('/api/')");
    expect(serviceWorkerSource).toContain("const CACHE_NAME = 'topic-kanban-shell-v1';");
  });

  it('injects the generated asset list into the production service worker', async () => {
    const buildSource = await Bun.file('scripts/build.ts').text();
    const serviceWorkerSource = await Bun.file('public/sw.js').text();
    expect(buildSource).toContain('const precacheUrls = [');
    expect(buildSource).toContain('const PRECACHE_URLS = ${JSON.stringify(precacheUrls)};');
    expect(serviceWorkerSource).toContain('const PRECACHE_URLS = [];');

    const distServiceWorkerPath = 'dist/sw.js';
    if (await Bun.file(distServiceWorkerPath).exists()) {
      const distServiceWorkerSource = await Bun.file(distServiceWorkerPath).text();
      expect(distServiceWorkerSource).toContain("'/assets/");
      expect(distServiceWorkerSource).not.toContain('const PRECACHE_URLS = [];');
    }
  });
});
