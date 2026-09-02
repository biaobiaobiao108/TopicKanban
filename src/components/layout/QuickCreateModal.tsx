import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { DateInput } from '../ui/DateInput';
import { Priority, Tag, TopicStatus } from '../../types';
import { Plus, X, Tag as TagIcon, Calendar, Clock, ChevronDown, SlidersHorizontal } from 'lucide-react';

interface QuickCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string;
    summary: string;
    priority: Priority;
    initial_todo?: { title: string };
    target_publish_date?: string;
    deadline?: string;
    tags: Tag[];
    status: TopicStatus;
  }) => Promise<void>;
  availableTags: Tag[];
  defaultStatus: TopicStatus;
  initialTitle: string;
  initialTagNames: string[];
}

const priorityOptions: Array<{
  value: Priority;
  label: string;
  activeClass: string;
}> = [
  {
    value: 'high',
    label: '高',
    activeClass: 'bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-800 dark:text-rose-200 ring-2 ring-rose-200 dark:ring-rose-800 font-bold shadow-xs',
  },
  {
    value: 'medium',
    label: '中',
    activeClass: 'bg-amber-50 dark:bg-amber-950/60 border-amber-500 text-amber-800 dark:text-amber-200 ring-2 ring-amber-200 dark:ring-amber-800 font-bold shadow-xs',
  },
  {
    value: 'low',
    label: '低',
    activeClass: 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-800 dark:text-emerald-200 ring-2 ring-emerald-200 dark:ring-emerald-800 font-bold shadow-xs',
  },
  {
    value: 'none',
    label: '无',
    activeClass: 'bg-stone-100 dark:bg-stone-800 border-stone-400 dark:border-stone-600 text-stone-800 dark:text-stone-200 ring-2 ring-stone-200 dark:ring-stone-700 font-bold shadow-xs',
  },
];

export const QuickCreateModal: React.FC<QuickCreateModalProps> = ({
  isOpen,
  onClose,
  onSave,
  availableTags,
  defaultStatus,
  initialTitle,
  initialTagNames,
}) => {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [initialTodo, setInitialTodo] = useState('');
  const [targetPublishDate, setTargetPublishDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [selectedTagNames, setSelectedTagNames] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(initialTitle);
    setSummary('');
    setPriority('medium');
    setInitialTodo('');
    setSelectedTagNames(initialTagNames);
    setTargetPublishDate('');
    setDeadline('');
    setNewTagInput('');
    setIsAdvancedOpen(initialTagNames.length > 0);
  }, [initialTagNames, initialTitle, isOpen]);

  // Unselected tags from available pool
  const unselectedAvailableTags = useMemo(() => {
    return availableTags.filter((t) => !selectedTagNames.includes(t.name));
  }, [availableTags, selectedTagNames]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      const tags: Tag[] = selectedTagNames.map((name) => {
        const found = availableTags.find((t) => t.name === name);
        return found || { id: '', name };
      });

      await onSave({
        title: title.trim(),
        summary: summary.trim(),
        priority,
        initial_todo: initialTodo.trim() ? { title: initialTodo.trim() } : undefined,
        target_publish_date: targetPublishDate || undefined,
        deadline: deadline || undefined,
        tags,
        status: defaultStatus,
      });

      // Reset and close
      setTitle('');
      setSummary('');
      setPriority('medium');
      setInitialTodo('');
      setTargetPublishDate('');
      setDeadline('');
      setSelectedTagNames([]);
      setNewTagInput('');
      setIsAdvancedOpen(false);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeSelectedTag = (name: string) => {
    setSelectedTagNames((prev) => prev.filter((t) => t !== name));
  };

  const addTag = (name: string) => {
    const trimmed = name.trim().replace(/^#/, '');
    if (trimmed && !selectedTagNames.includes(trimmed)) {
      setSelectedTagNames((prev) => [...prev, trimmed]);
    }
  };

  const handleAddCustomTag = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newTagInput.trim().replace(/^#/, '');
    if (trimmed) {
      addTag(trimmed);
      setNewTagInput('');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="新建选题"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <fieldset className="space-y-4">
          <legend className="sr-only">核心信息</legend>
          <div>
            <label htmlFor="quick-create-title" className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
              <span>选题标题</span>
              <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400">必填</span>
            </label>
            <input
              id="quick-create-title"
              name="title"
              type="text"
              required
              autoFocus
              autoComplete="off"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="min-h-12 w-full rounded-xl border border-stone-200/80 bg-stone-500/[0.03] px-3.5 py-2.5 text-base text-stone-900 transition-colors focus:border-rose-500 focus:bg-white focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:bg-stone-800"
            />
          </div>

          <div>
            <label htmlFor="quick-create-summary" className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-stone-800 dark:text-stone-200">
              <span>一句话概述</span>
              <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400">选填</span>
            </label>
            <textarea
              id="quick-create-summary"
              name="summary"
              autoComplete="off"
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="min-h-[88px] w-full resize-none rounded-xl border border-stone-200/80 bg-stone-500/[0.03] px-3.5 py-2.5 text-base text-stone-900 transition-colors focus:border-rose-500 focus:bg-white focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:bg-stone-800"
            />
          </div>
        </fieldset>

        <button
          type="button"
          aria-expanded={isAdvancedOpen}
          aria-controls="quick-create-advanced-fields"
          onClick={() => setIsAdvancedOpen((prev) => !prev)}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-stone-200/80 bg-stone-500/[0.03] px-3.5 py-2.5 text-left transition-colors hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800/60 dark:hover:border-stone-600 dark:hover:bg-stone-800"
        >
          <span className="flex min-w-0 items-center gap-2">
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4 shrink-0 text-stone-500 dark:text-stone-400" />
            <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">进一步设置</span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-stone-500 dark:text-stone-400">
            <span>{isAdvancedOpen ? '收起' : '按需补充'}</span>
            <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {isAdvancedOpen && (
          <div id="quick-create-advanced-fields" className="space-y-5 rounded-2xl border border-stone-200/70 bg-stone-500/[0.02] p-4 dark:border-stone-800 dark:bg-stone-800/30">
            <fieldset className="space-y-3">
              <legend className="text-xs font-bold text-stone-800 dark:text-stone-200">执行安排</legend>
              <div>
                <label htmlFor="quick-create-initial-todo" className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-stone-700 dark:text-stone-300">
                  <span>首个行动</span>
                  <span className="font-medium text-stone-500 dark:text-stone-400">选填</span>
                </label>
                <input
                  id="quick-create-initial-todo"
                  name="initial_todo"
                  type="text"
                  autoComplete="off"
                  value={initialTodo}
                  onChange={(e) => setInitialTodo(e.target.value)}
                  className="min-h-12 w-full rounded-xl border border-stone-200/80 bg-white px-3.5 py-2.5 text-base text-stone-900 transition-colors focus:border-rose-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                />
              </div>

              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold text-stone-700 dark:text-stone-300">优先级</legend>
                <div role="radiogroup" aria-label="优先级" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {priorityOptions.map((opt) => {
                    const isSelected = priority === opt.value;
                    return (
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        key={opt.value}
                        onClick={() => setPriority(opt.value)}
                        className={`flex min-h-12 items-center justify-center rounded-xl border px-2.5 py-2.5 text-sm transition-all ${
                          isSelected
                            ? opt.activeClass
                            : 'border-stone-200/70 bg-white text-stone-600 shadow-2xs hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:border-stone-600 dark:hover:bg-stone-700'
                        }`}
                      >
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-xs font-bold text-stone-800 dark:text-stone-200">
                <span>排期</span>
                <span className="ml-2 font-medium text-stone-500 dark:text-stone-400">选填</span>
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="quick-create-target-publish-date" className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-stone-700 dark:text-stone-300">
                    <Calendar aria-hidden="true" className="h-3.5 w-3.5 text-rose-500" />
                    <span>计划发布日期</span>
                  </label>
                  <DateInput
                    value={targetPublishDate}
                    id="quick-create-target-publish-date"
                    name="target_publish_date"
                    placeholder="YYYYMMDD"
                    onChange={(val) => setTargetPublishDate(val)}
                    className="min-h-12 w-full rounded-xl border border-stone-200/80 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-rose-500 focus:bg-white focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                  />
                </div>

                <div>
                  <label htmlFor="quick-create-deadline" className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-stone-700 dark:text-stone-300">
                    <Clock aria-hidden="true" className="h-3.5 w-3.5 text-amber-500" />
                    <span>制作截稿日</span>
                  </label>
                  <DateInput
                    value={deadline}
                    id="quick-create-deadline"
                    name="deadline"
                    placeholder="YYYYMMDD"
                    onChange={(val) => setDeadline(val)}
                    className="min-h-12 w-full rounded-xl border border-stone-200/80 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-rose-500 focus:bg-white focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="flex items-center gap-1.5 text-xs font-bold text-stone-800 dark:text-stone-200">
                <TagIcon aria-hidden="true" className="h-3.5 w-3.5 text-stone-500" />
                <span>分类标签</span>
                <span className="ml-auto font-medium text-stone-500 dark:text-stone-400">已选 {selectedTagNames.length} 个</span>
              </legend>

              <div className="flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-xl border border-stone-200/70 bg-white p-2.5 dark:border-stone-700 dark:bg-stone-900">
                {selectedTagNames.length > 0 ? (
                  selectedTagNames.map((name) => (
                    <span
                      key={name}
                      className="group inline-flex items-center gap-1 rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white shadow-2xs dark:bg-rose-600"
                    >
                      <span>#{name}</span>
                      <button
                        type="button"
                        onClick={() => removeSelectedTag(name)}
                        aria-label={`移除标签 ${name}`}
                        className="rounded-full p-0.5 text-stone-400 transition-colors hover:text-white dark:text-rose-200"
                        title="移除标签"
                      >
                        <X aria-hidden="true" className="h-3 w-3" />
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-stone-500 dark:text-stone-400">暂未选择标签</span>
                )}
              </div>

              {unselectedAvailableTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400">可选标签：</span>
                  {unselectedAvailableTags.map((t) => (
                    <button
                      type="button"
                      key={t.id || t.name}
                      onClick={() => addTag(t.name)}
                      className="flex min-h-9 items-center gap-0.5 rounded-full border border-stone-200/70 bg-white px-2.5 py-0.5 text-xs text-stone-600 shadow-2xs transition-colors hover:border-rose-400 hover:text-rose-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
                    >
                      <span className="text-stone-500 dark:text-stone-400">+</span>
                      <span>#{t.name}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                <div className="min-w-0">
                  <label htmlFor="quick-create-custom-tag" className="mb-1.5 block text-[11px] font-semibold text-stone-600 dark:text-stone-400">
                    自定义标签
                  </label>
                  <input
                    id="quick-create-custom-tag"
                    name="custom_tag"
                    type="text"
                    autoComplete="off"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomTag();
                      }
                    }}
                    className="min-h-12 w-full rounded-xl border border-stone-200/80 bg-white px-3.5 py-2 text-base text-stone-900 transition-colors focus:border-rose-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleAddCustomTag()}
                  disabled={!newTagInput.trim()}
                  className="min-h-12 rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-stone-800 dark:hover:bg-stone-700"
                >
                  添加
                </button>
              </div>
            </fieldset>
          </div>
        )}

        {/* Submit Buttons */}
        <div className="flex items-center justify-end gap-2.5 border-t border-stone-100 pt-4 dark:border-stone-800">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl px-4 py-2 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={!title.trim() || isSubmitting}
            className="flex min-h-11 items-center gap-1.5 rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-2xs transition-all hover:bg-rose-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus aria-hidden="true" className="w-4 h-4 stroke-[2.5]" />
            <span>{isSubmitting ? '创建中...' : '立即创建'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
