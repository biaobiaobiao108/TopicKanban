import type {
  BackupData,
  BackupScriptsData,
  BackupScriptsDraft,
  BackupScriptsTopic,
  CommercialDeal,
  CommercialDealActivity,
  CommercialDealTopic,
  Draft,
  DraftCitation,
  Person,
  PersonRelationship,
  PublishedVideo,
  PublishPackageRecord,
  Source,
  Tag,
  TopicTodo,
  Topic,
  TopicReport,
} from '../../types';
import { CURRENT_BACKUP_VERSION } from '../../types';
import type { Database } from 'bun:sqlite';
import { command, executeTransaction, readAll } from './shared';
import { topicStatement } from './topics';
import { topicTodoStatement } from './todos';
import { personStatement, relationshipStatement } from './people';
import {
  commercialDealActivityStatement,
  commercialDealStatement,
  commercialDealTopicStatement,
} from './deals';

export const MAX_IMPORT_STATEMENTS = 5000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const BACKUP_RESTORE_FIXED_STATEMENTS = 19;

export interface BackupImportSummary {
  bytes: number;
  statements: number;
  topics: number;
  sources: number;
  people: number;
  drafts: number;
  citations: number;
  tags: number;
  published: number;
  publish_packages: number;
  commercial_deals: number;
  commercial_deal_topics: number;
  commercial_deal_activities: number;
  todos: number;
}
export class BackupImportLimitError extends Error {}

function sourceCommand(db: Database, source: Source) {
  return command(db, `INSERT INTO sources (
    id, topic_id, title, content, url, platform, author, published_at,
    verification_status, notes, event_date, date_precision, sort_order, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    source.id, source.topic_id, source.title, source.content || '', source.url || '', source.platform || 'bilibili',
    source.author || '', source.published_at || '', source.verification_status || 'unverified', source.notes || '',
    source.event_date ?? null, source.date_precision || 'exact', source.sort_order || 0,
    source.created_at, source.updated_at,
  ]);
}

function topicReportCommand(db: Database, report: TopicReport) {
  return command(db, `INSERT INTO topic_reports (
    id, topic_id, title, content_markdown, content_json, content_html, word_count, version, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    report.id, report.topic_id, report.title, report.content_markdown, report.content_json, report.content_html,
    report.word_count, report.version || 1, report.updated_at,
  ]);
}

function draftCommand(db: Database, draft: Draft) {
  return command(db, `INSERT INTO drafts (
    id, topic_id, title, content_markdown, content_json, content_html, word_count, version, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    draft.id, draft.topic_id, draft.title, draft.content_markdown, draft.content_json, draft.content_html,
    draft.word_count, draft.version || 1, draft.updated_at,
  ]);
}

function citationCommand(db: Database, citation: DraftCitation) {
  return command(db, `INSERT INTO draft_citations (
    id, topic_id, reference_type, reference_id, reference_title, reference_snapshot,
    quoted_text, verification_status, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    citation.id, citation.topic_id, citation.reference_type, citation.reference_id,
    citation.reference_title, citation.reference_snapshot, citation.quoted_text,
    citation.verification_status, citation.created_at,
  ]);
}

function publishPackageCommand(db: Database, publishPackage: PublishPackageRecord) {
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

export function getBackupImportSummary(data: BackupData): BackupImportSummary {
  const topicRelations = data.topics.reduce(
    (count, topic) => count + (topic.tags?.length || 0) + (topic.people?.length || 0),
    0
  );
  const reports = data.reports;
  const statements = BACKUP_RESTORE_FIXED_STATEMENTS + data.tags.length + data.people.length + data.topics.length + topicRelations
    + data.sources.length + reports.length
    + data.drafts.length + data.citations.length
    + data.relationships.length + data.published.length + data.publish_packages.length
    + data.commercial_deals.length + data.commercial_deal_topics.length
    + data.commercial_deal_activities.length + data.todos.length;

  return {
    bytes: new TextEncoder().encode(JSON.stringify(data)).byteLength,
    statements,
    topics: data.topics.length,
    sources: data.sources.length,
    people: data.people.length,
    drafts: data.drafts.length,
    citations: data.citations.length,
    tags: data.tags.length,
    published: data.published.length,
    publish_packages: data.publish_packages.length,
    commercial_deals: data.commercial_deals.length,
    commercial_deal_topics: data.commercial_deal_topics.length,
    commercial_deal_activities: data.commercial_deal_activities.length,
    todos: data.todos.length,
  };
}

export function assertBackupImportWithinLimits(data: BackupData): BackupImportSummary {
  const summary = getBackupImportSummary(data);
  if (summary.bytes > MAX_IMPORT_BYTES) {
    throw new BackupImportLimitError(`备份文件超过 ${(MAX_IMPORT_BYTES / 1024 / 1024).toFixed(0)} MB 限制`);
  }
  if (summary.statements > MAX_IMPORT_STATEMENTS) {
    throw new BackupImportLimitError(`备份包含 ${summary.statements} 条写入，超过单次原子恢复上限 ${MAX_IMPORT_STATEMENTS} 条`);
  }
  return summary;
}

export async function replaceAllData(db: Database, data: BackupData): Promise<void> {
  assertBackupImportWithinLimits(data);
  const statements = [
    command(db, 'DELETE FROM commercial_deal_activities'),
    command(db, 'DELETE FROM commercial_deal_topics'),
    command(db, 'DELETE FROM commercial_deals'),
    command(db, 'DELETE FROM topic_todos'),
    command(db, 'DELETE FROM topic_tags'), command(db, 'DELETE FROM topic_people'),
    command(db, 'DELETE FROM sources'), command(db, 'DELETE FROM topic_reports'),
    command(db, 'DELETE FROM draft_citations'), command(db, 'DELETE FROM drafts'), command(db, 'DELETE FROM person_relationships'),
    command(db, 'DELETE FROM publish_packages'), command(db, 'DELETE FROM published_videos'), command(db, 'DELETE FROM topics'),
    command(db, 'DELETE FROM people'), command(db, 'DELETE FROM tags'),
  ];

  data.tags.forEach((tag) => statements.push(command(db,
    'INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)',
    [tag.id, tag.name, tag.color ?? 'stone', data.export_at]
  )));
  data.people.forEach((person) => statements.push(personStatement(db, person)));
  const pinnedTopicId = data.topics.find((topic) => (
    topic.is_pinned === 1
    && !topic.deleted_at
    && !['published', 'icebox'].includes(topic.status)
  ))?.id;
  data.topics.forEach((topic) => statements.push(topicStatement(db, {
    ...topic,
    title: topic.title,
    is_pinned: topic.id === pinnedTopicId ? 1 : 0,
  })));
  data.topics.forEach((topic) => {
    topic.tags?.forEach((tag) => statements.push(command(db,
      'INSERT OR IGNORE INTO topic_tags (id, topic_id, tag_id) VALUES (?, ?, ?)',
      [`${topic.id}:${tag.id}`, topic.id, tag.id]
    )));
    topic.people?.forEach((person) => statements.push(command(db,
      'INSERT OR IGNORE INTO topic_people (id, topic_id, person_id, role) VALUES (?, ?, ?, ?)',
      [`${topic.id}:${person.id}`, topic.id, person.id, '']
    )));
  });
  data.todos.forEach((todo) => statements.push(topicTodoStatement(db, todo)));
  data.sources.forEach((source) => statements.push(sourceCommand(db, source)));
  data.reports.forEach((report) => statements.push(topicReportCommand(db, report)));
  data.drafts.forEach((draft) => statements.push(draftCommand(db, draft)));
  data.citations.forEach((citation) => statements.push(citationCommand(db, citation)));
  data.relationships.forEach((relationship) => statements.push(relationshipStatement(db, relationship)));
  data.published.forEach((video) => statements.push(command(db, `INSERT INTO published_videos (
    id, topic_id, title, url, bvid, published_at, views, likes, coins, favorites, comments, notes, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    video.id, video.topic_id, video.title, video.url, video.bvid, video.published_at,
    video.views, video.likes, video.coins, video.favorites, video.comments, video.notes, video.updated_at,
  ])));
  data.publish_packages.forEach((publishPackage) => statements.push(publishPackageCommand(db, publishPackage)));
  data.commercial_deals.forEach((deal) => statements.push(commercialDealStatement(db, deal)));
  data.commercial_deal_topics.forEach((relation) => statements.push(commercialDealTopicStatement(db, relation)));
  data.commercial_deal_activities.forEach((activity) => statements.push(commercialDealActivityStatement(db, activity)));
  executeTransaction(db, statements);
}

function loadTopicsForBackup(db: Database): Topic[] {
  const query = <T>(sql: string): T[] => readAll<T>(db, sql);
  const topicRows = query<Topic>(`SELECT t.*,
    (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id) AS sources_count,
    (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.verification_status = 'confirmed') AS verified_sources_count,
    (SELECT COUNT(*) FROM commercial_deal_topics cdt WHERE cdt.topic_id = t.id) AS commercial_deals_count,
    COALESCE((SELECT word_count FROM drafts d WHERE d.topic_id = t.id LIMIT 1), 0) AS draft_word_count
    FROM topics t ORDER BY t.is_pinned DESC, t.sort_order ASC, t.updated_at DESC`);
  const topicTags = query<{ topic_id: string; tag_id: string }>('SELECT topic_id, tag_id FROM topic_tags');
  const topicPeople = query<{ topic_id: string; person_id: string }>('SELECT topic_id, person_id FROM topic_people');
  const tags = query<Tag>('SELECT id, name, color FROM tags');
  const people = query<Person>('SELECT * FROM people');
  const currentTodos = query<TopicTodo>(`SELECT * FROM topic_todos
    WHERE status = 'in_progress' AND is_current = 1 ORDER BY topic_id ASC`);
  const tagMap = new Map(tags.map((tag) => [tag.id, tag]));
  const personMap = new Map(people.map((person) => [person.id, person]));
  const tagsByTopic = new Map<string, Tag[]>();
  const peopleByTopic = new Map<string, Person[]>();
  const currentTodoByTopic = new Map<string, TopicTodo>();
  topicTags.forEach(({ topic_id, tag_id }) => {
    const tag = tagMap.get(tag_id);
    if (tag) tagsByTopic.set(topic_id, [...(tagsByTopic.get(topic_id) || []), tag]);
  });
  topicPeople.forEach(({ topic_id, person_id }) => {
    const person = personMap.get(person_id);
    if (person) peopleByTopic.set(topic_id, [...(peopleByTopic.get(topic_id) || []), person]);
  });
  currentTodos.forEach((todo) => {
    if (!currentTodoByTopic.has(todo.topic_id)) currentTodoByTopic.set(todo.topic_id, todo);
  });
  return topicRows.map((topic) => ({
    ...topic,
    tags: tagsByTopic.get(topic.id) || [],
    people: peopleByTopic.get(topic.id) || [],
    current_todo: currentTodoByTopic.get(topic.id) || null,
  }));
}

export function exportScriptsData(db: Database): BackupScriptsData {
  return db.transaction(() => {
    const topics = readAll<BackupScriptsTopic>(db, `SELECT id, title, status, priority, hook, summary
      FROM topics ORDER BY is_pinned DESC, sort_order ASC, updated_at DESC`);
    const rows = readAll<Omit<BackupScriptsDraft, 'has_content_json'> & { has_content_json: number }>(db, `SELECT topic_id, title, word_count, content_markdown,
      CASE WHEN COALESCE(content_markdown, '') = '' THEN COALESCE(content_html, '') ELSE '' END AS content_html,
      CASE WHEN COALESCE(content_json, '') = '' THEN 0 ELSE 1 END AS has_content_json,
      updated_at
      FROM drafts ORDER BY updated_at DESC`);
    return {
      topics,
      drafts: rows.map((draft) => ({ ...draft, has_content_json: draft.has_content_json === 1 })),
    };
  })();
}

export async function exportAllData(db: Database): Promise<BackupData> {
  const exportAt = new Date().toISOString();
  return db.transaction(() => {
    const query = <T>(sql: string): T[] => readAll<T>(db, sql);
    const allTopics = loadTopicsForBackup(db);
    const people = query<Person>(`SELECT p.*,
      (SELECT COUNT(*) FROM topic_people tp WHERE tp.person_id = p.id) AS related_topics_count
      FROM people p ORDER BY p.updated_at DESC`);
    const relationships = query<PersonRelationship>(`SELECT r.*, a.name AS person_a_name, b.name AS person_b_name
      FROM person_relationships r
      LEFT JOIN people a ON a.id = r.person_a_id
      LEFT JOIN people b ON b.id = r.person_b_id
      ORDER BY r.created_at DESC`);
    const published = query<PublishedVideo>(`SELECT v.*, t.title AS topic_title FROM published_videos v
      LEFT JOIN topics t ON t.id = v.topic_id ORDER BY v.published_at DESC, v.updated_at DESC`);
    const tags = query<Tag>('SELECT id, name, color FROM tags ORDER BY name ASC');
    const sources = query<Source>('SELECT * FROM sources ORDER BY topic_id, sort_order ASC, created_at DESC');
    const reports = query<TopicReport>('SELECT * FROM topic_reports ORDER BY updated_at DESC');
    const drafts = query<Draft>('SELECT * FROM drafts ORDER BY updated_at DESC');
    const citations = query<DraftCitation>('SELECT * FROM draft_citations ORDER BY created_at DESC');
    const publishPackages = query<Record<string, unknown>>('SELECT * FROM publish_packages ORDER BY updated_at DESC').map((row) => ({
      ...row,
      title_traditional_auto: Number(row.title_traditional_auto) === 1,
      description_traditional_auto: Number(row.description_traditional_auto) === 1,
    })) as unknown as PublishPackageRecord[];
    const commercialDeals = query<CommercialDeal>('SELECT * FROM commercial_deals ORDER BY updated_at DESC');
    const commercialDealTopics = query<CommercialDealTopic>('SELECT * FROM commercial_deal_topics ORDER BY created_at ASC');
    const commercialDealActivities = query<CommercialDealActivity>('SELECT * FROM commercial_deal_activities ORDER BY created_at ASC');
    const todos = query<TopicTodo>(`SELECT * FROM topic_todos ORDER BY topic_id,
      CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
      sort_order, created_at`);
    return {
      version: CURRENT_BACKUP_VERSION,
      export_at: exportAt,
      topics: allTopics,
      sources,
      reports,
      people,
      relationships,
      drafts,
      citations,
      tags,
      published,
      publish_packages: publishPackages,
      commercial_deals: commercialDeals,
      commercial_deal_topics: commercialDealTopics,
      commercial_deal_activities: commercialDealActivities,
      todos,
    };
  })();
}
