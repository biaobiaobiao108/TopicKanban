import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { DateInput } from '../ui/DateInput';
import { Topic, Priority, TopicStatus, Tag } from '../../types';
import { Calendar, Plus, Check, Trash2, Clock, Sparkles } from 'lucide-react';
import { StatusBadge, PriorityBadge } from '../ui/Badge';
import { getActionDateDisplay, useBeijingToday } from '../../lib/actionDate';

interface CalendarDateActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetDate: string; // YYYY-MM-DD
  activeTopic?: Topic | null;
  unscheduledTopics: Topic[];
  availableTags: Tag[];
  onUpdateTopic: (topicId: string, updates: Partial<Topic>) => Promise<void>;
  onCreateTopic: (data: {
    title: string;
    summary?: string;
    target_publish_date?: string;
    deadline?: string;
    priority?: Priority;
    status?: TopicStatus;
    tags?: Tag[];
  }) => Promise<void>;
}

export const CalendarDateActionModal: React.FC<CalendarDateActionModalProps> = ({
  isOpen,
  onClose,
  targetDate,
  activeTopic,
  unscheduledTopics,
  availableTags,
  onUpdateTopic,
  onCreateTopic,
}) => {
  const today = useBeijingToday();
  const [tab, setTab] = useState<'schedule_existing' | 'create_new'>(
    activeTopic ? 'schedule_existing' : (unscheduledTopics.length > 0 ? 'schedule_existing' : 'create_new')
  );

  // Existing topic scheduling state
  const [selectedTopicId, setSelectedTopicId] = useState<string>(activeTopic?.id || (unscheduledTopics[0]?.id || ''));
  const [publishDate, setPublishDate] = useState<string>(targetDate);
  const [deadlineDate, setDeadlineDate] = useState<string>(activeTopic?.deadline || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New topic quick creation state
  const [newTitle, setNewTitle] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [newStatus, setNewStatus] = useState<TopicStatus>('approved');

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTopicId) return;
    setIsSubmitting(true);
    try {
      await onUpdateTopic(selectedTopicId, {
        target_publish_date: publishDate || null,
        deadline: deadlineDate || null,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAndSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setIsSubmitting(true);
    try {
      await onCreateTopic({
        title: newTitle.trim(),
        summary: newSummary.trim(),
        target_publish_date: targetDate,
        deadline: deadlineDate || undefined,
        priority: newPriority,
        status: newStatus,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearSchedule = async () => {
    if (!selectedTopicId) return;
    setIsSubmitting(true);
    try {
      await onUpdateTopic(selectedTopicId, {
        target_publish_date: null,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`📅 排期定档 · ${getActionDateDisplay(targetDate, { today }).text || targetDate}`}
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Tab switch if no active topic specified */}
        {!activeTopic && (
          <div className="flex border-b border-stone-200 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setTab('schedule_existing')}
              className={`flex-1 py-2.5 text-xs font-bold border-b-2 text-center transition-colors cursor-pointer ${
                tab === 'schedule_existing'
                  ? 'border-rose-600 text-rose-600 dark:border-rose-400 dark:text-rose-400'
                  : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              定档已有选题 ({unscheduledTopics.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('create_new')}
              className={`flex-1 py-2.5 text-xs font-bold border-b-2 text-center transition-colors cursor-pointer ${
                tab === 'create_new'
                  ? 'border-rose-600 text-rose-600 dark:border-rose-400 dark:text-rose-400'
                  : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              + 快速新建并定档
            </button>
          </div>
        )}

        {tab === 'schedule_existing' ? (
          <form onSubmit={handleSaveSchedule} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                选择要定档的选题 <span className="text-rose-500">*</span>
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {unscheduledTopics.map((topic) => {
                  const isSelected = selectedTopicId === topic.id;
                  return (
                    <div
                      key={topic.id}
                      onClick={() => {
                        setSelectedTopicId(topic.id);
                        setDeadlineDate(topic.deadline || '');
                      }}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/40 ring-1 ring-rose-500 shadow-2xs'
                          : 'border-stone-200/80 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <StatusBadge status={topic.status} />
                          <PriorityBadge priority={topic.priority} />
                        </div>
                        <div className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                          {topic.title}
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      )}
                    </div>
                  );
                })}

                {unscheduledTopics.length === 0 && (
                  <div className="py-8 text-center text-xs text-stone-500 dark:text-stone-400">
                    暂无可定档的未排期选题，请切换到「新建选题」
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-stone-100 dark:border-stone-800">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  计划发布日期 (YYYYMMDD / YYYY-MM-DD)
                </label>
                <DateInput
                  value={publishDate}
                  placeholder="YYYYMMDD，例如 20260831"
                  onChange={(val) => setPublishDate(val)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-stone-500/[0.04] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  内部制作截止日 (选填)
                </label>
                <DateInput
                  value={deadlineDate}
                  placeholder="YYYYMMDD，例如 20260828"
                  onChange={(val) => setDeadlineDate(val)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-stone-500/[0.04] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-stone-200 dark:border-stone-800">
              {activeTopic?.target_publish_date ? (
                <button
                  type="button"
                  onClick={handleClearSchedule}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 px-3 py-2 rounded-xl transition-colors cursor-pointer font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>取消定档 (移回选题池)</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!selectedTopicId || isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  {isSubmitting ? '保存中...' : '确认定档'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handleCreateAndSchedule} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                选题标题 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="例如：网红老饕打假实录..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs bg-stone-500/[0.04] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                看点概述 (选填)
              </label>
              <textarea
                rows={2}
                placeholder="核心反差与故事梗概..."
                value={newSummary}
                onChange={(e) => setNewSummary(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs bg-stone-500/[0.04] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  初始阶段
                </label>
                <div className="flex gap-1">
                  {(['inbox', 'approved', 'scripting'] as TopicStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setNewStatus(s)}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                        newStatus === s
                          ? 'bg-rose-600 text-white'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                      }`}
                    >
                      {s === 'inbox' ? '收集箱' : s === 'approved' ? '已立项' : '写稿中'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  优先级
                </label>
                <div className="flex gap-1">
                  {(['high', 'medium', 'low'] as Priority[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNewPriority(p)}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                        newPriority === p
                          ? 'bg-stone-900 text-white dark:bg-rose-600'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                      }`}
                    >
                      {p === 'high' ? '高优' : p === 'medium' ? '中优' : '低优'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200 dark:border-stone-800">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!newTitle.trim() || isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                {isSubmitting ? '新建中...' : '新建并定档于此日'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
