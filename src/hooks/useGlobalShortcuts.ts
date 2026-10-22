import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { TopicStatus } from '../types';

interface UseGlobalShortcutsOptions {
  isCommandPaletteOpen: boolean;
  isQuickCreateOpen: boolean;
  setIsCommandPaletteOpen: Dispatch<SetStateAction<boolean>>;
  setIsQuickCreateOpen: Dispatch<SetStateAction<boolean>>;
  setQuickCreateStatus: Dispatch<SetStateAction<TopicStatus>>;
}

/** Registers the workspace-wide command palette and quick-create shortcuts. */
export function useGlobalShortcuts({
  isCommandPaletteOpen,
  isQuickCreateOpen,
  setIsCommandPaletteOpen,
  setIsQuickCreateOpen,
  setQuickCreateStatus,
}: UseGlobalShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      const isScriptEditor = target.closest('.script-editor-canvas-container [contenteditable="true"]') !== null;
      const platform = `${navigator.platform} ${navigator.userAgent}`;
      const isMacOS = /Mac|iPhone|iPad|iPod/i.test(platform);
      const isWindows = /Win/i.test(platform);
      const hasCommandPaletteModifier = isMacOS
        ? e.metaKey && !e.ctrlKey && !e.altKey
        : isWindows
          ? e.altKey && !e.metaKey && !e.ctrlKey
          : (e.ctrlKey || e.metaKey) && !e.altKey;

      // Keep the chord available in the script editor while avoiding regular text inputs.
      if (hasCommandPaletteModifier && !e.shiftKey && e.key === '/' && (!isInput || isScriptEditor)) {
        e.preventDefault();
        e.stopPropagation();
        setIsCommandPaletteOpen(prev => !prev);
        return;
      }

      if (isInput) return;

      // Prevent triggering global single-key shortcuts if a modal is already open.
      const hasActiveModal =
        isCommandPaletteOpen || isQuickCreateOpen || Boolean(document.querySelector('.shadow-modal, [role="dialog"]'));

      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !hasActiveModal) {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
        return;
      }

      if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !hasActiveModal) {
        e.preventDefault();
        setQuickCreateStatus('inbox');
        setIsQuickCreateOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommandPaletteOpen, isQuickCreateOpen, setIsCommandPaletteOpen, setIsQuickCreateOpen, setQuickCreateStatus]);
}
