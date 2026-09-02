import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Topic, Person, Tag } from '../../types';
import { Modal } from '../ui/Modal';
import { DateInput } from '../ui/DateInput';
import { useToast } from '../ui/Toast';
import { getCurrentActionAgeDays, getCurrentActionWarning } from '../../lib/topicMetrics';
import { useActionDateDisplay } from '../../lib/actionDate';
import { ActionDateText } from '../ui/ActionDate';
import {
  buildStoryStructureSectionsHtml,
  buildStoryStructureTimelineSteps,
  parseStorylineToActs,
  serializeActsToStoryline,
  STORY_STRUCTURE_STEPS,
  type StoryStructureActs,
  type StoryStructureKey,
} from '../../lib/storyStructure';
import {
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
  Target,
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
  onOpenCurrentAction: () => void;
  onInjectOutlineIntoDraft?: (outlineHtml: string) => Promise<void>;
  onConvertStorylineToTimeline?: (steps: Array<{ title: string; desc: string }>) => Promise<void>;
}

const STORY_STRUCTURE_CARD_STYLES: Record<StoryStructureKey, {
  header: string;
  badge: string;
  focus: string;
}> = {
  qi: {
    header: 'text-emerald-800 dark:text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    focus: 'focus:border-emerald-500',
  },
  cheng: {
    header: 'text-blue-800 dark:text-blue-400',
    badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    focus: 'focus:border-blue-500',
  },
  zhuan: {
    header: 'text-rose-800 dark:text-rose-400',
    badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    focus: 'focus:border-rose-500',
  },
  he: {
    header: 'text-purple-800 dark:text-purple-400',
    badge: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
    focus: 'focus:border-purple-500',
  },
};

export const OverviewTab: React.FC<OverviewTabProps> = ({
  topic,
  onUpdateTopic,
  allPeople,
  allTags,
  onSavePerson,
  onSaveTag,
  onOpenCurrentAction,
  onInjectOutlineIntoDraft,
  onConvertStorylineToTimeline,
}) => {
  const [summary, setSummary] = useState(topic.summary || '');
  const [hook, setHook] = useState(topic.hook || '');
  const [whyNow, setWhyNow] = useState(topic.why_now || '');
  const [storyline, setStoryline] = useState(topic.storyline || '');
  const [acts, setActs] = useState<StoryStructureActs>(() => parseStorylineToActs(topic.storyline || ''));
  const [targetPublishDate, setTargetPublishDate] = useState(topic.target_publish_date || '');
  const [deadline, setDeadline] = useState(topic.deadline || '');
  
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [storylineMode, setStorylineMode] = useState<'acts' | 'raw'>('acts');
  const [isWhyNowExpanded, setIsWhyNowExpanded] = useState(Boolean(topic.why_now));
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

  const actionDays = getCurrentActionAgeDays(topic);
  const actionWarning = getCurrentActionWarning(topic);
  const activeTopicDates = topic.status !== 'published' && topic.status !== 'icebox';
  const targetPublishDateDisplay = useActionDateDisplay(targetPublishDate, activeTopicDates);
  const deadlineDisplay = useActionDateDisplay(deadline, activeTopicDates);

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
  const handleActChange = (key: StoryStructureKey, value: string) => {
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
    const outlineHtml = buildStoryStructureSectionsHtml(acts);
    setBridgeStatus('已将故事结构导入文案草稿并跳转！');
    await onInjectOutlineIntoDraft(outlineHtml);
  };

  // Pipeline Bridge 2: Convert Four-Act Outline into Timeline Events
  const handleConvertToTimeline = async () => {
    if (!onConvertStorylineToTimeline) return;
    const steps = buildStoryStructureTimelineSteps(acts);

    if (steps.length === 0) {
      showToast({ message: '请先在故事结构中填写至少一个阶段的内容！', tone: 'info' });
      return;
    }

    setBridgeStatus('已将故事结构拆分为时间线！');
    await onConvertStorylineToTimeline(steps);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 py-4 items-start">
      {/* Left Main Column: Topic Positioning & Story Structure (7 / 12) */}
      <div className="xl:col-span-7 space-y-6">
        {/* 1. 选题定位卡 */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 p-5 space-y-4 shadow-2xs transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">选题定位</h2>
                <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                  先说清内容，再确认看点与时机。
                </p>
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

          {/* 一句话概述 */}
          <div className="space-y-1.5">
            <label htmlFor="overview-summary" className="block text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
              <Lightbulb aria-hidden="true" className="w-3.5 h-3.5 text-amber-500" />
              <span>一句话概述</span>
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
              placeholder="用一句话说清这条内容在讲什么、围绕谁或什么展开。"
              className="w-full text-sm text-stone-800 dark:text-stone-100 bg-stone-500/[0.03] dark:bg-stone-800/60 border border-stone-200/60 dark:border-stone-700/60 rounded-xl p-3 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 dark:focus:border-rose-500 focus:outline-none transition-colors"
            />
          </div>

          {/* 核心看点 */}
          <div className="space-y-1.5">
            <label htmlFor="overview-hook" className="block text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
              <Eye aria-hidden="true" className="w-3.5 h-3.5 text-rose-500" />
              <span>核心看点</span>
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
              placeholder="这条内容最值得被看到的地方是什么？可以是一个问题、事实、变化、冲突、方法或独特视角。"
              className="w-full text-sm text-stone-800 dark:text-stone-100 bg-stone-500/[0.03] dark:bg-stone-800/60 border border-stone-200/60 dark:border-stone-700/60 rounded-xl p-3 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 dark:focus:border-rose-500 focus:outline-none transition-colors"
            />
          </div>

          {/* 可折叠：为什么现在做 */}
          <div className="border-t border-stone-100 dark:border-stone-800/80 pt-3">
            <button
              type="button"
              onClick={() => setIsWhyNowExpanded(!isWhyNowExpanded)}
              className="w-full flex items-center justify-between text-xs font-semibold text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 cursor-pointer"
            >
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-500" />
                <span>为什么现在做</span>
                {whyNow && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
              </div>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isWhyNowExpanded ? 'rotate-180' : ''}`} />
            </button>

            {isWhyNowExpanded && (
              <div className="mt-2.5 space-y-1">
                <textarea
                  id="overview-why-now"
                  name="why_now"
                  aria-label="为什么现在做"
                  autoComplete="off"
                  rows={2}
                  value={whyNow}
                  onChange={(e) => {
                    setWhyNow(e.target.value);
                    triggerAutoSave({ why_now: e.target.value, summary, hook, storyline });
                  }}
                  onBlur={handleImmediateSave}
                  placeholder="现在做它的理由是什么？例如出现了新信息、需求变化、事件节点或正在发生的讨论。"
                  className="w-full text-xs text-stone-800 dark:text-stone-100 bg-stone-500/[0.03] dark:bg-stone-800/60 border border-stone-200/60 dark:border-stone-700/60 rounded-xl p-3 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 dark:focus:border-rose-500 focus:outline-none transition-colors"
                />
              </div>
            )}
          </div>
        </div>

        {/* 2. 故事结构工作台 (Story Structure) */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 p-5 space-y-4 shadow-2xs transition-colors">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Clapperboard className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">故事结构</h3>
                <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                  按四段梳理从背景到结果，适用于人物、事件、产品、观点和过程类选题。
                </p>
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
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>分段卡片</span>
              </button>
              <button
                type="button"
                onClick={() => setStorylineMode('raw')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  storylineMode === 'raw'
                    ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-2xs'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>文本模式</span>
              </button>
            </div>
          </div>

          {/* Story Structure Cards */}
          {storylineMode === 'acts' ? (
            <div className="space-y-3">
              {STORY_STRUCTURE_STEPS.map((step) => {
                const styles = STORY_STRUCTURE_CARD_STYLES[step.key];
                return (
                  <div key={step.key} className="rounded-xl border border-stone-200/60 dark:border-stone-800 bg-stone-500/[0.02] dark:bg-stone-800/30 p-3.5 space-y-1.5">
                    <div className={`flex items-start justify-between gap-2 text-xs font-bold ${styles.header}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center font-mono text-[11px] ${styles.badge}`}>
                          {step.number}
                        </span>
                        <span>{`第 ${step.number} 段 · ${step.label}`}</span>
                      </div>
                      <span className="shrink-0 text-right text-[10px] text-stone-400 font-normal">{step.note}</span>
                    </div>
                    <textarea
                      aria-label={`第 ${step.number} 段：${step.label}`}
                      name={`storyline_${step.key}`}
                      rows={2}
                      value={acts[step.key]}
                      onChange={(e) => handleActChange(step.key, e.target.value)}
                      onBlur={handleImmediateSave}
                      placeholder={step.placeholder}
                      className={`w-full text-xs text-stone-800 dark:text-stone-100 bg-white dark:bg-stone-800 border border-stone-200/60 dark:border-stone-700 rounded-lg p-2.5 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none ${styles.focus}`}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                aria-label="故事结构"
                name="storyline"
                rows={6}
                value={storyline}
                onChange={(e) => handleRawStorylineChange(e.target.value)}
                onBlur={handleImmediateSave}
                placeholder="【开始】背景与问题 → 【发展】过程与变化 → 【转折】改变走向的节点 → 【收束】结果与影响"
                className="w-full text-xs text-stone-800 dark:text-stone-100 bg-stone-500/[0.03] dark:bg-stone-800/60 border border-stone-200/60 dark:border-stone-700/60 rounded-xl p-3.5 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 dark:focus:border-rose-500 focus:outline-none transition-colors"
              />
              <p className="text-[11px] text-stone-400">
                提示：支持使用 <code>【开始...】</code>、<code>【发展...】</code> 等标签，也可以用换行或 <code>→</code> 连接各段。
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
                  title="将故事结构直接导入文案编辑器"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>导入文案草稿</span>
                </button>
              )}

              {onConvertStorylineToTimeline && (
                <button
                  type="button"
                  onClick={handleConvertToTimeline}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200/80 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 text-xs font-semibold transition-colors cursor-pointer"
                  title="将故事结构拆分为时间线节点"
                >
                  <Calendar className="w-3.5 h-3.5 text-stone-500" />
                  <span>拆成时间线</span>
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

      {/* Right Column: Production Cockpit & Entities (5 / 12) */}
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
                定档 <ActionDateText display={targetPublishDateDisplay} />
              </span>
            )}
          </div>

          {/* Current Action Block */}
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
                {topic.current_todo && (
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
              {topic.current_todo?.title || '尚未设置当前行动，点击立即规划！'}
            </p>

            <div className="pt-1">
              <button
                type="button"
                onClick={onOpenCurrentAction}
                className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white py-2 px-3 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{topic.current_todo ? '推进 / 完成行动' : '设置当前行动'}</span>
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
                  {deadline ? <>定稿目标日: <ActionDateText display={deadlineDisplay} /></> : '用于内部写稿与剪辑交付倒计时'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. 关联人物实体 (People Selector) */}
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
              className="flex items-center gap-1 rounded-lg bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-500/20 hover:text-rose-800 dark:text-rose-300 dark:hover:text-rose-200 cursor-pointer"
              title="新建人物档案并关联到本选题"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>新建人物</span>
            </button>
          </div>

          {/* Active Characters */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-stone-600 dark:text-stone-400">本选题关联人物：</div>
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
                <div className="text-xs text-stone-600 dark:text-stone-400 italic bg-stone-500/[0.03] dark:bg-stone-800/40 p-2.5 rounded-xl w-full text-center">
                  暂未关联人物，可在下方快速勾选
                </div>
              )}
            </div>
          </div>

          {/* Global People Quick Selector */}
          <div className="pt-3 border-t border-stone-100 dark:border-stone-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">全局人物库速选：</span>
              <span className="text-[11px] text-stone-600 dark:text-stone-400">共 <span className="font-mono tabular-nums">{allPeople.length}</span> 人</span>
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

    </div>
  );
};
