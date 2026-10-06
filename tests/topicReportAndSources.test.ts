import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { createApp } from '../src/server/app';
import { SqliteDatabase } from '../src/server/sqlite';
import { NativeApp } from '../src/server/native';
import type { ApiBindings } from '../src/server/apiShared';
import {
  loadTopicReport,
  saveTopicReport,
} from '../src/server/repositories/writing';
import {
  loadTopicWorkspace,
  insertSource,
  reorderSources,
} from '../src/server/repositories/workspace';
import {
  insertTopic,
  permanentlyDeleteTrashedTopics,
  softDeleteTopic,
} from '../src/server/repositories/topics';
import type { Source } from '../src/types';

describe('Topic Report and Sources Timeline Integration', () => {
  let sqlite: Database;
  let db: SqliteDatabase;
  let app: NativeApp;
  let headers: Record<string, string>;

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    const schemaSql = await Bun.file('drizzle/0000_schema.sql').text();
    sqlite.exec(schemaSql);

    db = new SqliteDatabase(sqlite);

    const bindings: ApiBindings = {
      DB: db,
      APP_PASSWORD: 'test-password',
    };

    app = createApp(bindings);

    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'test-password' }),
    });
    const { token } = (await loginRes.json()) as { token: string };
    headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  });

  afterEach(() => {
    sqlite.close();
  });

  it('loads empty report by default and saves markdown content', async () => {
    const topic = {
      id: 'topic-1',
      title: '测试选题报告',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await insertTopic(db, topic);

    // Initially, report should be null
    const initialReport = await loadTopicReport(db, topic.id);
    expect(initialReport).toBeNull();

    // Save report
    const result = await saveTopicReport(db, topic.id, {
      content_markdown: '# 深度调查报告\n\n- 关键时间点：2026-05\n- 涉案金额：5000万',
      content_html: '<h1>深度调查报告</h1><ul><li>关键时间点：2026-05</li></ul>',
      word_count: 50,
      base_version: 0,
    });

    expect(result.kind).toBe('saved');
    if (result.kind === 'saved') {
      expect(result.report.topic_id).toBe(topic.id);
      expect(result.report.version).toBe(1);
      expect(result.report.content_markdown).toContain('深度调查报告');
      expect(result.report.word_count).toBe(50);
    }

    // Load again
    const loaded = await loadTopicReport(db, topic.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.content_markdown).toContain('涉案金额：5000万');
    expect(loaded!.version).toBe(1);

    // Save update with matching base_version
    const updateResult = await saveTopicReport(db, topic.id, {
      content_markdown: '# 更新后的报告',
      word_count: 8,
      base_version: 1,
    });
    expect(updateResult.kind).toBe('saved');
    if (updateResult.kind === 'saved') {
      expect(updateResult.report.version).toBe(2);
      expect(updateResult.report.content_markdown).toBe('# 更新后的报告');
    }

    // Attempt save with mismatched base_version should return conflict
    const conflictResult = await saveTopicReport(db, topic.id, {
      content_markdown: '# 冲突版本',
      base_version: 1,
    });
    expect(conflictResult.kind).toBe('conflict');
  });

  it('saves source with timeline fields and supports reordering', async () => {
    const topic = {
      id: 'topic-2',
      title: '测试素材时间线合并',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await insertTopic(db, topic);

    // Create 3 sources with different dates and sort_orders
    const src1: Source = {
      id: 'src-1',
      topic_id: topic.id,
      title: '事件起因',
      content: '首次曝光',
      url: '',
      platform: 'bilibili',
      author: '',
      published_at: '',
      verification_status: 'confirmed',
      notes: '',
      event_date: '2024-01-15',
      date_precision: 'exact',
      sort_order: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const src2: Source = {
      id: 'src-2',
      topic_id: topic.id,
      title: '发展转折',
      content: '多方回应',
      url: '',
      platform: 'bilibili',
      author: '',
      published_at: '',
      verification_status: 'confirmed',
      notes: '',
      event_date: '2024-03',
      date_precision: 'year_month',
      sort_order: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const src3: Source = {
      id: 'src-3',
      topic_id: topic.id,
      title: '待定时间证据',
      content: '某份文件截图',
      url: '',
      platform: 'bilibili',
      author: '',
      published_at: '',
      verification_status: 'confirmed',
      notes: '',
      event_date: '',
      date_precision: 'unknown',
      sort_order: 3,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await insertSource(db, src1);
    await insertSource(db, src2);
    await insertSource(db, src3);

    expect(src1.event_date).toBe('2024-01-15');
    expect(src1.date_precision).toBe('exact');
    expect(src2.date_precision).toBe('year_month');
    expect(src3.date_precision).toBe('unknown');

    // Reorder sources
    await reorderSources(db, [
      { id: src2.id, topic_id: topic.id },
      { id: src1.id, topic_id: topic.id },
      { id: src3.id, topic_id: topic.id },
    ]);

    // Load workspace
    const workspace = await loadTopicWorkspace(db, topic.id);
    expect(workspace).not.toBeNull();
    expect(workspace!.sources).toBeDefined();
    expect(workspace!.sources.length).toBe(3);
    // Order should reflect new sort_order: src2, src1, src3
    expect(workspace!.sources[0].id).toBe(src2.id);
    expect(workspace!.sources[1].id).toBe(src1.id);
    expect(workspace!.sources[2].id).toBe(src3.id);
  });

  it('exposes report and sources reorder API endpoints via HTTP app', async () => {
    const topic = {
      id: 'topic-http',
      title: 'HTTP API 选题',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await insertTopic(db, topic);

    // 1. GET /api/topics/:id/report (empty)
    const getRes = await app.request(`/api/topics/${topic.id}/report`, {
      method: 'GET',
      headers,
    });
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData).toBeNull();

    // 2. PUT /api/topics/:id/report
    const putRes = await app.request(`/api/topics/${topic.id}/report`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        content_markdown: '# 报告正文',
        content_html: '<h1>报告正文</h1>',
        word_count: 10,
        base_version: 0,
      }),
    });
    expect(putRes.status).toBe(200);
    const putData = (await putRes.json()) as { version: number; content_markdown: string };
    expect(putData.version).toBe(1);
    expect(putData.content_markdown).toBe('# 报告正文');

    // 2b. PUT with wrong base_version produces 409 REPORT_CONFLICT
    const conflictRes = await app.request(`/api/topics/${topic.id}/report`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        content_markdown: '# 发生冲突的修改',
        base_version: 0, // Stale!
      }),
    });
    expect(conflictRes.status).toBe(409);
    const conflictData = (await conflictRes.json()) as { error: string; current: { version: number } };
    expect(conflictData.error).toBe('REPORT_CONFLICT');
    expect(conflictData.current.version).toBe(1);

    // 2c. PUT with correct base_version 1 increments version to 2
    const updateRes = await app.request(`/api/topics/${topic.id}/report`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        content_markdown: '# 报告正文 (第二版)',
        base_version: 1,
      }),
    });
    expect(updateRes.status).toBe(200);
    const updateData = (await updateRes.json()) as { version: number; content_markdown: string };
    expect(updateData.version).toBe(2);
    expect(updateData.content_markdown).toBe('# 报告正文 (第二版)');

    // 3. GET /api/topics/:id/report (now has report v2)
    const getRes2 = await app.request(`/api/topics/${topic.id}/report`, {
      method: 'GET',
      headers,
    });
    expect(getRes2.status).toBe(200);
    const getData2 = (await getRes2.json()) as { version: number; content_markdown: string };
    expect(getData2.content_markdown).toBe('# 报告正文 (第二版)');
    expect(getData2.version).toBe(2);

    // 4. Sources reorder batch endpoint
    const srcA: Source = {
      id: 'src-a', topic_id: topic.id, title: 'A', content: '', url: '', platform: 'bilibili', author: '', published_at: '', verification_status: 'confirmed', notes: '', event_date: '', date_precision: 'exact', sort_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    const srcB: Source = {
      id: 'src-b', topic_id: topic.id, title: 'B', content: '', url: '', platform: 'bilibili', author: '', published_at: '', verification_status: 'confirmed', notes: '', event_date: '', date_precision: 'exact', sort_order: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    await insertSource(db, srcA);
    await insertSource(db, srcB);

    const reorderRes = await app.request('/api/sources/reorder/batch', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        sources: [
          { id: srcB.id, topic_id: topic.id },
          { id: srcA.id, topic_id: topic.id },
        ],
      }),
    });
    expect(reorderRes.status).toBe(200);
    const reorderData = (await reorderRes.json()) as { success: boolean };
    expect(reorderData.success).toBe(true);
  });

  it('cascades deletion of topic reports when topic is permanently deleted', async () => {
    const topic = {
      id: 'topic-trash',
      title: '待软删除选题',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await insertTopic(db, topic);

    await saveTopicReport(db, topic.id, {
      content_markdown: '将随选题一同物理删除的报告',
      word_count: 20,
    });

    // Soft delete topic
    await softDeleteTopic(db, topic.id);

    // Permanently delete
    await permanentlyDeleteTrashedTopics(db, [topic.id]);

    // Report should no longer exist
    const report = await loadTopicReport(db, topic.id);
    expect(report).toBeNull();
  });
});
