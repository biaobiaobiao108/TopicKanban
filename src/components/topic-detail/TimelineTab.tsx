import React, { useState, useMemo, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TimelineEvent, DatePrecision, VerificationStatus } from '../../types';
import { VerificationBadge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import {
  Plus,
  Trash2,
  Edit2,
  Clock,
  GripVertical,
  ArrowDownUp,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  SlidersHorizontal,
} from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';

const CONTRAST_PRESETS = [
  '荒诞反差',
  '人物张力',
  '伏笔呼应',
  '高潮爆发',
  '唏嘘切片',
  '剧情反转',
  '社会讽刺',
  '情绪低谷',
];

type TimelineSortMode = 'custom' | 'time_desc' | 'time_asc';

interface TimelineTabProps {
  topicId: string;
  timeline: TimelineEvent[];
  onSaveEvent: (event: Partial<TimelineEvent> & { topic_id: string; title: string }) => Promise<void>;
  onDeleteEvent: (eventId: string) => Promise<void>;
  onReorder: (topicId: string, events: TimelineEvent[]) => Promise<void>;
}

function inferDatePrecision(dateStr: string): DatePrecision {
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed === '待考证' || trimmed === '未知') return 'unknown';
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) return 'exact';
  if (/^\d{4}-\d{1,2}$/.test(trimmed)) return 'year_month';
  if (/^\d{4}$/.test(trimmed)) return 'year';
  return 'exact';
}

function formatEventDate(dateStr: string, precision: DatePrecision): string {
  const trimmed = dateStr.trim();
  if (precision === 'unknown' || !trimmed || trimmed === '待考证' || trimmed === '未知') {
    return '待考证';
  }
  if (precision === 'year' || /^\d{4}$/.test(trimmed)) return `${trimmed} 年`;
  if (precision === 'year_month' || /^\d{4}-\d{1,2}$/.test(trimmed)) return `${trimmed} 月`;
  return trimmed;
}

function compareEventsByDate(a: TimelineEvent, b: TimelineEvent, direction: 'asc' | 'desc'): number {
  const dateA = a.event_date?.trim() || '';
  const dateB = b.event_date?.trim() || '';
  const isAValid = Boolean(dateA && a.date_precision !== 'unknown' && dateA !== '待考证' && dateA !== '未知');
  const isBValid = Boolean(dateB && b.date_precision !== 'unknown' && dateB !== '待考证' && dateB !== '未知');

  if (!isAValid && !isBValid) return 0;
  if (!isAValid) return 1;
  if (!isBValid) return -1;

  const result = dateA.localeCompare(dateB);
  return direction === 'asc' ? result : -result;
}

interface SortableTimelineCardProps {
  event: TimelineEvent;
  index: number;
  onEdit: (evt: TimelineEvent) => void;
  onDelete: (id: string) => void;
  selected: boolean;
  onToggle: (id: string) => void;
}

const SortableTimelineCard: React.FC<SortableTimelineCardProps> = ({
  event,
  index,
  onEdit,
  onDelete,
  selected,
  onToggle,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: event.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isUnknownDate = event.date_precision === 'unknown' || !event.event_date || event.event_date === '待考证';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group ${isDragging ? 'opacity-50 z-30 scale-[1.01]' : 'opacity-100'}`}
    >
      {/* Timeline Node Dot on Left Axis */}
      <div className="absolute -left-6 sm:-left-8 top-3.5 w-6 h-6 rounded-full bg-white dark:bg-stone-900 border-2 border-rose-600 dark:border-rose-500 flex items-center justify-center text-[10px] font-bold text-rose-700 dark:text-rose-400 shadow-xs z-10 select-none">
        {index + 1}
      </div>

      {/* Event Main Card */}
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4 sm:p-5 shadow-subtle hover:shadow-card transition-all space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
            <input type="checkbox" checked={selected} onChange={() => onToggle(event.id)} aria-label={`选择时间节点「${event.title}」`} className="h-4 w-4 accent-rose-600" />
            {/* Drag Handle */}
            <button
              type="button"
              {...attributes}
              {...listeners}
              className="p-1 -ml-1 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 cursor-grab active:cursor-grabbing rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              title="按住拖拽调整顺序"
            >
              <GripVertical className="w-4 h-4" />
            </button>

            {/* Date Badge */}
            <span
              className={`text-xs font-mono font-bold px-2 py-0.5 rounded border inline-flex items-center gap-1 ${
                isUnknownDate
                  ? 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-700'
                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/60'
              }`}
            >
              📅 {formatEventDate(event.event_date, event.date_precision)}
            </span>

            {/* Verification Badge */}
            <VerificationBadge status={event.verification_status} />

            {/* Contrast Tag (if marked) */}
            {event.contrast_tag && (
              <span className="text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800/80 px-2 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs">
                ⚡ {event.contrast_tag}
              </span>
            )}
          </div>

          {/* Edit and Delete Actions */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(event)}
              className="p-1.5 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg cursor-pointer transition-colors"
              title="编辑时间节点"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(event.id)}
              className="p-1.5 text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer transition-colors"
              title="删除时间节点"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Event Title */}
        <h4 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100 leading-snug">
          {event.title}
        </h4>

        {/* Detailed Description */}
        {event.description && (
          <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 leading-relaxed bg-stone-50 dark:bg-stone-800/60 p-3 rounded-lg border border-stone-100 dark:border-stone-800 whitespace-pre-wrap">
            {event.description}
          </p>
        )}
      </div>
    </div>
  );
};

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
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('confirmed');
  const [contrastTag, setContrastTag] = useState('');

  // Sorting Mode State with Independent Persistence
  const storageKey = `timeline_sort_mode_${topicId}`;
  const [sortMode, setSortMode] = useState<TimelineSortMode>(() => {
    if (typeof window === 'undefined') return 'custom';
    const saved = localStorage.getItem(storageKey);
    return (saved === 'time_desc' || saved === 'time_asc' || saved === 'custom') ? saved : 'custom';
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'time_desc' || saved === 'time_asc' || saved === 'custom') {
        setSortMode(saved);
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  const handleSortModeChange = (mode: TimelineSortMode) => {
    setSortMode(mode);
    try {
      localStorage.setItem(storageKey, mode);
    } catch {
      // ignore
    }
  };

  // Derived Display Items
  const displayEvents = useMemo(() => {
    if (sortMode === 'time_desc') {
      return [...timeline].sort((a, b) => compareEventsByDate(a, b, 'desc'));
    }
    if (sortMode === 'time_asc') {
      return [...timeline].sort((a, b) => compareEventsByDate(a, b, 'asc'));
    }
    return timeline;
  }, [timeline, sortMode]);

  const deleteSelected = async () => {
    const ids = [...selectedIds];
    await Promise.all(ids.map((id) => onDeleteEvent(id)));
    setSelectedIds(new Set());
  };

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = displayEvents.findIndex((item) => item.id === active.id);
    const newIndex = displayEvents.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newItems = arrayMove(displayEvents, oldIndex, newIndex);

    // If dragging while in time-sorted mode, automatically switch to custom mode
    if (sortMode !== 'custom') {
      handleSortModeChange('custom');
    }
    await onReorder(topicId, newItems);
  };

  const openAddModal = () => {
    setEditingEvent(null);
    setTitle('');
    setDescription('');
    setEventDate('');
    setVerificationStatus('confirmed');
    setContrastTag('');
    setIsModalOpen(true);
  };

  const openEditModal = (evt: TimelineEvent) => {
    setEditingEvent(evt);
    setTitle(evt.title);
    setDescription(evt.description);
    setEventDate(evt.event_date);
    setVerificationStatus(evt.verification_status);
    setContrastTag(evt.contrast_tag || '');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const cleanDate = eventDate.trim();
    const precision = inferDatePrecision(cleanDate);

    await onSaveEvent({
      id: editingEvent?.id,
      topic_id: topicId,
      title: title.trim(),
      description: description.trim(),
      event_date: cleanDate,
      date_precision: precision,
      verification_status: verificationStatus,
      contrast_tag: contrastTag.trim() || undefined,
    });

    setIsModalOpen(false);
  };

  return (
    <div className="py-4 space-y-4 max-w-4xl mx-auto">
      {/* Top Header & Sort Controls Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-stone-900 p-4 sm:p-4.5 rounded-xl border border-stone-200 dark:border-stone-800 shadow-subtle transition-colors">
        <div className="space-y-0.5">
          <h3 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Clock className="w-4 h-4 text-rose-600 dark:text-rose-500" />
            <span>事件故事时间线</span>
            <span className="text-xs font-mono font-bold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 px-2 py-0.5 rounded-full">
              {timeline.length}
            </span>
          </h3>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            按时序梳理因果脉络，支持拖拽自定义排序与一键时间排序
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
          {/* Sort Mode Segmented Control */}
          <div className="inline-flex items-center rounded-lg bg-stone-100 dark:bg-stone-800 p-0.5 border border-stone-200/80 dark:border-stone-700 text-xs font-semibold">
            <button
              type="button"
              onClick={() => handleSortModeChange('custom')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                sortMode === 'custom'
                  ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-2xs'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
              title="按自定义拖拽顺序排列（可自由拖拽）"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>自定义排序</span>
            </button>
            <button
              type="button"
              onClick={() => handleSortModeChange('time_desc')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                sortMode === 'time_desc'
                  ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-2xs'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
              title="按时间从新到旧排列 (最新在前)"
            >
              <ArrowDownWideNarrow className="w-3.5 h-3.5" />
              <span>时间从大到小</span>
            </button>
            <button
              type="button"
              onClick={() => handleSortModeChange('time_asc')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                sortMode === 'time_asc'
                  ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-2xs'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
              title="按时间从旧到新排列 (最早在前)"
            >
              <ArrowUpNarrowWide className="w-3.5 h-3.5" />
              <span>时间从小到大</span>
            </button>
          </div>

          {/* Add Node Button */}
          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-1 bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-2xs cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>添加节点</span>
          </button>
          {selectedIds.size > 0 && (
            <button type="button" onClick={() => void deleteSelected()} className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">
              <Trash2 className="h-4 w-4" /> 删除选中 ({selectedIds.size})
            </button>
          )}
        </div>
      </div>

      {/* Main Vertical Timeline List with DnD */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={displayEvents.map((evt) => evt.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="relative pl-6 sm:pl-8 space-y-4 before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-stone-200 dark:before:bg-stone-800 transition-colors">
            {displayEvents.map((evt, idx) => (
              <SortableTimelineCard
                key={evt.id}
                event={evt}
                index={idx}
                onEdit={openEditModal}
                onDelete={onDeleteEvent}
                selected={selectedIds.has(evt.id)}
                onToggle={(id) => setSelectedIds((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                })}
              />
            ))}

            {displayEvents.length === 0 && (
              <div className="p-12 text-center border-2 border-dashed border-stone-200 dark:border-stone-800 rounded-xl bg-white dark:bg-stone-900 text-stone-400 dark:text-stone-500 space-y-2">
                <Clock className="w-8 h-8 mx-auto text-stone-300 dark:text-stone-600 stroke-[1.5]" />
                <div className="text-sm font-medium">暂无故事时间节点</div>
                <p className="text-xs text-stone-400 dark:text-stone-500">
                  点击上方「添加节点」记录事件发生的时间、起因、经过与反差转折
                </p>
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* Simplified Modal: Add / Edit Timeline Node */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingEvent ? '编辑时间节点' : '添加时间节点'}
        subtitle="记录事件时间、起因经过与关键转折，支持随时拖拽排序"
        maxWidth="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
              事件标题 <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="例如：首次入驻训练基地并立下誓言"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                发生日期
              </label>
              <input
                type="text"
                placeholder="2026-07-28 / 2026-05 / 待考证"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full h-[38px] px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                可信度状态
              </label>
              <CustomSelect
                value={verificationStatus}
                onChange={(val) => setVerificationStatus(val as VerificationStatus)}
                className="w-full"
                buttonClassName="w-full h-[38px] justify-between py-2 text-sm bg-stone-50 dark:bg-stone-800 border-stone-300 dark:border-stone-700 rounded-lg"
                options={[
                  { value: 'confirmed', label: '已确认 (多方可靠来源)', dot: 'bg-emerald-500' },
                  { value: 'unverified', label: '待核实 (信息不足)', dot: 'bg-amber-500' },
                  { value: 'rejected', label: '不采用 (已证伪)', dot: 'bg-stone-400' },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
              反差与情绪标记 (选填)
            </label>
            <input
              type="text"
              placeholder="例如：荒诞反差、人物张力、高潮爆发、伏笔呼应"
              value={contrastTag}
              onChange={(e) => setContrastTag(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none mb-2"
            />
            {/* Quick preset chips */}
            <div className="flex flex-wrap gap-1.5">
              {CONTRAST_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setContrastTag(contrastTag === preset ? '' : preset)}
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                    contrastTag === preset
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-200 dark:hover:bg-stone-700'
                  }`}
                >
                  ⚡ {preset}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
              事件详细经过与说明
            </label>
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
