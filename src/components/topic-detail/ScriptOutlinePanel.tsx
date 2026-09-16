import React from 'react';
import { ChevronLeft, Compass, Sparkles } from 'lucide-react';
import { formatOutlineDuration, type OutlineItem, type ScriptOutline } from '../../lib/outline';
import { FloatingScrollbar } from '../ui/FloatingScrollbar';

interface ScriptOutlinePanelProps {
  isOpen: boolean;
  outline: ScriptOutline;
  activeItemId: string | null;
  onClose: () => void;
  onSelectHeading: (item: OutlineItem) => void;
  onInjectFourActOutline?: () => void;
}

interface OutlineBranchProps {
  items: OutlineItem[];
  activeItemId: string | null;
  onSelectHeading: (item: OutlineItem) => void;
}

const OutlineBranch: React.FC<OutlineBranchProps> = ({
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
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelectHeading(item)}
            className="script-outline-item-button"
            title={`${item.title} · ${formatOutlineDuration(item.durationSeconds)} · ${item.percentage}%`}
          >
            <span
              className={`script-outline-level-marker script-outline-level-marker--${item.level}`}
              aria-hidden="true"
            />
            <span className="script-outline-item-title">{item.title}</span>
            <span className="script-outline-item-stats" aria-label={`章节占比 ${item.percentage}%`}>
              <span>{formatOutlineDuration(item.durationSeconds)}</span>
              <span aria-hidden="true">·</span>
              <span>{item.percentage}%</span>
            </span>
          </button>

          {item.children.length > 0 && (
            <OutlineBranch
              items={item.children}
              activeItemId={activeItemId}
              onSelectHeading={onSelectHeading}
            />
          )}
        </li>
      );
    })}
  </ol>
);

export const ScriptOutlinePanel: React.FC<ScriptOutlinePanelProps> = ({
  isOpen,
  outline,
  activeItemId,
  onClose,
  onSelectHeading,
  onInjectFourActOutline,
}) => {
  if (!isOpen) return null;

  const handleSelectHeading = (item: OutlineItem) => {
    onSelectHeading(item);
    if (!window.matchMedia('(min-width: 1280px)').matches) onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-20 bg-black/15 dark:bg-black/40 xl:hidden backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        id="script-outline"
        aria-labelledby="script-outline-title"
        className="script-outline-panel absolute inset-y-0 left-0 z-30 flex h-full w-72 flex-col overflow-hidden border-r border-[var(--line)] shadow-xl animate-in slide-in-from-left duration-200 sm:w-80 xl:shadow-none"
      >
        <header className="script-outline-header">
          <div className="script-outline-heading">
            <h2 id="script-outline-title">文案大纲</h2>
            <p>
              {outline.flatItems.length > 0
                ? `${outline.flatItems.length} 个章节 · 预估 ${formatOutlineDuration(outline.totalDurationSeconds)}`
                : '当前文案暂无标题'}
            </p>
          </div>
          <button
            type="button"
            aria-label="收起文案大纲"
            onClick={onClose}
            className="script-outline-back-button"
            title="返回文案编辑器 (Esc)"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span>返回文案</span>
          </button>
        </header>

        <FloatingScrollbar className="script-outline-scroll" wrapperClassName="flex-1 min-h-0">
          {!outline.hasHeadings ? (
            <div className="script-outline-empty">
              <div className="script-outline-empty-mark" aria-hidden="true">
                <Compass className="h-4 w-4" />
              </div>
              <p>在正文使用 H1、H2、H3，即可自动生成层级大纲与时长占比。</p>

              {onInjectFourActOutline && (
                <button
                  type="button"
                  onClick={onInjectFourActOutline}
                  className="script-outline-insert-button"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>插入故事结构</span>
                </button>
              )}
            </div>
          ) : (
            <div className="script-outline-content">
              {outline.leadCharCount > 0 && (
                <div className="script-outline-lead">
                  <span>导语 / 开篇</span>
                  <span className="script-outline-item-stats">
                    <span>{formatOutlineDuration(outline.leadDurationSeconds)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{outline.leadPercentage}%</span>
                  </span>
                </div>
              )}
              <OutlineBranch
                items={outline.items}
                activeItemId={activeItemId}
                onSelectHeading={handleSelectHeading}
              />

              {onInjectFourActOutline && (
                <div className="script-outline-footer">
                  <button
                    type="button"
                    onClick={onInjectFourActOutline}
                    className="script-outline-insert-button"
                  >
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    <span>追加故事结构</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </FloatingScrollbar>
      </aside>
    </>
  );
};
