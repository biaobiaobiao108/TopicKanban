import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  icon: LucideIcon;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  icon: Icon,
  badge,
  actions,
  className = '',
}) => (
  <header
    data-page-header
    className={`page-header shrink-0 flex flex-col justify-center gap-3 border-b border-line/60 pb-3 sm:h-16 sm:min-h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pb-0 transition-colors ${className}`}
  >
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center bg-h1-color text-canvas rounded-sm font-serif text-[13px] font-bold leading-none" aria-hidden="true">
        <Icon className="h-[15px] w-[15px] text-canvas" />
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <h1 className="font-serif min-w-0 text-xl font-bold leading-tight tracking-[0.01em] text-ink text-balance sm:text-[22px]">
          {title}
        </h1>
        {badge && <span className="shrink-0">{badge}</span>}
      </div>
    </div>
    {actions && (
      <div className="page-header-actions flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end sm:shrink-0">
        {actions}
      </div>
    )}
  </header>
);
