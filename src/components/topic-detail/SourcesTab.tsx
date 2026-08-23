import React, { useState } from 'react';
import { Source, SourceType, VerificationStatus, PlatformType } from '../../types';
import { SourceTypeBadge, VerificationBadge, PlatformBadge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import {
  Plus,
  ExternalLink,
  Trash2,
  Edit2,
  Filter,
  CheckCircle2,
  AlertCircle,
  Video,
  FileCheck,
  Search,
  Copy,
  Check,
  Calendar,
  Sparkles,
  ArrowRight,
  X,
  HelpCircle,
} from 'lucide-react';

interface SourcesTabProps {
  topicId: string;
  sources: Source[];
  onSaveSource: (source: Partial<Source> & { topic_id: string; title: string }) => Promise<void>;
  onDeleteSource: (sourceId: string) => Promise<void>;
  onConvertToTimeline?: (source: Source) => Promise<void>;
}

export const SourcesTab: React.FC<SourcesTabProps> = ({
  topicId,
  sources,
  onSaveSource,
  onDeleteSource,
  onConvertToTimeline,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [filterType, setFilterType] = useState<SourceType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<VerificationStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [timelineConvertedId, setTimelineConvertedId] = useState<string | null>(null);
  const [smartPasteInput, setSmartPasteInput] = useState('');

  // Form State
  const [title, setTitle] = useState('');
  const [type, setType] = useState<SourceType>('fact');
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
    setType('fact');
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
    setType(s.type);
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

  const handleSmartParse = (rawText: string) => {
    if (!rawText.trim()) return;
    const urlMatch = rawText.match(/https?:\/\/[^\s]+/i);
    let extractedUrl = '';
    let cleanText = rawText;
    if (urlMatch) {
      extractedUrl = urlMatch[0];
      cleanText = rawText.replace(extractedUrl, '').trim();
      setUrl(extractedUrl);

      if (/bilibili\.com|b23\.tv/i.test(extractedUrl)) setPlatform('bilibili');
      else if (/douyin\.com|iesdouyin\.com/i.test(extractedUrl)) setPlatform('douyin');
      else if (/kuaishou\.com/i.test(extractedUrl)) setPlatform('kuaishou');
      else if (/weibo\.com|weibo\.cn/i.test(extractedUrl)) setPlatform('weibo');
      else if (/xiaohongshu\.com|xhslink\.com/i.test(extractedUrl)) setPlatform('xiaohongshu');
      else if (/weixin\.qq\.com|mp\.weixin/i.test(extractedUrl)) setPlatform('wechat');
      else if (/zhihu\.com/i.test(extractedUrl)) setPlatform('zhihu');
      else if (/youtube\.com|youtu\.be/i.test(extractedUrl)) setPlatform('youtube');
    }

    const cleanTitleCandidate = cleanText.replace(/^[【\[(（]?.*? [】\])）]?/, '').trim() || cleanText;
    if (cleanTitleCandidate) {
      setTitle(cleanTitleCandidate.slice(0, 80));
    }
    if (cleanText.length > 30) {
      setContent(cleanText);
    }
  };

  const handleQuickUpgradeToFact = async (s: Source) => {
    await onSaveSource({
      id: s.id,
      topic_id: topicId,
      title: s.title,
      type: 'fact',
      verification_status: 'confirmed',
    });
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
      type,
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
    if (filterType !== 'all' && s.type !== filterType) return false;
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

  const factCount = sources.filter((s) => s.type === 'fact').length;
  const clueCount = sources.filter((s) => s.type === 'clue').length;
  const materialCount = sources.filter((s) => s.type === 'material').length;

  return (
    <div className="py-6 space-y-6">
      {/* Header & Filter Bar */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white dark:bg-stone-900 p-5 rounded-xl border border-stone-200 dark:border-stone-800 shadow-subtle transition-colors">
        <div className="flex items-center gap-3 flex-wrap flex-1">
          {/* Real-time Search Input */}
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400 dark:text-stone-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="即时搜索标题、内容、备忘..."
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

          {/* Quick type pills */}
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              filterType === 'all'
                ? 'bg-stone-900 dark:bg-rose-600 text-white border-stone-900 dark:border-rose-600'
                : 'bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700'
            }`}
          >
            全部 ({sources.length})
          </button>
          <button
            onClick={() => setFilterType('fact')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              filterType === 'fact'
                ? 'bg-emerald-700 dark:bg-emerald-600 text-white border-emerald-700 dark:border-emerald-600'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-100 dark:hover:bg-emerald-950/70'
            }`}
          >
            ✓ 事实 ({factCount})
          </button>
          <button
            onClick={() => setFilterType('clue')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              filterType === 'clue'
                ? 'bg-amber-600 dark:bg-amber-600 text-white border-amber-600'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/60 hover:bg-amber-100 dark:hover:bg-amber-950/70'
            }`}
          >
            ? 线索 ({clueCount})
          </button>
          <button
            onClick={() => setFilterType('material')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              filterType === 'material'
                ? 'bg-blue-700 dark:bg-blue-600 text-white border-blue-700 dark:border-blue-600'
                : 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-900/60 hover:bg-blue-100 dark:hover:bg-blue-950/70'
            }`}
          >
            🎬 素材 ({materialCount})
          </button>

          <div className="h-5 w-px bg-stone-200 dark:bg-stone-700 mx-0.5 hidden sm:block" />

          {/* Verification Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as VerificationStatus | 'all')}
            className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-stone-400 dark:focus:border-stone-500 shadow-2xs transition-colors cursor-pointer"
          >
            <option value="all" className="dark:bg-stone-800 dark:text-stone-200">所有核实状态</option>
            <option value="confirmed" className="dark:bg-stone-800 dark:text-stone-200">✓ 已确认</option>
            <option value="unverified" className="dark:bg-stone-800 dark:text-stone-200">? 待核实</option>
            <option value="rejected" className="dark:bg-stone-800 dark:text-stone-200">✕ 不采用</option>
          </select>
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center gap-1.5 bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>添加资料 / 素材</span>
        </button>
      </div>

      {/* Sources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredSources.map((s) => (
          <div
            key={s.id}
            className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 space-y-3 shadow-subtle hover:shadow-card transition-all flex flex-col justify-between"
          >
            <div className="space-y-2.5">
              {/* Badges row & Quick actions */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <SourceTypeBadge type={s.type} />
                  <button
                    type="button"
                    onClick={() => handleCycleVerification(s)}
                    className="cursor-pointer transition-transform active:scale-95"
                    title="点击快捷切换核实状态 (已确认 -> 待核实 -> 不采用)"
                  >
                    <VerificationBadge status={s.verification_status} />
                  </button>
                  <PlatformBadge platform={s.platform} />
                </div>
                <div className="flex items-center gap-1">
                  {/* Quick Upgrade for Clues */}
                  {s.type === 'clue' && (
                    <button
                      onClick={() => handleQuickUpgradeToFact(s)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-800 transition-colors cursor-pointer mr-1"
                      title="线索已考证完毕，一键无弹窗升级为已核实事实"
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      <span>升级事实</span>
                    </button>
                  )}

                  <button
                    onClick={() => openEditModal(s)}
                    className="p-1 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 rounded hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer transition-colors"
                    title="编辑资料"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteSource(s.id)}
                    className="p-1 text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
                    title="删除资料"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Title */}
              <h4 className="text-base font-bold text-stone-900 dark:text-stone-100 leading-snug">{s.title}</h4>

              {/* Content / Summary */}
              {s.content && (
                <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed bg-stone-50 dark:bg-stone-800/60 p-2.5 rounded-lg border border-stone-100 dark:border-stone-800">
                  {s.content}
                </p>
              )}

              {/* Notes / Tips */}
              {s.notes && (
                <div className="text-xs text-stone-500 dark:text-stone-400 italic bg-amber-50/40 dark:bg-amber-950/20 p-2 rounded border border-amber-200/50 dark:border-amber-900/40">
                  💡 备忘：{s.notes}
                </div>
              )}
            </div>

            {/* Bottom Meta & Action buttons */}
            <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between flex-wrap gap-2 text-xs text-stone-400 dark:text-stone-500">
              <div className="flex items-center gap-3">
                {s.author && <span>作者: {s.author}</span>}
                {s.published_at && <span>发布: {s.published_at}</span>}

                {/* Convert to Timeline Event Button */}
                {onConvertToTimeline && (
                  <button
                    onClick={() => {
                      onConvertToTimeline(s);
                      setTimelineConvertedId(s.id);
                      setTimeout(() => setTimelineConvertedId(null), 2000);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-500 dark:text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                    title="一键将本条资料沉淀为故事时间线事件"
                  >
                    {timelineConvertedId === s.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">已转入时间线</span>
                      </>
                    ) : (
                      <>
                        <Calendar className="w-3.5 h-3.5" />
                        <span>转为时间线</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {s.url && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => copyUrl(s.id, s.url)}
                    className="hover:text-stone-700 dark:hover:text-stone-300 p-1 cursor-pointer"
                    title="复制链接"
                  >
                    {copiedId === s.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-medium hover:underline"
                  >
                    <span>打开来源</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}

        {filteredSources.length === 0 && (
          <div className="col-span-full p-12 text-center border-2 border-dashed border-stone-200 dark:border-stone-800 rounded-xl bg-white dark:bg-stone-900 text-stone-400 dark:text-stone-500">
            {searchQuery ? `未找到包含「${searchQuery}」的资料记录` : '暂无匹配的资料记录，点击右上角「添加资料」开始搜集证据与素材！'}
          </div>
        )}
      </div>

      {/* Add / Edit Source Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSource ? '编辑资料 / 素材' : '录入新资料 / 素材'}
        subtitle="明确区分事实、线索与素材，避免后期写稿将传闻与证据混淆"
        maxWidth="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Smart Paste / Parse helper */}
          {!editingSource && (
            <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900/50 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-rose-500" />
                  <span>智能粘贴识别（快速解析链接与标题）</span>
                </span>
                <span className="text-[10px] text-stone-500 dark:text-stone-400">支持 B站/抖音/快手/微博/知乎/公众号等</span>
              </div>
              <input
                type="text"
                value={smartPasteInput}
                onChange={(e) => {
                  setSmartPasteInput(e.target.value);
                  handleSmartParse(e.target.value);
                }}
                placeholder="直接粘贴含链接的整段分享文本或 URL，将自动填入下方字段..."
                className="w-full px-3 py-1.5 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-rose-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
              资料标题 <span className="text-rose-600">*</span>
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
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">资料类型</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as SourceType)}
                className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
              >
                <option value="fact">✓ 事实 (已找到确切证据)</option>
                <option value="clue">? 线索 (尚待验证的信息)</option>
                <option value="material">🎬 素材 (原视频/直播切片/截图)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">可信度状态</label>
              <select
                value={verificationStatus}
                onChange={(e) => setVerificationStatus(e.target.value as VerificationStatus)}
                className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
              >
                <option value="confirmed">已确认 (多方可靠来源)</option>
                <option value="unverified">待核实 (信息不足)</option>
                <option value="rejected">不采用 (已证伪或无价值)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">来源平台</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as PlatformType)}
                className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
              >
                <option value="bilibili">Bilibili</option>
                <option value="douyin">抖音</option>
                <option value="kuaishou">快手</option>
                <option value="weibo">微博</option>
                <option value="xiaohongshu">小红书</option>
                <option value="wechat">微信公众号</option>
                <option value="zhihu">知乎</option>
                <option value="youtube">YouTube</option>
                <option value="news">新闻媒体</option>
                <option value="live">直播切片</option>
                <option value="other">其他</option>
              </select>
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
              {editingSource ? '更新资料' : '添加资料'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
