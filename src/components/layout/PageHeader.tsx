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
    className={`page-header shrink-0 flex flex-col justify-center gap-3 border-b border-[var(--line)]/60 pb-3 sm:h-16 sm:min-h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pb-0 transition-colors ${className}`}
  >
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] shadow-2xs">
        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <h1 className="min-w-0 text-lg font-bold leading-tight tracking-tight text-[var(--ink)] text-balance sm:text-xl">
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
