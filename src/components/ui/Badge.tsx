import React from 'react';
import { Priority, TopicStatus, VerificationStatus, PlatformType } from '../../types';

export const StatusBadge: React.FC<{ status: TopicStatus; size?: 'sm' | 'md' }> = ({ status, size = 'sm' }) => {
  const configs: Record<TopicStatus, { label: string; bg: string; text: string; dot: string }> = {
    inbox: {
      label: '收集箱',
      bg: 'bg-stone-500/10 dark:bg-stone-800/80',
      text: 'text-stone-700 dark:text-stone-300',
      dot: 'bg-stone-400 dark:bg-stone-500',
    },
    approved: {
      label: '已立项',
      bg: 'bg-emerald-500/10 dark:bg-emerald-950/40',
      text: 'text-emerald-700 dark:text-emerald-300',
      dot: 'bg-emerald-500 dark:bg-emerald-400',
    },
    scripting: {
      label: '写稿中',
      bg: 'bg-indigo-500/10 dark:bg-indigo-950/40',
      text: 'text-indigo-700 dark:text-indigo-300',
      dot: 'bg-indigo-500 dark:bg-indigo-400',
    },
    production: {
      label: '待制作',
      bg: 'bg-purple-500/10 dark:bg-purple-950/40',
      text: 'text-purple-700 dark:text-purple-300',
      dot: 'bg-purple-500 dark:bg-purple-400',
    },
    published: {
      label: '已发布',
      bg: 'bg-teal-500/10 dark:bg-teal-950/40',
      text: 'text-teal-700 dark:text-teal-300',
      dot: 'bg-teal-500 dark:bg-teal-400',
    },
    icebox: {
      label: '搁置',
      bg: 'bg-stone-500/10 dark:bg-stone-800/50',
      text: 'text-stone-500 dark:text-stone-400',
      dot: 'bg-stone-300 dark:bg-stone-600',
    },
  };

  const c = configs[status] || configs.inbox;
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium select-none ${c.bg} ${c.text} ${padding}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
      <span>{c.label}</span>
    </span>
  );
};

export const PriorityBadge: React.FC<{ priority: Priority; showLabel?: boolean }> = ({ priority, showLabel = true }) => {
  const configs: Record<Priority, { label: string; bg: string; dot: string }> = {
    high: {
      label: '高',
      bg: 'bg-rose-500/10 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-semibold',
      dot: 'bg-rose-500 dark:bg-rose-400',
    },
    medium: {
      label: '中',
      bg: 'bg-amber-500/10 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium',
      dot: 'bg-amber-500 dark:bg-amber-400',
    },
    low: {
      label: '低',
      bg: 'bg-stone-500/10 dark:bg-stone-800/70 text-stone-600 dark:text-stone-300 font-medium',
      dot: 'bg-stone-400 dark:bg-stone-500',
    },
    none: {
      label: '无',
      bg: 'bg-stone-500/5 dark:bg-stone-800/40 text-stone-400 dark:text-stone-500 font-normal',
      dot: 'bg-stone-300 dark:bg-stone-600',
    },
  };

  const c = configs[priority] || configs.none;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs whitespace-nowrap select-none ${c.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
      {showLabel && <span>{c.label}</span>}
    </span>
  );
};

export const VerificationBadge: React.FC<{ status: VerificationStatus }> = ({ status }) => {
  const configs: Record<VerificationStatus, { label: string; bg: string; icon: string }> = {
    confirmed: {
      label: '已确认',
      bg: 'bg-emerald-500/10 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-medium',
      icon: '✓',
    },
    unverified: {
      label: '待核实',
      bg: 'bg-amber-500/10 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium',
      icon: '?',
    },
    rejected: {
      label: '不采用',
      bg: 'bg-stone-500/10 dark:bg-stone-800/60 text-stone-400 dark:text-stone-500 line-through font-normal',
      icon: '✕',
    },
  };

  const c = configs[status] || configs.unverified;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs select-none ${c.bg}`}>
      <span className="font-bold text-[11px]">{c.icon}</span>
      <span>{c.label}</span>
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
    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 text-xs font-medium select-none">
      {names[platform] || platform}
    </span>
  );
};

export const TagPill: React.FC<{ name: string; onRemove?: () => void }> = ({ name, onRemove }) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-stone-100/90 dark:bg-stone-800/90 text-stone-600 dark:text-stone-300 rounded-md text-xs font-medium select-none transition-colors">
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
