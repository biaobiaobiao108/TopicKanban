import React, { useId, useState, useEffect, useRef } from 'react';
import { Topic, TopicStatus, Priority } from '../../types';
import { COLUMNS } from '../kanban/columns';
import {
  Pin,
  Trash2,
  Edit2,
  ChevronDown,
  FileDown,
  FileText,
  MoreHorizontal,
  Archive,
} from 'lucide-react';
import { FloatingMenu } from '../ui/FloatingMenu';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { FloatingScrollbar } from '../ui/FloatingScrollbar';

const statusDots: Record<TopicStatus, string> = {
  inbox: 'bg-stone-400',
  scripting: 'bg-indigo-500',
  production: 'bg-purple-500',
  published: 'bg-teal-500',
  icebox: 'bg-stone-300',
};

const priorityConfig: Record<Priority, { label: string; dot: string; desc: string }> = {
  high: { label: '高优', dot: 'bg-amber-600 dark:bg-amber-400', desc: '重点攻坚' },
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
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [isPriorityMenuOpen, setIsPriorityMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const statusTriggerRef = useRef<HTMLButtonElement | null>(null);
  const priorityTriggerRef = useRef<HTMLButtonElement | null>(null);
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null);
  const statusMenuId = useId();
  const priorityMenuId = useId();
  const moreMenuId = useId();

  useEffect(() => {
    setTitle(topic.title);
  }, [topic.title]);

  const statusLabel = COLUMNS.find((column) => column.status === topic.status)?.label || topic.status;

  const handleSaveTitle = async () => {
    if (title.trim() && title !== topic.title) {
      await onUpdateTopic({ title: title.trim() });
    }
    setIsEditingTitle(false);
  };

  return (
    <div data-testid="topic-detail-header" data-page-header className="col-span-full min-w-0 border-b border-[var(--line)] pb-4 transition-colors">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-y-0">
        <div className="col-span-2 flex min-w-0 items-center gap-3 sm:col-span-1">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 max-w-full flex-1 items-center gap-1.5">
            {isEditingTitle ? (
              <div className="flex w-full items-center gap-2">
                <input
                  type="text"
                  id="topic-title"
                  name="title"
                  autoFocus
                  aria-label="编辑选题标题"
                  autoComplete="off"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') {
                      setTitle(topic.title);
                      setIsEditingTitle(false);
                    }
                  }}
                  className="w-full border-b border-[var(--accent)] bg-transparent pb-1 font-sans text-xl text-[var(--ink)] outline-none sm:text-2xl"
                />
                <button
                  onClick={handleSaveTitle}
                  className="text-xs text-[var(--accent)] hover:underline shrink-0 cursor-pointer font-medium"
                >
                  保存
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                <h1
                  onClick={() => setIsEditingTitle(true)}
                  title="点击快速编辑标题"
                  className="min-w-0 truncate font-sans text-xl font-bold leading-tight tracking-tight text-[var(--ink)] transition-colors hover:text-[var(--accent)] sm:text-2xl"
                >
                  {topic.title}
                </h1>
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="text-[var(--ink-muted)] hover:text-[var(--ink)] p-1 rounded-[var(--radius-sm)] shrink-0 cursor-pointer transition-colors"
                  title="编辑标题"
                  aria-label="编辑选题标题"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-1.5 sm:col-span-1 sm:justify-end sm:gap-2">
          {/* Production stage */}
          <div className="relative z-10 shrink-0">
            <button
              type="button"
              ref={statusTriggerRef}
              aria-expanded={isStatusMenuOpen}
              aria-controls={isStatusMenuOpen ? statusMenuId : undefined}
              onClick={() => {
                setIsStatusMenuOpen(!isStatusMenuOpen);
                setIsPriorityMenuOpen(false);
              }}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer select-none ${isStatusMenuOpen ? 'bg-[var(--surface)] text-[var(--ink)]' : 'text-[var(--ink)] hover:bg-[var(--surface)]'}`}
              title="修改选题生产阶段"
            >
              <span className={`w-2 h-2 rounded-full ${statusDots[topic.status] || 'bg-stone-400'}`} />
              <span>{statusLabel}</span>
              <ChevronDown className="w-3 h-3 text-[var(--ink-muted)]" />
            </button>

            <FloatingMenu
              isOpen={isStatusMenuOpen}
              anchorRef={statusTriggerRef}
              onClose={() => setIsStatusMenuOpen(false)}
              id={statusMenuId}
              ariaLabel="活跃生产阶段"
              width={176}
              minWidth={176}
              maxHeight={320}
              className="animate-in fade-in zoom-in-95 duration-100"
            >
              <FloatingScrollbar className="p-1.5 space-y-0.5" wrapperClassName="min-h-0 flex-none">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                  活跃阶段
                </div>
                {COLUMNS.map((column) => {
                  const isSelected = topic.status === column.status;
                  return (
                    <button
                      key={column.status}
                      type="button"
                      onClick={() => {
                        setIsStatusMenuOpen(false);
                        void onUpdateTopic({ status: column.status });
                      }}
                      className={`w-full min-h-9 text-left px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--accent-soft)] text-[var(--accent-dark)] font-bold'
                          : 'text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${statusDots[column.status]}`} />
                        <span>{column.label}</span>
                      </div>
                      {isSelected && <span className="text-[var(--accent)] text-xs">✓</span>}
                    </button>
                  );
                })}

                <div className="my-1 border-t border-[var(--line)]" />
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                  归档状态
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsStatusMenuOpen(false);
                    void onUpdateTopic({ status: 'published' });
                  }}
                  className={`w-full min-h-9 text-left px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                    topic.status === 'published'
                      ? 'bg-[var(--accent-soft)] text-[var(--accent-dark)] font-bold'
                      : 'text-stone-600 dark:text-stone-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-800 dark:hover:text-emerald-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-500" />
                    <span>已发布</span>
                  </div>
                  {topic.status === 'published' && <span className="text-[var(--accent)] text-xs">✓</span>}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsStatusMenuOpen(false);
                    void onUpdateTopic({ status: 'icebox' });
                  }}
                  className={`w-full min-h-9 text-left px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                    topic.status === 'icebox'
                      ? 'bg-[var(--accent-soft)] text-[var(--accent-dark)] font-bold'
                      : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-stone-300 dark:bg-stone-600" />
                    <span>搁置</span>
                  </div>
                  {topic.status === 'icebox' && <span className="text-stone-600 dark:text-stone-400 text-xs">✓</span>}
                </button>
              </FloatingScrollbar>
            </FloatingMenu>
          </div>

          {/* Priority */}
          <div className="relative z-10 shrink-0">
            <button
              type="button"
              ref={priorityTriggerRef}
              aria-expanded={isPriorityMenuOpen}
              aria-controls={isPriorityMenuOpen ? priorityMenuId : undefined}
              onClick={() => {
                setIsPriorityMenuOpen(!isPriorityMenuOpen);
                setIsStatusMenuOpen(false);
              }}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer select-none ${isPriorityMenuOpen ? 'bg-[var(--surface)] text-[var(--ink)]' : 'text-[var(--ink)] hover:bg-[var(--surface)]'}`}
              title="设置选题优先级"
            >
              <span className={`w-2 h-2 rounded-full ${priorityConfig[topic.priority]?.dot || 'bg-stone-300'}`} />
              <span>{priorityConfig[topic.priority]?.label || '未设'}</span>
              <ChevronDown className="w-3 h-3 text-[var(--ink-muted)]" />
            </button>

            <FloatingMenu
              isOpen={isPriorityMenuOpen}
              anchorRef={priorityTriggerRef}
              onClose={() => setIsPriorityMenuOpen(false)}
              id={priorityMenuId}
              ariaLabel="优先级设定"
              width={224}
              minWidth={224}
              maxHeight={240}
              className="animate-in fade-in zoom-in-95 duration-100"
            >
              <FloatingScrollbar className="p-1.5 space-y-0.5" wrapperClassName="min-h-0 flex-none">
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
                      className={`w-full min-h-9 text-left px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--accent-soft)] text-[var(--accent-dark)] font-bold'
                          : 'text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                        <span className="shrink-0">{cfg.label}</span>
                        <span className="min-w-0 truncate text-[10px] text-stone-400 font-normal">({cfg.desc})</span>
                      </div>
                      {isSelected && <span className="text-[var(--accent)] text-xs">✓</span>}
                    </button>
                  );
                })}
              </FloatingScrollbar>
            </FloatingMenu>
          </div>

          {/* Topic actions */}
          <div className="relative ml-auto shrink-0">
            <button
              type="button"
              ref={moreTriggerRef}
              aria-expanded={isMoreMenuOpen}
              aria-controls={isMoreMenuOpen ? moreMenuId : undefined}
              aria-label="选题操作"
              onClick={() => {
                setIsMoreMenuOpen((current) => !current);
                setIsStatusMenuOpen(false);
                setIsPriorityMenuOpen(false);
              }}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                isMoreMenuOpen
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-dark)]'
                  : 'bg-transparent text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]'
              }`}
              title="更多选题操作"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              <span>更多</span>
            </button>

            <FloatingMenu
              isOpen={isMoreMenuOpen}
              anchorRef={moreTriggerRef}
              onClose={() => setIsMoreMenuOpen(false)}
              id={moreMenuId}
              ariaLabel="选题更多操作"
              width={216}
              minWidth={216}
              maxHeight={280}
              align="right"
              className="animate-in fade-in zoom-in-95 duration-100"
            >
              <FloatingScrollbar className="space-y-0.5 p-1.5" wrapperClassName="min-h-0 flex-none">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                  选题操作
                </div>

                {topic.status === 'published' || topic.status === 'icebox' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      void onUpdateTopic({ status: 'inbox' });
                    }}
                    className="flex min-h-9 w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)] cursor-pointer"
                    title="从归档中恢复至收集箱"
                  >
                    <span className="grid h-4 w-4 place-items-center text-sm" aria-hidden="true">↩</span>
                    <span>恢复至收集箱</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      setIsStatusMenuOpen(true);
                    }}
                    className="flex min-h-9 w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-[var(--ink)] transition-colors hover:bg-[var(--canvas)] cursor-pointer"
                    title="将此选题移入归档库（将从全景看板中移出）"
                  >
                    <Archive className="h-3.5 w-3.5 text-[var(--ink-muted)]" aria-hidden="true" />
                    <span>选择归档状态</span>
                  </button>
                )}

                {onExportMarkdown && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onExportMarkdown();
                    }}
                    className="flex min-h-9 w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-[var(--ink)] transition-colors hover:bg-[var(--canvas)] cursor-pointer"
                    title="导出包含设定、事实链、时间线与文案的 Markdown 档案"
                  >
                    <FileDown className="h-3.5 w-3.5 text-[var(--ink-muted)]" aria-hidden="true" />
                    <span>导出 Markdown 档案</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    void onUpdateTopic({ is_pinned: topic.is_pinned ? 0 : 1 });
                  }}
                  className={`flex min-h-9 w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium transition-colors cursor-pointer ${
                    topic.is_pinned
                      ? 'bg-[var(--accent-soft)] text-[var(--accent-dark)]'
                      : 'text-[var(--ink)] hover:bg-[var(--canvas)]'
                  }`}
                  title={topic.is_pinned ? '取消置顶' : '置顶选题'}
                >
                  <Pin className={`h-3.5 w-3.5 ${topic.is_pinned ? 'fill-current' : 'text-[var(--ink-muted)]'}`} aria-hidden="true" />
                  <span>{topic.is_pinned ? '取消置顶' : '置顶选题'}</span>
                </button>

                <div className="my-1 border-t border-[var(--line)]" />
                <button
                  type="button"
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    setIsDeleteDialogOpen(true);
                  }}
                  className="flex min-h-9 w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-[var(--h1-color)] transition-colors hover:bg-[var(--accent-soft)] cursor-pointer"
                  title="移入回收站"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>移入回收站</span>
                </button>
              </FloatingScrollbar>
            </FloatingMenu>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={async () => {
          await onDeleteTopic(topic.id);
          setIsDeleteDialogOpen(false);
          onBack();
        }}
        title="移入回收站"
        description={`确定要将选题「${topic.title}」移入回收站吗？\n\n之后可以在选题库的回收站中随时恢复。`}
        confirmText="移入回收站"
        tone="warning"
      />
    </div>
  );
};
