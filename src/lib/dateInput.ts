export interface DateInputParseResult {
  value: string;
  error: string | null;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

export function normalizeDateInputValue(input: string, min?: string): DateInputParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { value: '', error: null };

  if (!/^[\d\s./-]+$/.test(trimmed)) {
    return { value: '', error: '日期请输入 8 位数字，例如 20260827' };
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length !== 8) {
    return { value: '', error: '日期请输入 8 位数字，例如 20260827' };
  }

  const value = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  if (!isValidIsoDate(value)) {
    return { value: '', error: '请输入真实存在的日期' };
  }

  if (min && isValidIsoDate(min) && value < min) {
    return { value: '', error: `日期不能早于 ${min.replace(/-/g, '')}` };
  }

  return { value, error: null };
}
