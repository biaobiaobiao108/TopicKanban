interface PresenceLease<T> {
  value: T;
  clientId: string;
  expiresAt: number;
}

export const MAX_LEASES = 1000;

const leases = new Map<string, PresenceLease<{ client_id: string; device_name: string; updated_at: string }>>();

function cleanExpired(now: number): void {
  for (const [key, lease] of leases) {
    if (lease.expiresAt <= now) leases.delete(key);
  }
}

function evictSoonestExpiring(): void {
  // Keep the map bounded when a new topic needs a slot. Existing leases are
  // renewed below without evicting another active editor.
  let victimKey: string | null = null;
  let victimExpiry = Number.POSITIVE_INFINITY;
  for (const [key, lease] of leases) {
    if (lease.expiresAt < victimExpiry) {
      victimExpiry = lease.expiresAt;
      victimKey = key;
    }
  }
  if (victimKey !== null) leases.delete(victimKey);
}

export function acquirePresenceLease(
  key: string,
  clientId: string,
  value: { client_id: string; device_name: string; updated_at: string },
  ttlSeconds: number,
): { acquired: boolean; current: typeof value | null } {
  const now = Date.now();
  cleanExpired(now);
  const existing = leases.get(key);
  if (existing && existing.clientId !== clientId) return { acquired: false, current: existing.value };
  if (!existing && leases.size >= MAX_LEASES) evictSoonestExpiring();
  leases.set(key, { value, clientId, expiresAt: now + ttlSeconds * 1000 });
  return { acquired: true, current: value };
}

export function releasePresenceLease(key: string, clientId: string): 'released' | 'missing' | 'not_owner' {
  const now = Date.now();
  cleanExpired(now);
  const existing = leases.get(key);
  if (!existing) return 'missing';
  if (existing.clientId !== clientId) return 'not_owner';
  leases.delete(key);
  return 'released';
}
