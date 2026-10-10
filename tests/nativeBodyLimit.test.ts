import { describe, expect, it } from 'bun:test';
import type { ApiBindings } from '../src/server/apiShared';
import { jsonError } from '../src/server/apiShared';
import { NativeApp, bodyLimit } from '../src/server/native';

describe('native request body limits', () => {
  it('does not eagerly consume the global body during preflight and enforces a chunked route limit', async () => {
    const app = new NativeApp({} as ApiBindings, '/api');
    let pullCount = 0;
    const encoder = new TextEncoder();
    const chunks = [encoder.encode('1234'), encoder.encode('56')];
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        const chunk = chunks.shift();
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
    });

    app.use('*', bodyLimit({
      maxSize: 1024,
      preflightOnly: true,
      onError: (context) => context.text('global limit', 413),
    }));
    app.post('/echo', bodyLimit({
      maxSize: 5,
      onError: (context) => context.text('route limit', 413),
    }), async (context) => context.text(await context.req.text()));

    const request = new Request('http://localhost/api/echo', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit);
    expect(pullCount).toBe(0);
    const response = await app.fetch(request);

    expect(response.status).toBe(413);
    expect(await response.text()).toBe('route limit');
    expect(pullCount).toBeGreaterThan(0);
  });

  it('keeps a chunked oversized body at HTTP 413 when a route catches the parse error', async () => {
    const app = new NativeApp({} as ApiBindings, '/api');
    const chunks = [new TextEncoder().encode('1234'), new TextEncoder().encode('56')];
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
    });

    app.use('*', bodyLimit({
      maxSize: 5,
      preflightOnly: true,
      onError: (context) => context.json({ error: 'Request body is too large' }, 413),
    }));
    app.post('/parse', async (context) => {
      try {
        return context.json(await context.req.json());
      } catch (error) {
        return jsonError(context, error);
      }
    });

    const response = await app.fetch(new Request('http://localhost/api/parse', {
      method: 'POST', body, duplex: 'half',
    } as RequestInit));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'Request body is too large' });
  });
});
