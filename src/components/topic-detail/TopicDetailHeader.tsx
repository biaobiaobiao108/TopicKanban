import React, { useState, useEffect, useRef } from 'react';
import { Topic, TopicStatus, Priority } from '../../types';
import { StatusBadge, PriorityBadge } from '../ui/Badge';
import { COLUMNS } from '../kanban/columns';
import {
  ArrowLeft,
  Pin,
  Trash2,
  Save,
  Clock,
  Sparkles,
  CheckCircle2,
  Flame,
  Check,
  Edit2,
  ChevronDown,
  FileDown,
} from 'lucide-react';
import { NextActionDialog } from './NextActionDialog';
import { getNextActionAgeDays, getNextActionWarning } from '../../lib/topicMetrics';
import { ReadinessBadge } from '../ui/ReadinessBadge';

const statusDots: Record<TopicStatus, string> = {
  inbox: 'bg-stone-400',
  approved: 'bg-emerald-500',
  scripting: 'bg-indigo-500',
  production: 'bg-purple-500',
  published: 'bg-teal-500',
  icebox: 'bg-stone-300',
};

const priorityConfig: Record<Priority, { label: string; dot: string; desc: string }> = {
  high: { label: '高优', dot: 'bg-rose-500', desc: '重点攻坚' },
  medium: { label: '中优', dot: 'bg-amber-500', desc: '标准节奏' },
  low: { label: '低优', dot: 'bg-blue-500', desc: '空闲跟进' },
  none: { label: '无优先级', dot: 'bg-stone-300 dark:bg-stone-600', desc: '未设定' },
};

interface TopicDetailHeaderProps {
  topic: Topic;
  onBack: () => void;
  onUpdateTopic: (updates: Partial<Topic>) => Promise<void>;
  onDeleteTopic: (topicId: string) => Promise<void>;
  onExportMarkdown?: () => void;
}

export const TopicDetailHeader: React.FC<TopicDetailHeaderProps> = ({
  topic,
  onBack,
  onUpdateTopic,
  onDeleteTopic,
  onExportMarkdown,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(topic.title);
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [isPriorityMenuOpen, setIsPriorityMenuOpen] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);
  const priorityMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setIsStatusMenuOpen(false);
      }
      if (priorityMenuRef.current && !priorityMenuRef.current.contains(e.target as Node)) {
        setIsPriorityMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsStatusMenuOpen(false);
        setIsPriorityMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const totalScore =
    (topic.score_character || 0) +
    (topic.score_conflict || 0) +
    (topic.score_contrast || 0) +
    (topic.score_material || 0) +
    (topic.score_story || 0);
  const statusLabel = COLUMNS.find((column) => column.status === topic.status)?.label || topic.status;

  const handleSaveTitle = async () => {
    if (title.trim() && title !== topic.title) {
      await onUpdateTopic({ title: title.trim() });
    }
    setIsEditingTitle(false);
  };

  return (
    <div className="bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 px-4 sm:px-8 py-3.5 sm:py-5 shrink-0 space-y-3 sm:space-y-4 transition-colors">
      {/* Top action row */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs sm:text-sm text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 font-medium px-2 py-1 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Archive / Restore toggle */}
          {topic.status === 'published' || topic.status === 'icebox' ? (
            <button
              onClick={() => onUpdateTopic({ status: 'approved' })}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 transition-colors cursor-pointer"
              title="从归档中恢复至已立项（重返全景看板）"
            >
              <span>↩ 恢复立项</span>
            </button>
          ) : (
            <button
              onClick={() => {
                const choice = window.confirm('点击【确定】归档为「已发布成片」，点击【取消】归档为「搁置库」');
                onUpdateTopic({ status: choice ? 'published' : 'icebox' });
              }}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 hover:bg-stone-200/80 dark:hover:bg-stone-700 transition-colors cursor-pointer"
              title="将此选题移入归档库（将从全景看板中移出）"
            >
              <span>📦 归档</span>
            </button>
          )}

          {/* Export single topic markdown */}
          {onExportMarkdown && (
            <button
              onClick={onExportMarkdown}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors cursor-pointer"
              title="导出包含立项设定、故事评估、事实证据链、时间线与完整文案的 Markdown 档案"
            >
              <FileDown className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
              <span>导出 MD</span>
            </button>
          )}

          {/* Pin toggle */}
          <button
            onClick={() => onUpdateTopic({ is_pinned: topic.is_pinned ? 0 : 1 })}
            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              topic.is_pinned
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                : 'bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700'
            }`}
          >
            <Pin className={`w-3.5 h-3.5 ${topic.is_pinned ? 'fill-amber-600 dark:fill-amber-400 text-amber-600 dark:text-amber-400' : ''}`} />
            <span>{topic.is_pinned ? '已置顶' : '置顶'}</span>
          </button>

          {/* Delete topic */}
          <button
            onClick={async () => {
              if (window.confirm(`确定要将选题「${topic.title}」移入回收站吗？\n\n之后可以在选题库的回收站中恢复。`)) {
                await onDeleteTopic(topic.id);
                onBack();
              }
            }}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
            title="移入回收站"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>删除</span>
          </button>
        </div>
      </div>

      {/* Main Title & Status Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1 flex-1 min-w-0 w-full">
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                className="text-lg sm:text-2xl font-bold text-stone-900 dark:text-stone-100 border-b-2 border-stone-900 dark:border-rose-500 bg-transparent outline-none pb-1 w-full"
              />
              <button
                onClick={handleSaveTitle}
                className="px-3 py-1 bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white rounded text-xs font-medium shrink-0 cursor-pointer"
              >
                保存
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h1 className="text-lg sm:text-2xl font-extrabold text-stone-900 dark:text-stone-100 tracking-tight leading-snug break-words">
                {topic.title}
              </h1>
              <button
                onClick={() => setIsEditingTitle(true)}
                className="opacity-60 sm:opacity-0 group-hover:opacity-100 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 p-1 rounded transition-opacity cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2.5 text-xs text-stone-500 dark:text-stone-400 font-medium flex-wrap">
            <span>最后修改于 {new Date(topic.updated_at).toLocaleDateString()}</span>
            {totalScore > 0 && (
              <span className="font-mono text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 text-[11px]">
                综合评分: {totalScore} / 10
              </span>
            )}
            <span className="hidden text-stone-300 dark:text-stone-600 sm:inline">|</span>
            <span className="font-semibold text-stone-700 dark:text-stone-300">{statusLabel}</span>
            <ReadinessBadge topic={topic} />
            <span>{topic.verified_facts_count || 0} 条已核实事实</span>
            <span>{topic.materials_count || 0} 条素材</span>
            <span>{topic.draft_word_count || 0} 字</span>
          </div>
        </div>

        {/* Controls: Status & Priority Popovers */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {/* Status Switcher Popover */}
          <div className="relative" ref={statusMenuRef}>
            <button
              type="button"
              onClick={() => {
                setIsStatusMenuOpen(!isStatusMenuOpen);
                setIsPriorityMenuOpen(false);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-stone-200 bg-stone-100/90 dark:bg-stone-800 hover:bg-stone-200/80 dark:hover:bg-stone-700 border border-stone-200/90 dark:border-stone-700 px-2.5 py-1.5 rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="修改选题阶段"
            >
              <span className={`w-2 h-2 rounded-full ${statusDots[topic.status] || 'bg-stone-400'}`} />
              <span className="text-[11px] text-stone-400 dark:text-stone-400 font-normal">阶段:</span>
              <span>{statusLabel}</span>
              <ChevronDown className="w-3 h-3 text-stone-400 dark:text-stone-500" />
            </button>

            {isStatusMenuOpen && (
              <div
                className="absolute right-0 top-9 z-50 w-44 bg-white dark:bg-stone-900 rounded-xl shadow-modal border border-stone-200 dark:border-stone-800 p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
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
                      void onUpdateTopic({ status: c.status });
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                      topic.status === c.status
                        ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-bold'
                        : 'text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${statusDots[c.status]}`} />
                      <span>{c.label}</span>
                    </div>
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
                    void onUpdateTopic({ status: 'published' });
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                    topic.status === 'published'
                      ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-bold'
                      : 'text-stone-600 dark:text-stone-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-800 dark:hover:text-emerald-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-500" />
                    <span>已发布</span>
                  </div>
                  {topic.status === 'published' && <span className="text-emerald-600 dark:text-emerald-400 text-xs">✓</span>}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsStatusMenuOpen(false);
                    void onUpdateTopic({ status: 'icebox' });
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                    topic.status === 'icebox'
                      ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-bold'
                      : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-stone-300 dark:bg-stone-600" />
                    <span>搁置</span>
                  </div>
                  {topic.status === 'icebox' && <span className="text-stone-600 dark:text-stone-400 text-xs">✓</span>}
                </button>
              </div>
            )}
          </div>

          {/* Priority Switcher Popover */}
          <div className="relative" ref={priorityMenuRef}>
            <button
              type="button"
              onClick={() => {
                setIsPriorityMenuOpen(!isPriorityMenuOpen);
                setIsStatusMenuOpen(false);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-stone-200 bg-stone-100/90 dark:bg-stone-800 hover:bg-stone-200/80 dark:hover:bg-stone-700 border border-stone-200/90 dark:border-stone-700 px-2.5 py-1.5 rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="设置选题优先级"
            >
              <span className={`w-2 h-2 rounded-full ${priorityConfig[topic.priority]?.dot || 'bg-stone-300'}`} />
              <span className="text-[11px] text-stone-400 dark:text-stone-400 font-normal">优先级:</span>
              <span>{priorityConfig[topic.priority]?.label || '未设'}</span>
              <ChevronDown className="w-3 h-3 text-stone-400 dark:text-stone-500" />
            </button>

            {isPriorityMenuOpen && (
              <div
                className="absolute right-0 top-9 z-50 w-40 bg-white dark:bg-stone-900 rounded-xl shadow-modal border border-stone-200 dark:border-stone-800 p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                  优先级设定
                </div>
                {(['high', 'medium', 'low', 'none'] as Priority[]).map((p) => {
                  const cfg = priorityConfig[p];
                  const isSelected = topic.priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setIsPriorityMenuOpen(false);
                        void onUpdateTopic({ priority: p });
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-bold'
                          : 'text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                        <span>{cfg.label}</span>
                        <span className="text-[10px] text-stone-400 font-normal">({cfg.desc})</span>
                      </div>
                      {isSelected && <span className="text-rose-600 dark:text-rose-400 text-xs">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Next Action Interactive Bar */}
      <div className="bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl p-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="w-2 h-2 rounded-full bg-rose-600 dark:bg-rose-500 shrink-0" />
          <span className="text-xs font-bold text-rose-800 dark:text-rose-300 shrink-0">下一步行动:</span>
          <span className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate flex-1">
            {topic.next_action || '尚未设置明确的下一步行动'}
          </span>
          {topic.next_action && (
            <span className="hidden text-[11px] font-medium text-stone-500 dark:text-stone-400 sm:inline">
              已持续 {getNextActionAgeDays(topic)} 天
            </span>
          )}
        </div>

        <button
          onClick={() => setIsActionDialogOpen(true)}
          className="min-h-10 text-xs text-white bg-rose-600 hover:bg-rose-700 font-semibold px-3 py-1 rounded-lg transition-colors shrink-0 cursor-pointer shadow-2xs"
        >
          {topic.next_action ? '完成 / 续接' : '设置行动'}
        </button>
      </div>
      {getNextActionWarning(topic) && (
        <div className="text-xs font-semibold text-amber-700 dark:text-amber-300">⚠ {getNextActionWarning(topic)}</div>
      )}
      <NextActionDialog
        isOpen={isActionDialogOpen}
        topic={topic}
        onClose={() => setIsActionDialogOpen(false)}
        onUpdate={onUpdateTopic}
      />
    </div>
  );
};
