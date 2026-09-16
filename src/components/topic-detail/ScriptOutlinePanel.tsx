import React from 'react';
import { Compass, Sparkles, X } from 'lucide-react';
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

const LEVEL_INDENT: Record<OutlineItem['level'], string> = {
  1: 'pl-1.5',
  2: 'pl-4',
  3: 'pl-7',
};

const LEVEL_TEXT: Record<OutlineItem['level'], string> = {
  1: 'text-[13px] font-semibold leading-5',
  2: 'text-xs font-medium leading-5',
  3: 'text-[11px] leading-[1.4]',
};

const OutlineBranch: React.FC<OutlineBranchProps> = ({
  items,
  activeItemId,
  onSelectHeading,
}) => (
  <div className="space-y-0.5">
    {items.map((item) => {
      const isActive = activeItemId === item.id;
      return (
        <React.Fragment key={item.id}>
          <button
            type="button"
            aria-current={isActive ? 'location' : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelectHeading(item)}
            className={`group w-full rounded-lg px-2.5 py-1.5 text-left transition-all duration-150 focus-visible:outline-none cursor-pointer flex items-baseline justify-between gap-2.5 ${
              isActive
                ? 'bg-[var(--accent)]/10 text-[var(--accent-dark)] font-semibold'
                : 'text-stone-700 dark:text-stone-300 hover:text-[var(--ink)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
            }`}
          >
            <div className={`min-w-0 flex-1 truncate ${LEVEL_INDENT[item.level]}`}>
              <span
                className={`truncate transition-colors ${LEVEL_TEXT[item.level]} ${
                  isActive
                    ? 'text-[var(--accent-dark)]'
                    : item.level === 1
                      ? 'text-stone-900 dark:text-stone-100'
                      : item.level === 2
                        ? 'text-stone-800 dark:text-stone-200'
                        : 'text-stone-600 dark:text-stone-400'
                }`}
              >
                {item.title}
              </span>
            </div>
            <div className="shrink-0 flex items-center gap-1.5 text-right">
              <span
                className={`font-mono text-[10px] tabular-nums ${
                  isActive ? 'text-[var(--accent)] font-medium' : 'text-stone-400 dark:text-stone-500'
                }`}
              >
                {formatOutlineDuration(item.durationSeconds)}
              </span>
              <span
                className={`font-mono text-[10px] tabular-nums ${
                  isActive ? 'text-[var(--accent)] font-semibold' : 'text-stone-400/80 dark:text-stone-500/80'
                }`}
              >
                {item.percentage}%
              </span>
            </div>
          </button>

          {item.children.length > 0 && (
            <OutlineBranch
              items={item.children}
              activeItemId={activeItemId}
              onSelectHeading={onSelectHeading}
            />
          )}
        </React.Fragment>
      );
    })}
  </div>
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
      {/* Mobile/Tablet Backdrop for light-dismiss */}
      <div
        className="fixed inset-0 z-20 bg-black/15 dark:bg-black/40 xl:hidden backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="script-outline-panel absolute left-0 top-0 bottom-0 h-full z-30 flex w-72 sm:w-80 flex-col border-r border-[var(--line)] bg-[var(--canvas)] shadow-xl xl:shadow-none animate-in slide-in-from-left duration-200 overflow-hidden">
        {/* Top Utility Strip (Clean & unbordered) */}
        <div className="flex shrink-0 items-center justify-between px-3.5 pt-3 pb-1.5 bg-[var(--canvas)]">
          <span className="font-mono text-[11px] text-stone-400 dark:text-stone-500 tabular-nums">
            预估 {formatOutlineDuration(outline.totalDurationSeconds)}
            {outline.flatItems.length > 0 && ` · ${outline.flatItems.length} 章节`}
          </span>
          <button
            type="button"
            aria-label="收起文案大纲"
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-[var(--ink)] rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"
            title="收起文案大纲 (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Navigation List */}
        <FloatingScrollbar className="px-3 py-2 space-y-2" wrapperClassName="flex-1 min-h-0">
          {!outline.hasHeadings ? (
            <div className="py-10 px-3 text-center space-y-3">
              <div className="mx-auto w-9 h-9 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] text-[var(--accent)] flex items-center justify-center">
                <Compass className="h-4.5 w-4.5" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-[var(--ink)]">尚未识别到章节标题</p>
                <p className="text-[11px] leading-relaxed text-stone-400 dark:text-stone-500">
                  在正文使用 H1、H2、H3 即可自动生成层级大纲与时长占比。
                </p>
              </div>

              {onInjectFourActOutline && (
                <button
                  type="button"
                  onClick={onInjectFourActOutline}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-stone-100/80 dark:bg-stone-800/80 hover:bg-[var(--accent)] hover:text-white px-3 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 transition-all cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>插入故事结构</span>
                </button>
              )}
            </div>
          ) : (
            <div>
              {outline.leadCharCount > 0 && (
                <div className="px-2.5 py-1.5 mb-1 rounded-lg flex items-baseline justify-between text-stone-500 dark:text-stone-400">
                  <span className="text-xs font-medium text-stone-600 dark:text-stone-400">
                    导语 / 开篇
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-stone-400 dark:text-stone-500">
                    {outline.leadPercentage}%
                  </span>
                </div>
              )}
              <OutlineBranch
                items={outline.items}
                activeItemId={activeItemId}
                onSelectHeading={handleSelectHeading}
              />

              {onInjectFourActOutline && (
                <div className="pt-3 mt-2">
                  <button
                    type="button"
                    onClick={onInjectFourActOutline}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-stone-100/70 dark:bg-stone-800/60 hover:bg-[var(--accent)] hover:text-white text-stone-600 dark:text-stone-300 px-3 py-2 text-[11px] font-medium transition-all cursor-pointer"
                  >
                    <Sparkles className="h-3 w-3" />
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
