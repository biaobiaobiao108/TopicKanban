import { describe, expect, it } from 'bun:test';

describe('Production security headers', () => {
  it('allow client-side YouTube metadata requests under production CSP', async () => {
    const serverSource = await Bun.file('src/server/server.ts').text();
    const pagesHeaders = await Bun.file('public/_headers').text();
    expect(serverSource).toContain("connect-src 'self' https://api.bilibili.com https://www.youtube.com");
    expect(pagesHeaders).toContain("connect-src 'self' https://api.bilibili.com https://www.youtube.com");
  });

  it('loads the editor web font stylesheet and allows its CDN resources', async () => {
    const indexHtml = await Bun.file('index.html').text();
    const serverSource = await Bun.file('src/server/server.ts').text();
    const pagesHeaders = await Bun.file('public/_headers').text();
    const fontStylesheet = 'https://cdn.jsdelivr.net/npm/@callmebill/lxgw-wenkai-web@latest/style.css';

    expect(indexHtml).toContain(`<link rel="stylesheet" href="${fontStylesheet}" />`);
    for (const source of [serverSource, pagesHeaders]) {
      expect(source).toContain('style-src');
      expect(source).toContain('font-src');
      expect(source).toContain('https://cdn.jsdelivr.net');
    }
  });

  it('does not disable browser zoom', async () => {
    const indexHtml = await Bun.file('index.html').text();
    expect(indexHtml).not.toContain('user-scalable=no');
    expect(indexHtml).not.toContain('maximum-scale=1.0');
  });

  it('includes defense-in-depth browser isolation headers', async () => {
    const serverSource = await Bun.file('src/server/server.ts').text();
    const pagesHeaders = await Bun.file('public/_headers').text();
    for (const source of [serverSource, pagesHeaders]) {
      expect(source).toContain('Strict-Transport-Security');
      expect(source).toContain('Permissions-Policy');
      expect(source).toContain('Cross-Origin-Opener-Policy');
      expect(source).toContain('Cross-Origin-Resource-Policy');
      expect(source).toContain("worker-src 'self'");
    }
  });

  it('builds the Bun server bundle with production semantics', async () => {
    const packageJson = JSON.parse(await Bun.file('package.json').text()) as {
      scripts?: { 'build:server'?: string };
    };
    expect(packageJson.scripts?.['build:server']).toContain('NODE_ENV=production');
  });
});
