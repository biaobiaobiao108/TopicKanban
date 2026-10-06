import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { createPortal } from 'react-dom';
import { ChevronRight, ClipboardPaste, Copy, ListChecks, Mic, Redo2, Scissors, Undo2 } from 'lucide-react';
import { copyTextToClipboard } from '../../lib/clipboard';

interface ScriptEditorContextMenuProps {
  editor: Editor;
  cues: string[];
  x: number;
  y: number;
  onClose: () => void;
  onInsertCue: (cue: string) => void;
  onClipboardError: (message: string) => void;
}

async function writeSelectionToClipboard(editor: Editor): Promise<boolean> {
  const selection = editor.state.selection;
  if (selection.empty) return false;
  const { dom, text } = editor.view.serializeForClipboard(selection.content());
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  if (clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await clipboard.write([new ClipboardItem({
        'text/html': new Blob([dom.innerHTML], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })]);
      return true;
    } catch {
      // Try a plain-text fallback below for browsers with partial rich clipboard support.
    }
  }
  return copyTextToClipboard(text);
}

async function pasteFromClipboard(editor: Editor): Promise<boolean> {
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  if (!clipboard) return false;

  if (typeof clipboard.read === 'function') {
    const items = await clipboard.read();
    for (const item of items) {
      if (item.types.includes('text/html')) {
        const html = await (await item.getType('text/html')).text();
        if (html) {
          editor.view.pasteHTML(html);
          return true;
        }
      }
      if (item.types.includes('text/plain')) {
        const text = await (await item.getType('text/plain')).text();
        editor.view.pasteText(text);
        return true;
      }
    }
    return true;
  }

  if (typeof clipboard.readText === 'function') {
    editor.view.pasteText(await clipboard.readText());
    return true;
  }

  return false;
}

export const ScriptEditorContextMenu: React.FC<ScriptEditorContextMenuProps> = ({
  editor,
  cues,
  x,
  y,
  onClose,
  onInsertCue,
  onClipboardError,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const cueTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cueMenuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x, y });
  const [showCues, setShowCues] = useState(false);
  const [cueMenuPosition, setCueMenuPosition] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const selectionIsEmpty = editor.state.selection.empty;
  const canUndo = editor.can().undo();
  const canRedo = editor.can().redo();

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    setPosition({
      x: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    });
  }, [x, y, showCues]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const cueMenu = cueMenuRef.current;
    if (!showCues || !menu || !cueMenu) return;

    const menuRect = menu.getBoundingClientRect();
    const width = menuRect.width;
    const height = menuRect.height;
    const gap = 4;
    const opensLeft = menuRect.right + gap + width > window.innerWidth - 8;
    const left = opensLeft ? menuRect.left - width - gap : menuRect.right + gap;
    setCueMenuPosition({ left: Math.max(8, left), top: menuRect.top, width, height });
  }, [position, showCues]);

  useLayoutEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [onClose]);

  const closeAndFocusEditor = () => {
    onClose();
    requestAnimationFrame(() => editor.commands.focus());
  };

  const runClipboardAction = async (action: 'copy' | 'cut' | 'paste') => {
    if (action === 'paste') {
      try {
        const pasted = await pasteFromClipboard(editor);
        if (!pasted) throw new Error('Clipboard API unavailable');
      } catch {
        onClipboardError('浏览器未允许读取剪贴板，请使用系统粘贴快捷键。');
      }
      closeAndFocusEditor();
      return;
    }

    const copied = await writeSelectionToClipboard(editor);
    if (!copied) {
      onClipboardError('无法访问剪贴板，请检查浏览器权限后重试。');
    } else if (action === 'cut') {
      editor.commands.deleteSelection();
    }
    closeAndFocusEditor();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (showCues) setShowCues(false);
      else closeAndFocusEditor();
      return;
    }
    if (event.key === 'ArrowRight' && document.activeElement === cueTriggerRef.current) {
      event.preventDefault();
      setShowCues(true);
      requestAnimationFrame(() => cueMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus());
      return;
    }
    if (event.key === 'ArrowLeft' && cueMenuRef.current?.contains(document.activeElement)) {
      event.preventDefault();
      setShowCues(false);
      cueTriggerRef.current?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || []);
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (currentIndex + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
    items[nextIndex]?.focus();
  };

  const itemClassName = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-[var(--ink)] outline-none transition-colors hover:bg-[var(--accent-soft)] focus-visible:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-40';

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="文案编辑菜单"
      onKeyDown={handleKeyDown}
      className="fixed z-[120] w-56 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1.5 text-[var(--ink)] shadow-modal"
      style={{ left: position.x, top: position.y }}
    >
      <button type="button" role="menuitem" className={itemClassName} disabled={!canUndo} onClick={() => { editor.commands.undo(); closeAndFocusEditor(); }}>
        <Undo2 className="h-4 w-4 text-[var(--ink-muted)]" /><span>撤销</span>
      </button>
      <button type="button" role="menuitem" className={itemClassName} disabled={!canRedo} onClick={() => { editor.commands.redo(); closeAndFocusEditor(); }}>
        <Redo2 className="h-4 w-4 text-[var(--ink-muted)]" /><span>重做</span>
      </button>
      <div role="separator" className="my-1 border-t border-[var(--line)]/70" />
      <button type="button" role="menuitem" className={itemClassName} disabled={selectionIsEmpty} onClick={() => void runClipboardAction('cut')}>
        <Scissors className="h-4 w-4 text-[var(--ink-muted)]" /><span>剪切</span>
      </button>
      <button type="button" role="menuitem" className={itemClassName} disabled={selectionIsEmpty} onClick={() => void runClipboardAction('copy')}>
        <Copy className="h-4 w-4 text-[var(--ink-muted)]" /><span>复制</span>
      </button>
      <button type="button" role="menuitem" className={itemClassName} onClick={() => void runClipboardAction('paste')}>
        <ClipboardPaste className="h-4 w-4 text-[var(--ink-muted)]" /><span>粘贴</span>
      </button>
      <div role="separator" className="my-1 border-t border-[var(--line)]/70" />
      <button type="button" role="menuitem" className={itemClassName} onClick={() => { editor.commands.selectAll(); closeAndFocusEditor(); }}>
        <ListChecks className="h-4 w-4 text-[var(--ink-muted)]" /><span>全选</span>
      </button>
      <div
        className="relative"
        onMouseEnter={() => setShowCues(true)}
        onMouseLeave={() => setShowCues(false)}
      >
        <button
          ref={cueTriggerRef}
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={showCues}
          className={itemClassName}
          onFocus={() => setShowCues(true)}
          onClick={() => setShowCues(true)}
        >
          <Mic className="h-4 w-4 text-[var(--accent)]" /><span>插入气口</span><ChevronRight className="ml-auto h-4 w-4 text-[var(--ink-muted)]" />
        </button>
        {showCues && (
          <>
            <span aria-hidden="true" className="absolute left-full top-0 z-[121] h-full w-1" />
            <div
              ref={cueMenuRef}
              role="menu"
              aria-label="选择气口"
              className="fixed z-[121] overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1.5 text-[var(--ink)] shadow-modal"
              style={cueMenuPosition ? {
                left: cueMenuPosition.left,
                top: cueMenuPosition.top,
                width: cueMenuPosition.width,
                height: cueMenuPosition.height,
              } : { visibility: 'hidden' }}
            >
              {cues.map((cue) => (
                <button
                  type="button"
                  role="menuitem"
                  key={cue}
                  className="flex w-full items-center rounded-lg px-1 py-1 text-left outline-none transition-colors hover:bg-[var(--accent-soft)] focus-visible:bg-[var(--accent-soft)]"
                  onClick={() => { onInsertCue(cue); closeAndFocusEditor(); }}
                >
                  <span className="flex w-full min-w-0 items-start gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-[var(--accent-dark)]">
                    <span aria-hidden="true" className="shrink-0">🎙️</span>
                    <span className="min-w-0 whitespace-normal break-words">{cue}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};
