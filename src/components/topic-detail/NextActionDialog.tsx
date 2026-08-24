import React, { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Zap, ArrowRight } from 'lucide-react';
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
      title={topic.next_action ? '完成并续接下一步行动' : '设定当前核心行动'}
      subtitle="一次只聚焦一件最具体、可落地的关键动作，杜绝多任务停滞。"
      maxWidth="md"
    >
      <div className="space-y-5">
        {/* Completed Current Action Box */}
        {topic.next_action && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 dark:bg-emerald-950/30 p-4 text-sm text-emerald-950 dark:text-emerald-200 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>当前正在推进的行动</span>
            </div>
            <div className="font-semibold text-sm sm:text-base leading-snug pl-5">
              {topic.next_action}
            </div>
          </div>
        )}

        {/* Action Input */}
        <label className="block space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              <span>{topic.next_action ? '完成此步后，接下来最该做什么？' : '接下来最该做的一件具体行动'}</span>
            </span>
          </div>
          <textarea
            autoFocus
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="例如：搜集峨眉山滑竿原版直播录屏，截取03:15处高潮画面..."
            rows={3}
            className="w-full resize-none rounded-2xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800/90 px-4 py-3 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 outline-none focus:border-rose-500 dark:focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-colors"
          />
        </label>

        {/* Defer / Snooze section */}
        <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-800/40 p-4 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700 dark:text-stone-300">
            <CalendarClock className="h-4 w-4 text-stone-500 dark:text-stone-400" />
            <span>暂缓此行动</span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={deferToTomorrow}
              disabled={saving}
              className="min-h-10 rounded-xl border border-stone-300/80 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              今天不做，明天提醒
            </button>
            <input
              type="date"
              value={deferredUntil}
              min={toDateInputValue(new Date())}
              onChange={(event) => setDeferredUntil(event.target.value)}
              className="min-h-10 flex-1 rounded-xl border border-stone-300/80 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 text-xs text-stone-700 dark:text-stone-300 outline-none focus:border-rose-500"
            />
            <button
              type="button"
              onClick={() => void save({ next_action_deferred_until: deferredUntil || null })}
              disabled={saving || !deferredUntil}
              className="min-h-10 rounded-xl border border-stone-300/80 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              设定延期
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col-reverse gap-2 border-t border-stone-200/70 dark:border-stone-800 pt-4 sm:flex-row sm:justify-end">
          {topic.next_action && (
            <button
              type="button"
              onClick={() => void save({
                next_action: '',
                next_action_updated_at: new Date().toISOString(),
                next_action_deferred_until: null,
              })}
              disabled={saving}
              className="min-h-11 px-4 text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              完成当前行动，暂不续接
            </button>
          )}
          <button
            type="button"
            onClick={() => void saveAction()}
            disabled={saving || !action.trim()}
            className="min-h-11 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-[0.98] px-6 text-sm font-bold text-white transition-all shadow-2xs hover:shadow-xs disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>{saving ? '保存中…' : topic.next_action ? '完成并设为新行动' : '保存核心行动'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </Modal>
  );
};
