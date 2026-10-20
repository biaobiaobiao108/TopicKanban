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
  LogOut,
  ShieldAlert,
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
  storageError?: string | null;
  authError?: string | null;
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
  storageError = null,
  authError = null,
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
          <div className="sidebar-brand-logo w-9 h-9 rounded-sm flex items-center justify-center overflow-hidden shadow-2xs shrink-0 ring-1 ring-black/5">
            <img src="/icon.png" alt="喵爪看板 Logo" width={36} height={36} className="w-full h-full object-cover rounded-sm" />
          </div>
          <h1 className="font-serif text-ink text-[19px] font-bold tracking-[0.02em] leading-snug">喵爪看板</h1>
        </div>

        {/* Quick actions in sidebar */}
        <div data-testid="sidebar-quick-actions" className="mt-4 border-t border-line/70 pt-3">
          <button
            type="button"
            onClick={onOpenQuickCreate}
            aria-label="新建选题"
            className="group flex min-h-10 w-full items-center gap-2 rounded-sm bg-accent px-3.5 py-2.5 text-sm font-semibold text-white shadow-2xs transition-all hover:bg-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 active:scale-[0.98] cursor-pointer"
          >
            <Plus className="h-4 w-4 shrink-0 stroke-[2.5]" aria-hidden="true" />
            <span>新建选题</span>
            <kbd className="ml-auto rounded-sm bg-overlay px-1.5 py-0.5 text-2xs font-mono font-medium text-white">N</kbd>
          </button>

          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={onOpenCommandPalette}
              aria-label="全局搜索与指令"
              className="group flex min-h-9 min-w-0 items-center gap-1.5 rounded-sm border border-transparent bg-surface/60 px-2.5 py-2 text-xs font-medium text-ink transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
            >
              <Search className="h-3.5 w-3.5 shrink-0 text-ink-muted transition-colors group-hover:text-ink" aria-hidden="true" />
              <span className="truncate">搜索</span>
            </button>

            {onOpenQuickDrops && (
              <button
                type="button"
                onClick={onOpenQuickDrops}
                aria-label={quickDropCount > 0 ? `手机快投箱中有 ${quickDropCount} 条未处理灵感` : '打开手机快投灵感箱'}
                className={`group flex min-h-9 min-w-0 items-center justify-between gap-1.5 rounded-sm border px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${
                  quickDropCount > 0
                    ? 'border-accent/15 bg-accent-soft text-accent-dark shadow-2xs'
                    : 'border-transparent bg-surface/60 text-ink hover:bg-surface hover:text-ink'
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Smartphone className={`h-3.5 w-3.5 shrink-0 ${quickDropCount > 0 ? 'text-accent' : 'text-ink-muted'}`} aria-hidden="true" />
                  <span className="truncate">快投箱</span>
                </span>
                {quickDropCount > 0 ? (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1 text-3xs font-mono font-bold text-white">
                    {quickDropCount}
                  </span>
                ) : (
                  <span className="shrink-0 text-3xs font-normal text-ink-muted">7天</span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <nav aria-label="工作台模块" className="flex-1 min-h-0">
        <FloatingScrollbar className="flex flex-col p-3" wrapperClassName="h-full">
          <div className="text-xs font-semibold text-ink-muted px-3.5 py-2 tracking-[0.12em]">
            工作台模块
          </div>
          <div className="flex max-h-[32rem] flex-1 flex-col justify-between gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group relative w-full flex items-center justify-between px-3.5 py-3 rounded-sm text-sm transition-all cursor-pointer ${
                    isActive
                      ? 'bg-surface text-ink font-semibold shadow-2xs'
                      : 'text-ink hover:bg-surface hover:text-ink font-medium'
                  }`}
                >
                  {isActive && <span aria-hidden="true" className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-accent" />}
                  <div className="flex items-center gap-3">
                    <Icon className={`h-[18px] w-[18px] transition-colors shrink-0 ${isActive ? 'text-accent' : 'text-ink-muted group-hover:text-ink'}`} />
                    <span className="tracking-wide">{item.label}</span>
                  </div>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span className={`text-xs px-2 py-0.5 rounded-sm tabular-nums font-semibold transition-colors ${
                      isActive
                        ? 'bg-accent text-white shadow-2xs'
                        : 'bg-control text-ink'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </FloatingScrollbar>
      </nav>

      {/* Footer Info & Logout */}
      <div className="p-3.5 space-y-2">
        {(storageError || authError) && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-danger-soft text-danger text-xs">
            {storageError && (
              <span
                className="flex items-center gap-1.5 cursor-help min-w-0"
                aria-label={`存储异常: ${storageError}`}
              >
                <Database className="w-3.5 h-3.5 text-danger shrink-0" />
                <span className="text-2xs font-medium truncate">存储异常</span>
              </span>
            )}
            {authError && (
              <span
                className="flex items-center gap-1.5 cursor-help min-w-0"
                aria-label={`鉴权异常: ${authError}`}
              >
                <ShieldAlert className="w-3.5 h-3.5 text-warning shrink-0" />
                <span className="text-2xs font-medium truncate">鉴权异常</span>
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-ink-muted">
          {onLogout ? (
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 text-xs font-medium text-ink hover:text-danger px-2 py-1.5 rounded-lg hover:bg-danger-soft transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>退出登录</span>
            </button>
          ) : (
            <div />
          )}
          <span className="text-2xs font-mono px-2 text-ink-muted select-none">v1.0</span>
        </div>
      </div>
    </aside>
  );
};
