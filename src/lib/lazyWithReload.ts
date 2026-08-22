import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RELOAD_ATTEMPT_KEY = 'topic_kanban_lazy_reload_attempted_v1';

export function lazyWithReload<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const module = await loader();
      sessionStorage.removeItem(RELOAD_ATTEMPT_KEY);
      return module;
    } catch (error) {
      try {
        if (!sessionStorage.getItem(RELOAD_ATTEMPT_KEY)) {
          sessionStorage.setItem(RELOAD_ATTEMPT_KEY, '1');
          window.location.reload();
          return await new Promise<never>(() => {});
        }
        sessionStorage.removeItem(RELOAD_ATTEMPT_KEY);
      } catch {
        // Storage may be disabled; the error boundary below will keep the app recoverable.
      }
      throw error;
    }
  });
}
