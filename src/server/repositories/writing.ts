import type {
  Draft,
  DraftCitation,
  PublishPackageRecord,
} from '../../types';
import { createId } from '../apiShared';
import type { SqliteDatabase, SqlitePreparedStatement } from '../sqlite';
import { bind } from './shared';

export function normalizePublishPackageRecord(row: Record<string, unknown> | null): PublishPackageRecord | null {
  if (!row) return null;
  return {
    id: String(row.id || ''),
    topic_id: String(row.topic_id || ''),
    version: Number(row.version || 1),
    title_simplified: typeof row.title_simplified === 'string' ? row.title_simplified : '',
    title_traditional: typeof row.title_traditional === 'string' ? row.title_traditional : '',
    description_simplified: typeof row.description_simplified === 'string' ? row.description_simplified : '',
    description_traditional: typeof row.description_traditional === 'string' ? row.description_traditional : '',
    title_traditional_auto: Number(row.title_traditional_auto) === 1,
    description_traditional_auto: Number(row.description_traditional_auto) === 1,
    content_json: typeof row.content_json === 'string' ? row.content_json : '{}',
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : '',
  };
}

export async function loadDraft(db: SqliteDatabase, topicId: string): Promise<Draft | null> {
  return db.prepare('SELECT * FROM drafts WHERE topic_id = ?').bind(topicId).first<Draft>();
}

export type DraftSaveResult =
  | { kind: 'saved'; draft: Draft }
  | { kind: 'conflict'; current: Draft | null };

export async function saveDraft(
  db: SqliteDatabase,
  topicId: string,
  body: Partial<Draft> & { base_version?: number }
): Promise<DraftSaveResult> {
  const existing = await loadDraft(db, topicId);
  const baseVersion = Number(body.base_version ?? 0);
  if (existing && baseVersion !== existing.version) return { kind: 'conflict', current: existing };
  if (!existing && baseVersion !== 0) return { kind: 'conflict', current: null };

  const now = new Date().toISOString();
  const draft: Draft = {
    id: existing?.id || body.id || createId('draft'),
    topic_id: topicId,
    title: body.title || '',
    content_json: body.content_json || '',
    content_html: body.content_html || '',
    word_count: body.word_count || 0,
    version: existing ? existing.version + 1 : 1,
    updated_at: now,
  };
  const result = existing
    ? await bind(db, `UPDATE drafts SET title = ?, content_json = ?, content_html = ?, word_count = ?,
        version = version + 1, updated_at = ? WHERE topic_id = ? AND version = ?`, [
      draft.title, draft.content_json, draft.content_html, draft.word_count,
      draft.updated_at, topicId, baseVersion,
    ]).run()
    : await bind(db, `INSERT INTO drafts
        (id, topic_id, title, content_json, content_html, word_count, version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT(topic_id) DO NOTHING`, [
      draft.id, draft.topic_id, draft.title, draft.content_json, draft.content_html,
      draft.word_count, draft.updated_at,
    ]).run();
  if ((result.meta.changes || 0) === 0) {
    return { kind: 'conflict', current: await loadDraft(db, topicId) };
  }
  return { kind: 'saved', draft };
}

export type PublishPackageSaveResult =
  | { kind: 'saved'; publishPackage: PublishPackageRecord }
  | { kind: 'conflict'; current: PublishPackageRecord | null };

export async function loadPublishPackage(db: SqliteDatabase, topicId: string): Promise<PublishPackageRecord | null> {
  const row = await db.prepare('SELECT * FROM publish_packages WHERE topic_id = ?')
    .bind(topicId).first<Record<string, unknown>>();
  return normalizePublishPackageRecord(row);
}

export async function savePublishPackage(
  db: SqliteDatabase,
  topicId: string,
  body: Record<string, unknown>
): Promise<PublishPackageSaveResult> {
  const existing = await db.prepare('SELECT * FROM publish_packages WHERE topic_id = ?')
    .bind(topicId).first<Record<string, unknown>>();
  const baseVersion = Number(body.base_version ?? 0);
  const existingVersion = Number(existing?.version || 0);
  if (baseVersion !== existingVersion) {
    return { kind: 'conflict', current: normalizePublishPackageRecord(existing) };
  }

  const now = new Date().toISOString();
  const contentJson = body.content_json as string;
  const nextVersion = existingVersion + 1;
  const values = [
    body.title_simplified as string,
    body.title_traditional as string,
    body.description_simplified as string,
    body.description_traditional as string,
    body.title_traditional_auto ? 1 : 0,
    body.description_traditional_auto ? 1 : 0,
    contentJson,
    now,
  ];
  const result = existing
    ? await bind(db, `UPDATE publish_packages SET
        title_simplified = ?, title_traditional = ?, description_simplified = ?, description_traditional = ?,
        title_traditional_auto = ?, description_traditional_auto = ?, content_json = ?, version = ?, updated_at = ?
        WHERE topic_id = ? AND version = ?`, [
      ...values.slice(0, 7), nextVersion, values[7], topicId, existingVersion,
    ]).run()
    : await bind(db, `INSERT INTO publish_packages (
        id, topic_id, version, title_simplified, title_traditional, description_simplified, description_traditional,
        title_traditional_auto, description_traditional_auto, content_json, updated_at
      ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(topic_id) DO NOTHING`, [
      createId('publish-package'), topicId, ...values.slice(0, 7), values[7],
    ]).run();

  if ((result.meta.changes || 0) === 0) {
    return {
      kind: 'conflict',
      current: await loadPublishPackage(db, topicId),
    };
  }
  const saved = await loadPublishPackage(db, topicId);
  return { kind: 'saved', publishPackage: saved as PublishPackageRecord };
}

export async function loadCitations(db: SqliteDatabase, topicId: string): Promise<DraftCitation[]> {
  const result = await db.prepare('SELECT * FROM draft_citations WHERE topic_id = ? ORDER BY created_at DESC')
    .bind(topicId).all<DraftCitation>();
  return result.results;
}

export async function insertCitation(db: SqliteDatabase, citation: DraftCitation): Promise<void> {
  await bind(db, `INSERT INTO draft_citations (
    id, topic_id, reference_type, reference_id, reference_title, reference_snapshot,
    quoted_text, verification_status, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    citation.id, citation.topic_id, citation.reference_type, citation.reference_id,
    citation.reference_title, citation.reference_snapshot, citation.quoted_text,
    citation.verification_status, citation.created_at,
  ]).run();
}

export async function deleteCitation(db: SqliteDatabase, id: string): Promise<void> {
  await bind(db, 'DELETE FROM draft_citations WHERE id = ?', [id]).run();
}

export function draftStatement(db: SqliteDatabase, draft: Draft): SqlitePreparedStatement {
  return bind(db, `INSERT INTO drafts (
    id, topic_id, title, content_json, content_html, word_count, version, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
    draft.id, draft.topic_id, draft.title, draft.content_json, draft.content_html,
    draft.word_count, draft.version || 1, draft.updated_at,
  ]);
}

export function citationStatement(db: SqliteDatabase, citation: DraftCitation): SqlitePreparedStatement {
  return bind(db, `INSERT INTO draft_citations (
    id, topic_id, reference_type, reference_id, reference_title, reference_snapshot,
    quoted_text, verification_status, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    citation.id, citation.topic_id, citation.reference_type, citation.reference_id,
    citation.reference_title, citation.reference_snapshot, citation.quoted_text,
    citation.verification_status, citation.created_at,
  ]);
}

export function publishPackageStatement(db: SqliteDatabase, publishPackage: PublishPackageRecord): SqlitePreparedStatement {
  return bind(db, `INSERT INTO publish_packages (
    id, topic_id, version, title_simplified, title_traditional, description_simplified, description_traditional,
    title_traditional_auto, description_traditional_auto, content_json, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    publishPackage.id, publishPackage.topic_id, publishPackage.version, publishPackage.title_simplified,
    publishPackage.title_traditional, publishPackage.description_simplified, publishPackage.description_traditional,
    publishPackage.title_traditional_auto ? 1 : 0, publishPackage.description_traditional_auto ? 1 : 0,
    publishPackage.content_json, publishPackage.updated_at,
  ]);
}
