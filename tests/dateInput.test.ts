import { describe, expect, it } from 'bun:test';
import { isValidIsoDate, normalizeDateInputValue } from '../src/lib/dateInput';

describe('日期输入规范化', () => {
  it('把连续八位数字转换成标准日期，避免六位年份', () => {
    expect(normalizeDateInputValue('20260827')).toEqual({ value: '2026-08-27', error: null });
    expect(normalizeDateInputValue('2026-08-27')).toEqual({ value: '2026-08-27', error: null });
    expect(normalizeDateInputValue('202608-02-07').error).toBe('日期请输入 8 位数字，例如 20260827');
  });

  it('拒绝不存在的日期和早于最小日期的值', () => {
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(normalizeDateInputValue('20260826', '2026-08-27').error).toBe('日期不能早于 20260827');
  });

  it('允许清空可选日期，并提示不完整输入', () => {
    expect(normalizeDateInputValue('')).toEqual({ value: '', error: null });
    expect(normalizeDateInputValue('202608').error).toBe('日期请输入 8 位数字，例如 20260827');
  });
});
