import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  onBack: () => void;
  label?: string;
  title?: string;
}

export const BackButton: React.FC<BackButtonProps> = ({
  onBack,
  label = '返回上一页',
  title = '返回上一页',
}) => (
  <button
    type="button"
    onClick={onBack}
    title={title}
    aria-label={title}
    className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
  >
    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    <span>{label}</span>
  </button>
);
