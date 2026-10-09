import { STALE_ACTION_THRESHOLD_DAYS, type Topic } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function getCurrentActionAgeDays(topic: Topic, now = new Date()): number {
  const timestamp = topic.current_todo?.current_started_at || topic.updated_at;
  const value = new Date(timestamp).getTime();
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor((now.getTime() - value) / DAY_MS));
}

export function isActiveTopic(topic: Topic): boolean {
  return topic.status !== 'published' && topic.status !== 'icebox';
}

export function getCurrentActionWarning(topic: Topic, now = new Date()): string | null {
  if (!isActiveTopic(topic)) return null;
  if (!topic.current_todo) return '未设置当前行动';
  const days = getCurrentActionAgeDays(topic, now);
  return days >= STALE_ACTION_THRESHOLD_DAYS ? `行动已停滞 ${days} 天` : null;
}
