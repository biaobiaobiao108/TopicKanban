import React, { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Zap, ArrowRight, RotateCcw, Trash2, ArrowLeft } from 'lucide-react';
import type { Topic } from '../../types';
import { Modal } from '../ui/Modal';
import { getNextActionAgeDays } from '../../lib/topicMetrics';

interface NextActionDialogProps {
  isOpen: boolean;
  topic: Topic;
  onClose: () => void;
  onUpdate: (updates: Partial<Topic>) => Promise<void>;
}

function toBeijingDateInputValue(date = new Date(), dayOffset = 0): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + dayOffset))
    .toISOString()
    .slice(0, 10);
}

export const NextActionDialog: React.FC<NextActionDialogProps> = ({ isOpen, topic, onClose, onUpdate }) => {
  const [action, setAction] = useState(topic.next_action || '');
  const [newAction, setNewAction] = useState('');
  const [deferredUntil, setDeferredUntil] = useState(topic.next_action_deferred_until || '');
  const [isMarkingCompleted, setIsMarkingCompleted] = useState(false);
  const [saving, setSaving] = useState(false);

  const actionDays = getNextActionAgeDays(topic);

  useEffect(() => {
    if (!isOpen) return;
    setAction(topic.next_action || '');
    setNewAction('');
    setDeferredUntil(topic.next_action_deferred_until || '');
    setIsMarkingCompleted(false);
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

  const handleSaveCurrentAction = () => {
    return save({
      next_action: action.trim(),
      next_action_updated_at: new Date().toISOString(),
      next_action_deferred_until: null,
    });
  };

  const handleCompleteAndClear = () => {
    return save({
      next_action: '',
      next_action_updated_at: new Date().toISOString(),
      next_action_deferred_until: null,
    });
  };

  const handleCompleteAndSetNew = () => {
    if (!newAction.trim()) return;
    return save({
      next_action: newAction.trim(),
      next_action_updated_at: new Date().toISOString(),
      next_action_deferred_until: null,
    });
  };

  const deferToTomorrow = () => {
    void save({ next_action_deferred_until: toBeijingDateInputValue(new Date(), 1) });
  };

  // 1. Scenario: When topic has NO action set yet
  if (!topic.next_action) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="设定下一步行动"
        maxWidth="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (action.trim() && !saving) void handleSaveCurrentAction();
          }}
          className="space-y-5"
        >
          <label className="block space-y-2">
            <span className="text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              <span>接下来最该做的一件具体行动</span>
            </span>
            <textarea
              autoFocus
              value={action}
              onChange={(event) => setAction(event.target.value)}
              placeholder="例如：搜集峨眉山滑竿原版直播录屏，截取03:15处高潮画面..."
              rows={3}
              className="w-full resize-none rounded-2xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800/90 px-4 py-3 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 outline-none focus:border-rose-500 dark:focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-colors"
            />
          </label>

          <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-800/40 p-4 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700 dark:text-stone-300">
              <CalendarClock className="h-4 w-4 text-stone-500 dark:text-stone-400" />
              <span>暂缓至指定日期再提醒（可选）</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={deferToTomorrow}
                disabled={saving}
                className="min-h-10 rounded-xl border border-stone-300/80 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                明天提醒
              </button>
              <input
                type="date"
                value={deferredUntil}
                min={toBeijingDateInputValue()}
                onChange={(event) => setDeferredUntil(event.target.value)}
                className="min-h-10 flex-1 rounded-xl border border-stone-300/80 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 text-xs text-stone-700 dark:text-stone-300 outline-none focus:border-rose-500"
              />
              {deferredUntil && (
                <button
                  type="button"
                  onClick={() => void save({ next_action: action.trim() || '推进选题', next_action_deferred_until: deferredUntil })}
                  disabled={saving}
                  className="min-h-10 rounded-xl border border-stone-300/80 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  设为延期
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-stone-200/70 dark:border-stone-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 px-4 text-xs font-semibold text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving || !action.trim()}
              className="min-h-11 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-[0.98] px-6 text-sm font-bold text-white transition-all shadow-2xs hover:shadow-xs disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>{saving ? '保存中…' : '保存下一步行动'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  // 2. Scenario: Topic already HAS action -> Step B: Marking Completed Flow
  if (isMarkingCompleted) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="完成并顺延下一步"
        maxWidth="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newAction.trim() && !saving) void handleCompleteAndSetNew();
          }}
          className="space-y-5"
        >
          {/* Achievement box */}
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 dark:bg-emerald-950/40 p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 min-w-0 flex-1">
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">已搞定当前行动</div>
              <div className="text-sm font-semibold text-emerald-950 dark:text-emerald-200 line-through opacity-85 break-words">
                {topic.next_action}
              </div>
            </div>
          </div>

          {/* New Action Input */}
          <label className="block space-y-2">
            <span className="text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              <span>接下来最该做什么？(选填，也可直接完成关闭)</span>
            </span>
            <textarea
              autoFocus
              value={newAction}
              onChange={(event) => setNewAction(event.target.value)}
              placeholder="例如：整理滑竿事件3条核心事实，核对文案开场白..."
              rows={3}
              className="w-full resize-none rounded-2xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800/90 px-4 py-3 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 outline-none focus:border-rose-500 dark:focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-colors"
            />
          </label>

          {/* Dual Exit Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5 border-t border-stone-200/70 dark:border-stone-800 pt-4">
            <button
              type="button"
              onClick={() => setIsMarkingCompleted(false)}
              className="w-full sm:w-auto flex items-center justify-center gap-1 min-h-11 px-3 text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>返回编辑</span>
            </button>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => void handleCompleteAndClear()}
                disabled={saving}
                className="flex-1 sm:flex-initial min-h-11 px-4 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl transition-colors disabled:opacity-50 cursor-pointer text-center"
              >
                搞定，暂不设新行动
              </button>

              <button
                type="submit"
                disabled={saving || !newAction.trim()}
                className="flex-1 sm:flex-initial min-h-11 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-[0.98] px-5 text-sm font-bold text-white transition-all shadow-2xs hover:shadow-xs disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>完成并开启新行动</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>
      </Modal>
    );
  }

  // 3. Scenario: Topic already HAS action -> Step A: Normal View (Mark Completed Banner + Direct Text Editor + Defer + Delete)
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="推进下一步行动"
      maxWidth="md"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (action.trim() && !saving) void handleSaveCurrentAction();
        }}
        className="space-y-5"
      >
        {/* Top: Big Emerald "Mark as Completed" Hero Trigger */}
        <button
          type="button"
          onClick={() => setIsMarkingCompleted(true)}
          className="w-full flex items-center justify-between p-4 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 text-emerald-950 dark:text-emerald-200 transition-all cursor-pointer group shadow-2xs hover:shadow-xs text-left"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                标记此行动已完成
              </div>
              <div className="text-xs text-emerald-900/70 dark:text-emerald-400/80 truncate mt-0.5 font-medium">
                「{topic.next_action}」
              </div>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 ml-2 group-hover:translate-x-0.5 transition-transform">
            <span>打勾流转</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </button>

        {/* Middle: Current Action Text Editor */}
        <label className="block space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
              <span>当前行动描述 (可直接修改)</span>
            </span>
            <span className="text-[11px] text-stone-400 dark:text-stone-500 font-mono">
              持续 {actionDays} 天
            </span>
          </div>
          <textarea
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="输入当前行动的具体描述..."
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
              min={toBeijingDateInputValue()}
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
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2 border-t border-stone-200/70 dark:border-stone-800 pt-4">
          <button
            type="button"
            onClick={() => void handleCompleteAndClear()}
            disabled={saving}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 min-h-11 px-3 text-xs font-semibold text-stone-400 hover:text-red-600 dark:hover:text-red-400 rounded-xl hover:bg-red-50/50 dark:hover:bg-red-950/20 transition-colors disabled:opacity-50 cursor-pointer"
            title="清除当前行动（不写入新行动）"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>清除行动</span>
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 px-4 text-xs font-semibold text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving || !action.trim()}
              className="min-h-11 rounded-xl bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 active:scale-[0.98] px-6 text-sm font-bold text-white transition-all shadow-2xs hover:shadow-xs disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {saving ? '保存中…' : '保存修改'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
