import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';

export type FloatingWidthMode = 'trigger' | 'fixed' | 'content';

export interface FloatingPosition {
  left: number;
  top: number;
  minWidth: number;
  width?: number;
  maxHeight: number;
}

interface UseFloatingPositionOptions {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  popoverRef: RefObject<HTMLElement | null>;
  widthMode?: FloatingWidthMode;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  maxHeight?: number;
  align?: 'left' | 'right';
  gap?: number;
  viewportGutter?: number;
}

function positionsEqual(left: FloatingPosition | null, right: FloatingPosition): boolean {
  return Boolean(
    left &&
    left.left === right.left &&
    left.top === right.top &&
    left.minWidth === right.minWidth &&
    left.width === right.width &&
    left.maxHeight === right.maxHeight
  );
}

export function useFloatingPosition({
  open,
  anchorRef,
  popoverRef,
  widthMode = 'trigger',
  width,
  minWidth: requestedMinWidth = 160,
  maxWidth: requestedMaxWidth,
  maxHeight: requestedMaxHeight = 288,
  align = 'left',
  gap = 6,
  viewportGutter = 8,
}: UseFloatingPositionOptions): FloatingPosition | null {
  const [position, setPosition] = useState<FloatingPosition | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor || typeof window === 'undefined') return;

    const rect = anchor.getBoundingClientRect();
    const viewportWidth = window.visualViewport?.width || window.innerWidth;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const availableWidth = Math.max(0, viewportWidth - viewportGutter * 2);
    const maxWidth = Math.min(
      availableWidth,
      requestedMaxWidth ?? Number.POSITIVE_INFINITY,
    );
    const minWidth = Math.min(
      Math.max(requestedMinWidth, rect.width),
      maxWidth,
    );
    const measuredWidth = popoverRef.current?.getBoundingClientRect().width;
    const preferredWidth = widthMode === 'fixed'
      ? width ?? minWidth
      : widthMode === 'content'
        ? measuredWidth || minWidth
        : minWidth;
    const panelWidth = Math.min(Math.max(preferredWidth, minWidth), maxWidth);
    const availableBelow = Math.max(0, viewportHeight - rect.bottom - gap - viewportGutter);
    const availableAbove = Math.max(0, rect.top - gap - viewportGutter);
    const estimatedHeight = popoverRef.current?.scrollHeight
      || popoverRef.current?.getBoundingClientRect().height
      || requestedMaxHeight;
    const shouldOpenAbove = availableAbove > 0 && (
      (availableBelow === 0 && availableAbove > availableBelow)
      || (availableBelow < Math.min(estimatedHeight, 220) && availableAbove > availableBelow)
    );
    const availableHeight = shouldOpenAbove ? availableAbove : availableBelow;
    const maxHeight = availableHeight >= 48
      ? Math.min(requestedMaxHeight, availableHeight)
      : availableHeight;
    const preferredLeft = align === 'right' ? rect.right - panelWidth : rect.left;
    const left = Math.min(
      Math.max(preferredLeft, viewportGutter),
      Math.max(viewportGutter, viewportWidth - panelWidth - viewportGutter),
    );
    const top = shouldOpenAbove
      ? Math.max(viewportGutter, rect.top - gap - maxHeight)
      : rect.bottom + gap;
    const nextPosition: FloatingPosition = {
      left,
      top,
      minWidth,
      width: widthMode === 'content' && !measuredWidth ? undefined : panelWidth,
      maxHeight,
    };

    setPosition((previous) => positionsEqual(previous, nextPosition) ? previous : nextPosition);
  }, [align, anchorRef, gap, popoverRef, requestedMaxHeight, requestedMaxWidth, requestedMinWidth, viewportGutter, width, widthMode]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    let scheduledFrame: number | null = null;
    const schedulePositionUpdate = () => {
      if (scheduledFrame !== null) return;
      scheduledFrame = requestAnimationFrame(() => {
        scheduledFrame = null;
        updatePosition();
      });
    };

    updatePosition();
    const initialFrame = requestAnimationFrame(() => {
      updatePosition();
    });
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(schedulePositionUpdate)
      : null;
    if (resizeObserver) {
      if (anchorRef.current) resizeObserver.observe(anchorRef.current);
      if (position !== null && popoverRef.current) resizeObserver.observe(popoverRef.current);
    }

    window.addEventListener('resize', schedulePositionUpdate);
    window.addEventListener('scroll', schedulePositionUpdate, true);
    window.visualViewport?.addEventListener('resize', schedulePositionUpdate);
    window.visualViewport?.addEventListener('scroll', schedulePositionUpdate);

    return () => {
      cancelAnimationFrame(initialFrame);
      if (scheduledFrame !== null) cancelAnimationFrame(scheduledFrame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', schedulePositionUpdate);
      window.removeEventListener('scroll', schedulePositionUpdate, true);
      window.visualViewport?.removeEventListener('resize', schedulePositionUpdate);
      window.visualViewport?.removeEventListener('scroll', schedulePositionUpdate);
    };
  }, [anchorRef, open, popoverRef, position !== null, updatePosition]);

  return position;
}
