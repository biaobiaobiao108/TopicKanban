import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  loadTrashedTopics,
  permanentlyDeleteTrashedTopics,
  TopicNotInTrashError,
} from '../src/server/repositories/topics';

describe('trash safety', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  async function createDatabase(): Promise<void> {
    db.exec(await Bun.file('database/schema.sql').text());
  }

  function insertTopic(id: string, deletedAt: string | null): void {
    db.query('INSERT INTO topics (id, title, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, id, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', deletedAt);
  }

  it('loads every trashed topic instead of truncating at 100', async () => {
    await createDatabase();
    const insert = db.query('INSERT INTO topics (id, title, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?)');
    const now = '2026-01-01T00:00:00.000Z';
    const insertAll = db.transaction(() => {
      for (let index = 0; index < 101; index += 1) {
        const id = `topic-${index}`;
        insert.run(id, id, now, now, now);
      }
    });
    insertAll();

    const result = await loadTrashedTopics(db);

    expect(result).toHaveLength(101);
  });

  it('rejects a permanent-delete batch when any topic is not in trash', async () => {
    await createDatabase();
    insertTopic('trash-1', '2026-01-01T00:00:00.000Z');
    insertTopic('active-1', null);

    await expect(permanentlyDeleteTrashedTopics(db, ['trash-1', 'active-1']))
      .rejects.toBeInstanceOf(TopicNotInTrashError);
    expect(db.query('SELECT COUNT(*) AS count FROM topics').get()).toEqual({ count: 2 });
  });

  it('permanently deletes only the requested trashed topic and its associated drafts', async () => {
    await createDatabase();
    insertTopic('trash-1', '2026-01-01T00:00:00.000Z');
    insertTopic('active-1', null);
    db.query('INSERT INTO drafts (id, topic_id, updated_at) VALUES (?, ?, ?)')
      .run('trash-draft', 'trash-1', '2026-01-01T00:00:00.000Z');
    db.query('INSERT INTO drafts (id, topic_id, updated_at) VALUES (?, ?, ?)')
      .run('active-draft', 'active-1', '2026-01-01T00:00:00.000Z');

    await permanentlyDeleteTrashedTopics(db, ['trash-1']);

    expect(db.query('SELECT id FROM topics ORDER BY id').all()).toEqual([{ id: 'active-1' }]);
    expect(db.query('SELECT id FROM drafts').all()).toEqual([{ id: 'active-draft' }]);
  });
});
