import React, { useState, useEffect, useRef } from 'react';
import { Topic, TopicStatus, Priority } from '../../types';
import { COLUMNS } from '../kanban/columns';
import {
  ArrowLeft,
  Pin,
  Trash2,
  Edit2,
  ChevronDown,
  FileDown,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { NextActionDialog } from './NextActionDialog';
import { getNextActionAgeDays, getNextActionWarning } from '../../lib/topicMetrics';

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
    setTitle(topic.title);
  }, [topic.title]);

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

  const statusLabel = COLUMNS.find((column) => column.status === topic.status)?.label || topic.status;
  const warning = getNextActionWarning(topic);
  const actionDays = getNextActionAgeDays(topic);

  const handleSaveTitle = async () => {
    if (title.trim() && title !== topic.title) {
      await onUpdateTopic({ title: title.trim() });
    }
    setIsEditingTitle(false);
  };

  return (
    <div className="bg-white/95 dark:bg-stone-900/95 backdrop-blur-sm border-b border-stone-200/80 dark:border-stone-800 px-4 sm:px-8 py-2.5 shrink-0 flex items-center justify-between gap-3 min-h-[56px] transition-colors">
      {/* Left group: Back button + Title & Inline Editor + Status & Priority + Next Action Capsule */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 flex-1 min-w-0">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 font-semibold px-2.5 py-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer shrink-0"
          title="返回全景看板"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">返回看板</span>
        </button>

        <span className="text-stone-200 dark:text-stone-700 hidden sm:inline select-none">|</span>

        {/* Title area & Inline Editor */}
        <div className="min-w-0 max-w-[150px] sm:max-w-xs lg:max-w-md flex items-center gap-1.5 shrink">
          {isEditingTitle ? (
            <div className="flex items-center gap-2 w-full">
              <input
                type="text"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') {
                    setTitle(topic.title);
                    setIsEditingTitle(false);
                  }
                }}
                className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100 border-b-2 border-rose-500 bg-transparent outline-none pb-0.5 w-full"
              />
              <button
                type="button"
                onClick={handleSaveTitle}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shrink-0 cursor-pointer shadow-2xs"
              >
                保存
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0 group">
              <h1
                onClick={() => setIsEditingTitle(true)}
                className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100 tracking-tight truncate cursor-pointer hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                title="点击编辑标题"
              >
                {topic.title}
              </h1>
              <button
                type="button"
                onClick={() => setIsEditingTitle(true)}
                className="opacity-60 sm:opacity-0 group-hover:opacity-100 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 p-0.5 rounded-lg transition-opacity cursor-pointer shrink-0"
                title="修改标题"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Status Dropdown Trigger (Compact Pill) */}
        <div className="relative shrink-0" ref={statusMenuRef}>
          <button
            type="button"
            onClick={() => {
              setIsStatusMenuOpen(!isStatusMenuOpen);
              setIsPriorityMenuOpen(false);
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-stone-200 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200/80 dark:hover:bg-stone-700 px-3 py-1 rounded-full transition-colors cursor-pointer select-none"
            title="修改选题生产阶段"
          >
            <span className={`w-2 h-2 rounded-full ${statusDots[topic.status] || 'bg-stone-400'}`} />
            <span>{statusLabel}</span>
            <ChevronDown className="w-3 h-3 text-stone-400 dark:text-stone-500" />
          </button>

          {isStatusMenuOpen && (
            <div
              className="absolute left-0 top-8 z-50 w-44 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md rounded-2xl shadow-modal border border-stone-200/80 dark:border-stone-800 p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
            >
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
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
                  className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
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
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                归档状态
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsStatusMenuOpen(false);
                  void onUpdateTopic({ status: 'published' });
                }}
                className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
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
                className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
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

        {/* Priority Dropdown Trigger (Compact Pill) */}
        <div className="relative shrink-0" ref={priorityMenuRef}>
          <button
            type="button"
            onClick={() => {
              setIsPriorityMenuOpen(!isPriorityMenuOpen);
              setIsStatusMenuOpen(false);
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-stone-200 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200/80 dark:hover:bg-stone-700 px-3 py-1 rounded-full transition-colors cursor-pointer select-none"
            title="设置选题优先级"
          >
            <span className={`w-2 h-2 rounded-full ${priorityConfig[topic.priority]?.dot || 'bg-stone-300'}`} />
            <span>{priorityConfig[topic.priority]?.label || '未设'}</span>
            <ChevronDown className="w-3 h-3 text-stone-400 dark:text-stone-500" />
          </button>

          {isPriorityMenuOpen && (
            <div
              className="absolute left-0 top-8 z-50 w-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md rounded-2xl shadow-modal border border-stone-200/80 dark:border-stone-800 p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
            >
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
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
                    className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
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

        {/* Next Action Capsule: Highly Prominent Hero Pill */}
        <div className="shrink-0 min-w-0 max-w-[220px] sm:max-w-sm lg:max-w-lg">
          {topic.next_action ? (
            <button
              type="button"
              onClick={() => setIsActionDialogOpen(true)}
              className={`group inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs sm:text-[13px] font-bold transition-all cursor-pointer shadow-xs hover:shadow-subtle active:scale-[0.98] max-w-full truncate ${
                warning
                  ? 'bg-amber-500 hover:bg-amber-600 text-amber-950 dark:bg-amber-600 dark:hover:bg-amber-500 dark:text-white'
                  : 'bg-stone-900 hover:bg-stone-800 text-white dark:bg-rose-600 dark:hover:bg-rose-700'
              }`}
              title={`当前核心行动：${topic.next_action} (已持续 ${actionDays} 天) - 点击完成或续接下一步`}
            >
              <Zap className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${warning ? 'text-amber-950 dark:text-amber-200 fill-current' : 'text-amber-300 fill-amber-300 animate-pulse'}`} />
              <span className="truncate">{topic.next_action}</span>
              {warning && (
                <span className="text-[10px] font-extrabold bg-black/20 dark:bg-black/30 text-white px-1.5 py-0.5 rounded-full shrink-0">
                  {warning}
                </span>
              )}
              <span className="text-[10px] sm:text-[11px] font-mono font-bold bg-white/20 dark:bg-black/20 px-2 py-0.5 rounded-full shrink-0">
                {actionDays}d
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsActionDialogOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white text-xs sm:text-[13px] font-bold transition-all cursor-pointer shadow-xs"
              title="当前选题尚未明确下一步行动，点击立即设定！"
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-300" />
              </span>
              <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
              <span className="hidden sm:inline">设定下一步行动</span>
              <span className="sm:hidden">加行动</span>
            </button>
          )}
        </div>
      </div>

      {/* Right group: Actions Toolbar */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Archive / Restore toggle */}
        {topic.status === 'published' || topic.status === 'icebox' ? (
          <button
            type="button"
            onClick={() => onUpdateTopic({ status: 'approved' })}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer"
            title="从归档中恢复至已立项（重返全景看板）"
          >
            <span>↩ 恢复</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              const choice = window.confirm('点击【确定】归档为「已发布成片」，点击【取消】归档为「搁置库」');
              onUpdateTopic({ status: choice ? 'published' : 'icebox' });
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200/80 dark:hover:bg-stone-700 transition-colors cursor-pointer"
            title="将此选题移入归档库（将从全景看板中移出）"
          >
            <span>📦 归档</span>
          </button>
        )}

        {/* Export single topic markdown */}
        {onExportMarkdown && (
          <button
            type="button"
            onClick={onExportMarkdown}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200/80 dark:hover:bg-stone-700 transition-colors cursor-pointer"
            title="导出包含设定、事实链、时间线与文案的 Markdown 档案"
          >
            <FileDown className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
            <span className="hidden sm:inline">导出</span>
          </button>
        )}

        {/* Pin toggle */}
        <button
          type="button"
          onClick={() => onUpdateTopic({ is_pinned: topic.is_pinned ? 0 : 1 })}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            topic.is_pinned
              ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
              : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200/80 dark:hover:bg-stone-700'
          }`}
          title={topic.is_pinned ? '取消置顶' : '置顶选题'}
        >
          <Pin className={`w-3.5 h-3.5 ${topic.is_pinned ? 'fill-amber-600 dark:fill-amber-400 text-amber-600 dark:text-amber-400' : ''}`} />
          <span className="hidden sm:inline">{topic.is_pinned ? '已置顶' : '置顶'}</span>
        </button>

        {/* Delete topic */}
        <button
          type="button"
          onClick={async () => {
            if (window.confirm(`确定要将选题「${topic.title}」移入回收站吗？\n\n之后可以在选题库的回收站中恢复。`)) {
              await onDeleteTopic(topic.id);
              onBack();
            }
          }}
          className="flex items-center gap-1 p-1.5 text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors cursor-pointer"
          title="移入回收站"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <NextActionDialog
        isOpen={isActionDialogOpen}
        topic={topic}
        onClose={() => setIsActionDialogOpen(false)}
        onUpdate={onUpdateTopic}
      />
    </div>
  );
};
