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
    aria-label={title}
    className="inline-flex min-h-10 min-w-10 shrink-0 touch-manipulation items-center justify-center gap-1.5 rounded-xl border border-transparent px-3 py-2 text-sm font-semibold text-ink-muted transition-all hover:bg-control hover:text-ink active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
  >
    <ArrowLeft className="h-4.5 w-4.5" aria-hidden="true" />
    <span>{label}</span>
  </button>
);
