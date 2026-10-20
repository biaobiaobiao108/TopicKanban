import type { Database } from 'bun:sqlite';
import type {
  Draft,
  DraftCitation,
  PublishPackageRecord,
  TopicReport,
} from '../../types';
import { createId } from '../apiShared';
import { command, execute, readAll, readOne } from './shared';

export type TopicReportSaveResult =
  | { kind: 'saved'; report: TopicReport }
  | { kind: 'conflict'; current: TopicReport | null };

export async function loadTopicReport(db: Database, topicId: string): Promise<TopicReport | null> {
  return readOne<TopicReport>(db, 'SELECT * FROM topic_reports WHERE topic_id = ?', [topicId]);
}

export async function saveTopicReport(
  db: Database,
  topicId: string,
  body: Partial<TopicReport> & { base_version?: number }
): Promise<TopicReportSaveResult> {
  const existing = await loadTopicReport(db, topicId);
  const baseVersion = Number(body.base_version ?? 0);
  if (existing && baseVersion !== existing.version) return { kind: 'conflict', current: existing };
  if (!existing && baseVersion !== 0) return { kind: 'conflict', current: null };

  const now = new Date().toISOString();
  const report: TopicReport = {
    id: existing?.id || body.id || createId('report'),
    topic_id: topicId,
    title: body.title || '',
    content_markdown: body.content_markdown || '',
    content_json: body.content_json || '',
    content_html: body.content_html || '',
    word_count: body.word_count || 0,
    version: existing ? existing.version + 1 : 1,
    updated_at: now,
  };
  const statement = existing
    ? command(db, `UPDATE topic_reports SET title = ?, content_markdown = ?, content_json = ?, content_html = ?, word_count = ?,
        version = version + 1, updated_at = ? WHERE topic_id = ? AND version = ?`, [
      report.title, report.content_markdown, report.content_json, report.content_html, report.word_count,
      report.updated_at, topicId, baseVersion,
    ])
    : command(db, `INSERT INTO topic_reports
        (id, topic_id, title, content_markdown, content_json, content_html, word_count, version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT(topic_id) DO NOTHING`, [
      report.id, report.topic_id, report.title, report.content_markdown, report.content_json, report.content_html,
      report.word_count, report.updated_at,
    ]);
  const result = statement.statement.run(...statement.values);
  if (result.changes === 0) {
    return { kind: 'conflict', current: await loadTopicReport(db, topicId) };
  }
  const saved = await loadTopicReport(db, topicId);
  return { kind: 'saved', report: saved || report };
}

export function topicReportStatement(db: Database, report: TopicReport) {
  return command(db, `INSERT INTO topic_reports (
    id, topic_id, title, content_markdown, content_json, content_html, word_count, version, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    report.id, report.topic_id, report.title, report.content_markdown, report.content_json, report.content_html,
    report.word_count, report.version || 1, report.updated_at,
  ]);
}

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

export async function loadDraft(db: Database, topicId: string): Promise<Draft | null> {
  return readOne<Draft>(db, 'SELECT * FROM drafts WHERE topic_id = ?', [topicId]);
}

export type DraftSaveResult =
  | { kind: 'saved'; draft: Draft }
  | { kind: 'conflict'; current: Draft | null };

export async function saveDraft(
  db: Database,
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
    content_markdown: body.content_markdown || '',
    content_json: body.content_json || '',
    content_html: body.content_html || '',
    word_count: body.word_count || 0,
    version: existing ? existing.version + 1 : 1,
    updated_at: now,
  };
  const statement = existing
    ? command(db, `UPDATE drafts SET title = ?, content_markdown = ?, content_json = ?, content_html = ?, word_count = ?,
        version = version + 1, updated_at = ? WHERE topic_id = ? AND version = ?`, [
      draft.title, draft.content_markdown, draft.content_json, draft.content_html, draft.word_count,
      draft.updated_at, topicId, baseVersion,
    ])
    : command(db, `INSERT INTO drafts
        (id, topic_id, title, content_markdown, content_json, content_html, word_count, version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT(topic_id) DO NOTHING`, [
      draft.id, draft.topic_id, draft.title, draft.content_markdown, draft.content_json, draft.content_html,
      draft.word_count, draft.updated_at,
    ]);
  const result = statement.statement.run(...statement.values);
  if (result.changes === 0) {
    return { kind: 'conflict', current: await loadDraft(db, topicId) };
  }
  return { kind: 'saved', draft };
}

export type PublishPackageSaveResult =
  | { kind: 'saved'; publishPackage: PublishPackageRecord }
  | { kind: 'conflict'; current: PublishPackageRecord | null };

export async function loadPublishPackage(db: Database, topicId: string): Promise<PublishPackageRecord | null> {
  const row = readOne<Record<string, unknown>>(db, 'SELECT * FROM publish_packages WHERE topic_id = ?', [topicId]);
  return normalizePublishPackageRecord(row);
}

export async function savePublishPackage(
  db: Database,
  topicId: string,
  body: Record<string, unknown>
): Promise<PublishPackageSaveResult> {
  const existing = readOne<Record<string, unknown>>(db, 'SELECT * FROM publish_packages WHERE topic_id = ?', [topicId]);
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
  const statement = existing
    ? command(db, `UPDATE publish_packages SET
        title_simplified = ?, title_traditional = ?, description_simplified = ?, description_traditional = ?,
        title_traditional_auto = ?, description_traditional_auto = ?, content_json = ?, version = ?, updated_at = ?
        WHERE topic_id = ? AND version = ?`, [
      ...values.slice(0, 7), nextVersion, values[7], topicId, existingVersion,
    ])
    : command(db, `INSERT INTO publish_packages (
        id, topic_id, version, title_simplified, title_traditional, description_simplified, description_traditional,
        title_traditional_auto, description_traditional_auto, content_json, updated_at
      ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(topic_id) DO NOTHING`, [
      createId('publish-package'), topicId, ...values.slice(0, 7), values[7],
    ]);
  const result = statement.statement.run(...statement.values);

  if (result.changes === 0) {
    return {
      kind: 'conflict',
      current: await loadPublishPackage(db, topicId),
    };
  }
  const saved = await loadPublishPackage(db, topicId);
  return { kind: 'saved', publishPackage: saved as PublishPackageRecord };
}

export async function loadCitations(db: Database, topicId: string): Promise<DraftCitation[]> {
  return readAll<DraftCitation>(db, 'SELECT * FROM draft_citations WHERE topic_id = ? ORDER BY created_at DESC', [topicId]);
}

export async function insertCitation(db: Database, citation: DraftCitation): Promise<void> {
  execute(db, `INSERT INTO draft_citations (
    id, topic_id, reference_type, reference_id, reference_title, reference_snapshot,
    quoted_text, verification_status, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    citation.id, citation.topic_id, citation.reference_type, citation.reference_id,
    citation.reference_title, citation.reference_snapshot, citation.quoted_text,
    citation.verification_status, citation.created_at,
  ]);
}

export async function deleteCitation(db: Database, id: string): Promise<void> {
  execute(db, 'DELETE FROM draft_citations WHERE id = ?', [id]);
}

export function draftStatement(db: Database, draft: Draft) {
  return command(db, `INSERT INTO drafts (
    id, topic_id, title, content_markdown, content_json, content_html, word_count, version, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    draft.id, draft.topic_id, draft.title, draft.content_markdown, draft.content_json, draft.content_html,
    draft.word_count, draft.version || 1, draft.updated_at,
  ]);
}

export function citationStatement(db: Database, citation: DraftCitation) {
  return command(db, `INSERT INTO draft_citations (
    id, topic_id, reference_type, reference_id, reference_title, reference_snapshot,
    quoted_text, verification_status, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    citation.id, citation.topic_id, citation.reference_type, citation.reference_id,
    citation.reference_title, citation.reference_snapshot, citation.quoted_text,
    citation.verification_status, citation.created_at,
  ]);
}

export function publishPackageStatement(db: Database, publishPackage: PublishPackageRecord) {
  return command(db, `INSERT INTO publish_packages (
    id, topic_id, version, title_simplified, title_traditional, description_simplified, description_traditional,
    title_traditional_auto, description_traditional_auto, content_json, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    publishPackage.id, publishPackage.topic_id, publishPackage.version, publishPackage.title_simplified,
    publishPackage.title_traditional, publishPackage.description_simplified, publishPackage.description_traditional,
    publishPackage.title_traditional_auto ? 1 : 0, publishPackage.description_traditional_auto ? 1 : 0,
    publishPackage.content_json, publishPackage.updated_at,
  ]);
}
