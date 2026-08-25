import React, { useState, useEffect, useRef } from 'react';
import { QuickDropItem } from '../../types';
import { fetchQuickDrops, deleteQuickDrop } from '../../lib/storage';
import { sanitizeExternalHttpUrl } from '../../lib/urlSafety';
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
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        drawerRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteQuickDrop(id);
      setDrops((prev) => {
        const next = prev.filter((item) => item.id !== id);
        onDropCountChange?.(next.length);
        return next;
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleConvert = (item: QuickDropItem) => {
    onConvertToTopic(item);
    void handleDelete(item.id);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end" role="presentation">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/30 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Drawer Body */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-drop-title"
        tabIndex={-1}
        className="relative w-full max-w-md bg-white dark:bg-stone-900 h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-250 ease-editorial-out transition-colors"
      >
        {/* Header */}
        <div className="p-4 border-b border-stone-200/70 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/90 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h2 id="quick-drop-title" className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <span>手机快投灵感箱</span>
                <span className="text-[10px] font-mono bg-rose-500/10 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-full font-bold">
                  {drops.length}
                </span>
              </h2>
              <p className="text-[11px] text-stone-400 dark:text-stone-500">来自快捷指令与手机分享菜单的碎片线索</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="刷新快投列表"
              onClick={loadDrops}
              disabled={isLoading}
              className="p-2 rounded-xl text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
              title="刷新列表"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              ref={closeButtonRef}
              aria-label="关闭手机快投灵感箱"
              onClick={onClose}
              className="p-2 rounded-xl text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {drops.length === 0 ? (
            <div className="text-center py-16 px-4 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 flex items-center justify-center mx-auto">
                <Inbox className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-stone-700 dark:text-stone-300">快投箱当前为空</h3>
              <p className="text-xs text-stone-400 dark:text-stone-500 max-w-xs mx-auto leading-relaxed">
                在手机上通过 iOS 快捷指令或分享菜单，可以随时随地把刷到的荒诞事件与爆款线索一键投递到这里。
              </p>
            </div>
          ) : (
            drops.map((item) => {
              const safeUrl = sanitizeExternalHttpUrl(item.url);
              return (
              <div
                key={item.id}
                className="p-4 rounded-2xl border border-stone-200/70 dark:border-stone-800 bg-white dark:bg-stone-800/80 hover:shadow-card hover:-translate-y-0.5 transition-all space-y-2.5 shadow-2xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] font-bold text-stone-600 dark:text-stone-300 bg-stone-500/10 px-2 py-0.5 rounded-full">
                    {item.source || '快捷指令'}
                  </span>
                  <span className="text-[10px] font-mono text-stone-400 dark:text-stone-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(item.created_at).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <p className="text-xs text-stone-800 dark:text-stone-200 font-medium leading-relaxed break-words whitespace-pre-wrap">
                  {item.content}
                </p>

                {safeUrl && (
                  <div className="pt-0.5">
                    <a
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 truncate max-w-full font-mono underline"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate">{item.url}</span>
                    </a>
                  </div>
                )}

                <div className="pt-2 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleConvert(item)}
                    className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white transition-all cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>转为收集箱选题</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    disabled={deletingId === item.id}
                    className="p-1.5 rounded-lg text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                    title="忽略/删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-stone-200/70 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/90 text-[11px] text-stone-400 dark:text-stone-500 text-center">
          快投碎片将在 Workers KV 中暂存 7 天，到期后自动销毁。
        </div>
      </div>
    </div>
  );
};
