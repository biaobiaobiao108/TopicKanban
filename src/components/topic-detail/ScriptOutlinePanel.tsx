import React from 'react';
import { ListOrdered, X } from 'lucide-react';
import { formatOutlineDuration, type OutlineItem, type ScriptOutline } from '../../lib/outline';

interface ScriptOutlinePanelProps {
  isOpen: boolean;
  outline: ScriptOutline;
  activeItemId: string | null;
  onClose: () => void;
  onSelectHeading: (item: OutlineItem) => void;
}

interface OutlineBranchProps {
  items: OutlineItem[];
  activeItemId: string | null;
  onSelectHeading: (item: OutlineItem) => void;
}

const LEVEL_INDENT: Record<OutlineItem['level'], string> = {
  1: 'pl-2',
  2: 'pl-6',
  3: 'pl-10',
};

const LEVEL_TEXT: Record<OutlineItem['level'], string> = {
  1: 'text-sm font-bold leading-5',
  2: 'text-[13px] font-semibold leading-5',
  3: 'text-xs font-medium leading-[1.5]',
};

const OutlineProgress: React.FC<{ percentage: number; active?: boolean }> = ({
  percentage,
  active = false,
}) => (
  <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-stone-200/90 dark:bg-stone-800">
    <div
      className={`h-full transition-[width,background-color] duration-200 ${
        active ? 'bg-rose-500' : 'bg-stone-400/70 dark:bg-stone-600'
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
  <>
    {items.map((item) => {
      const isActive = activeItemId === item.id;
      return (
        <React.Fragment key={item.id}>
          <button
            type="button"
            aria-current={isActive ? 'location' : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelectHeading(item)}
            className={`group relative w-full rounded-lg py-2.5 pr-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-400/70 xl:py-2 cursor-pointer ${
              isActive ? 'bg-rose-500/10 dark:bg-rose-500/15' : 'hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-rose-500"
              />
            )}
            <div className={LEVEL_INDENT[item.level]}>
              <div className="flex items-start gap-3">
                <span
                  className={`min-w-0 flex-1 truncate transition-colors ${
                    isActive
                      ? `${LEVEL_TEXT[item.level]} text-rose-700 dark:text-rose-400`
                      : `${LEVEL_TEXT[item.level]} ${
                          item.level === 1
                            ? 'text-stone-800 dark:text-stone-100'
                            : item.level === 2
                              ? 'text-stone-700 dark:text-stone-300'
                              : 'text-stone-500 dark:text-stone-400'
                        } group-hover:text-stone-950 dark:group-hover:text-white`
                  }`}
                >
                  {item.title}
                </span>
                <span className="w-12 shrink-0 pt-0.5 text-right">
                  <span
                    className={`block font-mono text-[11px] leading-none tabular-nums ${
                      isActive ? 'font-bold text-rose-600 dark:text-rose-400' : 'text-stone-400 dark:text-stone-500'
                    }`}
                  >
                    {item.percentage}%
                  </span>
                  <OutlineProgress percentage={item.percentage} active={isActive} />
                </span>
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
  </>
);

export const ScriptOutlinePanel: React.FC<ScriptOutlinePanelProps> = ({
  isOpen,
  outline,
  activeItemId,
  onClose,
  onSelectHeading,
}) => {
  if (!isOpen) return null;

  const handleSelectHeading = (item: OutlineItem) => {
    onSelectHeading(item);
    if (!window.matchMedia('(min-width: 1280px)').matches) onClose();
  };

  return (
    <aside className="script-outline-panel fixed inset-0 z-50 flex h-[100dvh] w-full flex-col bg-white/95 dark:bg-stone-900/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] animate-in fade-in duration-150 xl:absolute xl:inset-y-0 xl:left-0 xl:z-40 xl:h-full xl:w-[280px] xl:bg-transparent xl:bg-[linear-gradient(to_right,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.85)_75%,transparent_100%)] xl:dark:bg-[linear-gradient(to_right,rgba(12,10,9,0.96)_0%,rgba(12,10,9,0.85)_75%,transparent_100%)] xl:pb-0 xl:pt-0 min-[1600px]:w-80">
      <div className="flex shrink-0 items-center gap-2 px-4 pt-5 pb-3 xl:pr-9">
        <ListOrdered className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-500" />
        <h3 className="shrink-0 text-sm font-bold tracking-wide text-stone-800 dark:text-stone-100">文案大纲</h3>
        <span className="ml-auto truncate font-mono text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
          {outline.totalCharCount.toLocaleString()} 字 · {formatOutlineDuration(outline.totalDurationSeconds)}
        </span>
        <button
          type="button"
          aria-label="收起文案大纲"
          onClick={onClose}
          className="shrink-0 p-2 text-stone-400 dark:text-stone-500 transition-colors hover:text-stone-800 dark:hover:text-stone-200 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 xl:p-1 cursor-pointer"
          title="收起文案大纲"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-8 xl:pr-9">
        {!outline.hasHeadings ? (
          <div className="max-w-52 py-10">
            <ListOrdered className="mb-3 h-5 w-5 text-rose-500" />
            <p className="text-sm font-bold text-stone-700 dark:text-stone-300">尚未识别到章节标题</p>
            <p className="mt-2 text-xs leading-relaxed text-stone-400 dark:text-stone-500">
              使用 H1、H2、H3 设置标题，即可生成大纲和内容占比。
            </p>
          </div>
        ) : (
          <div>
            {outline.leadCharCount > 0 && (
              <div className="py-2.5 pr-2 pl-2">
                <div className="flex items-start gap-3">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5 text-stone-500 dark:text-stone-400">
                    导语
                  </span>
                  <span className="w-12 shrink-0 pt-0.5 text-right">
                    <span className="block font-mono text-[11px] leading-none tabular-nums text-stone-400 dark:text-stone-500">
                      {outline.leadPercentage}%
                    </span>
                    <OutlineProgress percentage={outline.leadPercentage} />
                  </span>
                </div>
              </div>
            )}
            <OutlineBranch
              items={outline.items}
              activeItemId={activeItemId}
              onSelectHeading={handleSelectHeading}
            />
          </div>
        )}
      </div>
    </aside>
  );
};
