import React from 'react';
import { BackButton } from './BackButton';

interface BackNavigationBarProps {
  onBack: () => void;
  label?: string;
  title?: string;
}

export const BackNavigationBar: React.FC<BackNavigationBarProps> = ({
  onBack,
  label = '返回上一页',
  title = label,
}) => (
  <div
    data-testid="back-navigation-bar"
    className="flex min-h-16 shrink-0 items-center border-b border-stone-200/70 bg-white/95 px-4 py-2 backdrop-blur-sm dark:border-stone-800 dark:bg-stone-900/95 sm:px-8"
  >
    <BackButton onBack={onBack} label={label} title={title} />
  </div>
);
