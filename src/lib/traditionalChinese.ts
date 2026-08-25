import OpenCC from 'opencc-js/cn2t';

const convertSimplifiedToTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });

export function toTraditionalChinese(value: string): string {
  return value ? convertSimplifiedToTraditional(value) : '';
}
