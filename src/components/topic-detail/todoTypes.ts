import type { TopicTodo, TopicTodoMutationResult } from '../../types';

export interface TopicTodoActions {
  createTodo: (topicId: string, input: { title: string }) => Promise<TopicTodoMutationResult>;
  updateTodo: (todoId: string, updates: Pick<Partial<TopicTodo>, 'title'>) => Promise<TopicTodoMutationResult>;
  setCurrentTodo: (todoId: string) => Promise<TopicTodoMutationResult>;
  completeTodo: (todoId: string) => Promise<TopicTodoMutationResult>;
  reopenTodo: (todoId: string) => Promise<TopicTodoMutationResult>;
  deleteTodo: (todoId: string) => Promise<TopicTodoMutationResult>;
  reorderTodos: (topicId: string, ids: string[]) => Promise<TopicTodoMutationResult>;
}
