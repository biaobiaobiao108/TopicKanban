import React from 'react';
import { Priority, TopicStatus, SourceType, VerificationStatus, PlatformType } from '../../types';

interface BadgeProps {
  children?: React.ReactNode;
  variant?: 'default' | 'outline' | 'subtle' | 'pill';
  className?: string;
}

export const StatusBadge: React.FC<{ status: TopicStatus; size?: 'sm' | 'md' }> = ({ status, size = 'sm' }) => {
  const configs: Record<TopicStatus, { label: string; bg: string; text: string; border: string }> = {
    inbox: {
      label: '收集箱',
      bg: 'bg-stone-100 dark:bg-stone-800/80',
      text: 'text-stone-700 dark:text-stone-300',
      border: 'border-stone-200 dark:border-stone-700',
    },
    approved: {
      label: '已立项',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      text: 'text-emerald-800 dark:text-emerald-300',
      border: 'border-emerald-200 dark:border-emerald-800/60',
    },
    scripting: {
      label: '写稿中',
      bg: 'bg-indigo-50 dark:bg-indigo-950/40',
      text: 'text-indigo-800 dark:text-indigo-300',
      border: 'border-indigo-200 dark:border-indigo-800/60',
    },
    production: {
      label: '待制作',
      bg: 'bg-purple-50 dark:bg-purple-950/40',
      text: 'text-purple-800 dark:text-purple-300',
      border: 'border-purple-200 dark:border-purple-800/60',
    },
    published: {
      label: '已发布',
      bg: 'bg-teal-50 dark:bg-teal-950/40',
      text: 'text-teal-800 dark:text-teal-300',
      border: 'border-teal-200 dark:border-teal-800/60',
    },
    icebox: {
      label: '搁置',
      bg: 'bg-stone-100 dark:bg-stone-800/50',
      text: 'text-stone-500 dark:text-stone-400',
      border: 'border-stone-200 dark:border-stone-700',
    },
  };

  const c = configs[status] || configs.inbox;
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm font-medium';

  return (
    <span className={`inline-flex items-center rounded-md border font-medium ${c.bg} ${c.text} ${c.border} ${padding}`}>
      {c.label}
    </span>
  );
};

export const PriorityBadge: React.FC<{ priority: Priority; showLabel?: boolean }> = ({ priority, showLabel = true }) => {
  const configs: Record<Priority, { label: string; bg: string; dot: string }> = {
    high: {
      label: '高',
      bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300',
      dot: 'bg-rose-500 dark:bg-rose-400',
    },
    medium: {
      label: '中',
      bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-300',
      dot: 'bg-amber-500 dark:bg-amber-400',
    },
    low: {
      label: '低',
      bg: 'bg-stone-100 dark:bg-stone-800/70 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300',
      dot: 'bg-stone-400 dark:bg-stone-500',
    },
    none: {
      label: '无',
      bg: 'bg-stone-50 dark:bg-stone-800/40 border-stone-200 dark:border-stone-700/60 text-stone-400 dark:text-stone-500',
      dot: 'bg-stone-300 dark:bg-stone-600',
    },
  };

  const c = configs[priority] || configs.none;

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap select-none ${c.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
      {showLabel && c.label}
    </span>
  );
};

export const SourceTypeBadge: React.FC<{ type: SourceType }> = ({ type }) => {
  const configs: Record<SourceType, { label: string; bg: string; text: string; border: string }> = {
    fact: {
      label: '事实',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      text: 'text-emerald-700 dark:text-emerald-300',
      border: 'border-emerald-200 dark:border-emerald-800/60',
    },
    clue: {
      label: '线索',
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-200 dark:border-amber-800/60',
    },
    material: {
      label: '素材',
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      text: 'text-blue-700 dark:text-blue-300',
      border: 'border-blue-200 dark:border-blue-800/60',
    },
  };

  const c = configs[type] || configs.fact;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${c.bg} ${c.text} ${c.border}`}>
      {c.label}
    </span>
  );
};

export const VerificationBadge: React.FC<{ status: VerificationStatus }> = ({ status }) => {
  const configs: Record<VerificationStatus, { label: string; bg: string; icon: string }> = {
    confirmed: {
      label: '已确认',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
      icon: '✓',
    },
    unverified: {
      label: '待核实',
      bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
      icon: '?',
    },
    rejected: {
      label: '不采用',
      bg: 'bg-stone-100 dark:bg-stone-800/60 text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-700 line-through',
      icon: '✕',
    },
  };

  const c = configs[status] || configs.unverified;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${c.bg}`}>
      <span className="font-bold">{c.icon}</span>
      {c.label}
    </span>
  );
};

export const PlatformBadge: React.FC<{ platform: PlatformType }> = ({ platform }) => {
  const names: Record<PlatformType, string> = {
    bilibili: 'Bilibili',
    douyin: '抖音',
    kuaishou: '快手',
    weibo: '微博',
    xiaohongshu: '小红书',
    wechat: '微信',
    zhihu: '知乎',
    youtube: 'YouTube',
    news: '新闻网站',
    live: '直播切片',
    other: '其他',
  };

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs font-medium border border-stone-200 dark:border-stone-700">
      {names[platform] || platform}
    </span>
  );
};

export const TagPill: React.FC<{ name: string; onRemove?: () => void }> = ({ name, onRemove }) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200/80 dark:border-stone-700 rounded-md text-xs font-medium">
    #{name}
    {onRemove && (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="hover:text-stone-900 dark:hover:text-stone-100 text-stone-400 dark:text-stone-500 ml-0.5 cursor-pointer"
      >
        ×
      </button>
    )}
  </span>
);
