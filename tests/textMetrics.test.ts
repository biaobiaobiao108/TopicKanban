import { describe, it, expect } from 'bun:test';
import { countValidCharacters, calculateEstimatedDuration } from '../src/lib/textMetrics';

describe('textMetrics utility', () => {
  it('should count valid characters correctly by trimming whitespaces and newlines', () => {
    const text = '  这是 一个 包含 空格 和\n换行的 测试 文本。 ';
    expect(countValidCharacters(text)).toBe(17);
    expect(countValidCharacters('')).toBe(0);
  });

  it('should calculate estimated duration with default reading speed (280 chars/min)', () => {
    // 280 characters should be exactly 1 minute
    const result1 = calculateEstimatedDuration(280, 280);
    expect(result1.minutes).toBe(1);
    expect(result1.seconds).toBe(0);
    expect(result1.formatted).toBe('1分钟');

    // 420 characters at 280 chars/min = 1.5 minutes = 1 min 30 sec
    const result2 = calculateEstimatedDuration(420, 280);
    expect(result2.minutes).toBe(1);
    expect(result2.seconds).toBe(30);
    expect(result2.formatted).toBe('1分30秒');

    // 0 characters
    const result3 = calculateEstimatedDuration(0, 280);
    expect(result3.minutes).toBe(0);
    expect(result3.seconds).toBe(0);
    expect(result3.formatted).toBe('0秒');
  });

  it('should support custom reading speeds', () => {
    // 320 characters at 320 chars/min
    const fastResult = calculateEstimatedDuration(320, 320);
    expect(fastResult.formatted).toBe('1分钟');

    // 120 characters at 240 chars/min = 30 seconds
    const slowResult = calculateEstimatedDuration(120, 240);
    expect(slowResult.minutes).toBe(0);
    expect(slowResult.seconds).toBe(30);
    expect(slowResult.formatted).toBe('30秒');
  });
});
