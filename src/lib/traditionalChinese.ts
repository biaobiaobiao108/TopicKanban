type ConverterFn = (text: string) => string;
let converterInstance: ConverterFn | null = null;
let converterPromise: Promise<ConverterFn> | null = null;

export async function getTraditionalConverter(): Promise<ConverterFn> {
  if (converterInstance) return converterInstance;
  if (!converterPromise) {
    converterPromise = import('opencc-js/cn2t').then((mod) => {
      const OpenCC = mod.default || mod;
      const converter = OpenCC.Converter({ from: 'cn', to: 'tw' });
      converterInstance = converter;
      return converter;
    });
  }
  return converterPromise;
}

export function toTraditionalChinese(value: string): string {
  if (!value) return '';
  if (converterInstance) {
    return converterInstance(value);
  }
  void getTraditionalConverter();
  return value;
}

export async function toTraditionalChineseAsync(value: string): Promise<string> {
  if (!value) return '';
  const converter = await getTraditionalConverter();
  return converter(value);
}
