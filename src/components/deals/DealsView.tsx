import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  FileText,
  Handshake,
  Link2,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Target,
  Trash2,
  WalletCards,
} from 'lucide-react';
import type { CommercialDeal, CommercialDealDetail, CommercialDealStatus, CommercialDealTopic, Topic } from '../../types';
import {
  addCommercialDealActivity,
  deleteCommercialDeal,
  fetchCommercialDeal,
  fetchCommercialDealPage,
  fetchPublishedVideos,
  linkPublishedVideoToCommercialDeal,
  replaceCommercialDealTopics,
  saveCommercialDeal,
} from '../../lib/storage';
import { extractBvid } from '../../lib/bilibili';
import { sanitizeExternalHttpUrl } from '../../lib/urlSafety';
import { removeCommercialDealCaches, updateCommercialDealCaches } from '../../lib/queryCacheSync';
import { Modal } from '../ui/Modal';
import { DateInput } from '../ui/DateInput';
import { CustomSelect, type SelectOption, type SelectRenderState } from '../ui/CustomSelect';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { PageHeader } from '../layout/PageHeader';
import { BackNavigationBar } from '../layout/BackNavigationBar';
import { ActionDate, ActionDateText } from '../ui/ActionDate';
import { useActionDateDisplay } from '../../lib/actionDate';

const ACTIVE_STATUSES: CommercialDealStatus[] = ['communicating', 'producing'];
const STATUS_FLOW: CommercialDealStatus[] = ['communicating', 'producing', 'delivered', 'archived'];

const STATUS_LABELS: Record<CommercialDealStatus, string> = {
  communicating: '沟通中',
  producing: '制作中',
  delivered: '已交付',
  archived: '归档',
};

const STATUS_DOTS: Record<CommercialDealStatus, string> = {
  communicating: 'bg-blue-500',
  producing: 'bg-indigo-500',
  delivered: 'bg-teal-500',
  archived: 'bg-stone-400',
};

const STATUS_CLASSES: Record<CommercialDealStatus, string> = {
  communicating: 'bg-blue-500/10 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  producing: 'bg-indigo-500/10 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300',
  delivered: 'bg-teal-500/10 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
  archived: 'bg-stone-500/10 text-stone-600 dark:bg-stone-800/70 dark:text-stone-300',
};

const DELIVERABLE_LABELS: Record<CommercialDeal['deliverable_type'], string> = {
  custom_video: '定制视频',
  dynamic: '动态推广',
  live: '直播合作',
  offline_activity: '线下活动',
  other: '其他交付',
};

const SOURCE_LABELS: Record<CommercialDeal['source'], string> = {
  huahuo: '花火',
  brand_direct: '品牌直联',
  agency: '代理商',
  mcn: 'MCN / 服务商',
  other: '其他来源',
};

const CONTRACT_LABELS: Record<CommercialDeal['contract_status'], string> = {
  not_started: '未开始',
  drafting: '沟通/拟定中',
  signed: '已签署',
};

const ALL_STATUS_OPTIONS: SelectOption[] = [
  { value: '', label: '全部阶段' },
  ...STATUS_FLOW.map((value) => ({
    value,
    label: STATUS_LABELS[value],
    dot: STATUS_DOTS[value],
  })),
];
const STATUS_OPTIONS: SelectOption[] = STATUS_FLOW.map((value) => ({
  value,
  label: STATUS_LABELS[value],
  dot: STATUS_DOTS[value],
}));
const PAYMENT_OPTIONS: SelectOption[] = [
  { value: 'unpaid', label: '待回款' },
  { value: 'paid', label: '已回款' },
];
const SOURCE_OPTIONS: SelectOption[] = Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }));
const DELIVERABLE_OPTIONS: SelectOption[] = Object.entries(DELIVERABLE_LABELS).map(([value, label]) => ({ value, label }));
const CONTRACT_OPTIONS: SelectOption[] = Object.entries(CONTRACT_LABELS).map(([value, label]) => ({ value, label }));
const PAGE_SIZE_OPTIONS: SelectOption[] = [12, 24, 48].map((value) => ({
  value: String(value),
  label: `每页 ${value} 张`,
}));
const PAGE_SIZE_STORAGE_KEY = 'commercial-deals-page-size';

function getSafePublishedVideoUrl(video: NonNullable<CommercialDealDetail['published_video']>): string {
  const safeUrl = sanitizeExternalHttpUrl(video.url);
  if (safeUrl) return safeUrl;
  const bvid = extractBvid(video.bvid);
  return bvid ? `https://www.bilibili.com/video/${bvid}` : '';
}

const formatMoney = (cents: number) => (cents > 0 ? `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` : '未报价');

const fieldClass =
  'mt-1.5 w-full rounded-xl border border-stone-200/80 bg-stone-500/[0.03] px-3 py-2.5 text-sm text-stone-900 outline-none transition-colors placeholder:text-stone-400 focus:border-rose-500 focus:bg-white dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:bg-stone-800';
const textareaClass = `${fieldClass} min-h-24 resize-y leading-relaxed`;

interface DealsViewProps {
  dealId?: string | null;
  topics: Topic[];
  onBack?: () => void;
  backLabel?: string;
  onCreateTopicFromDeal?: (data: { title: string; summary: string }) => Promise<Topic>;
}

interface DealFormState {
  title: string;
  brand_name: string;
  agency_name: string;
  contact_name: string;
  contact_channel: string;
  source: CommercialDeal['source'];
  deliverable_type: CommercialDeal['deliverable_type'];
  status: CommercialDealStatus;
  contract_status: CommercialDeal['contract_status'];
  contract_summary: string;
  brief: string;
  requirements: string;
  restrictions: string;
  amount_yuan: string;
  payment_status: CommercialDeal['payment_status'];
  paid_at: string;
  delivery_due_date: string;
  publish_date: string;
  next_action: string;
  next_action_due_date: string;
}

function createDealFormState(deal?: CommercialDeal | null): DealFormState {
  return {
    title: deal?.title || '',
    brand_name: deal?.brand_name || '',
    agency_name: deal?.agency_name || '',
    contact_name: deal?.contact_name || '',
    contact_channel: deal?.contact_channel || '',
    source: deal?.source || 'other',
    deliverable_type: deal?.deliverable_type || 'custom_video',
    status: deal?.status || 'communicating',
    contract_status: deal?.contract_status || 'not_started',
    contract_summary: deal?.contract_summary || '',
    brief: deal?.brief || '',
    requirements: deal?.requirements || '',
    restrictions: deal?.restrictions || '',
    amount_yuan: deal && deal.amount_cents > 0 ? (deal.amount_cents / 100).toFixed(2) : '',
    payment_status: deal?.payment_status || 'unpaid',
    paid_at: deal?.paid_at || '',
    delivery_due_date: deal?.delivery_due_date || '',
    publish_date: deal?.publish_date || '',
    next_action: deal?.next_action || '',
    next_action_due_date: deal?.next_action_due_date || '',
  };
}

function readPageSize(): number {
  if (typeof window === 'undefined') return 24;
  try {
    const value = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
    return [12, 24, 48].includes(value) ? value : 24;
  } catch {
    return 24;
  }
}

function StatusPill({ status }: { status: CommercialDealStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASSES[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOTS[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

interface SelectFieldProps {
  name: string;
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}

function SelectField({ name, label, value, options, onChange }: SelectFieldProps) {
  return (
    <div className="min-w-0 text-xs font-semibold text-stone-600 dark:text-stone-300">
      <span className="block">{label}</span>
      <input type="hidden" name={name} value={value} />
      <CustomSelect
        value={value}
        onChange={onChange}
        options={options}
        ariaLabel={label}
        size="md"
        buttonClassName="mt-1.5 min-h-11 w-full"
      />
    </div>
  );
}

function DealFormModal({
  isOpen,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (deal: CommercialDealDetail) => void;
}) {
  const [form, setForm] = useState<DealFormState>(() => createDealFormState());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (isOpen) {
      setForm(createDealFormState());
      setError('');
    }
  }, [isOpen]);
  const setField = <K extends keyof DealFormState>(key: K, value: DealFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
  };
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim()) {
      setError('请填写商单名称');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await saveCommercialDeal({
        title: form.title.trim(),
        brand_name: form.brand_name.trim(),
        agency_name: form.agency_name.trim(),
        contact_name: form.contact_name.trim(),
        contact_channel: form.contact_channel.trim(),
        source: form.source,
        deliverable_type: form.deliverable_type,
      });
      onSaved(saved);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存商单失败');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="记录新商单" maxWidth="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        <fieldset className="space-y-4">
          <legend className="text-sm font-bold text-stone-900 dark:text-stone-100">先记下合作线索</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2 text-xs font-semibold text-stone-600 dark:text-stone-300">
              商单名称 <span className="text-rose-600">*</span>
              <input
                name="title"
                required
                maxLength={200}
                value={form.title}
                onChange={(event) => setField('title', event.target.value)}
                className={fieldClass}
                placeholder="例如：某品牌夏季定制视频"
              />
            </label>
            <label className="text-xs font-semibold text-stone-600 dark:text-stone-300">
              品牌名称
              <input
                name="brand_name"
                maxLength={200}
                value={form.brand_name}
                onChange={(event) => setField('brand_name', event.target.value)}
                className={fieldClass}
                placeholder="品牌方"
              />
            </label>
            <label className="text-xs font-semibold text-stone-600 dark:text-stone-300">
              代理商 / 服务商
              <input
                name="agency_name"
                maxLength={200}
                value={form.agency_name}
                onChange={(event) => setField('agency_name', event.target.value)}
                className={fieldClass}
                placeholder="没有可留空"
              />
            </label>
            <label className="text-xs font-semibold text-stone-600 dark:text-stone-300">
              对接人
              <input
                name="contact_name"
                maxLength={200}
                value={form.contact_name}
                onChange={(event) => setField('contact_name', event.target.value)}
                className={fieldClass}
                placeholder="姓名 / 花火账号"
              />
            </label>
            <label className="text-xs font-semibold text-stone-600 dark:text-stone-300">
              联系方式
              <input
                name="contact_channel"
                maxLength={2000}
                value={form.contact_channel}
                onChange={(event) => setField('contact_channel', event.target.value)}
                className={fieldClass}
                placeholder="微信、邮箱或其他备注"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              name="source"
              label="商单来源"
              value={form.source}
              options={SOURCE_OPTIONS}
              onChange={(value) => setField('source', value as CommercialDeal['source'])}
            />
            <SelectField
              name="deliverable_type"
              label="交付类型"
              value={form.deliverable_type}
              options={DELIVERABLE_OPTIONS}
              onChange={(value) => setField('deliverable_type', value as CommercialDeal['deliverable_type'])}
            />
          </div>
        </fieldset>
        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
          >
            {error}
          </div>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 rounded-xl bg-rose-600 px-5 py-2 text-sm font-bold text-white shadow-2xs transition-colors hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60"
          >
            {saving ? '保存中…' : '记录商单'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DealCard({ deal, onOpen }: { deal: CommercialDeal; onOpen: (id: string) => void }) {
  const deliveryDate = useActionDateDisplay(deal.delivery_due_date, !['delivered', 'archived'].includes(deal.status));
  const overdue = deliveryDate.state === 'overdue';
  const needsTopic = deal.status === 'producing' && !deal.primary_topic_id;
  return (
    <button
      type="button"
      data-testid="deal-card"
      onClick={() => onOpen(deal.id)}
      className="group w-full min-w-0 rounded-2xl border border-stone-200/70 bg-white p-4 text-left shadow-2xs transition-all hover:-translate-y-0.5 hover:shadow-card dark:border-stone-800 dark:bg-stone-900"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
            <StatusPill status={deal.status} />
            {deal.payment_status === 'paid' ? (
                <span className="shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                已回款
              </span>
            ) : (
                <span className="shrink-0 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                待回款
              </span>
            )}
          </div>
          <p className="truncate text-xs font-semibold text-rose-600 dark:text-rose-400">{deal.brand_name || '未填写品牌'}</p>
          <p className="mt-1 line-clamp-2 break-words text-sm font-bold leading-relaxed text-stone-900 group-hover:text-rose-600 dark:text-stone-100 dark:group-hover:text-rose-400">
            {deal.title}
          </p>
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-stone-300 transition-transform group-hover:translate-x-0.5 group-hover:text-rose-500 dark:text-stone-600" />
      </div>
      <div className="mt-4 min-w-0 space-y-2 border-t border-stone-100 pt-3 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span>{DELIVERABLE_LABELS[deal.deliverable_type]}</span>
          <span className="shrink-0 font-mono font-semibold text-stone-800 dark:text-stone-200">{formatMoney(deal.amount_cents)}</span>
        </div>
        <div className={`flex items-center gap-1.5 ${overdue ? 'font-bold text-red-600 dark:text-red-400' : ''}`}>
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          {deliveryDate.state === 'empty' ? '尚未设置交付日' : (
            <>
              {!overdue && '交付 · '}
              <ActionDateText display={deliveryDate} />
            </>
          )}
        </div>
        {deal.primary_topic_title ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <Target className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">{deal.primary_topic_title}</span>
          </div>
        ) : needsTopic ? (
          <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300">
            <Target className="h-3.5 w-3.5 shrink-0" />
            制作前需要绑定主选题
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-stone-400">
            <Target className="h-3.5 w-3.5 shrink-0" />
            暂未绑定选题
          </div>
        )}
        <div
          className={`min-w-0 break-words ${deal.next_action ? 'text-stone-600 dark:text-stone-300' : 'font-semibold text-amber-700 dark:text-amber-300'}`}
        >
          <span className="font-semibold text-rose-600 dark:text-rose-400">下一步：</span>
          {deal.next_action || '尚未设置'}
        </div>
      </div>
    </button>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
  tone = 'stone',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: 'stone' | 'rose' | 'amber' | 'emerald';
}) {
  const tones = {
    stone: 'bg-stone-500/5 text-stone-700 dark:bg-stone-800/80 dark:text-stone-200',
    rose: 'bg-rose-500/10 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    amber: 'bg-amber-500/10 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    emerald: 'bg-emerald-500/10 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  };
  return (
    <div className="rounded-2xl border border-stone-200/70 bg-white p-4 shadow-2xs dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-center justify-between gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}>{icon}</span>
        <span className="text-xs font-medium text-stone-600 dark:text-stone-400">{detail}</span>
      </div>
      <p className="mt-3 text-xs font-semibold text-stone-500 dark:text-stone-400">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">{value}</p>
    </div>
  );
}

function CommercialDealsView({ topics, onCreateTopicFromDeal }: Pick<DealsViewProps, 'topics' | 'onCreateTopicFromDeal'>) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readPageSize);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const scope = showActiveOnly ? 'active' : 'all';
  const dealsQuery = useQuery({
    queryKey: ['commercial-deal-page', { query, status, paymentStatus, scope, page, pageSize }],
    queryFn: () =>
      fetchCommercialDealPage({
        scope,
        page,
        page_size: pageSize,
        q: query,
        status,
        payment_status: paymentStatus as 'unpaid' | 'paid' | undefined,
      }),
    placeholderData: (previous) => previous,
  });
  const pageData = dealsQuery.data;
  const deals = pageData?.items || [];
  const total = pageData?.total || 0;
  const totalPages = Math.max(1, pageData?.total_pages || 1);

  useEffect(() => {
    try {
      window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(pageSize));
    } catch {
      /* Restricted storage should not block the list. */
    }
  }, [pageSize]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleSaved = (deal: CommercialDealDetail) => {
    updateCommercialDealCaches(queryClient, deal);
    void queryClient.invalidateQueries({ queryKey: ['commercial-deal-page'] });
    void queryClient.invalidateQueries({ queryKey: ['deal-focus'] });
    void queryClient.invalidateQueries({ queryKey: ['commercial-deals-calendar'] });
    void queryClient.invalidateQueries({ queryKey: ['topic-deals'] });
    void queryClient.invalidateQueries({ queryKey: ['workspace'] });
    queryClient.setQueryData(['commercial-deal', deal.id], deal);
  };
  const handleStatusFilter = (value: string) => {
    setStatus(value);
    if (value === 'delivered' || value === 'archived') setShowActiveOnly(false);
    setPage(1);
  };
  const handleScopeToggle = () => {
    setShowActiveOnly((value) => !value);
    setStatus('');
    setPage(1);
  };
  const handlePageSize = (value: string) => {
    const next = Number(value);
    if (![12, 24, 48].includes(next)) return;
    setPageSize(next);
    setPage(1);
  };
  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain mobile-bottom-nav-content md:pb-8">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-5 sm:px-8 sm:py-8">
        <PageHeader
          title="商单中心"
          icon={Handshake}
          badge={
            <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
              商务 × 内容生产
            </span>
          }
          actions={
            <button
              type="button"
              onClick={() => setIsFormOpen(true)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white shadow-2xs transition-colors hover:bg-rose-700 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              记录新商单
            </button>
          }
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard
            icon={<ClipboardList className="h-4 w-4" />}
            label="进行中的商单"
            value={String(pageData?.summary.active_count || 0)}
            detail="沟通中 / 制作中"
          />
          <SummaryCard
            icon={<CalendarClock className="h-4 w-4" />}
            label="7 天内要交付"
            value={String(pageData?.summary.due_soon_count || 0)}
            detail="含已逾期"
            tone="amber"
          />
          <SummaryCard
            icon={<MessageSquare className="h-4 w-4" />}
            label="待补下一步"
            value={String(pageData?.summary.needs_action_count || 0)}
            detail="需要明确动作"
            tone="rose"
          />
          <SummaryCard
            icon={<WalletCards className="h-4 w-4" />}
            label="未回款金额"
            value={pageData?.summary.unpaid_amount_cents ? formatMoney(pageData.summary.unpaid_amount_cents) : '¥0.00'}
            detail={`${pageData?.summary.unpaid_count || 0} 单未结`}
            tone="emerald"
          />
        </div>
        <div className="rounded-2xl border border-stone-200/70 bg-white p-3 shadow-2xs dark:border-stone-800 dark:bg-stone-900 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="min-w-0 flex-1 text-xs font-semibold text-stone-500 dark:text-stone-400">
              <span className="sr-only">搜索商单</span>
              <input
                name="deal_search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                className="min-h-11 w-full rounded-xl border border-stone-200/80 bg-stone-500/[0.03] px-3 text-sm font-medium text-stone-900 outline-none placeholder:text-stone-400 focus:border-rose-500 focus:bg-white dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:bg-stone-800"
                placeholder="搜索商单、品牌、对接人或关联选题"
              />
            </label>
            <CustomSelect
              value={status}
              onChange={handleStatusFilter}
              options={ALL_STATUS_OPTIONS}
              ariaLabel="按商单阶段筛选"
              size="md"
              buttonClassName="min-h-11 w-full lg:w-40"
            />
            <CustomSelect
              value={paymentStatus}
              onChange={(value) => {
                setPaymentStatus(value);
                setPage(1);
              }}
              options={[{ value: '', label: '全部回款状态' }, ...PAYMENT_OPTIONS]}
              ariaLabel="按回款状态筛选"
              size="md"
              buttonClassName="min-h-11 w-full lg:w-40"
            />
            <button
              type="button"
              aria-pressed={showActiveOnly}
              onClick={handleScopeToggle}
              className={`min-h-11 rounded-xl px-3 text-sm font-semibold transition-colors ${showActiveOnly ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'border border-stone-200/80 bg-stone-500/[0.03] text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'}`}
            >
              显示进行中
            </button>
          </div>
        </div>
        {dealsQuery.isLoading ? (
          <div className="grid place-items-center rounded-2xl border border-stone-200/70 bg-white py-20 text-sm text-stone-500 dark:border-stone-800 dark:bg-stone-900">
            正在加载商单…
          </div>
        ) : dealsQuery.error ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
          >
            商单加载失败：
            {dealsQuery.error instanceof Error ? dealsQuery.error.message : '未知错误'}
          </div>
        ) : deals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-20 text-center dark:border-stone-700 dark:bg-stone-900">
            <CircleDollarSign className="mx-auto h-8 w-8 text-stone-300 dark:text-stone-600" />
            <p className="mt-3 text-sm font-semibold text-stone-600 dark:text-stone-300">还没有符合条件的商单</p>
            <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">收到品牌需求时，先把它记下来，别让商务线索飘走。</p>
            <button
              type="button"
              onClick={() => setIsFormOpen(true)}
              className="mt-5 min-h-11 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700"
            >
              记录第一单
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 text-xs text-stone-500 dark:text-stone-400">
              <span aria-live="polite">
                显示 {firstItem}-{lastItem} / 共 {total} 单
              </span>
              {dealsQuery.isFetching && <span>更新中…</span>}
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {deals.map((deal) => (
                <DealCard key={deal.id} deal={deal} onOpen={(id) => navigate(`/deals/${encodeURIComponent(id)}`)} />
              ))}
            </div>
            <div className="flex flex-col gap-3 rounded-2xl border border-stone-200/70 bg-white p-3 shadow-2xs dark:border-stone-800 dark:bg-stone-900 sm:flex-row sm:items-center sm:justify-between sm:p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-stone-500 dark:text-stone-400">
                <span>每页展示</span>
                <CustomSelect
                  value={String(pageSize)}
                  onChange={handlePageSize}
                  options={PAGE_SIZE_OPTIONS}
                  ariaLabel="每页商单数量"
                  size="sm"
                  buttonClassName="min-h-10 min-w-28"
                />
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <button
                  type="button"
                  aria-label="上一页"
                  disabled={page <= 1 || dealsQuery.isFetching}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-bold text-stone-700 transition-colors hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:border-rose-800 dark:hover:text-rose-300"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  上一页
                </button>
                <span className="min-w-16 text-center font-mono text-xs text-stone-500 dark:text-stone-400">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  aria-label="下一页"
                  disabled={page >= totalPages || dealsQuery.isFetching}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-bold text-stone-700 transition-colors hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:border-rose-800 dark:hover:text-rose-300"
                >
                  下一页
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      <DealFormModal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} onSaved={handleSaved} />
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-stone-200/70 bg-white p-5 shadow-2xs dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-bold text-stone-900 dark:text-stone-100">
          {icon}
          <span>{title}</span>
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function EditorActions({ saving, onCancel }: { saving: boolean; onCancel: () => void }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="min-h-10 rounded-xl px-3 text-xs font-semibold text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800"
      >
        取消
      </button>
      <button
        type="submit"
        disabled={saving}
        className="min-h-10 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60"
      >
        {saving ? '保存中…' : '保存修改'}
      </button>
    </div>
  );
}

function EditSectionButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-stone-500 hover:bg-stone-100 hover:text-rose-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-rose-300"
    >
      <Pencil className="h-3.5 w-3.5" />
      编辑
    </button>
  );
}

function LinkedTopicRow({
  relation,
  onOpen,
  onMakePrimary,
  onRemove,
}: {
  relation: CommercialDealTopic;
  onOpen: () => void;
  onMakePrimary: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-stone-200/70 p-3 dark:border-stone-700 sm:flex-row sm:items-center">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex min-w-0 items-center gap-2">
          {relation.relation_role === 'primary' && (
            <span className="shrink-0 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              主选题
            </span>
          )}
          <span className="min-w-0 break-words text-sm font-semibold text-stone-800 hover:text-rose-600 dark:text-stone-200 dark:hover:text-rose-400">
            {relation.topic_title}
          </span>
        </div>
    <span className="mt-1 block text-xs text-stone-400">{relation.topic_deleted_at ? '关联选题已归档' : relation.topic_status}</span>
      </button>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onMakePrimary}
          disabled={relation.relation_role === 'primary'}
          className="min-h-9 rounded-lg px-2.5 text-xs font-semibold text-stone-500 hover:bg-stone-100 disabled:cursor-default disabled:opacity-40 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          设为主选题
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="min-h-9 rounded-lg px-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
        >
          解除
        </button>
      </div>
    </div>
  );
}

function CommercialDealDetailView({
  dealId,
  topics,
  onCreateTopicFromDeal,
}: {
  dealId: string;
  topics: Topic[];
  onCreateTopicFromDeal?: DealsViewProps['onCreateTopicFromDeal'];
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingSection, setEditingSection] = useState<'cooperation' | 'brief' | 'delivery' | null>(null);
  const [form, setForm] = useState<DealFormState>(() => createDealFormState());
  const [titleDraft, setTitleDraft] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [activity, setActivity] = useState('');
  const [activityError, setActivityError] = useState('');
  const [sectionError, setSectionError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isStatusSaving, setIsStatusSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [primaryTopicId, setPrimaryTopicId] = useState<string | null>(null);
  const [relatedTopicIds, setRelatedTopicIds] = useState<string[]>([]);
  const dealQuery = useQuery({
    queryKey: ['commercial-deal', dealId],
    queryFn: () => fetchCommercialDeal(dealId),
  });
  const publishedQuery = useQuery({
    queryKey: ['published-for-deal'],
    queryFn: fetchPublishedVideos,
  });
  const deal = dealQuery.data;
  const deliveryDate = useActionDateDisplay(
    deal?.delivery_due_date,
    !deal || !['delivered', 'archived'].includes(deal.status)
  );
  const publishDate = useActionDateDisplay(
    deal?.publish_date,
    !deal || !['delivered', 'archived'].includes(deal.status)
  );
  const nextActionDueDate = useActionDateDisplay(deal?.next_action_due_date, !deal || deal.status !== 'archived');

  useEffect(() => {
    if (!deal) return;
    setPrimaryTopicId(deal.topics.find((relation) => relation.relation_role === 'primary')?.topic_id || null);
    setRelatedTopicIds(deal.topics.filter((relation) => relation.relation_role === 'related').map((relation) => relation.topic_id));
    setTitleDraft(deal.title);
    setForm(createDealFormState(deal));
  }, [deal]);

  if (dealQuery.isLoading) return <div className="grid flex-1 place-items-center text-sm text-stone-500">正在加载商单详情…</div>;
  if (dealQuery.error || !deal)
    return <div className="grid flex-1 place-items-center px-6 text-center text-sm text-stone-500">商单不存在或加载失败。</div>;
  const safePublishedVideoUrl = deal.published_video ? getSafePublishedVideoUrl(deal.published_video) : '';

  const updateDealCache = (saved: CommercialDealDetail) => {
    updateCommercialDealCaches(queryClient, saved);
    void queryClient.invalidateQueries({ queryKey: ['commercial-deal-page'] });
    void queryClient.invalidateQueries({ queryKey: ['deal-focus'] });
    void queryClient.invalidateQueries({ queryKey: ['commercial-deals-calendar'] });
    void queryClient.invalidateQueries({ queryKey: ['topic-deals'] });
    void queryClient.invalidateQueries({ queryKey: ['workspace'] });
  };
  const setField = <K extends keyof DealFormState>(key: K, value: DealFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSectionError('');
  };
  const startEdit = (section: 'cooperation' | 'brief' | 'delivery') => {
    setForm(createDealFormState(deal));
    setSectionError('');
    setEditingSection(section);
  };

  const handleSectionSubmit = async (event: React.FormEvent<HTMLFormElement>, section: 'cooperation' | 'brief' | 'delivery') => {
    event.preventDefault();
    let patch: Partial<CommercialDeal> = {};
    if (section === 'cooperation')
      patch = {
        brand_name: form.brand_name.trim(),
        agency_name: form.agency_name.trim(),
        contact_name: form.contact_name.trim(),
        contact_channel: form.contact_channel.trim(),
        source: form.source,
        deliverable_type: form.deliverable_type,
      };
    if (section === 'brief')
      patch = {
        contract_status: form.contract_status,
        contract_summary: form.contract_summary,
        brief: form.brief,
        requirements: form.requirements,
        restrictions: form.restrictions,
      };
    if (section === 'delivery') {
      const amount = form.amount_yuan.trim() ? Number(form.amount_yuan.trim()) : 0;
      if (!Number.isFinite(amount) || amount < 0) {
        setSectionError('成交金额请输入不小于 0 的数字');
        return;
      }
      patch = {
        amount_cents: Math.round(amount * 100),
        payment_status: form.payment_status,
        paid_at: form.paid_at || null,
        delivery_due_date: form.delivery_due_date || null,
        publish_date: form.publish_date || null,
        next_action: form.next_action,
        next_action_due_date: form.next_action_due_date || null,
      };
    }
    setIsSaving(true);
    setSectionError('');
    try {
      const saved = await saveCommercialDeal({
        id: deal.id,
        title: deal.title,
        ...patch,
      });
      updateDealCache(saved);
      setEditingSection(null);
    } catch (error) {
      setSectionError(error instanceof Error ? error.message : '保存商单失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTitleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!titleDraft.trim()) {
      setDetailError('商单名称不能为空');
      return;
    }
    if (titleDraft.trim() === deal.title) {
      setIsEditingTitle(false);
      return;
    }
    setIsSaving(true);
    setDetailError('');
    try {
      const saved = await saveCommercialDeal({
        id: deal.id,
        title: titleDraft.trim(),
      });
      updateDealCache(saved);
      setIsEditingTitle(false);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '保存商单名称失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (value: string) => {
    if (!STATUS_FLOW.includes(value as CommercialDealStatus) || value === deal.status) return;
    setIsStatusSaving(true);
    setDetailError('');
    try {
      const saved = await saveCommercialDeal({
        id: deal.id,
        title: deal.title,
        status: value as CommercialDealStatus,
      });
      updateDealCache(saved);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '更新商单阶段失败');
    } finally {
      setIsStatusSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setDetailError('');
    try {
      await deleteCommercialDeal(deal.id);
      removeCommercialDealCaches(queryClient, deal.id);
      await queryClient.invalidateQueries({
        queryKey: ['commercial-deal-page'],
      });
      await queryClient.invalidateQueries({ queryKey: ['deal-focus'] });
      await queryClient.invalidateQueries({ queryKey: ['commercial-deals-calendar'] });
      await queryClient.invalidateQueries({ queryKey: ['topic-deals'] });
      await queryClient.invalidateQueries({ queryKey: ['workspace'] });
      setIsDeleteModalOpen(false);
      navigate('/deals');
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '删除商单失败');
      setIsDeleting(false);
    }
  };

  const handleSaveTopics = async (nextPrimary: string | null = primaryTopicId, nextRelated = relatedTopicIds) => {
    setIsSaving(true);
    setDetailError('');
    try {
      const saved = await replaceCommercialDealTopics(dealId, nextPrimary, nextRelated);
      updateDealCache(saved);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '更新选题关联失败');
    } finally {
      setIsSaving(false);
    }
  };
  const handleCreateTopic = async () => {
    if (!onCreateTopicFromDeal) return;
    try {
      const topic = await onCreateTopicFromDeal({
        title: deal.title,
        summary: deal.brief || deal.requirements || `商单「${deal.title}」的选题摘要`,
      });
      setPrimaryTopicId(topic.id);
      setRelatedTopicIds([]);
      await handleSaveTopics(topic.id, []);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '从商单创建选题失败');
    }
  };
  const handleActivity = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activity.trim()) {
      setActivityError('请先写下这次沟通的关键内容');
      return;
    }
    setActivityError('');
    try {
      await addCommercialDealActivity(dealId, activity.trim());
      setActivity('');
      await queryClient.invalidateQueries({
        queryKey: ['commercial-deal', dealId],
      });
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : '记录沟通失败');
    }
  };
  const handlePublishedVideo = async (value: string) => {
    setDetailError('');
    try {
      const saved = await linkPublishedVideoToCommercialDeal(dealId, value || null);
      updateDealCache(saved);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '绑定发布视频失败');
    }
  };

  const currentPublishedId = deal.published_video_id || '';
  const publishedOptions: SelectOption[] = [
    { value: '', label: '暂不绑定发布视频' },
    ...(publishedQuery.data || []).map((video) => ({
      value: video.id,
      label: video.title,
      description: video.bvid || video.published_at,
    })),
  ];
  const renderPublishedOption = (option: SelectOption, state: SelectRenderState) => (
    <div className="flex min-w-0 max-w-full items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 whitespace-normal break-words text-xs" style={{ overflowWrap: 'anywhere' }}>
          {option.label}
        </div>
        {option.description && (
          <div className="mt-0.5 truncate text-[10px] font-normal text-stone-400 dark:text-stone-500">{option.description}</div>
        )}
      </div>
      {state.selected && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />}
    </div>
  );
  const linkedTopicIds = new Set([...(primaryTopicId ? [primaryTopicId] : []), ...relatedTopicIds]);
  const availableTopics = topics.filter((topic) => !topic.deleted_at);
  const canShowTopicCta = deal.status === 'producing' && !primaryTopicId;
  const overdue = deliveryDate.state === 'overdue';
  const currentFlowIndex = STATUS_FLOW.indexOf(deal.status);

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain mobile-bottom-nav-content md:pb-8">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-4 sm:px-8 sm:py-6">
        <section className="min-w-0 rounded-2xl border border-stone-200/70 bg-white p-5 shadow-2xs dark:border-stone-800 dark:bg-stone-900 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={deal.status} />
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${deal.payment_status === 'paid' ? 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'}`}
                  >
                    {deal.payment_status === 'paid' ? '已回款' : '待回款'}
                  </span>
                  {deal.contract_status === 'signed' && (
                    <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      合同已签
                    </span>
                  )}
                </div>
                {isEditingTitle ? (
                  <form onSubmit={handleTitleSubmit} className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                    <label htmlFor="deal-detail-title" className="sr-only">
                      商单名称
                    </label>
                    <input
                      id="deal-detail-title"
                      name="title"
                      required
                      maxLength={200}
                      autoFocus
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      className="min-h-11 min-w-0 flex-1 rounded-xl border border-rose-300 bg-white px-3 text-xl font-bold text-stone-900 outline-none focus:ring-2 focus:ring-rose-100 dark:border-rose-700 dark:bg-stone-800 dark:text-stone-100"
                    />
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="min-h-11 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white disabled:opacity-50"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTitleDraft(deal.title);
                        setIsEditingTitle(false);
                      }}
                      className="min-h-11 rounded-xl px-3 text-xs font-semibold text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
                    >
                      取消
                    </button>
                  </form>
                ) : (
                  <div className="mt-3 flex min-w-0 items-start gap-2">
                    <h1
                      className="min-w-0 break-words text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100"
                      style={{ overflowWrap: 'anywhere' }}
                    >
                      {deal.title}
                    </h1>
                    <button
                      type="button"
                      onClick={() => setIsEditingTitle(true)}
                      aria-label="编辑商单名称"
                      className="mt-1.5 shrink-0 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-rose-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-rose-400"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <p className="mt-1 break-words text-sm font-semibold text-rose-600 dark:text-rose-400" style={{ overflowWrap: 'anywhere' }}>
                  {deal.brand_name || '未填写品牌'}
                  {deal.agency_name ? ` · ${deal.agency_name}` : ''}
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center lg:shrink-0">
                <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-stone-500 dark:text-stone-400">
                  <span className="shrink-0">当前阶段</span>
                  <input type="hidden" name="status" value={deal.status} />
                  <CustomSelect
                    value={deal.status}
                    onChange={(value) => void handleStatusChange(value)}
                    options={STATUS_OPTIONS}
                    ariaLabel="直接修改商单阶段"
                    disabled={isStatusSaving}
                    size="md"
                    buttonClassName="min-h-11 min-w-32 max-w-full"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(true)}
                  disabled={isDeleting}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 px-3 text-xs font-bold text-red-600 hover:bg-red-50 disabled:cursor-wait disabled:opacity-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/30 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                  {isDeleting ? '删除中…' : '删除商单'}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-stone-100 pt-4 dark:border-stone-800 sm:grid-cols-4">
              <MetaItem label="交付类型" value={DELIVERABLE_LABELS[deal.deliverable_type]} />
              <MetaItem label="合作来源" value={SOURCE_LABELS[deal.source]} />
              <MetaItem label="成交金额" value={formatMoney(deal.amount_cents)} />
              <MetaItem
                label="交付截止"
                value={deliveryDate.state === 'empty' ? '未设置' : <ActionDateText display={deliveryDate} />}
                tone={overdue ? 'danger' : undefined}
              />
            </div>
          </div>
        </section>
        {(detailError || sectionError) && (
          <div
            role="alert"
            aria-live="polite"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
          >
            {detailError || sectionError}
          </div>
        )}
        {canShowTopicCta && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/25 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">制作前还没有绑定主选题</p>
              <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">商单状态不会自动推动选题状态，请明确选择内容载体。</p>
            </div>
            <button
              type="button"
              onClick={() => document.getElementById('deal-topic-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="min-h-11 rounded-xl bg-amber-700 px-4 text-sm font-bold text-white hover:bg-amber-800"
            >
              去绑定选题
            </button>
          </div>
        )}
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
          <div className="min-w-0 space-y-5">
            <SectionCard
              title="合作信息"
              icon={<MessageSquare className="h-4 w-4 text-rose-600" />}
              action={editingSection !== 'cooperation' && <EditSectionButton onClick={() => startEdit('cooperation')} />}
            >
              {editingSection === 'cooperation' ? (
                <form onSubmit={(event) => void handleSectionSubmit(event, 'cooperation')} className="space-y-4">
                  <fieldset className="space-y-4">
                    <legend className="sr-only">编辑合作信息</legend>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                        品牌名称
                        <input
                          name="brand_name"
                          maxLength={200}
                          value={form.brand_name}
                          onChange={(event) => setField('brand_name', event.target.value)}
                          className={fieldClass}
                        />
                      </label>
                      <label className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                        代理商 / 服务商
                        <input
                          name="agency_name"
                          maxLength={200}
                          value={form.agency_name}
                          onChange={(event) => setField('agency_name', event.target.value)}
                          className={fieldClass}
                        />
                      </label>
                      <label className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                        对接人
                        <input
                          name="contact_name"
                          maxLength={200}
                          value={form.contact_name}
                          onChange={(event) => setField('contact_name', event.target.value)}
                          className={fieldClass}
                        />
                      </label>
                      <label className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                        联系方式
                        <input
                          name="contact_channel"
                          maxLength={2000}
                          value={form.contact_channel}
                          onChange={(event) => setField('contact_channel', event.target.value)}
                          className={fieldClass}
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <SelectField
                        name="source"
                        label="商单来源"
                        value={form.source}
                        options={SOURCE_OPTIONS}
                        onChange={(value) => setField('source', value as CommercialDeal['source'])}
                      />
                      <SelectField
                        name="deliverable_type"
                        label="交付类型"
                        value={form.deliverable_type}
                        options={DELIVERABLE_OPTIONS}
                        onChange={(value) => setField('deliverable_type', value as CommercialDeal['deliverable_type'])}
                      />
                    </div>
                  </fieldset>
                  {sectionError && (
                    <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                      {sectionError}
                    </p>
                  )}
                  <EditorActions saving={isSaving} onCancel={() => setEditingSection(null)} />
                </form>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <MetaItem label="对接人" value={deal.contact_name || '未填写'} />
                  <MetaItem label="联系方式" value={deal.contact_channel || '未填写'} />
                  <MetaItem label="代理商 / 服务商" value={deal.agency_name || '无'} />
                  <MetaItem label="合同状态" value={CONTRACT_LABELS[deal.contract_status]} />
                </div>
              )}
            </SectionCard>
            <SectionCard
              title="执行单与合作口径"
              icon={<FileText className="h-4 w-4 text-rose-600" />}
              action={editingSection !== 'brief' && <EditSectionButton onClick={() => startEdit('brief')} />}
            >
              {editingSection === 'brief' ? (
                <form onSubmit={(event) => void handleSectionSubmit(event, 'brief')} className="space-y-4">
                  <fieldset className="space-y-4">
                    <legend className="sr-only">编辑执行单与合作口径</legend>
                    <SelectField
                      name="contract_status"
                      label="合同状态"
                      value={form.contract_status}
                      options={CONTRACT_OPTIONS}
                      onChange={(value) => setField('contract_status', value as CommercialDeal['contract_status'])}
                    />
                    <label className="block text-xs font-semibold text-stone-600 dark:text-stone-300">
                      商单简介
                      <textarea
                        name="brief"
                        maxLength={20000}
                        value={form.brief}
                        onChange={(event) => setField('brief', event.target.value)}
                        className={textareaClass}
                      />
                    </label>
                    <label className="block text-xs font-semibold text-stone-600 dark:text-stone-300">
                      必须满足
                      <textarea
                        name="requirements"
                        maxLength={20000}
                        value={form.requirements}
                        onChange={(event) => setField('requirements', event.target.value)}
                        className={textareaClass}
                      />
                    </label>
                    <label className="block text-xs font-semibold text-stone-600 dark:text-stone-300">
                      禁用与风险
                      <textarea
                        name="restrictions"
                        maxLength={20000}
                        value={form.restrictions}
                        onChange={(event) => setField('restrictions', event.target.value)}
                        className={textareaClass}
                      />
                    </label>
                    <label className="block text-xs font-semibold text-stone-600 dark:text-stone-300">
                      合同 / 需求摘要
                      <textarea
                        name="contract_summary"
                        maxLength={20000}
                        value={form.contract_summary}
                        onChange={(event) => setField('contract_summary', event.target.value)}
                        className={textareaClass}
                      />
                    </label>
                  </fieldset>
                  {sectionError && (
                    <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                      {sectionError}
                    </p>
                  )}
                  <EditorActions saving={isSaving} onCancel={() => setEditingSection(null)} />
                </form>
              ) : (
                <div className="space-y-4 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                  <TextBlock label="商单简介" value={deal.brief} empty="还没有记录客户为什么要做这次合作。" />
                  <TextBlock label="必须满足" value={deal.requirements} empty="暂未记录必须露出的内容。" />
                  <TextBlock label="禁用与风险" value={deal.restrictions} empty="暂未记录禁用口径或风险。" />
                  <TextBlock label="合同 / 需求摘要" value={deal.contract_summary} empty="暂未记录合同与需求摘要。" />
                </div>
              )}
            </SectionCard>
            <SectionCard
              title="选题关系"
              icon={<Link2 className="h-4 w-4 text-rose-600" />}
              action={<span className="text-xs text-stone-400">商单与选题状态独立</span>}
            >
              <div id="deal-topic-section" className="space-y-3">
                {deal.topics.length > 0 ? (
                  deal.topics.map((relation) => (
                    <LinkedTopicRow
                      key={relation.id}
                      relation={relation}
                      onOpen={() => navigate(`/topics/${encodeURIComponent(relation.topic_id)}?tab=overview`)}
                      onMakePrimary={() => {
                        const nextRelated = deal.topics.filter((item) => item.topic_id !== relation.topic_id).map((item) => item.topic_id);
                        setPrimaryTopicId(relation.topic_id);
                        setRelatedTopicIds(nextRelated);
                        void handleSaveTopics(relation.topic_id, nextRelated);
                      }}
                      onRemove={() => {
                        const nextPrimary = primaryTopicId === relation.topic_id ? null : primaryTopicId;
                        const nextRelated = relatedTopicIds.filter((topicId) => topicId !== relation.topic_id);
                        setPrimaryTopicId(nextPrimary);
                        setRelatedTopicIds(nextRelated);
                        void handleSaveTopics(nextPrimary, nextRelated);
                      }}
                    />
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center dark:border-stone-700">
                    <Target className="mx-auto h-6 w-6 text-stone-300 dark:text-stone-600" />
                    <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">还没有关联选题</p>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 rounded-xl bg-stone-500/[0.03] p-3 dark:bg-stone-800/60 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div>
                    <span className="mb-1.5 block text-xs font-semibold text-stone-500 dark:text-stone-400">选择主选题</span>
                    <CustomSelect
                      value={primaryTopicId || ''}
                      onChange={(value) => {
                        const nextPrimary = value || null;
                        const nextRelated = relatedTopicIds.filter((topicId) => topicId !== nextPrimary);
                        setPrimaryTopicId(nextPrimary);
                        setRelatedTopicIds(nextRelated);
                        void handleSaveTopics(nextPrimary, nextRelated);
                      }}
                      options={[
                        { value: '', label: '暂不绑定主选题' },
                        ...availableTopics.map((topic) => ({
                          value: topic.id,
                          label: topic.title,
                          description: topic.status,
                        })),
                      ]}
                      searchable
                      searchPlaceholder="搜索选题"
                      ariaLabel="选择主选题"
                      size="md"
                      buttonClassName="min-h-11 w-full"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCreateTopic()}
                    disabled={!onCreateTopicFromDeal || isSaving}
                    className="min-h-11 self-end rounded-xl border border-rose-200 px-3 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/30"
                  >
                    <Plus className="mr-1 inline h-3.5 w-3.5" />
                    从商单创建选题
                  </button>
                </div>
                {availableTopics.length > 0 && (
                  <div>
                    <span className="mb-1.5 block text-xs font-semibold text-stone-500 dark:text-stone-400">系列关联选题</span>
                    <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-stone-200/70 p-2 dark:border-stone-700">
                      {availableTopics.map((topic) => {
                        const checked = linkedTopicIds.has(topic.id);
                        return (
                          <label
                            key={topic.id}
                            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs text-stone-700 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-800"
                          >
                            <input
                              type="checkbox"
                              name="related_topics"
                              checked={checked}
                              onChange={() => {
                                if (topic.id === primaryTopicId) return;
                                const nextRelated = checked
                                  ? relatedTopicIds.filter((topicId) => topicId !== topic.id)
                                  : [...relatedTopicIds, topic.id];
                                setRelatedTopicIds(nextRelated);
                                void handleSaveTopics(primaryTopicId, nextRelated);
                              }}
                              className="h-4 w-4 accent-rose-600"
                            />
                            <span className="min-w-0 flex-1 break-words">{topic.title}</span>
                            {topic.id === primaryTopicId && <span className="shrink-0 text-[10px] text-rose-600">主选题</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
            <SectionCard title="沟通记录" icon={<MessageSquare className="h-4 w-4 text-rose-600" />}>
              <form onSubmit={handleActivity} className="space-y-3">
                <fieldset className="space-y-3">
                  <legend className="sr-only">记录沟通</legend>
                  <label className="block text-xs font-semibold text-stone-500 dark:text-stone-400">
                    <span className="sr-only">记录沟通</span>
                    <textarea
                      name="activity"
                      value={activity}
                      onChange={(event) => {
                        setActivity(event.target.value);
                        setActivityError('');
                      }}
                      maxLength={20000}
                      className={textareaClass}
                      placeholder="记下客户反馈、改稿轮次、执行单确认或下一次沟通重点…"
                    />
                  </label>
                </fieldset>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span role="status" aria-live="polite" className="text-xs text-red-600 dark:text-red-400">
                    {activityError}
                  </span>
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 text-sm font-bold text-white hover:bg-stone-800 dark:bg-rose-600 dark:hover:bg-rose-700"
                  >
                    <Send className="h-3.5 w-3.5" />
                    记录这次沟通
                  </button>
                </div>
              </form>
              <div className="mt-5 divide-y divide-stone-100 dark:divide-stone-800">
                {deal.activities.map((item) => (
                  <div key={item.id} className="py-3 first:pt-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full bg-stone-500/10 px-2 py-0.5 text-[11px] font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                        {item.kind === 'payment' ? '回款' : item.kind === 'status_change' ? '阶段' : '沟通'}
                      </span>
                      <time className="shrink-0 text-[11px] text-stone-400" dateTime={item.created_at}>
                        {new Date(item.created_at).toLocaleString('zh-CN', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    </div>
                    <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                      {item.content}
                    </p>
                  </div>
                ))}
                {deal.activities.length === 0 && <p className="py-3 text-xs text-stone-400">还没有沟通记录。</p>}
              </div>
            </SectionCard>
          </div>
          <div className="min-w-0 space-y-5">
            <SectionCard
              title="交付与回款"
              icon={<WalletCards className="h-4 w-4 text-rose-600" />}
              action={editingSection !== 'delivery' && <EditSectionButton onClick={() => startEdit('delivery')} />}
            >
              {editingSection === 'delivery' ? (
                <form onSubmit={(event) => void handleSectionSubmit(event, 'delivery')} className="space-y-4">
                  <fieldset className="space-y-4">
                    <legend className="sr-only">编辑交付与回款</legend>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
                      <label className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                        成交金额（元）
                        <input
                          name="amount_yuan"
                          type="text"
                          inputMode="decimal"
                          maxLength={20}
                          value={form.amount_yuan}
                          onChange={(event) => setField('amount_yuan', event.target.value)}
                          className={fieldClass}
                          placeholder="例如 5000"
                        />
                      </label>
                      <SelectField
                        name="payment_status"
                        label="回款状态"
                        value={form.payment_status}
                        options={PAYMENT_OPTIONS}
                        onChange={(value) => setField('payment_status', value as CommercialDeal['payment_status'])}
                      />
                      <label className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                        交付截止日
                        <DateInput
                          name="delivery_due_date"
                          value={form.delivery_due_date}
                          onChange={(value) => setField('delivery_due_date', value)}
                          className={fieldClass}
                        />
                      </label>
                      <label className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                        计划上线日
                        <DateInput
                          name="publish_date"
                          value={form.publish_date}
                          onChange={(value) => setField('publish_date', value)}
                          className={fieldClass}
                        />
                      </label>
                      <label className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                        到账日期
                        <DateInput
                          name="paid_at"
                          value={form.paid_at}
                          onChange={(value) => setField('paid_at', value)}
                          className={fieldClass}
                        />
                      </label>
                      <label className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                        当前下一步
                        <input
                          name="next_action"
                          maxLength={2000}
                          value={form.next_action}
                          onChange={(event) => setField('next_action', event.target.value)}
                          className={fieldClass}
                          placeholder="例如：把脚本第一版发给客户确认"
                        />
                      </label>
                      <label className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                        下一步截止日
                        <DateInput
                          name="next_action_due_date"
                          value={form.next_action_due_date}
                          onChange={(value) => setField('next_action_due_date', value)}
                          className={fieldClass}
                        />
                      </label>
                    </div>
                  </fieldset>
                  {sectionError && (
                    <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                      {sectionError}
                    </p>
                  )}
                  <EditorActions saving={isSaving} onCancel={() => setEditingSection(null)} />
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-stone-200/70 p-4 dark:border-stone-700">
                    <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">应收成交金额</p>
                    <p className="mt-1 text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                      {formatMoney(deal.amount_cents)}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                      <span
                        className={
                          deal.payment_status === 'paid'
                            ? 'font-semibold text-emerald-700 dark:text-emerald-300'
                            : 'font-semibold text-amber-700 dark:text-amber-300'
                        }
                      >
                        {deal.payment_status === 'paid' ? '已收到款项' : '等待回款'}
                      </span>
                      {deal.paid_at && <span className="text-xs text-stone-400">到账 <ActionDate value={deal.paid_at} active={false} /></span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <MetaItem label="交付截止" value={deliveryDate.state === 'empty' ? '未设置' : <ActionDateText display={deliveryDate} />} tone={overdue ? 'danger' : undefined} />
                    <MetaItem label="计划上线日" value={publishDate.state === 'empty' ? '未设置' : <ActionDateText display={publishDate} />} />
                  </div>
                  <div className="rounded-xl bg-rose-500/[0.07] p-4 dark:bg-rose-950/30">
                    <p className="text-xs font-bold text-rose-700 dark:text-rose-300">下一步行动</p>
                    <p className="mt-2 break-words text-sm font-bold leading-relaxed text-stone-900 dark:text-stone-100">
                      {deal.next_action || '还没有明确下一步'}
                    </p>
                    {deal.next_action_due_date && (
                      <p
                        className={`mt-3 text-xs ${nextActionDueDate.state === 'overdue' ? 'font-bold text-red-600 dark:text-red-400' : 'text-stone-500 dark:text-stone-400'}`}
                      >
                        截止 <ActionDateText display={nextActionDueDate} />
                      </p>
                    )}
                  </div>
                </div>
              )}
            </SectionCard>
            <SectionCard title="交付结果" icon={<CheckCircle2 className="h-4 w-4 text-rose-600" />}>
              <div className="space-y-4">
                <div className="min-w-0 rounded-xl bg-stone-500/[0.03] p-3 dark:bg-stone-800/60">
                  <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">发布视频</p>
                  <CustomSelect
                    value={currentPublishedId}
                    onChange={(value) => void handlePublishedVideo(value)}
                    options={publishedOptions}
                    renderOption={renderPublishedOption}
                    renderValue={(option) => (
                      <span
                        className="line-clamp-2 min-w-0 max-w-full whitespace-normal break-words text-left text-sm"
                        style={{ overflowWrap: 'anywhere' }}
                      >
                        {option?.label || '暂不绑定发布视频'}
                      </span>
                    )}
                    ariaLabel="绑定发布视频"
                    searchable
                    searchPlaceholder="搜索已发布视频"
                    size="md"
                    popoverWidth="content"
                    buttonClassName="mt-2 min-h-11 w-full min-w-0 max-w-full"
                    popoverClassName="w-[min(32rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]"
                  />
                  {deal.published_video && (
                    <div className="mt-3 min-w-0 rounded-lg border border-stone-200/70 bg-white/70 p-3 dark:border-stone-700 dark:bg-stone-900/50">
                      <p className="text-[11px] font-semibold text-stone-400 dark:text-stone-500">已绑定视频标题</p>
                      <p
                        className="mt-1 break-words whitespace-normal text-sm font-bold leading-relaxed text-stone-800 dark:text-stone-200"
                        style={{ overflowWrap: 'anywhere' }}
                      >
                        {deal.published_video.title}
                      </p>
                      {safePublishedVideoUrl ? (
                        <a
                          href={safePublishedVideoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex max-w-full items-center gap-1.5 break-words text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
                        >
                          打开 B 站视频 <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        </a>
                      ) : (
                        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">视频链接未设置或已被拦截</p>
                      )}
                    </div>
                  )}
                  {deal.status === 'delivered' && !deal.published_video_id && (
                    <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">已交付但还没有绑定发布视频</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MetaItem label="发布视频 BV 号" value={deal.published_video?.bvid || '未绑定'} />
                  <MetaItem label="计划上线日" value={publishDate.state === 'empty' ? '未设置' : <ActionDateText display={publishDate} />} />
                </div>
              </div>
            </SectionCard>
            <SectionCard title="当前推进" icon={<ArrowRight className="h-4 w-4 text-rose-600" />}>
              <div className="rounded-xl bg-rose-500/[0.07] p-4 dark:bg-rose-950/30">
                <p className="text-xs font-bold text-rose-700 dark:text-rose-300">下一步行动</p>
                <p className="mt-2 break-words text-sm font-bold leading-relaxed text-stone-900 dark:text-stone-100">
                  {deal.next_action || '还没有明确下一步'}
                </p>
                {deal.next_action_due_date && (
                  <p
                    className={`mt-3 text-xs ${nextActionDueDate.state === 'overdue' ? 'font-bold text-red-600 dark:text-red-400' : 'text-stone-500 dark:text-stone-400'}`}
                  >
                    截止 <ActionDateText display={nextActionDueDate} />
                  </p>
                )}
              </div>
              <div className="mt-4 space-y-2">
                {STATUS_FLOW.map((status, index) => (
                  <div key={status} className="flex items-center gap-2 text-xs">
                    <span
                      className={`grid h-5 w-5 place-items-center rounded-full ${deal.status === status ? 'bg-rose-600 text-white' : index < currentFlowIndex ? 'bg-emerald-500 text-white' : 'bg-stone-100 text-stone-400 dark:bg-stone-800'}`}
                    >
                      {index < currentFlowIndex ? <Check className="h-3 w-3" /> : index + 1}
                    </span>
                    <span
                      className={
                        deal.status === status ? 'font-bold text-stone-900 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400'
                      }
                    >
                      {STATUS_LABELS[status]}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="永久删除商单"
        description={`确定要永久删除商单「${deal.title}」吗？\n\n商单活动和选题关联会一并删除，但不会删除选题或已发布视频。此操作无法撤销。`}
        confirmText="永久删除"
        tone="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}

function MetaItem({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'danger' }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-stone-400 dark:text-stone-500">{label}</p>
      <p
        className={`mt-1 break-words text-sm font-bold ${tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-stone-800 dark:text-stone-200'}`}
        style={{ overflowWrap: 'anywhere' }}
      >
        {value}
      </p>
    </div>
  );
}
function TextBlock({ label, value, empty }: { label: string; value: string; empty: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold text-stone-500 dark:text-stone-400">{label}</p>
      <p
        className={`mt-1.5 break-words whitespace-pre-wrap ${value ? 'text-stone-700 dark:text-stone-300' : 'text-stone-400'}`}
        style={{ overflowWrap: 'anywhere' }}
      >
        {value || empty}
      </p>
    </div>
  );
}

export function DealsView({ dealId, topics, onBack, backLabel, onCreateTopicFromDeal }: DealsViewProps) {
  if (!dealId) {
    return <CommercialDealsView topics={topics} onCreateTopicFromDeal={onCreateTopicFromDeal} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BackNavigationBar
        onBack={onBack || (() => undefined)}
        label={backLabel || '返回商单中心'}
        title={backLabel || '返回商单中心'}
      />
      <CommercialDealDetailView dealId={dealId} topics={topics} onCreateTopicFromDeal={onCreateTopicFromDeal} />
    </div>
  );
}
