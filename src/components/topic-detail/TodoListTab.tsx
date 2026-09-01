import React, { useMemo, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, GripVertical, ListTodo, Pencil, Plus, RotateCcw, Trash2, Zap } from 'lucide-react';
import type { Topic, TopicTodo } from '../../types';
import { DateInput } from '../ui/DateInput';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Modal } from '../ui/Modal';
import type { TopicTodoActions } from './todoTypes';

interface TodoListTabProps {
  topic: Topic;
  todos: TopicTodo[];
  actions: TopicTodoActions;
  isLoading?: boolean;
}

interface TodoEditorProps {
  isOpen: boolean;
  todo?: TopicTodo;
  onClose: () => void;
  onSubmit: (input: { title: string; notes: string; due_date: string | null }) => Promise<void>;
}

const TodoEditor: React.FC<TodoEditorProps> = ({ isOpen, todo, onClose, onSubmit }) => {
  const [title, setTitle] = useState(todo?.title || '');
  const [notes, setNotes] = useState(todo?.notes || '');
  const [dueDate, setDueDate] = useState(todo?.due_date || '');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    setTitle(todo?.title || '');
    setNotes(todo?.notes || '');
    setDueDate(todo?.due_date || '');
  }, [isOpen, todo?.id, todo?.title, todo?.notes, todo?.due_date]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit({ title: title.trim(), notes: notes.trim(), due_date: dueDate || null });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={todo ? '编辑待办' : '新增待办'} maxWidth="md">
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-stone-700 dark:text-stone-300">待办标题 <span className="text-rose-600">*</span></span>
          <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：核对关键时间线并找到原始视频" className="w-full rounded-xl border border-stone-200/80 bg-stone-500/[0.03] px-3.5 py-2.5 text-sm outline-none focus:border-rose-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-stone-700 dark:text-stone-300">备注</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder="补充执行说明、资料链接或完成标准" className="w-full resize-none rounded-xl border border-stone-200/80 bg-stone-500/[0.03] px-3.5 py-2.5 text-sm outline-none focus:border-rose-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100" />
        </label>
        <label className="block space-y-1.5">
          <span className="flex items-center gap-1.5 text-xs font-bold text-stone-700 dark:text-stone-300"><CalendarDays className="h-3.5 w-3.5 text-stone-500" />截止日期</span>
          <DateInput value={dueDate} onChange={setDueDate} placeholder="YYYYMMDD，例如 20260901" className="w-full rounded-xl border border-stone-200/80 bg-stone-500/[0.03] px-3.5 py-2.5 text-sm outline-none focus:border-rose-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100" />
        </label>
        <div className="flex justify-end gap-2 border-t border-stone-200/70 pt-4 dark:border-stone-800">
          <button type="button" onClick={onClose} className="min-h-10 rounded-xl px-4 text-xs font-semibold text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800 cursor-pointer">取消</button>
          <button type="submit" disabled={saving || !title.trim()} className="min-h-10 rounded-xl bg-rose-600 px-5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer">{saving ? '保存中…' : '保存待办'}</button>
        </div>
      </form>
    </Modal>
  );
};

const SortableTodoRow: React.FC<{
  todo: TopicTodo;
  onEdit: (todo: TopicTodo) => void;
  onSetCurrent: (todo: TopicTodo) => void;
  onComplete: (todo: TopicTodo) => void;
  onDelete: (todo: TopicTodo) => void;
}> = ({ todo, onEdit, onSetCurrent, onComplete, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`group flex items-start gap-2 rounded-2xl border bg-white p-3 dark:bg-stone-900 ${isDragging ? 'z-10 border-rose-300 shadow-lg dark:border-rose-700' : 'border-stone-200/70 dark:border-stone-800'}`}>
      <button type="button" aria-label="拖动排序" className="mt-1 shrink-0 cursor-grab touch-none rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200" {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-words text-sm font-semibold text-stone-900 dark:text-stone-100">{todo.title}</span>
          {todo.due_date && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300"><CalendarDays className="h-3 w-3" />{todo.due_date}</span>}
        </div>
        {todo.notes && <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-stone-500 dark:text-stone-400">{todo.notes}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
        <button type="button" onClick={() => onSetCurrent(todo)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30 cursor-pointer" title="设为当前行动"><Zap className="h-4 w-4" /></button>
        <button type="button" onClick={() => onEdit(todo)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800 cursor-pointer" title="编辑待办"><Pencil className="h-4 w-4" /></button>
        <button type="button" onClick={() => onComplete(todo)} className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30 cursor-pointer" title="完成待办"><Check className="h-4 w-4" /></button>
        <button type="button" onClick={() => onDelete(todo)} className="rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400 cursor-pointer" title="删除待办"><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  );
};

export const TodoListTab: React.FC<TodoListTabProps> = ({ topic, todos, actions, isLoading = false }) => {
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);
  const [editor, setEditor] = useState<{ open: boolean; todo?: TopicTodo }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<TopicTodo | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const pendingTodos = useMemo(() => todos.filter((todo) => !todo.completed_at), [todos]);
  const completedTodos = useMemo(() => todos.filter((todo) => Boolean(todo.completed_at)), [todos]);
  const currentTodo = pendingTodos.find((todo) => todo.is_current === 1) || null;
  const sortableTodos = pendingTodos.filter((todo) => todo.id !== currentTodo?.id);

  const run = async (operation: () => Promise<unknown>) => {
    setIsBusy(true);
    try { await operation(); } finally { setIsBusy(false); }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortableTodos.findIndex((todo) => todo.id === active.id);
    const newIndex = sortableTodos.findIndex((todo) => todo.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(sortableTodos, oldIndex, newIndex);
    void run(() => actions.reorderTodos(topic.id, [ ...(currentTodo ? [currentTodo.id] : []), ...next.map((todo) => todo.id) ]));
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-5 sm:px-6 sm:py-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><ListTodo className="h-5 w-5 text-rose-600 dark:text-rose-400" /><h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">执行清单</h2></div>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">把选题拆成可执行的小步，并从中选出唯一的当前行动。</p>
        </div>
        <button type="button" onClick={() => setEditor({ open: true })} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-700 cursor-pointer"><Plus className="h-4 w-4" />新增待办</button>
      </div>

      {isLoading ? <div className="rounded-2xl border border-stone-200/70 bg-white p-8 text-center text-sm text-stone-500 dark:border-stone-800 dark:bg-stone-900">正在加载执行清单…</div> : (
        <>
          <section className="space-y-2">
            <div className="flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">当前行动</h3>{currentTodo && <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-700 dark:text-rose-300">唯一进行中</span>}</div>
            {currentTodo ? (
              <div className="group rounded-2xl border border-rose-300/70 bg-rose-50/70 p-4 shadow-2xs dark:border-rose-900/60 dark:bg-rose-950/25">
                <div className="flex items-start gap-3"><div className="mt-0.5 rounded-xl bg-rose-600 p-2 text-white"><Zap className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="break-words text-sm font-bold text-stone-900 dark:text-stone-100">{currentTodo.title}</div>{currentTodo.notes && <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-stone-600 dark:text-stone-300">{currentTodo.notes}</p>}<div className="mt-2 flex flex-wrap gap-2 text-[11px] text-stone-500 dark:text-stone-400">{currentTodo.due_date && <span>截止 {currentTodo.due_date}</span>}<span>可编辑，不会重置行动计时</span></div></div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => setEditor({ open: true, todo: currentTodo })} className="rounded-lg p-2 text-stone-500 hover:bg-white/70 dark:hover:bg-stone-800 cursor-pointer" title="编辑待办"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => void run(() => actions.completeTodo(currentTodo.id))} disabled={isBusy} className="rounded-lg p-2 text-emerald-700 hover:bg-white/70 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-stone-800 cursor-pointer" title="完成当前行动"><CheckCircle2 className="h-4 w-4" /></button></div></div>
              </div>
            ) : <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50/70 p-5 text-center text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-400">未设置当前行动，从下面的待办中选择一条即可。</div>}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">其他未完成 · 拖动排序</h3><span className="font-mono text-[11px] tabular-nums text-stone-400">{pendingTodos.length} 条</span></div>
            {sortableTodos.length > 0 ? <DndContext sensors={sensors} onDragEnd={handleDragEnd}><SortableContext items={sortableTodos.map((todo) => todo.id)} strategy={verticalListSortingStrategy}><div className="space-y-2">{sortableTodos.map((todo) => <SortableTodoRow key={todo.id} todo={todo} onEdit={(item) => setEditor({ open: true, todo: item })} onSetCurrent={(item) => void run(() => actions.setCurrentTodo(item.id))} onComplete={(item) => void run(() => actions.completeTodo(item.id))} onDelete={setDeleteTarget} />)}</div></SortableContext></DndContext> : <div className="rounded-2xl border border-stone-200/70 bg-white p-5 text-center text-xs text-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">暂无其他未完成待办</div>}
          </section>

          {completedTodos.length > 0 && <section className="rounded-2xl border border-stone-200/70 bg-white dark:border-stone-800 dark:bg-stone-900"><button type="button" onClick={() => setIsCompletedExpanded((expanded) => !expanded)} className="flex min-h-12 w-full items-center justify-between px-4 text-left text-xs font-bold text-stone-600 dark:text-stone-300 cursor-pointer"><span className="flex items-center gap-2">{isCompletedExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}已完成（{completedTodos.length}）</span><span className="text-[11px] font-normal text-stone-400">保留历史记录，可撤销</span></button>{isCompletedExpanded && <div className="space-y-2 border-t border-stone-100 p-3 dark:border-stone-800">{completedTodos.map((todo) => <div key={todo.id} className="group flex items-start gap-3 rounded-xl p-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/60"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /><div className="min-w-0 flex-1"><div className="break-words text-sm text-stone-500 line-through dark:text-stone-400">{todo.title}</div>{todo.completed_at && <div className="mt-1 text-[10px] text-stone-400">完成于 {todo.completed_at.slice(0, 10)}</div>}</div><div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"><button type="button" onClick={() => void run(() => actions.reopenTodo(todo.id))} disabled={isBusy} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer" title="撤销完成"><RotateCcw className="h-4 w-4" /></button><button type="button" onClick={() => setDeleteTarget(todo)} className="rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 cursor-pointer" title="删除已完成待办"><Trash2 className="h-4 w-4" /></button></div></div>)}</div>}</section>}
        </>
      )}

      <TodoEditor isOpen={editor.open} todo={editor.todo} onClose={() => setEditor({ open: false })} onSubmit={(input) => editor.todo ? run(() => actions.updateTodo(editor.todo!.id, input)) : run(() => actions.createTodo(topic.id, input))} />
      <ConfirmDialog isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} onConfirm={async () => { if (deleteTarget) await run(() => actions.deleteTodo(deleteTarget.id)); setDeleteTarget(null); }} title="删除这个待办？" description={`“${deleteTarget?.title || ''}”将从执行清单中移除。当前行动删除后会自动推进下一条未完成待办。`} confirmText="删除待办" />
    </div>
  );
};
