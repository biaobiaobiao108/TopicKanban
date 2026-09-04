import type { PaginatedTopics, Person, Tag, Topic, TopicPinMutationResult, TopicStatus, TopicTodo } from '../../types';
import type { SqliteDatabase, SqlitePreparedStatement } from '../sqlite';
import { bind } from './shared';

export async function loadTopics(db: SqliteDatabase, scope: 'active' | 'trash' | 'all' = 'active'): Promise<Topic[]> {
  const topicFilter = scope === 'active'
    ? 'WHERE t.deleted_at IS NULL'
    : scope === 'trash'
      ? 'WHERE t.deleted_at IS NOT NULL'
      : '';
  const results = await db.batch([
    db.prepare(`SELECT t.*,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id) AS sources_count,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.verification_status = 'confirmed') AS verified_sources_count,
      (SELECT COUNT(*) FROM timeline_events e WHERE e.topic_id = t.id) AS timeline_count,
      (SELECT COUNT(*) FROM commercial_deal_topics cdt WHERE cdt.topic_id = t.id) AS commercial_deals_count,
      COALESCE((SELECT word_count FROM drafts d WHERE d.topic_id = t.id LIMIT 1), 0) AS draft_word_count
      FROM topics t ${topicFilter}
      ORDER BY t.is_pinned DESC, t.sort_order ASC, t.updated_at DESC`),
    db.prepare('SELECT topic_id, tag_id FROM topic_tags'),
    db.prepare('SELECT topic_id, person_id FROM topic_people'),
    db.prepare('SELECT id, name, color FROM tags'),
    db.prepare('SELECT * FROM people'),
    db.prepare(`SELECT * FROM topic_todos
      WHERE completed_at IS NULL
      ORDER BY topic_id ASC, sort_order ASC, created_at ASC`),
  ]);

  const topicRows = results[0].results as unknown as Topic[];
  const topicTags = results[1].results as unknown as Array<{ topic_id: string; tag_id: string }>;
  const topicPeople = results[2].results as unknown as Array<{ topic_id: string; person_id: string }>;
  const tags = results[3].results as unknown as Tag[];
  const people = results[4].results as unknown as Person[];
  const currentTodos = results[5].results as unknown as TopicTodo[];
  const currentTodoByTopic = new Map<string, TopicTodo>();
  currentTodos.forEach((todo) => {
    if (!currentTodoByTopic.has(todo.topic_id)) currentTodoByTopic.set(todo.topic_id, todo);
  });
  const tagMap = new Map(tags.map((tag) => [tag.id, tag]));
  const personMap = new Map(people.map((person) => [person.id, person]));
  const tagsByTopic = new Map<string, Tag[]>();
  const peopleByTopic = new Map<string, Person[]>();

  topicTags.forEach(({ topic_id, tag_id }) => {
    const tag = tagMap.get(tag_id);
    if (tag) tagsByTopic.set(topic_id, [...(tagsByTopic.get(topic_id) || []), tag]);
  });
  topicPeople.forEach(({ topic_id, person_id }) => {
    const person = personMap.get(person_id);
    if (person) peopleByTopic.set(topic_id, [...(peopleByTopic.get(topic_id) || []), person]);
  });

  return topicRows.map((topic) => ({
    ...topic,
    tags: tagsByTopic.get(topic.id) || [],
    people: peopleByTopic.get(topic.id) || [],
    current_todo: currentTodoByTopic.get(topic.id) || null,
  }));
}

export async function loadTrashedTopics(db: SqliteDatabase): Promise<Topic[]> {
  return loadTopics(db, 'trash');
}

export async function loadTodayFocus(db: SqliteDatabase): Promise<{ topics: Topic[]; total_active: number }> {
  const activeCondition = "t.deleted_at IS NULL AND t.status NOT IN ('published', 'icebox')";
  const [focusResult, priorityResult, recentResult, countResult, allActiveResult] = await db.batch([
    db.prepare(`SELECT t.id FROM topics t WHERE ${activeCondition}
      ORDER BY t.is_pinned DESC,
        CASE WHEN t.status IN ('approved', 'scripting', 'production') THEN 1 ELSE 0 END DESC,
        CASE t.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC,
        t.updated_at DESC, t.id DESC LIMIT 1`),
    db.prepare(`SELECT t.id FROM topics t WHERE ${activeCondition}
      ORDER BY t.is_pinned DESC,
        CASE t.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC,
        t.updated_at DESC, t.id DESC LIMIT 5`),
    db.prepare(`SELECT t.id FROM topics t WHERE t.deleted_at IS NULL ORDER BY t.updated_at DESC, t.id DESC LIMIT 8`),
    db.prepare(`SELECT COUNT(*) AS count FROM topics t WHERE ${activeCondition}`),
    db.prepare(`SELECT t.id FROM topics t WHERE ${activeCondition}
      ORDER BY t.updated_at DESC, t.id DESC`),
  ]);
  const orderedIds = Array.from(new Set([
    ...(focusResult.results as unknown as Array<{ id: string }>).map((row) => row.id),
    ...(priorityResult.results as unknown as Array<{ id: string }>).map((row) => row.id),
    ...(recentResult.results as unknown as Array<{ id: string }>).map((row) => row.id),
    ...(allActiveResult.results as unknown as Array<{ id: string }>).map((row) => row.id),
  ]));
  const loadedTopics = await Promise.all(orderedIds.map((id) => loadTopic(db, id)));
  return {
    topics: loadedTopics.filter((topic): topic is Topic => Boolean(topic)),
    total_active: Number((countResult.results[0] as { count?: number } | undefined)?.count || 0),
  };
}
export class TopicNotInTrashError extends Error {}
export class TopicPinInvalidStateError extends Error {}

export async function setTopicPinned(
  db: SqliteDatabase,
  id: string,
  isPinned: 0 | 1,
): Promise<TopicPinMutationResult> {
  const existing = await db.prepare('SELECT status, deleted_at FROM topics WHERE id = ?').bind(id).first<{ status: TopicStatus; deleted_at?: string | null }>();
  if (!existing) throw new TopicPinInvalidStateError('Topic not found');
  const isActive = !existing.deleted_at && !['published', 'icebox'].includes(existing.status);
  if (isPinned === 1 && !isActive) throw new TopicPinInvalidStateError('Only active topics can be pinned');

  const now = new Date().toISOString();
  const cleared = isPinned === 1
    ? await db.prepare(`SELECT id FROM topics
      WHERE id != ? AND deleted_at IS NULL AND status NOT IN ('published', 'icebox') AND is_pinned = 1`).bind(id).all<{ id: string }>()
    : { results: [] as Array<{ id: string }> };
  await db.batch([
    ...(isPinned === 1 ? [bind(db, `UPDATE topics SET is_pinned = 0
      WHERE id != ? AND deleted_at IS NULL AND status NOT IN ('published', 'icebox') AND is_pinned = 1`, [id])] : []),
    bind(db, 'UPDATE topics SET is_pinned = ?, updated_at = ? WHERE id = ?', [isPinned, now, id]),
  ]);
  const topic = await loadTopic(db, id);
  if (!topic) throw new TopicPinInvalidStateError('Topic not found');
  return { topic, cleared_topic_ids: cleared.results.map((row) => row.id) };
}

function permanentDeleteStatements(db: SqliteDatabase, id: string): SqlitePreparedStatement[] {
  const trashedTopic = 'SELECT id FROM topics WHERE id = ? AND deleted_at IS NOT NULL';
  return [
    bind(db, `DELETE FROM draft_citations WHERE topic_id IN (${trashedTopic})`, [id]),
    bind(db, `DELETE FROM drafts WHERE topic_id IN (${trashedTopic})`, [id]),
    bind(db, `DELETE FROM sources WHERE topic_id IN (${trashedTopic})`, [id]),
    bind(db, `DELETE FROM timeline_event_people WHERE timeline_event_id IN
      (SELECT id FROM timeline_events WHERE topic_id IN (${trashedTopic}))`, [id]),
    bind(db, `DELETE FROM timeline_events WHERE topic_id IN (${trashedTopic})`, [id]),
    bind(db, `DELETE FROM topic_tags WHERE topic_id IN (${trashedTopic})`, [id]),
    bind(db, `DELETE FROM topic_people WHERE topic_id IN (${trashedTopic})`, [id]),
    bind(db, `DELETE FROM commercial_deal_topics WHERE topic_id IN (${trashedTopic})`, [id]),
    bind(db, `DELETE FROM published_videos WHERE topic_id IN (${trashedTopic})`, [id]),
    bind(db, `DELETE FROM topic_todos WHERE topic_id IN (${trashedTopic})`, [id]),
    bind(db, 'DELETE FROM topics WHERE id = ? AND deleted_at IS NOT NULL', [id]),
  ];
}

export async function permanentlyDeleteTrashedTopics(db: SqliteDatabase, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(', ');
  const result = await bind(db,
    `SELECT id FROM topics WHERE deleted_at IS NOT NULL AND id IN (${placeholders})`, ids
  ).all<{ id: string }>();
  if (result.results.length !== ids.length) {
    throw new TopicNotInTrashError('All topics must be in trash before permanent deletion');
  }

  await db.batch(ids.flatMap((id) => permanentDeleteStatements(db, id)));
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
}

function buildTopicFilterConditions(options: TopicPageOptions): { conditions: string[]; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (options.status) {
    const statuses = options.status.split(',').map((status) => status.trim()).filter(Boolean);
    if (statuses.length === 1) {
      conditions.push('t.status = ?');
      values.push(statuses[0]);
    } else if (statuses.length > 1) {
      conditions.push(`t.status IN (${statuses.map(() => '?').join(',')})`);
      values.push(...statuses);
    }
  }
  if (options.priority) { conditions.push('t.priority = ?'); values.push(options.priority); }
  if (options.tagId) { conditions.push('EXISTS (SELECT 1 FROM topic_tags ft WHERE ft.topic_id = t.id AND ft.tag_id = ?)'); values.push(options.tagId); }
  if (options.personId) { conditions.push('EXISTS (SELECT 1 FROM topic_people fp WHERE fp.topic_id = t.id AND fp.person_id = ?)'); values.push(options.personId); }
  if (options.query) {
    const pattern = `%${options.query.replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push(`(t.title LIKE ? ESCAPE '\\' OR t.summary LIKE ? ESCAPE '\\' OR t.hook LIKE ? ESCAPE '\\'
      OR t.storyline LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM topic_todos stt WHERE stt.topic_id = t.id
        AND stt.title LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM topic_tags st INNER JOIN tags sg ON sg.id = st.tag_id WHERE st.topic_id = t.id AND sg.name LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM topic_people sp INNER JOIN people spp ON spp.id = sp.person_id WHERE sp.topic_id = t.id
        AND (spp.name LIKE ? ESCAPE '\\' OR spp.aliases LIKE ? ESCAPE '\\' OR spp.identity LIKE ? ESCAPE '\\')))`);
    values.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  }
  return { conditions, values };
}

function getTopicScopeCondition(scope: TopicPageOptions['scope']): string {
  if (scope === 'trash') return 't.deleted_at IS NOT NULL';
  if (scope === 'active') return "t.deleted_at IS NULL AND t.status NOT IN ('published', 'icebox')";
  if (scope === 'archived') return "t.deleted_at IS NULL AND t.status IN ('published', 'icebox')";
  return 't.deleted_at IS NULL';
}

export async function loadTopicPage(db: SqliteDatabase, options: TopicPageOptions): Promise<PaginatedTopics> {
  const baseFilter = buildTopicFilterConditions(options);
  const conditions = [getTopicScopeCondition(options.scope), ...baseFilter.conditions];
  const values = baseFilter.values;
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const baseWhere = baseFilter.conditions.length ? `WHERE ${baseFilter.conditions.join(' AND ')}` : '';
  const sortExpressions: Record<string, string> = {
    title: 't.title COLLATE NOCASE', status: 't.status', priority: "CASE t.priority WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END",
    score: '(t.score_character + t.score_conflict + t.score_contrast + t.score_material + t.score_story)',
    words: 'draft_word_count', created_at: 't.created_at', updated_at: 't.updated_at', sort_order: 't.sort_order',
  };
  const sort = sortExpressions[options.sort || 'updated_at'];
  const direction = options.direction === 'asc' ? 'ASC' : 'DESC';
  const offset = (options.page - 1) * options.pageSize;
  const [countResult, summaryResult, scopeCountsResult, rowsResult] = await db.batch([
    bind(db, `SELECT COUNT(*) AS count FROM topics t ${where}`, values),
    bind(db, `SELECT
      COALESCE(SUM(COALESCE((SELECT word_count FROM drafts d WHERE d.topic_id = t.id LIMIT 1), 0)), 0) AS total_words,
      COALESCE(SUM(CASE WHEN t.deleted_at IS NULL AND t.status IN ('scripting', 'production') THEN 1 ELSE 0 END), 0) AS in_scripting_count
      FROM topics t ${where}`, values),
    bind(db, `SELECT
      COALESCE(SUM(CASE WHEN t.deleted_at IS NULL AND t.status NOT IN ('published', 'icebox') THEN 1 ELSE 0 END), 0) AS active,
      COALESCE(SUM(CASE WHEN t.deleted_at IS NULL AND t.status IN ('published', 'icebox') THEN 1 ELSE 0 END), 0) AS archived,
      COALESCE(SUM(CASE WHEN t.deleted_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS trash
      FROM topics t ${baseWhere}`, baseFilter.values),
    bind(db, `SELECT t.*,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id) AS sources_count,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.verification_status = 'confirmed') AS verified_sources_count,
      (SELECT COUNT(*) FROM timeline_events e WHERE e.topic_id = t.id) AS timeline_count,
      (SELECT COUNT(*) FROM commercial_deal_topics cdt WHERE cdt.topic_id = t.id) AS commercial_deals_count,
      COALESCE((SELECT word_count FROM drafts d WHERE d.topic_id = t.id LIMIT 1), 0) AS draft_word_count
      FROM topics t ${where} ORDER BY ${sort} ${direction}, t.id ASC LIMIT ? OFFSET ?`, [...values, options.pageSize, offset]),
  ]);
  const rows = rowsResult.results as unknown as Topic[];
  const ids = rows.map((row) => row.id);
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const [tagResult, personResult, currentTodoResult] = await db.batch([
      bind(db, `SELECT tt.topic_id, tg.* FROM topic_tags tt INNER JOIN tags tg ON tg.id = tt.tag_id WHERE tt.topic_id IN (${placeholders})`, ids),
      bind(db, `SELECT tp.topic_id, p.* FROM topic_people tp INNER JOIN people p ON p.id = tp.person_id WHERE tp.topic_id IN (${placeholders})`, ids),
      bind(db, `SELECT * FROM topic_todos
        WHERE completed_at IS NULL AND topic_id IN (${placeholders})
        ORDER BY topic_id ASC, sort_order ASC, created_at ASC`, ids),
    ]);
    const currentTodoByTopic = new Map<string, TopicTodo>();
    (currentTodoResult.results as unknown as TopicTodo[]).forEach((todo) => {
      if (!currentTodoByTopic.has(todo.topic_id)) currentTodoByTopic.set(todo.topic_id, todo);
    });
    rows.forEach((topic) => {
      topic.tags = (tagResult.results as unknown as Array<Tag & { topic_id: string }>).filter((tag) => tag.topic_id === topic.id);
      topic.people = (personResult.results as unknown as Array<Person & { topic_id: string }>).filter((person) => person.topic_id === topic.id);
      topic.current_todo = currentTodoByTopic.get(topic.id) || null;
    });
  }
  const total = Number((countResult.results[0] as { count?: number } | undefined)?.count || 0);
  const summaryRow = summaryResult.results[0] as { total_words?: number; in_scripting_count?: number } | undefined;
  const scopeCountsRow = scopeCountsResult.results[0] as { active?: number; archived?: number; trash?: number } | undefined;
  return {
    items: rows,
    page: options.page,
    page_size: options.pageSize,
    total,
    total_pages: Math.ceil(total / options.pageSize),
    summary: {
      total_words: Number(summaryRow?.total_words || 0),
      in_scripting_count: Number(summaryRow?.in_scripting_count || 0),
    },
    scope_counts: {
      active: Number(scopeCountsRow?.active || 0),
      archived: Number(scopeCountsRow?.archived || 0),
      trash: Number(scopeCountsRow?.trash || 0),
    },
  };
}
export async function loadTopic(db: SqliteDatabase, id: string): Promise<Topic | null> {
  const results = await db.batch([
    bind(db, `SELECT t.*,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id) AS sources_count,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.verification_status = 'confirmed') AS verified_sources_count,
      (SELECT COUNT(*) FROM timeline_events e WHERE e.topic_id = t.id) AS timeline_count,
      COALESCE((SELECT word_count FROM drafts d WHERE d.topic_id = t.id LIMIT 1), 0) AS draft_word_count
      FROM topics t WHERE t.id = ? AND t.deleted_at IS NULL LIMIT 1`, [id]),
    bind(db, `SELECT tg.* FROM tags tg
      INNER JOIN topic_tags tt ON tt.tag_id = tg.id
      WHERE tt.topic_id = ?`, [id]),
    bind(db, `SELECT p.* FROM people p
      INNER JOIN topic_people tp ON tp.person_id = p.id
      WHERE tp.topic_id = ?`, [id]),
    bind(db, `SELECT * FROM topic_todos
      WHERE topic_id = ? AND completed_at IS NULL
      ORDER BY sort_order ASC, created_at ASC LIMIT 1`, [id]),
  ]);

  const topic = (results[0].results as unknown as Topic[])[0];
  if (!topic) return null;

  return {
    ...topic,
    tags: (results[1].results as unknown as Tag[]) || [],
    people: (results[2].results as unknown as Person[]) || [],
    current_todo: ((results[3].results as unknown as TopicTodo[])[0] || null),
  };
}

export function topicStatement(db: SqliteDatabase, topic: Partial<Topic> & { id: string; title: string }): SqlitePreparedStatement {
  const now = new Date().toISOString();
  return bind(db, `INSERT INTO topics (
    id, title, summary, hook, storyline, why_now, status, priority,
    target_publish_date, deadline,
    score_character, score_conflict, score_contrast, score_material, score_story,
    is_pinned, sort_order, created_at, updated_at, published_at, deleted_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    title=excluded.title, summary=excluded.summary, hook=excluded.hook, storyline=excluded.storyline,
    why_now=excluded.why_now, status=excluded.status, priority=excluded.priority,
    target_publish_date=excluded.target_publish_date, deadline=excluded.deadline,
    score_character=excluded.score_character,
    score_conflict=excluded.score_conflict, score_contrast=excluded.score_contrast,
    score_material=excluded.score_material, score_story=excluded.score_story,
    is_pinned=excluded.is_pinned, sort_order=excluded.sort_order, updated_at=excluded.updated_at,
    published_at=excluded.published_at, deleted_at=excluded.deleted_at`, [
    topic.id, topic.title, topic.summary ?? '', topic.hook ?? '', topic.storyline ?? '', topic.why_now ?? '',
    topic.status ?? 'inbox', topic.priority ?? 'medium',
    topic.target_publish_date ?? null, topic.deadline ?? null,
    topic.score_character ?? 0, topic.score_conflict ?? 0, topic.score_contrast ?? 0,
    topic.score_material ?? 0, topic.score_story ?? 0, topic.is_pinned ?? 0, topic.sort_order ?? 0,
    topic.created_at ?? now, now, topic.published_at ?? null, topic.deleted_at ?? null,
  ]);
}
export async function insertTopic(
  db: SqliteDatabase,
  topic: Partial<Topic> & { id: string; title: string },
  tagIds: string[] = [],
  personIds: string[] = [],
  initialTodo?: { id: string; title: string }
): Promise<void> {
  const isActive = !topic.deleted_at && !['published', 'icebox'].includes(topic.status || 'inbox');
  const batch: SqlitePreparedStatement[] = [
    ...(topic.is_pinned === 1 && isActive ? [bind(db, `UPDATE topics SET is_pinned = 0
      WHERE deleted_at IS NULL AND status NOT IN ('published', 'icebox')`, [])] : []),
    topicStatement(db, { ...topic, is_pinned: topic.is_pinned === 1 && isActive ? 1 : 0 }),
  ];
  if (initialTodo) {
    const now = new Date().toISOString();
    batch.push(bind(db, `INSERT INTO topic_todos (
      id, topic_id, title, is_current, current_started_at,
      completed_at, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, 1, ?, NULL, 1, ?, ?)`, [
      initialTodo.id, topic.id, initialTodo.title,
      now, now, now,
    ]));
  }
  tagIds.forEach((tagId) => batch.push(bind(db,
    'INSERT OR IGNORE INTO topic_tags (id, topic_id, tag_id) VALUES (?, ?, ?)',
    [`${topic.id}:${tagId}`, topic.id, tagId]
  )));
  personIds.forEach((personId) => batch.push(bind(db,
    'INSERT OR IGNORE INTO topic_people (id, topic_id, person_id, role) VALUES (?, ?, ?, ?)',
    [`${topic.id}:${personId}`, topic.id, personId, '']
  )));
  await db.batch(batch);
}

export async function updateTopic(
  db: SqliteDatabase,
  id: string,
  body: Partial<Topic>
): Promise<void> {
  const existing = await db.prepare('SELECT status, deleted_at FROM topics WHERE id = ?').bind(id).first<{ status: TopicStatus; deleted_at?: string | null }>();
  const requestedStatus = (body.status || existing?.status || 'inbox') as TopicStatus;
  const isActive = !existing?.deleted_at && !['published', 'icebox'].includes(requestedStatus);
  if (body.is_pinned === 1 && !isActive) throw new TopicPinInvalidStateError('Only active topics can be pinned');
  const shouldClearPin = !isActive;
  const hasPinField = Object.prototype.hasOwnProperty.call(body, 'is_pinned');
  const batch: SqlitePreparedStatement[] = [];
  const fields = [
    'title', 'summary', 'hook', 'storyline', 'why_now', 'status', 'priority',
    'target_publish_date', 'deadline',
    'score_character', 'score_conflict', 'score_contrast', 'score_material', 'score_story',
    'is_pinned', 'sort_order', 'published_at', 'deleted_at',
  ].filter((field) => Object.prototype.hasOwnProperty.call(body, field) || (field === 'is_pinned' && shouldClearPin));
  if (body.is_pinned === 1 && isActive) {
    batch.push(bind(db, `UPDATE topics SET is_pinned = 0
      WHERE id != ? AND deleted_at IS NULL AND status NOT IN ('published', 'icebox')`, [id]));
  }
  if (fields.length > 0) {
    const values = fields.map((field) => field === 'is_pinned' && shouldClearPin && !hasPinField
      ? 0
      : body[field as keyof Topic]);
    batch.push(bind(db,
      `UPDATE topics SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      [...values, new Date().toISOString(), id]
    ));
  }
  if (body.tags) {
    batch.push(bind(db, 'DELETE FROM topic_tags WHERE topic_id = ?', [id]));
    body.tags.forEach((tag) => batch.push(bind(db,
      'INSERT OR IGNORE INTO topic_tags (id, topic_id, tag_id) VALUES (?, ?, ?)',
      [`${id}:${tag.id}`, id, tag.id]
    )));
  }
  if (body.people) {
    batch.push(bind(db, 'DELETE FROM topic_people WHERE topic_id = ?', [id]));
    body.people.forEach((person) => batch.push(bind(db,
      'INSERT OR IGNORE INTO topic_people (id, topic_id, person_id, role) VALUES (?, ?, ?, ?)',
      [`${id}:${person.id}`, id, person.id, '']
    )));
  }
  if (batch.length > 0) await db.batch(batch);
}

export async function softDeleteTopic(db: SqliteDatabase, id: string): Promise<void> {
  const now = new Date().toISOString();
  await bind(db, 'UPDATE topics SET deleted_at = ?, is_pinned = 0, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [now, now, id]).run();
}

export async function restoreTopic(db: SqliteDatabase, id: string): Promise<void> {
  await bind(db, 'UPDATE topics SET deleted_at = NULL, updated_at = ? WHERE id = ?', [new Date().toISOString(), id]).run();
}

export async function listTrashedTopicIds(db: SqliteDatabase): Promise<string[]> {
  const result = await db.prepare('SELECT id FROM topics WHERE deleted_at IS NOT NULL').all<{ id: string }>();
  return result.results.map((row) => row.id);
}

export async function reorderTopics(
  db: SqliteDatabase,
  updates: Array<{ id: string; status: TopicStatus; sort_order: number }>
): Promise<string> {
  const now = new Date().toISOString();
  if (updates.length === 0) return now;
  const affectedStatuses = Array.from(new Set(updates.map((update) => update.status)));
  const placeholders = affectedStatuses.map(() => '?').join(',');
  const existing = await db.prepare(`SELECT id, status FROM topics
    WHERE deleted_at IS NULL AND status IN (${placeholders})
    ORDER BY status ASC, sort_order ASC, id ASC`).bind(...affectedStatuses).all<{ id: string; status: TopicStatus }>();
  const idsByStatus = new Map<TopicStatus, string[]>(affectedStatuses.map((status) => [status, []]));
  existing.results.forEach((row) => idsByStatus.get(row.status)?.push(row.id));
  updates.forEach((update) => {
    idsByStatus.forEach((ids) => {
      const index = ids.indexOf(update.id);
      if (index >= 0) ids.splice(index, 1);
    });
  });
  const updatesByTarget = new Map<TopicStatus, typeof updates>();
  updates.forEach((update) => updatesByTarget.set(update.status, [
    ...(updatesByTarget.get(update.status) || []), update,
  ]));
  updatesByTarget.forEach((targetUpdates, status) => {
    const targetIds = idsByStatus.get(status) || [];
    targetUpdates
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
      .forEach((update) => {
        targetIds.splice(Math.min(Math.max(0, update.sort_order - 1), targetIds.length), 0, update.id);
      });
  });
  await db.batch(Array.from(idsByStatus.entries()).flatMap(([status, ids]) => ids.map((id, index) => bind(
    db,
    `UPDATE topics SET status = ?, sort_order = ?,
      is_pinned = CASE WHEN ? IN ('published', 'icebox') THEN 0 ELSE is_pinned END,
      updated_at = ? WHERE id = ?`,
    [status, index + 1, status, now, id]
  ))));
  return now;
}
