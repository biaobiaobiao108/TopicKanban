import { afterEach, describe, expect, it } from 'bun:test';
import { copyTextToClipboard } from '../src/lib/clipboard';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

function replaceGlobal(name: 'navigator' | 'document', value: unknown): void {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}

function restoreGlobal(name: 'navigator' | 'document', descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}

afterEach(() => {
  restoreGlobal('navigator', originalNavigator);
  restoreGlobal('document', originalDocument);
});

describe('copyTextToClipboard', () => {
  it('resolves true when the Async Clipboard API succeeds', async () => {
    let copiedText = '';
    replaceGlobal('navigator', {
      clipboard: { writeText: async (text: string) => { copiedText = text; } },
    });

    await expect(copyTextToClipboard('审稿链接')).resolves.toBe(true);
    expect(copiedText).toBe('审稿链接');
  });

  it('resolves false when Safari rejects a clipboard write', async () => {
    replaceGlobal('navigator', {
      clipboard: { writeText: async () => { throw new Error('NotAllowedError'); } },
    });

    await expect(copyTextToClipboard('文案')).resolves.toBe(false);
  });

  it('uses the synchronous copy command when Async Clipboard is unavailable', async () => {
    let copiedText = '';
    let command = '';
    const textarea = {
      value: '',
      readOnly: false,
      tabIndex: 0,
      style: {} as Record<string, string>,
      setAttribute: () => undefined,
      focus: () => undefined,
      select: () => { copiedText = textarea.value; },
      setSelectionRange: () => undefined,
      remove: () => undefined,
    };
    replaceGlobal('navigator', {});
    replaceGlobal('document', {
      body: { appendChild: () => undefined },
      activeElement: null,
      createElement: () => textarea,
      execCommand: (value: string) => {
        command = value;
        return true;
      },
    });

    await expect(copyTextToClipboard('Webhook 地址')).resolves.toBe(true);
    expect(copiedText).toBe('Webhook 地址');
    expect(command).toBe('copy');
  });
});
