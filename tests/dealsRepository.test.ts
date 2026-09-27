import { afterEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import type { CommercialDeal } from '../src/types';
import { insertCommercialDeal, updateCommercialDeal } from '../src/server/repositories/deals';
import { SqliteDatabase } from '../src/server/sqlite';

describe('commercial deal repository', () => {
  let sqlite: Database | null = null;

  afterEach(() => {
    sqlite?.close();
    sqlite = null;
  });

  it('records status and payment transitions from the serialized prior state', async () => {
    sqlite = new Database(':memory:');
    sqlite.exec(await Bun.file('drizzle/0000_schema.sql').text());
    const db = new SqliteDatabase(sqlite);
    const now = '2026-01-01T00:00:00.000Z';
    const deal: CommercialDeal = {
      id: 'deal-concurrent-audit',
      title: '并发审计测试商单',
      brand_name: '',
      agency_name: '',
      contact_name: '',
      contact_channel: '',
      source: 'other',
      deliverable_type: 'custom_video',
      status: 'communicating',
      contract_status: 'not_started',
      contract_summary: '',
      brief: '',
      requirements: '',
      restrictions: '',
      amount_cents: 0,
      payment_status: 'unpaid',
      paid_at: null,
      delivery_due_date: null,
      publish_date: null,
      next_action: '',
      next_action_due_date: null,
      published_video_id: null,
      created_at: now,
      updated_at: now,
    };
    await insertCommercialDeal(db, deal);

    await Promise.all([
      updateCommercialDeal(db, deal.id, { status: 'delivered', payment_status: 'paid' }),
      updateCommercialDeal(db, deal.id, { status: 'delivered', payment_status: 'paid' }),
    ]);

    const activities = sqlite.query(`SELECT kind, content FROM commercial_deal_activities
      WHERE deal_id = ? ORDER BY kind, content`).all(deal.id) as Array<{ kind: string; content: string }>;
    expect(activities).toEqual([
      { kind: 'payment', content: '回款状态：unpaid → paid' },
      { kind: 'status_change', content: '阶段变更：communicating → delivered' },
    ]);
    expect(sqlite.query('SELECT status, payment_status FROM commercial_deals WHERE id = ?').get(deal.id))
      .toEqual({ status: 'delivered', payment_status: 'paid' });
  });
});
