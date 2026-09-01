import { CommercialDeal, Priority, PublishedVideo, Topic, TopicStatus, CommercialDealStatus, TopicTodo } from '../../types';

export type CalendarEventType =
  | 'planned_publish'
  | 'deadline'
  | 'commercial_deal'
  | 'published'
  | 'todo_due';

export interface CalendarEventItem {
  id: string;
  date: string; // YYYY-MM-DD
  type: CalendarEventType;
  title: string;
  subtitle?: string;
  status?: TopicStatus | CommercialDealStatus;
  priority?: Priority;
  amount_cents?: number;
  views?: number;
  likes?: number;
  topicId?: string;
  dealId?: string;
  publishedVideoId?: string;
  rawTopic?: Topic;
  rawDeal?: CommercialDeal;
  rawPublished?: PublishedVideo;
  rawTodo?: TopicTodo;
}

export interface CalendarLayerFilters {
  showPlannedPublish: boolean;
  showDeadlines: boolean;
  showDeals: boolean;
  showPublished: boolean;
  showTodoDue: boolean;
}

export const DEFAULT_CALENDAR_LAYERS: CalendarLayerFilters = {
  showPlannedPublish: true,
  showDeadlines: true,
  showDeals: true,
  showPublished: true,
  showTodoDue: true,
};

export type CalendarViewMode = 'month' | 'week' | 'agenda';

export interface MonthStats {
  plannedPublishCount: number;
  commercialDealCount: number;
  publishedVideoCount: number;
  unscheduledActiveCount: number;
  todoDueCount: number;
}
