import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, CheckCircle2, ChevronDown, ChevronRight, GripVertical, ListTodo, Pencil, RotateCcw, Trash2, Zap } from 'lucide-react';
import type { Topic, TopicTodo } from '../../types';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import type { TopicTodoActions } from './todoTypes';

interface TodoListTabProps {
  topic: Topic;
  todos: TopicTodo[];
  actions: TopicTodoActions;
  isLoading?: boolean;
}

interface InlineTodoComposerProps {
  onCreate: (title: string) => Promise<boolean>;
  disabled?: boolean;
}

const InlineTodoComposer: React.FC<InlineTodoComposerProps> = ({ onCreate, disabled = false }) => {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || disabled) return;
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError('待办标题不能为空');
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const success = await onCreate(nextTitle);
      if (success) {
        setTitle('');
      }
    } finally {
      setIsSubmitting(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-1.5" noValidate>
      <label htmlFor="todo-composer-input" className="sr-only">添加待办</label>
      <div className="flex min-h-10 items-center gap-2 rounded-2xl border border-dashed border-rose-300/80 bg-rose-50/40 px-3 dark:border-rose-900/70 dark:bg-rose-950/20">
        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-600/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">＋</span>
        <input
          id="todo-composer-input"
          name="title"
          ref={inputRef}
          type="text"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (error) setError('');
          }}
          disabled={disabled || isSubmitting}
          required
          maxLength={200}
          enterKeyHint="next"
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby="todo-composer-help"
          placeholder="输入待办，按 Enter 添加下一条"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-base text-stone-900 outline-none placeholder:text-stone-400 focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-60 dark:text-stone-100 sm:text-sm"
        />
        <span aria-hidden="true" className="hidden shrink-0 text-[10px] font-semibold text-stone-500 sm:inline dark:text-stone-400">Enter 添加</span>
      </div>
      <div id="todo-composer-help" className="px-1 text-[11px] leading-4 text-stone-600 dark:text-stone-400" aria-live="polite">
        {error || '输入标题后按 Enter 连续添加，最多 200 字'}
      </div>
    </form>
  );
};

interface InlineTitleEditorProps {
  initialValue: string;
  onCommit: (value: string) => Promise<boolean>;
  onCancel: () => void;
  disabled?: boolean;
}

const InlineTitleEditor: React.FC<InlineTitleEditorProps> = ({ initialValue, onCommit, onCancel, disabled = false }) => {
  const [draft, setDraft] = useState(initialValue);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const committingRef = useRef(false);
  const cancelledRef = useRef(false);

  React.useEffect(() => {
    setDraft(initialValue);
    setError('');
    cancelledRef.current = false;
  }, [initialValue]);

  const focusEditor = () => requestAnimationFrame(() => inputRef.current?.focus());

  const commit = async () => {
    if (committingRef.current) return false;
    const nextTitle = draft.trim();
    if (!nextTitle) {
      setError('待办标题不能为空');
      focusEditor();
      return false;
    }

    committingRef.current = true;
    const success = await onCommit(nextTitle);
    committingRef.current = false;
    if (!success) focusEditor();
    return success;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelledRef.current = true;
      onCancel();
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        autoFocus
        id="todo-editor-input"
        name="title"
        type="text"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          if (error) setError('');
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (!cancelledRef.current) void commit();
        }}
        disabled={disabled}
        required
        maxLength={200}
        enterKeyHint="done"
        autoComplete="off"
        aria-label="编辑待办标题"
        aria-invalid={Boolean(error)}
        aria-describedby="todo-editor-error"
        className="min-h-7 min-w-0 w-full rounded-lg border border-rose-300 bg-white px-2 py-1 text-base font-semibold leading-5 text-stone-900 outline-none focus-visible:border-rose-500 focus-visible:ring-2 focus-visible:ring-rose-500/30 dark:border-rose-700 dark:bg-stone-900 dark:text-stone-100 sm:text-sm"
      />
      <div id="todo-editor-error" role={error ? 'alert' : undefined} className={error ? 'mt-1 text-[11px] leading-4 text-rose-700 dark:text-rose-300' : 'sr-only'}>{error || '按 Enter 保存，按 Escape 取消编辑'}</div>
    </>
  );
};

const TodoDragPreview: React.FC<{ todo: TopicTodo; size?: { width: number; height: number } }> = ({ todo, size }) => (
  <div data-testid="todo-drag-preview" style={size ? { width: size.width, height: size.height, boxSizing: 'border-box' } : undefined} className="flex min-h-10 flex-none items-center gap-2 overflow-hidden rounded-2xl border border-rose-300 bg-white px-3 py-1 shadow-xl ring-1 ring-rose-500/20 dark:border-rose-700 dark:bg-stone-900">
    <GripVertical className="h-4 w-4 shrink-0 text-rose-400" />
    <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-5 text-stone-900 dark:text-stone-100">{todo.title}</span>
  </div>
);

interface SortableTodoRowProps {
  todo: TopicTodo;
  isEditing: boolean;
  onEdit: (todo: TopicTodo) => void;
  onSaveEdit: (todo: TopicTodo, title: string) => Promise<boolean>;
  onCancelEdit: () => void;
  onSetCurrent: (todo: TopicTodo) => void;
  onComplete: (todo: TopicTodo) => void;
  onDelete: (todo: TopicTodo) => void;
  disabled?: boolean;
}

const SortableTodoRow: React.FC<SortableTodoRowProps> = ({
  todo,
  isEditing,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onSetCurrent,
  onComplete,
  onDelete,
  disabled = false,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="todo-row"
      data-todo-id={todo.id}
      className={`group flex min-h-10 items-center gap-2 rounded-2xl border px-3 py-1 transition-shadow motion-reduce:!transition-none dark:bg-stone-900 ${isDragging ? 'border-rose-300 opacity-0 shadow-none dark:border-rose-700' : 'border-stone-200/70 bg-white dark:border-stone-800'}`}
    >
      <button
        type="button"
        aria-label="拖动排序"
        className="flex h-7 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 active:cursor-grabbing dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <InlineTitleEditor
            initialValue={todo.title}
            onCommit={(title) => onSaveEdit(todo, title)}
            onCancel={onCancelEdit}
            disabled={disabled}
          />
        ) : (
          <span className="block break-words text-sm font-semibold leading-5 text-stone-900 dark:text-stone-100">{todo.title}</span>
        )}
      </div>
      {!isEditing && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
          <button type="button" onClick={() => onSetCurrent(todo)} disabled={disabled} className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/30" title="设为当前行动"><Zap className="h-4 w-4" /></button>
          <button type="button" onClick={() => onEdit(todo)} disabled={disabled} className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:text-stone-400 dark:hover:bg-stone-800" title="编辑待办"><Pencil className="h-4 w-4" /></button>
          <button type="button" onClick={() => onComplete(todo)} disabled={disabled} className="flex h-7 w-7 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30" title="完成待办"><Check className="h-4 w-4" /></button>
          <button type="button" onClick={() => onDelete(todo)} disabled={disabled} className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-500 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-rose-950/30 dark:hover:text-rose-400" title="删除待办"><Trash2 className="h-4 w-4" /></button>
        </div>
      )}
    </li>
  );
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

export const TodoListTab: React.FC<TodoListTabProps> = ({ topic, todos, actions, isLoading = false }) => {
  const { showToast } = useToast();
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TopicTodo | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [activeTodoId, setActiveTodoId] = useState<string | null>(null);
  const [activeTodoSize, setActiveTodoSize] = useState<{ width: number; height: number } | undefined>(undefined);
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const editSavingRef = useRef<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const pendingTodos = useMemo(() => todos.filter((todo) => !todo.completed_at), [todos]);
  const completedTodos = useMemo(() => todos.filter((todo) => Boolean(todo.completed_at)), [todos]);
  const currentTodo = pendingTodos.find((todo) => todo.is_current === 1) || null;
  const sortableTodos = useMemo(() => {
    const candidates = pendingTodos.filter((todo) => todo.id !== currentTodo?.id);
    if (!pendingOrder) return candidates;
    const todoMap = new Map(candidates.map((todo) => [todo.id, todo]));
    return pendingOrder.flatMap((id) => {
      const todo = todoMap.get(id);
      return todo ? [todo] : [];
    });
  }, [currentTodo?.id, pendingOrder, pendingTodos]);
  const activeTodo = activeTodoId ? sortableTodos.find((todo) => todo.id === activeTodoId) || null : null;

  const run = async (operation: () => Promise<unknown>): Promise<boolean> => {
    if (isBusy) return false;
    setIsBusy(true);
    try {
      await operation();
      return true;
    } catch (error) {
      showToast({ tone: 'error', message: getErrorMessage(error) });
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const startEditing = (todo: TopicTodo) => {
    if (isBusy) return;
    setEditingTodoId(todo.id);
  };

  const cancelEditing = () => {
    if (editSavingRef.current) return;
    setEditingTodoId(null);
  };

  const saveEditing = async (todo: TopicTodo, title: string): Promise<boolean> => {
    if (editingTodoId !== todo.id || editSavingRef.current === todo.id) return false;
    const nextTitle = title.trim();
    if (!nextTitle) return false;
    editSavingRef.current = todo.id;
    const success = await run(() => actions.updateTodo(todo.id, { title: nextTitle }));
    editSavingRef.current = null;
    if (success && editingTodoId === todo.id) {
      setEditingTodoId(null);
    }
    return success;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTodoId(String(event.active.id));
    const initialRect = event.active.rect.current.initial;
    setActiveTodoSize(initialRect ? { width: initialRect.width, height: initialRect.height } : undefined);
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    setActiveTodoId(null);
    setActiveTodoSize(undefined);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTodoId(null);
    setActiveTodoSize(undefined);
    if (!over || active.id === over.id) return;
    const oldIndex = sortableTodos.findIndex((todo) => todo.id === active.id);
    const newIndex = sortableTodos.findIndex((todo) => todo.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(sortableTodos, oldIndex, newIndex);
    const ids = next.map((todo) => todo.id);
    setPendingOrder(ids);
    await run(() => actions.reorderTodos(topic.id, [ ...(currentTodo ? [currentTodo.id] : []), ...ids ]));
    setPendingOrder(null);
  };

  const createTodo = (title: string) => run(() => actions.createTodo(topic.id, { title }));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-5 sm:px-6 sm:py-7">
      <div>
        <div className="flex items-center gap-2"><ListTodo className="h-5 w-5 text-rose-600 dark:text-rose-400" /><h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">执行清单</h2></div>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">把选题拆成可执行的小步，并从中选出唯一的当前行动。</p>
      </div>

      {isLoading ? <div className="rounded-2xl border border-stone-200/70 bg-white p-8 text-center text-sm text-stone-500 dark:border-stone-800 dark:bg-stone-900">正在加载执行清单…</div> : (
        <>
          <section className="space-y-2">
            <div className="flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">当前行动</h3>{currentTodo && <span className="inline-flex h-6 items-center rounded-full bg-rose-500/10 px-2.5 text-[11px] font-bold leading-none text-rose-700 dark:text-rose-300">唯一进行中</span>}</div>
            {currentTodo ? (
              <div className="group rounded-2xl border border-rose-300/70 bg-rose-50/70 px-3 py-2.5 shadow-2xs dark:border-rose-900/60 dark:bg-rose-950/25">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white"><Zap className="h-3.5 w-3.5" /></div>
                  <div className="min-w-0 flex-1">
                    {editingTodoId === currentTodo.id ? (
                      <InlineTitleEditor initialValue={currentTodo.title} onCommit={(title) => saveEditing(currentTodo, title)} onCancel={cancelEditing} disabled={isBusy} />
                    ) : <div className="break-words text-sm font-bold leading-5 text-stone-900 dark:text-stone-100">{currentTodo.title}</div>}
                    <div className="text-[10px] leading-3 text-stone-600 dark:text-stone-400">可编辑，不会重置行动计时</div>
                  </div>
                  {editingTodoId !== currentTodo.id && <div className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => startEditing(currentTodo)} disabled={isBusy} className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-500 hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-stone-800" title="编辑待办"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void run(() => actions.completeTodo(currentTodo.id))} disabled={isBusy} className="flex h-7 w-7 items-center justify-center rounded-lg text-emerald-700 hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-stone-800" title="完成当前行动"><CheckCircle2 className="h-3.5 w-3.5" /></button></div>}
                </div>
              </div>
            ) : <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50/70 p-5 text-center text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-400">未设置当前行动，从下面的待办中选择一条即可。</div>}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">其他未完成 · 拖动排序</h3><span className="font-mono text-[11px] tabular-nums text-stone-400">{pendingTodos.length} 条</span></div>
            <DndContext collisionDetection={closestCenter} sensors={sensors} onDragStart={handleDragStart} onDragCancel={handleDragCancel} onDragEnd={(event) => void handleDragEnd(event)}>
              {sortableTodos.length > 0 ? <SortableContext items={sortableTodos.map((todo) => todo.id)} strategy={verticalListSortingStrategy}><ul role="list" className="space-y-2">{sortableTodos.map((todo) => <SortableTodoRow key={todo.id} todo={todo} isEditing={editingTodoId === todo.id} onEdit={startEditing} onSaveEdit={saveEditing} onCancelEdit={cancelEditing} onSetCurrent={(item) => void run(() => actions.setCurrentTodo(item.id))} onComplete={(item) => void run(() => actions.completeTodo(item.id))} onDelete={setDeleteTarget} disabled={isBusy} />)}</ul></SortableContext> : <div className="rounded-2xl border border-stone-200/70 bg-white p-5 text-center text-xs text-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">暂无其他未完成待办</div>}
              {typeof document !== 'undefined' && createPortal(<DragOverlay dropAnimation={null}>{activeTodo ? <TodoDragPreview todo={activeTodo} size={activeTodoSize} /> : null}</DragOverlay>, document.body)}
            </DndContext>
            <InlineTodoComposer onCreate={createTodo} disabled={isBusy} />
          </section>

          {completedTodos.length > 0 && <section className="rounded-2xl border border-stone-200/70 bg-white dark:border-stone-800 dark:bg-stone-900"><button type="button" onClick={() => setIsCompletedExpanded((expanded) => !expanded)} aria-expanded={isCompletedExpanded} className="flex min-h-12 w-full items-center justify-between px-4 text-left text-xs font-bold text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-500/40 dark:text-stone-300"><span className="flex items-center gap-2">{isCompletedExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}已完成（{completedTodos.length}）</span><span className="text-[11px] font-normal text-stone-500 dark:text-stone-400">保留历史记录，可撤销</span></button>{isCompletedExpanded && <ul role="list" className="space-y-2 border-t border-stone-100 p-3 dark:border-stone-800">{completedTodos.map((todo) => <li key={todo.id} className="group flex min-h-10 items-center gap-3 rounded-xl px-2.5 py-1 hover:bg-stone-50 dark:hover:bg-stone-800/60"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /><div className="min-w-0 flex-1"><div className="break-words text-sm leading-5 text-stone-500 line-through dark:text-stone-400">{todo.title}</div>{todo.completed_at && <div className="text-[10px] leading-4 text-stone-500 dark:text-stone-400">完成于 {todo.completed_at.slice(0, 10)}</div>}</div><div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"><button type="button" onClick={() => void run(() => actions.reopenTodo(todo.id))} disabled={isBusy} className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:text-stone-400 dark:hover:bg-stone-800" title="撤销完成"><RotateCcw className="h-4 w-4" /></button><button type="button" onClick={() => setDeleteTarget(todo)} disabled={isBusy} className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-500 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-rose-950/30 dark:hover:text-rose-400" title="删除已完成待办"><Trash2 className="h-4 w-4" /></button></div></li>)}</ul>}</section>}
        </>
      )}

      <ConfirmDialog isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} onConfirm={async () => { if (deleteTarget) { const success = await run(() => actions.deleteTodo(deleteTarget.id)); if (success) setDeleteTarget(null); } }} title="删除这个待办？" description={`“${deleteTarget?.title || ''}”将从执行清单中移除。当前行动删除后会自动推进下一条未完成待办。`} confirmText="删除待办" />
    </div>
  );
};
