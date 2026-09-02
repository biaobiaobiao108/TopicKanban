import { describe, expect, it } from 'bun:test';
import type { ApiBindings } from '../src/server/apiShared';
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
});
