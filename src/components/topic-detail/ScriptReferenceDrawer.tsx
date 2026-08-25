import React, { useState } from 'react';
import { CitationInput, Topic, TimelineEvent, Source } from '../../types';
import {
  Clock,
  User,
  Quote,
  Sparkles,
  FileSearch,
  Search,
  X,
  Plus,
  Check,
  BookOpen,
} from 'lucide-react';

interface ScriptReferenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  topic: Topic;
  timeline: TimelineEvent[];
  sources: Source[];
  staleReferenceIds: string[];
  onInsertContent: (citation: CitationInput) => Promise<void>;
}

type RefTab = 'all' | 'timeline' | 'people' | 'outline' | 'sources';

export const ScriptReferenceDrawer: React.FC<ScriptReferenceDrawerProps> = ({
  isOpen,
  onClose,
  topic,
  timeline,
  sources,
  staleReferenceIds,
  onInsertContent,
}) => {
  const [activeTab, setActiveTab] = useState<RefTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [insertedId, setInsertedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleInsert = async (id: string, citation: CitationInput) => {
    await onInsertContent(citation);
    setInsertedId(id);
    setTimeout(() => setInsertedId(null), 1500);
  };

  const q = searchQuery.toLowerCase().trim();

  // Filter items
  const filteredTimeline = timeline.filter((t) =>
    !q || t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q) || t.event_date.includes(q)
  );

  const peopleList = topic.people || [];
  const filteredPeople = peopleList.filter((p) =>
    !q || p.name.toLowerCase().includes(q) || (p.quotes || '').toLowerCase().includes(q) || (p.identity || '').toLowerCase().includes(q)
  );

  const filteredSources = sources.filter((s) =>
    !q || s.title.toLowerCase().includes(q) || (s.content || '').toLowerCase().includes(q) || (s.author || '').toLowerCase().includes(q)
  );

  const showHook = Boolean(topic.hook && (!q || topic.hook.toLowerCase().includes(q)));
  const showStoryline = Boolean(topic.storyline && (!q || topic.storyline.toLowerCase().includes(q)));
  const hasOutlineContent = showHook || showStoryline;
  const hasVisibleContent = activeTab === 'timeline'
    ? filteredTimeline.length > 0
    : activeTab === 'people'
      ? filteredPeople.length > 0
      : activeTab === 'outline'
        ? hasOutlineContent
        : activeTab === 'sources'
          ? filteredSources.length > 0
          : hasOutlineContent || filteredTimeline.length > 0 || filteredPeople.length > 0 || filteredSources.length > 0;

  return (
    <div className="script-reference-drawer absolute right-3 sm:right-4 top-3 sm:top-4 bottom-3 sm:bottom-4 z-30 flex w-80 sm:w-96 flex-col rounded-2xl bg-white/95 dark:bg-stone-900/95 backdrop-blur-xl border border-stone-200/70 dark:border-stone-800/80 shadow-card animate-in slide-in-from-right duration-200 overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 h-12 px-3.5 border-b border-stone-100 dark:border-stone-800/70 bg-stone-50/50 dark:bg-stone-800/50">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
          </div>
          <h3 className="shrink-0 text-xs font-bold tracking-wide text-stone-800 dark:text-stone-100">事实参考资料</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-stone-400 dark:text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer transition-colors"
          title="收起事实参考 (Esc)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search Input */}
      <div className="px-3.5 py-2 shrink-0 border-b border-stone-100/80 dark:border-stone-800/60 bg-stone-50/20 dark:bg-stone-900/20">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400 dark:text-stone-500" />
          <input
            type="text"
            placeholder="搜索时间线、人物语录、资料..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-stone-100/80 dark:bg-stone-800/80 border border-stone-200/60 dark:border-stone-700/60 rounded-xl text-xs text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none focus:border-rose-500 transition-colors"
          />
        </div>
      </div>

      {/* Tabs (Capsules) */}
      <div className="flex items-center gap-1 px-3.5 py-1.5 text-xs overflow-x-auto no-scrollbar shrink-0 bg-stone-50/40 dark:bg-stone-800/40">
        {[
          { id: 'all', label: '全部' },
          { id: 'timeline', label: `时间线 (${timeline.length})` },
          { id: 'people', label: `人物 (${peopleList.length})` },
          { id: 'outline', label: '大纲' },
          { id: 'sources', label: `素材 (${sources.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as RefTab)}
            className={`px-2 py-1 rounded-lg shrink-0 text-[11px] font-semibold transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-rose-500 text-white shadow-2xs'
                : 'text-stone-600 dark:text-stone-400 hover:bg-stone-500/10 dark:hover:bg-stone-100/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Stream */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-3.5 pb-6 pt-2 space-y-3.5 text-xs">
        {/* 1. Outline & Hook */}
        {(activeTab === 'all' || activeTab === 'outline') && hasOutlineContent && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-rose-500" />
              <span>核心看点与大纲</span>
            </div>

            {showHook && topic.hook && (
              <div className="bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200/70 dark:border-rose-900/50 p-2.5 rounded-xl space-y-1.5 backdrop-blur-xs">
                <div className="flex items-center justify-between text-rose-900 dark:text-rose-200 font-bold text-xs">
                  <span>🎯 黄金 3 秒 Hook</span>
                  <button
                    type="button"
                    onClick={() => void handleInsert('hook', {
                      reference_type: 'outline', reference_id: 'hook', reference_title: '核心 Hook',
                      reference_snapshot: topic.hook, quoted_text: topic.hook, verification_status: 'confirmed',
                    })}
                    className="text-[10px] bg-white dark:bg-stone-800 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-300 px-1.5 py-0.5 rounded-lg flex items-center gap-0.5 cursor-pointer shadow-2xs font-semibold"
                  >
                    {insertedId === 'hook' ? <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" /> : <Plus className="w-2.5 h-2.5" />}
                    <span>插入</span>
                  </button>
                </div>
                <p className="text-stone-700 dark:text-stone-300 leading-relaxed italic text-[11px]">{topic.hook}</p>
              </div>
            )}

            {showStoryline && topic.storyline && (
              <div className="bg-white/80 dark:bg-stone-800/80 border border-stone-200/70 dark:border-stone-800/70 p-2.5 rounded-xl space-y-1.5 backdrop-blur-xs">
                <div className="flex items-center justify-between text-stone-900 dark:text-stone-100 font-bold text-xs">
                  <span>📖 故事主线阶段</span>
                  <button
                    type="button"
                    onClick={() => void handleInsert('storyline', {
                      reference_type: 'outline', reference_id: 'storyline', reference_title: '故事主线',
                      reference_snapshot: topic.storyline, quoted_text: topic.storyline, verification_status: 'confirmed',
                    })}
                    className="text-[10px] bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 px-1.5 py-0.5 rounded-lg flex items-center gap-0.5 cursor-pointer shadow-2xs font-semibold"
                  >
                    {insertedId === 'storyline' ? <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" /> : <Plus className="w-2.5 h-2.5" />}
                    <span>插入</span>
                  </button>
                </div>
                <p className="text-stone-700 dark:text-stone-300 leading-relaxed font-mono whitespace-pre-wrap text-[11px]">{topic.storyline}</p>
              </div>
            )}
          </div>
        )}

        {/* 2. People & Quotes */}
        {(activeTab === 'all' || activeTab === 'people') && filteredPeople.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-wider flex items-center gap-1">
              <User className="w-3 h-3 text-stone-500" />
              <span>人物语录与名言</span>
            </div>

            {filteredPeople.map((person) => (
              <div key={person.id} className="bg-white/80 dark:bg-stone-800/80 border border-stone-200/70 dark:border-stone-800/70 p-2.5 rounded-xl space-y-2 backdrop-blur-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-stone-900 dark:text-stone-100 text-xs">{person.name}</span>
                    {person.identity && (
                      <span className="text-[10px] bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 px-1.5 py-0.2 rounded font-medium">
                        {person.identity}
                      </span>
                    )}
                  </div>
                </div>

                {person.quotes ? (
                  <div className="bg-stone-50/80 dark:bg-stone-900/60 p-2 rounded-lg border border-stone-200/60 dark:border-stone-800 space-y-1">
                    <div className="flex items-center justify-between text-rose-700 dark:text-rose-400 font-semibold text-[11px]">
                      <span className="flex items-center gap-1">
                        <Quote className="w-2.5 h-2.5" /> 经典原话
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleInsert(`quote-${person.id}`, {
                          reference_type: 'person', reference_id: person.id, reference_title: `${person.name}语录`,
                          reference_snapshot: `“${person.quotes}” —— ${person.name}`,
                          quoted_text: `“${person.quotes}” —— ${person.name}`, verification_status: 'confirmed',
                        })}
                        className="text-[10px] bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-800 dark:text-rose-200 px-1.5 py-0.5 rounded-lg flex items-center gap-0.5 cursor-pointer font-semibold shadow-2xs"
                      >
                        {insertedId === `quote-${person.id}` ? <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" /> : <Plus className="w-2.5 h-2.5" />}
                        <span>插入引用</span>
                      </button>
                    </div>
                    <p className="text-stone-700 dark:text-stone-300 italic leading-relaxed text-[11px]">“{person.quotes}”</p>
                  </div>
                ) : (
                  <p className="text-[11px] text-stone-400 dark:text-stone-500">{person.description || '暂无语录记录'}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 3. Timeline Events */}
        {(activeTab === 'all' || activeTab === 'timeline') && filteredTimeline.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3 text-stone-500" />
              <span>故事时间线 ({filteredTimeline.length})</span>
            </div>

            <div className="space-y-2 border-l-2 border-stone-200/70 dark:border-stone-800 ml-1.5 pl-2.5">
              {filteredTimeline.map((item) => (
                <div key={item.id} className="relative group bg-white/80 dark:bg-stone-800/80 p-2.5 rounded-xl border border-stone-200/70 dark:border-stone-800/70 space-y-1 backdrop-blur-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-stone-900 dark:text-stone-100 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded text-[10px]">
                      {item.event_date}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleInsert(`time-${item.id}`, {
                        reference_type: 'timeline', reference_id: item.id, reference_title: item.title,
                        reference_snapshot: `【${item.event_date}】${item.title}：${item.description || ''}`,
                        quoted_text: `【${item.event_date}】${item.title}：${item.description || ''}`,
                        verification_status: item.verification_status,
                      })}
                      className="text-[10px] bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 px-1.5 py-0.5 rounded-lg flex items-center gap-0.5 opacity-80 group-hover:opacity-100 cursor-pointer font-semibold shadow-2xs"
                    >
                      {insertedId === `time-${item.id}` ? <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" /> : <Plus className="w-2.5 h-2.5" />}
                      <span>引用</span>
                    </button>
                  </div>
                  <h4 className="font-bold text-stone-900 dark:text-stone-100 text-xs">{item.title}</h4>
                  {item.description && (
                    <p className="text-stone-600 dark:text-stone-300 leading-relaxed text-[11px]">{item.description}</p>
                  )}
                  <div className="flex gap-2 text-[10px] font-semibold">
                    <span className={item.verification_status === 'confirmed' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>
                      {item.verification_status === 'confirmed' ? '✓ 已核实' : '⚠ 尚未核实'}
                    </span>
                    {staleReferenceIds.includes(item.id) && <span className="text-rose-700 dark:text-rose-400">引用后有修改</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. Sources */}
        {(activeTab === 'all' || activeTab === 'sources') && filteredSources.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-wider flex items-center gap-1">
              <FileSearch className="w-3 h-3 text-stone-500" />
              <span>资料素材 ({filteredSources.length})</span>
            </div>

            {filteredSources.map((source) => (
              <div key={source.id} className="bg-white/80 dark:bg-stone-800/80 border border-stone-200/70 dark:border-stone-800/70 p-2.5 rounded-xl space-y-1.5 backdrop-blur-xs">
                <div className="flex items-start justify-between gap-1">
                  <div className="font-bold text-stone-900 dark:text-stone-100 text-xs truncate">{source.title}</div>
                  <button
                    type="button"
                    onClick={() => void handleInsert(`src-${source.id}`, {
                      reference_type: 'source', reference_id: source.id, reference_title: source.title,
                      reference_snapshot: source.content || source.title, quoted_text: source.content || source.title,
                      verification_status: source.verification_status,
                    })}
                    className="text-[10px] bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 px-1.5 py-0.5 rounded-lg shrink-0 flex items-center gap-0.5 cursor-pointer font-semibold shadow-2xs"
                  >
                    {insertedId === `src-${source.id}` ? <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" /> : <Plus className="w-2.5 h-2.5" />}
                    <span>插入</span>
                  </button>
                </div>
                {source.content && (
                  <p className="text-stone-600 dark:text-stone-300 line-clamp-3 text-[11px] bg-stone-50/80 dark:bg-stone-900/60 p-2 rounded-lg border border-stone-200/50 dark:border-stone-800">
                    {source.content}
                  </p>
                )}
                <div className={`text-[10px] font-semibold ${
                  source.verification_status === 'confirmed' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'
                }`}>
                  {source.verification_status === 'confirmed' ? '✓ 已核实' : '⚠ 尚未核实'}
                  {staleReferenceIds.includes(source.id) && <span className="ml-2 text-rose-700 dark:text-rose-400">引用后有修改</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!hasVisibleContent && (
          <div className="py-12 text-center text-stone-400 dark:text-stone-500 text-xs">
            暂无匹配的事实资料
          </div>
        )}
      </div>
    </div>
  );
};
