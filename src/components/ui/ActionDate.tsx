import React from 'react';
import { ActionDateDisplay, useActionDateDisplay } from '../../lib/actionDate';

interface ActionDateTextProps {
  display: ActionDateDisplay;
  className?: string;
}

export const ActionDateText: React.FC<ActionDateTextProps> = ({ display, className = '' }) => {
  if (display.state === 'empty') return null;

  const relativeLabel = display.state === 'today'
    ? '今天'
    : display.state === 'overdue'
      ? `已逾期 ${Math.abs(display.daysFromToday || 0)} 天`
      : '';
  const accessibleLabel = relativeLabel ? `${relativeLabel}，${display.fullDate}` : display.fullDate;

  return (
    <time
      dateTime={display.value || undefined}
      title={accessibleLabel}
      aria-label={accessibleLabel}
      data-date-state={display.state}
      className={`action-date tabular-nums ${className}`.trim()}
    >
      {display.text}
    </time>
  );
};

interface ActionDateProps extends Omit<ActionDateTextProps, 'display'> {
  value?: string | null;
  active?: boolean;
}

export const ActionDate: React.FC<ActionDateProps> = ({ value, active = true, className }) => {
  const display = useActionDateDisplay(value, active);
  return <ActionDateText display={display} className={className} />;
};
