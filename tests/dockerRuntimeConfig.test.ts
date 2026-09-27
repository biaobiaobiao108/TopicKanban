import { describe, expect, it } from 'bun:test';

describe('Docker runtime configuration', () => {
  it('checks the health endpoint on the configured PORT', async () => {
    const dockerfile = await Bun.file('Dockerfile').text();

    expect(dockerfile).toContain('process.env.PORT');
    expect(dockerfile).toContain('Number(process.env.PORT) || 3030');
    expect(dockerfile).not.toContain("http://127.0.0.1:3030/api/health");
  });
});
