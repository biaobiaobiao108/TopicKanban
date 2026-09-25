import { describe, expect, it } from 'bun:test';
import type { TopicTodo } from '../src/types';
import { findTodoStatus, getTodoBoardLayout, moveTodoOnBoard, reorderTodoInColumn } from '../src/components/topic-detail/todoBoardUtils';

function todo(id: string, status: TopicTodo['status'], sortOrder: number): TopicTodo {
  return {
    id,
    topic_id: 'topic-1',
    title: id,
    status,
    is_current: status === 'in_progress' && sortOrder === 1 ? 1 : 0,
    current_started_at: null,
    completed_at: status === 'completed' ? '2026-09-01T00:00:00.000Z' : null,
    sort_order: sortOrder,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  };
}

describe('topic Todo board layout helpers', () => {
  it('groups and orders all three board columns independently', () => {
    const layout = getTodoBoardLayout([
      todo('done-2', 'completed', 2), todo('doing-2', 'in_progress', 2),
      todo('todo-2', 'todo', 2), todo('doing-1', 'in_progress', 1),
      todo('todo-1', 'todo', 1), todo('done-1', 'completed', 1),
    ]);
    expect(layout).toEqual({
      todo_ids: ['todo-1', 'todo-2'],
      in_progress_ids: ['doing-1', 'doing-2'],
      completed_ids: ['done-1', 'done-2'],
    });
  });

  it('moves a Todo between columns and places it before the target card', () => {
    const layout = { todo_ids: ['a'], in_progress_ids: ['b', 'c'], completed_ids: ['d'] };
    const next = moveTodoOnBoard(layout, 'a', 'in_progress', 'c');
    expect(next).toEqual({ todo_ids: [], in_progress_ids: ['b', 'a', 'c'], completed_ids: ['d'] });
    expect(findTodoStatus(next, 'a')).toBe('in_progress');
  });

  it('reorders within a column without changing other columns', () => {
    const layout = { todo_ids: ['a', 'b'], in_progress_ids: ['c', 'd'], completed_ids: [] };
    expect(reorderTodoInColumn(layout, 'c', 'd')).toEqual({
      todo_ids: ['a', 'b'], in_progress_ids: ['d', 'c'], completed_ids: [],
    });
  });
});
