import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, HelpCircle, Loader2 } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'warning' | 'primary';
  icon?: React.ComponentType<{ className?: string }>;
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = '确定',
  cancelText = '取消',
  tone = 'danger',
  icon: CustomIcon,
  isLoading: externalLoading = false,
}) => {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const previousOverflowRef = useRef('');
  const [internalLoading, setInternalLoading] = useState(false);

  const isLoading = externalLoading || internalLoading;

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusable.length === 0) {
        e.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousOverflowRef.current = document.body.style.overflow;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      const confirmButton = dialogRef.current?.querySelector<HTMLButtonElement>('[data-action="confirm"]');
      (confirmButton || dialogRef.current)?.focus();
    });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflowRef.current;
      previousFocusRef.current?.focus();
    };
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (isLoading) return;
    try {
      const result = onConfirm();
      if (result instanceof Promise) {
        setInternalLoading(true);
        await result;
      }
    } finally {
      setInternalLoading(false);
    }
  };

  const DefaultIcon = tone === 'danger' ? Trash2 : tone === 'warning' ? AlertTriangle : HelpCircle;
  const IconComponent = CustomIcon || DefaultIcon;

  const iconBgClasses = {
    danger: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-900/40',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/40',
    primary: 'bg-stone-500/10 text-stone-700 dark:text-stone-300 border border-stone-200/50 dark:border-stone-800',
  };

  const confirmBtnClasses = {
    danger: 'bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white font-bold shadow-2xs',
    warning: 'bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white font-bold shadow-2xs',
    primary: 'bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 active:scale-[0.98] text-white font-bold shadow-2xs',
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="presentation">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/45 backdrop-blur-sm animate-in fade-in duration-150"
        aria-hidden="true"
        onClick={isLoading ? undefined : onClose}
      />

      {/* Dialog Body */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className="relative min-w-0 w-full max-w-md bg-white dark:bg-stone-900 rounded-2xl shadow-modal border border-stone-200/80 dark:border-stone-800 overflow-hidden flex flex-col z-10 p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 ease-editorial-out"
      >
        <div className="flex items-start gap-3.5">
          <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${iconBgClasses[tone]}`}>
            <IconComponent className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h3 id={titleId} className="text-base font-bold text-stone-900 dark:text-stone-100 leading-snug">
              {title}
            </h3>
            {description && (
              <div id={descId} className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed whitespace-pre-line">
                {description}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone-100 dark:border-stone-800">
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="min-h-9 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200/80 dark:hover:bg-stone-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            data-action="confirm"
            disabled={isLoading}
            onClick={() => void handleConfirm()}
            className={`min-h-9 px-4 py-1.5 rounded-xl text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer ${confirmBtnClasses[tone]}`}
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
