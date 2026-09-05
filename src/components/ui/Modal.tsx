import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'lg',
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const previousOverflowRef = useRef('');
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      const isInsideDialog = target?.closest('[role="dialog"]') || dialogRef.current?.contains(target);
      if (target && !isInsideDialog) {
        lastFocusedElementRef.current = target;
      }
    };
    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);

  const restoreFocus = () => {
    const previousFocus = previousFocusRef.current;
    if (!previousFocus) return;
    requestAnimationFrame(() => {
      if (previousFocus.isConnected) previousFocus.focus();
    });
  };

  const handleClose = () => {
    onCloseRef.current();
    restoreFocus();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        restoreFocus();
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
    if (isOpen) {
      previousFocusRef.current = lastFocusedElementRef.current || (document.activeElement as HTMLElement | null);
      previousOverflowRef.current = document.body.style.overflow;
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        (firstFocusable || dialogRef.current)?.focus();
      });
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (isOpen) {
        document.body.style.overflow = previousOverflowRef.current;
        restoreFocus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="presentation">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm modal-backdrop-modern animate-in fade-in duration-200"
        aria-hidden="true"
        onClick={handleClose}
      />

      {/* Modal Container */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative min-w-0 w-full ${maxWidthClasses[maxWidth]} bg-white dark:bg-stone-900 rounded-2xl shadow-modal border border-stone-200/80 dark:border-stone-800 overflow-hidden flex flex-col max-h-[90dvh] z-10 modal-dialog-modern animate-in fade-in zoom-in-95 duration-200 ease-editorial-out transition-colors`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex min-w-0 items-center justify-between gap-3 px-6 py-4 border-b border-stone-200/70 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/90">
          <h3 id={titleId} className="min-w-0 flex-1 break-words text-lg font-bold text-stone-900 dark:text-stone-100 leading-tight">{title}</h3>
          <button
            type="button"
            aria-label="关闭弹窗"
            onClick={handleClose}
            className="shrink-0 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="min-w-0 p-6 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">{children}</div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
