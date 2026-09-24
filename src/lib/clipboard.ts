function copyWithLegacyCommand(text: string): boolean {
  if (typeof document === 'undefined' || !document.body || typeof document.execCommand !== 'function') {
    return false;
  }

  const previousFocus = typeof HTMLElement !== 'undefined' && document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.tabIndex = -1;
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.insetInlineStart = '-9999px';
  textarea.style.opacity = '0';

  let copied = false;
  try {
    document.body.appendChild(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    textarea.remove();
    try {
      previousFocus?.focus({ preventScroll: true });
    } catch {
      // The focused element may have been removed while copying.
    }
  }

  return copied;
}

/** Call from a user-initiated handler so Safari can honor clipboard activation. */
export function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined') {
    try {
      const clipboard = navigator.clipboard;
      if (clipboard && typeof clipboard.writeText === 'function') {
        return clipboard.writeText(text).then(() => true, () => false);
      }
    } catch {
      return Promise.resolve(false);
    }
  }

  // Older or insecure contexts may not expose Async Clipboard. Attempt the
  // synchronous legacy path before returning so the original click activation
  // is still available in Safari.
  return Promise.resolve(copyWithLegacyCommand(text));
}
