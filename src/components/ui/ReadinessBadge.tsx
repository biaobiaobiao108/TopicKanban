import React from 'react';
import type { Topic } from '../../types';
import { getTopicReadiness } from '../../lib/topicMetrics';

interface ReadinessBadgeProps {
  topic: Topic;
  showLabel?: boolean;
}

export const ReadinessBadge: React.FC<ReadinessBadgeProps> = ({ topic, showLabel = true }) => {
  const readiness = getTopicReadiness(topic);
  const tone = readiness.score >= 80
    ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
    : readiness.score >= 50
      ? 'border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
      : 'border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800/70 text-stone-600 dark:text-stone-300';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold ${tone}`}
      title={readiness.nextGap ? `下一项：补齐${readiness.nextGap}` : '开工条件已齐备'}
    >
      {showLabel && '准备度 '}{readiness.score}%
    </span>
  );
};
