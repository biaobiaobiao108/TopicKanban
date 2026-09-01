import type { Topic } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function getCurrentActionAgeDays(topic: Topic, now = new Date()): number {
  const timestamp = topic.current_todo?.current_started_at || topic.updated_at;
  const value = new Date(timestamp).getTime();
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor((now.getTime() - value) / DAY_MS));
}

export function isCurrentActionDue(topic: Topic, now = new Date()): boolean {
  const dueDate = topic.current_todo?.due_date;
  if (!dueDate) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  if (!match) return false;
  const [, y, m, d] = match;
  // 显式以北京时间 (UTC+8) 当天的 23:59:59.999 作为截止时间点
  const endOfDeferredDay = new Date(`${y}-${m}-${d}T23:59:59.999+08:00`);
  return Number.isFinite(endOfDeferredDay.getTime()) && endOfDeferredDay.getTime() < now.getTime();
}

export function isActiveTopic(topic: Topic): boolean {
  return topic.status !== 'published' && topic.status !== 'icebox';
}

export function getCurrentActionWarning(topic: Topic, now = new Date(), staleThresholdDays = 5): string | null {
  if (!isActiveTopic(topic)) return null;
  if (!topic.current_todo) return '未设置当前行动';
  if (isCurrentActionDue(topic, now)) {
    const match = topic.current_todo.due_date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const endOfDueDay = new Date(`${match[1]}-${match[2]}-${match[3]}T23:59:59.999+08:00`);
      if (Number.isFinite(endOfDueDay.getTime()) && endOfDueDay.getTime() < now.getTime()) {
        const days = Math.max(1, Math.floor((now.getTime() - endOfDueDay.getTime()) / DAY_MS));
        return `已逾期 ${days} 天`;
      }
    }
  }
  const days = getCurrentActionAgeDays(topic, now);
  return days >= staleThresholdDays ? `行动已停滞 ${days} 天` : null;
}

export interface ReadinessItem {
  id: 'hook' | 'storyline' | 'people' | 'verified-sources' | 'sources' | 'draft';
  label: string;
  ready: boolean;
  detail: string;
}

export interface TopicReadiness {
  score: number;
  completed: number;
  items: ReadinessItem[];
  nextGap: string | null;
}

export function getTopicReadiness(topic: Topic): TopicReadiness {
  const verifiedSources = topic.verified_sources_count || 0;
  const sources = topic.sources_count || 0;
  const words = topic.draft_word_count || 0;
  const items: ReadinessItem[] = [
    { id: 'hook', label: '核心看点', ready: topic.hook.trim().length >= 10, detail: topic.hook.trim() ? '需要更具体' : '尚未填写' },
    { id: 'storyline', label: '故事主线', ready: topic.storyline.trim().length >= 20, detail: topic.storyline.trim() ? '需要更完整' : '尚未填写' },
    { id: 'people', label: '关键人物', ready: (topic.people?.length || 0) >= 1, detail: `${topic.people?.length || 0} 人` },
    { id: 'verified-sources', label: '已确认资料', ready: verifiedSources >= 2, detail: `${verifiedSources} / 2 条` },
    { id: 'sources', label: '资料总量', ready: sources >= 2, detail: `${sources} / 2 条` },
    { id: 'draft', label: '文案起稿', ready: words >= 800, detail: `${words} / 800 字` },
  ];
  const completed = items.filter((item) => item.ready).length;
  return {
    score: Math.round((completed / items.length) * 100),
    completed,
    items,
    nextGap: items.find((item) => !item.ready)?.label || null,
  };
}
