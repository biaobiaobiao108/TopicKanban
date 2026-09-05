import React from 'react';
import { Search, Plus, Menu, Smartphone } from 'lucide-react';
import { NavView } from './Sidebar';

interface NavbarProps {
  currentView: NavView;
  onOpenQuickCreate: () => void;
  onOpenCommandPalette: () => void;
  onOpenMobileDrawer?: () => void;
  onOpenQuickDrops?: () => void;
  quickDropCount?: number;
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onOpenQuickCreate,
  onOpenCommandPalette,
  onOpenMobileDrawer,
  onOpenQuickDrops,
  quickDropCount = 0,
  searchTerm,
  onSearchChange,
}) => {
  const titles: Record<NavView, string> = {
    today: '今日聚焦',
    kanban: '选题全景看板',
    calendar: '选题日历',
    tags: '标签与创作赛道资产',
    people: '互联网人物档案与关系库',
    published: '已发布视频复盘与数据沉淀',
    deals: '商单中心',
    database: '选题库',
    settings: '偏好设置与数据管理',
    'topic-detail': '选题生产工作台',
  };

  const currentTitle = titles[currentView] || titles.kanban;

  return (
    <header className="navbar-container pwa-navbar h-13 bg-[var(--bg-surface)] backdrop-blur-md border-b border-stone-200/70 dark:border-stone-800 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20 shrink-0 transition-colors">
      {/* Left: Mobile Menu button & Title */}
      <div className="flex items-center gap-2.5 min-w-0">
        {onOpenMobileDrawer && (
          <button
            type="button"
            onClick={onOpenMobileDrawer}
            aria-label="打开菜单"
            className="md:hidden p-1.5 -ml-1 text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            title="打开菜单"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
        )}

        <span className="text-sm sm:text-base font-bold text-[var(--text-primary)] tracking-tight truncate">
          {currentTitle}
        </span>
      </div>

      {/* Right Controls */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        {/* Quick Search */}
        <div className="relative shrink-0">
          <Search className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500 absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            aria-label="搜索选题或人物"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="搜索选题/人物..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-28 rounded-xl border border-transparent bg-stone-100/80 py-1.5 pl-8 pr-2.5 text-xs text-stone-900 shadow-2xs transition-all placeholder:text-stone-400 focus:border-stone-300 focus:bg-white focus:outline-none dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-stone-600 dark:focus:bg-stone-800 sm:w-56 sm:pl-9 sm:text-sm sm:focus:w-72 focus:w-36"
          />
        </div>

        {/* Quick Drop Notifications / Ingestion */}
        {onOpenQuickDrops && (
          <button
            type="button"
            onClick={onOpenQuickDrops}
            aria-label={quickDropCount > 0 ? `手机快投箱中有 ${quickDropCount} 条未处理灵感` : '打开手机快投灵感箱'}
            title={quickDropCount > 0 ? `手机快投箱中有 ${quickDropCount} 条未处理灵感` : '打开手机快投灵感箱'}
            className={`relative flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition-all cursor-pointer ${
              quickDropCount > 0
                ? 'bg-rose-500/10 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 font-bold shadow-2xs hover:bg-rose-500/20'
                : 'bg-stone-100/80 dark:bg-stone-800 hover:bg-stone-200/80 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300'
            }`}
          >
            <Smartphone className={`w-3.5 h-3.5 ${quickDropCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-stone-500 dark:text-stone-400'}`} />
            <span className="hidden sm:inline">快投箱</span>
            {quickDropCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 font-mono text-[10px] text-white">
                {quickDropCount}
              </span>
            )}
          </button>
        )}

        {/* Quick Create Button */}
        <button
          type="button"
          onClick={onOpenQuickCreate}
          aria-label="新选题"
          className="hidden items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs transition-all hover:bg-rose-700 hover:shadow-xs active:scale-95 cursor-pointer sm:text-sm md:flex"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
          <span className="hidden sm:inline">新选题</span>
        </button>
      </div>
    </header>
  );
};
