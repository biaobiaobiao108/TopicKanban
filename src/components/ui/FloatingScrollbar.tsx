import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

export interface FloatingScrollbarProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  wrapperClassName?: string;
  wrapperStyle?: React.CSSProperties;
  wrapperRef?: React.Ref<HTMLDivElement>;
  autoHideDelay?: number;
  minThumbSize?: number;
}

export const FloatingScrollbar = forwardRef<HTMLDivElement, FloatingScrollbarProps>(
  (
    {
      children,
      className = '',
      wrapperClassName = '',
      wrapperStyle,
      wrapperRef,
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
    const dragStartYRef = useRef(0);
    const dragStartScrollTopRef = useRef(0);

    const showThumb = useCallback(() => {
      setIsVisible(true);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      hideTimerRef.current = setTimeout(() => {
        setIsVisible(false);
      }, autoHideDelay);
    }, [autoHideDelay]);

    const updateScrollMetrics = useCallback(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight <= clientHeight + 2) {
        setIsScrollable(false);
        setThumbHeight(0);
        return;
      }

      setIsScrollable(true);
      const computedThumbHeight = Math.max(
        minThumbSize,
        Math.round((clientHeight / scrollHeight) * clientHeight)
      );
      const maxScrollTop = scrollHeight - clientHeight;
      const maxThumbTop = clientHeight - computedThumbHeight - 4; // 2px top & bottom margin
      const computedThumbTop = 2 + (scrollTop / maxScrollTop) * maxThumbTop;

      setThumbHeight(computedThumbHeight);
      setThumbTop(computedThumbTop);
    }, [minThumbSize]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      updateScrollMetrics();
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

      const observer = new ResizeObserver(() => {
        updateScrollMetrics();
      });

      observer.observe(container);
      if (container.firstElementChild) {
        observer.observe(container.firstElementChild);
      }

      return () => {
        observer.disconnect();
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
        }
      };
    }, [updateScrollMetrics]);

    // Handle thumb dragging
    const handleThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const container = scrollContainerRef.current;
      if (!container) return;

      setIsDragging(true);
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
        className={`relative min-h-0 min-w-0 flex-1 overflow-hidden ${wrapperClassName}`}
        style={wrapperStyle}
        onPointerEnter={() => {
          updateScrollMetrics();
          showThumb();
        }}
      >
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className={`no-scrollbar h-full w-full min-h-0 min-w-0 overflow-y-auto overscroll-contain ${className}`}
          {...props}
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

FloatingScrollbar.displayName = 'FloatingScrollbar';
