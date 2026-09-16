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
  LogOut
} from 'lucide-react';

export type NavView = 'today' | 'calendar' | 'kanban' | 'people' | 'tags' | 'published' | 'deals' | 'database' | 'settings' | 'topic-detail';

interface SidebarProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  onOpenQuickCreate: () => void;
  onOpenCommandPalette: () => void;
  onLogout?: () => void;
  topicCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  onOpenQuickCreate,
  onOpenCommandPalette,
  onLogout,
  topicCount,
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
    <aside className="sidebar-container hidden md:flex w-64 glass-sidebar flex-col h-dvh shrink-0 select-none transition-colors">
      {/* Brand Header */}
      <div className="p-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="sidebar-brand-logo w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center overflow-hidden shadow-2xs shrink-0 ring-1 ring-black/5 dark:ring-white/10">
            <img src="/icon.png" alt="工作台 Logo" width={32} height={32} className="w-full h-full object-cover rounded-[var(--radius-sm)]" />
          </div>
          <div>
            <h1 className="font-serif text-[var(--h1-color)] text-base font-normal tracking-wide leading-tight">选题生产工作台</h1>
          </div>
        </div>

        {/* Quick actions in sidebar */}
        <div className="mt-3.5 space-y-2">
          <button
            onClick={onOpenQuickCreate}
            className="w-full flex items-center justify-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white px-3.5 py-2 rounded-[var(--radius-sm)] text-xs font-medium transition-all shadow-2xs cursor-pointer active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>新建选题</span>
            <kbd className="ml-auto text-[10px] bg-black/15 text-white/90 px-1.5 py-0.5 rounded-[var(--radius-sm)] font-mono">N</kbd>
          </button>

          <button
            onClick={onOpenCommandPalette}
            className="w-full flex items-center gap-2 bg-[var(--surface)] hover:bg-[var(--canvas)] text-[var(--ink-muted)] hover:text-[var(--ink)] px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-normal border border-[var(--line)] transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
            <span>全局搜索与指令</span>
            <kbd className="ml-auto text-[10px] bg-[var(--canvas)] text-[var(--ink-muted)] border border-[var(--line)] px-1 py-0.5 rounded-[var(--radius-sm)] font-mono">Ctrl+/</kbd>
          </button>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto no-scrollbar">
        <div className="text-[11px] font-medium text-[var(--ink-muted)] px-3 py-1 uppercase tracking-wider">
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
              className={`group relative w-full flex items-center justify-between px-3 py-2 rounded-[var(--radius-sm)] text-xs transition-all cursor-pointer ${
                isActive
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-dark)] font-medium'
                  : 'text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] font-normal'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-[var(--accent)]' : 'text-[var(--ink-muted)] opacity-70 group-hover:opacity-100'}`} />
                <span>{item.label}</span>
              </div>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span className={`text-[11px] px-1.5 py-0.2 rounded-[var(--radius-sm)] tabular-nums transition-colors ${
                  isActive
                    ? 'bg-[var(--accent)] text-white shadow-2xs'
                    : 'text-[var(--ink-muted)] opacity-75'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Info & Logout */}
      <div className="p-3.5 border-t border-stone-200/30 dark:border-stone-800/40 space-y-2">
        <div className="flex items-center justify-between text-xs text-stone-600 dark:text-stone-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>存储鉴权已就绪</span>
          </div>
          <span className="text-[11px] font-mono text-stone-600 dark:text-stone-400">v1.0</span>
        </div>

        {onLogout && (
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-400 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-50/50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>退出登录</span>
          </button>
        )}
      </div>
    </aside>
  );
};
