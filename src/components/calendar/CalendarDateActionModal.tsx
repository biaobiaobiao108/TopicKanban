import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { DateInput } from '../ui/DateInput';
import { Topic, Priority, TopicStatus, Tag } from '../../types';
import { Calendar, Plus, Check, Trash2, Clock, Sparkles } from 'lucide-react';
import { StatusBadge, PriorityBadge } from '../ui/Badge';
import { getActionDateDisplay, useBeijingToday } from '../../lib/actionDate';
import { FloatingScrollbar } from '../ui/FloatingScrollbar';

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
  const [newStatus, setNewStatus] = useState<TopicStatus>('inbox');

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
          <div className="flex border-b border-line">
            <button
              type="button"
              onClick={() => setTab('schedule_existing')}
              className={`flex-1 py-2.5 text-xs font-bold border-b-2 text-center transition-colors cursor-pointer ${
                tab === 'schedule_existing'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              定档已有选题 ({unscheduledTopics.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('create_new')}
              className={`flex-1 py-2.5 text-xs font-bold border-b-2 text-center transition-colors cursor-pointer ${
                tab === 'create_new'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              + 快速新建并定档
            </button>
          </div>
        )}

        {tab === 'schedule_existing' ? (
          <form onSubmit={handleSaveSchedule} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-ink mb-1.5">
                选择要定档的选题 <span className="text-ink-muted">*</span>
              </label>
              <FloatingScrollbar className="space-y-1.5 pr-1" wrapperClassName="max-h-48 flex-none">
                {unscheduledTopics.map((topic) => {
                  const isSelected = selectedTopicId === topic.id;
                  return (
                    <div
                      key={topic.id}
                      onClick={() => {
                        setSelectedTopicId(topic.id);
                        setDeadlineDate(topic.deadline || '');
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedTopicId(topic.id);
                          setDeadlineDate(topic.deadline || '');
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      aria-label={`选择选题：${topic.title}`}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                        isSelected
                          ? 'border-accent/45 bg-accent-soft'
                          : 'border-line hover:border-line'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <StatusBadge status={topic.status} />
                          <PriorityBadge priority={topic.priority} />
                        </div>
                        <div className="text-xs font-bold text-ink truncate">
                          {topic.title}
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-accent shrink-0" />
                      )}
                    </div>
                  );
                })}

                {unscheduledTopics.length === 0 && (
                  <div className="py-8 text-center text-xs text-ink-muted">
                    暂无可定档的未排期选题，请切换到「新建选题」
                  </div>
                )}
              </FloatingScrollbar>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-line">
              <div>
                <label className="block min-h-4 text-xs font-semibold text-ink mb-1">
                  计划发布日期
                </label>
                <DateInput
                  value={publishDate}
                  placeholder="YYYYMMDD，例如 20260831"
                  onChange={(val) => setPublishDate(val)}
                  className="min-h-10 w-full px-3 py-2 rounded-xl text-xs bg-control border border-line text-ink focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block min-h-4 text-xs font-semibold text-ink mb-1">
                  内部制作截止日 (选填)
                </label>
                <DateInput
                  value={deadlineDate}
                  placeholder="YYYYMMDD，例如 20260828"
                  onChange={(val) => setDeadlineDate(val)}
                  className="min-h-10 w-full px-3 py-2 rounded-xl text-xs bg-control border border-line text-ink focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-line">
              {activeTopic?.target_publish_date ? (
                <button
                  type="button"
                  onClick={handleClearSchedule}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 text-xs text-danger hover:bg-danger-soft px-3 py-2 rounded-xl transition-colors cursor-pointer font-semibold"
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
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-ink-muted hover:bg-control transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!selectedTopicId || isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-accent hover:bg-accent-dark text-white transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  {isSubmitting ? '保存中...' : '确认定档'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handleCreateAndSchedule} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-ink mb-1">
                选题标题 <span className="text-ink-muted">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="例如：网红老饕打假实录..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs bg-control border border-line text-ink focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                看点概述 (选填)
              </label>
              <textarea
                rows={2}
                placeholder="核心反差与故事梗概..."
                value={newSummary}
                onChange={(e) => setNewSummary(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs bg-control border border-line text-ink focus:outline-none focus:border-accent"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  初始阶段
                </label>
                <div className="flex gap-1">
                  {(['inbox', 'scripting', 'production'] as TopicStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setNewStatus(s)}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                        newStatus === s
                          ? 'bg-accent text-white'
                          : 'bg-control text-ink-muted'
                      }`}
                    >
                      {s === 'inbox' ? '收集箱' : s === 'scripting' ? '写稿中' : '待制作'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
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
                          ? 'bg-accent text-white'
                          : 'bg-control text-ink-muted'
                      }`}
                    >
                      {p === 'high' ? '高优' : p === 'medium' ? '中优' : '低优'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-ink-muted hover:bg-control transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!newTitle.trim() || isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-accent hover:bg-accent-dark text-white transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
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
