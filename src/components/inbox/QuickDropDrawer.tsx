import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { QuickDropItem } from '../../types';
import { fetchQuickDrops, deleteQuickDrop } from '../../lib/storageApi';
import { sanitizeExternalHttpUrl } from '../../lib/urlSafety';
import { normalizeQuickDropUrl } from '../../lib/quickDrop';
import { formatBeijingDateTime } from '../../lib/actionDate';
import { FloatingScrollbar } from '../ui/FloatingScrollbar';
import {
  Inbox,
  X,
  ExternalLink,
  Plus,
  Trash2,
  Clock,
  Sparkles,
  Smartphone,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

interface QuickDropDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onConvertToTopic: (item: QuickDropItem) => void;
  onDropCountChange?: (count: number) => void;
}

export const QuickDropDrawer: React.FC<QuickDropDrawerProps> = ({
  isOpen,
  onClose,
  onConvertToTopic,
  onDropCountChange,
}) => {
  const [drops, setDrops] = useState<QuickDropItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const loadDrops = async () => {
    setIsLoading(true);
    try {
      const items = await fetchQuickDrops();
      setDrops(items);
      onDropCountChange?.(items.length);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadDrops();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        drawerRef.current.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteQuickDrop(id);
      setDrops(prev => {
        const next = prev.filter(item => item.id !== id);
        onDropCountChange?.(next.length);
        return next;
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleConvert = (item: QuickDropItem) => onConvertToTopic(item);

  if (!isOpen) return null;

  const drawerContent = (
    <div className="fixed inset-0 z-50 overflow-hidden" role="presentation">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-overlay backdrop-blur-xs transition-opacity drawer-backdrop-enter"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Drawer Body (展开自最右侧) */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-drop-title"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 w-full max-w-md bg-surface shadow-2xl flex flex-col z-10 drawer-right-enter transition-colors"
      >
        {/* Header */}
        <div className="p-4 border-b border-line bg-surface flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-accent-soft text-accent rounded-xl">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h2 id="quick-drop-title" className="text-sm font-bold text-ink flex items-center gap-2">
                <span>手机快投灵感箱</span>
                <span className="text-3xs font-mono bg-accent-soft text-accent-dark px-2 py-0.5 rounded-full font-bold">
                  {drops.length}
                </span>
              </h2>
              <p className="text-2xs text-ink-muted">来自快捷指令与手机分享菜单的碎片线索</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="刷新快投列表"
              onClick={loadDrops}
              disabled={isLoading}
              className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-control transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              ref={closeButtonRef}
              aria-label="关闭手机快投灵感箱"
              onClick={onClose}
              className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-control transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* List Content */}
        <FloatingScrollbar className="p-4 space-y-3" wrapperClassName="flex-1">
          {drops.length === 0 ? (
            <div className="text-center py-16 px-4 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-control text-ink-muted flex items-center justify-center mx-auto">
                <Inbox className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-ink">快投箱当前为空</h3>
              <p className="text-xs text-ink-muted max-w-xs mx-auto leading-relaxed">
                在手机上通过 iOS 快捷指令或分享菜单，可以随时随地把刷到的荒诞事件与爆款线索一键投递到这里。
              </p>
            </div>
          ) : (
            drops.map(item => {
              const normalizedUrl = normalizeQuickDropUrl(item.url);
              const safeUrl = sanitizeExternalHttpUrl(normalizedUrl);
              const normalizedItem = normalizedUrl === item.url ? item : { ...item, url: normalizedUrl };
              return (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl border border-line bg-surface hover:shadow-card hover:-translate-y-0.5 transition-all space-y-2.5 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-3xs font-bold text-ink-muted bg-control px-2 py-0.5 rounded-full">
                      {item.source || '快捷指令'}
                    </span>
                    <span className="text-3xs font-mono text-ink-muted flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatBeijingDateTime(item.created_at, 'zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <p className="text-xs text-ink font-medium leading-relaxed break-words whitespace-pre-wrap">
                    {item.content}
                  </p>

                  {safeUrl && (
                    <div className="pt-0.5">
                      <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-2xs text-accent hover:text-accent-dark truncate max-w-full font-mono underline"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{normalizedUrl}</span>
                      </a>
                    </div>
                  )}

                  <div className="pt-2 border-t border-line flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleConvert(normalizedItem)}
                      className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-accent hover:bg-accent-dark active:scale-[0.98] text-white transition-all cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>转为收集箱选题</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      className="p-1.5 rounded-lg text-ink-muted hover:text-danger hover:bg-danger-soft transition-colors cursor-pointer"
                      aria-label="删除此灵感"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </FloatingScrollbar>

        {/* Footer info */}
        <div className="p-3 border-t border-line bg-canvas text-2xs text-ink-muted text-center">
          快投碎片将在本地 SQLite 中暂存 7 天，到期后自动销毁。
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(drawerContent, document.body);
  }

  return drawerContent;
};
