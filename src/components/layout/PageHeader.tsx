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
    className={`page-header flex min-h-10 flex-col gap-2.5 border-b border-[var(--line)] pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${className}`}
  >
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/15">
        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <h1 className="min-w-0 text-lg font-bold leading-tight tracking-tight text-stone-900 text-balance dark:text-stone-100 sm:text-xl">
          {title}
        </h1>
        {badge && <span className="shrink-0">{badge}</span>}
      </div>
    </div>
    {actions && (
      <div className="page-header-actions flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
        {actions}
      </div>
    )}
  </header>
);
