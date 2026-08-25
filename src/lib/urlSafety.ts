const PRIVATE_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.corp', '.home', '.intranet', '.arpa'];

function isPrivateIpv4(ip: string): boolean {
  const match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true;

  const [first, second, third] = octets;
  if (first === 0 || first === 10 || first === 127) return true;
  if (first === 100 && second >= 64 && second <= 127) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 192 && second === 0 && (third === 0 || third === 2)) return true;
  if (first === 198 && second === 51 && third === 100) return true;
  if (first === 203 && second === 0 && third === 113) return true;
  return first >= 224;
}

function isPrivateIpv6(hostname: string): boolean {
  const clean = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!clean.includes(':')) return false;
  if (clean === '::' || clean === '::1' || clean.startsWith('fc') || clean.startsWith('fd') || /^fe[89ab]/.test(clean)) {
    return true;
  }

  // Covers both ::ffff:127.0.0.1 and hexadecimal IPv4-mapped forms such as ::ffff:7f00:1.
  if (clean.startsWith('::ffff:')) {
    const mapped = clean.slice('::ffff:'.length);
    if (mapped.includes('.')) return isPrivateIpv4(mapped);
    const parts = mapped.split(':');
    if (parts.length === 2 && parts.every((part) => /^[0-9a-f]{1,4}$/.test(part))) {
      const first = Number.parseInt(parts[0], 16);
      const second = Number.parseInt(parts[1], 16);
      const ipv4 = `${first >> 8}.${first & 0xff}.${second >> 8}.${second & 0xff}`;
      return isPrivateIpv4(ipv4);
    }
  }

  return false;
}

/**
 * Validate user-controlled links before persistence or rendering.
 * Empty values are valid because URL fields are optional in the domain model.
 */
export function isSafeExternalHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return true;

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (!hostname) return false;
    if (hostname === 'localhost' || PRIVATE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return false;
    if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function sanitizeExternalHttpUrl(value: unknown): string {
  return isSafeExternalHttpUrl(value) && typeof value === 'string' ? value.trim() : '';
}
