import { isTopicStatus } from '../types';
import { isSafeExternalHttpUrl } from '../lib/urlSafety';
import { isValidIsoDate } from '../lib/dateInput';
import type { AppKV } from './appKv';
import type { SqliteDatabase } from './sqlite';

export type ApiBindings = {
  DB: SqliteDatabase;
  KV: AppKV;
  APP_PASSWORD?: string;
  QUICK_DROP_TOKEN?: string;
  PUBLIC_BASE_URL?: string;
  TRUST_PROXY_HEADERS?: boolean;
  CLIENT_IP?: string;
};

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
const PRIORITIES = ['high', 'medium', 'low', 'none'] as const;
export const COMMERCIAL_DEAL_STATUSES = ['communicating', 'producing', 'delivered', 'archived'] as const;
export const COMMERCIAL_DEAL_PAYMENT_STATUSES = ['unpaid', 'paid'] as const;
export const COMMERCIAL_DEAL_DELIVERABLE_TYPES = ['custom_video', 'dynamic', 'live', 'offline_activity', 'other'] as const;
export const COMMERCIAL_DEAL_SOURCES = ['huahuo', 'brand_direct', 'agency', 'mcn', 'other'] as const;
export const COMMERCIAL_DEAL_CONTRACT_STATUSES = ['not_started', 'drafting', 'signed'] as const;
export const MAX_DRAFT_BYTES = 2 * 1024 * 1024;
export const MAX_BATCH_SIZE = 200;
export const MAX_REQUEST_BYTES = 10 * 1024 * 1024;
export const MAX_LOGIN_REQUEST_BYTES = 16 * 1024;
export const MAX_QUICK_DROP_REQUEST_BYTES = 64 * 1024;
export const MAX_BACKUP_REQUEST_BYTES = 6 * 1024 * 1024;

export const VERIFICATION_STATUSES = ['confirmed', 'unverified', 'rejected'] as const;
export const DATE_PRECISIONS = ['exact', 'year_month', 'year', 'unknown'] as const;
export const PLATFORM_TYPES = ['bilibili', 'douyin', 'kuaishou', 'weibo', 'xiaohongshu', 'wechat', 'zhihu', 'youtube', 'news', 'live', 'other'] as const;

export function isOneOf(value: unknown, options: readonly string[]): boolean {
  return typeof value === 'string' && options.includes(value);
}

export function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export type QuickDropCredentialResult = 'valid' | 'missing_config' | 'invalid';

export function verifyQuickDropCredential(
  providedToken: string | undefined,
  configuredToken: string | undefined
): QuickDropCredentialResult {
  if (!configuredToken) return 'missing_config';
  return providedToken === configuredToken ? 'valid' : 'invalid';
}

export function hasInvalidValue(
  body: Record<string, unknown>,
  field: string,
  predicate: (value: unknown) => boolean
): boolean {
  return Object.prototype.hasOwnProperty.call(body, field) && !predicate(body[field]);
}

import {
  topicCreateSchema,
  topicUpdateSchema,
  commercialDealSchema,
  parseWithZod,
} from './schemas';

export function validateTopicFields(body: Record<string, unknown>): string | null {
  const result = parseWithZod(topicUpdateSchema, body);
  return result.success ? null : result.error;
}

export function validateCommercialDealFields(body: Record<string, unknown>, requireTitle = false): string | null {
  const result = parseWithZod(commercialDealSchema(requireTitle), body);
  return result.success ? null : result.error;
}

export function validateTextFields(
  body: Record<string, unknown>,
  fields: Record<string, [maxLength: number, required?: boolean]>
): string | null {
  for (const [field, [maxLength, required]] of Object.entries(fields)) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    const value = body[field];
    if (typeof value !== 'string') return `${field} must be a string`;
    if (required && !value.trim()) return `${field} is required`;
    if (value.length > maxLength) return `${field} exceeds ${maxLength} characters`;
  }
  return null;
}

export function validateExternalUrlField(body: Record<string, unknown>, field: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(body, field)) return null;
  if (typeof body[field] !== 'string') return `${field} must be a string`;
  if (!isSafeExternalHttpUrl(body[field])) return `${field} must be an http(s) URL`;
  return null;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer as ArrayBuffer;
}

async function getSigningKey(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

export async function createToken(password: string): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  })));
  const signature = await crypto.subtle.sign('HMAC', await getSigningKey(password), new TextEncoder().encode(payload));
  return `v1.${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyToken(token: string, password: string): Promise<boolean> {
  const [version, payload, signature] = token.split('.');
  if (version !== 'v1' || !payload || !signature) return false;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { exp?: number };
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) return false;
    return crypto.subtle.verify(
      'HMAC', await getSigningKey(password), fromBase64Url(signature), new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
}

export function requireDb(c: { env: ApiBindings }): SqliteDatabase {
  if (!c.env.DB) throw new Error('SQLite database is not configured');
  return c.env.DB;
}

export function jsonError(c: any, error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return c.json({ error: message }, status);
}

export function jsonValidationError(c: any, errorMsg: string, issues?: unknown[]) {
  return c.json({
    error: errorMsg,
    ...(issues && issues.length > 0 ? { details: issues } : {}),
  }, 400);
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

export function createShareToken(): string {
  return `rv-${crypto.randomUUID()}`;
}

const ALLOWED_PATCH_TABLES = [
  'topics',
  'sources',
  'timeline_events',
  'people',
  'person_relationships',
  'tags',
  'published_videos',
] as const;

export type AllowedPatchTable = typeof ALLOWED_PATCH_TABLES[number];

export async function patchRow(
  db: SqliteDatabase,
  table: AllowedPatchTable | string,
  id: string,
  body: Record<string, unknown>,
  allowedFields: string[],
  touchUpdatedAt = true
): Promise<void> {
  if (!ALLOWED_PATCH_TABLES.includes(table as AllowedPatchTable)) {
    throw new Error(`Invalid table for patchRow: ${table}`);
  }
  const fields = allowedFields.filter((field) => Object.prototype.hasOwnProperty.call(body, field));
  if (touchUpdatedAt) {
    fields.push('updated_at');
    body.updated_at = new Date().toISOString();
  }
  if (fields.length === 0) return;
  const assignments = fields.map((field) => `${field} = ?`).join(', ');
  await db.prepare(`UPDATE ${table} SET ${assignments} WHERE id = ?`)
    .bind(...fields.map((field) => body[field]), id).run();
}
