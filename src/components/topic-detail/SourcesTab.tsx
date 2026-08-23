import React, { useState } from 'react';
import { Source, VerificationStatus, PlatformType } from '../../types';
import { VerificationBadge, PlatformBadge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import {
  Plus,
  ExternalLink,
  Trash2,
  Edit2,
  Search,
  Copy,
  Check,
  Calendar,
  Sparkles,
  X,
  RefreshCw,
} from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import { parseUrlMetadataApi } from '../../lib/remoteStorage';

interface SourcesTabProps {
  topicId: string;
  sources: Source[];
  onSaveSource: (source: Partial<Source> & { topic_id: string; title: string }) => Promise<void>;
  onDeleteSource: (sourceId: string) => Promise<void>;
  onConvertToTimeline?: (source: Source) => Promise<void>;
}

const PLATFORM_OPTIONS: { value: PlatformType | 'all'; label: string }[] = [
  { value: 'all', label: '全部平台' },
  { value: 'bilibili', label: 'Bilibili' },
  { value: 'douyin', label: '抖音' },
  { value: 'weibo', label: '微博' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'zhihu', label: '知乎' },
  { value: 'wechat', label: '微信' },
  { value: 'kuaishou', label: '快手' },
  { value: 'news', label: '新闻媒体' },
  { value: 'live', label: '直播切片' },
  { value: 'other', label: '其他' },
];

export const SourcesTab: React.FC<SourcesTabProps> = ({
  topicId,
  sources,
  onSaveSource,
  onDeleteSource,
  onConvertToTimeline,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<PlatformType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<VerificationStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [timelineConvertedId, setTimelineConvertedId] = useState<string | null>(null);
  const [smartPasteInput, setSmartPasteInput] = useState('');
  const [isParsingUrl, setIsParsingUrl] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [platform, setPlatform] = useState<PlatformType>('bilibili');
  const [author, setAuthor] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('confirmed');
  const [notes, setNotes] = useState('');

  const openAddModal = () => {
    setEditingSource(null);
    setTitle('');
    setContent('');
    setUrl('');
    setPlatform('bilibili');
    setAuthor('');
    setPublishedAt('');
    setVerificationStatus('confirmed');
    setNotes('');
    setSmartPasteInput('');
    setIsModalOpen(true);
  };

  const openEditModal = (s: Source) => {
    setEditingSource(s);
    setTitle(s.title);
    setContent(s.content);
    setUrl(s.url);
    setPlatform(s.platform);
    setAuthor(s.author);
    setPublishedAt(s.published_at);
    setVerificationStatus(s.verification_status);
    setNotes(s.notes);
    setSmartPasteInput('');
    setIsModalOpen(true);
  };

  const handleSmartParse = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;
    const urlMatch = trimmed.match(/https?:\/\/[^\s]+/i);
    let extractedUrl = '';
    let cleanText = trimmed;

    if (urlMatch) {
      extractedUrl = urlMatch[0];
      cleanText = trimmed.replace(extractedUrl, '').trim();
      setUrl(extractedUrl);

      // Local quick fallback platform detection
      if (/bilibili\.com|b23\.tv/i.test(extractedUrl)) setPlatform('bilibili');
      else if (/douyin\.com|iesdouyin\.com/i.test(extractedUrl)) setPlatform('douyin');
      else if (/kuaishou\.com/i.test(extractedUrl)) setPlatform('kuaishou');
      else if (/weibo\.com|weibo\.cn/i.test(extractedUrl)) setPlatform('weibo');
      else if (/xiaohongshu\.com|xhslink\.com/i.test(extractedUrl)) setPlatform('xiaohongshu');
      else if (/weixin\.qq\.com|mp\.weixin/i.test(extractedUrl)) setPlatform('wechat');
      else if (/zhihu\.com/i.test(extractedUrl)) setPlatform('zhihu');
      else if (/youtube\.com|youtu\.be/i.test(extractedUrl)) setPlatform('youtube');

      // Fetch accurate metadata from server (Bilibili open API / OpenGraph)
      setIsParsingUrl(true);
      try {
        const meta = await parseUrlMetadataApi(extractedUrl);
        if (meta) {
          if (meta.title && meta.title !== extractedUrl) setTitle(meta.title);
          if (meta.author) setAuthor(meta.author);
          if (meta.content) setContent(meta.content);
          if (meta.published_at) setPublishedAt(meta.published_at);
          if (meta.platform) setPlatform(meta.platform as PlatformType);
          if (meta.url) setUrl(meta.url);
          setIsParsingUrl(false);
          return;
        }
      } catch {
        // Fallback to local text parsing below
      } finally {
        setIsParsingUrl(false);
      }
    }

    const cleanTitleCandidate = cleanText.replace(/^[【\[(（]?.*? [】\])）]?/, '').trim() || cleanText;
    if (cleanTitleCandidate) {
      setTitle(cleanTitleCandidate.slice(0, 80));
    }
    if (cleanText.length > 30) {
      setContent(cleanText);
    }
  };

  const handleCycleVerification = async (s: Source) => {
    const nextStatus: VerificationStatus =
      s.verification_status === 'confirmed'
        ? 'unverified'
        : s.verification_status === 'unverified'
        ? 'rejected'
        : 'confirmed';
    await onSaveSource({
      id: s.id,
      topic_id: topicId,
      title: s.title,
      type: 'material',
      verification_status: nextStatus,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    await onSaveSource({
      id: editingSource?.id,
      topic_id: topicId,
      title: title.trim(),
      type: 'material',
      content: content.trim(),
      url: url.trim(),
      platform,
      author: author.trim(),
      published_at: publishedAt.trim(),
      verification_status: verificationStatus,
      notes: notes.trim(),
    });

    setIsModalOpen(false);
  };

  const copyUrl = (id: string, link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const q = searchQuery.toLowerCase().trim();
  const filteredSources = sources.filter((s) => {
    if (filterPlatform !== 'all' && s.platform !== filterPlatform) return false;
    if (filterStatus !== 'all' && s.verification_status !== filterStatus) return false;
    if (q) {
      const matchTitle = s.title.toLowerCase().includes(q);
      const matchContent = (s.content || '').toLowerCase().includes(q);
      const matchAuthor = (s.author || '').toLowerCase().includes(q);
      const matchNotes = (s.notes || '').toLowerCase().includes(q);
      const matchUrl = (s.url || '').toLowerCase().includes(q);
      if (!matchTitle && !matchContent && !matchAuthor && !matchNotes && !matchUrl) return false;
    }
    return true;
  });

  return (
    <div className="py-4 sm:py-6 space-y-5">
      {/* Header & Filter Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 bg-white dark:bg-stone-900 p-4 sm:p-5 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-subtle transition-colors">
        <div className="flex items-center gap-2.5 flex-wrap flex-1">
          {/* Real-time Search Input */}
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400 dark:text-stone-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索素材标题、内容、备忘..."
              className="w-full pl-8 pr-7 py-1.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:bg-white dark:focus:bg-stone-800 focus:outline-none focus:border-rose-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="h-5 w-px bg-stone-200 dark:bg-stone-700 mx-0.5 hidden sm:block" />

          {/* Platform Filter */}
          <CustomSelect
            value={filterPlatform}
            onChange={(val) => setFilterPlatform(val as PlatformType | 'all')}
            size="sm"
            options={PLATFORM_OPTIONS.map((opt) => ({
              value: opt.value,
              label: opt.value === 'all' ? `全部平台 (${sources.length})` : opt.label,
            }))}
          />

          {/* Verification Status Filter */}
          <CustomSelect
            value={filterStatus}
            onChange={(val) => setFilterStatus(val as VerificationStatus | 'all')}
            size="sm"
            options={[
              { value: 'all', label: '所有核实状态' },
              { value: 'confirmed', label: '已确认', dot: 'bg-emerald-500' },
              { value: 'unverified', label: '待核实', dot: 'bg-amber-500' },
              { value: 'rejected', label: '不采用', dot: 'bg-stone-400' },
            ]}
          />
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center gap-1.5 bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white px-3.5 py-1.8 rounded-xl text-xs font-bold transition-all shadow-sm hover:scale-[1.02] active:scale-[0.98] cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>添加素材</span>
        </button>
      </div>

      {/* Sources Grid: 3-Column Responsive Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
        {filteredSources.map((s) => (
          <div
            key={s.id}
            className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-3.5 sm:p-4 space-y-2.5 shadow-2xs hover:shadow-subtle transition-all flex flex-col justify-between"
          >
            <div className="space-y-2">
              {/* Badges row & Quick actions */}
              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <PlatformBadge platform={s.platform} />
                  <button
                    type="button"
                    onClick={() => handleCycleVerification(s)}
                    className="cursor-pointer transition-transform active:scale-95"
                    title="点击快捷切换核实状态 (已确认 -> 待核实 -> 不采用)"
                  >
                    <VerificationBadge status={s.verification_status} />
                  </button>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => openEditModal(s)}
                    className="p-1 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 rounded hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer transition-colors"
                    title="编辑素材"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteSource(s.id)}
                    className="p-1 text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
                    title="删除素材"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Title */}
              <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 leading-snug line-clamp-2" title={s.title}>
                {s.title}
              </h4>

              {/* Content / Summary */}
              {s.content && (
                <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed bg-stone-50/90 dark:bg-stone-800/60 p-2.5 rounded-lg border border-stone-100 dark:border-stone-800/80 line-clamp-3">
                  {s.content}
                </p>
              )}

              {/* Notes / Tips */}
              {s.notes && (
                <div className="text-[11px] text-stone-600 dark:text-stone-400 bg-amber-50/60 dark:bg-amber-950/30 px-2 py-1 rounded border border-amber-200/50 dark:border-amber-900/40 truncate" title={`备忘：${s.notes}`}>
                  💡 {s.notes}
                </div>
              )}
            </div>

            {/* Bottom Meta & Action buttons */}
            <div className="pt-2.5 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between flex-wrap gap-1.5 text-[11px] text-stone-400 dark:text-stone-500">
              <div className="flex items-center gap-2 truncate">
                {s.author && <span className="truncate max-w-[90px]" title={s.author}>@{s.author}</span>}
                {s.published_at && <span>{s.published_at}</span>}

                {/* Convert to Timeline Event Button */}
                {onConvertToTimeline && (
                  <button
                    onClick={() => {
                      onConvertToTimeline(s);
                      setTimelineConvertedId(s.id);
                      setTimeout(() => setTimelineConvertedId(null), 2000);
                    }}
                    className="inline-flex items-center gap-0.5 text-[10px] font-medium text-stone-500 dark:text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                    title="一键将本条素材沉淀为故事时间线事件"
                  >
                    {timelineConvertedId === s.id ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">已入线</span>
                      </>
                    ) : (
                      <>
                        <Calendar className="w-3 h-3" />
                        <span>转时间线</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {s.url && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => copyUrl(s.id, s.url)}
                    className="hover:text-stone-700 dark:hover:text-stone-300 p-0.5 cursor-pointer"
                    title="复制链接"
                  >
                    {copiedId === s.id ? (
                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-0.5 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-semibold hover:underline"
                  >
                    <span>来源</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}

        {filteredSources.length === 0 && (
          <div className="col-span-full p-12 text-center border-2 border-dashed border-stone-200 dark:border-stone-800 rounded-2xl bg-white dark:bg-stone-900 text-stone-400 dark:text-stone-500 space-y-2">
            <p className="text-sm font-semibold text-stone-600 dark:text-stone-400">
              {searchQuery ? `未找到包含「${searchQuery}」的素材记录` : '暂无素材记录'}
            </p>
            <p className="text-xs text-stone-400 dark:text-stone-500">
              点击右上角「+ 添加素材」，支持一键智能抓取 B站/YouTube 视频信息
            </p>
          </div>
        )}
      </div>

      {/* Add / Edit Source Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSource ? '编辑素材资料' : '录入新素材'}
        subtitle="搜集并沉淀一手视频切片、文本记录与参考资料"
        maxWidth="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Smart Paste / Parse helper */}
          {!editingSource && (
            <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-200/80 dark:border-rose-900/50 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-rose-500" />
                  <span>Bilibili / YouTube 智能识别</span>
                </span>
                {isParsingUrl && (
                  <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>正在解析元数据...</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={smartPasteInput}
                  onChange={(e) => {
                    setSmartPasteInput(e.target.value);
                    handleSmartParse(e.target.value);
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    if (pasted) {
                      setSmartPasteInput(pasted);
                      handleSmartParse(pasted);
                    }
                  }}
                  placeholder="粘贴 B站（含 b23.tv）或 YouTube 链接，自动拉取标题、UP主与简介..."
                  className="flex-1 px-3 py-1.5 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-rose-500"
                />
                {smartPasteInput && (
                  <button
                    type="button"
                    onClick={() => handleSmartParse(smartPasteInput)}
                    disabled={isParsingUrl}
                    className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shrink-0 disabled:opacity-50 cursor-pointer shadow-2xs"
                    title="重新识别抓取"
                  >
                    <RefreshCw className={`w-3 h-3 ${isParsingUrl ? 'animate-spin' : ''}`} />
                    <span>识别</span>
                  </button>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
              素材标题 <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="例如：良子出征誓师直播录屏"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">来源平台</label>
              <CustomSelect
                value={platform}
                onChange={(val) => setPlatform(val as PlatformType)}
                className="w-full"
                buttonClassName="w-full justify-between py-2 text-sm bg-stone-50 dark:bg-stone-800 border-stone-300 dark:border-stone-700 rounded-lg"
                options={[
                  { value: 'bilibili', label: 'Bilibili' },
                  { value: 'douyin', label: '抖音' },
                  { value: 'kuaishou', label: '快手' },
                  { value: 'weibo', label: '微博' },
                  { value: 'xiaohongshu', label: '小红书' },
                  { value: 'wechat', label: '微信公众号' },
                  { value: 'zhihu', label: '知乎' },
                  { value: 'youtube', label: 'YouTube' },
                  { value: 'news', label: '新闻媒体' },
                  { value: 'live', label: '直播切片' },
                  { value: 'other', label: '其他' },
                ]}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">原作者 / 发布者</label>
              <input
                type="text"
                placeholder="例如：良子官方录播组"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">来源 URL 链接</label>
              <input
                type="url"
                placeholder="https://www.bilibili.com/video/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">可信度状态</label>
              <CustomSelect
                value={verificationStatus}
                onChange={(val) => setVerificationStatus(val as VerificationStatus)}
                className="w-full"
                buttonClassName="w-full justify-between py-2 text-sm bg-stone-50 dark:bg-stone-800 border-stone-300 dark:border-stone-700 rounded-lg"
                options={[
                  { value: 'confirmed', label: '已确认 (多方可靠来源)', dot: 'bg-emerald-500' },
                  { value: 'unverified', label: '待核实 (信息不足)', dot: 'bg-amber-500' },
                  { value: 'rejected', label: '不采用 (已证伪或无价值)', dot: 'bg-stone-400' },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">内容摘要 / 关键发言</label>
            <textarea
              rows={3}
              placeholder="提取原视频或文章中的关键信息、时间码（如04:15处金句）或关键截图要点..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">使用备注与提示</label>
            <input
              type="text"
              placeholder="例如：可用作第一章转折画面"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg cursor-pointer transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white rounded-lg font-medium cursor-pointer transition-colors"
            >
              {editingSource ? '更新素材' : '添加素材'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
