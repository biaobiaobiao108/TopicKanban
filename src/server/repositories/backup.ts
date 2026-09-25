import type {
  AppSettings,
  BackupData,
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
  TimelineEvent,
  TopicTodo,
  Topic,
} from '../../types';
import { DEFAULT_APP_SETTINGS } from '../../types';
import type { SqliteDatabase, SqlitePreparedStatement } from '../sqlite';
import { bind } from './shared';
import { topicStatement } from './topics';
import { topicTodoStatement } from './todos';
import { personStatement, relationshipStatement } from './people';
import { sourceStatement, timelineStatement } from './workspace';
import { citationStatement, draftStatement, publishPackageStatement } from './writing';
import {
  commercialDealActivityStatement,
  commercialDealStatement,
  commercialDealTopicStatement,
} from './deals';

export const MAX_IMPORT_STATEMENTS = 5000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const BACKUP_RESTORE_FIXED_STATEMENTS = 20;

export interface BackupImportSummary {
  bytes: number;
  statements: number;
  topics: number;
  sources: number;
  timeline: number;
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

export function getBackupImportSummary(data: BackupData): BackupImportSummary {
  const topicRelations = data.topics.reduce(
    (count, topic) => count + (topic.tags?.length || 0) + (topic.people?.length || 0),
    0
  );
  const statements = BACKUP_RESTORE_FIXED_STATEMENTS + data.tags.length + data.people.length + data.topics.length + topicRelations
    + data.sources.length + data.timeline.length
    + data.timeline.reduce((count, event) => count + (event.person_ids?.length || 0), 0)
    + data.drafts.length + data.citations.length
    + data.relationships.length + data.published.length + data.publish_packages.length
    + data.commercial_deals.length + data.commercial_deal_topics.length
    + data.commercial_deal_activities.length + data.todos.length;

  return {
    bytes: new TextEncoder().encode(JSON.stringify(data)).byteLength,
    statements,
    topics: data.topics.length,
    sources: data.sources.length,
    timeline: data.timeline.length,
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

export async function replaceAllData(db: SqliteDatabase, data: BackupData): Promise<void> {
  assertBackupImportWithinLimits(data);
  const statements: SqlitePreparedStatement[] = [
    db.prepare(`CREATE TABLE IF NOT EXISTS _kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER
    )`),
    db.prepare("DELETE FROM _kv_store WHERE key LIKE 'share:%' OR key LIKE 'topic_share:%'"),
    db.prepare('DELETE FROM commercial_deal_activities'),
    db.prepare('DELETE FROM commercial_deal_topics'),
    db.prepare('DELETE FROM commercial_deals'),
    db.prepare('DELETE FROM topic_todos'),
    db.prepare('DELETE FROM topic_tags'), db.prepare('DELETE FROM topic_people'),
    db.prepare('DELETE FROM timeline_event_people'),
    db.prepare('DELETE FROM sources'), db.prepare('DELETE FROM timeline_events'),
    db.prepare('DELETE FROM draft_citations'), db.prepare('DELETE FROM drafts'), db.prepare('DELETE FROM person_relationships'),
    db.prepare('DELETE FROM publish_packages'), db.prepare('DELETE FROM published_videos'), db.prepare('DELETE FROM topics'),
    db.prepare('DELETE FROM people'), db.prepare('DELETE FROM tags'),
  ];

  data.tags.forEach((tag) => statements.push(bind(db,
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
    topic.tags?.forEach((tag) => statements.push(bind(db,
      'INSERT OR IGNORE INTO topic_tags (id, topic_id, tag_id) VALUES (?, ?, ?)',
      [`${topic.id}:${tag.id}`, topic.id, tag.id]
    )));
    topic.people?.forEach((person) => statements.push(bind(db,
      'INSERT OR IGNORE INTO topic_people (id, topic_id, person_id, role) VALUES (?, ?, ?, ?)',
      [`${topic.id}:${person.id}`, topic.id, person.id, '']
    )));
  });
  data.todos.forEach((todo) => statements.push(topicTodoStatement(db, todo)));
  data.sources.forEach((source) => statements.push(sourceStatement(db, source)));
  data.timeline.forEach((event) => {
    statements.push(timelineStatement(db, event));
    event.person_ids?.forEach((personId) => statements.push(bind(db,
      'INSERT INTO timeline_event_people (id, timeline_event_id, person_id) VALUES (?, ?, ?)',
      [`${event.id}:${personId}`, event.id, personId]
    )));
  });
  data.drafts.forEach((draft) => statements.push(draftStatement(db, draft)));
  data.citations.forEach((citation) => statements.push(citationStatement(db, citation)));
  data.relationships.forEach((relationship) => statements.push(relationshipStatement(db, relationship)));
  data.published.forEach((video) => statements.push(bind(db, `INSERT INTO published_videos (
    id, topic_id, title, url, bvid, published_at, views, likes, coins, favorites, comments, notes, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    video.id, video.topic_id, video.title, video.url, video.bvid, video.published_at,
    video.views, video.likes, video.coins, video.favorites, video.comments, video.notes, video.updated_at,
  ])));
  data.publish_packages.forEach((publishPackage) => statements.push(publishPackageStatement(db, publishPackage)));
  data.commercial_deals.forEach((deal) => statements.push(commercialDealStatement(db, deal)));
  data.commercial_deal_topics.forEach((relation) => statements.push(commercialDealTopicStatement(db, relation)));
  data.commercial_deal_activities.forEach((activity) => statements.push(commercialDealActivityStatement(db, activity)));
  statements.push(bind(db, `INSERT INTO _kv_store (key, value, expires_at) VALUES (?, ?, NULL)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`, [
    'app_settings', JSON.stringify(data.settings),
  ]));

  await db.batch(statements);
}

function loadTopicsForBackup(db: SqliteDatabase): Topic[] {
  const query = <T>(sql: string): T[] => db.sqlite.query(sql).all() as T[];
  const topicRows = query<Topic>(`SELECT t.*,
    (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id) AS sources_count,
    (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.verification_status = 'confirmed') AS verified_sources_count,
    (SELECT COUNT(*) FROM timeline_events e WHERE e.topic_id = t.id) AS timeline_count,
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

export async function exportAllData(db: SqliteDatabase, kvSettings?: AppSettings): Promise<BackupData> {
  const exportAt = new Date().toISOString();
  return db.sqlite.transaction(() => {
    const query = <T>(sql: string): T[] => db.sqlite.query(sql).all() as T[];
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
    const sources = query<Source>('SELECT * FROM sources ORDER BY created_at DESC');
    const timelineRows = query<TimelineEvent>('SELECT * FROM timeline_events ORDER BY topic_id, sort_order');
    const drafts = query<Draft>('SELECT * FROM drafts ORDER BY updated_at DESC');
    const citations = query<DraftCitation>('SELECT * FROM draft_citations ORDER BY created_at DESC');
    const personIdsByEvent = new Map<string, string[]>();
    query<{ timeline_event_id: string; person_id: string }>('SELECT timeline_event_id, person_id FROM timeline_event_people')
      .forEach((row) => personIdsByEvent.set(row.timeline_event_id, [
        ...(personIdsByEvent.get(row.timeline_event_id) || []), row.person_id,
      ]));
    const timeline = timelineRows.map((event) => ({ ...event, person_ids: personIdsByEvent.get(event.id) || [] }));
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
      version: '3.0' as const,
      export_at: exportAt,
      topics: allTopics,
      sources,
      timeline,
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
      settings: kvSettings || DEFAULT_APP_SETTINGS,
    };
  })();
}
