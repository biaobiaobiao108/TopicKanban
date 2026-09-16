import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FloatingScrollbar } from './FloatingScrollbar';
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const previousOverflowRef = useRef('');
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const restoreFocus = () => {
    const previousFocus = previousFocusRef.current;
    if (!previousFocus) return;
    requestAnimationFrame(() => {
      if (previousFocus.isConnected) previousFocus.focus();
    });
  };

  const handleClose = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
    onCloseRef.current();
  };

  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;
    const dialog = dialogRef.current;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousOverflowRef.current = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = 'hidden';
    const handleTabBoundary = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
      )).filter((element) => !element.closest('[aria-hidden="true"]'));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
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
    dialog.addEventListener('keydown', handleTabBoundary);
    requestAnimationFrame(() => {
      const firstFocusable = dialog.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      (firstFocusable || dialog)?.focus();
    });
    return () => {
      dialog.removeEventListener('keydown', handleTabBoundary);
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflowRef.current;
      restoreFocus();
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
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 m-0 h-[100dvh] max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent p-0 backdrop:bg-transparent"
      onCancel={(event) => {
        event.preventDefault();
        handleClose();
      }}
    >
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="presentation">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm modal-backdrop-modern animate-in fade-in duration-200"
          aria-hidden="true"
          onClick={handleClose}
        />

        {/* Modal Container */}
        <div
          className={`relative min-w-0 w-full ${maxWidthClasses[maxWidth]} bg-[var(--surface)] rounded-[var(--radius-md)] shadow-modal border border-[var(--line)] overflow-hidden flex flex-col max-h-[90dvh] z-10 modal-dialog-modern animate-in fade-in zoom-in-95 duration-200 ease-editorial-out transition-colors`}
          onClick={(event) => event.stopPropagation()}
        >
          {/* Header */}
          <div className="flex min-w-0 items-center justify-between gap-3 px-6 py-4 border-b border-[var(--line)] bg-[var(--surface)]">
            <h3 id={titleId} className="min-w-0 flex-1 break-words text-base font-semibold text-[var(--ink)] leading-snug">{title}</h3>
            <button
              type="button"
              aria-label="关闭弹窗"
              onClick={handleClose}
              className="shrink-0 text-[var(--ink-muted)] hover:text-[var(--ink)] p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--canvas)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content with FloatingScrollbar */}
          <FloatingScrollbar className="min-w-0 p-6 overscroll-contain">
            {children}
          </FloatingScrollbar>
        </div>
      </div>
    </dialog>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
