import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

export interface FloatingScrollbarProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  scrollTargetRef?: React.RefObject<HTMLElement | null>;
  orientation?: 'vertical' | 'horizontal';
  controlsId?: string;
  ariaLabel?: string;
  enabled?: boolean;
  className?: string;
  wrapperClassName?: string;
  wrapperStyle?: React.CSSProperties;
  wrapperRef?: React.Ref<HTMLDivElement>;
  autoHideDelay?: number;
  minThumbSize?: number;
}

const WrappedFloatingScrollbar = forwardRef<HTMLDivElement, FloatingScrollbarProps>(
  (
    {
      children,
      className = '',
      wrapperClassName = '',
      wrapperStyle,
      wrapperRef,
      ariaLabel,
      role,
      tabIndex,
      autoHideDelay = 1200,
      minThumbSize = 28,
      onScroll,
      ...props
    },
    ref
  ) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => scrollContainerRef.current as HTMLDivElement);

    const [thumbTop, setThumbTop] = useState(0);
    const [thumbHeight, setThumbHeight] = useState(0);
    const [isScrollable, setIsScrollable] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const metricsFrameRef = useRef<number | null>(null);
    const isVisibleRef = useRef(false);
    const dragStartYRef = useRef(0);
    const dragStartScrollTopRef = useRef(0);

    const showThumb = useCallback(() => {
      if (!isVisibleRef.current) {
        isVisibleRef.current = true;
        setIsVisible(true);
      }
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      hideTimerRef.current = setTimeout(() => {
        isVisibleRef.current = false;
        setIsVisible(false);
      }, autoHideDelay);
    }, [autoHideDelay]);

    const updateScrollMetrics = useCallback(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight <= clientHeight + 2) {
        setIsScrollable((current) => current ? false : current);
        setThumbHeight((current) => current === 0 ? current : 0);
        return;
      }

      setIsScrollable((current) => current ? current : true);
      const computedThumbHeight = Math.max(
        minThumbSize,
        Math.round((clientHeight / scrollHeight) * clientHeight)
      );
      const maxScrollTop = scrollHeight - clientHeight;
      const maxThumbTop = clientHeight - computedThumbHeight - 4; // 2px top & bottom margin
      const computedThumbTop = 2 + (scrollTop / maxScrollTop) * maxThumbTop;

      setThumbHeight((current) => current === computedThumbHeight ? current : computedThumbHeight);
      setThumbTop((current) => Math.abs(current - computedThumbTop) < 0.5 ? current : computedThumbTop);
    }, [minThumbSize]);

    const scheduleScrollMetrics = useCallback(() => {
      if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        updateScrollMetrics();
        return;
      }
      if (metricsFrameRef.current !== null) return;
      metricsFrameRef.current = window.requestAnimationFrame(() => {
        metricsFrameRef.current = null;
        updateScrollMetrics();
      });
    }, [updateScrollMetrics]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      scheduleScrollMetrics();
      showThumb();
      if (onScroll) {
        onScroll(e);
      }
    };

    // ResizeObserver to detect layout / content changes
    useEffect(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      updateScrollMetrics();

      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
        scheduleScrollMetrics();
      });

      if (observer) {
        observer.observe(container);
        if (container.firstElementChild) {
          observer.observe(container.firstElementChild);
        }
      }

      return () => {
        observer?.disconnect();
        if (metricsFrameRef.current !== null && typeof window !== 'undefined') {
          window.cancelAnimationFrame(metricsFrameRef.current);
          metricsFrameRef.current = null;
        }
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
      };
    }, [scheduleScrollMetrics, updateScrollMetrics]);

    // Handle thumb dragging
    const handleThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const container = scrollContainerRef.current;
      if (!container) return;

      setIsDragging(true);
      isVisibleRef.current = true;
      setIsVisible(true);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }

      dragStartYRef.current = e.clientY;
      dragStartScrollTopRef.current = container.scrollTop;

      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaY = moveEvent.clientY - dragStartYRef.current;
        const { scrollHeight, clientHeight } = container;
        const maxScrollTop = scrollHeight - clientHeight;
        const maxThumbTop = clientHeight - thumbHeight - 4;

        if (maxThumbTop > 0) {
          const scrollDelta = (deltaY / maxThumbTop) * maxScrollTop;
          container.scrollTop = dragStartScrollTopRef.current + scrollDelta;
        }
      };

      const handlePointerUp = (upEvent: PointerEvent) => {
        target.removeEventListener('pointermove', handlePointerMove);
        target.removeEventListener('pointerup', handlePointerUp);
        try {
          target.releasePointerCapture(upEvent.pointerId);
        } catch {
          // ignore
        }
        setIsDragging(false);
        showThumb();
      };

      target.addEventListener('pointermove', handlePointerMove);
      target.addEventListener('pointerup', handlePointerUp);
    };

    return (
      <div
        ref={wrapperRef}
        className={`relative min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden ${wrapperClassName}`}
        style={wrapperStyle}
        onPointerEnter={() => {
          scheduleScrollMetrics();
          showThumb();
        }}
      >
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className={`no-scrollbar w-full min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain ${className}`}
          {...props}
          role={role ?? 'region'}
          tabIndex={tabIndex ?? 0}
          aria-label={props['aria-label'] ?? ariaLabel ?? '可滚动内容'}
        >
          {children}
        </div>

        {isScrollable && (
          <div
            data-testid="floating-scrollbar-track"
            className="pointer-events-none absolute right-0.5 top-0 bottom-0 z-30 w-2 select-none"
            aria-hidden="true"
          >
            <div
              data-testid="floating-scrollbar-thumb"
              onPointerDown={handleThumbPointerDown}
              style={{
                height: `${thumbHeight}px`,
                transform: `translate3d(0, ${thumbTop}px, 0)`,
                opacity: isVisible || isDragging ? (isDragging ? 0.65 : 0.4) : 0,
              }}
              className="pointer-events-auto absolute right-0.5 w-1 rounded-full bg-[var(--ink)] transition-opacity duration-200 hover:w-1.5 hover:!opacity-65 cursor-pointer"
            />
          </div>
        )}
      </div>
    );
  }
);

WrappedFloatingScrollbar.displayName = 'WrappedFloatingScrollbar';

function TargetFloatingScrollbar({
  scrollTargetRef,
  orientation = 'vertical',
  controlsId,
  ariaLabel = '滚动条',
  enabled = true,
  className = '',
  minThumbSize = 28,
  autoHideDelay = 1200,
  style,
  ...props
}: FloatingScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameRef = useRef<number | null>(null);
  const dragRef = useRef<{ pointerId: number; startCoordinate: number; startOffset: number } | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [metrics, setMetrics] = useState({ scrollable: false, thumbExtent: 0, thumbOffset: 0, maxScroll: 0, scrollOffset: 0 });

  const updateMetrics = useCallback(() => {
    const target = scrollTargetRef?.current;
    const track = trackRef.current;
    if (!target || !track) return;
    const horizontal = orientation === 'horizontal';
    const contentExtent = horizontal ? target.scrollWidth : target.scrollHeight;
    const viewportExtent = horizontal ? target.clientWidth : target.clientHeight;
    const scrollOffset = horizontal ? target.scrollLeft : target.scrollTop;
    const maxScroll = Math.max(0, contentExtent - viewportExtent);
    const trackExtent = horizontal ? track.clientWidth : track.clientHeight;
    // Keep the thumb mounted while the layout is measuring a newly mounted track.
    // ResizeObserver will populate its extent once the track has a rendered size.
    const scrollable = enabled && maxScroll > 1;
    const thumbExtent = scrollable && contentExtent > 0
      ? Math.min(trackExtent, Math.max(minThumbSize, Math.round(trackExtent * viewportExtent / contentExtent)))
      : 0;
    const maxThumbOffset = Math.max(0, trackExtent - thumbExtent);
    const boundedOffset = Math.min(maxScroll, Math.max(0, scrollOffset));
    const thumbOffset = maxScroll > 0 && maxThumbOffset > 0 ? boundedOffset / maxScroll * maxThumbOffset : 0;
    const next = { scrollable, thumbExtent, thumbOffset, maxScroll: Math.round(maxScroll), scrollOffset: Math.round(boundedOffset) };
    setMetrics((current) => current.scrollable === next.scrollable &&
      current.thumbExtent === next.thumbExtent &&
      Math.abs(current.thumbOffset - next.thumbOffset) < 0.5 &&
      current.maxScroll === next.maxScroll &&
      current.scrollOffset === next.scrollOffset ? current : next);
  }, [enabled, minThumbSize, orientation, scrollTargetRef]);

  const scheduleMetrics = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updateMetrics();
    });
  }, [updateMetrics]);

  const reveal = useCallback(() => {
    setIsVisible(true);
    if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      if (!dragRef.current && document.activeElement !== trackRef.current?.querySelector('button')) setIsVisible(false);
    }, autoHideDelay);
  }, [autoHideDelay]);

  useEffect(() => {
    const target = scrollTargetRef?.current;
    const track = trackRef.current;
    if (!target || !track) return;
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMetrics);
    resizeObserver?.observe(target);
    resizeObserver?.observe(track);
    if (target.firstElementChild) resizeObserver?.observe(target.firstElementChild);
    const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(scheduleMetrics);
    mutationObserver?.observe(target, { childList: true, subtree: true, characterData: true });
    const showOnActivity = () => { scheduleMetrics(); reveal(); };
    target.addEventListener('scroll', showOnActivity, { passive: true });
    target.addEventListener('pointerenter', showOnActivity);
    target.addEventListener('pointermove', showOnActivity);
    target.addEventListener('wheel', showOnActivity, { passive: true });
    window.addEventListener('resize', scheduleMetrics);
    scheduleMetrics();
    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      target.removeEventListener('scroll', showOnActivity);
      target.removeEventListener('pointerenter', showOnActivity);
      target.removeEventListener('pointermove', showOnActivity);
      target.removeEventListener('wheel', showOnActivity);
      window.removeEventListener('resize', scheduleMetrics);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
    };
  }, [reveal, scheduleMetrics, scrollTargetRef]);

  useEffect(() => {
    if (enabled) {
      scheduleMetrics();
      return;
    }
    setIsVisible(false);
    setIsDragging(false);
    dragRef.current = null;
  }, [enabled, scheduleMetrics]);

  useEffect(() => () => {
    if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    const target = scrollTargetRef?.current;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const horizontal = orientation === 'horizontal';
    dragRef.current = {
      pointerId: event.pointerId,
      startCoordinate: horizontal ? event.clientX : event.clientY,
      startOffset: horizontal ? target.scrollLeft : target.scrollTop,
    };
    setIsDragging(true);
    reveal();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const target = scrollTargetRef?.current;
    const track = trackRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !target || !track) return;
    event.preventDefault();
    event.stopPropagation();
    const horizontal = orientation === 'horizontal';
    const coordinate = horizontal ? event.clientX : event.clientY;
    const trackExtent = horizontal ? track.clientWidth : track.clientHeight;
    const thumbExtent = metrics.thumbExtent;
    const maxScroll = horizontal ? Math.max(0, target.scrollWidth - target.clientWidth) : Math.max(0, target.scrollHeight - target.clientHeight);
    const maxThumbOffset = Math.max(0, trackExtent - thumbExtent);
    if (maxScroll > 0 && maxThumbOffset > 0) {
      const offset = Math.min(maxScroll, Math.max(0, drag.startOffset + (coordinate - drag.startCoordinate) / maxThumbOffset * maxScroll));
      if (horizontal) target.scrollLeft = offset;
      else target.scrollTop = offset;
      scheduleMetrics();
    }
    reveal();
  };

  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setIsDragging(false);
    reveal();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const target = scrollTargetRef?.current;
    if (!target) return;
    const horizontal = orientation === 'horizontal';
    const maxScroll = horizontal ? Math.max(0, target.scrollWidth - target.clientWidth) : Math.max(0, target.scrollHeight - target.clientHeight);
    const currentOffset = horizontal ? target.scrollLeft : target.scrollTop;
    let nextOffset: number | undefined;
    if (horizontal && event.key === 'ArrowLeft') nextOffset = currentOffset - 48;
    if (horizontal && event.key === 'ArrowRight') nextOffset = currentOffset + 48;
    if (!horizontal && event.key === 'ArrowUp') nextOffset = currentOffset - 48;
    if (!horizontal && event.key === 'ArrowDown') nextOffset = currentOffset + 48;
    if (!horizontal && event.key === 'PageUp') nextOffset = currentOffset - target.clientHeight * 0.85;
    if (!horizontal && event.key === 'PageDown') nextOffset = currentOffset + target.clientHeight * 0.85;
    if (event.key === 'Home') nextOffset = 0;
    if (event.key === 'End') nextOffset = maxScroll;
    if (nextOffset === undefined) return;
    event.preventDefault();
    if (horizontal) target.scrollLeft = Math.min(maxScroll, Math.max(0, nextOffset));
    else target.scrollTop = Math.min(maxScroll, Math.max(0, nextOffset));
    scheduleMetrics();
    reveal();
  };

  const active = enabled && metrics.scrollable;
  const horizontal = orientation === 'horizontal';
  const thumbStyle = horizontal
    ? { insetInlineStart: `${metrics.thumbOffset}px`, width: `${metrics.thumbExtent}px` }
    : { top: `${metrics.thumbOffset}px`, height: `${metrics.thumbExtent}px` };
  return <div
    ref={trackRef}
    className={`floating-scrollbar-control floating-scrollbar-control--${orientation} ${isVisible || isDragging ? 'is-visible' : ''} ${className}`}
    style={style}
    aria-hidden={!active}
    onPointerEnter={reveal}
    onPointerLeave={() => {
      if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        if (!dragRef.current && document.activeElement !== trackRef.current?.querySelector('button')) setIsVisible(false);
      }, autoHideDelay);
    }}
    {...props}
  >
    <div className="floating-scrollbar-control-track" aria-hidden="true" />
    {active && <button
      className={`floating-scrollbar-control-thumb ${isDragging ? 'is-dragging' : ''}`}
      type="button"
      role="scrollbar"
      aria-label={ariaLabel}
      aria-controls={controlsId || scrollTargetRef?.current?.id}
      aria-orientation={orientation}
      aria-valuemin={0}
      aria-valuemax={metrics.maxScroll}
      aria-valuenow={metrics.scrollOffset}
      style={thumbStyle}
      onFocus={reveal}
      onBlur={reveal}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onKeyDown={handleKeyDown}
    />}
  </div>;
}

export const FloatingScrollbar = forwardRef<HTMLDivElement, FloatingScrollbarProps>((props, ref) => {
  if (props.scrollTargetRef) return <TargetFloatingScrollbar {...props} />;
  return <WrappedFloatingScrollbar {...props} ref={ref} />;
});

FloatingScrollbar.displayName = 'FloatingScrollbar';
