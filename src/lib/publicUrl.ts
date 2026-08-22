/**
 * Reverse Proxy and Public Base URL resolution utilities
 */

export function normalizeBaseUrl(url?: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  // Strip trailing slashes
  return trimmed.replace(/\/+$/, '');
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

  const proto = (options.forwardedProto || 'http').split(',')[0].trim();
  const host = (options.forwardedHost || options.host || '').split(',')[0].trim();

  if (host) {
    return `${proto}://${host}${normalizedPath}`;
  }

  return normalizedPath;
}
