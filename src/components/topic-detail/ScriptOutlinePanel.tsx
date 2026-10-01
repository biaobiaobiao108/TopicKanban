import React, { useEffect, useRef } from 'react';
import { ListTree } from 'lucide-react';
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
    const edgePadding = 8;
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
      aria-labelledby="script-outline-title"
      className="script-outline-panel"
    >
      <header className="script-outline-header">
        <div className="script-outline-title-row">
          <ListTree className="script-outline-title-icon" aria-hidden="true" />
          <h2 id="script-outline-title">文案大纲</h2>
          {outline.flatItems.length > 0 && (
            <span className="script-outline-count">{outline.flatItems.length}</span>
          )}
        </div>
      </header>

      <FloatingScrollbar
        ref={outlineScrollRef}
        className="script-outline-scroll"
        wrapperClassName="flex-1 min-h-0"
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
      </FloatingScrollbar>
    </aside>
  );
};
