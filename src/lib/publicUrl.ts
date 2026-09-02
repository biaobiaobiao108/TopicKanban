/**
 * Reverse Proxy and Public Base URL resolution utilities
 */

export function normalizeBaseUrl(url?: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) return '';
    if (parsed.username || parsed.password) return '';
    return trimmed.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function resolvePublicUrl(path: string, publicBaseUrl?: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = normalizeBaseUrl(publicBaseUrl);
  if (base) {
    return `${base}${normalizedPath}`;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${normalizedPath}`;
  }
  return normalizedPath;
}

export interface ServerUrlOptions {
  configuredUrl?: string;
  trustProxyHeaders?: boolean;
  forwardedProto?: string;
  forwardedHost?: string;
  host?: string;
}

export function resolveServerPublicUrl(path: string, options: ServerUrlOptions = {}): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const configured = normalizeBaseUrl(options.configuredUrl);
  if (configured) {
    return `${configured}${normalizedPath}`;
  }

  if (!options.trustProxyHeaders) return normalizedPath;

  const proto = (options.forwardedProto || 'http').split(',')[0].trim().toLowerCase();
  const host = (options.forwardedHost || options.host || '').split(',')[0].trim();

  if (host && (proto === 'http' || proto === 'https') && !/[\s/@?#\\]/.test(host)) {
    return `${proto}://${host}${normalizedPath}`;
  }

  return normalizedPath;
}
