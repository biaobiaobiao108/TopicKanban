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
  Menu,
  LogOut,
  X,
  Search,
  Smartphone,
} from 'lucide-react';
import { NavView } from './Sidebar';
import { PwaInstallButton } from '../ui/PwaInstall';

interface MobileBottomNavProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  onOpenQuickCreate: () => void;
  onOpenMobileDrawer: () => void;
  topicCount: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentView,
  onNavigate,
  onOpenQuickCreate,
  onOpenMobileDrawer,
  topicCount,
}) => {
  const items: { id: NavView; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number | null }[] = [
    { id: 'today', label: '今日', icon: Calendar, badge: null },
    { id: 'kanban', label: '看板', icon: KanbanSquare, badge: topicCount > 0 ? topicCount : null },
    { id: 'deals', label: '商单', icon: Handshake, badge: null },
    { id: 'settings', label: '设置', icon: Settings, badge: null },
  ];

  return (
    <nav
      data-testid="mobile-bottom-nav"
      aria-label="移动端主导航"
      className="mobile-nav-container md:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-6 items-center bg-nav-surface px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-lg border-t border-line shadow-nav-ambient transition-colors"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = currentView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            aria-current={isActive ? 'page' : undefined}
            aria-label={typeof item.badge === 'number' && item.badge > 0 ? `${item.label}，${item.badge}个选题` : item.label}
            className={`mobile-nav-item relative flex min-h-11 w-full min-w-0 touch-manipulation flex-col items-center justify-center rounded-lg px-0.5 py-1 transition-colors ${
              isActive
                ? 'text-accent font-bold'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
            <span className="text-[10px] mt-0.5">{item.label}</span>
            {typeof item.badge === 'number' && item.badge > 0 && (
              <span className="absolute top-0 right-1 min-w-4 h-4 px-1 bg-accent text-white rounded-full text-[9px] font-bold flex items-center justify-center font-mono">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}

      <button
        type="button"
        onClick={onOpenMobileDrawer}
        aria-label="打开菜单"
        className="mobile-nav-item flex min-h-11 w-full min-w-0 touch-manipulation flex-col items-center justify-center rounded-lg px-0.5 py-1 text-ink-muted transition-colors hover:text-ink"
      >
        <Menu className="h-5 w-5 stroke-2" aria-hidden="true" />
        <span className="mt-0.5 text-[10px]">菜单</span>
      </button>

      {/* Floating Create Button */}
      <button
        onClick={onOpenQuickCreate}
        aria-label="新建选题"
        className="mobile-fab-create-button mx-auto flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full bg-accent hover:bg-accent-dark text-white shadow-soft-pill transition-transform active:scale-95 cursor-pointer"
      >
        <Plus className="w-5 h-5 stroke-[2.5]" />
      </button>
    </nav>
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

    const focusDrawer = () => closeButtonRef.current?.focus({ preventScroll: true });
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
      requestAnimationFrame(() => previousActiveElement?.focus({ preventScroll: true }));
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
      <div className="mobile-drawer-backdrop fixed inset-0 bg-overlay backdrop-blur-xs" onClick={onClose} />

      {/* Drawer */}
      <div ref={drawerRef} role="dialog" aria-modal="true" aria-label="移动端导航菜单" className="mobile-drawer-container mobile-drawer-panel pwa-mobile-drawer relative w-4/5 max-w-xs glass-sidebar h-full shadow-2xl flex flex-col justify-between p-5 z-10 border-r border-line transition-colors">
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-line">
            <div className="flex items-center gap-2.5">
              <div className="sidebar-brand-logo w-8 h-8 rounded-xl flex items-center justify-center overflow-hidden shadow-2xs shrink-0 ring-1 ring-black/5">
                <img src="/icon.png" alt="喵爪看板 Logo" width={32} height={32} className="w-full h-full object-cover rounded-xl" />
              </div>
              <div>
                <h2 className="font-bold text-ink text-sm tracking-tight leading-tight">喵爪看板</h2>
              </div>
            </div>
            <button ref={closeButtonRef} onClick={onClose} aria-label="关闭导航菜单" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-control transition-colors cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Buttons */}
          <div data-testid="mobile-drawer-quick-actions" className="space-y-2.5">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenQuickCreate();
              }}
              aria-label="新建选题"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-xs font-semibold text-white shadow-soft-pill transition-all hover:bg-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 active:scale-[0.98] cursor-pointer"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
              <span>新建选题</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCommandPalette();
                }}
                aria-label="全局搜索与指令"
                className={`group flex min-h-11 min-w-0 items-center gap-1.5 rounded-xl border border-transparent bg-surface/60 px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${onOpenQuickDrops ? '' : 'col-span-2'}`}
              >
                <Search className="h-3.5 w-3.5 shrink-0 text-ink-muted transition-colors group-hover:text-ink dark:group-hover:text-ink-faint" aria-hidden="true" />
                <span className="truncate">搜索</span>
              </button>

              {onOpenQuickDrops && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenQuickDrops();
                  }}
                  aria-label={quickDropCount > 0 ? `手机快投箱中有 ${quickDropCount} 条未处理灵感` : '打开手机快投灵感箱'}
                  className={`group flex min-h-11 min-w-0 items-center justify-between gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${
                    quickDropCount > 0
                      ? 'border-accent/15 bg-accent-soft text-accent-dark shadow-2xs'
                      : 'border-transparent bg-surface/60 text-ink hover:bg-surface'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Smartphone className={`h-3.5 w-3.5 shrink-0 ${quickDropCount > 0 ? 'text-accent' : 'text-ink-muted'}`} aria-hidden="true" />
                    <span className="truncate">快投箱</span>
                  </span>
                  {quickDropCount > 0 ? (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-mono font-bold text-white">
                      {quickDropCount}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] font-normal text-ink-muted">7天</span>
                  )}
                </button>
              )}
            </div>

            <PwaInstallButton variant="menu" />
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
                  className={`w-full min-h-11 touch-manipulation flex items-center justify-between px-3 py-2.5 rounded-xl text-[15px] font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-surface text-ink font-semibold shadow-2xs'
                      : 'text-ink hover:bg-control hover:text-ink'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4.5 h-4.5 transition-colors shrink-0 ${isActive ? 'text-accent' : 'text-ink-muted'}`} />
                    <span>{item.label}</span>
                  </div>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-bold transition-colors ${
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
          </nav>
        </div>

        {/* Footer Logout */}
        <div className="pt-4 border-t border-line pb-[env(safe-area-inset-bottom)]">
          <button
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="w-full flex items-center gap-2 text-xs text-danger hover:bg-danger-soft p-2.5 rounded-xl font-medium transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>退出当前登录会话</span>
          </button>
        </div>
      </div>
    </div>
  );
};
