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
    activeClass: 'bg-warning-soft border-warning-soft text-warning ring-1 ring-warning font-bold shadow-2xs',
  },
  {
    value: 'medium',
    label: '中',
    activeClass: 'bg-warning-soft border-warning-soft text-warning ring-1 ring-warning font-bold shadow-2xs',
  },
  {
    value: 'low',
    label: '低',
    activeClass: 'bg-success-soft border-success-soft text-success ring-1 ring-success font-bold shadow-2xs',
  },
  {
    value: 'none',
    label: '无',
    activeClass: 'bg-control border-line text-ink ring-1 ring-line font-bold shadow-2xs',
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
            <label htmlFor="quick-create-title" className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-ink">
              <span>选题标题</span>
              <span className="text-[11px] font-medium text-ink-muted">必填</span>
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
              className="min-h-12 w-full rounded-xl border border-line bg-control px-3.5 py-2.5 text-base text-ink transition-colors focus:border-accent focus:bg-surface focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="quick-create-summary" className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-ink">
              <span>一句话概述</span>
              <span className="text-[11px] font-medium text-ink-muted">选填</span>
            </label>
            <textarea
              id="quick-create-summary"
              name="summary"
              autoComplete="off"
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="min-h-[88px] w-full resize-none rounded-xl border border-line bg-control px-3.5 py-2.5 text-base text-ink transition-colors focus:border-accent focus:bg-surface focus:outline-none"
            />
          </div>
        </fieldset>

        <button
          type="button"
          aria-expanded={isAdvancedOpen}
          aria-controls="quick-create-advanced-fields"
          onClick={() => setIsAdvancedOpen((prev) => !prev)}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-line bg-control px-3.5 py-2.5 text-left transition-colors hover:border-line hover:bg-canvas"
        >
          <span className="flex min-w-0 items-center gap-2">
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-muted" />
            <span className="text-sm font-semibold text-ink">进一步设置</span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-ink-muted">
            <span>{isAdvancedOpen ? '收起' : '按需补充'}</span>
            <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {isAdvancedOpen && (
          <div id="quick-create-advanced-fields" className="space-y-5 rounded-2xl border border-line bg-control p-4">
            <fieldset className="space-y-3">
              <legend className="text-xs font-bold text-ink">执行安排</legend>
              <div>
                <label htmlFor="quick-create-initial-todo" className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-ink">
                  <span>首个行动</span>
                  <span className="font-medium text-ink-muted">选填</span>
                </label>
                <input
                  id="quick-create-initial-todo"
                  name="initial_todo"
                  type="text"
                  autoComplete="off"
                  value={initialTodo}
                  onChange={(e) => setInitialTodo(e.target.value)}
                  className="min-h-12 w-full rounded-xl border border-line bg-control px-3.5 py-2.5 text-base text-ink transition-colors focus:border-accent focus:bg-surface focus:outline-none"
                />
              </div>

              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold text-ink">优先级</legend>
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
                            : 'border-line bg-surface text-ink-muted shadow-subtle hover:text-ink hover:bg-surface-hover'
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
              <legend className="text-xs font-bold text-ink">
                <span>排期</span>
                <span className="ml-2 font-medium text-ink-muted">选填</span>
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="quick-create-target-publish-date" className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-ink">
                    <Calendar aria-hidden="true" className="h-3.5 w-3.5 text-accent" />
                    <span>计划发布日期</span>
                  </label>
                  <DateInput
                    value={targetPublishDate}
                    id="quick-create-target-publish-date"
                    name="target_publish_date"
                    placeholder="YYYYMMDD"
                    onChange={(val) => setTargetPublishDate(val)}
                    className="min-h-12 w-full rounded-xl border border-line bg-control px-3 py-2 text-base text-ink transition-colors focus:border-accent focus:bg-surface focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="quick-create-deadline" className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-ink">
                    <Clock aria-hidden="true" className="h-3.5 w-3.5 text-warning" />
                    <span>制作截稿日</span>
                  </label>
                  <DateInput
                    value={deadline}
                    id="quick-create-deadline"
                    name="deadline"
                    placeholder="YYYYMMDD"
                    onChange={(val) => setDeadline(val)}
                    className="min-h-12 w-full rounded-xl border border-line bg-control px-3 py-2 text-base text-ink transition-colors focus:border-accent focus:bg-surface focus:outline-none"
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="flex items-center gap-1.5 text-xs font-bold text-ink">
                <TagIcon aria-hidden="true" className="h-3.5 w-3.5 text-ink-muted" />
                <span>分类标签</span>
                <span className="ml-auto font-medium text-ink-muted">已选 {selectedTagNames.length} 个</span>
              </legend>

              <div className="flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-xl border border-line bg-canvas/80 p-2.5">
                {selectedTagNames.length > 0 ? (
                  selectedTagNames.map((name) => (
                    <span
                      key={name}
                      className="group inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white shadow-2xs"
                    >
                      <span>#{name}</span>
                      <button
                        type="button"
                        onClick={() => removeSelectedTag(name)}
                        aria-label={`移除标签 ${name}`}
                        className="rounded-full p-0.5 text-ink-muted transition-colors hover:text-accent"
                      >
                        <X aria-hidden="true" className="h-3 w-3" />
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-ink-muted">暂未选择标签</span>
                )}
              </div>

              {unselectedAvailableTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium text-ink-muted">可选标签：</span>
                  {unselectedAvailableTags.map((t) => (
                    <button
                      type="button"
                      key={t.id || t.name}
                      onClick={() => addTag(t.name)}
                      className="flex min-h-9 items-center gap-0.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-ink-muted shadow-subtle transition-colors hover:border-accent hover:text-accent hover:bg-surface-hover"
                    >
                      <span className="text-ink-muted">+</span>
                      <span>#{t.name}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                <div className="min-w-0">
                  <label htmlFor="quick-create-custom-tag" className="mb-1.5 block text-[11px] font-semibold text-ink-muted">
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
                    className="min-h-12 w-full rounded-xl border border-line bg-control px-3.5 py-2 text-base text-ink transition-colors focus:border-accent focus:bg-surface focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleAddCustomTag()}
                  disabled={!newTagInput.trim()}
                  className="min-h-12 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
                >
                  添加
                </button>
              </div>
            </fieldset>
          </div>
        )}

        {/* Submit Buttons */}
        <div className="flex items-center justify-end gap-2.5 border-t border-line pt-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl px-4 py-2 text-xs font-medium text-ink-muted transition-colors hover:bg-control hover:text-ink"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={!title.trim() || isSubmitting}
            className="flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-5 py-2 text-xs font-bold text-white shadow-2xs transition-all hover:bg-accent-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus aria-hidden="true" className="w-4 h-4 stroke-[2.5]" />
            <span>{isSubmitting ? '创建中...' : '立即创建'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
