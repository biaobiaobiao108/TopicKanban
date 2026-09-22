import { useMemo, useSyncExternalStore } from 'react';
import { isValidIsoDate } from './dateInput';
import { BEIJING_TIME_ZONE, getBeijingDateString } from './beijingTime';

export { getBeijingDateString } from './beijingTime';

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type ActionDateState = 'empty' | 'invalid' | 'inactive' | 'future' | 'today' | 'overdue';

export interface ActionDateDisplay {
  value: string;
  text: string;
  fullDate: string;
  state: ActionDateState;
  daysFromToday: number | null;
}

export interface ActionDateOptions {
  today?: string;
  active?: boolean;
}

export function formatBeijingDateTime(
  value: Date | string | null | undefined,
  locales: Intl.LocalesArgument = 'zh-CN',
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' },
): string {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(locales, { ...options, timeZone: BEIJING_TIME_ZONE }).format(date);
}

export function addBeijingCalendarDays(value: string, days: number): string {
  const ordinal = getDateOrdinal(value);
  if (ordinal === null || !Number.isFinite(days)) return '';
  const date = new Date((ordinal + Math.trunc(days)) * DAY_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function getBeijingWeekday(value?: Date | string | null): number {
  const ordinal = getDateOrdinal(getBeijingDateString(value));
  return ordinal === null ? Number.NaN : new Date(ordinal * DAY_MS).getUTCDay();
}

export function createBeijingCalendarDate(value?: Date | string | null): Date {
  const dateString = typeof value === 'string' && ISO_DATE_PATTERN.test(value) && isValidIsoDate(value)
    ? value
    : getBeijingDateString(value);
  const match = ISO_DATE_PATTERN.exec(dateString);
  if (!match || !isValidIsoDate(dateString)) return new Date(Number.NaN);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

function getDateOrdinal(value: string): number | null {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match || !isValidIsoDate(value)) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS;
}

function formatDate(value: string, includeYear: boolean): string {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return value;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return includeYear ? `${year}年${month}月${day}日` : `${month}月${day}日`;
}

function createEmptyDisplay(): ActionDateDisplay {
  return {
    value: '',
    text: '',
    fullDate: '',
    state: 'empty',
    daysFromToday: null,
  };
}

export function getActionDateDisplay(
  value?: string | null,
  { today = getBeijingDateString(), active = true }: ActionDateOptions = {}
): ActionDateDisplay {
  const normalized = value?.slice(0, 10) || '';
  if (!normalized) return createEmptyDisplay();

  const dateOrdinal = getDateOrdinal(normalized);
  const todayOrdinal = getDateOrdinal(today);
  if (dateOrdinal === null || todayOrdinal === null) {
    return {
      value: normalized,
      text: normalized,
      fullDate: normalized,
      state: 'invalid',
      daysFromToday: null,
    };
  }

  const includeYear = normalized.slice(0, 4) !== today.slice(0, 4);
  const absoluteDate = formatDate(normalized, includeYear);
  const fullDate = formatDate(normalized, true);
  const daysFromToday = dateOrdinal - todayOrdinal;

  if (!active) {
    return { value: normalized, text: absoluteDate, fullDate, state: 'inactive', daysFromToday };
  }

  if (daysFromToday === 0) {
    return { value: normalized, text: '今天', fullDate, state: 'today', daysFromToday };
  }

  if (daysFromToday < 0) {
    return {
      value: normalized,
      text: `已逾期 ${Math.abs(daysFromToday)} 天`,
      fullDate,
      state: 'overdue',
      daysFromToday,
    };
  }

  return { value: normalized, text: absoluteDate, fullDate, state: 'future', daysFromToday };
}

let todaySnapshot = getBeijingDateString();
let rolloverTimer: ReturnType<typeof setTimeout> | null = null;
const todayListeners = new Set<() => void>();

function stopRolloverTimer() {
  if (rolloverTimer !== null) {
    clearTimeout(rolloverTimer);
    rolloverTimer = null;
  }
}

function scheduleRollover() {
  stopRolloverTimer();
  const current = getDateOrdinal(todaySnapshot);
  const nextMidnight = current === null
    ? Date.now() + DAY_MS
    : (current + 1) * DAY_MS - 8 * 60 * 60 * 1000 + 100;
  const delay = Math.max(1000, nextMidnight - Date.now());
  rolloverTimer = setTimeout(() => {
    const nextSnapshot = getBeijingDateString();
    if (nextSnapshot !== todaySnapshot) {
      todaySnapshot = nextSnapshot;
      todayListeners.forEach((listener) => listener());
    }
    scheduleRollover();
  }, delay);
}

function subscribeToBeijingDate(listener: () => void): () => void {
  todayListeners.add(listener);
  if (todayListeners.size === 1) {
    todaySnapshot = getBeijingDateString();
    scheduleRollover();
  }
  return () => {
    todayListeners.delete(listener);
    if (todayListeners.size === 0) stopRolloverTimer();
  };
}

function getTodaySnapshot() {
  return todaySnapshot;
}

export function useBeijingToday(): string {
  return useSyncExternalStore(subscribeToBeijingDate, getTodaySnapshot, getTodaySnapshot);
}

export function useActionDateDisplay(value?: string | null, active = true): ActionDateDisplay {
  const today = useBeijingToday();
  return useMemo(() => getActionDateDisplay(value, { today, active }), [active, today, value]);
}
