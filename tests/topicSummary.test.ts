import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { loadTopicPage } from '../src/server/repositories/topics';
import { SqliteDatabase } from '../src/server/sqlite';

describe('选题库全库摘要', () => {
  it('保持分页筛选数量，同时统计全库未删除选题的写稿数和字数', async () => {
    const sqlite = new Database(':memory:');
    try {
      sqlite.exec(await Bun.file('drizzle/0000_schema.sql').text());
      const now = '2026-09-25T00:00:00.000Z';
      const insertTopic = sqlite.query(`INSERT INTO topics
        (id, title, status, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`);
      const insertDraft = sqlite.query(`INSERT INTO drafts
        (id, topic_id, word_count, updated_at) VALUES (?, ?, ?, ?)`);
      for (const [id, title, status, deletedAt, words] of [
        ['writing', '正在写稿', 'scripting', null, 100],
        ['making', '正在制作', 'production', null, 200],
        ['released', '已经发布', 'published', null, 300],
        ['trashed', '已删除文案', 'scripting', now, 400],
      ] as const) {
        insertTopic.run(id, title, status, deletedAt, now, now);
        insertDraft.run(`draft-${id}`, id, words, now);
      }

      const db = new SqliteDatabase(sqlite);
      const active = await loadTopicPage(db, { scope: 'active', page: 1, pageSize: 50, status: 'production' });
      expect(active.total).toBe(1);
      expect(active.items.map((topic) => topic.id)).toEqual(['making']);
      expect(active.summary).toEqual({ total_words: 600, in_scripting_count: 1 });

      const archived = await loadTopicPage(db, { scope: 'archived', page: 1, pageSize: 50 });
      expect(archived.total).toBe(1);
      expect(archived.summary).toEqual(active.summary);
    } finally {
      sqlite.close();
    }
  });
});
