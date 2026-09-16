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
  1: 'pl-2',
  2: 'pl-5',
  3: 'pl-8',
};

const LEVEL_TEXT: Record<OutlineItem['level'], string> = {
  1: 'text-[13px] font-bold leading-5',
  2: 'text-xs font-semibold leading-5',
  3: 'text-[11px] font-medium leading-[1.4]',
};

const OutlineProgress: React.FC<{ percentage: number; active?: boolean }> = ({
  percentage,
  active = false,
}) => (
  <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-[var(--line)]">
    <div
      className={`h-full transition-all duration-300 ${
        active ? 'bg-[var(--accent)] shadow-xs' : 'bg-[var(--ink-muted)] opacity-30'
      }`}
      style={{ width: `${percentage}%` }}
    />
  </div>
);

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
            className={`group relative w-full rounded-xl py-2 pr-2.5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer ${
              isActive
                ? 'bg-[var(--accent-soft)] text-[var(--ink)] font-bold shadow-2xs'
                : 'text-[var(--ink)] hover:bg-[var(--canvas)]'
            }`}
          >
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute inset-y-2 left-1 w-1 rounded-full bg-[var(--accent)]"
              />
            )}
            <div className={LEVEL_INDENT[item.level]}>
              <div className="flex items-start gap-2.5">
                <span
                  className={`min-w-0 flex-1 truncate transition-colors ${
                    isActive
                      ? `${LEVEL_TEXT[item.level]} text-[var(--accent-dark)]`
                      : `${LEVEL_TEXT[item.level]} ${
                          item.level === 1
                            ? 'text-[var(--ink)] font-bold'
                            : item.level === 2
                              ? 'text-[var(--ink)]'
                              : 'text-[var(--ink-muted)]'
                        } group-hover:text-[var(--ink)]`
                  }`}
                >
                  {item.title}
                </span>
                <div className="w-12 shrink-0 pt-0.5 text-right">
                  <span
                    className={`block font-mono text-[10px] leading-none tabular-nums ${
                      isActive ? 'font-bold text-[var(--accent)]' : 'text-[var(--ink-muted)]'
                    }`}
                  >
                    {item.percentage}%
                  </span>
                  <span className="block font-mono text-[9px] mt-0.5 leading-none text-[var(--ink-muted)]">
                    {formatOutlineDuration(item.durationSeconds)}
                  </span>
                  <OutlineProgress percentage={item.percentage} active={isActive} />
                </div>
              </div>
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
    <aside className="script-outline-panel absolute left-3 sm:left-4 top-3 sm:top-4 bottom-3 sm:bottom-4 z-30 flex w-72 sm:w-80 flex-col rounded-2xl bg-[var(--surface)] border border-[var(--line)] shadow-card animate-in slide-in-from-left duration-200 overflow-hidden">
      {/* Ambient Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 h-12 px-3.5 border-b border-[var(--line)] bg-[var(--canvas)]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-dark)]">
            <Compass className="h-3.5 w-3.5 shrink-0" />
          </div>
          <h3 className="shrink-0 text-xs font-bold tracking-wide text-[var(--ink)]">叙事大纲</h3>
          {outline.flatItems.length > 0 && (
            <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.2 font-mono text-[10px] font-bold text-[var(--accent-dark)]">
              {outline.flatItems.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="truncate font-mono text-[10px] tabular-nums text-[var(--ink-muted)]">
            {formatOutlineDuration(outline.totalDurationSeconds)}
          </span>
          <button
            type="button"
            aria-label="收起文案大纲"
            onClick={onClose}
            className="p-1 text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)] rounded-lg hover:bg-[var(--line)] cursor-pointer"
            title="收起文案大纲 (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Navigation List */}
      <FloatingScrollbar className="p-3 space-y-2" wrapperClassName="flex-1 min-h-0">
        {!outline.hasHeadings ? (
          <div className="py-8 px-2 text-center space-y-3">
            <div className="mx-auto w-10 h-10 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-dark)] flex items-center justify-center border border-[var(--line)]">
              <Compass className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-[var(--ink)]">尚未识别到章节标题</p>
              <p className="text-[11px] leading-relaxed text-[var(--ink-muted)]">
                在正文使用 H1、H2、H3 即可自动生成层级大纲与时长占比。
              </p>
            </div>

            {onInjectFourActOutline && (
              <button
                type="button"
                onClick={onInjectFourActOutline}
                className="w-full mt-2 flex items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--accent-soft)] px-3 py-2 text-xs font-bold text-[var(--accent-dark)] hover:bg-[var(--accent)] hover:text-white active:scale-98 transition-all cursor-pointer shadow-2xs"
              >
                <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>插入故事结构</span>
              </button>
            )}
          </div>
        ) : (
          <div>
            {outline.leadCharCount > 0 && (
              <div className="py-2 px-2.5 rounded-xl mb-1 bg-[var(--canvas)] border border-[var(--line)]">
                <div className="flex items-start gap-2.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold leading-5 text-[var(--ink-muted)]">
                    导语 / 开篇
                  </span>
                  <div className="w-12 shrink-0 pt-0.5 text-right">
                    <span className="block font-mono text-[10px] leading-none tabular-nums text-[var(--ink-muted)]">
                      {outline.leadPercentage}%
                    </span>
                    <OutlineProgress percentage={outline.leadPercentage} />
                  </div>
                </div>
              </div>
            )}
            <OutlineBranch
              items={outline.items}
              activeItemId={activeItemId}
              onSelectHeading={handleSelectHeading}
            />

            {onInjectFourActOutline && (
              <div className="pt-3 mt-3 border-t border-[var(--line)]">
                <button
                  type="button"
                  onClick={onInjectFourActOutline}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--canvas)] text-[var(--ink-muted)] hover:text-[var(--ink)] px-3 py-1.5 text-[11px] font-medium transition-all cursor-pointer"
                >
                  <Sparkles className="h-3 w-3 text-[var(--accent)]" />
                  <span>追加故事结构</span>
                </button>
              </div>
            )}
          </div>
        )}
      </FloatingScrollbar>
    </aside>
  );
};
