import type { TopicTodo, TopicTodoBoardLayout, TopicTodoMutationResult } from '../../types';

export interface TopicTodoActions {
  createTodo: (topicId: string, input: { title: string; status?: 'todo' | 'in_progress' }) => Promise<TopicTodoMutationResult>;
  updateTodo: (todoId: string, updates: Pick<Partial<TopicTodo>, 'title'>) => Promise<TopicTodoMutationResult>;
  setCurrentTodo: (todoId: string) => Promise<TopicTodoMutationResult>;
  completeTodo: (todoId: string) => Promise<TopicTodoMutationResult>;
  reopenTodo: (todoId: string) => Promise<TopicTodoMutationResult>;
  deleteTodo: (todoId: string) => Promise<TopicTodoMutationResult>;
  updateBoard: (topicId: string, layout: TopicTodoBoardLayout) => Promise<TopicTodoMutationResult>;
}
