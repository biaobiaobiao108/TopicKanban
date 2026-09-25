import React from 'react';
import { Priority, TopicStatus, VerificationStatus, PlatformType } from '../../types';

export const StatusBadge: React.FC<{ status: TopicStatus; size?: 'sm' | 'md' }> = ({ status, size = 'sm' }) => {
  const configs: Record<TopicStatus, { label: string; dot: string; text: string }> = {
    inbox: {
      label: '收集箱',
      dot: 'bg-[var(--ink-muted)] opacity-60',
      text: 'text-[var(--ink-muted)]',
    },
    scripting: {
      label: '写稿中',
      dot: 'bg-[#9b6a2f]',
      text: 'text-[#9b6a2f] dark:text-[#c49258] font-medium',
    },
    production: {
      label: '待制作',
      dot: 'bg-[#6b4f73]',
      text: 'text-[#6b4f73] dark:text-[#a882b3] font-medium',
    },
    published: {
      label: '已发布',
      dot: 'bg-[var(--accent)]',
      text: 'text-[var(--accent)] font-medium',
    },
    icebox: {
      label: '搁置',
      dot: 'bg-[var(--ink-muted)] opacity-40',
      text: 'text-[var(--ink-muted)] opacity-75',
    },
  };

  const c = configs[status] || configs.inbox;
  const textSize = size === 'sm' ? 'text-[11px]' : 'text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 select-none ${textSize} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
      <span>{c.label}</span>
    </span>
  );
};

export const PriorityBadge: React.FC<{ priority: Priority; showLabel?: boolean; showDot?: boolean }> = ({ priority, showLabel = true, showDot = true }) => {
  const configs: Record<Priority, { label: string; dot: string; text: string }> = {
    high: {
      label: '高',
      dot: 'bg-[var(--h1-color)]',
      text: 'text-[var(--h1-color)] font-semibold',
    },
    medium: {
      label: '中',
      dot: 'bg-[var(--accent)]',
      text: 'text-[var(--ink)] font-medium',
    },
    low: {
      label: '低',
      dot: 'bg-[var(--ink-muted)] opacity-60',
      text: 'text-[var(--ink-muted)] font-normal',
    },
    none: {
      label: '无',
      dot: 'bg-[var(--ink-muted)] opacity-30',
      text: 'text-[var(--ink-muted)] opacity-60 font-normal',
    },
  };

  const c = configs[priority] || configs.none;

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] whitespace-nowrap select-none ${c.text}`}>
      {showDot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />}
      {showLabel && <span>{c.label}</span>}
    </span>
  );
};

export const VerificationBadge: React.FC<{ status: VerificationStatus }> = ({ status }) => {
  const configs: Record<VerificationStatus, { label: string; icon: string; text: string }> = {
    confirmed: {
      label: '已确认',
      icon: '✓',
      text: 'text-[var(--accent)] font-medium',
    },
    unverified: {
      label: '待核实',
      icon: '?',
      text: 'text-[#9b6a2f] dark:text-[#c49258] font-medium',
    },
    rejected: {
      label: '不采用',
      icon: '✕',
      text: 'text-[var(--ink-muted)] line-through opacity-70 font-normal',
    },
  };

  const c = configs[status] || configs.unverified;
  return (
    <span className={`inline-flex items-center gap-1 text-xs select-none ${c.text}`}>
      <span className="font-mono text-[11px]">{c.icon}</span>
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
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[var(--canvas)] border border-[var(--line)] text-[var(--ink-muted)] text-[11px] font-normal select-none">
      {names[platform] || platform}
    </span>
  );
};

export const TagPill: React.FC<{ name: string; onRemove?: () => void }> = ({ name, onRemove }) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[var(--canvas)] border border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)] rounded-[var(--radius-sm)] text-xs font-normal select-none transition-colors">
    <span>#{name}</span>
    {onRemove && (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="hover:text-[var(--h1-color)] text-[var(--ink-muted)] ml-0.5 cursor-pointer"
        aria-label={`移除标签 ${name}`}
      >
        ×
      </button>
    )}
  </span>
);
