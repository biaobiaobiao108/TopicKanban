import React, { useState } from 'react';
import { TimelineEvent, DatePrecision, VerificationStatus } from '../../types';
import { VerificationBadge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import {
  Plus,
  Calendar,
  Trash2,
  Edit2,
  ArrowDown,
  ArrowUp,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface TimelineTabProps {
  topicId: string;
  timeline: TimelineEvent[];
  onSaveEvent: (event: Partial<TimelineEvent> & { topic_id: string; title: string }) => Promise<void>;
  onDeleteEvent: (eventId: string) => Promise<void>;
  onReorder: (topicId: string, events: TimelineEvent[]) => Promise<void>;
}

export const TimelineTab: React.FC<TimelineTabProps> = ({
  topicId,
  timeline,
  onSaveEvent,
  onDeleteEvent,
  onReorder,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [datePrecision, setDatePrecision] = useState<DatePrecision>('exact');
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('confirmed');

  const openAddModal = () => {
    setEditingEvent(null);
    setTitle('');
    setDescription('');
    setEventDate('');
    setDatePrecision('exact');
    setVerificationStatus('confirmed');
    setIsModalOpen(true);
  };

  const openEditModal = (evt: TimelineEvent) => {
    setEditingEvent(evt);
    setTitle(evt.title);
    setDescription(evt.description);
    setEventDate(evt.event_date);
    setDatePrecision(evt.date_precision);
    setVerificationStatus(evt.verification_status);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    await onSaveEvent({
      id: editingEvent?.id,
      topic_id: topicId,
      title: title.trim(),
      description: description.trim(),
      event_date: eventDate.trim(),
      date_precision: datePrecision,
      verification_status: verificationStatus,
    });

    setIsModalOpen(false);
  };

  const moveUp = async (index: number) => {
    if (index === 0) return;
    const newItems = [...timeline];
    const temp = newItems[index];
    newItems[index] = newItems[index - 1];
    newItems[index - 1] = temp;
    await onReorder(topicId, newItems);
  };

  const moveDown = async (index: number) => {
    if (index === timeline.length - 1) return;
    const newItems = [...timeline];
    const temp = newItems[index];
    newItems[index] = newItems[index + 1];
    newItems[index + 1] = temp;
    await onReorder(topicId, newItems);
  };

  const formatEventDate = (dateStr: string, precision: DatePrecision) => {
    if (precision === 'unknown' || !dateStr) return '时间未知 / 待考证';
    if (precision === 'year') return `${dateStr} 年`;
    if (precision === 'year_month') return `${dateStr} 月`;
    return dateStr;
  };

  return (
    <div className="py-6 space-y-6 max-w-4xl mx-auto">
      {/* Header action */}
      <div className="flex items-center justify-between bg-white dark:bg-stone-900 p-5 rounded-xl border border-stone-200 dark:border-stone-800 shadow-subtle transition-colors">
        <div>
          <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Clock className="w-4 h-4 text-rose-600 dark:text-rose-500" />
            <span>事件故事时间线 (Chronological Timeline)</span>
          </h3>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            将复杂事件按因果与时序组织为清晰的故事链条
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center gap-1.5 bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>添加时间节点</span>
        </button>
      </div>

      {/* Vertical Timeline */}
      <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 before:top-4 before:bottom-4 before:w-0.5 before:bg-stone-200 dark:before:bg-stone-800">
        {timeline.map((evt, idx) => (
          <div key={evt.id} className="relative group">
            {/* Timeline node dot */}
            <div className="absolute -left-6 sm:-left-8 top-3.5 w-6 h-6 rounded-full bg-white dark:bg-stone-900 border-2 border-rose-600 dark:border-rose-500 flex items-center justify-center text-[10px] font-bold text-rose-700 dark:text-rose-400 shadow-xs z-10">
              {idx + 1}
            </div>

            {/* Event Card */}
            <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 shadow-subtle hover:shadow-card transition-all space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 px-2 py-0.5 rounded">
                    📅 {formatEventDate(evt.event_date, evt.date_precision)}
                  </span>
                  <VerificationBadge status={evt.verification_status} />
                </div>

                {/* Move & Edit Actions */}
                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                  <button
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    className="p-1 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 disabled:opacity-20 rounded cursor-pointer"
                    title="上移"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => moveDown(idx)}
                    disabled={idx === timeline.length - 1}
                    className="p-1 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 disabled:opacity-20 rounded cursor-pointer"
                    title="下移"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-px h-3 bg-stone-200 dark:bg-stone-700 mx-1" />
                  <button
                    onClick={() => openEditModal(evt)}
                    className="p-1 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 rounded cursor-pointer transition-colors"
                    title="编辑"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteEvent(evt.id)}
                    className="p-1 text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 rounded cursor-pointer transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Event Title */}
              <h4 className="text-base font-bold text-stone-900 dark:text-stone-100 leading-snug">{evt.title}</h4>

              {/* Description */}
              {evt.description && (
                <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed bg-stone-50 dark:bg-stone-800/60 p-3 rounded-lg border border-stone-100 dark:border-stone-800">
                  {evt.description}
                </p>
              )}
            </div>
          </div>
        ))}

        {timeline.length === 0 && (
          <div className="p-12 text-center border-2 border-dashed border-stone-200 dark:border-stone-800 rounded-xl bg-white dark:bg-stone-900 text-stone-400 dark:text-stone-500">
            暂无时间线节点，点击上方按钮按发生顺序添加事件节点！
          </div>
        )}
      </div>

      {/* Modal: Add/Edit Event */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingEvent ? '编辑时间节点' : '添加时间节点'}
        subtitle="支持多种日期精度，可随时拖动或上下调整因果先后顺序"
        maxWidth="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
              事件标题 <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="例如：首次入驻华哥训练基地并签署军令状"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">日期 / 时间</label>
              <input
                type="text"
                placeholder="2026-07-28 / 2026-05 / 2025"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">时间精度</label>
              <select
                value={datePrecision}
                onChange={(e) => setDatePrecision(e.target.value as DatePrecision)}
                className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
              >
                <option value="exact">精确日期 (年月日)</option>
                <option value="year_month">年月 (如 2026-05)</option>
                <option value="year">年份 (如 2025)</option>
                <option value="unknown">时间未知 / 待考证</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">可信度状态</label>
            <select
              value={verificationStatus}
              onChange={(e) => setVerificationStatus(e.target.value as VerificationStatus)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
            >
              <option value="confirmed">已确认 (多方可靠来源)</option>
              <option value="unverified">待核实 (信息不足)</option>
              <option value="rejected">不采用 (已证伪)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">事件详细经过与说明</label>
            <textarea
              rows={3}
              placeholder="详细记录发生了什么、谁参与了、产生了什么后果..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg cursor-pointer transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white rounded-lg font-medium cursor-pointer transition-colors"
            >
              {editingEvent ? '更新节点' : '添加节点'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
