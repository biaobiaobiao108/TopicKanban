import React from 'react';
import {
  Calendar,
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

export type NavView = 'today' | 'kanban' | 'people' | 'tags' | 'published' | 'deals' | 'database' | 'settings' | 'topic-detail';

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
    { id: 'people' as NavView, label: '人物档案库', icon: Users, badge: null },
    { id: 'tags' as NavView, label: '标签与赛道', icon: Hash, badge: null },
    { id: 'published' as NavView, label: '已发布视频', icon: Film, badge: null },
    { id: 'deals' as NavView, label: '商单中心', icon: Handshake, badge: null },
    { id: 'database' as NavView, label: '选题库', icon: Database, badge: null },
    { id: 'settings' as NavView, label: '偏好与数据', icon: Settings, badge: null },
  ];

  return (
    <aside className="sidebar-container hidden md:flex w-64 bg-white dark:bg-stone-900 border-r border-stone-200/70 dark:border-stone-800 flex-col h-dvh shrink-0 select-none transition-colors">
      {/* Brand Header */}
      <div className="p-4 border-b border-stone-200/70 dark:border-stone-800">
        <div className="flex items-center gap-2.5">
          <div className="sidebar-brand-logo w-8 h-8 rounded-xl flex items-center justify-center overflow-hidden shadow-2xs shrink-0">
            <img src="/icon.png" alt="工作台 Logo" className="w-full h-full object-cover rounded-xl" />
          </div>
          <div>
            <h1 className="font-bold text-stone-900 dark:text-stone-100 text-[15px] leading-tight">选题生产工作台</h1>
          </div>
        </div>

        {/* Quick actions in sidebar */}
        <div className="mt-3.5 space-y-2">
          <button
            onClick={onOpenQuickCreate}
            className="w-full flex items-center justify-center gap-2 bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white px-3.5 py-2 rounded-xl text-sm font-semibold transition-all shadow-2xs hover:shadow-xs cursor-pointer active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>新建选题</span>
            <kbd className="ml-auto text-[11px] bg-stone-700 dark:bg-rose-800/80 text-stone-300 dark:text-rose-100 px-1.5 py-0.5 rounded-md font-mono">N</kbd>
          </button>

          <button
            onClick={onOpenCommandPalette}
            className="w-full flex items-center gap-2 bg-stone-100/70 dark:bg-stone-800/70 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 px-3 py-1.5 rounded-xl text-xs font-medium border border-stone-200/60 dark:border-stone-700 transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 text-stone-400" />
            <span>全局搜索与指令</span>
            <kbd className="ml-auto text-[10px] bg-stone-200/70 dark:bg-stone-700 text-stone-500 dark:text-stone-400 px-1.5 py-0.5 rounded-md font-mono">Ctrl+P</kbd>
          </button>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 px-3 py-1 uppercase tracking-wider">
          工作台模块
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                isActive
                  ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-bold shadow-2xs'
                  : 'text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800/60 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4.5 h-4.5 ${isActive ? 'text-rose-600 dark:text-rose-400' : 'text-stone-400 dark:text-stone-500'}`} />
                <span>{item.label}</span>
              </div>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span className="text-xs bg-stone-200/80 dark:bg-stone-700 text-stone-700 dark:text-stone-300 px-2 py-0.5 rounded-full font-mono font-bold">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Info & Logout */}
      <div className="p-3.5 border-t border-stone-200/70 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 space-y-2">
        <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>存储鉴权已就绪</span>
          </div>
          <span className="text-[11px] font-mono text-stone-400">v1.0</span>
        </div>

        {onLogout && (
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-50/50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>退出登录</span>
          </button>
        )}
      </div>
    </aside>
  );
};
