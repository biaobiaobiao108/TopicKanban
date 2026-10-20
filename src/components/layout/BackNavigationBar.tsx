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
    className="flex min-h-16 shrink-0 items-center border-b border-line bg-surface-muted px-4 py-2 backdrop-blur-sm sm:px-8"
  >
    <BackButton onBack={onBack} label={label} title={title} />
  </div>
);
