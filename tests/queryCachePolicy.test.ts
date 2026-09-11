import { describe, expect, it } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { configureQueryCache, QUERY_GC_TIMES } from '../src/lib/queryCachePolicy';

describe('查询缓存生命周期策略', () => {
  it('为稳定、列表、详情和搜索查询设置有界回收时间', () => {
    const queryClient = new QueryClient();
    configureQueryCache(queryClient);

    expect(queryClient.getQueryDefaults(['settings']).gcTime).toBe(QUERY_GC_TIMES.stable);
    expect(queryClient.getQueryDefaults(['topics-page', 'active']).gcTime).toBe(QUERY_GC_TIMES.list);
    expect(queryClient.getQueryDefaults(['topic-draft', 'topic-1']).gcTime).toBe(QUERY_GC_TIMES.detail);
    expect(queryClient.getQueryDefaults(['command-topic-search', '标题']).gcTime).toBe(QUERY_GC_TIMES.search);
  });

  it('默认策略不会回到 TanStack Query 的五分钟缓存窗口', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: QUERY_GC_TIMES.default } },
    });

    expect(queryClient.getDefaultOptions().queries?.gcTime).toBe(QUERY_GC_TIMES.default);
    expect(queryClient.getDefaultOptions().queries?.gcTime).toBeLessThan(5 * 60 * 1000);
  });
});
