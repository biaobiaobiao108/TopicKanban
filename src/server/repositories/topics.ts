import {
  STALE_ACTION_THRESHOLD_DAYS,
  TRASH_RETENTION_DAYS,
  type PaginatedTopics,
  type Person,
  type Tag,
  type TodayActionProgress,
  type TodayFocusData,
  type Topic,
  type TopicPinMutationResult,
  type TopicStatus,
  type TopicTodo,
} from '../../types';
import type { Database } from 'bun:sqlite';
import { command, executeTransaction, readAll, readOne, readTransaction, type SqlCommand } from './shared';

const MAX_TOPIC_BATCH_QUERY_IDS = 500;
type TopicCoreInput = Partial<Omit<Topic, 'current_todo' | 'tags' | 'people'>> & {
  id: string;
  title: string;
};
type TopicRelationInput = { id: string };
type TopicUpdateInput = Partial<Omit<Topic, 'current_todo' | 'tags' | 'people'>> & {
  tags?: TopicRelationInput[];
  people?: TopicRelationInput[];
};

function appendToRelationMap<T>(map: Map<string, T[]>, key: string, value: T): void {
  const values = map.get(key);
  if (values) {
    values.push(value);
  } else {
    map.set(key, [value]);
  }
}

function buildFtsSearchQuery(value: string): string {
  return `"${value.trim().replace(/"/g, '""')}"`;
}

export async function loadTopics(db: Database, scope: 'active' | 'trash' | 'all' = 'active'): Promise<Topic[]> {
  const topicFilter =
    scope === 'active' ? 'WHERE t.deleted_at IS NULL' : scope === 'trash' ? 'WHERE t.deleted_at IS NOT NULL' : '';
  const results = readTransaction(db, [
    command(
      db,
      `SELECT t.*,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id) AS sources_count,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.verification_status = 'confirmed') AS verified_sources_count,
      (SELECT COUNT(*) FROM commercial_deal_topics cdt WHERE cdt.topic_id = t.id) AS commercial_deals_count,
      COALESCE((SELECT word_count FROM drafts d WHERE d.topic_id = t.id LIMIT 1), 0) AS draft_word_count
      FROM topics t ${topicFilter}
      ORDER BY t.is_pinned DESC, t.sort_order ASC, t.updated_at DESC`,
    ),
    command(
      db,
      `SELECT tt.topic_id, tg.*
      FROM topic_tags tt
      INNER JOIN tags tg ON tg.id = tt.tag_id
      INNER JOIN topics t ON t.id = tt.topic_id
      ${topicFilter}`,
    ),
    command(
      db,
      `SELECT tp.topic_id, p.*
      FROM topic_people tp
      INNER JOIN people p ON p.id = tp.person_id
      INNER JOIN topics t ON t.id = tp.topic_id
      ${topicFilter}`,
    ),
    command(
      db,
      `SELECT * FROM topic_todos
      WHERE status = 'in_progress' AND is_current = 1
        AND topic_id IN (SELECT t.id FROM topics t ${topicFilter})
      ORDER BY topic_id ASC`,
    ),
  ]);

  const topicRows = results[0] as Topic[];
  const topicTags = results[1] as Array<Tag & { topic_id: string }>;
  const topicPeople = results[2] as Array<Person & { topic_id: string }>;
  const currentTodos = results[3] as TopicTodo[];
  const currentTodoByTopic = new Map<string, TopicTodo>();
  currentTodos.forEach(todo => {
    if (!currentTodoByTopic.has(todo.topic_id)) currentTodoByTopic.set(todo.topic_id, todo);
  });
  const tagsByTopic = new Map<string, Tag[]>();
  const peopleByTopic = new Map<string, Person[]>();

  topicTags.forEach(({ topic_id, ...tag }) => {
    appendToRelationMap(tagsByTopic, topic_id, tag);
  });
  topicPeople.forEach(({ topic_id, ...person }) => {
    appendToRelationMap(peopleByTopic, topic_id, person);
  });

  return topicRows.map(topic => ({
    ...topic,
    tags: tagsByTopic.get(topic.id) || [],
    people: peopleByTopic.get(topic.id) || [],
    current_todo: currentTodoByTopic.get(topic.id) || null,
  }));
}

export async function loadTrashedTopics(db: Database): Promise<Topic[]> {
  return loadTopics(db, 'trash');
}

export async function loadTodayFocus(db: Database): Promise<TodayFocusData> {
  const activeCondition = "t.deleted_at IS NULL AND t.status NOT IN ('published', 'icebox')";
  const safeStaleDays = STALE_ACTION_THRESHOLD_DAYS;
  const currentTodoJoin =
    "LEFT JOIN topic_todos tt ON tt.topic_id = t.id AND tt.status = 'in_progress' AND tt.is_current = 1";
  const staleExpression = "julianday('now') - julianday(COALESCE(tt.current_started_at, t.updated_at))";
  const [focusResult, priorityResult, recentResult, progressResult, attentionResult] = readTransaction(db, [
    command(
      db,
      `SELECT t.id FROM topics t WHERE ${activeCondition}
      ORDER BY t.is_pinned DESC,
        CASE WHEN t.status IN ('scripting', 'production') THEN 1 ELSE 0 END DESC,
        CASE t.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC,
        t.updated_at DESC, t.id DESC LIMIT 1`,
    ),
    command(
      db,
      `SELECT t.id FROM topics t WHERE ${activeCondition}
      ORDER BY t.is_pinned DESC,
        CASE t.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC,
        t.updated_at DESC, t.id DESC LIMIT 5`,
    ),
    command(db, `SELECT t.id FROM topics t WHERE t.deleted_at IS NULL ORDER BY t.updated_at DESC, t.id DESC LIMIT 8`),
    command(
      db,
      `SELECT
        COUNT(*) AS active_count,
        COALESCE(SUM(CASE WHEN tt.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS covered_count,
        COALESCE(SUM(CASE WHEN tt.id IS NULL THEN 1 ELSE 0 END), 0) AS missing_action_count,
        COALESCE(SUM(CASE WHEN tt.id IS NOT NULL AND ${staleExpression} >= ? THEN 1 ELSE 0 END), 0) AS stale_action_count
      FROM topics t ${currentTodoJoin} WHERE ${activeCondition}`,
      [safeStaleDays],
    ),
    command(
      db,
      `SELECT t.id FROM topics t ${currentTodoJoin}
      WHERE ${activeCondition}
        AND (tt.id IS NULL OR ${staleExpression} >= ?)
        ORDER BY CASE WHEN tt.id IS NULL THEN 0 ELSE 1 END, t.updated_at DESC, t.id DESC LIMIT 3`,
      [safeStaleDays],
    ),
  ]);
  const orderedIds = Array.from(
    new Set([
      ...(focusResult as Array<{ id: string }>).map(row => row.id),
      ...(priorityResult as Array<{ id: string }>).map(row => row.id),
      ...(recentResult as Array<{ id: string }>).map(row => row.id),
    ]),
  );
  const attentionIds = (attentionResult as Array<{ id: string }>).map(row => row.id);
  const loadedTopics = await loadTopicBatch(db, Array.from(new Set([...orderedIds, ...attentionIds])));
  const topicsById = new Map(loadedTopics.map(topic => [topic.id, topic]));
  const progressRow = ((progressResult as Array<Partial<TodayActionProgress>>)[0] ||
    {}) as Partial<TodayActionProgress>;
  const actionProgress: TodayActionProgress = {
    active_count: Number(progressRow.active_count || 0),
    covered_count: Number(progressRow.covered_count || 0),
    missing_action_count: Number(progressRow.missing_action_count || 0),
    stale_action_count: Number(progressRow.stale_action_count || 0),
  };
  return {
    topics: orderedIds.map(id => topicsById.get(id)).filter((topic): topic is Topic => Boolean(topic)),
    attention_topics: attentionIds.map(id => topicsById.get(id)).filter((topic): topic is Topic => Boolean(topic)),
    action_progress: actionProgress,
    total_active: actionProgress.active_count,
  };
}

export async function loadActiveTopicCount(db: Database): Promise<number> {
  const result = readOne<{ count?: number }>(
    db,
    "SELECT COUNT(*) AS count FROM topics t WHERE t.deleted_at IS NULL AND t.status NOT IN ('published', 'icebox')",
  );
  return Number(result?.count || 0);
}

export interface IntegrationTopicSummary {
  id: string;
  title: string;
  status: TopicStatus;
  priority: Topic['priority'];
  updated_at: string;
}

export async function loadLatestActiveTopicSummaries(db: Database, limit: number): Promise<IntegrationTopicSummary[]> {
  return readAll<IntegrationTopicSummary>(
    db,
    `SELECT id, title, status, priority, updated_at
    FROM topics
    WHERE deleted_at IS NULL AND status NOT IN ('published', 'icebox')
    ORDER BY updated_at DESC, id ASC
    LIMIT ?`,
    [limit],
  );
}
export class TopicNotInTrashError extends Error {}
export class TopicPinInvalidStateError extends Error {}
export class TopicReorderInvalidStateError extends Error {}
export class TopicAlreadyExistsError extends Error {}

export async function ensureTopicsInTrash(db: Database, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(', ');
  const result = readAll<{ id: string }>(
    db,
    `SELECT id FROM topics WHERE deleted_at IS NOT NULL AND id IN (${placeholders})`,
    ids,
  );
  if (result.length !== ids.length) {
    throw new TopicNotInTrashError('All topics must be in trash before permanent deletion');
  }
}

export async function setTopicPinned(db: Database, id: string, isPinned: 0 | 1): Promise<TopicPinMutationResult> {
  const clearedTopicIds = db
    .transaction(() => {
      const existing = db.query('SELECT status, deleted_at FROM topics WHERE id = ?').get(id) as
        { status: TopicStatus; deleted_at?: string | null } | undefined;
      if (!existing) throw new TopicPinInvalidStateError('Topic not found');
      const isActive = !existing.deleted_at && !['published', 'icebox'].includes(existing.status);
      if (isPinned === 1 && !isActive) throw new TopicPinInvalidStateError('Only active topics can be pinned');

      const cleared =
        isPinned === 1
          ? (db
              .query(
                `SELECT id FROM topics
        WHERE id != ? AND deleted_at IS NULL AND status NOT IN ('published', 'icebox') AND is_pinned = 1`,
              )
              .all(id) as Array<{ id: string }>)
          : [];
      const now = new Date().toISOString();
      if (isPinned === 1) {
        db.query(
          `UPDATE topics SET is_pinned = 0
        WHERE id != ? AND deleted_at IS NULL AND status NOT IN ('published', 'icebox') AND is_pinned = 1`,
        ).run(id);
      }
      const updated = db
        .query(
          `UPDATE topics SET is_pinned = ?, updated_at = ?
      WHERE id = ? AND (? = 0 OR (deleted_at IS NULL AND status NOT IN ('published', 'icebox')))`,
        )
        .run(isPinned, now, id, isPinned);
      if (updated.changes === 0) throw new TopicPinInvalidStateError('Only active topics can be pinned');
      return cleared.map(row => row.id);
    })
    .immediate();
  const topic = await loadTopic(db, id);
  if (!topic) throw new TopicPinInvalidStateError('Topic not found');
  return { topic, cleared_topic_ids: clearedTopicIds };
}

function permanentDeleteStatements(db: Database, id: string) {
  const trashedTopic = 'SELECT id FROM topics WHERE id = ? AND deleted_at IS NOT NULL';
  return [
    command(db, `DELETE FROM draft_citations WHERE topic_id IN (${trashedTopic})`, [id]),
    command(db, `DELETE FROM drafts WHERE topic_id IN (${trashedTopic})`, [id]),
    command(db, `DELETE FROM topic_reports WHERE topic_id IN (${trashedTopic})`, [id]),
    command(db, `DELETE FROM sources WHERE topic_id IN (${trashedTopic})`, [id]),
    command(db, `DELETE FROM topic_tags WHERE topic_id IN (${trashedTopic})`, [id]),
    command(db, `DELETE FROM topic_people WHERE topic_id IN (${trashedTopic})`, [id]),
    command(db, `DELETE FROM commercial_deal_topics WHERE topic_id IN (${trashedTopic})`, [id]),
    command(db, `DELETE FROM published_videos WHERE topic_id IN (${trashedTopic})`, [id]),
    command(db, `DELETE FROM topic_todos WHERE topic_id IN (${trashedTopic})`, [id]),
    command(db, 'DELETE FROM topics WHERE id = ? AND deleted_at IS NOT NULL', [id]),
  ];
}

export async function permanentlyDeleteTrashedTopics(db: Database, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await ensureTopicsInTrash(db, ids);

  executeTransaction(
    db,
    ids.flatMap(id => permanentDeleteStatements(db, id)),
  );
}
export interface TopicPageOptions {
  scope: 'active' | 'archived' | 'trash' | 'all';
  page: number;
  pageSize: number;
  query?: string;
  status?: string;
  priority?: string;
  tagId?: string;
  personId?: string;
  sort?: 'title' | 'status' | 'priority' | 'score' | 'words' | 'updated_at' | 'created_at' | 'sort_order';
  direction?: 'asc' | 'desc';
  availableForPublished?: boolean;
  publishedVideoId?: string;
  includeMetadata?: boolean;
}

function buildTopicFilterConditions(options: TopicPageOptions): { conditions: string[]; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (options.status) {
    const statuses = options.status
      .split(',')
      .map(status => status.trim())
      .filter(Boolean);
    if (statuses.length === 1) {
      conditions.push('t.status = ?');
      values.push(statuses[0]);
    } else if (statuses.length > 1) {
      conditions.push(`t.status IN (${statuses.map(() => '?').join(',')})`);
      values.push(...statuses);
    }
  }
  if (options.priority) {
    conditions.push('t.priority = ?');
    values.push(options.priority);
  }
  if (options.tagId) {
    conditions.push('EXISTS (SELECT 1 FROM topic_tags ft WHERE ft.topic_id = t.id AND ft.tag_id = ?)');
    values.push(options.tagId);
  }
  if (options.personId) {
    conditions.push('EXISTS (SELECT 1 FROM topic_people fp WHERE fp.topic_id = t.id AND fp.person_id = ?)');
    values.push(options.personId);
  }
  if (options.availableForPublished) {
    if (options.publishedVideoId) {
      conditions.push('NOT EXISTS (SELECT 1 FROM published_videos fpv WHERE fpv.topic_id = t.id AND fpv.id != ?)');
      values.push(options.publishedVideoId);
    } else {
      conditions.push('NOT EXISTS (SELECT 1 FROM published_videos fpv WHERE fpv.topic_id = t.id)');
    }
  }
  if (options.query?.trim()) {
    const query = options.query.trim();
    const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    const relatedSearch = `EXISTS (SELECT 1 FROM topic_todos stt WHERE stt.topic_id = t.id
        AND stt.title LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM topic_tags st INNER JOIN tags sg ON sg.id = st.tag_id WHERE st.topic_id = t.id AND sg.name LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM topic_people sp INNER JOIN people spp ON spp.id = sp.person_id WHERE sp.topic_id = t.id
        AND (spp.name LIKE ? ESCAPE '\\' OR spp.aliases LIKE ? ESCAPE '\\' OR spp.identity LIKE ? ESCAPE '\\'))`;
    if (query.length >= 3) {
      conditions.push(`(t.id IN (SELECT ts.topic_id FROM topic_search ts WHERE topic_search MATCH ?)
        OR ${relatedSearch})`);
      values.push(buildFtsSearchQuery(query), pattern, pattern, pattern, pattern, pattern);
    } else {
      // The trigram tokenizer needs at least three characters, so 1-2 character
      // CJK queries (the most common kind) fall back to LIKE across five text
      // columns. Measured at ~77ms for 3000 topics with 3k-character storylines
      // on this schema, which is fine for a single-user board; a second index
      // just for short CJK prefixes would cost more than it saves.
      conditions.push(`(t.title LIKE ? ESCAPE '\\' OR t.summary LIKE ? ESCAPE '\\' OR t.hook LIKE ? ESCAPE '\\'
        OR t.storyline LIKE ? ESCAPE '\\' OR t.why_now LIKE ? ESCAPE '\\'
        OR ${relatedSearch})`);
      values.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
    }
  }
  return { conditions, values };
}

function getTopicScopeCondition(scope: TopicPageOptions['scope']): string {
  if (scope === 'trash') return 't.deleted_at IS NOT NULL';
  if (scope === 'active') return "t.deleted_at IS NULL AND t.status NOT IN ('published', 'icebox')";
  if (scope === 'archived') return "t.deleted_at IS NULL AND t.status IN ('published', 'icebox')";
  return 't.deleted_at IS NULL';
}

export async function loadTopicPage(db: Database, options: TopicPageOptions): Promise<PaginatedTopics> {
  const baseFilter = buildTopicFilterConditions(options);
  const conditions = [getTopicScopeCondition(options.scope), ...baseFilter.conditions];
  const values = baseFilter.values;
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const baseWhere = baseFilter.conditions.length ? `WHERE ${baseFilter.conditions.join(' AND ')}` : '';
  const sortExpressions: Record<string, string> = {
    title: 't.title COLLATE NOCASE',
    status: 't.status',
    priority: "CASE t.priority WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END",
    score: '(t.score_character + t.score_conflict + t.score_contrast + t.score_material + t.score_story)',
    words: 'draft_word_count',
    created_at: 't.created_at',
    updated_at: 't.updated_at',
    sort_order: 't.sort_order',
  };
  const sort = sortExpressions[options.sort || 'updated_at'] || sortExpressions.updated_at;
  const direction = options.direction === 'asc' ? 'ASC' : 'DESC';
  const offset = (options.page - 1) * options.pageSize;
  const includeMetadata = options.includeMetadata !== false;
  const statements = [
    command(db, `SELECT COUNT(*) AS count FROM topics t ${where}`, values),
    ...(includeMetadata
      ? [
          command(
            db,
            `SELECT
      COALESCE(SUM(COALESCE(d.word_count, 0)), 0) AS total_words,
      COALESCE(SUM(CASE WHEN t.status = 'scripting' THEN 1 ELSE 0 END), 0) AS in_scripting_count
      FROM topics t LEFT JOIN drafts d ON d.topic_id = t.id WHERE t.deleted_at IS NULL`,
          ),
        ]
      : []),
    ...(includeMetadata
      ? [
          command(
            db,
            `SELECT
      COALESCE(SUM(CASE WHEN t.deleted_at IS NULL AND t.status NOT IN ('published', 'icebox') THEN 1 ELSE 0 END), 0) AS active,
      COALESCE(SUM(CASE WHEN t.deleted_at IS NULL AND t.status IN ('published', 'icebox') THEN 1 ELSE 0 END), 0) AS archived,
      COALESCE(SUM(CASE WHEN t.deleted_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS trash
      FROM topics t ${baseWhere}`,
            baseFilter.values,
          ),
        ]
      : []),
    command(
      db,
      `SELECT t.*,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id) AS sources_count,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.verification_status = 'confirmed') AS verified_sources_count,
      (SELECT COUNT(*) FROM commercial_deal_topics cdt WHERE cdt.topic_id = t.id) AS commercial_deals_count,
      COALESCE((SELECT word_count FROM drafts d WHERE d.topic_id = t.id LIMIT 1), 0) AS draft_word_count
      FROM topics t ${where} ORDER BY ${sort} ${direction}, t.id ASC LIMIT ? OFFSET ?`,
      [...values, options.pageSize, offset],
    ),
  ];
  const results = readTransaction(db, statements);
  const countResult = results[0];
  const summaryResult = includeMetadata ? results[1] : undefined;
  const scopeCountsResult = includeMetadata ? results[2] : undefined;
  const rowsResult = results[includeMetadata ? 3 : 1];
  const rows = rowsResult as Topic[];
  const ids = rows.map(row => row.id);
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const [tagResult, personResult, currentTodoResult] = readTransaction(db, [
      command(
        db,
        `SELECT tt.topic_id, tg.* FROM topic_tags tt INNER JOIN tags tg ON tg.id = tt.tag_id WHERE tt.topic_id IN (${placeholders})`,
        ids,
      ),
      command(
        db,
        `SELECT tp.topic_id, p.* FROM topic_people tp INNER JOIN people p ON p.id = tp.person_id WHERE tp.topic_id IN (${placeholders})`,
        ids,
      ),
      command(
        db,
        `SELECT * FROM topic_todos
        WHERE status = 'in_progress' AND is_current = 1 AND topic_id IN (${placeholders})
        ORDER BY topic_id ASC`,
        ids,
      ),
    ]);
    const currentTodoByTopic = new Map<string, TopicTodo>();
    (currentTodoResult as TopicTodo[]).forEach(todo => {
      if (!currentTodoByTopic.has(todo.topic_id)) currentTodoByTopic.set(todo.topic_id, todo);
    });
    const tagsByTopic = new Map<string, Array<Tag & { topic_id: string }>>();
    const peopleByTopic = new Map<string, Array<Person & { topic_id: string }>>();
    (tagResult as Array<Tag & { topic_id: string }>).forEach(tag => {
      appendToRelationMap(tagsByTopic, tag.topic_id, tag);
    });
    (personResult as Array<Person & { topic_id: string }>).forEach(person => {
      appendToRelationMap(peopleByTopic, person.topic_id, person);
    });
    rows.forEach(topic => {
      topic.tags = tagsByTopic.get(topic.id) || [];
      topic.people = peopleByTopic.get(topic.id) || [];
      topic.current_todo = currentTodoByTopic.get(topic.id) || null;
    });
  }
  const total = Number((countResult[0] as { count?: number } | undefined)?.count || 0);
  const summaryRow = summaryResult?.[0] as { total_words?: number; in_scripting_count?: number } | undefined;
  const scopeCountsRow = scopeCountsResult?.[0] as { active?: number; archived?: number; trash?: number } | undefined;
  return {
    items: rows,
    page: options.page,
    page_size: options.pageSize,
    total,
    total_pages: Math.ceil(total / options.pageSize),
    ...(includeMetadata
      ? {
          summary: {
            total_words: Number(summaryRow?.total_words || 0),
            in_scripting_count: Number(summaryRow?.in_scripting_count || 0),
          },
          scope_counts: {
            active: Number(scopeCountsRow?.active || 0),
            archived: Number(scopeCountsRow?.archived || 0),
            trash: Number(scopeCountsRow?.trash || 0),
          },
        }
      : {}),
  };
}
export async function loadTopic(db: Database, id: string): Promise<Topic | null> {
  const results = readTransaction(db, [
    command(
      db,
      `SELECT t.*,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id) AS sources_count,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.verification_status = 'confirmed') AS verified_sources_count,
      (SELECT COUNT(*) FROM commercial_deal_topics cdt WHERE cdt.topic_id = t.id) AS commercial_deals_count,
      COALESCE((SELECT word_count FROM drafts d WHERE d.topic_id = t.id LIMIT 1), 0) AS draft_word_count
      FROM topics t WHERE t.id = ? AND t.deleted_at IS NULL LIMIT 1`,
      [id],
    ),
    command(
      db,
      `SELECT tg.* FROM tags tg
      INNER JOIN topic_tags tt ON tt.tag_id = tg.id
      WHERE tt.topic_id = ?`,
      [id],
    ),
    command(
      db,
      `SELECT p.* FROM people p
      INNER JOIN topic_people tp ON tp.person_id = p.id
      WHERE tp.topic_id = ?`,
      [id],
    ),
    command(
      db,
      `SELECT * FROM topic_todos
      WHERE topic_id = ? AND status = 'in_progress' AND is_current = 1
      LIMIT 1`,
      [id],
    ),
  ]);

  const topic = (results[0] as Topic[])[0];
  if (!topic) return null;

  return {
    ...topic,
    tags: (results[1] as Tag[]) || [],
    people: (results[2] as Person[]) || [],
    current_todo: (results[3] as TopicTodo[])[0] || null,
  };
}

export async function loadTopicBatch(db: Database, ids: string[]): Promise<Topic[]> {
  if (ids.length === 0) return [];
  if (ids.length > MAX_TOPIC_BATCH_QUERY_IDS) {
    const topics: Topic[] = [];
    for (let index = 0; index < ids.length; index += MAX_TOPIC_BATCH_QUERY_IDS) {
      topics.push(...(await loadTopicBatch(db, ids.slice(index, index + MAX_TOPIC_BATCH_QUERY_IDS))));
    }
    return topics;
  }
  const placeholders = ids.map(() => '?').join(',');
  const results = readTransaction(db, [
    command(
      db,
      `SELECT t.*,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id) AS sources_count,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.verification_status = 'confirmed') AS verified_sources_count,
      (SELECT COUNT(*) FROM commercial_deal_topics cdt WHERE cdt.topic_id = t.id) AS commercial_deals_count,
      COALESCE((SELECT word_count FROM drafts d WHERE d.topic_id = t.id LIMIT 1), 0) AS draft_word_count
      FROM topics t WHERE t.deleted_at IS NULL AND t.id IN (${placeholders})`,
      ids,
    ),
    command(
      db,
      `SELECT tt.topic_id, tg.* FROM topic_tags tt
      INNER JOIN tags tg ON tg.id = tt.tag_id
      WHERE tt.topic_id IN (${placeholders})`,
      ids,
    ),
    command(
      db,
      `SELECT tp.topic_id, p.* FROM topic_people tp
      INNER JOIN people p ON p.id = tp.person_id
      WHERE tp.topic_id IN (${placeholders})`,
      ids,
    ),
    command(
      db,
      `SELECT * FROM topic_todos
      WHERE topic_id IN (${placeholders}) AND status = 'in_progress' AND is_current = 1
      ORDER BY topic_id ASC`,
      ids,
    ),
  ]);

  const topics = results[0] as Topic[];
  const tagsByTopic = new Map<string, Tag[]>();
  const peopleByTopic = new Map<string, Person[]>();
  const currentTodoByTopic = new Map<string, TopicTodo>();
  (results[1] as Array<Tag & { topic_id: string }>).forEach(tag => {
    appendToRelationMap(tagsByTopic, tag.topic_id, tag);
  });
  (results[2] as Array<Person & { topic_id: string }>).forEach(person => {
    appendToRelationMap(peopleByTopic, person.topic_id, person);
  });
  (results[3] as TopicTodo[]).forEach(todo => {
    if (!currentTodoByTopic.has(todo.topic_id)) currentTodoByTopic.set(todo.topic_id, todo);
  });

  const topicById = new Map(topics.map(topic => [topic.id, topic]));
  return ids
    .map(id => topicById.get(id))
    .filter((topic): topic is Topic => Boolean(topic))
    .map(topic => ({
      ...topic,
      tags: tagsByTopic.get(topic.id) || [],
      people: peopleByTopic.get(topic.id) || [],
      current_todo: currentTodoByTopic.get(topic.id) || null,
    }));
}

function buildTopicStatement(db: Database, topic: TopicCoreInput, upsert: boolean) {
  const now = new Date().toISOString();
  const conflictClause = upsert
    ? `
  ON CONFLICT(id) DO UPDATE SET
    title=excluded.title, summary=excluded.summary, hook=excluded.hook, storyline=excluded.storyline,
    why_now=excluded.why_now, status=excluded.status, priority=excluded.priority,
    target_publish_date=excluded.target_publish_date, deadline=excluded.deadline,
    score_character=excluded.score_character,
    score_conflict=excluded.score_conflict, score_contrast=excluded.score_contrast,
    score_material=excluded.score_material, score_story=excluded.score_story,
    is_pinned=excluded.is_pinned, sort_order=excluded.sort_order, updated_at=excluded.updated_at,
    published_at=excluded.published_at, deleted_at=excluded.deleted_at`
    : '';
  return command(
    db,
    `INSERT INTO topics (
    id, title, summary, hook, storyline, why_now, status, priority,
    target_publish_date, deadline,
    score_character, score_conflict, score_contrast, score_material, score_story,
    is_pinned, sort_order, created_at, updated_at, published_at, deleted_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ${conflictClause}`,
    [
      topic.id,
      topic.title,
      topic.summary ?? '',
      topic.hook ?? '',
      topic.storyline ?? '',
      topic.why_now ?? '',
      topic.status ?? 'inbox',
      topic.priority ?? 'medium',
      topic.target_publish_date ?? null,
      topic.deadline ?? null,
      topic.score_character ?? 0,
      topic.score_conflict ?? 0,
      topic.score_contrast ?? 0,
      topic.score_material ?? 0,
      topic.score_story ?? 0,
      topic.is_pinned ?? 0,
      topic.sort_order ?? 0,
      topic.created_at ?? now,
      topic.updated_at ?? now,
      topic.published_at ?? null,
      topic.deleted_at ?? null,
    ],
  );
}

export function topicStatement(db: Database, topic: TopicCoreInput) {
  return buildTopicStatement(db, topic, true);
}

function topicInsertStatement(db: Database, topic: TopicCoreInput) {
  return buildTopicStatement(db, topic, false);
}

export async function insertTopic(
  db: Database,
  topic: TopicCoreInput,
  tagIds: string[] = [],
  personIds: string[] = [],
  initialTodo?: { id: string; title: string },
): Promise<void> {
  const existing = readOne<{ id: string }>(db, 'SELECT id FROM topics WHERE id = ?', [topic.id]);
  if (existing) throw new TopicAlreadyExistsError('Topic already exists');

  const isActive = !topic.deleted_at && !['published', 'icebox'].includes(topic.status || 'inbox');
  const batch = [
    ...(topic.is_pinned === 1 && isActive
      ? [
          command(
            db,
            `UPDATE topics SET is_pinned = 0
      WHERE deleted_at IS NULL AND status NOT IN ('published', 'icebox')`,
          ),
        ]
      : []),
    topicInsertStatement(db, { ...topic, is_pinned: topic.is_pinned === 1 && isActive ? 1 : 0 }),
  ];
  if (initialTodo) {
    const now = new Date().toISOString();
    batch.push(
      command(
        db,
        `INSERT INTO topic_todos (
      id, topic_id, title, status, is_current, current_started_at,
      completed_at, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, 'in_progress', 1, ?, NULL, 1, ?, ?)`,
        [initialTodo.id, topic.id, initialTodo.title, now, now, now],
      ),
    );
  }
  tagIds.forEach(tagId =>
    batch.push(
      command(db, 'INSERT OR IGNORE INTO topic_tags (id, topic_id, tag_id) VALUES (?, ?, ?)', [
        `${topic.id}:${tagId}`,
        topic.id,
        tagId,
      ]),
    ),
  );
  personIds.forEach(personId =>
    batch.push(
      command(db, 'INSERT OR IGNORE INTO topic_people (id, topic_id, person_id, role) VALUES (?, ?, ?, ?)', [
        `${topic.id}:${personId}`,
        topic.id,
        personId,
        '',
      ]),
    ),
  );
  try {
    executeTransaction(db, batch);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed: topics.id')) {
      throw new TopicAlreadyExistsError('Topic already exists');
    }
    throw error;
  }
}

export async function updateTopic(db: Database, id: string, body: TopicUpdateInput): Promise<void> {
  db.transaction(() => {
    const existing = db.query('SELECT status, deleted_at FROM topics WHERE id = ?').get(id) as
      { status: TopicStatus; deleted_at?: string | null } | undefined;
    if (!existing) return;
    const requestedStatus = (body.status || existing.status || 'inbox') as TopicStatus;
    const isActive = !existing.deleted_at && !['published', 'icebox'].includes(requestedStatus);
    if (body.is_pinned === 1 && !isActive) throw new TopicPinInvalidStateError('Only active topics can be pinned');
    const shouldClearPin = !isActive;
    const hasPinField = Object.prototype.hasOwnProperty.call(body, 'is_pinned');
    const statements: SqlCommand[] = [];
    const fields = [
      'title',
      'summary',
      'hook',
      'storyline',
      'why_now',
      'status',
      'priority',
      'target_publish_date',
      'deadline',
      'score_character',
      'score_conflict',
      'score_contrast',
      'score_material',
      'score_story',
      'is_pinned',
      'sort_order',
      'published_at',
      'deleted_at',
    ].filter(field => Object.prototype.hasOwnProperty.call(body, field) || (field === 'is_pinned' && shouldClearPin));
    if (body.is_pinned === 1 && isActive) {
      statements.push(
        command(
          db,
          `UPDATE topics SET is_pinned = 0
        WHERE id != ? AND deleted_at IS NULL AND status NOT IN ('published', 'icebox')`,
          [id],
        ),
      );
    }
    if (fields.length > 0) {
      const values = fields.map(field =>
        field === 'is_pinned' && shouldClearPin && !hasPinField ? 0 : body[field as keyof TopicUpdateInput],
      );
      statements.push(
        command(
          db,
          `UPDATE topics SET ${fields.map(field => `${field} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
          [...values, new Date().toISOString(), id],
        ),
      );
    }
    if (body.tags) {
      statements.push(command(db, 'DELETE FROM topic_tags WHERE topic_id = ?', [id]));
      body.tags.forEach(tag =>
        statements.push(
          command(db, 'INSERT OR IGNORE INTO topic_tags (id, topic_id, tag_id) VALUES (?, ?, ?)', [
            `${id}:${tag.id}`,
            id,
            tag.id,
          ]),
        ),
      );
    }
    if (body.people) {
      statements.push(command(db, 'DELETE FROM topic_people WHERE topic_id = ?', [id]));
      body.people.forEach(person =>
        statements.push(
          command(db, 'INSERT OR IGNORE INTO topic_people (id, topic_id, person_id, role) VALUES (?, ?, ?, ?)', [
            `${id}:${person.id}`,
            id,
            person.id,
            '',
          ]),
        ),
      );
    }
    statements.forEach(({ statement, values }) => statement.run(...values));
  }).immediate();
}

export async function softDeleteTopic(db: Database, id: string): Promise<void> {
  const now = new Date().toISOString();
  db.query('UPDATE topics SET deleted_at = ?, is_pinned = 0, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(
    now,
    now,
    id,
  );
}

/**
 * Restores a trashed topic.
 *
 * An expired topic is reported as `expired` but is deliberately NOT deleted
 * here. Destroying rows as a side effect of a "restore" request would turn a
 * user's attempt to recover data into permanent data loss; expiry is purged by
 * the dedicated trash cleanup path instead.
 */
export async function restoreTopic(
  db: Database,
  id: string,
  retentionDays = TRASH_RETENTION_DAYS,
): Promise<'restored' | 'expired' | 'not_found'> {
  return db
    .transaction(() => {
      const existing = db.query('SELECT deleted_at FROM topics WHERE id = ?').get(id) as
        { deleted_at?: string | null } | undefined;
      if (!existing) return 'not_found';

      const deletedAt = existing.deleted_at;
      if (deletedAt !== null && deletedAt !== undefined && retentionDays > 0) {
        const cutoff = Date.now() - retentionDays * 86400 * 1000;
        if (Date.parse(deletedAt) <= cutoff) return 'expired';
      }

      db.query('UPDATE topics SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
      return 'restored';
    })
    .immediate();
}

export async function listTrashedTopicIds(db: Database): Promise<string[]> {
  return readAll<{ id: string }>(db, 'SELECT id FROM topics WHERE deleted_at IS NOT NULL').map(row => row.id);
}

export async function reorderTopics(
  db: Database,
  updates: Array<{ id: string; status: TopicStatus; sort_order: number }>,
): Promise<string> {
  const now = new Date().toISOString();
  if (updates.length === 0) return now;
  const updateIds = updates.map(update => update.id);
  if (new Set(updateIds).size !== updateIds.length) {
    throw new TopicReorderInvalidStateError('Duplicate topic ids are not allowed');
  }

  const executeReorder = db.transaction(() => {
    const updatePlaceholders = updateIds.map(() => '?').join(',');
    const updatedTopics = db
      .query(`SELECT id, status FROM topics WHERE deleted_at IS NULL AND id IN (${updatePlaceholders})`)
      .all(...updateIds) as Array<{ id: string; status: TopicStatus }>;

    if (updatedTopics.length !== updateIds.length) {
      throw new TopicReorderInvalidStateError('All topics must exist and be active before reordering');
    }

    const affectedStatuses = Array.from(
      new Set([...updates.map(update => update.status), ...updatedTopics.map(topic => topic.status)]),
    );
    const placeholders = affectedStatuses.map(() => '?').join(',');
    const existing = db
      .query(
        `SELECT id, status FROM topics WHERE deleted_at IS NULL AND status IN (${placeholders}) ORDER BY status ASC, sort_order ASC, id ASC`,
      )
      .all(...affectedStatuses) as Array<{ id: string; status: TopicStatus }>;

    const idsByStatus = new Map<TopicStatus, string[]>(affectedStatuses.map(status => [status, []]));
    existing.forEach(row => idsByStatus.get(row.status)?.push(row.id));
    updates.forEach(update => {
      idsByStatus.forEach(ids => {
        const index = ids.indexOf(update.id);
        if (index >= 0) ids.splice(index, 1);
      });
    });

    const updatesByTarget = new Map<TopicStatus, typeof updates>();
    updates.forEach(update =>
      updatesByTarget.set(update.status, [...(updatesByTarget.get(update.status) || []), update]),
    );

    updatesByTarget.forEach((targetUpdates, status) => {
      const targetIds = idsByStatus.get(status) || [];
      targetUpdates
        .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
        .forEach(update => {
          targetIds.splice(Math.min(Math.max(0, update.sort_order - 1), targetIds.length), 0, update.id);
        });
    });

    const updateStmt = db.query(
      `UPDATE topics SET status = ?, sort_order = ?,
        is_pinned = CASE WHEN ? IN ('published', 'icebox') THEN 0 ELSE is_pinned END,
        updated_at = ? WHERE id = ?`,
    );

    Array.from(idsByStatus.entries()).forEach(([status, ids]) => {
      ids.forEach((id, index) => {
        updateStmt.run(status, index + 1, status, now, id);
      });
    });
  });

  executeReorder.immediate();
  return now;
}
