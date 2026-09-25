import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowRightLeft, Check, GripVertical, KanbanSquare, MoreHorizontal, Pencil, Trash2, Zap } from 'lucide-react';
import type { Topic, TopicTodo, TopicTodoBoardLayout, TopicTodoStatus } from '../../types';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { FloatingMenu } from '../ui/FloatingMenu';
import { useToast } from '../ui/Toast';
import type { TopicTodoActions } from './todoTypes';
import { findTodoStatus, getTodoBoardLayout, moveTodoOnBoard, reorderTodoInColumn, TODO_BOARD_COLUMNS } from './todoBoardUtils';

interface TodoBoardProps {
  topic: Topic;
  todos: TopicTodo[];
  actions: TopicTodoActions;
  isLoading?: boolean;
}

const laneKey = (status: TopicTodoStatus): 'todo_ids' | 'in_progress_ids' | 'completed_ids' => `${status}_ids` as 'todo_ids' | 'in_progress_ids' | 'completed_ids';

class NonTouchPointerSensor extends PointerSensor {
  static activators = [{
    eventName: 'onPointerDown' as const,
    handler: ({ nativeEvent }: { nativeEvent: PointerEvent }) => nativeEvent.isPrimary && nativeEvent.button === 0 && nativeEvent.pointerType !== 'touch',
  }];
}

const BoardComposer: React.FC<{ onCreate: (title: string) => Promise<boolean> }> = ({ onCreate }) => {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    const value = title.trim();
    if (!value) {
      setError('待办标题不能为空');
      inputRef.current?.focus();
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      if (await onCreate(value)) setTitle('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-1.5">
      <label htmlFor={id} className="sr-only">添加待办事项</label>
      <div className="todo-composer-shell flex min-h-11 items-center gap-2 rounded-xl px-3">
        <span aria-hidden="true" className="todo-composer-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">＋</span>
        <input
          ref={inputRef}
          id={id}
          value={title}
          onChange={(event) => { setTitle(event.target.value); setError(''); }}
          disabled={isSubmitting}
          maxLength={200}
          enterKeyHint="done"
          autoComplete="off"
          placeholder="添加一条待办，按 Enter 保存"
          className="todo-composer-input min-w-0 flex-1 bg-transparent py-1.5 text-base text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-100 sm:text-sm"
          aria-describedby={`${id}-help`}
          aria-invalid={Boolean(error)}
        />
        <button type="submit" disabled={isSubmitting || !title.trim()} className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:cursor-not-allowed disabled:opacity-40">
          {isSubmitting ? '添加中…' : '添加'}
        </button>
      </div>
      <p id={`${id}-help`} aria-live="polite" className="px-1 text-[11px] leading-4 text-stone-500 dark:text-stone-400">
        {error || '新建事项会进入待办列，标题最多 200 字'}
      </p>
    </form>
  );
};

const InlineTitleEditor: React.FC<{
  initialValue: string;
  onSave: (title: string) => Promise<boolean>;
  onCancel: () => void;
}> = ({ initialValue, onSave, onCancel }) => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  useEffect(() => { setValue(initialValue); setError(''); }, [initialValue]);

  const commit = async () => {
    if (savingRef.current) return;
    const title = value.trim();
    if (!title) { setError('待办标题不能为空'); inputRef.current?.focus(); return; }
    savingRef.current = true;
    const saved = await onSave(title);
    savingRef.current = false;
    if (!saved) inputRef.current?.focus();
  };

  return (
    <>
      <input
        ref={inputRef}
        autoFocus
        value={value}
        onChange={(event) => { setValue(event.target.value); setError(''); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); void commit(); }
          if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
        }}
        onBlur={() => { if (value.trim()) void commit(); }}
        onPointerDown={(event) => event.stopPropagation()}
        maxLength={200}
        aria-label="编辑待办标题"
        aria-invalid={Boolean(error)}
        className="todo-inline-editor-input min-h-8 w-full bg-transparent text-sm font-semibold text-stone-900 outline-none dark:text-stone-100"
      />
      {error && <span role="alert" className="text-[11px] text-rose-600 dark:text-rose-400">{error}</span>}
    </>
  );
};

interface SortableTodoCardProps {
  todo: TopicTodo;
  status: TopicTodoStatus;
  isCurrent: boolean;
  isEditing: boolean;
  isBusy: boolean;
  onEdit: () => void;
  onSave: (title: string) => Promise<boolean>;
  onCancelEdit: () => void;
  onToggleComplete: () => void;
  onMove: (status: TopicTodoStatus) => void;
  onDelete: () => void;
}

const SortableTodoCard: React.FC<SortableTodoCardProps> = ({ todo, status, isCurrent, isEditing, isBusy, onEdit, onSave, onCancelEdit, onToggleComplete, onMove, onDelete }) => {
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const moveButtonRef = useRef<HTMLButtonElement>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: todo.id,
    data: { type: 'todo', status },
    disabled: isBusy,
  });
  const isCompleted = status === 'completed';

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="todo-board-card"
      data-todo-id={todo.id}
      data-current={isCurrent ? 'true' : undefined}
      aria-current={isCurrent ? 'true' : undefined}
      className={`group relative flex min-w-0 select-none touch-manipulation flex-col gap-2.5 rounded-[var(--radius-md)] border p-3.5 shadow-2xs transition-all duration-150 ${isDragging ? 'border-dashed bg-[var(--canvas)] opacity-35 shadow-none' : isCompleted ? 'border-[var(--line)] bg-[var(--canvas)]/55' : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--accent)]/35 hover:shadow-subtle'}`}
    >
      <div className="flex min-w-0 items-start gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`拖动排序：${todo.title}`}
          className="mt-0.5 flex h-7 w-6 shrink-0 touch-none items-center justify-center rounded-[var(--radius-sm)] text-[var(--ink-muted)]/70 hover:bg-[var(--canvas)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onToggleComplete}
          disabled={isBusy}
          aria-label={isCompleted ? `恢复为待办：${todo.title}` : `完成待办：${todo.title}`}
          className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-wait ${isCompleted ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--line)] hover:border-[var(--accent)]'}`}
        >
          {isCompleted && <Check className="h-3 w-3" aria-hidden="true" />}
        </button>
        <div className="min-w-0 flex-1 py-0.5">
          {isEditing ? (
            <InlineTitleEditor initialValue={todo.title} onSave={onSave} onCancel={onCancelEdit} />
          ) : (
            <div className="flex min-h-6 min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`min-w-0 flex-1 break-words text-sm leading-5 ${isCompleted ? 'text-[var(--ink-muted)] line-through' : 'font-medium text-[var(--ink)]'}`}>{todo.title}</span>
              {isCurrent && <span className="todo-current-badge inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-1 text-[10px] font-semibold leading-none"><Zap className="h-3 w-3" aria-hidden="true" />当前行动</span>}
              {isBusy && <span className="text-[10px] text-[var(--ink-muted)]">保存中</span>}
            </div>
          )}
        </div>
        {!isEditing && (
          <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-65 sm:transition-opacity sm:group-hover:opacity-100">
            <button type="button" onClick={onEdit} disabled={isBusy} aria-label={`编辑：${todo.title}`} className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--ink-muted)] hover:bg-[var(--canvas)] hover:text-[var(--ink)] disabled:opacity-40">
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              ref={moveButtonRef}
              type="button"
              onClick={() => setMoveMenuOpen((open) => !open)}
              disabled={isBusy}
              aria-label={`移动“${todo.title}”`}
              aria-expanded={moveMenuOpen}
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--ink-muted)] hover:bg-[var(--canvas)] hover:text-[var(--ink)] disabled:opacity-40"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>
            <FloatingMenu isOpen={moveMenuOpen} anchorRef={moveButtonRef} onClose={() => setMoveMenuOpen(false)} align="right" width={156} ariaLabel="移动待办">
              <div className="p-1.5">
                <p className="px-2 py-1 text-[10px] font-semibold text-stone-400">移动到</p>
                {TODO_BOARD_COLUMNS.filter((column) => column.status !== status).map((column) => (
                  <button
                    key={column.status}
                    type="button"
                    role="menuitem"
                    onClick={() => { setMoveMenuOpen(false); onMove(column.status); }}
                    className="flex min-h-9 w-full items-center justify-between rounded-[var(--radius-sm)] px-2 text-left text-xs text-[var(--ink)] hover:bg-[var(--canvas)]"
                  >
                    <span>{column.label}</span><ArrowRightLeft className="h-3.5 w-3.5 text-stone-400" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </FloatingMenu>
            <button type="button" onClick={onDelete} disabled={isBusy} aria-label={`删除：${todo.title}`} className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--ink-muted)] hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-40 dark:hover:text-rose-400">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
};

const TodoBoardColumn: React.FC<{
  status: TopicTodoStatus;
  ids: string[];
  children: React.ReactNode;
}> = ({ status, ids, children }) => {
  const column = TODO_BOARD_COLUMNS.find((item) => item.status === status)!;
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}`, data: { type: 'column', status } });
  return (
    <section
      ref={setNodeRef}
      data-testid="todo-board-column"
      data-column-status={status}
      aria-label={`${column.label}，${ids.length} 条`}
      className={`kanban-column-container todo-board-column flex min-h-[220px] min-w-0 flex-col rounded-[var(--radius-md)] border p-3 transition-colors duration-150 ${isOver ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/30 bg-[var(--accent-soft)] shadow-subtle' : 'border-[var(--line)] bg-[var(--canvas)]/60 hover:bg-[var(--canvas)]'}`}
    >
      <header className="mb-2.5 flex items-center justify-between gap-2 px-1.5 py-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${status === 'todo' ? 'bg-stone-400' : status === 'in_progress' ? 'bg-[var(--accent)]' : 'bg-emerald-600 dark:bg-emerald-500'}`} />
          <h3 className="text-[13.5px] font-semibold tracking-tight text-[var(--ink)]">{column.label}</h3>
          <span className="kanban-column-count ml-0.5 text-xs tabular-nums text-[var(--ink-muted)]">{ids.length}</span>
        </div>
      </header>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="mobile-scroll-reveal min-h-[140px] min-w-0 flex-1 space-y-2.5">
          {children}
          {ids.length === 0 && <div className={`flex h-24 flex-col items-center justify-center rounded-[var(--radius-sm)] border border-dashed p-3 text-center text-xs transition-colors duration-150 ${isOver ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-[var(--line)] bg-[var(--surface)]/50 text-[var(--ink-muted)]'}`}><span className="font-medium">{isOver ? '松开以移入此列' : '暂无待办'}</span><span className="mt-0.5 text-[11px] opacity-75">{isOver ? `将事项归入「${column.label}」` : '拖动事项至此可调整进度'}</span></div>}
        </div>
      </SortableContext>
    </section>
  );
};

function layoutFromDragEvent(event: DragEndEvent, current: TopicTodoBoardLayout): TopicTodoBoardLayout | null {
  const { active, over } = event;
  if (!over || active.id === over.id) return null;
  const todoId = String(active.id);
  const overId = String(over.id);
  const sourceStatus = findTodoStatus(current, todoId);
  if (!sourceStatus) return null;
  const data = over.data.current as { type?: string; status?: TopicTodoStatus } | undefined;
  const targetStatus = data?.status || (overId.startsWith('column:') ? overId.slice('column:'.length) as TopicTodoStatus : findTodoStatus(current, overId));
  if (!targetStatus || !TODO_BOARD_COLUMNS.some((column) => column.status === targetStatus)) return null;
  if (sourceStatus === targetStatus) {
    if (overId.startsWith('column:')) return null;
    return reorderTodoInColumn(current, todoId, overId);
  }
  return moveTodoOnBoard(current, todoId, targetStatus, data?.type === 'todo' ? overId : undefined);
}

export const TodoBoard: React.FC<TodoBoardProps> = ({ topic, todos, actions, isLoading = false }) => {
  const { showToast } = useToast();
  const [mobileStatus, setMobileStatus] = useState<TopicTodoStatus>('todo');
  const [localLayout, setLocalLayout] = useState<TopicTodoBoardLayout | null>(null);
  const [activeTodoId, setActiveTodoId] = useState<string | null>(null);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TopicTodo | null>(null);
  const [busyTodoIds, setBusyTodoIds] = useState<Set<string>>(new Set());
  const [busyBoardCount, setBusyBoardCount] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const boardQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingBoardCountRef = useRef(0);
  const pendingBoardTodoCountsRef = useRef(new Map<string, number>());
  const localRevisionRef = useRef(0);
  const operationIdsRef = useRef(new Set<string>());
  const sourceLayout = useMemo(() => getTodoBoardLayout(todos), [todos]);
  const layout = localLayout || sourceLayout;
  const todoById = useMemo(() => new Map(todos.map((todo) => [todo.id, todo])), [todos]);
  const laneCounts = {
    todo: layout.todo_ids.length,
    in_progress: layout.in_progress_ids.length,
    completed: layout.completed_ids.length,
  };
  const activeTodo = activeTodoId ? todoById.get(activeTodoId) : null;
  const sensors = useSensors(
    useSensor(NonTouchPointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (pendingBoardCountRef.current === 0) setLocalLayout(null);
  }, [todos]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const updateViewport = () => setIsDesktop(media.matches);
    updateViewport();
    media.addEventListener('change', updateViewport);
    return () => media.removeEventListener('change', updateViewport);
  }, []);

  const withTodoLock = async (todoId: string, operation: () => Promise<unknown>): Promise<boolean> => {
    if (operationIdsRef.current.has(todoId)) return false;
    operationIdsRef.current.add(todoId);
    setBusyTodoIds((previous) => new Set(previous).add(todoId));
    try {
      await operation();
      return true;
    } catch (error) {
      showToast({ tone: 'error', message: error instanceof Error ? error.message : '操作失败，请稍后重试' });
      return false;
    } finally {
      operationIdsRef.current.delete(todoId);
      setBusyTodoIds((previous) => { const next = new Set(previous); next.delete(todoId); return next; });
    }
  };

  const saveBoard = (next: TopicTodoBoardLayout, todoId: string): Promise<boolean> => {
    const revision = ++localRevisionRef.current;
    setLocalLayout(next);
    pendingBoardCountRef.current += 1;
    pendingBoardTodoCountsRef.current.set(todoId, (pendingBoardTodoCountsRef.current.get(todoId) || 0) + 1);
    setBusyBoardCount(pendingBoardCountRef.current);
    setBusyTodoIds((previous) => new Set(previous).add(todoId));
    const operation = boardQueueRef.current.then(async () => { await actions.updateBoard(topic.id, next); });
    boardQueueRef.current = operation.catch(() => undefined);
    return operation.then(() => true).catch((error: unknown) => {
      showToast({ tone: 'error', message: error instanceof Error ? error.message : '保存看板失败，请稍后重试' });
      if (revision === localRevisionRef.current) setLocalLayout(null);
      return false;
    }).finally(() => {
      pendingBoardCountRef.current -= 1;
      setBusyBoardCount(pendingBoardCountRef.current);
      const pendingForTodo = pendingBoardTodoCountsRef.current.get(todoId) || 0;
      if (pendingForTodo <= 1) pendingBoardTodoCountsRef.current.delete(todoId);
      else pendingBoardTodoCountsRef.current.set(todoId, pendingForTodo - 1);
      setBusyTodoIds((previous) => {
        const nextIds = new Set(previous);
        if (!pendingBoardTodoCountsRef.current.has(todoId)) nextIds.delete(todoId);
        return nextIds;
      });
      if (pendingBoardCountRef.current === 0) {
        if (revision === localRevisionRef.current) setLocalLayout(null);
      }
    });
  };

  const moveTodo = (todoId: string, status: TopicTodoStatus) => {
    const next = moveTodoOnBoard(layout, todoId, status);
    if (JSON.stringify(next) !== JSON.stringify(layout)) {
      if (!isDesktop) setMobileStatus(status);
      void saveBoard(next, todoId);
    }
  };

  const handleDragStart = (event: DragStartEvent) => setActiveTodoId(String(event.active.id));
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTodoId(null);
    const next = layoutFromDragEvent(event, layout);
    if (next && JSON.stringify(next) !== JSON.stringify(layout)) void saveBoard(next, String(event.active.id));
  };

  const beginEdit = (todoId: string) => setEditingTodoId(todoId);
  const saveTitle = (todo: TopicTodo, title: string) => withTodoLock(todo.id, () => actions.updateTodo(todo.id, { title })).then((success) => {
    if (success) setEditingTodoId((current) => current === todo.id ? null : current);
    return success;
  });

  const createTodo = (title: string) => withTodoLock('__new_todo__', () => actions.createTodo(topic.id, { title }));
  const statusesToDisplay = isDesktop ? TODO_BOARD_COLUMNS.map((column) => column.status) : [mobileStatus];
  const showCard = (todoId: string, status: TopicTodoStatus, currentTodoId: string | null) => {
    const todo = todoById.get(todoId);
    if (!todo) return null;
    return (
      <SortableTodoCard
        key={todo.id}
        todo={todo}
        status={status}
        isCurrent={todo.id === currentTodoId}
        isEditing={editingTodoId === todo.id}
        isBusy={busyTodoIds.has(todo.id)}
        onEdit={() => beginEdit(todo.id)}
        onSave={(title) => saveTitle(todo, title)}
        onCancelEdit={() => setEditingTodoId(null)}
        onToggleComplete={() => void withTodoLock(todo.id, () => status === 'completed' ? actions.reopenTodo(todo.id) : actions.completeTodo(todo.id))}
        onMove={(nextStatus) => moveTodo(todo.id, nextStatus)}
        onDelete={() => setDeleteTarget(todo)}
      />
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5 px-4 py-5 sm:px-6 sm:py-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><KanbanSquare className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" /><h2 className="text-lg font-bold text-[var(--ink)]">执行看板</h2></div>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">按推进状态整理这个选题的行动；进行中第一项是当前行动，可同时推进多项工作。</p>
        </div>
        <span className="text-xs tabular-nums text-[var(--ink-muted)]">共 {todos.length} 项{busyBoardCount > 0 ? ' · 顺序保存中' : ''}</span>
      </header>

      {isLoading ? (
        <div className="rounded-2xl bg-[var(--surface)] p-8 text-center text-sm text-[var(--ink-muted)]">正在加载执行看板…</div>
      ) : (
        <>
          <BoardComposer onCreate={createTodo} />
          <div data-testid="todo-board-mobile-stage-tabs" className="flex min-h-9 items-center gap-1.5 overflow-x-auto rounded-[var(--radius-sm)] bg-[var(--canvas)] p-1 lg:hidden">
            {TODO_BOARD_COLUMNS.map((column) => (
              <button
                key={column.status}
                type="button"
                onClick={() => setMobileStatus(column.status)}
                aria-pressed={mobileStatus === column.status}
                className={`flex min-h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-xs font-medium transition-colors ${mobileStatus === column.status ? 'bg-[var(--accent)] text-white shadow-2xs' : 'text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]'}`}
              >
                <span>{column.label}</span><span className={`rounded-[var(--radius-sm)] px-1 text-[10px] tabular-nums ${mobileStatus === column.status ? 'bg-[var(--accent-dark)] text-white' : 'text-[var(--ink-muted)] opacity-75'}`}>{laneCounts[column.status]}</span>
              </button>
            ))}
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveTodoId(null)}
          >
            <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3 lg:gap-4" data-testid="todo-board-grid">
              {TODO_BOARD_COLUMNS.filter((column) => statusesToDisplay.includes(column.status)).map((column) => {
                const ids = layout[laneKey(column.status)];
                const currentId = column.status === 'in_progress' ? ids[0] || null : null;
                return (
                  <div key={column.status} className="min-w-0">
                    <TodoBoardColumn status={column.status} ids={ids}>
                      {ids.map((id) => showCard(id, column.status, currentId))}
                    </TodoBoardColumn>
                  </div>
                );
              })}
            </div>
            {typeof document !== 'undefined' && createPortal(
              <DragOverlay dropAnimation={null}>
                {activeTodo ? (
                  <div className="pointer-events-none rotate-[1deg] rounded-[var(--radius-md)] border border-[var(--accent)]/40 bg-[var(--surface)] px-4 py-3 shadow-modal">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]"><GripVertical className="h-4 w-4 text-stone-400" />{activeTodo.title}</div>
                    {activeTodoId === layout.in_progress_ids[0] && <span className="ml-6 mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--accent)]"><Zap className="h-3 w-3" />当前行动</span>}
                  </div>
                ) : null}
              </DragOverlay>,
              document.body,
            )}
          </DndContext>
        </>
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const success = await withTodoLock(deleteTarget.id, () => actions.deleteTodo(deleteTarget.id));
          if (success) setDeleteTarget(null);
        }}
        title="删除这条待办？"
        description={`“${deleteTarget?.title || ''}”将从执行看板中移除。删除当前行动后，进行中第一项会自动成为新的当前行动。`}
        confirmText="删除待办"
      />
    </div>
  );
};
