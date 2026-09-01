import React, { useEffect, useState } from 'react';
import { CheckCircle2, ListTodo, Zap } from 'lucide-react';
import type { Topic, TopicTodo } from '../../types';
import { getCurrentActionAgeDays } from '../../lib/topicMetrics';
import { DateInput } from '../ui/DateInput';
import { Modal } from '../ui/Modal';
import type { TopicTodoActions } from './todoTypes';

interface TodoQuickActionDialogProps {
  isOpen: boolean;
  topic: Topic;
  todo: TopicTodo | null | undefined;
  onClose: () => void;
  onOpenTodoList: () => void;
  actions: Pick<TopicTodoActions, 'updateTodo' | 'completeTodo'>;
}

export const TodoQuickActionDialog: React.FC<TodoQuickActionDialogProps> = ({
  isOpen,
  topic,
  todo,
  onClose,
  onOpenTodoList,
  actions,
}) => {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(todo?.title || '');
    setNotes(todo?.notes || '');
    setDueDate(todo?.due_date || '');
  }, [isOpen, todo?.id, todo?.title, todo?.notes, todo?.due_date]);

  const handleSave = async () => {
    if (!todo || !title.trim() || saving) return;
    setSaving(true);
    try {
      await actions.updateTodo(todo.id, {
        title: title.trim(),
        notes: notes.trim(),
        due_date: dueDate || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!todo || saving) return;
    setSaving(true);
    try {
      await actions.completeTodo(todo.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!todo) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="当前行动" maxWidth="sm">
        <div className="space-y-5">
          <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-800/40 p-4 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
            这个选题还没有设置当前行动。可以先在执行清单中添加待办，再选择其中一条作为当前行动。
          </div>
          <div className="flex justify-end gap-2 border-t border-stone-200/70 dark:border-stone-800 pt-4">
            <button type="button" onClick={onClose} className="min-h-10 rounded-xl px-4 text-xs font-semibold text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800 cursor-pointer">关闭</button>
            <button type="button" onClick={() => { onClose(); onOpenTodoList(); }} className="min-h-10 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-700 cursor-pointer flex items-center gap-1.5">
              <ListTodo className="h-4 w-4" />打开执行清单
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="编辑当前行动" maxWidth="md">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/70 p-4 dark:border-rose-900/50 dark:bg-rose-950/30">
          <Zap className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-rose-700 dark:text-rose-300">正在推进</div>
            <div className="mt-1 break-words text-sm font-semibold text-stone-900 dark:text-stone-100">{todo.title}</div>
            <div className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">已持续 {getCurrentActionAgeDays(topic)} 天</div>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-stone-700 dark:text-stone-300">行动标题</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus className="w-full rounded-xl border border-stone-200/80 bg-stone-500/[0.03] px-3.5 py-2.5 text-sm outline-none focus:border-rose-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-stone-700 dark:text-stone-300">备注</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="补充执行说明、资料位置或判断标准" className="w-full resize-none rounded-xl border border-stone-200/80 bg-stone-500/[0.03] px-3.5 py-2.5 text-sm outline-none focus:border-rose-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-stone-700 dark:text-stone-300">截止日期</span>
          <DateInput value={dueDate} onChange={setDueDate} placeholder="YYYYMMDD，例如 20260901" className="w-full rounded-xl border border-stone-200/80 bg-stone-500/[0.03] px-3.5 py-2.5 text-sm outline-none focus:border-rose-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100" />
        </label>

        <div className="flex flex-col-reverse gap-2 border-t border-stone-200/70 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-stone-800">
          <button type="button" onClick={() => void handleComplete()} disabled={saving} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-500/10 px-3.5 text-xs font-bold text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-300 cursor-pointer">
            <CheckCircle2 className="h-4 w-4" />完成当前行动
          </button>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onOpenTodoList} disabled={saving} className="min-h-10 rounded-xl px-3.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800 cursor-pointer"><ListTodo className="mr-1 inline h-4 w-4" />执行清单</button>
            <button type="button" onClick={onClose} className="min-h-10 rounded-xl px-3.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800 cursor-pointer">取消</button>
            <button type="button" onClick={() => void handleSave()} disabled={saving || !title.trim()} className="min-h-10 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer">{saving ? '保存中…' : '保存修改'}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
