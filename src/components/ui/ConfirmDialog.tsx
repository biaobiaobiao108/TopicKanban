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
  const onCloseRef = useRef(onClose);
  const [internalLoading, setInternalLoading] = useState(false);

  const isLoading = externalLoading || internalLoading;
  const isLoadingRef = useRef(isLoading);
  onCloseRef.current = onClose;
  isLoadingRef.current = isLoading;

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoadingRef.current) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        onCloseRef.current();
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
    document.addEventListener('keydown', handleKeyDown, true);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      const confirmButton = dialogRef.current?.querySelector<HTMLButtonElement>('[data-action="confirm"]');
      (confirmButton || dialogRef.current)?.focus();
    });

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflowRef.current;
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

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
    danger: 'bg-[var(--h1-color)]/10 text-[var(--h1-color)] border border-[var(--h1-color)]/20',
    warning: 'bg-[#966b1a]/10 text-[#966b1a] dark:text-[#d4a373] border border-[#966b1a]/20',
    primary: 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/20',
  };

  const confirmBtnClasses = {
    danger: 'bg-[var(--h1-color)] hover:opacity-90 text-white font-medium shadow-2xs',
    warning: 'bg-[#966b1a] hover:opacity-90 text-white font-medium shadow-2xs',
    primary: 'bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white font-medium shadow-2xs',
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="presentation">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm modal-backdrop-modern animate-in fade-in duration-150"
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
        className="relative min-w-0 w-full max-w-md bg-[var(--surface)] rounded-[var(--radius-md)] shadow-modal border border-[var(--line)] overflow-hidden flex flex-col z-10 p-5 sm:p-6 space-y-4 modal-dialog-modern animate-in fade-in zoom-in-95 duration-150 ease-editorial-out"
      >
        <div className="flex items-start gap-3.5">
          <div className={`shrink-0 w-10 h-10 rounded-[var(--radius-sm)] flex items-center justify-center ${iconBgClasses[tone]}`}>
            <IconComponent className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h3 id={titleId} className="text-base font-semibold text-[var(--ink)] leading-snug">
              {title}
            </h3>
            {description && (
              <div id={descId} className="text-xs sm:text-sm text-[var(--ink-muted)] leading-relaxed whitespace-pre-line">
                {description}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--line)]">
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="min-h-9 px-3.5 py-1.5 rounded-[var(--radius-sm)] text-xs sm:text-sm font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] bg-[var(--surface)] hover:bg-[var(--canvas)] border border-[var(--line)] transition-colors disabled:opacity-50 cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            data-action="confirm"
            disabled={isLoading}
            onClick={() => void handleConfirm()}
            className={`min-h-9 px-4 py-1.5 rounded-[var(--radius-sm)] text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer ${confirmBtnClasses[tone]}`}
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
