import React, { useState, useEffect } from 'react';
import { Topic, Person, Tag } from '../../types';
import { ScoreRatingDial } from './ScoreRatingDial';
import { Modal } from '../ui/Modal';
import {
  Save,
  Sparkles,
  User,
  Plus,
  ArrowRight,
  ListOrdered,
  Clock,
  Lightbulb,
  Check,
  Tag as TagIcon,
  X,
  UserPlus
} from 'lucide-react';

interface OverviewTabProps {
  topic: Topic;
  onUpdateTopic: (updates: Partial<Topic>) => Promise<void>;
  allPeople: Person[];
  allTags: Tag[];
  onSavePerson?: (personData: Partial<Person> & { name: string }) => Promise<Person>;
  onSaveTag?: (tagName: string, color?: string) => Promise<Tag>;
  onDeleteTag?: (tagId: string) => Promise<void>;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  topic,
  onUpdateTopic,
  allPeople,
  allTags,
  onSavePerson,
  onSaveTag,
  onDeleteTag,
}) => {
  const [summary, setSummary] = useState(topic.summary || '');
  const [hook, setHook] = useState(topic.hook || '');
  const [whyNow, setWhyNow] = useState(topic.why_now || '');
  const [storyline, setStoryline] = useState(topic.storyline || '');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Tag creation state
  const [newTagName, setNewTagName] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);

  // Person quick creation modal state
  const [isAddPersonModalOpen, setIsAddPersonModalOpen] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonIdentity, setNewPersonIdentity] = useState('');
  const [newPersonAliases, setNewPersonAliases] = useState('');
  const [newPersonAccounts, setNewPersonAccounts] = useState('');
  const [newPersonDesc, setNewPersonDesc] = useState('');

  useEffect(() => {
    setSummary(topic.summary || '');
    setHook(topic.hook || '');
    setWhyNow(topic.why_now || '');
    setStoryline(topic.storyline || '');
  }, [topic]);

  const handleSave = async () => {
    setIsSaving(true);
    await onUpdateTopic({
      summary: summary.trim(),
      hook: hook.trim(),
      why_now: whyNow.trim(),
      storyline: storyline.trim(),
    });
    setIsSaving(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const togglePerson = async (person: Person) => {
    const currentPeople = topic.people || [];
    const exists = currentPeople.some((p) => p.id === person.id);
    const updatedPeople = exists
      ? currentPeople.filter((p) => p.id !== person.id)
      : [...currentPeople, person];
    await onUpdateTopic({ people: updatedPeople });
  };

  const handleQuickCreatePerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPersonName.trim()) return;

    if (onSavePerson) {
      const created = await onSavePerson({
        name: newPersonName.trim(),
        identity: newPersonIdentity.trim(),
        aliases: newPersonAliases.trim(),
        platform_accounts: newPersonAccounts.trim(),
        description: newPersonDesc.trim(),
      });
      // Automatically attach to current topic
      const currentPeople = topic.people || [];
      if (!currentPeople.some((p) => p.id === created.id)) {
        await onUpdateTopic({ people: [...currentPeople, created] });
      }
    }

    // Reset form
    setNewPersonName('');
    setNewPersonIdentity('');
    setNewPersonAliases('');
    setNewPersonAccounts('');
    setNewPersonDesc('');
    setIsAddPersonModalOpen(false);
  };

  const toggleTag = async (tag: Tag) => {
    const currentTags = topic.tags || [];
    const exists = currentTags.some((t) => t.id === tag.id);
    const updatedTags = exists
      ? currentTags.filter((t) => t.id !== tag.id)
      : [...currentTags, tag];
    await onUpdateTopic({ tags: updatedTags });
  };

  const handleCreateAndAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTagName.trim().replace(/^#/, '');
    if (!trimmed) return;

    // Check if tag already exists in allTags
    let matchedTag = allTags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (!matchedTag && onSaveTag) {
      matchedTag = await onSaveTag(trimmed);
    }

    if (matchedTag) {
      const currentTags = topic.tags || [];
      if (!currentTags.some((t) => t.id === matchedTag!.id)) {
        await onUpdateTopic({ tags: [...currentTags, matchedTag] });
      }
    }

    setNewTagName('');
    setIsAddingTag(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [summary, hook, whyNow, storyline]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 py-4">
      {/* Left Column: Core Narrative Components & Tags (1/2) */}
      <div className="space-y-4">
        {/* 1. 一句话选题 */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-4 sm:p-5 space-y-2.5 shadow-subtle transition-colors">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              一句话选题 (Core Concept)
            </label>
            <span className="text-xs text-stone-400 dark:text-stone-500">核心看点与反转</span>
          </div>
          <textarea
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="例如：一个屡次减肥失败的网红，再一次试图证明自己，最后却被峨眉山滑竿抬了下来。"
            className="w-full text-sm text-stone-800 dark:text-stone-100 bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 rounded-xl p-3 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 dark:focus:border-rose-500 focus:outline-none transition-colors"
          />
        </div>

        {/* 2. 观众为什么看 (Hook / 荒诞反差) */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-4 sm:p-5 space-y-2.5 shadow-subtle transition-colors">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-rose-600 dark:text-rose-500" />
              观众为什么看 (Hook 与戏剧反差)
            </label>
            <span className="text-xs text-stone-400 dark:text-stone-500">核心冲突、荒诞感、人性的讽刺点</span>
          </div>
          <textarea
            rows={3}
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder="观众预期 vs 实际现实：前期的豪言壮语与结尾躺在滑竿上的巨大反差，揭示流量时代的浮躁人设..."
            className="w-full text-sm text-stone-800 dark:text-stone-100 bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 rounded-xl p-3 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 dark:focus:border-rose-500 focus:outline-none transition-colors"
          />
        </div>

        {/* 3. 分类标签 Tag Selector & Editor (从右列移入左列) */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-4 sm:p-5 space-y-4 shadow-subtle transition-colors">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
              <TagIcon className="w-4 h-4 text-stone-700 dark:text-stone-300" />
              <span>分类标签</span>
              <span className="text-xs bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-bold px-1.5 py-0.2 rounded-full">
                {topic.tags?.length || 0}
              </span>
            </h4>
            <button
              onClick={() => setIsAddingTag((prev) => !prev)}
              className="flex items-center gap-1 text-xs text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 font-semibold bg-stone-100 dark:bg-stone-800 hover:bg-stone-200/80 dark:hover:bg-stone-700 px-2 py-1 rounded-lg border border-stone-200 dark:border-stone-700 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAddingTag ? '收起' : '新建标签'}</span>
            </button>
          </div>

          {/* New Tag Input Form */}
          {isAddingTag && (
            <form onSubmit={handleCreateAndAddTag} className="flex items-center gap-1.5 p-2 bg-stone-50 dark:bg-stone-800 rounded-lg border border-stone-200 dark:border-stone-700">
              <input
                type="text"
                autoFocus
                placeholder="输入新标签名称 (如: 探店)..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="flex-1 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded px-2.5 py-1 text-xs text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-900 dark:focus:border-stone-500"
              />
              <button
                type="submit"
                disabled={!newTagName.trim()}
                className="px-2.5 py-1 bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white rounded text-xs font-semibold disabled:opacity-40 transition-colors cursor-pointer"
              >
                添加
              </button>
            </form>
          )}

          {/* Active Tags on this Topic */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-stone-400 dark:text-stone-500">已应用标签：</div>
            <div className="flex flex-wrap gap-1.5 min-h-[30px]">
              {topic.tags && topic.tags.length > 0 ? (
                topic.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-stone-900 dark:bg-stone-800 text-white rounded-md text-xs font-semibold shadow-2xs"
                  >
                    <span>#{tag.name}</span>
                    <button
                      onClick={() => toggleTag(tag)}
                      title="移除此标签"
                      className="text-stone-400 hover:text-red-300 ml-0.5 p-0.5 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              ) : (
                <div className="text-xs text-stone-400 dark:text-stone-500 italic bg-stone-50 dark:bg-stone-800/60 p-2 rounded-lg border border-stone-200/60 dark:border-stone-800 w-full text-center">
                  暂未添加分类标签
                </div>
              )}
            </div>
          </div>

          {/* Quick toggle from all tags */}
          <div className="pt-3 border-t border-stone-100 dark:border-stone-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">可用标签库：</span>
              <span className="text-[11px] text-stone-400 dark:text-stone-500 font-mono">共 {allTags.length} 个</span>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
              {allTags.map((tag) => {
                const isSelected = topic.tags?.some((t) => t.id === tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag)}
                    className={`px-2.5 py-1 rounded-md text-xs transition-all border flex items-center gap-1 cursor-pointer ${
                      isSelected
                        ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800 font-semibold'
                        : 'bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 hover:text-stone-900 dark:hover:text-stone-100'
                    }`}
                  >
                    <span>{isSelected ? '✓' : '#'}</span>
                    <span>{tag.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 4. 为什么现在做 (Why Now / 时机) */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-4 sm:p-5 space-y-2.5 shadow-subtle transition-colors">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              为什么现在做 (Why Now / 选题时机)
            </label>
            <span className="text-xs text-stone-400 dark:text-stone-500">热点时机与独特视角</span>
          </div>
          <textarea
            rows={2}
            value={whyNow}
            onChange={(e) => setWhyNow(e.target.value)}
            placeholder="事件发酵已达高潮，评论区开始出现深度解构声音，急需一部完整叙事长视频进行系统梳理..."
            className="w-full text-sm text-stone-800 dark:text-stone-100 bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 rounded-xl p-3 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 dark:focus:border-rose-500 focus:outline-none transition-colors"
          />
        </div>

        {/* 5. 故事主线流程 (Storyline) */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-4 sm:p-5 space-y-2.5 shadow-subtle transition-colors">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
              <ListOrdered className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              故事主线与阶段推演 (Storyline)
            </label>
            <span className="text-xs text-stone-400 dark:text-stone-500">用箭头 "→" 分隔阶段因果</span>
          </div>
          <textarea
            rows={4}
            value={storyline}
            onChange={(e) => setStoryline(e.target.value)}
            placeholder="起因：立下誓言，豪言壮语 → 发展：直播登山，渐露疲态 → 高潮：体力透支，滑竿出场 → 结尾：网络狂欢与荒诞反思"
            className="w-full text-sm text-stone-800 dark:text-stone-100 bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 rounded-xl p-3 font-mono placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 dark:focus:border-rose-500 focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Right Column: Score Rating Dial & People & Actions (1/2) */}
      <div className="space-y-4">
        {/* 5-Dimension Score Dial */}
        <ScoreRatingDial topic={topic} onUpdateScores={onUpdateTopic} />

        {/* 关联人物 Entity Selector */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-4 sm:p-5 space-y-4 shadow-subtle transition-colors">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
              <User className="w-4 h-4 text-stone-700 dark:text-stone-300" />
              <span>关联人物实体</span>
              <span className="text-xs bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-bold px-1.5 py-0.2 rounded-full">
                {topic.people?.length || 0}
              </span>
            </h4>
            <button
              onClick={() => setIsAddPersonModalOpen(true)}
              className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 font-semibold bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-950/70 px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer"
              title="新建人物档案并关联到本选题"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>新建人物</span>
            </button>
          </div>

          {/* Active Characters in this Topic */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-stone-400 dark:text-stone-500">已关联到本选题的人物：</div>
            <div className="flex flex-wrap gap-1.5 min-h-[32px]">
              {topic.people && topic.people.length > 0 ? (
                topic.people.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-stone-900 dark:bg-stone-800 text-white rounded-lg text-xs font-semibold shadow-2xs group"
                  >
                    <span>👤 {p.name}</span>
                    {p.identity && (
                      <span className="text-[10px] text-stone-300 dark:text-stone-400 font-normal bg-stone-800 dark:bg-stone-700 px-1 py-0.2 rounded">
                        {p.identity}
                      </span>
                    )}
                    <button
                      onClick={() => togglePerson(p)}
                      title="从本选题移出"
                      className="text-stone-400 hover:text-red-300 ml-1 p-0.5 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              ) : (
                <div className="text-xs text-stone-400 dark:text-stone-500 italic bg-stone-50 dark:bg-stone-800/60 p-2 rounded-lg border border-stone-200/60 dark:border-stone-800 w-full text-center">
                  暂未关联人物，可在下方快速勾选或新建
                </div>
              )}
            </div>
          </div>

          {/* Quick toggle from all people */}
          <div className="pt-3 border-t border-stone-100 dark:border-stone-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">从全局人物库快速选择：</span>
              <span className="text-[11px] text-stone-400 dark:text-stone-500 font-mono">共 {allPeople.length} 人</span>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
              {allPeople.map((p) => {
                const isSelected = topic.people?.some((tp) => tp.id === p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePerson(p)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800 font-semibold shadow-2xs'
                        : 'bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 hover:text-stone-900 dark:hover:text-stone-100'
                    }`}
                  >
                    <span>{isSelected ? '✓' : '+'}</span>
                    <span>{p.name}</span>
                    {p.identity && (
                      <span className="text-[10px] opacity-70">({p.identity})</span>
                    )}
                  </button>
                );
              })}

              {allPeople.length === 0 && (
                <div className="text-xs text-stone-400 dark:text-stone-500 p-2">人物库暂无人物，请点击上方「新建人物」添加！</div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Right Save Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {savedSuccess && (
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 animate-in fade-in duration-150">
              <Check className="w-4 h-4" /> 已保存
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 shadow-2xs hover:shadow-xs disabled:opacity-50 cursor-pointer"
            title="保存概览文本设定 (Ctrl+S / Cmd+S)"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? '正在保存...' : '保存'}</span>
          </button>
        </div>
      </div>

      {/* Quick Add Person Modal */}
      <Modal
        isOpen={isAddPersonModalOpen}
        onClose={() => setIsAddPersonModalOpen(false)}
        title="新建人物档案并关联到本选题"
        subtitle="沉淀人物信息，可在此选题及后续视频中重复使用"
      >
        <form onSubmit={handleQuickCreatePerson} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-800">
              人物姓名 / 核心昵称 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="例如：大胃袋良子"
              value={newPersonName}
              onChange={(e) => setNewPersonName(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm focus:bg-white focus:border-stone-900 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-stone-800">核心身份 / 标签</label>
              <input
                type="text"
                placeholder="例如：吃播网红 / 探店主播"
                value={newPersonIdentity}
                onChange={(e) => setNewPersonIdentity(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm focus:bg-white focus:border-stone-900 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-stone-800">别名 / 外号 / 曾用名</label>
              <input
                type="text"
                placeholder="例如：良子、峨眉山战神"
                value={newPersonAliases}
                onChange={(e) => setNewPersonAliases(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm focus:bg-white focus:border-stone-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-800">主要平台账号 / 粉丝量</label>
            <input
              type="text"
              placeholder="例如：抖音 @大胃袋良子 (120w)、B站同名"
              value={newPersonAccounts}
              onChange={(e) => setNewPersonAccounts(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm focus:bg-white focus:border-stone-900 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-800">人物背景简介 / 核心特质</label>
            <textarea
              rows={3}
              placeholder="简要描述该人物的背景经历、公众形象、性格特质..."
              value={newPersonDesc}
              onChange={(e) => setNewPersonDesc(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm focus:bg-white focus:border-stone-900 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
            <button
              type="button"
              onClick={() => setIsAddPersonModalOpen(false)}
              className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-lg"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!newPersonName.trim()}
              className="px-5 py-2 text-sm bg-stone-900 hover:bg-stone-800 text-white rounded-lg font-semibold disabled:opacity-50"
            >
              创建并引入本期
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
