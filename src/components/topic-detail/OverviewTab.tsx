import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Topic, Person, Tag } from '../../types';
import { ScoreRatingDial } from './ScoreRatingDial';
import { NextActionDialog } from './NextActionDialog';
import { Modal } from '../ui/Modal';
import { DateInput } from '../ui/DateInput';
import { useToast } from '../ui/Toast';
import { getNextActionAgeDays, getNextActionWarning } from '../../lib/topicMetrics';
import {
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
  UserPlus,
  Eye,
  Edit3,
  Zap,
  CheckCircle2,
  FileText,
  Calendar,
  CalendarDays,
  Layers,
  ChevronDown,
  Flame,
  Clapperboard
} from 'lucide-react';

interface OverviewTabProps {
  topic: Topic;
  onUpdateTopic: (updates: Partial<Topic>) => Promise<void>;
  allPeople: Person[];
  allTags: Tag[];
  onSavePerson?: (personData: Partial<Person> & { name: string }) => Promise<Person>;
  onSaveTag?: (tagName: string, color?: string) => Promise<Tag>;
  onDeleteTag?: (tagId: string) => Promise<void>;
  onNavigateToTab?: (tab: 'overview' | 'sources' | 'timeline' | 'people' | 'script') => void;
  onInjectOutlineIntoDraft?: (outlineHtml: string) => Promise<void>;
  onConvertStorylineToTimeline?: (steps: Array<{ title: string; desc: string }>) => Promise<void>;
}

interface FourActs {
  qi: string;    // 起·铺垫与起因
  cheng: string; // 承·发酵与升级
  zhuan: string; // 转·高潮与名场面
  he: string;    // 合·收尾与反思
}

function parseStorylineToActs(storyline: string): FourActs {
  if (!storyline.trim()) {
    return { qi: '', cheng: '', zhuan: '', he: '' };
  }

  // 1. Try match by 【起...】 【承...】 【转...】 【合...】
  const qiMatch = storyline.match(/【起[^】]*】\s*([^\n【]*)/);
  const chengMatch = storyline.match(/【承[^】]*】\s*([^\n【]*)/);
  const zhuanMatch = storyline.match(/【转[^】]*】\s*([^\n【]*)/);
  const heMatch = storyline.match(/【合[^】]*】\s*([^\n【]*)/);

  if (qiMatch || chengMatch || zhuanMatch || heMatch) {
    return {
      qi: qiMatch ? qiMatch[1].trim() : '',
      cheng: chengMatch ? chengMatch[1].trim() : '',
      zhuan: zhuanMatch ? zhuanMatch[1].trim() : '',
      he: heMatch ? heMatch[1].trim() : '',
    };
  }

  // 2. Fallback: split by arrows or newlines
  const parts = storyline
    .split(/(?:→|->|\n)/g)
    .map((p) => p.replace(/^第[一二三四1-4]幕[:：]\s*/, '').trim())
    .filter(Boolean);

  return {
    qi: parts[0] || '',
    cheng: parts[1] || '',
    zhuan: parts[2] || '',
    he: parts.slice(3).join(' ') || '',
  };
}

function serializeActsToStoryline(acts: FourActs): string {
  const parts: string[] = [];
  if (acts.qi.trim()) parts.push(`【起·铺垫】${acts.qi.trim()}`);
  if (acts.cheng.trim()) parts.push(`【承·发酵】${acts.cheng.trim()}`);
  if (acts.zhuan.trim()) parts.push(`【转·反转】${acts.zhuan.trim()}`);
  if (acts.he.trim()) parts.push(`【合·反思】${acts.he.trim()}`);
  return parts.join('\n');
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  topic,
  onUpdateTopic,
  allPeople,
  allTags,
  onSavePerson,
  onSaveTag,
  onNavigateToTab,
  onInjectOutlineIntoDraft,
  onConvertStorylineToTimeline,
}) => {
  const [summary, setSummary] = useState(topic.summary || '');
  const [hook, setHook] = useState(topic.hook || '');
  const [whyNow, setWhyNow] = useState(topic.why_now || '');
  const [storyline, setStoryline] = useState(topic.storyline || '');
  const [acts, setActs] = useState<FourActs>(() => parseStorylineToActs(topic.storyline || ''));
  const [targetPublishDate, setTargetPublishDate] = useState(topic.target_publish_date || '');
  const [deadline, setDeadline] = useState(topic.deadline || '');
  
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [storylineMode, setStorylineMode] = useState<'acts' | 'raw'>('acts');
  const [isWhyNowExpanded, setIsWhyNowExpanded] = useState(Boolean(topic.why_now));
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<string | null>(null);
  const { showToast } = useToast();

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

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
  }, []);

  const actionDays = getNextActionAgeDays(topic);
  const actionWarning = getNextActionWarning(topic);

  // Sync state when topic prop changes from outside
  useEffect(() => {
    setSummary(topic.summary || '');
    setHook(topic.hook || '');
    setWhyNow(topic.why_now || '');
    setStoryline(topic.storyline || '');
    setActs(parseStorylineToActs(topic.storyline || ''));
    setTargetPublishDate(topic.target_publish_date || '');
    setDeadline(topic.deadline || '');
  }, [topic.id, topic.target_publish_date, topic.deadline]);

  // Debounced auto-save function
  const triggerAutoSave = (updates: Partial<Topic>) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setSaveStatus('saving');
    debounceTimerRef.current = setTimeout(async () => {
      try {
        await onUpdateTopic(updates);
        setSaveStatus('saved');
        statusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2500);
      } catch {
        setSaveStatus('error');
      }
    }, 800);
  };

  // Handle act change in 4-act mode
  const handleActChange = (key: keyof FourActs, value: string) => {
    const updated = { ...acts, [key]: value };
    setActs(updated);
    const serialized = serializeActsToStoryline(updated);
    setStoryline(serialized);
    triggerAutoSave({
      storyline: serialized,
      summary: summary.trim(),
      hook: hook.trim(),
      why_now: whyNow.trim(),
    });
  };

  // Handle raw storyline edit
  const handleRawStorylineChange = (value: string) => {
    setStoryline(value);
    setActs(parseStorylineToActs(value));
    triggerAutoSave({
      storyline: value.trim(),
      summary: summary.trim(),
      hook: hook.trim(),
      why_now: whyNow.trim(),
    });
  };

  // Immediate save on blur or shortcut
  const handleImmediateSave = async () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setSaveStatus('saving');
    try {
      await onUpdateTopic({
        summary: summary.trim(),
        hook: hook.trim(),
        why_now: whyNow.trim(),
        storyline: storyline.trim(),
      });
      setSaveStatus('saved');
      statusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      setSaveStatus('error');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleImmediateSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [summary, hook, whyNow, storyline]);

  // Tag & Person pickers
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
      const currentPeople = topic.people || [];
      if (!currentPeople.some((p) => p.id === created.id)) {
        await onUpdateTopic({ people: [...currentPeople, created] });
      }
    }

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

  // Pipeline Bridge 1: Inject Four-Act Outline into Draft
  const handleInjectIntoDraft = async () => {
    if (!onInjectOutlineIntoDraft) return;
    const outlineHtml = `
      <h2>🎬 第一幕：起因与铺垫</h2>
      <p>${acts.qi || '【铺垫前期人设与平静状态】'}</p>
      <p></p>
      <h2>🔥 第二幕：发酵与失控</h2>
      <p>${acts.cheng || '【矛盾逐渐激化，事情开始失控】'}</p>
      <p></p>
      <h2>💥 第三幕：高潮与反转（核心名场面）</h2>
      <p>${acts.zhuan || '【现实重拳出击，核心名场面爆发】'}</p>
      <p></p>
      <h2>🎭 第四幕：收尾与荒诞反思</h2>
      <p>${acts.he || '【闹剧收场，余味反思与升华】'}</p>
    `;
    setBridgeStatus('已成功将四幕骨架注入文案草稿并跳转！');
    await onInjectOutlineIntoDraft(outlineHtml);
  };

  // Pipeline Bridge 2: Convert Four-Act Outline into Timeline Events
  const handleConvertToTimeline = async () => {
    if (!onConvertStorylineToTimeline) return;
    const steps: Array<{ title: string; desc: string }> = [
      { title: '第一幕：起因与铺垫', desc: acts.qi || '前期背景铺垫' },
      { title: '第二幕：发酵与失控', desc: acts.cheng || '矛盾升级失控' },
      { title: '第三幕：反转与名场面', desc: acts.zhuan || '核心戏剧名场面' },
      { title: '第四幕：收尾与反思', desc: acts.he || '结局反思' },
    ].filter((s) => Boolean(s.desc));

    if (steps.length === 0) {
      showToast({ message: '请先在四幕大纲中填写至少一个阶段的内容！', tone: 'info' });
      return;
    }

    setBridgeStatus('已将四幕节点流转为时间线事件！');
    await onConvertStorylineToTimeline(steps);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 py-4 items-start">
      {/* Left Main Column: Pitch & Four-Act Story Blueprint (7 / 12) */}
      <div className="xl:col-span-7 space-y-6">
        {/* 1. 核心看点与戏剧反差卡 (The Pitch & Hook Card) */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 p-5 space-y-4 shadow-2xs transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <Flame className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">核心看点与戏剧反差</h2>
              </div>
            </div>

            {/* Auto-save Status Chip */}
            <div className="flex items-center gap-1.5 text-[11px] font-medium select-none">
              {saveStatus === 'saving' && (
                <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                  <span>同步中…</span>
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  <span>已自动同步</span>
                </span>
              )}
              {saveStatus === 'idle' && (
                <span className="text-stone-500 dark:text-stone-400">自动保存已就绪</span>
              )}
              {saveStatus === 'error' && (
                <span className="text-red-600 dark:text-red-400">保存失败，请重试</span>
              )}
            </div>
          </div>

          {/* 一句话故事概念 (Core Concept) */}
          <div className="space-y-1.5">
            <label htmlFor="overview-summary" className="block text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
              <Lightbulb aria-hidden="true" className="w-3.5 h-3.5 text-amber-500" />
              <span>一句话看点 (Core Concept)</span>
            </label>
            <textarea
              id="overview-summary"
              name="summary"
              autoComplete="off"
              rows={2}
              value={summary}
              onChange={(e) => {
                setSummary(e.target.value);
                triggerAutoSave({ summary: e.target.value, hook, why_now: whyNow, storyline });
              }}
              onBlur={handleImmediateSave}
              placeholder="例如：一个屡次减肥失败的网红，再一次试图证明自己，最后却被峨眉山滑竿抬了下来。"
              className="w-full text-sm text-stone-800 dark:text-stone-100 bg-stone-500/[0.03] dark:bg-stone-800/60 border border-stone-200/60 dark:border-stone-700/60 rounded-xl p-3 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 dark:focus:border-rose-500 focus:outline-none transition-colors"
            />
          </div>

          {/* 戏剧反差与核心钩子 (Hook & Tension) */}
          <div className="space-y-1.5">
            <label htmlFor="overview-hook" className="block text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
              <Sparkles aria-hidden="true" className="w-3.5 h-3.5 text-rose-500" />
              <span>戏剧反差与讽刺钩子 (Hook & Contrast)</span>
            </label>
            <textarea
              id="overview-hook"
              name="hook"
              autoComplete="off"
              rows={3}
              value={hook}
              onChange={(e) => {
                setHook(e.target.value);
                triggerAutoSave({ hook: e.target.value, summary, why_now: whyNow, storyline });
              }}
              onBlur={handleImmediateSave}
              placeholder="观众预期 vs 实际现实：前期的豪言壮语与结尾躺在滑竿上的巨大反差，揭示流量时代嘴硬人设与现实生活的荒诞错位..."
              className="w-full text-sm text-stone-800 dark:text-stone-100 bg-stone-500/[0.03] dark:bg-stone-800/60 border border-stone-200/60 dark:border-stone-700/60 rounded-xl p-3 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 dark:focus:border-rose-500 focus:outline-none transition-colors"
            />
          </div>

          {/* 可折叠：当下时机与爆发点 (Why Now) */}
          <div className="border-t border-stone-100 dark:border-stone-800/80 pt-3">
            <button
              type="button"
              onClick={() => setIsWhyNowExpanded(!isWhyNowExpanded)}
              className="w-full flex items-center justify-between text-xs font-semibold text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 cursor-pointer"
            >
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-500" />
                <span>为什么现在做 / 传播时机 (Why Now)</span>
                {whyNow && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
              </div>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isWhyNowExpanded ? 'rotate-180' : ''}`} />
            </button>

            {isWhyNowExpanded && (
              <div className="mt-2.5 space-y-1">
                <textarea
                  id="overview-why-now"
                  name="why_now"
                  aria-label="为什么现在做 / 传播时机"
                  autoComplete="off"
                  rows={2}
                  value={whyNow}
                  onChange={(e) => {
                    setWhyNow(e.target.value);
                    triggerAutoSave({ why_now: e.target.value, summary, hook, storyline });
                  }}
                  onBlur={handleImmediateSave}
                  placeholder="热点发酵已达高潮，评论区深度解构声音激增，正适合一部系统叙事长视频建立认知壁垒..."
                  className="w-full text-xs text-stone-800 dark:text-stone-100 bg-stone-500/[0.03] dark:bg-stone-800/60 border border-stone-200/60 dark:border-stone-700/60 rounded-xl p-3 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 dark:focus:border-rose-500 focus:outline-none transition-colors"
                />
              </div>
            )}
          </div>
        </div>

        {/* 2. 起承转合四幕故事骨架工作台 (Four-Act Narrative Blueprint) */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 p-5 space-y-4 shadow-2xs transition-colors">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Clapperboard className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">起承转合四幕故事骨架</h3>
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 p-0.5 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setStorylineMode('acts')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  storylineMode === 'acts'
                    ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-2xs'
                    : 'text-stone-500 dark:text-stone-400 hover:text-stone-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>四幕卡片</span>
              </button>
              <button
                type="button"
                onClick={() => setStorylineMode('raw')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  storylineMode === 'raw'
                    ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-2xs'
                    : 'text-stone-500 dark:text-stone-400 hover:text-stone-900'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>文本模式</span>
              </button>
            </div>
          </div>

          {/* Four-Act Interactive Cards */}
          {storylineMode === 'acts' ? (
            <div className="space-y-3">
              {/* Act 1: 起 */}
              <div className="rounded-xl border border-stone-200/60 dark:border-stone-800 bg-stone-500/[0.02] dark:bg-stone-800/30 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-400">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-mono text-[11px]">
                      1
                    </span>
                    <span>🎬 第一幕【起 · 铺垫与暗涌】</span>
                  </div>
                  <span className="text-[10px] text-stone-400 font-normal">人物人设 / 起因交代 / 平静铺垫</span>
                </div>
                <textarea
                  aria-label="第一幕：起，铺垫与暗涌"
                  name="storyline_qi"
                  rows={2}
                  value={acts.qi}
                  onChange={(e) => handleActChange('qi', e.target.value)}
                  onBlur={handleImmediateSave}
                  placeholder="交代主角背景人设、立下 flag、前期豪言壮语与暗涌..."
                  className="w-full text-xs text-stone-800 dark:text-stone-100 bg-white dark:bg-stone-800 border border-stone-200/60 dark:border-stone-700 rounded-lg p-2.5 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Act 2: 承 */}
              <div className="rounded-xl border border-stone-200/60 dark:border-stone-800 bg-stone-500/[0.02] dark:bg-stone-800/30 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-blue-800 dark:text-blue-400">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-blue-500/15 text-blue-700 dark:text-blue-300 flex items-center justify-center font-mono text-[11px]">
                      2
                    </span>
                    <span>🔥 第二幕【承 · 发酵与失控】</span>
                  </div>
                  <span className="text-[10px] text-stone-400 font-normal">阻碍出现 / 嘴硬硬撑 / 舆论发酵</span>
                </div>
                <textarea
                  aria-label="第二幕：承，发酵与失控"
                  name="storyline_cheng"
                  rows={2}
                  value={acts.cheng}
                  onChange={(e) => handleActChange('cheng', e.target.value)}
                  onBlur={handleImmediateSave}
                  placeholder="事情逐渐失控，体力透支但继续死撑，评论区开始围观..."
                  className="w-full text-xs text-stone-800 dark:text-stone-100 bg-white dark:bg-stone-800 border border-stone-200/60 dark:border-stone-700 rounded-lg p-2.5 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Act 3: 转 */}
              <div className="rounded-xl border border-stone-200/60 dark:border-stone-800 bg-stone-500/[0.02] dark:bg-stone-800/30 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-rose-800 dark:text-rose-400">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 flex items-center justify-center font-mono text-[11px]">
                      3
                    </span>
                    <span>💥 第三幕【转 · 反转与核心名场面】</span>
                  </div>
                  <span className="text-[10px] text-stone-400 font-normal">高潮爆发 / 人设崩塌 / 滑竿名场面</span>
                </div>
                <textarea
                  aria-label="第三幕：转，反转与核心名场面"
                  name="storyline_zhuan"
                  rows={2}
                  value={acts.zhuan}
                  onChange={(e) => handleActChange('zhuan', e.target.value)}
                  onBlur={handleImmediateSave}
                  placeholder="现实啪啪打脸，核心荒诞名场面出场，全网狂欢与戏剧高潮..."
                  className="w-full text-xs text-stone-800 dark:text-stone-100 bg-white dark:bg-stone-800 border border-stone-200/60 dark:border-stone-700 rounded-lg p-2.5 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Act 4: 合 */}
              <div className="rounded-xl border border-stone-200/60 dark:border-stone-800 bg-stone-500/[0.02] dark:bg-stone-800/30 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-purple-800 dark:text-purple-400">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-purple-500/15 text-purple-700 dark:text-purple-300 flex items-center justify-center font-mono text-[11px]">
                      4
                    </span>
                    <span>🎭 第四幕【合 · 收尾与荒诞反思】</span>
                  </div>
                  <span className="text-[10px] text-stone-400 font-normal">闹剧落幕 / 时代讽刺 / 升华留白</span>
                </div>
                <textarea
                  aria-label="第四幕：合，收尾与荒诞反思"
                  name="storyline_he"
                  rows={2}
                  value={acts.he}
                  onChange={(e) => handleActChange('he', e.target.value)}
                  onBlur={handleImmediateSave}
                  placeholder="结局收尾，揭示流量狂欢后的人性讽刺与深层反思..."
                  className="w-full text-xs text-stone-800 dark:text-stone-100 bg-white dark:bg-stone-800 border border-stone-200/60 dark:border-stone-700 rounded-lg p-2.5 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                aria-label="起承转合故事骨架"
                name="storyline"
                rows={6}
                value={storyline}
                onChange={(e) => handleRawStorylineChange(e.target.value)}
                onBlur={handleImmediateSave}
                placeholder="【起·铺垫】起因人设 → 【承·发酵】矛盾升级 → 【转·反转】滑竿出场名场面 → 【合·反思】结局与讽刺"
                className="w-full text-xs text-stone-800 dark:text-stone-100 bg-stone-500/[0.03] dark:bg-stone-800/60 border border-stone-200/60 dark:border-stone-700/60 rounded-xl p-3.5 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 dark:focus:border-rose-500 focus:outline-none transition-colors"
              />
              <p className="text-[11px] text-stone-400">
                提示：支持使用 <code>【起...】</code> 标签或 <code>→</code> 连接各幕。
              </p>
            </div>
          )}

          {/* Production Pipeline Bridges */}
          <div className="border-t border-stone-100 dark:border-stone-800/80 pt-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {onInjectOutlineIntoDraft && (
                <button
                  type="button"
                  onClick={handleInjectIntoDraft}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-[0.98]"
                  title="将四幕大纲转为分幕结构直接注入文案编辑器，开启写稿"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>🚀 导入文案草稿直接写稿</span>
                </button>
              )}

              {onConvertStorylineToTimeline && (
                <button
                  type="button"
                  onClick={handleConvertToTimeline}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200/80 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 text-xs font-semibold transition-colors cursor-pointer"
                  title="将四幕拆分为时间线节点，辅助梳理事件先后顺序"
                >
                  <Calendar className="w-3.5 h-3.5 text-stone-500" />
                  <span>⚡ 生成时间线事件</span>
                </button>
              )}
            </div>

            {bridgeStatus && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold animate-in fade-in duration-150">
                {bridgeStatus}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Production Cockpit, Diagnostic Dial & Entities (5 / 12) */}
      <div className="xl:col-span-5 space-y-6">
        {/* 1. 生产节奏与排期驾驶舱 (Production Rhythm Cockpit) */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 p-5 space-y-4 shadow-2xs transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <Zap className="w-4 h-4 fill-rose-500/20" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100">生产节奏与排期驾驶舱</h4>
              </div>
            </div>
            {targetPublishDate && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300">
                定档 <time dateTime={targetPublishDate} className="font-mono tabular-nums">{targetPublishDate}</time>
              </span>
            )}
          </div>

          {/* Current Next Action Block */}
          <div className="bg-gradient-to-br from-rose-500/[0.07] via-stone-500/[0.02] to-amber-500/[0.06] dark:from-rose-950/30 dark:via-stone-800/30 dark:to-amber-950/20 rounded-xl border border-rose-200/60 dark:border-rose-900/40 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600 dark:bg-rose-500" />
                </span>
                <span>当前核心推进行动</span>
              </div>
              <div className="flex items-center gap-1.5">
                {topic.next_action && (
                  <span className="font-bold bg-rose-500/15 dark:bg-rose-900/50 text-rose-800 dark:text-rose-200 px-2 py-0.5 rounded-full text-[10px]">
                    已推进 <span className="font-mono tabular-nums">{actionDays}</span> 天
                  </span>
                )}
                {actionWarning && (
                  <span className="text-[10px] text-amber-700 dark:text-amber-300 font-bold bg-amber-500/15 px-2 py-0.5 rounded-full">
                    ⚠ {actionWarning}
                  </span>
                )}
              </div>
            </div>

            <p className="text-sm font-bold text-stone-900 dark:text-stone-100 leading-relaxed break-words">
              {topic.next_action || '尚未设置具体下一步，点击立即规划！'}
            </p>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setIsActionDialogOpen(true)}
                className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white py-2 px-3 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{topic.next_action ? '推进 / 完成行动' : '设置下一步行动'}</span>
              </button>
            </div>
          </div>

          {/* Schedule & Milestones Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-stone-100 dark:border-stone-800/80">
            {/* Target Publish Date */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="overview-target-publish-date" className="text-xs font-bold text-stone-700 dark:text-stone-300 flex items-center gap-1">
                  <Calendar aria-hidden="true" className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  <span>计划发布日期</span>
                </label>
                {targetPublishDate && (
                  <button
                    type="button"
                    onClick={async () => {
                      setTargetPublishDate('');
                      await onUpdateTopic({ target_publish_date: null });
                    }}
                    className="text-[10px] text-stone-400 hover:text-red-500 cursor-pointer"
                  >
                    清除
                  </button>
                )}
              </div>
              <DateInput
                id="overview-target-publish-date"
                name="target_publish_date"
                value={targetPublishDate}
                placeholder="YYYYMMDD，如 20260831"
                onChange={async (val) => {
                  setTargetPublishDate(val);
                  await onUpdateTopic({ target_publish_date: val || null });
                }}
                className="w-full text-xs text-stone-800 dark:text-stone-100 bg-stone-500/[0.03] dark:bg-stone-800/60 border border-stone-200/60 dark:border-stone-700/60 rounded-xl p-2 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 focus:outline-none transition-colors"
              />
              {/* Quick date presets */}
              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                {[
                  { label: '本周五', val: (() => { const d = new Date(); const diff = (5 - d.getDay() + 7) % 7; d.setDate(d.getDate() + (diff === 0 ? 7 : diff)); return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }); })() },
                  { label: '本周末', val: (() => { const d = new Date(); const diff = d.getDay() === 0 ? 0 : 7 - d.getDay(); d.setDate(d.getDate() + diff); return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }); })() },
                  { label: '下周五', val: (() => { const d = new Date(); const diff = ((5 - d.getDay() + 7) % 7) + 7; d.setDate(d.getDate() + diff); return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }); })() },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={async () => {
                      setTargetPublishDate(preset.val);
                      await onUpdateTopic({ target_publish_date: preset.val });
                    }}
                    className={`text-[10px] px-1.5 py-0.5 rounded-md border transition-colors cursor-pointer ${
                      targetPublishDate === preset.val
                        ? 'bg-rose-50 border-rose-300 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 font-bold'
                        : 'bg-stone-100/70 dark:bg-stone-800 border-stone-200/60 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-200/60'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Production Deadline */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="overview-deadline" className="text-xs font-bold text-stone-700 dark:text-stone-300 flex items-center gap-1">
                  <Clock aria-hidden="true" className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>制作截稿日</span>
                </label>
                {deadline && (
                  <button
                    type="button"
                    onClick={async () => {
                      setDeadline('');
                      await onUpdateTopic({ deadline: null });
                    }}
                    className="text-[10px] text-stone-400 hover:text-red-500 cursor-pointer"
                  >
                    清除
                  </button>
                )}
              </div>
              <DateInput
                id="overview-deadline"
                name="deadline"
                value={deadline}
                placeholder="YYYYMMDD，如 20260828"
                onChange={async (val) => {
                  setDeadline(val);
                  await onUpdateTopic({ deadline: val || null });
                }}
                className="w-full text-xs text-stone-800 dark:text-stone-100 bg-stone-500/[0.03] dark:bg-stone-800/60 border border-stone-200/60 dark:border-stone-700/60 rounded-xl p-2 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 focus:outline-none transition-colors"
              />
              <div className="pt-0.5">
                <span className="text-[10px] text-stone-500 dark:text-stone-400">
                  {deadline ? `定稿目标日: ${deadline}` : '用于内部写稿与剪辑交付倒计时'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. 五维健康度诊断罗盘 (ScoreRatingDial) */}
        <ScoreRatingDial
          topic={topic}
          onUpdateScores={onUpdateTopic}
          onNavigateToTab={onNavigateToTab}
        />

        {/* 3. 关联人物实体 (People Selector) */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 p-5 space-y-4 shadow-2xs transition-colors">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-stone-500/10 text-stone-700 dark:text-stone-300">
                <User className="w-4 h-4" />
              </span>
              <span>关联人物档案</span>
              <span className="text-xs bg-stone-200/60 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-bold px-2 py-0.5 rounded-full font-mono">
                {topic.people?.length || 0}
              </span>
            </h4>
            <button
              onClick={() => setIsAddPersonModalOpen(true)}
              className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 font-semibold bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              title="新建人物档案并关联到本选题"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>新建人物</span>
            </button>
          </div>

          {/* Active Characters */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-stone-400 dark:text-stone-500">本选题关联人物：</div>
            <div className="flex flex-wrap gap-1.5 min-h-[32px]">
              {topic.people && topic.people.length > 0 ? (
                topic.people.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-stone-900 dark:bg-stone-800 text-white rounded-xl text-xs font-semibold shadow-2xs"
                  >
                    <span>👤 {p.name}</span>
                    {p.identity && (
                      <span className="text-[10px] text-stone-300 dark:text-stone-400 font-normal bg-stone-800 dark:bg-stone-700 px-1.5 py-0.2 rounded-md">
                        {p.identity}
                      </span>
                    )}
                    <button
                      onClick={() => togglePerson(p)}
                      title="从本选题移出"
                      className="text-stone-400 hover:text-red-300 ml-0.5 p-0.5 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              ) : (
                <div className="text-xs text-stone-400 dark:text-stone-500 italic bg-stone-500/[0.03] dark:bg-stone-800/40 p-2.5 rounded-xl w-full text-center">
                  暂未关联人物，可在下方快速勾选
                </div>
              )}
            </div>
          </div>

          {/* Global People Quick Selector */}
          <div className="pt-3 border-t border-stone-100 dark:border-stone-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">全局人物库速选：</span>
              <span className="text-[11px] text-stone-400 dark:text-stone-500">共 <span className="font-mono tabular-nums">{allPeople.length}</span> 人</span>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
              {allPeople.map((p) => {
                const isSelected = topic.people?.some((tp) => tp.id === p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePerson(p)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-rose-500/10 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-semibold shadow-2xs'
                        : 'bg-stone-100/80 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200/70 dark:hover:bg-stone-700 hover:text-stone-900'
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
            </div>
          </div>
        </div>

        {/* 4. 分类标签 (Tags Selector) */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 p-5 space-y-4 shadow-2xs transition-colors">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-stone-500/10 text-stone-700 dark:text-stone-300">
                <TagIcon className="w-4 h-4" />
              </span>
              <span>分类标签与赛道</span>
              <span className="text-xs bg-stone-200/60 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-bold px-2 py-0.5 rounded-full font-mono">
                {topic.tags?.length || 0}
              </span>
            </h4>
            <button
              onClick={() => setIsAddingTag((prev) => !prev)}
              className="flex items-center gap-1 text-xs text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 font-semibold bg-stone-100 dark:bg-stone-800 hover:bg-stone-200/70 dark:hover:bg-stone-700 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAddingTag ? '收起' : '新建标签'}</span>
            </button>
          </div>

          {isAddingTag && (
            <form onSubmit={handleCreateAndAddTag} className="flex items-center gap-2 p-2 bg-stone-50 dark:bg-stone-800 rounded-xl">
              <input
                type="text"
                autoFocus
                placeholder="输入新标签 (如: 吃播/打假)..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="flex-1 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg px-3 py-1.5 text-xs text-stone-900 dark:text-stone-100 focus:outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                disabled={!newTagName.trim()}
                className="px-3 py-1.5 bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white rounded-lg text-xs font-semibold disabled:opacity-40 transition-colors cursor-pointer shadow-2xs"
              >
                添加
              </button>
            </form>
          )}

          {/* Active Tags */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-stone-400 dark:text-stone-500">已应用标签：</div>
            <div className="flex flex-wrap gap-1.5 min-h-[30px]">
              {topic.tags && topic.tags.length > 0 ? (
                topic.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-stone-900 dark:bg-stone-800 text-white rounded-lg text-xs font-medium shadow-2xs"
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
                <div className="text-xs text-stone-400 dark:text-stone-500 italic bg-stone-500/[0.03] dark:bg-stone-800/40 p-2.5 rounded-xl w-full text-center">
                  暂未添加分类标签
                </div>
              )}
            </div>
          </div>

          {/* Tag Library Quick Select */}
          <div className="pt-3 border-t border-stone-100 dark:border-stone-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">标签库：</span>
              <span className="text-[11px] text-stone-400 dark:text-stone-500">共 <span className="font-mono tabular-nums">{allTags.length}</span> 个</span>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
              {allTags.map((tag) => {
                const isSelected = topic.tags?.some((t) => t.id === tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag)}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-all flex items-center gap-1 cursor-pointer ${
                      isSelected
                        ? 'bg-rose-500/10 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-semibold'
                        : 'bg-stone-100/80 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200/70 dark:hover:bg-stone-700 hover:text-stone-900'
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
      </div>

      {/* Quick Add Person Modal */}
      <Modal
        isOpen={isAddPersonModalOpen}
        onClose={() => setIsAddPersonModalOpen(false)}
        title="新建人物档案并关联到本选题"
      >
        <form onSubmit={handleQuickCreatePerson} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="overview-person-name" className="block text-xs font-bold text-stone-800 dark:text-stone-200">
              人物姓名 / 核心昵称 <span className="text-rose-500">*</span>
            </label>
            <input
              id="overview-person-name"
              name="person_name"
              type="text"
              required
              autoComplete="name"
              autoFocus
              placeholder="例如：大胃袋良子"
              value={newPersonName}
              onChange={(e) => setNewPersonName(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="overview-person-identity" className="block text-xs font-bold text-stone-800 dark:text-stone-200">核心身份 / 标签</label>
              <input
                id="overview-person-identity"
                name="person_identity"
                type="text"
                autoComplete="off"
                placeholder="例如：吃播网红 / 探店主播"
                value={newPersonIdentity}
                onChange={(e) => setNewPersonIdentity(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="overview-person-aliases" className="block text-xs font-bold text-stone-800 dark:text-stone-200">别名 / 外号 / 曾用名</label>
              <input
                id="overview-person-aliases"
                name="person_aliases"
                type="text"
                autoComplete="off"
                placeholder="例如：良子、峨眉山战神"
                value={newPersonAliases}
                onChange={(e) => setNewPersonAliases(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="overview-person-accounts" className="block text-xs font-bold text-stone-800 dark:text-stone-200">主要平台账号 / 粉丝量</label>
            <input
              id="overview-person-accounts"
              name="person_accounts"
              type="text"
              autoComplete="off"
              placeholder="例如：抖音 @大胃袋良子 (120w)、B站同名"
              value={newPersonAccounts}
              onChange={(e) => setNewPersonAccounts(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="overview-person-description" className="block text-xs font-bold text-stone-800 dark:text-stone-200">人物背景简介 / 核心特质</label>
            <textarea
              id="overview-person-description"
              name="person_description"
              autoComplete="off"
              rows={3}
              placeholder="简要描述该人物的背景经历、公众形象、性格特质..."
              value={newPersonDesc}
              onChange={(e) => setNewPersonDesc(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setIsAddPersonModalOpen(false)}
              className="px-4 py-2 text-sm text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!newPersonName.trim()}
              className="px-5 py-2 text-sm bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white rounded-lg font-semibold disabled:opacity-50"
            >
              创建并引入本期
            </button>
          </div>
        </form>
      </Modal>

      {/* Next Action Dialog */}
      <NextActionDialog
        isOpen={isActionDialogOpen}
        topic={topic}
        onClose={() => setIsActionDialogOpen(false)}
        onUpdate={onUpdateTopic}
      />
    </div>
  );
};
