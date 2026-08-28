import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  icon: LucideIcon;
  leading?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  icon: Icon,
  leading,
  badge,
  actions,
  className = '',
}) => (
  <header
    data-page-header
    className={`flex flex-col gap-3 border-b border-stone-200/70 pb-4 dark:border-stone-800 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${className}`}
  >
    <div className="flex min-w-0 items-center gap-3">
      {leading}
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <h1 className="min-w-0 text-xl font-bold leading-tight tracking-tight text-stone-900 text-balance dark:text-stone-100 sm:text-2xl">
          {title}
        </h1>
        {badge && <span className="shrink-0">{badge}</span>}
      </div>
    </div>
    {actions && (
      <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto sm:justify-end">
        {actions}
      </div>
    )}
  </header>
);
