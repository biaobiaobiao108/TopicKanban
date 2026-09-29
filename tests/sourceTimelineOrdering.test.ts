import { describe, expect, it } from 'bun:test';
import type { Source } from '../src/types';
import {
  canReorderTimeline,
  normalizeTimelineDate,
  reorderVisibleSourcesInFullList,
  shouldAutofillEventDate,
  sortTimelineSources,
} from '../src/components/topic-detail/SourcesTab';

const source = (id: string, sort_order: number, event_date = ''): Source => ({
  id,
  topic_id: 'topic-1',
  title: id,
  content: '',
  url: '',
  platform: 'other',
  author: '',
  published_at: '',
  verification_status: 'confirmed',
  notes: '',
  event_date,
  date_precision: event_date ? 'exact' : 'unknown',
  sort_order,
  created_at: '',
  updated_at: '',
});

describe('source timeline ordering', () => {
  it('normalizes month and day values that are not zero-padded', () => {
    expect(normalizeTimelineDate('2026-5')).toBe('2026-05-00');
    expect(normalizeTimelineDate('2026-5-2')).toBe('2026-05-02');
    expect(normalizeTimelineDate('2026-05-12')).toBe('2026-05-12');
    expect(normalizeTimelineDate('待考证')).toBeNull();
  });

  it('sorts unpadded dates chronologically and only enables drag ordering in manual mode', () => {
    const dates = [
      source('may-2', 1, '2026-5-2'),
      source('april', 2, '2026-4-29'),
      source('may', 3, '2026-5'),
    ];

    expect(sortTimelineSources(dates, 'date-asc').map((item) => item.id)).toEqual(['april', 'may', 'may-2']);
    expect(sortTimelineSources(dates, 'date-desc').map((item) => item.id)).toEqual(['may-2', 'may', 'april']);
    expect(canReorderTimeline('date-asc')).toBe(false);
    expect(canReorderTimeline('date-desc')).toBe(false);
    expect(canReorderTimeline('manual')).toBe(true);
  });

  it('uses persisted sort order in manual mode', () => {
    const dates = [source('later-date', 1, '2027-1-1'), source('earlier-date', 2, '2026-1-1')];

    expect(sortTimelineSources(dates, 'manual').map((item) => item.id)).toEqual(['later-date', 'earlier-date']);
  });

  it('only fills the event date when the user has not touched the field', () => {
    expect(shouldAutofillEventDate('', false)).toBe(true);
    expect(shouldAutofillEventDate('', true)).toBe(false);
    expect(shouldAutofillEventDate('2026-05', false)).toBe(false);
  });

  it('reorders filtered sources in their full-list slots while retaining hidden sources', () => {
    const full = [source('a', 1), source('hidden-1', 2), source('b', 3), source('hidden-2', 4), source('c', 5)];
    const reordered = reorderVisibleSourcesInFullList(full, [full[4], full[0], full[2]]);

    expect(reordered.map((item) => item.id)).toEqual(['c', 'hidden-1', 'a', 'hidden-2', 'b']);
    expect(reordered.filter((item) => item.id.startsWith('hidden'))).toEqual([full[1], full[3]]);
  });
});
