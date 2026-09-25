import { useCallback, useMemo } from 'react';
import type { TopicTodoMutationResult } from '../types';
import {
  completeTopicTodo,
  deleteTopicTodo,
  reopenTopicTodo,
  saveTopicTodo,
  setTopicTodoCurrent,
  updateTopicTodo,
  updateTopicTodoBoard,
} from '../lib/storage';
import type { TopicTodoActions } from '../components/topic-detail/todoTypes';

export function useTopicTodoActions(
  onMutation: (result: TopicTodoMutationResult) => void,
): TopicTodoActions {
  const createTodo = useCallback(async (topicId: string, input: { title: string; status?: 'todo' | 'in_progress' }) => {
    const result = await saveTopicTodo({ topic_id: topicId, ...input });
    onMutation(result);
    return result;
  }, [onMutation]);
  const updateTodo = useCallback(async (todoId: string, updates: Parameters<typeof updateTopicTodo>[1]) => {
    const result = await updateTopicTodo(todoId, updates);
    onMutation(result);
    return result;
  }, [onMutation]);
  const setCurrentTodo = useCallback(async (todoId: string) => {
    const result = await setTopicTodoCurrent(todoId);
    onMutation(result);
    return result;
  }, [onMutation]);
  const completeTodo = useCallback(async (todoId: string) => {
    const result = await completeTopicTodo(todoId);
    onMutation(result);
    return result;
  }, [onMutation]);
  const reopenTodo = useCallback(async (todoId: string) => {
    const result = await reopenTopicTodo(todoId);
    onMutation(result);
    return result;
  }, [onMutation]);
  const deleteTodo = useCallback(async (todoId: string) => {
    const result = await deleteTopicTodo(todoId);
    onMutation(result);
    return result;
  }, [onMutation]);
  const updateBoard = useCallback(async (topicId: string, layout: Parameters<typeof updateTopicTodoBoard>[1]) => {
    const result = await updateTopicTodoBoard(topicId, layout);
    onMutation(result);
    return result;
  }, [onMutation]);

  return useMemo(() => ({
    createTodo,
    updateTodo,
    setCurrentTodo,
    completeTodo,
    reopenTodo,
    deleteTodo,
    updateBoard,
  }), [completeTodo, createTodo, deleteTodo, reopenTodo, setCurrentTodo, updateBoard, updateTodo]);
}
