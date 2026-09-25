import type { TopicTodo, TopicTodoBoardLayout, TopicTodoStatus } from '../../types';

export const TODO_BOARD_COLUMNS: Array<{ status: TopicTodoStatus; label: string; hint: string }> = [
  { status: 'todo', label: '待办', hint: '尚未开始' },
  { status: 'in_progress', label: '进行中', hint: '第一项是当前行动' },
  { status: 'completed', label: '已完成', hint: '已完成的工作' },
];

export function getTodoBoardLayout(todos: TopicTodo[]): TopicTodoBoardLayout {
  const idsFor = (status: TopicTodoStatus) => todos
    .filter((todo) => todo.status === status)
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map((todo) => todo.id);
  return {
    todo_ids: idsFor('todo'),
    in_progress_ids: idsFor('in_progress'),
    completed_ids: idsFor('completed'),
  };
}

export function findTodoStatus(layout: TopicTodoBoardLayout, todoId: string): TopicTodoStatus | null {
  if (layout.todo_ids.includes(todoId)) return 'todo';
  if (layout.in_progress_ids.includes(todoId)) return 'in_progress';
  if (layout.completed_ids.includes(todoId)) return 'completed';
  return null;
}

export function moveTodoOnBoard(
  layout: TopicTodoBoardLayout,
  todoId: string,
  targetStatus: TopicTodoStatus,
  beforeTodoId?: string,
): TopicTodoBoardLayout {
  const next: TopicTodoBoardLayout = {
    todo_ids: [...layout.todo_ids],
    in_progress_ids: [...layout.in_progress_ids],
    completed_ids: [...layout.completed_ids],
  };
  const sourceStatus = findTodoStatus(next, todoId);
  if (!sourceStatus) return next;

  const source = next[`${sourceStatus}_ids` as 'todo_ids' | 'in_progress_ids' | 'completed_ids'];
  const sourceIndex = source.indexOf(todoId);
  source.splice(sourceIndex, 1);

  const target = next[`${targetStatus}_ids` as 'todo_ids' | 'in_progress_ids' | 'completed_ids'];
  const targetIndex = beforeTodoId ? target.indexOf(beforeTodoId) : -1;
  target.splice(targetIndex < 0 ? target.length : targetIndex, 0, todoId);
  return next;
}

export function reorderTodoInColumn(
  layout: TopicTodoBoardLayout,
  todoId: string,
  overTodoId: string,
): TopicTodoBoardLayout {
  const status = findTodoStatus(layout, todoId);
  if (!status || findTodoStatus(layout, overTodoId) !== status || todoId === overTodoId) return layout;
  const key = `${status}_ids` as 'todo_ids' | 'in_progress_ids' | 'completed_ids';
  const items = [...layout[key]];
  const from = items.indexOf(todoId);
  const to = items.indexOf(overTodoId);
  if (from < 0 || to < 0) return layout;
  items.splice(to, 0, items.splice(from, 1)[0]);
  return { ...layout, [key]: items };
}
