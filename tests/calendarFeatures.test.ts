import { describe, it, expect } from 'bun:test';
import {
  getMonthGridDays,
  getWeekDays,
  extractCalendarEvents,
  calculateMonthStats,
  getBeijingDateString,
} from '../src/components/calendar/calendarUtils';
import { DEFAULT_CALENDAR_LAYERS } from '../src/components/calendar/CalendarTypes';
import { Topic, CommercialDeal, PublishedVideo } from '../src/types';

describe('Calendar utilities and event extraction', () => {
  it('generates consistent month grid days starting on Monday', () => {
    // August 2026: Aug 1 is Saturday
    const days = getMonthGridDays(2026, 7); // 0-indexed month: 7 = August
    expect(days.length % 7).toBe(0);
    expect(days.length).toBeGreaterThanOrEqual(35);

    // First day in grid should be a Monday (2026-07-27)
    expect(days[0].date).toBe('2026-07-27');
    expect(days[0].isCurrentMonth).toBe(false);

    // Find Aug 1
    const aug1 = days.find((d) => d.date === '2026-08-01');
    expect(aug1).toBeDefined();
    expect(aug1?.isCurrentMonth).toBe(true);
    expect(aug1?.isWeekend).toBe(true);

    // Find Aug 31
    const aug31 = days.find((d) => d.date === '2026-08-31');
    expect(aug31).toBeDefined();
    expect(aug31?.isCurrentMonth).toBe(true);
  });

  it('generates 7 week days from Monday to Sunday', () => {
    const testDate = new Date(2026, 7, 28); // 2026-08-28 (Friday)
    const week = getWeekDays(testDate);
    expect(week.length).toBe(7);
    expect(week[0].dayName).toBe('周一');
    expect(week[0].date).toBe('2026-08-24');
    expect(week[4].dayName).toBe('周五');
    expect(week[4].date).toBe('2026-08-28');
    expect(week[6].dayName).toBe('周日');
    expect(week[6].date).toBe('2026-08-30');
    expect(week[6].isWeekend).toBe(true);
  });

  it('extracts all 5 event types across topics, deals, and published videos', () => {
    const topics: Topic[] = [
      {
        id: 't1',
        title: '峨眉山减肥大溃败',
        summary: '概述',
        hook: '钩子',
        storyline: '大纲',
        why_now: '时机',
        status: 'scripting',
        priority: 'high',
        next_action: '写第二幕',
        target_publish_date: '2026-08-30',
        deadline: '2026-08-28',
        next_action_deferred_until: '2026-08-27',
        score_character: 2,
        score_conflict: 2,
        score_contrast: 2,
        score_material: 2,
        score_story: 2,
        is_pinned: 0,
        sort_order: 0,
        created_at: '2026-08-20',
        updated_at: '2026-08-20',
      },
      {
        id: 't2',
        title: '未排期选题',
        summary: '',
        hook: '',
        storyline: '',
        why_now: '',
        status: 'approved',
        priority: 'medium',
        next_action: '',
        score_character: 1,
        score_conflict: 1,
        score_contrast: 1,
        score_material: 1,
        score_story: 1,
        is_pinned: 0,
        sort_order: 1,
        created_at: '2026-08-21',
        updated_at: '2026-08-21',
      },
    ];

    const deals: CommercialDeal[] = [
      {
        id: 'd1',
        title: '某品牌植入视频',
        brand_name: '某数码品牌',
        agency_name: '',
        contact_name: '',
        contact_channel: '',
        source: 'brand_direct',
        deliverable_type: 'custom_video',
        status: 'producing',
        contract_status: 'signed',
        contract_summary: '',
        brief: '',
        requirements: '',
        restrictions: '',
        amount_cents: 3000000,
        payment_status: 'unpaid',
        delivery_due_date: '2026-08-29',
        next_action: '提交初审样片',
        created_at: '2026-08-20',
        updated_at: '2026-08-20',
      },
    ];

    const published: PublishedVideo[] = [
      {
        id: 'p1',
        topic_id: null,
        title: '上期爆款复盘成片',
        url: 'https://bilibili.com/video/BV1xx411c7mD',
        bvid: 'BV1xx411c7mD',
        published_at: '2026-08-15',
        views: 152000,
        likes: 8900,
        coins: 4300,
        favorites: 5200,
        comments: 630,
        notes: '',
        updated_at: '2026-08-16',
      },
    ];

    const eventsMap = extractCalendarEvents(topics, deals, published, DEFAULT_CALENDAR_LAYERS);

    // Check target publish date on 2026-08-30
    const aug30Events = eventsMap.get('2026-08-30');
    expect(aug30Events).toBeDefined();
    expect(aug30Events?.some((e) => e.type === 'planned_publish' && e.topicId === 't1')).toBe(true);

    // Check deadline on 2026-08-28
    const aug28Events = eventsMap.get('2026-08-28');
    expect(aug28Events).toBeDefined();
    expect(aug28Events?.some((e) => e.type === 'deadline' && e.topicId === 't1')).toBe(true);

    // Check commercial deal on 2026-08-29
    const aug29Events = eventsMap.get('2026-08-29');
    expect(aug29Events).toBeDefined();
    expect(aug29Events?.some((e) => e.type === 'commercial_deal' && e.dealId === 'd1')).toBe(true);

    // Check published video on 2026-08-15
    const aug15Events = eventsMap.get('2026-08-15');
    expect(aug15Events).toBeDefined();
    expect(aug15Events?.some((e) => e.type === 'published' && e.publishedVideoId === 'p1')).toBe(true);

    // Check deferred action on 2026-08-27
    const aug27Events = eventsMap.get('2026-08-27');
    expect(aug27Events).toBeDefined();
    expect(aug27Events?.some((e) => e.type === 'deferred_action' && e.topicId === 't1')).toBe(true);

    // Calculate month stats for August 2026
    const stats = calculateMonthStats(eventsMap, 2026, 7, topics);
    expect(stats.plannedPublishCount).toBe(1);
    expect(stats.commercialDealCount).toBe(1);
    expect(stats.publishedVideoCount).toBe(1);
    expect(stats.unscheduledActiveCount).toBe(1); // t2 has no target_publish_date
  });

  it('respects layer filter toggles', () => {
    const topics: Topic[] = [
      {
        id: 't1',
        title: '测试选题',
        summary: '',
        hook: '',
        storyline: '',
        why_now: '',
        status: 'scripting',
        priority: 'high',
        next_action: '',
        target_publish_date: '2026-08-30',
        deadline: '2026-08-28',
        score_character: 1,
        score_conflict: 1,
        score_contrast: 1,
        score_material: 1,
        score_story: 1,
        is_pinned: 0,
        sort_order: 0,
        created_at: '2026-08-20',
        updated_at: '2026-08-20',
      },
    ];

    const filteredMap = extractCalendarEvents(topics, [], [], {
      ...DEFAULT_CALENDAR_LAYERS,
      showPlannedPublish: false,
      showDeadlines: false,
    });

    expect(filteredMap.get('2026-08-30')).toBeUndefined();
    expect(filteredMap.get('2026-08-28')).toBeUndefined();
  });
});
