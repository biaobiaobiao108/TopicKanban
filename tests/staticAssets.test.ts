import { describe, it, expect, afterAll } from 'bun:test';
import { startServer } from '../src/server/server';

describe('Static Assets Route Serving', () => {
  let server: Awaited<ReturnType<typeof startServer>> | null = null;

  afterAll(async () => {
    if (server) {
      await server.stop(true);
      server = null;
    }
  });

  it('serves /icon.png with image/png in development mode even with wildcard fallback', async () => {
    server = await startServer({
      development: true,
      port: 0,
      frontendRoutes: {
        '/': new Response('home html', { headers: { 'Content-Type': 'text/html' } }),
        '/*': new Response('home html', { headers: { 'Content-Type': 'text/html' } }),
      },
    });

    const baseUrl = `http://localhost:${server.port}`;

    // 1. /icon.png should be served as PNG, NOT intercepted by /*
    const iconRes = await fetch(`${baseUrl}/icon.png`);
    expect(iconRes.status).toBe(200);
    expect(iconRes.headers.get('content-type')).toContain('image/png');
    const iconBuffer = await iconRes.arrayBuffer();
    expect(iconBuffer.byteLength).toBeGreaterThan(1000);

    // 2. /favicon.ico should be served as image/x-icon
    const faviconRes = await fetch(`${baseUrl}/favicon.ico`);
    expect(faviconRes.status).toBe(200);
    expect(faviconRes.headers.get('content-type')).toContain('image/x-icon');
    const faviconBuffer = await faviconRes.arrayBuffer();
    expect(faviconBuffer.byteLength).toBeGreaterThan(1000);

    // 3. Unknown non-asset path should still hit the SPA wildcard fallback
    const spaRes = await fetch(`${baseUrl}/workspace`);
    expect(spaRes.status).toBe(200);
    expect(spaRes.headers.get('content-type')).toContain('text/html');
    expect(await spaRes.text()).toBe('home html');
  });
});
