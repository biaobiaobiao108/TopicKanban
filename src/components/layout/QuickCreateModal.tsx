import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Priority, Tag, TopicStatus } from '../../types';
import { Plus, X, Tag as TagIcon } from 'lucide-react';

interface QuickCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { title: string; summary: string; priority: Priority; next_action: string; tags: Tag[]; status: TopicStatus }) => Promise<void>;
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
    label: '🔥 高优先级',
    activeClass: 'bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-800 dark:text-rose-200 ring-2 ring-rose-200 dark:ring-rose-800 font-bold shadow-xs',
  },
  {
    value: 'medium',
    label: '⚡ 中优先级',
    activeClass: 'bg-amber-50 dark:bg-amber-950/60 border-amber-500 text-amber-800 dark:text-amber-200 ring-2 ring-amber-200 dark:ring-amber-800 font-bold shadow-xs',
  },
  {
    value: 'low',
    label: '🌱 低优先级',
    activeClass: 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-800 dark:text-emerald-200 ring-2 ring-emerald-200 dark:ring-emerald-800 font-bold shadow-xs',
  },
  {
    value: 'none',
    label: '⚪ 无优先级',
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
  const [nextAction, setNextAction] = useState('');
  const [selectedTagNames, setSelectedTagNames] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(initialTitle);
    setSelectedTagNames(initialTagNames);
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
        next_action: nextAction.trim(),
        tags,
        status: defaultStatus,
      });

      // Reset and close
      setTitle('');
      setSummary('');
      setPriority('medium');
      setNextAction('');
      setSelectedTagNames([]);
      setNewTagInput('');
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
      title="💡 10秒快速新建选题"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-sm font-semibold text-stone-900 dark:text-stone-100 mb-1.5">
            选题标题 <span className="text-rose-600 dark:text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            autoFocus
            placeholder="例如：大胃袋良子：峨眉山减肥大溃败"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 rounded-xl text-stone-900 dark:text-stone-100 text-base focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 focus:outline-none transition-colors placeholder:text-stone-400 dark:placeholder:text-stone-500"
          />
        </div>

        {/* Summary (Optional) */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
            一句话看点 / 核心描述 <span className="text-stone-400 dark:text-stone-500 font-normal">(可选)</span>
          </label>
          <textarea
            rows={2}
            placeholder="用一句话说明视频在讲什么，例如：屡次减肥失败的网红，再一次试图证明自己..."
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 rounded-xl text-stone-900 dark:text-stone-100 text-sm focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 focus:outline-none transition-colors placeholder:text-stone-400 dark:placeholder:text-stone-500 resize-none"
          />
        </div>

        {/* Next Action (Optional) */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
            当前下一步行动 <span className="text-stone-400 dark:text-stone-500 font-normal">(可选，明确接下来做什么)</span>
          </label>
          <input
            type="text"
            placeholder="例如：寻找第一次训练营逃跑原片"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 rounded-xl text-stone-900 dark:text-stone-100 text-sm focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 focus:outline-none transition-colors placeholder:text-stone-400 dark:placeholder:text-stone-500"
          />
        </div>

        {/* Priority Selector (Redesigned Aesthetic Segments) */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
            优先级设定
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {priorityOptions.map((opt) => {
              const isSelected = priority === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setPriority(opt.value)}
                  className={`flex items-center justify-center py-2.5 px-2.5 rounded-xl text-xs border transition-all cursor-pointer ${
                    isSelected
                      ? opt.activeClass
                      : 'border-stone-200/70 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 hover:border-stone-300 dark:hover:border-stone-600 font-medium shadow-2xs'
                  }`}
                >
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tags Management */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
              <TagIcon className="w-3.5 h-3.5 text-stone-500" />
              <span>分类标签</span>
            </label>
            <span className="text-[11px] text-stone-400 dark:text-stone-500 font-mono">已选 {selectedTagNames.length} 个</span>
          </div>

          {/* 1. Selected Tags */}
          <div className="flex flex-wrap items-center gap-1.5 p-2.5 bg-stone-500/[0.03] dark:bg-stone-800/60 border border-stone-200/70 dark:border-stone-700 rounded-xl min-h-[42px]">
            {selectedTagNames.length > 0 ? (
              selectedTagNames.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-stone-900 dark:bg-rose-600 text-white rounded-full text-xs font-semibold shadow-2xs group animate-in fade-in zoom-in-95 duration-150"
                >
                  <span>#{name}</span>
                  <button
                    type="button"
                    onClick={() => removeSelectedTag(name)}
                    className="text-stone-400 dark:text-rose-200 hover:text-white p-0.5 rounded-full transition-colors cursor-pointer"
                    title="移除标签"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            ) : (
              <span className="text-xs text-stone-400 dark:text-stone-500 italic">暂未选择标签（可点击下方候选或输入自定义标签）</span>
            )}
          </div>

          {/* 2. Available Tag Pool (Click to add) */}
          {unselectedAvailableTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-stone-400 dark:text-stone-500 font-medium">推荐标签：</span>
              {unselectedAvailableTags.map((t) => (
                <button
                  type="button"
                  key={t.id || t.name}
                  onClick={() => addTag(t.name)}
                  className="px-2.5 py-0.5 rounded-full text-xs bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border border-stone-200/70 dark:border-stone-700 hover:border-rose-400 hover:text-rose-600 transition-colors flex items-center gap-0.5 cursor-pointer shadow-2xs"
                >
                  <span className="text-stone-400 dark:text-stone-500">+</span>
                  <span>#{t.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* 3. Custom Tag Input */}
          <div className="flex items-center gap-1.5 pt-1">
            <input
              type="text"
              placeholder="输入自定义标签名称 (按回车或点添加)..."
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustomTag();
                }
              }}
              className="px-3.5 py-2 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 rounded-xl text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:bg-white dark:focus:bg-stone-800 focus:outline-none focus:border-rose-500 flex-1 transition-colors"
            />
            <button
              type="button"
              onClick={() => handleAddCustomTag()}
              disabled={!newTagInput.trim()}
              className="px-4 py-2 bg-stone-900 dark:bg-stone-800 hover:bg-stone-800 dark:hover:bg-stone-700 text-white text-xs font-semibold rounded-xl disabled:opacity-40 transition-colors shrink-0 shadow-2xs cursor-pointer"
            >
              + 添加
            </button>
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-100 dark:border-stone-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl transition-colors font-medium cursor-pointer"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={!title.trim() || isSubmitting}
            className="px-5 py-2 text-xs bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>{isSubmitting ? '创建中...' : '立即创建'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
