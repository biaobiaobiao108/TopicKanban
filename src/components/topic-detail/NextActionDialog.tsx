import React, { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2 } from 'lucide-react';
import type { Topic } from '../../types';
import { Modal } from '../ui/Modal';

interface NextActionDialogProps {
  isOpen: boolean;
  topic: Topic;
  onClose: () => void;
  onUpdate: (updates: Partial<Topic>) => Promise<void>;
}

function toDateInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export const NextActionDialog: React.FC<NextActionDialogProps> = ({ isOpen, topic, onClose, onUpdate }) => {
  const [action, setAction] = useState(topic.next_action || '');
  const [deferredUntil, setDeferredUntil] = useState(topic.next_action_deferred_until || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setAction(topic.next_action || '');
    setDeferredUntil(topic.next_action_deferred_until || '');
  }, [isOpen, topic.next_action, topic.next_action_deferred_until]);

  const save = async (updates: Partial<Topic>) => {
    setSaving(true);
    try {
      await onUpdate(updates);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const saveAction = () => save({
    next_action: action.trim(),
    next_action_updated_at: new Date().toISOString(),
    next_action_deferred_until: null,
  });

  const deferToTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    void save({ next_action_deferred_until: toDateInputValue(tomorrow) });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={topic.next_action ? '完成并续接下一步' : '设置下一步行动'}
      subtitle="一次只推进一个具体、可完成的动作。"
      maxWidth="md"
    >
      <div className="space-y-5">
        {topic.next_action && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> 已完成当前行动
            </div>
            {topic.next_action}
          </div>
        )}

        <label className="block space-y-2">
          <span className="text-xs font-bold text-stone-700">接下来最该做什么？</span>
          <textarea
            autoFocus
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="例如：核实争议直播发生的准确日期"
            rows={3}
            className="w-full resize-none rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
          />
        </label>

        <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-stone-700">
            <CalendarClock className="h-4 w-4" /> 暂缓行动
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={deferToTomorrow}
              disabled={saving}
              className="min-h-11 rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-50"
            >
              今天不做，明天提醒
            </button>
            <input
              type="date"
              value={deferredUntil}
              min={toDateInputValue(new Date())}
              onChange={(event) => setDeferredUntil(event.target.value)}
              className="min-h-11 flex-1 rounded-lg border border-stone-300 bg-white px-3 text-xs text-stone-700"
            />
            <button
              type="button"
              onClick={() => void save({ next_action_deferred_until: deferredUntil || null })}
              disabled={saving || !deferredUntil}
              className="min-h-11 rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-50"
            >
              延期
            </button>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-stone-200 pt-4 sm:flex-row sm:justify-end">
          {topic.next_action && (
            <button
              type="button"
              onClick={() => void save({
                next_action: '',
                next_action_updated_at: new Date().toISOString(),
                next_action_deferred_until: null,
              })}
              disabled={saving}
              className="min-h-11 px-3 text-xs font-semibold text-stone-500 hover:text-stone-900 disabled:opacity-50"
            >
              完成，暂不续接
            </button>
          )}
          <button
            type="button"
            onClick={() => void saveAction()}
            disabled={saving || !action.trim()}
            className="min-h-11 rounded-xl bg-rose-600 px-5 text-sm font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? '保存中…' : topic.next_action ? '完成并设为下一步' : '保存下一步行动'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
