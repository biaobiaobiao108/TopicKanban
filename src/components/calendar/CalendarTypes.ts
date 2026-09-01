import { CommercialDeal, Priority, PublishedVideo, Topic, TopicStatus, CommercialDealStatus } from '../../types';

export type CalendarEventType =
  | 'planned_publish'
  | 'deadline'
  | 'commercial_deal'
  | 'published';

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
}

export interface CalendarLayerFilters {
  showPlannedPublish: boolean;
  showDeadlines: boolean;
  showDeals: boolean;
  showPublished: boolean;
}

export const DEFAULT_CALENDAR_LAYERS: CalendarLayerFilters = {
  showPlannedPublish: true,
  showDeadlines: true,
  showDeals: true,
  showPublished: true,
};

export type CalendarViewMode = 'month' | 'week' | 'agenda';

export interface MonthStats {
  plannedPublishCount: number;
  commercialDealCount: number;
  publishedVideoCount: number;
  unscheduledActiveCount: number;
}
