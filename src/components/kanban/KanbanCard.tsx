import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Topic, TopicStatus } from '../../types';
import { PriorityBadge } from '../ui/Badge';
import { COLUMNS } from './columns';
import {
  Pin,
  ChevronDown,
} from 'lucide-react';
import { ReadinessBadge } from '../ui/ReadinessBadge';
import { getNextActionAgeDays, getNextActionWarning } from '../../lib/topicMetrics';

interface KanbanCardProps {
  topic: Topic;
  onOpenDetail: (topicId: string) => void;
  onDeleteTopic: (topicId: string) => void;
  onTogglePin: (topicId: string) => void;
  onUpdateStatus?: (topicId: string, status: TopicStatus) => void;
  sortableDisabled?: boolean;
  staleThresholdDays?: number;
}

const KanbanCardComponent: React.FC<KanbanCardProps> = ({
  topic,
  onOpenDetail,
  onDeleteTopic,
  onTogglePin,
  onUpdateStatus,
  sortableDisabled = false,
  staleThresholdDays = 5,
}) => {
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: topic.id,
    disabled: sortableDisabled,
    data: {
      type: 'topic',
      topic,
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  const statusAccent: Record<TopicStatus, string> = {
    inbox: 'border-l-stone-400',
    approved: 'border-l-emerald-500',
    scripting: 'border-l-indigo-500',
    production: 'border-l-purple-500',
    published: 'border-l-teal-500',
    icebox: 'border-l-stone-300',
  };
  const actionWarning = getNextActionWarning(topic, new Date(), staleThresholdDays);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpenDetail(topic.id)}
      className={`group relative bg-white dark:bg-stone-900 rounded-xl border border-l-4 ${statusAccent[topic.status]} border-stone-200/90 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600 p-3 shadow-subtle hover:shadow-card-hover transition-all ${sortableDisabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} flex flex-col gap-2 select-none ${
        topic.is_pinned ? 'ring-1 ring-amber-400/60 bg-amber-50/15 dark:bg-amber-950/20' : ''
      }`}
    >
      {/* Top row: Priority, Pin & Quick Stage */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {topic.is_pinned === 1 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 px-1.5 py-0.5 rounded">
              <Pin className="w-3 h-3 fill-amber-600 dark:fill-amber-400" />
              置顶
            </span>
          )}
          <PriorityBadge priority={topic.priority} />
        </div>

        <div className="flex items-center gap-1.5">
          {/* Direct Status Selector Dropdown */}
          {onUpdateStatus && (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsStatusMenuOpen(!isStatusMenuOpen);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 bg-stone-100/90 dark:bg-stone-800 hover:bg-stone-200/80 dark:hover:bg-stone-700 border border-stone-200/80 dark:border-stone-700 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                title="快速流转阶段"
              >
                <span>流转</span>
                <ChevronDown className="w-3 h-3 text-stone-400 dark:text-stone-500" />
              </button>

              {isStatusMenuOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  onMouseLeave={() => setIsStatusMenuOpen(false)}
                  className="absolute right-0 top-7 z-40 w-36 bg-white dark:bg-stone-900 rounded-xl shadow-modal border border-stone-200 dark:border-stone-800 p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                    活跃生产阶段
                  </div>
                  {COLUMNS.filter((c) => c.status !== 'published' && c.status !== 'icebox').map((c) => (
                    <button
                      key={c.status}
                      type="button"
                      onClick={() => {
                        setIsStatusMenuOpen(false);
                        onUpdateStatus(topic.id, c.status);
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                        topic.status === c.status
                          ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-bold'
                          : 'text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100'
                      }`}
                    >
                      <span>{c.label}</span>
                      {topic.status === c.status && <span className="text-rose-600 dark:text-rose-400 text-xs">✓</span>}
                    </button>
                  ))}

                  <div className="my-1 border-t border-stone-100 dark:border-stone-800" />
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                    归档状态
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsStatusMenuOpen(false);
                      onUpdateStatus(topic.id, 'published');
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                      topic.status === 'published'
                        ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-bold'
                        : 'text-stone-600 dark:text-stone-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-800 dark:hover:text-emerald-300'
                    }`}
                  >
                    <span>已发布</span>
                    {topic.status === 'published' && <span className="text-emerald-600 dark:text-emerald-400 text-xs">✓</span>}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsStatusMenuOpen(false);
                      onUpdateStatus(topic.id, 'icebox');
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                      topic.status === 'icebox'
                        ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-bold'
                        : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100'
                    }`}
                  >
                    <span>搁置</span>
                    {topic.status === 'icebox' && <span className="text-stone-600 dark:text-stone-400 text-xs">✓</span>}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Title */}
      <h4 className="text-[15px] font-bold text-stone-900 dark:text-stone-100 leading-snug tracking-tight group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors line-clamp-2">
        {topic.title}
      </h4>

      {/* Next Action Highlight Bar */}
      {topic.next_action ? (
        <div className="bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-900/50 hover:border-rose-300 dark:hover:border-rose-700 rounded-lg p-2 flex items-start gap-2 text-xs text-rose-900 dark:text-rose-200 transition-colors">
          <div className="w-1.5 h-1.5 rounded-full bg-rose-500 dark:bg-rose-400 mt-1.5 shrink-0 animate-pulse" />
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-rose-700 dark:text-rose-400 mr-1">下一步:</span>
            <span className="font-medium">{topic.next_action}</span>
          </div>
        </div>
      ) : (
        <div className="border border-dashed border-stone-200 dark:border-stone-800 rounded-lg p-1 text-[11px] text-stone-400 dark:text-stone-500 text-center">
          未设置下一步行动
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className={actionWarning ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-stone-400 dark:text-stone-500'}>
          {actionWarning || `行动持续 ${getNextActionAgeDays(topic)} 天`}
        </span>
        <div className="flex items-center gap-1.5">
          <ReadinessBadge topic={topic} showLabel={false} />
          <span className="font-mono font-semibold text-stone-500 dark:text-stone-400">{topic.draft_word_count || 0}字</span>
        </div>
      </div>

      {/* Secondary context */}
      <div className="flex items-center justify-between pt-1 border-t border-stone-100 dark:border-stone-800 text-[11px] text-stone-400 dark:text-stone-500">
        <div className="min-w-0 truncate pr-2">
          {topic.people?.slice(0, 2).map((person) => person.name).join(' / ') || '未关联人物'}
          {topic.tags?.length ? ` · ${topic.tags.slice(0, 2).map((tag) => `#${tag.name}`).join(' ')}` : ''}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(topic.id);
            }}
            title={topic.is_pinned ? '取消置顶' : '置顶'}
            className="p-1 hover:text-amber-600 dark:hover:text-amber-400 rounded cursor-pointer"
          >
            <Pin className={`w-3.5 h-3.5 ${topic.is_pinned ? 'fill-amber-500 text-amber-500' : 'text-stone-300 dark:text-stone-600 hover:text-stone-500'}`} />
          </button>
        </div>
      </div>
    </div>
  );
};

export const KanbanCard = React.memo(KanbanCardComponent);
