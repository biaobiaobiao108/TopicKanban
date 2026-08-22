/**
 * 中文字符数与解说时长高精度换算工具
 * 适用场景：视频解说文案字数统计、语速估算、大纲篇幅占比换算
 */

/**
 * 统计文案有效字符数（去除多余空白字符）
 */
export function countValidCharacters(text: string): number {
  if (!text) return 0;
  return text.replace(/\s+/g, '').length;
}

/**
 * 计算预估解说时长（分钟与秒数）
 * @param charCount 有效字符数
 * @param readingSpeed 朗读语速（字/分钟，默认 280）
 */
export function calculateEstimatedDuration(
  charCount: number,
  readingSpeed = 280
): {
  minutes: number;
  seconds: number;
  totalSeconds: number;
  formatted: string;
} {
  const speed = readingSpeed > 0 ? readingSpeed : 280;
  const rawMinutes = charCount / speed;
  const minutes = Math.floor(rawMinutes);
  const seconds = Math.round((rawMinutes - minutes) * 60);
  const totalSeconds = Math.round(rawMinutes * 60);

  let formatted = '';
  if (minutes === 0 && seconds === 0) {
    formatted = '0秒';
  } else if (minutes === 0) {
    formatted = `${seconds}秒`;
  } else if (seconds === 0) {
    formatted = `${minutes}分钟`;
  } else {
    formatted = `${minutes}分${seconds}秒`;
  }

  return {
    minutes,
    seconds,
    totalSeconds,
    formatted,
  };
}
