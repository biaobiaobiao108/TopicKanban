import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => number;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

export const ToastProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismissToast = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);
  const showToast = useCallback((options: ToastOptions) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setItems((current) => [...current.slice(-3), { ...options, id }]);
    if (options.duration !== 0) {
      window.setTimeout(() => dismissToast(id), options.duration || 4200);
    }
    return id;
  }, [dismissToast]);
  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-end gap-2 sm:left-auto sm:w-[min(26rem,calc(100vw-2rem))]" aria-live="polite" aria-atomic="false">
        {items.map((item) => {
          const Icon = item.tone === 'error' ? XCircle : item.tone === 'info' ? Info : CheckCircle2;
          const toneClass = item.tone === 'error'
            ? 'border-red-200 bg-red-50 text-red-900'
            : item.tone === 'info'
              ? 'border-stone-200 bg-white text-stone-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900';
          return (
            <div key={item.id} role="status" className={`pointer-events-auto flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-sm shadow-lg backdrop-blur ${toneClass}`}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">{item.message}</span>
              {item.actionLabel && item.onAction && (
                <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold underline underline-offset-2" onClick={() => { void item.onAction?.(); dismissToast(item.id); }}>
                  {item.actionLabel}
                </button>
              )}
              <button type="button" aria-label="关闭通知" className="shrink-0 rounded p-1 opacity-60 hover:opacity-100" onClick={() => dismissToast(item.id)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
