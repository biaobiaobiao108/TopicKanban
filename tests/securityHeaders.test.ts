import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

describe('Production security headers', () => {
  it('allow client-side YouTube metadata requests under production CSP', () => {
    const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'src/server/server.ts'), 'utf8');
    const pagesHeaders = fs.readFileSync(path.resolve(process.cwd(), 'public/_headers'), 'utf8');
    expect(serverSource).toContain("connect-src 'self' https://api.bilibili.com https://www.youtube.com");
    expect(pagesHeaders).toContain("connect-src 'self' https://api.bilibili.com https://www.youtube.com");
  });

  it('does not disable browser zoom', () => {
    const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
    expect(indexHtml).not.toContain('user-scalable=no');
    expect(indexHtml).not.toContain('maximum-scale=1.0');
  });

  it('includes defense-in-depth browser isolation headers', () => {
    const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'src/server/server.ts'), 'utf8');
    const pagesHeaders = fs.readFileSync(path.resolve(process.cwd(), 'public/_headers'), 'utf8');
    for (const source of [serverSource, pagesHeaders]) {
      expect(source).toContain('Strict-Transport-Security');
      expect(source).toContain('Permissions-Policy');
      expect(source).toContain('Cross-Origin-Opener-Policy');
      expect(source).toContain('Cross-Origin-Resource-Policy');
      expect(source).toContain("worker-src 'self'");
    }
  });

  it('builds the Bun server bundle with production semantics', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as {
      scripts?: { 'build:server'?: string };
    };
    expect(packageJson.scripts?.['build:server']).toContain('NODE_ENV=production');
  });
});
