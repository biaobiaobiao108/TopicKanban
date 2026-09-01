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
  PublishPackageRecord,
  Source,
  TimelineEvent,
  TopicTodo,
} from '../../types';
import type { SqliteDatabase, SqlitePreparedStatement } from '../sqlite';
import { bind } from './shared';
import { loadBootstrap } from './bootstrap';
import { loadTopics, topicStatement } from './topics';
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
  const statements = 17 + data.tags.length + data.people.length + data.topics.length + topicRelations
    + data.sources.length + data.timeline.length
    + data.timeline.reduce((count, event) => count + (event.person_ids?.length || 0), 0)
    + data.drafts.length + data.citations.length
    + data.relationships.length + data.published.length + (data.publish_packages?.length || 0)
    + (data.commercial_deals?.length || 0) + (data.commercial_deal_topics?.length || 0)
    + (data.commercial_deal_activities?.length || 0) + (data.todos?.length || 0);

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
    publish_packages: data.publish_packages?.length || 0,
    commercial_deals: data.commercial_deals?.length || 0,
    commercial_deal_topics: data.commercial_deal_topics?.length || 0,
    commercial_deal_activities: data.commercial_deal_activities?.length || 0,
    todos: data.todos?.length || 0,
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
  data.topics.forEach((topic) => statements.push(topicStatement(db, { ...topic, title: topic.title })));
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
  (data.todos || []).forEach((todo) => statements.push(topicTodoStatement(db, todo)));
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
  (data.publish_packages || []).forEach((publishPackage) => statements.push(publishPackageStatement(db, publishPackage)));
  (data.commercial_deals || []).forEach((deal) => statements.push(commercialDealStatement(db, deal)));
  (data.commercial_deal_topics || []).forEach((relation) => statements.push(commercialDealTopicStatement(db, relation)));
  (data.commercial_deal_activities || []).forEach((activity) => statements.push(commercialDealActivityStatement(db, activity)));

  const BATCH_CHUNK_SIZE = 50;
  for (let i = 0; i < statements.length; i += BATCH_CHUNK_SIZE) {
    await db.batch(statements.slice(i, i + BATCH_CHUNK_SIZE));
  }
}

export async function exportAllData(db: SqliteDatabase, kvSettings?: AppSettings): Promise<BackupData> {
  const [bootstrap, allTopics, details] = await Promise.all([
    loadBootstrap(db, kvSettings),
    loadTopics(db, 'all'),
    db.batch([
      db.prepare('SELECT * FROM sources ORDER BY created_at DESC'),
      db.prepare('SELECT * FROM timeline_events ORDER BY topic_id, sort_order'),
      db.prepare('SELECT * FROM drafts ORDER BY updated_at DESC'),
      db.prepare('SELECT * FROM draft_citations ORDER BY created_at DESC'),
      db.prepare('SELECT timeline_event_id, person_id FROM timeline_event_people'),
      db.prepare('SELECT * FROM publish_packages ORDER BY updated_at DESC'),
      db.prepare('SELECT * FROM commercial_deals ORDER BY updated_at DESC'),
      db.prepare('SELECT * FROM commercial_deal_topics ORDER BY created_at ASC'),
      db.prepare('SELECT * FROM commercial_deal_activities ORDER BY created_at ASC'),
      db.prepare('SELECT * FROM topic_todos ORDER BY topic_id, sort_order, created_at'),
    ]),
  ]);
  const personIdsByEvent = new Map<string, string[]>();
  (details[4].results as unknown as Array<{ timeline_event_id: string; person_id: string }>).forEach((row) => {
    personIdsByEvent.set(row.timeline_event_id, [
      ...(personIdsByEvent.get(row.timeline_event_id) || []),
      row.person_id,
    ]);
  });
  const timeline = (details[1].results as unknown as TimelineEvent[]).map((event) => ({
    ...event,
    person_ids: personIdsByEvent.get(event.id) || [],
  }));
  const publishPackages = (details[5].results as unknown as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    title_traditional_auto: Number(row.title_traditional_auto) === 1,
    description_traditional_auto: Number(row.description_traditional_auto) === 1,
  })) as unknown as PublishPackageRecord[];
  return {
    version: '2.0',
    export_at: new Date().toISOString(),
    topics: allTopics,
    sources: details[0].results as unknown as Source[],
    timeline,
    people: bootstrap.people,
    relationships: bootstrap.relationships,
    drafts: details[2].results as unknown as Draft[],
    citations: details[3].results as unknown as DraftCitation[],
    tags: bootstrap.tags,
    published: bootstrap.published,
    publish_packages: publishPackages,
    commercial_deals: details[6].results as unknown as CommercialDeal[],
    commercial_deal_topics: details[7].results as unknown as CommercialDealTopic[],
    commercial_deal_activities: details[8].results as unknown as CommercialDealActivity[],
    todos: details[9].results as unknown as TopicTodo[],
    settings: kvSettings || bootstrap.settings,
  };
}
