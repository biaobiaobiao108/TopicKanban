import { CommercialDeal, PublishedVideo, Topic } from '../../types';
import { CalendarEventItem, CalendarLayerFilters, MonthStats } from './CalendarTypes';
import { getBeijingDateString } from '../../lib/actionDate';

export { getBeijingDateString } from '../../lib/actionDate';

export interface MonthDayCell {
  date: string; // YYYY-MM-DD
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
}

function formatIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Generates the 35 or 42 day cells for a calendar month grid (Monday is first day of week).
 */
export function getMonthGridDays(year: number, monthIndex: number): MonthDayCell[] {
  const todayStr = getBeijingDateString(new Date());

  // First day of target month (using UTC to be completely immune to local timezone shift)
  const firstDayUtc = new Date(Date.UTC(year, monthIndex, 1));
  let firstDayOfWeek = firstDayUtc.getUTCDay();
  // Adjust so Mon = 0, ..., Sun = 6
  firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const daysInCurrentMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const daysInPrevMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();

  const prevMonth = monthIndex === 0 ? 11 : monthIndex - 1;
  const prevYear = monthIndex === 0 ? year - 1 : year;
  const nextMonth = monthIndex === 11 ? 0 : monthIndex + 1;
  const nextYear = monthIndex === 11 ? year + 1 : year;

  const cells: MonthDayCell[] = [];

  // Prev month padding
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const dateStr = formatIsoDate(prevYear, prevMonth, day);
    const dayOfWeek = new Date(Date.UTC(prevYear, prevMonth, day)).getUTCDay();
    cells.push({
      date: dateStr,
      dayNumber: day,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    });
  }

  // Current month days
  for (let day = 1; day <= daysInCurrentMonth; day++) {
    const dateStr = formatIsoDate(year, monthIndex, day);
    const dayOfWeek = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
    cells.push({
      date: dateStr,
      dayNumber: day,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    });
  }

  // Next month padding to fill complete weeks (up to 35 or 42 total cells)
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let day = 1; day <= remaining; day++) {
    const dateStr = formatIsoDate(nextYear, nextMonth, day);
    const dayOfWeek = new Date(Date.UTC(nextYear, nextMonth, day)).getUTCDay();
    cells.push({
      date: dateStr,
      dayNumber: day,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    });
  }

  return cells;
}

export interface WeekDayCell {
  date: string; // YYYY-MM-DD
  dayNumber: number;
  dayName: string;
  isToday: boolean;
  isWeekend: boolean;
}

const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/**
 * Generates the 7 days of the week containing the base date (Monday ~ Sunday).
 */
export function getWeekDays(baseDate: Date): WeekDayCell[] {
  const todayStr = getBeijingDateString(new Date());
  const baseIso = getBeijingDateString(baseDate) || formatIsoDate(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate());
  const [bYear, bMonth, bDay] = baseIso.split('-').map(Number);
  const baseUtc = new Date(Date.UTC(bYear, bMonth - 1, bDay));
  
  let dayOfWeek = baseUtc.getUTCDay(); // 0 = Sun, 1 = Mon ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const mondayUtcTime = baseUtc.getTime() + diffToMonday * 86400000;

  const days: WeekDayCell[] = [];
  for (let i = 0; i < 7; i++) {
    const dUtc = new Date(mondayUtcTime + i * 86400000);
    const dateStr = formatIsoDate(dUtc.getUTCFullYear(), dUtc.getUTCMonth(), dUtc.getUTCDate());
    const dOfWeek = dUtc.getUTCDay();
    days.push({
      date: dateStr,
      dayNumber: dUtc.getUTCDate(),
      dayName: WEEKDAY_NAMES[i],
      isToday: dateStr === todayStr,
      isWeekend: dOfWeek === 0 || dOfWeek === 6,
    });
  }
  return days;
}

/**
 * Extracts and categorizes all events from topics, commercial deals, and published videos.
 */
export function extractCalendarEvents(
  topics: Topic[],
  deals: CommercialDeal[],
  publishedList: PublishedVideo[],
  filters: CalendarLayerFilters
): Map<string, CalendarEventItem[]> {
  const map = new Map<string, CalendarEventItem[]>();

  const addEvent = (dateStr: string | null | undefined, event: CalendarEventItem) => {
    if (!dateStr) return;
    const cleanDate = dateStr.includes('T') ? getBeijingDateString(dateStr) : dateStr.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return;
    const existing = map.get(cleanDate) || [];
    map.set(cleanDate, [...existing, event]);
  };

  // 1. Topics
  topics.forEach((topic) => {
    if (topic.deleted_at) return;

    // Layer 1: Planned Publish Date
    if (filters.showPlannedPublish && topic.target_publish_date && topic.status !== 'published') {
      addEvent(topic.target_publish_date, {
        id: `pub:${topic.id}`,
        date: topic.target_publish_date,
        type: 'planned_publish',
        title: topic.title,
        status: topic.status,
        priority: topic.priority,
        topicId: topic.id,
        rawTopic: topic,
      });
    }

    // Layer 2: Production Deadline
    if (filters.showDeadlines && topic.deadline && topic.status !== 'published' && topic.status !== 'icebox') {
      addEvent(topic.deadline, {
        id: `deadline:${topic.id}`,
        date: topic.deadline,
        type: 'deadline',
        title: `截稿：${topic.title}`,
        status: topic.status,
        priority: topic.priority,
        topicId: topic.id,
        rawTopic: topic,
      });
    }

  });

  // 2. Commercial Deals (Layer 3)
  if (filters.showDeals) {
    deals.forEach((deal) => {
      if (deal.delivery_due_date) {
        addEvent(deal.delivery_due_date, {
          id: `deal:${deal.id}`,
          date: deal.delivery_due_date,
          type: 'commercial_deal',
          title: `商单交付：${deal.brand_name ? `${deal.brand_name} · ` : ''}${deal.title}`,
          subtitle: deal.next_action || undefined,
          status: deal.status,
          amount_cents: deal.amount_cents,
          dealId: deal.id,
          rawDeal: deal,
        });
      }
    });
  }

  // 3. Published Videos (Layer 4)
  if (filters.showPublished) {
    publishedList.forEach((pub) => {
      if (pub.published_at) {
        addEvent(pub.published_at, {
          id: `video:${pub.id}`,
          date: pub.published_at,
          type: 'published',
          title: pub.title,
          subtitle: pub.topic_title ? `选题：${pub.topic_title}` : undefined,
          views: pub.views,
          likes: pub.likes,
          publishedVideoId: pub.id,
          rawPublished: pub,
        });
      }
    });
  }

  return map;
}

/**
 * Computes month-level statistics.
 */
export function calculateMonthStats(
  eventsMap: Map<string, CalendarEventItem[]>,
  year: number,
  monthIndex: number,
  topics: Topic[]
): MonthStats {
  const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  let plannedPublishCount = 0;
  let commercialDealCount = 0;
  let publishedVideoCount = 0;

  eventsMap.forEach((events, date) => {
    if (date.startsWith(monthPrefix)) {
      events.forEach((ev) => {
        if (ev.type === 'planned_publish') plannedPublishCount++;
        else if (ev.type === 'commercial_deal') commercialDealCount++;
        else if (ev.type === 'published') publishedVideoCount++;
      });
    }
  });

  const unscheduledActiveCount = topics.filter(
    (t) => !t.deleted_at &&
      t.status !== 'published' &&
      t.status !== 'icebox' &&
      !t.target_publish_date
  ).length;

  return {
    plannedPublishCount,
    commercialDealCount,
    publishedVideoCount,
    unscheduledActiveCount,
  };
}
