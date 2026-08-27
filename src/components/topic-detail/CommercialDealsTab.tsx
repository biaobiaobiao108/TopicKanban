import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Handshake, Link2Off, Loader2, Star } from 'lucide-react';
import type { CommercialDeal, Topic } from '../../types';
import {
  fetchCommercialDeal,
  fetchCommercialDealsByTopicId,
  replaceCommercialDealTopics,
} from '../../lib/storage';

const STATUS_LABELS: Record<CommercialDeal['status'], string> = {
  communicating: '沟通中', producing: '制作中', delivered: '已交付', archived: '归档',
};

const PAYMENT_LABELS = { unpaid: '未回款', paid: '已回款' } as const;

interface CommercialDealsTabProps {
  topic: Topic;
  onOpenDeal: (dealId: string) => void;
  onCreateTopicFromDeal?: (data: { title: string; summary: string }) => Promise<Topic>;
}

function formatDate(value?: string | null): string {
  if (!value) return '未设截止日期';
  return new Date(`${value}T00:00:00+08:00`).toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' });
}

export const CommercialDealsTab: React.FC<CommercialDealsTabProps> = ({ topic, onOpenDeal, onCreateTopicFromDeal }) => {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dealsQuery = useQuery({
    queryKey: ['topic-deals', topic.id],
    queryFn: () => fetchCommercialDealsByTopicId(topic.id),
  });
  const deals = dealsQuery.data || [];
  const activeDeals = useMemo(() => deals, [deals]);

  const changeRelation = async (dealId: string, mode: 'unlink' | 'primary') => {
    setBusyId(dealId);
    setError(null);
    try {
      const deal = await fetchCommercialDeal(dealId);
      const remaining = deal.topics.filter((relation) => relation.topic_id !== topic.id);
      const currentPrimary = deal.topics.find((relation) => relation.relation_role === 'primary');
      const primaryTopicId = mode === 'primary'
        ? topic.id
        : currentPrimary?.topic_id === topic.id ? null : currentPrimary?.topic_id || null;
      const relatedTopicIds = mode === 'primary'
        ? remaining.map((relation) => relation.topic_id)
        : remaining.filter((relation) => relation.topic_id !== primaryTopicId).map((relation) => relation.topic_id);
      await replaceCommercialDealTopics(dealId, primaryTopicId, relatedTopicIds);
      await queryClient.invalidateQueries({ queryKey: ['topic-deals', topic.id] });
      await queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
      await queryClient.invalidateQueries({ queryKey: ['workspace'] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '更新商单关联失败');
    } finally {
      setBusyId(null);
    }
  };

  const createTopicFromDeal = async (deal: CommercialDeal) => {
    if (!onCreateTopicFromDeal) return;
    setBusyId(deal.id);
    setError(null);
    try {
      const created = await onCreateTopicFromDeal({
        title: `${deal.brand_name ? `${deal.brand_name}｜` : ''}${deal.title}`,
        summary: deal.brief || deal.requirements || `商单「${deal.title}」的选题草稿`,
      });
      const detail = await fetchCommercialDeal(deal.id);
      await replaceCommercialDealTopics(deal.id, detail.primary_topic_id || created.id, detail.topics.filter((relation) => relation.topic_id !== detail.primary_topic_id).map((relation) => relation.topic_id).concat(detail.primary_topic_id && detail.primary_topic_id !== created.id ? [detail.primary_topic_id] : []));
      await queryClient.invalidateQueries({ queryKey: ['topic-deals', topic.id] });
      onOpenDeal(deal.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '从商单创建选题失败');
    } finally {
      setBusyId(null);
    }
  };

  if (dealsQuery.isLoading) {
    return <div className="py-16 text-center text-sm text-stone-500">正在加载关联商单...</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Handshake className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">关联商单</h3>
            <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-bold text-rose-700 dark:text-rose-300">{deals.length}</span>
          </div>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">选题与商务履约保持独立；你可以显式切换主选题或解除关联。</p>
        </div>
      </div>

      {error && <div role="alert" aria-live="polite" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">{error}</div>}

      {activeDeals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">这个选题暂未关联商单。</div>
      ) : (
        <div className="grid gap-3">
          {activeDeals.map((deal) => {
            const isBusy = busyId === deal.id;
            return (
              <article key={deal.id} className="rounded-2xl border border-stone-200/70 bg-white p-4 shadow-2xs dark:border-stone-800 dark:bg-stone-900 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <button type="button" onClick={() => onOpenDeal(deal.id)} className="min-w-0 text-left">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-stone-500 dark:text-stone-400">
                      <span>{deal.brand_name || '未命名品牌'}</span>
                      <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-rose-700 dark:text-rose-300">{STATUS_LABELS[deal.status]}</span>
                      <span className={`rounded-full px-2 py-0.5 ${deal.payment_status === 'paid' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>{PAYMENT_LABELS[deal.payment_status]}</span>
                    </div>
                    <h4 className="mt-2 text-base font-bold text-stone-900 transition-colors hover:text-rose-600 dark:text-stone-100 dark:hover:text-rose-400">{deal.title}</h4>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                      <span>{deal.relation_role === 'primary' ? '主选题' : '系列关联'}</span>
                      <span>交付截止：{formatDate(deal.delivery_due_date)}</span>
                      {deal.next_action && <span className="max-w-full truncate">下一步：{deal.next_action}</span>}
                    </div>
                  </button>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <button type="button" disabled={isBusy || deal.relation_role === 'primary'} onClick={() => void changeRelation(deal.id, 'primary')} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-stone-200 px-3 text-xs font-semibold text-stone-700 transition-colors hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:border-rose-800 dark:hover:text-rose-300"><Star className="h-3.5 w-3.5" />设为主选题</button>
                    <button type="button" disabled={isBusy} onClick={() => void changeRelation(deal.id, 'unlink')} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-stone-200 px-3 text-xs font-semibold text-stone-700 transition-colors hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:border-red-800 dark:hover:text-red-300"><Link2Off className="h-3.5 w-3.5" />解除关联</button>
                    <button type="button" onClick={() => onOpenDeal(deal.id)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white transition-colors hover:bg-rose-700"><span>打开商单</span><ArrowRight className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                {onCreateTopicFromDeal && !deal.primary_topic_id && (
                  <button type="button" disabled={isBusy} onClick={() => void createTopicFromDeal(deal)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-rose-300 px-3 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30">
                    {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Handshake className="h-3.5 w-3.5" />}
                    从商单简介创建选题
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
