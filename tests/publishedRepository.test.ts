import { afterEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import type { PublishedVideo } from '../src/types';
import {
  insertPublishedVideo,
  PublishedTopicAlreadyLinkedError,
  updatePublishedVideo,
} from '../src/server/repositories/published';

describe('published video topic association', () => {
  let sqlite: Database | null = null;

  afterEach(() => {
    sqlite?.close();
    sqlite = null;
  });

  async function createDatabase(): Promise<Database> {
    sqlite = new Database(':memory:');
    sqlite.exec(await Bun.file('database/schema.sql').text());
    sqlite
      .query('INSERT INTO topics (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('topic-published-a', '已关联选题', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    sqlite
      .query('INSERT INTO topics (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('topic-published-b', '待关联选题', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    return sqlite;
  }

  function video(id: string, topicId: string | null): PublishedVideo {
    return {
      id,
      topic_id: topicId,
      title: id,
      url: '',
      bvid: '',
      published_at: '2026-01-01',
      views: 0,
      likes: 0,
      coins: 0,
      favorites: 0,
      comments: 0,
      notes: '',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
  }

  it('rejects a second published video for an already-linked topic atomically', async () => {
    const db = await createDatabase();
    await insertPublishedVideo(db, video('published-a', 'topic-published-a'));

    await expect(insertPublishedVideo(db, video('published-b', 'topic-published-a'))).rejects.toBeInstanceOf(
      PublishedTopicAlreadyLinkedError,
    );
    expect(db.query('SELECT id FROM published_videos').all()).toEqual([{ id: 'published-a' }]);
  });

  it('rejects moving another published video onto an already-linked topic', async () => {
    const db = await createDatabase();
    await insertPublishedVideo(db, video('published-a', 'topic-published-a'));
    await insertPublishedVideo(db, video('published-b', 'topic-published-b'));

    await expect(updatePublishedVideo(db, 'published-b', { topic_id: 'topic-published-a' })).rejects.toBeInstanceOf(
      PublishedTopicAlreadyLinkedError,
    );
    expect(db.query('SELECT topic_id FROM published_videos WHERE id = ?').get('published-b')).toEqual({
      topic_id: 'topic-published-b',
    });
  });
});
