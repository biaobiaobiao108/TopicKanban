import React, { useState, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Topic, TopicStatus } from '../../types';
import { StatusBadge, PriorityBadge } from '../ui/Badge';
import { Search, GripVertical, CalendarPlus, X, Filter } from 'lucide-react';

interface UnscheduledTopicPoolProps {
  topics: Topic[];
  isOpen: boolean;
  onClose: () => void;
  onOpenDetail: (topicId: string) => void;
  onScheduleTopic: (topic: Topic) => void;
}

function DraggableTopicCard({
  topic,
  onOpenDetail,
  onScheduleTopic,
}: {
  topic: Topic;
  onOpenDetail: (id: string) => void;
  onScheduleTopic: (topic: Topic) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `unscheduled:${topic.id}`,
    data: { type: 'unscheduled-topic', topic },
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 999 : undefined,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3 rounded-xl border border-stone-200/70 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-2xs hover:shadow-card hover:border-stone-300 dark:hover:border-stone-700 transition-all flex flex-col gap-2 group ${
        isDragging ? 'ring-2 ring-rose-500 shadow-xl' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={topic.status} />
          <PriorityBadge priority={topic.priority} />
        </div>

        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          title="按住拖拽至日历定档"
          className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-grab active:cursor-grabbing rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
      </div>

      <h5
        onClick={() => onOpenDetail(topic.id)}
        className="text-xs font-bold text-stone-900 dark:text-stone-100 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors line-clamp-2 cursor-pointer leading-snug"
      >
        {topic.title}
      </h5>

      {topic.next_action && (
        <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate bg-stone-500/[0.03] dark:bg-stone-800/40 px-2 py-1 rounded-md">
          下一步: {topic.next_action}
        </div>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-stone-100 dark:border-stone-800/80 text-[10px] text-stone-400">
        <span className="font-mono">
          {(topic.draft_word_count || 0) > 0 ? `${topic.draft_word_count}字` : '未动笔'}
        </span>

        <button
          type="button"
          onClick={() => onScheduleTopic(topic)}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
        >
          <CalendarPlus className="w-3 h-3" />
          <span>定档</span>
        </button>
      </div>
    </div>
  );
}

export const UnscheduledTopicPool: React.FC<UnscheduledTopicPoolProps> = ({
  topics,
  isOpen,
  onClose,
  onOpenDetail,
  onScheduleTopic,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Filter unscheduled topics
  const unscheduledTopics = useMemo(() => {
    return topics.filter((topic) => {
      if (topic.deleted_at || topic.status === 'published' || topic.status === 'icebox') return false;
      if (topic.target_publish_date) return false;
      if (statusFilter !== 'all' && topic.status !== statusFilter) return false;
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesTitle = topic.title.toLowerCase().includes(query);
        const matchesSummary = topic.summary?.toLowerCase().includes(query);
        const matchesAction = topic.next_action?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesSummary && !matchesAction) return false;
      }
      return true;
    });
  }, [topics, statusFilter, search]);

  if (!isOpen) return null;

  return (
    <aside className="w-80 border-l border-stone-200/70 dark:border-stone-800 bg-white/95 dark:bg-stone-900/95 backdrop-blur-sm flex flex-col h-full shrink-0 shadow-subtle z-20 transition-colors select-none">
      {/* Header */}
      <div className="p-4 border-b border-stone-200/70 dark:border-stone-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">待排期选题池</h3>
          <span className="text-xs font-mono font-bold bg-rose-500/10 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-full">
            {unscheduledTopics.length}
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-3 border-b border-stone-200/70 dark:border-stone-800 space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder="搜索待排期选题..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-stone-500/[0.04] dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 focus:outline-none focus:border-rose-500 text-stone-900 dark:text-stone-100"
          />
        </div>

        {/* Stage Pills */}
        <div className="flex items-center gap-1 overflow-x-auto text-[11px]">
          {[
            { id: 'all', label: '全部' },
            { id: 'approved', label: '已立项' },
            { id: 'scripting', label: '写稿中' },
            { id: 'production', label: '制作中' },
            { id: 'inbox', label: '收集箱' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStatusFilter(item.id)}
              className={`px-2 py-1 rounded-lg font-semibold transition-colors cursor-pointer shrink-0 ${
                statusFilter === item.id
                  ? 'bg-stone-900 text-white dark:bg-rose-600'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200/60 dark:hover:bg-stone-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Topics Stream */}
      <div className="flex-1 p-3 space-y-2.5 overflow-y-auto min-h-0">
        <div className="text-[11px] text-stone-400 dark:text-stone-500 px-1">
          💡 提示：按住卡片右侧把手可直接拖拽至左侧日历日期定档
        </div>

        {unscheduledTopics.map((topic) => (
          <DraggableTopicCard
            key={topic.id}
            topic={topic}
            onOpenDetail={onOpenDetail}
            onScheduleTopic={onScheduleTopic}
          />
        ))}

        {unscheduledTopics.length === 0 && (
          <div className="py-12 text-center text-xs text-stone-400 dark:text-stone-500">
            {search || statusFilter !== 'all' ? '无匹配选题' : '所有活跃选题均已定档！'}
          </div>
        )}
      </div>
    </aside>
  );
};
