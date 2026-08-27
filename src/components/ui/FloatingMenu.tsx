import React, { useEffect, useId, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useFloatingPosition, type FloatingWidthMode } from '../../hooks/useFloatingPosition';

interface FloatingMenuProps {
  isOpen: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
  widthMode?: FloatingWidthMode;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  maxHeight?: number;
  align?: 'left' | 'right';
  className?: string;
  ariaLabel?: string;
  id?: string;
}

export const FloatingMenu: React.FC<FloatingMenuProps> = ({
  isOpen,
  anchorRef,
  onClose,
  children,
  widthMode = 'fixed',
  width,
  minWidth,
  maxWidth,
  maxHeight,
  align,
  className = '',
  ariaLabel,
  id,
}) => {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const position = useFloatingPosition({
    open: isOpen,
    anchorRef,
    popoverRef,
    widthMode,
    width,
    minWidth,
    maxWidth,
    maxHeight,
    align,
  });

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (anchorRef.current?.contains(target) || popoverRef.current?.contains(target))) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
      requestAnimationFrame(() => anchorRef.current?.focus());
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchorRef, isOpen, onClose]);

  if (!isOpen || !position || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={popoverRef}
      id={id || menuId}
      aria-label={ariaLabel}
      className={`fixed z-[100] min-w-0 max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border border-stone-200/80 bg-white/95 shadow-modal backdrop-blur-md dark:border-stone-800 dark:bg-stone-900/95 ${className}`}
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
        minWidth: `${position.minWidth}px`,
        ...(position.width ? { width: `${position.width}px` } : {}),
        maxWidth: 'calc(100vw - 1rem)',
        maxHeight: `${position.maxHeight}px`,
      }}
    >
      {children}
    </div>,
    document.body,
  );
};
