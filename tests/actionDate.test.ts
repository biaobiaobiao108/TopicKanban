import { describe, expect, it } from 'bun:test';
import {
  addBeijingCalendarDays,
  createBeijingCalendarDate,
  formatBeijingDateTime,
  getActionDateDisplay,
  getBeijingDateString,
  getBeijingWeekday,
} from '../src/lib/actionDate';

describe('行动日期展示', () => {
  const today = '2026-08-31';

  it('区分今天、未来日期和逾期天数，并保留无障碍所需的精确日期', () => {
    expect(getActionDateDisplay('2026-08-31', { today })).toMatchObject({
      text: '今天',
      fullDate: '2026年8月31日',
      state: 'today',
      daysFromToday: 0,
    });
    expect(getActionDateDisplay('2026-09-02', { today })).toMatchObject({
      text: '9月2日',
      state: 'future',
      daysFromToday: 2,
    });
    expect(getActionDateDisplay('2026-08-29', { today })).toMatchObject({
      text: '已逾期 2 天',
      fullDate: '2026年8月29日',
      state: 'overdue',
      daysFromToday: -2,
    });
  });

  it('跨年份时补充年份，并允许关闭行动状态', () => {
    expect(getActionDateDisplay('2027-01-02', { today }).text).toBe('2027年1月2日');
    expect(getActionDateDisplay('2026-08-29', { today, active: false })).toMatchObject({
      text: '8月29日',
      state: 'inactive',
      daysFromToday: -2,
    });
  });

  it('对空值和无效日期安全回退', () => {
    expect(getActionDateDisplay(null, { today }).state).toBe('empty');
    expect(getActionDateDisplay('不是日期', { today })).toMatchObject({
      text: '不是日期',
      fullDate: '不是日期',
      state: 'invalid',
    });
    expect(getActionDateDisplay('2026-02-30', { today }).state).toBe('invalid');
  });

  it('按北京时间计算自然日，避免 UTC 跨日误判', () => {
    expect(getBeijingDateString(new Date('2026-08-31T15:59:59.000Z'))).toBe('2026-08-31');
    expect(getBeijingDateString(new Date('2026-08-31T16:00:00.000Z'))).toBe('2026-09-01');
  });

  it('以北京时间进行日历日期的创建、星期和加减日计算', () => {
    expect(getBeijingWeekday('2026-08-31')).toBe(1);
    expect(addBeijingCalendarDays('2026-08-31', 4)).toBe('2026-09-04');
    expect(getBeijingDateString(createBeijingCalendarDate('2026-09-01'))).toBe('2026-09-01');
  });

  it('固定用北京时间格式化日期时间，不依赖运行设备时区', () => {
    expect(formatBeijingDateTime('2026-08-31T15:59:00.000Z', 'en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })).toContain('31/08/2026, 23:59');
  });
});
