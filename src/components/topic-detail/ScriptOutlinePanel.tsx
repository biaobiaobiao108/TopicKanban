import React, { useEffect, useLayoutEffect, useRef } from 'react';
import type { OutlineItem, ScriptOutline } from '../../lib/outline';
import { FloatingScrollbar } from '../ui/FloatingScrollbar';

interface ScriptOutlinePanelProps {
  isOpen: boolean;
  outline: ScriptOutline;
  activeItemId: string | null;
  onSelectHeading: (item: OutlineItem) => void;
}

interface OutlineListProps {
  items: OutlineItem[];
  activeItemId: string | null;
  onSelectHeading: (item: OutlineItem) => void;
}

const OutlineList: React.FC<OutlineListProps> = ({
  items,
  activeItemId,
  onSelectHeading,
}) => (
  <ol className="script-outline-list">
    {items.map((item) => {
      const isActive = activeItemId === item.id;
      return (
        <li
          key={item.id}
          className={`script-outline-item script-outline-item--level-${item.level}`}
        >
          <button
            type="button"
            data-outline-id={item.id}
            aria-current={isActive ? 'true' : undefined}
            aria-label={item.title}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelectHeading(item)}
            className="script-outline-item-button"
          >
            <span className="script-outline-item-title">{item.title}</span>
          </button>

        </li>
      );
    })}
  </ol>
);

export const ScriptOutlinePanel: React.FC<ScriptOutlinePanelProps> = ({
  isOpen,
  outline,
  activeItemId,
  onSelectHeading,
}) => {
  const outlineScrollRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const container = outlineScrollRef.current;
    const shell = container?.parentElement;
    if (!isOpen || !container || !shell) return;
    const fitCompleteRows = () => {
      const list = container.querySelector<HTMLOListElement>('.script-outline-list');
      const row = list?.querySelector<HTMLButtonElement>('button');
      if (!list || !row) {
        container.style.height = '100%';
        return;
      }
      const style = getComputedStyle(container);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
      const stride = row.offsetHeight + gap;
      if (stride <= 0) return;
      const rows = Math.max(1, Math.floor((shell.clientHeight - padding + gap) / stride));
      container.style.height = `${Math.min(shell.clientHeight, rows * stride - gap + padding)}px`;
    };
    fitCompleteRows();
    const observer = new ResizeObserver(fitCompleteRows);
    observer.observe(shell);
    return () => {
      observer.disconnect();
      container.style.removeProperty('height');
    };
  }, [isOpen, outline]);

  useEffect(() => {
    if (!isOpen || !activeItemId) return;

    const container = outlineScrollRef.current;
    if (!container) return;

    const activeButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-outline-id]')
    ).find((button) => button.dataset.outlineId === activeItemId);
    if (!activeButton) return;

    const containerRect = container.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();
    const edgePadding = 14;
    const visibleTop = containerRect.top + edgePadding;
    const visibleBottom = containerRect.bottom - edgePadding;
    let delta = 0;
    if (buttonRect.top < visibleTop) delta = buttonRect.top - visibleTop;
    else if (buttonRect.bottom > visibleBottom) delta = buttonRect.bottom - visibleBottom;
    if (delta === 0) return;

    const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTo({ top: Math.min(maxScrollTop, Math.max(0, container.scrollTop + delta)), behavior });
  }, [activeItemId, isOpen, outline]);

  if (!isOpen) return null;

  return (
    <aside
      id="script-outline"
      aria-label="文案大纲"
      className="script-outline-panel"
    >
      <div className="script-outline-scroll-shell relative flex-1 min-h-0 flex flex-col">
        <div
          ref={outlineScrollRef}
          className="script-outline-scroll no-scrollbar flex-1 min-h-0 overflow-y-auto overscroll-contain"
          role="region"
          aria-label="文案标题"
          tabIndex={0}
        >
          {!outline.hasHeadings ? (
            <div className="script-outline-empty">
              <p>在正文使用 H1、H2、H3，即可自动生成层级大纲。</p>
            </div>
          ) : (
            <div className="script-outline-content">
              <OutlineList
                items={outline.flatItems}
                activeItemId={activeItemId}
                onSelectHeading={onSelectHeading}
              />

            </div>
          )}
        </div>
        <FloatingScrollbar scrollTargetRef={outlineScrollRef} enabled={false} style={{ display: 'none' }} />
      </div>
    </aside>
  );
};
