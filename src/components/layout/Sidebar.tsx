import {
  Calendar,
  CalendarDays,
  KanbanSquare,
  Users,
  Hash,
  Film,
  Handshake,
  Database,
  Settings,
  Search,
  Plus,
  Smartphone,
  LogOut
} from 'lucide-react';
import { FloatingScrollbar } from '../ui/FloatingScrollbar';

export type NavView = 'today' | 'calendar' | 'kanban' | 'people' | 'tags' | 'published' | 'deals' | 'database' | 'settings' | 'topic-detail';

interface SidebarProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  onOpenQuickCreate: () => void;
  onOpenCommandPalette: () => void;
  onOpenQuickDrops?: () => void;
  onLogout?: () => void;
  topicCount: number;
  quickDropCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  onOpenQuickCreate,
  onOpenCommandPalette,
  onOpenQuickDrops,
  onLogout,
  topicCount,
  quickDropCount = 0,
}) => {
  const navItems = [
    { id: 'today' as NavView, label: '今日聚焦', icon: Calendar, badge: null },
    { id: 'kanban' as NavView, label: '选题看板', icon: KanbanSquare, badge: topicCount > 0 ? topicCount : null },
    { id: 'calendar' as NavView, label: '选题日历', icon: CalendarDays, badge: null },
    { id: 'people' as NavView, label: '人物档案库', icon: Users, badge: null },
    { id: 'tags' as NavView, label: '标签与赛道', icon: Hash, badge: null },
    { id: 'published' as NavView, label: '已发布视频', icon: Film, badge: null },
    { id: 'deals' as NavView, label: '商单中心', icon: Handshake, badge: null },
    { id: 'database' as NavView, label: '选题库', icon: Database, badge: null },
    { id: 'settings' as NavView, label: '偏好与数据', icon: Settings, badge: null },
  ];

  return (
    <aside className="sidebar-container hidden md:flex w-64 glass-sidebar flex-col h-full shrink-0 select-none transition-colors">
      {/* Brand Header */}
      <div className="p-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="sidebar-brand-logo w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center overflow-hidden shadow-2xs shrink-0 ring-1 ring-black/5 dark:ring-white/10">
            <img src="/icon.png" alt="工作台 Logo" width={36} height={36} className="w-full h-full object-cover rounded-[var(--radius-sm)]" />
          </div>
          <div>
            <h1 className="font-sans text-[var(--ink)] text-base font-bold tracking-tight leading-snug">选题生产工作台</h1>
          </div>
        </div>

        {/* Quick actions in sidebar */}
        <div data-testid="sidebar-quick-actions" className="mt-4 border-t border-[var(--line)]/70 pt-3">
          <button
            type="button"
            onClick={onOpenQuickCreate}
            aria-label="新建选题"
            title="新建选题（快捷键：N）"
            className="group flex min-h-10 w-full items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3.5 py-2.5 text-[13px] font-semibold text-white shadow-2xs transition-all hover:bg-[var(--accent-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 active:scale-[0.98] cursor-pointer"
          >
            <Plus className="h-4 w-4 shrink-0 stroke-[2.5]" aria-hidden="true" />
            <span>新建选题</span>
            <kbd className="ml-auto rounded-[var(--radius-sm)] bg-black/20 px-1.5 py-0.5 text-[11px] font-mono font-medium text-white">N</kbd>
          </button>

          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={onOpenCommandPalette}
              aria-label="全局搜索与指令"
              title="全局搜索与指令（快捷键：Ctrl+/ 或 Cmd+/）"
              className="group flex min-h-9 min-w-0 items-center gap-1.5 rounded-[var(--radius-sm)] border border-transparent bg-[var(--surface)]/60 px-2.5 py-2 text-[12px] font-medium text-stone-700 transition-colors hover:bg-[var(--surface)] hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 dark:text-stone-300 dark:hover:text-white cursor-pointer"
            >
              <Search className="h-3.5 w-3.5 shrink-0 text-stone-500 transition-colors group-hover:text-stone-800 dark:text-stone-400 dark:group-hover:text-stone-200" aria-hidden="true" />
              <span className="truncate">搜索</span>
            </button>

            {onOpenQuickDrops && (
              <button
                type="button"
                onClick={onOpenQuickDrops}
                aria-label={quickDropCount > 0 ? `手机快投箱中有 ${quickDropCount} 条未处理灵感` : '打开手机快投灵感箱'}
                title={quickDropCount > 0 ? `手机快投箱中有 ${quickDropCount} 条未处理灵感` : '打开手机快投灵感箱（7天暂存）'}
                className={`group flex min-h-9 min-w-0 items-center justify-between gap-1.5 rounded-[var(--radius-sm)] border px-2.5 py-2 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 cursor-pointer ${
                  quickDropCount > 0
                    ? 'border-[var(--accent)]/15 bg-[var(--accent-soft)] text-[var(--accent-dark)] shadow-2xs'
                    : 'border-transparent bg-[var(--surface)]/60 text-stone-700 hover:bg-[var(--surface)] hover:text-stone-950 dark:text-stone-300 dark:hover:text-white'
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Smartphone className={`h-3.5 w-3.5 shrink-0 ${quickDropCount > 0 ? 'text-[var(--accent)]' : 'text-stone-500 dark:text-stone-400'}`} aria-hidden="true" />
                  <span className="truncate">快投箱</span>
                </span>
                {quickDropCount > 0 ? (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-mono font-bold text-white">
                    {quickDropCount}
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px] font-normal text-stone-400 dark:text-stone-500">7天</span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <nav aria-label="工作台模块" className="flex-1 min-h-0">
        <FloatingScrollbar className="p-3 space-y-1" wrapperClassName="h-full">
          <div className="text-xs font-bold text-stone-500 dark:text-stone-400 px-3.5 py-2 uppercase tracking-wider">
            工作台模块
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`group relative w-full flex items-center justify-between px-3.5 py-2.5 rounded-[var(--radius-sm)] text-[14px] sm:text-[15px] transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[var(--surface)] text-[var(--ink)] font-semibold shadow-2xs'
                    : 'text-stone-700 dark:text-stone-200 hover:bg-[var(--surface)] hover:text-stone-950 dark:hover:text-white font-medium'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4.5 h-4.5 transition-colors shrink-0 ${isActive ? 'text-[var(--accent)]' : 'text-stone-500 dark:text-stone-400 group-hover:text-stone-800 dark:group-hover:text-stone-200'}`} />
                  <span className="tracking-wide">{item.label}</span>
                </div>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className={`text-xs px-2 py-0.5 rounded-[var(--radius-sm)] tabular-nums font-semibold transition-colors ${
                    isActive
                      ? 'bg-[var(--accent)] text-white shadow-2xs'
                      : 'bg-stone-200/80 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </FloatingScrollbar>
      </nav>

      {/* Footer Info & Logout */}
      <div className="p-3.5 border-t border-[var(--line)] space-y-2">
        <div className="flex items-center justify-between text-xs text-stone-700 dark:text-stone-300 font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>存储鉴权已就绪</span>
          </div>
          <span className="text-xs font-mono text-stone-500 dark:text-stone-400">v1.0</span>
        </div>

        {onLogout && (
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-1.5 text-xs font-medium text-stone-700 dark:text-stone-300 hover:text-red-600 dark:hover:text-red-400 px-2 py-1.5 rounded-lg hover:bg-red-50/50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>退出登录</span>
          </button>
        )}
      </div>
    </aside>
  );
};
