import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, ListTodo, Pencil, RotateCcw, Trash2, Zap } from 'lucide-react';
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
      if (await onCreate(nextTitle)) setTitle('');
    } finally {
      setIsSubmitting(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-1.5" noValidate>
      <label htmlFor="todo-composer-input" className="sr-only">添加待办</label>
      <div className="flex min-h-10 items-center gap-2 rounded-2xl border border-dashed border-rose-300/80 bg-rose-50/40 px-3 transition-colors focus-within:border-rose-400/90 focus-within:bg-white/90 focus-within:shadow-[inset_0_-2px_0_0_rgba(225,29,72,0.45)] motion-reduce:transition-none dark:border-rose-900/70 dark:bg-rose-950/20 dark:focus-within:border-rose-700 dark:focus-within:bg-stone-900 dark:focus-within:shadow-[inset_0_-2px_0_0_rgba(251,113,133,0.5)]">
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
          className="min-w-0 flex-1 bg-transparent py-1.5 text-base text-stone-900 outline-none ring-0 placeholder:text-stone-400 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60 dark:text-stone-100 sm:text-sm"
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
}

const InlineTitleEditor: React.FC<InlineTitleEditorProps> = ({ initialValue, onCommit, onCancel }) => {
  const [draft, setDraft] = useState(initialValue);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const committingRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
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
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelledRef.current = true;
            onCancel();
          }
        }}
        onBlur={() => {
          if (!cancelledRef.current) void commit();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        required
        maxLength={200}
        enterKeyHint="done"
        autoComplete="off"
        aria-label="编辑待办标题"
        aria-invalid={Boolean(error)}
        aria-describedby="todo-editor-error"
        className="min-h-7 min-w-0 w-full rounded-lg border border-rose-300 bg-white px-2 py-1 text-base font-semibold leading-5 text-stone-900 outline-none focus:border-rose-500 focus:outline-none focus:ring-0 dark:border-rose-700 dark:bg-stone-900 dark:text-stone-100 sm:text-sm"
      />
      <div id="todo-editor-error" role={error ? 'alert' : undefined} className={error ? 'mt-1 text-[11px] leading-4 text-rose-700 dark:text-rose-300' : 'sr-only'}>{error || '按 Enter 保存，按 Escape 取消编辑'}</div>
    </>
  );
};

const TodoDragPreview: React.FC<{ todo: TopicTodo; isCurrent: boolean; size?: { width: number; height: number } }> = ({ todo, isCurrent, size }) => (
  <div
    data-testid="todo-drag-preview"
    style={size ? { width: size.width, height: size.height, boxSizing: 'border-box' } : undefined}
    className={`flex min-h-10 flex-none items-center gap-2 overflow-hidden rounded-2xl border px-3 py-1 shadow-xl ring-1 ring-rose-500/20 ${isCurrent ? 'border-rose-400 bg-rose-50 dark:border-rose-600 dark:bg-rose-950/30' : 'border-stone-300 bg-white dark:border-stone-700 dark:bg-stone-900'}`}
  >
    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${isCurrent ? 'bg-rose-600 dark:bg-rose-400' : 'bg-stone-300 dark:bg-stone-600'}`} />
    <span className={`min-w-0 flex-1 break-words text-sm leading-5 ${todo.completed_at ? 'text-stone-500 line-through dark:text-stone-400' : 'font-semibold text-stone-900 dark:text-stone-100'}`}>{todo.title}</span>
    {isCurrent && <span className="shrink-0 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold leading-none text-white">当前行动</span>}
  </div>
);

interface SortableTodoRowProps {
  todo: TopicTodo;
  isCurrent: boolean;
  isEditing: boolean;
  onEdit: (todo: TopicTodo) => void;
  onSaveEdit: (todo: TopicTodo, title: string) => Promise<boolean>;
  onCancelEdit: () => void;
  onComplete: (todo: TopicTodo) => void;
  onReopen: (todo: TopicTodo) => void;
  onDelete: (todo: TopicTodo) => void;
  disabled?: boolean;
}

const SortableTodoRow: React.FC<SortableTodoRowProps> = ({
  todo,
  isCurrent,
  isEditing,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onComplete,
  onReopen,
  onDelete,
  disabled = false,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: todo.id,
    disabled,
  });
  const isCompleted = Boolean(todo.completed_at);
  const dragAttributes = isEditing ? {} : attributes;
  const dragListeners = isEditing ? {} : listeners;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="todo-row"
      data-todo-id={todo.id}
      data-current={isCurrent ? 'true' : undefined}
      aria-current={isCurrent ? 'true' : undefined}
      className={`group flex min-h-10 items-center gap-2 rounded-2xl border px-2.5 py-0.5 transition-shadow motion-reduce:!transition-none dark:bg-stone-900 ${isDragging ? 'border-rose-300 opacity-0 shadow-none dark:border-rose-700' : isCurrent ? 'border-rose-300/80 bg-rose-50/70 shadow-2xs dark:border-rose-800/80 dark:bg-rose-950/25' : isCompleted ? 'border-stone-200/70 bg-stone-50/70 dark:border-stone-800 dark:bg-stone-900/70' : 'border-stone-200/70 bg-white dark:border-stone-800'}`}
    >
      <input
        type="checkbox"
        checked={isCompleted}
        onChange={() => (isCompleted ? onReopen(todo) : onComplete(todo))}
        onPointerDown={(event) => event.stopPropagation()}
        disabled={disabled}
        aria-label={isCompleted ? `撤销完成：${todo.title}` : `完成待办：${todo.title}`}
        className="h-4 w-4 shrink-0 cursor-pointer accent-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
      />

      <div
        {...dragAttributes}
        {...dragListeners}
        data-testid="todo-drag-handle"
        className={`min-w-0 flex-1 rounded-xl px-1.5 py-1 ${isEditing ? '' : 'cursor-grab touch-none active:cursor-grabbing'}`}
        aria-label={`${todo.title}${isCurrent ? '，当前行动' : ''}`}
      >
        {isEditing ? (
          <InlineTitleEditor
            initialValue={todo.title}
            onCommit={(title) => onSaveEdit(todo, title)}
            onCancel={onCancelEdit}
          />
        ) : (
          <div className="flex min-h-7 items-center gap-2">
            <span className={`min-w-0 flex-1 break-words text-sm leading-5 ${isCompleted ? 'text-stone-500 line-through dark:text-stone-400' : isCurrent ? 'font-bold text-stone-900 dark:text-stone-100' : 'font-semibold text-stone-900 dark:text-stone-100'}`}>{todo.title}</span>
            {isCurrent && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-600 px-2 py-1 text-[10px] font-bold leading-none text-white shadow-2xs"><Zap className="h-3 w-3" aria-hidden="true" />当前行动</span>}
          </div>
        )}
      </div>

      {!isEditing && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
          <button type="button" onClick={(event) => { event.stopPropagation(); onEdit(todo); }} disabled={disabled} className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:text-stone-400 dark:hover:bg-stone-800" title="编辑待办"><Pencil className="h-4 w-4" /></button>
          {isCompleted ? (
            <button type="button" onClick={(event) => { event.stopPropagation(); onReopen(todo); }} disabled={disabled} className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:text-stone-400 dark:hover:bg-stone-800" title="撤销完成"><RotateCcw className="h-4 w-4" /></button>
          ) : (
            <button type="button" onClick={(event) => { event.stopPropagation(); onComplete(todo); }} disabled={disabled} className="flex h-7 w-7 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30" title="完成待办"><Check className="h-4 w-4" /></button>
          )}
          <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(todo); }} disabled={disabled} className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-500 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-rose-950/30 dark:hover:text-rose-400" title={isCompleted ? '删除已完成待办' : '删除待办'}><Trash2 className="h-4 w-4" /></button>
        </div>
      )}
    </li>
  );
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

function normalizeDisplayOrder(items: TopicTodo[]): TopicTodo[] {
  return [items.filter((todo) => !todo.completed_at), items.filter((todo) => Boolean(todo.completed_at))].flat();
}

export const TodoListTab: React.FC<TodoListTabProps> = ({ topic, todos, actions, isLoading = false }) => {
  const { showToast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<TopicTodo | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [activeTodoId, setActiveTodoId] = useState<string | null>(null);
  const [activeTodoSize, setActiveTodoSize] = useState<{ width: number; height: number } | undefined>(undefined);
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const editSavingRef = useRef<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const orderedTodos = useMemo(() => {
    const source = pendingOrder
      ? pendingOrder.flatMap((id) => todos.find((todo) => todo.id === id) || [])
      : todos;
    return normalizeDisplayOrder(source);
  }, [pendingOrder, todos]);
  const currentTodoId = orderedTodos.find((todo) => !todo.completed_at)?.id || null;
  const activeTodo = activeTodoId ? orderedTodos.find((todo) => todo.id === activeTodoId) || null : null;

  useEffect(() => {
    if (pendingOrder) setPendingOrder(null);
  }, [todos]);

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
    if (!isBusy) setEditingTodoId(todo.id);
  };

  const cancelEditing = () => {
    if (!editSavingRef.current) setEditingTodoId(null);
  };

  const saveEditing = async (todo: TopicTodo, title: string): Promise<boolean> => {
    if (editingTodoId !== todo.id || editSavingRef.current === todo.id) return false;
    const nextTitle = title.trim();
    if (!nextTitle) return false;
    editSavingRef.current = todo.id;
    const success = await run(() => actions.updateTodo(todo.id, { title: nextTitle }));
    editSavingRef.current = null;
    if (success && editingTodoId === todo.id) setEditingTodoId(null);
    return success;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    const sourceRow = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="todo-row"]')).find((row) => row.dataset.todoId === id);
    const sourceRect = sourceRow?.getBoundingClientRect();
    const initialRect = event.active.rect.current.initial;
    setActiveTodoId(id);
    setActiveTodoSize(sourceRect ? { width: sourceRect.width, height: sourceRect.height } : initialRect ? { width: initialRect.width, height: initialRect.height } : undefined);
  };

  const clearDragState = () => {
    setActiveTodoId(null);
    setActiveTodoSize(undefined);
  };

  const handleDragCancel = (_event: DragCancelEvent) => clearDragState();

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    clearDragState();
    if (!over || active.id === over.id) return;
    const oldIndex = orderedTodos.findIndex((todo) => todo.id === active.id);
    const newIndex = orderedTodos.findIndex((todo) => todo.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const nextIds = normalizeDisplayOrder(arrayMove(orderedTodos, oldIndex, newIndex)).map((todo) => todo.id);
    setPendingOrder(nextIds);
    await run(() => actions.reorderTodos(topic.id, nextIds));
    setPendingOrder(null);
  };

  const createTodo = (title: string) => run(() => actions.createTodo(topic.id, { title }));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-5 sm:px-6 sm:py-7">
      <div>
        <div className="flex items-center gap-2"><ListTodo className="h-5 w-5 text-rose-600 dark:text-rose-400" /><h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">执行清单</h2></div>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">首个未完成待办就是当前行动，按住待办胶囊即可调整顺序。</p>
      </div>

      {isLoading ? <div className="rounded-2xl border border-stone-200/70 bg-white p-8 text-center text-sm text-stone-500 dark:border-stone-800 dark:bg-stone-900">正在加载执行清单…</div> : (
        <DndContext collisionDetection={closestCenter} sensors={sensors} onDragStart={handleDragStart} onDragCancel={handleDragCancel} onDragEnd={(event) => void handleDragEnd(event)}>
          <SortableContext items={orderedTodos.map((todo) => todo.id)} strategy={verticalListSortingStrategy}>
            <ul role="list" aria-label="执行清单" className="space-y-2">
              {orderedTodos.map((todo) => (
                <SortableTodoRow
                  key={todo.id}
                  todo={todo}
                  isCurrent={todo.id === currentTodoId}
                  isEditing={editingTodoId === todo.id}
                  onEdit={startEditing}
                  onSaveEdit={saveEditing}
                  onCancelEdit={cancelEditing}
                  onComplete={(item) => void run(() => actions.completeTodo(item.id))}
                  onReopen={(item) => void run(() => actions.reopenTodo(item.id))}
                  onDelete={setDeleteTarget}
                  disabled={isBusy}
                />
              ))}
            </ul>
          </SortableContext>
          {typeof document !== 'undefined' && createPortal(
            <DragOverlay dropAnimation={null}>
              {activeTodo ? <TodoDragPreview todo={activeTodo} isCurrent={activeTodo.id === currentTodoId} size={activeTodoSize} /> : null}
            </DragOverlay>,
            document.body,
          )}
          <InlineTodoComposer onCreate={createTodo} disabled={isBusy} />
        </DndContext>
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const success = await run(() => actions.deleteTodo(deleteTarget.id));
          if (success) setDeleteTarget(null);
        }}
        title="删除这个待办？"
        description={`“${deleteTarget?.title || ''}”将从执行清单中移除。删除首个未完成待办后，下一条会自动成为当前行动。`}
        confirmText="删除待办"
      />
    </div>
  );
};
