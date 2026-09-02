import { describe, it, expect } from 'bun:test';
import { normalizeBaseUrl, resolvePublicUrl, resolveServerPublicUrl } from '../src/lib/publicUrl';

describe('Public Base URL & Reverse Proxy Resolution', () => {
  it('normalizes base URL by stripping trailing slashes and whitespace', () => {
    expect(normalizeBaseUrl(' https://kanban.example.com/ ')).toBe('https://kanban.example.com');
    expect(normalizeBaseUrl('http://192.168.1.100:3000///')).toBe('http://192.168.1.100:3000');
    expect(normalizeBaseUrl('')).toBe('');
    expect(normalizeBaseUrl(undefined)).toBe('');
  });

  it('resolves public URL using configured base URL when provided', () => {
    expect(resolvePublicUrl('/share/rv_123', 'https://kanban.mydomain.com/')).toBe('https://kanban.mydomain.com/share/rv_123');
    expect(resolvePublicUrl('api/inbox/quick-drop', 'https://kanban.mydomain.com')).toBe('https://kanban.mydomain.com/api/inbox/quick-drop');
  });

  it('resolves server public URL prioritizing configured URL over forwarded headers', () => {
    const url = resolveServerPublicUrl('/share/rv_abc', {
      configuredUrl: 'https://kanban.custom.com',
      forwardedProto: 'http',
      forwardedHost: 'localhost:3000',
    });
    expect(url).toBe('https://kanban.custom.com/share/rv_abc');
  });

  it('resolves server public URL from reverse proxy forwarded headers when configuredUrl is empty', () => {
    const url = resolveServerPublicUrl('/share/rv_abc', {
      configuredUrl: '',
      trustProxyHeaders: true,
      forwardedProto: 'https',
      forwardedHost: 'kanban.proxy.org',
    });
    expect(url).toBe('https://kanban.proxy.org/share/rv_abc');
  });

  it('handles comma-separated forwarded headers gracefully', () => {
    const url = resolveServerPublicUrl('/api/inbox/quick-drop', {
      trustProxyHeaders: true,
      forwardedProto: 'https, http',
      forwardedHost: 'kanban.proxy.org, 10.0.0.1',
    });
    expect(url).toBe('https://kanban.proxy.org/api/inbox/quick-drop');
  });

  it('ignores forwarded headers unless proxy trust is explicitly enabled', () => {
    expect(resolveServerPublicUrl('/share/rv_abc', {
      forwardedProto: 'https',
      forwardedHost: 'attacker.example.com',
    })).toBe('/share/rv_abc');
  });

  it('rejects forwarded host values that could alter the generated path', () => {
    expect(resolveServerPublicUrl('/share/rv_abc', {
      trustProxyHeaders: true,
      forwardedProto: 'https',
      forwardedHost: 'attacker.example.com?redirect=https://evil.example.com',
    })).toBe('/share/rv_abc');
  });
});
