import { describe, expect, it } from 'bun:test';
import { NativeApp } from '../src/server/native';
import type { ApiBindings } from '../src/server/apiShared';

function createApp(): NativeApp {
  return new NativeApp({ DB: {} as ApiBindings['DB'] }, '/api');
}

describe('NativeApp middleware paths', () => {
  it('only runs scoped middleware for paths inside the scope', async () => {
    const app = createApp();
    const hits: string[] = [];
    app.use('/api/topics', async (c, next) => {
      hits.push(c.req.path);
      return next();
    });
    app.get('/topics', (c) => c.json({ ok: true }));
    app.get('/topics/:id', (c) => c.json({ id: c.req.param('id') }));
    app.get('/people', (c) => c.json({ ok: true }));

    await app.request('/api/topics');
    await app.request('/api/people');
    await app.request('/api/topics/abc');

    expect(hits).toEqual(['/api/topics', '/api/topics/abc']);
  });

  it('treats a bare handler and "*" as global middleware', async () => {
    const app = createApp();
    let bare = 0;
    let star = 0;
    app.use(async (_c, next) => { bare += 1; return next(); });
    app.use('*', async (_c, next) => { star += 1; return next(); });
    app.get('/topics', (c) => c.json({ ok: true }));

    await app.request('/api/topics');
    await app.request('/api/people');

    // /api/people matches no route, so dispatch is never reached for it.
    expect(bare).toBe(1);
    expect(star).toBe(1);
  });

  it('does not let a prefix scope leak into sibling paths', async () => {
    const app = createApp();
    let scoped = 0;
    app.use('/api/topic', async (_c, next) => { scoped += 1; return next(); });
    app.get('/topics', (c) => c.json({ ok: true }));

    await app.request('/api/topics');

    expect(scoped).toBe(0);
  });
});
