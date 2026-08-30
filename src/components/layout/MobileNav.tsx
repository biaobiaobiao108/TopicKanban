import React, { useEffect, useRef } from 'react';
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
  Plus,
  LogOut,
  X,
  ShieldCheck,
  Search,
  Smartphone,
} from 'lucide-react';
import { NavView } from './Sidebar';

interface MobileBottomNavProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  onOpenQuickCreate: () => void;
  topicCount: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentView,
  onNavigate,
  onOpenQuickCreate,
  topicCount,
}) => {
  const items: { id: NavView; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number | null }[] = [
    { id: 'today', label: '今日', icon: Calendar, badge: null },
    { id: 'kanban', label: '看板', icon: KanbanSquare, badge: topicCount > 0 ? topicCount : null },
    { id: 'calendar', label: '日历', icon: CalendarDays, badge: null },
    { id: 'tags', label: '赛道', icon: Hash, badge: null },
    { id: 'people', label: '人物', icon: Users, badge: null },
    { id: 'published', label: '复盘', icon: Film, badge: null },
    { id: 'deals', label: '商单', icon: Handshake, badge: null },
    { id: 'settings', label: '设置', icon: Settings, badge: null },
  ];

  return (
    <div className="mobile-nav-container md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200/80 dark:border-stone-800 px-3 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-around transition-colors">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = currentView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`relative flex min-h-11 min-w-11 touch-manipulation flex-col items-center justify-center rounded-lg px-1.5 py-1 transition-colors ${
              isActive
                ? 'text-rose-600 dark:text-rose-400 font-bold'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
            <span className="text-[10px] mt-0.5">{item.label}</span>
            {typeof item.badge === 'number' && item.badge > 0 && (
              <span className="absolute top-0 right-1 min-w-4 h-4 px-1 bg-rose-600 dark:bg-rose-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}

      {/* Floating Create Button */}
      <button
        onClick={onOpenQuickCreate}
        aria-label="新建选题"
        className="mobile-fab-create-button ml-1 flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full bg-stone-900 dark:bg-rose-600 text-white shadow-md transition-transform active:scale-95 cursor-pointer"
        title="新建选题"
      >
        <Plus className="w-5 h-5 stroke-[2.5]" />
      </button>
    </div>
  );
};

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  onOpenQuickCreate: () => void;
  onOpenCommandPalette: () => void;
  onOpenQuickDrops?: () => void;
  onLogout: () => void;
  topicCount: number;
  quickDropCount?: number;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  onClose,
  currentView,
  onNavigate,
  onOpenQuickCreate,
  onOpenCommandPalette,
  onOpenQuickDrops,
  onLogout,
  topicCount,
  quickDropCount = 0,
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusDrawer = () => closeButtonRef.current?.focus();
    requestAnimationFrame(focusDrawer);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => previousActiveElement?.focus());
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const navItems = [
    { id: 'today' as NavView, label: '今日聚焦', icon: Calendar, badge: null },
    { id: 'kanban' as NavView, label: '选题看板', icon: KanbanSquare, badge: topicCount > 0 ? topicCount : null },
    { id: 'calendar' as NavView, label: '选题日历', icon: CalendarDays, badge: null },
    { id: 'tags' as NavView, label: '标签与赛道', icon: Hash, badge: null },
    { id: 'people' as NavView, label: '人物档案库', icon: Users, badge: null },
    { id: 'published' as NavView, label: '已发布视频', icon: Film, badge: null },
    { id: 'deals' as NavView, label: '商单中心', icon: Handshake, badge: null },
    { id: 'database' as NavView, label: '选题库', icon: Database, badge: null },
    { id: 'settings' as NavView, label: '偏好与数据', icon: Settings, badge: null },
  ];

  return (
    <div className="md:hidden fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs" onClick={onClose} />

      {/* Drawer */}
      <div ref={drawerRef} role="dialog" aria-modal="true" aria-label="移动端导航菜单" className="mobile-drawer-container relative w-4/5 max-w-xs bg-white dark:bg-stone-900 h-full shadow-2xl flex flex-col justify-between p-5 z-10 animate-in slide-in-from-left duration-200 border-r border-stone-200/70 dark:border-stone-800 transition-colors">
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-stone-100 dark:border-stone-800">
            <div className="flex items-center gap-2.5">
              <div className="sidebar-brand-logo w-8 h-8 rounded-xl flex items-center justify-center overflow-hidden shadow-2xs shrink-0">
                <img src="/icon.png" alt="工作台 Logo" width={32} height={32} className="w-full h-full object-cover rounded-xl" />
              </div>
              <div>
                <h2 className="font-bold text-stone-900 dark:text-stone-100 text-sm leading-tight">选题生产工作台</h2>
              </div>
            </div>
            <button ref={closeButtonRef} onClick={onClose} aria-label="关闭导航菜单" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Buttons */}
          <div className="space-y-2">
            <button
              onClick={() => {
                onClose();
                onOpenQuickCreate();
              }}
              className="w-full flex items-center justify-center gap-2 bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white py-2 rounded-xl text-xs font-semibold shadow-2xs cursor-pointer active:scale-[0.98] transition-all"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>新建选题</span>
            </button>

            {onOpenQuickDrops && (
              <button
                onClick={() => {
                  onClose();
                  onOpenQuickDrops();
                }}
                className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  quickDropCount > 0
                    ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 shadow-2xs'
                    : 'bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-750'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Smartphone className={`w-3.5 h-3.5 ${quickDropCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-stone-500 dark:text-stone-400'}`} />
                  <span>手机快投灵感箱</span>
                </div>
                {quickDropCount > 0 ? (
                  <span className="min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-mono font-bold flex items-center justify-center">
                    {quickDropCount}
                  </span>
                ) : (
                  <span className="text-[10px] text-stone-400 dark:text-stone-500 font-normal">7天暂存</span>
                )}
              </button>
            )}

            <button
              onClick={() => {
                onClose();
                onOpenCommandPalette();
              }}
              className="w-full flex items-center gap-2 bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-300 py-2 px-3 rounded-xl text-xs font-medium border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-750 transition-colors cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500" />
              <span>全局搜索与指令</span>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    onClose();
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full min-h-11 touch-manipulation flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-bold'
                      : 'text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800/60 hover:text-stone-900 dark:hover:text-stone-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-rose-600 dark:text-rose-400' : 'text-stone-400 dark:text-stone-500'}`} />
                    <span>{item.label}</span>
                  </div>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span className="text-xs bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 px-2 py-0.5 rounded-full font-mono font-bold">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer Logout */}
        <div className="pt-4 border-t border-stone-100 dark:border-stone-800 pb-[env(safe-area-inset-bottom)]">
          <button
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="w-full flex items-center gap-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 p-2.5 rounded-xl font-medium transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>退出当前登录会话</span>
          </button>
        </div>
      </div>
    </div>
  );
};
