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
} from 'lucide-react';
import { FloatingScrollbar } from '../ui/FloatingScrollbar';

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
    <>
      {/* Mobile/Tablet Backdrop for light-dismiss */}
      <div
        className="fixed inset-0 z-20 bg-black/15 dark:bg-black/40 xl:hidden backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="script-reference-drawer absolute right-0 top-0 bottom-0 h-full z-30 flex w-80 sm:w-96 flex-col border-l border-[var(--line)] bg-[var(--canvas)] shadow-xl xl:shadow-none animate-in slide-in-from-right duration-200 overflow-hidden">
        {/* Search Input & Close (Clean & unbordered) */}
        <div className="px-3.5 pt-3 pb-1.5 shrink-0 bg-[var(--canvas)] flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-stone-400 dark:text-stone-500" />
            <input
              type="text"
              placeholder="搜索时间线、人物语录、资料..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.05] rounded-xl text-xs text-[var(--ink)] placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:bg-[var(--surface)] focus:ring-1 focus:ring-[var(--accent)] transition-all border-0"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-[var(--ink)] rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors shrink-0"
            title="收起事实参考 (Esc)"
            aria-label="收起事实参考"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tabs (Clean segmented pills without border-b) */}
        <div className="flex items-center gap-1 px-3.5 py-1 text-xs overflow-x-auto no-scrollbar shrink-0 bg-[var(--canvas)]">
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
              className={`px-2.5 py-1 rounded-lg shrink-0 text-[11px] transition-all cursor-pointer border-0 ${
                activeTab === tab.id
                  ? 'bg-[var(--surface)] text-[var(--accent-dark)] font-semibold shadow-2xs'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] font-medium'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Stream */}
        <FloatingScrollbar className="px-3.5 pb-6 pt-2 space-y-3.5 text-xs" wrapperClassName="flex-1 min-h-0">
          {/* 1. Outline & Hook */}
          {(activeTab === 'all' || activeTab === 'outline') && hasOutlineContent && (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[var(--accent)]" />
                <span>核心看点与大纲</span>
              </div>

              {showHook && topic.hook && (
                <div className="bg-[var(--surface)] p-3.5 rounded-xl shadow-2xs space-y-2 border-0">
                  <div className="flex items-center justify-between text-[var(--ink)] font-medium text-xs">
                    <span className="font-semibold text-stone-900 dark:text-stone-100">🎯 黄金 3 秒 Hook</span>
                    <button
                      type="button"
                      onClick={() => void handleInsert('hook', {
                        reference_type: 'outline', reference_id: 'hook', reference_title: '核心 Hook',
                        reference_snapshot: topic.hook, quoted_text: topic.hook, verification_status: 'confirmed',
                      })}
                      className="text-[11px] bg-black/[0.04] dark:bg-white/[0.06] hover:bg-[var(--accent)] hover:text-white text-stone-600 dark:text-stone-300 px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer font-medium transition-colors border-0"
                    >
                      {insertedId === 'hook' ? <Check className="w-2.5 h-2.5 text-inherit" /> : <Plus className="w-2.5 h-2.5" />}
                      <span>插入</span>
                    </button>
                  </div>
                  <p className="text-stone-800 dark:text-stone-200 leading-relaxed italic text-[11px] bg-[var(--canvas)]/70 p-2.5 rounded-lg border-0">{topic.hook}</p>
                </div>
              )}

              {showStoryline && topic.storyline && (
                <div className="bg-[var(--surface)] p-3.5 rounded-xl shadow-2xs space-y-2 border-0">
                  <div className="flex items-center justify-between text-[var(--ink)] font-medium text-xs">
                    <span className="font-semibold text-stone-900 dark:text-stone-100">📖 故事主线阶段</span>
                    <button
                      type="button"
                      onClick={() => void handleInsert('storyline', {
                        reference_type: 'outline', reference_id: 'storyline', reference_title: '故事主线',
                        reference_snapshot: topic.storyline, quoted_text: topic.storyline, verification_status: 'confirmed',
                      })}
                      className="text-[11px] bg-black/[0.04] dark:bg-white/[0.06] hover:bg-[var(--accent)] hover:text-white text-stone-600 dark:text-stone-300 px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer font-medium transition-colors border-0"
                    >
                      {insertedId === 'storyline' ? <Check className="w-2.5 h-2.5 text-inherit" /> : <Plus className="w-2.5 h-2.5" />}
                      <span>插入</span>
                    </button>
                  </div>
                  <p className="text-stone-800 dark:text-stone-200 leading-relaxed whitespace-pre-wrap text-[11px] bg-[var(--canvas)]/70 p-2.5 rounded-lg border-0">{topic.storyline}</p>
                </div>
              )}
            </div>
          )}

          {/* 2. People & Quotes */}
          {(activeTab === 'all' || activeTab === 'people') && filteredPeople.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider flex items-center gap-1">
                <User className="w-3 h-3 text-[var(--ink-muted)]" />
                <span>人物语录与名言</span>
              </div>

              {filteredPeople.map((person) => (
                <div key={person.id} className="bg-[var(--surface)] p-3.5 rounded-xl shadow-2xs space-y-2.5 border-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-stone-900 dark:text-stone-100 text-xs">{person.name}</span>
                      {person.identity && (
                        <span className="text-[10px] bg-black/[0.04] dark:bg-white/[0.06] text-stone-600 dark:text-stone-400 px-1.5 py-0.5 rounded-md font-medium border-0">
                          {person.identity}
                        </span>
                      )}
                    </div>
                  </div>

                  {person.quotes ? (
                    <div className="border-l-2 border-[var(--accent)] bg-[var(--canvas)]/60 pl-3 pr-2.5 py-2 rounded-r-lg space-y-1.5">
                      <div className="flex items-center justify-between text-[var(--accent-dark)] font-medium text-[11px]">
                        <span className="flex items-center gap-1">
                          <Quote className="w-2.5 h-2.5 text-[var(--accent)]" /> 经典原话
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleInsert(`quote-${person.id}`, {
                            reference_type: 'person', reference_id: person.id, reference_title: `${person.name}语录`,
                            reference_snapshot: `“${person.quotes}” —— ${person.name}`,
                            quoted_text: `“${person.quotes}” —— ${person.name}`, verification_status: 'confirmed',
                          })}
                          className="text-[11px] bg-black/[0.04] dark:bg-white/[0.06] hover:bg-[var(--accent)] hover:text-white text-stone-600 dark:text-stone-300 px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer font-medium transition-colors border-0"
                        >
                          {insertedId === `quote-${person.id}` ? <Check className="w-2.5 h-2.5 text-inherit" /> : <Plus className="w-2.5 h-2.5" />}
                          <span>插入引用</span>
                        </button>
                      </div>
                      <p className="text-stone-800 dark:text-stone-200 italic leading-relaxed text-[11px]">“{person.quotes}”</p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">{person.description || '暂无语录记录'}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 3. Timeline Events */}
          {(activeTab === 'all' || activeTab === 'timeline') && filteredTimeline.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3 text-[var(--ink-muted)]" />
                <span>故事时间线 ({filteredTimeline.length})</span>
              </div>

              <div className="space-y-2.5">
                {filteredTimeline.map((item) => (
                  <div key={item.id} className="relative group bg-[var(--surface)] p-3.5 rounded-xl shadow-2xs space-y-1.5 border-0">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-stone-500 dark:text-stone-400 bg-[var(--canvas)] px-2 py-0.5 rounded-md text-[10px] tabular-nums border-0">
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
                        className="text-[11px] bg-black/[0.04] dark:bg-white/[0.06] hover:bg-[var(--accent)] hover:text-white text-stone-600 dark:text-stone-300 px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer font-medium transition-colors border-0"
                      >
                        {insertedId === `time-${item.id}` ? <Check className="w-2.5 h-2.5 text-inherit" /> : <Plus className="w-2.5 h-2.5" />}
                        <span>引用</span>
                      </button>
                    </div>
                    <h4 className="font-semibold text-stone-900 dark:text-stone-100 text-xs">{item.title}</h4>
                    {item.description && (
                      <p className="text-stone-600 dark:text-stone-400 leading-relaxed text-[11px]">{item.description}</p>
                    )}
                    <div className="flex gap-2 text-[10px] pt-0.5">
                      <span className={item.verification_status === 'confirmed' ? 'text-[var(--accent)] font-medium' : 'text-[#9b6a2f] dark:text-[#c49258]'}>
                        {item.verification_status === 'confirmed' ? '✓ 已核实' : '⚠ 待核实'}
                      </span>
                      {staleReferenceIds.includes(item.id) && <span className="text-[var(--h1-color)]">引用后有修改</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Sources */}
          {(activeTab === 'all' || activeTab === 'sources') && filteredSources.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider flex items-center gap-1">
                <FileSearch className="w-3 h-3 text-[var(--ink-muted)]" />
                <span>资料素材 ({filteredSources.length})</span>
              </div>

              <div className="space-y-2.5">
                {filteredSources.map((source) => (
                  <div key={source.id} className="bg-[var(--surface)] p-3.5 rounded-xl shadow-2xs space-y-2 border-0">
                    <div className="flex items-start justify-between gap-1">
                      <div className="font-semibold text-stone-900 dark:text-stone-100 text-xs truncate">{source.title}</div>
                      <button
                        type="button"
                        onClick={() => void handleInsert(`src-${source.id}`, {
                          reference_type: 'source', reference_id: source.id, reference_title: source.title,
                          reference_snapshot: source.content || source.title, quoted_text: source.content || source.title,
                          verification_status: source.verification_status,
                        })}
                        className="text-[11px] bg-black/[0.04] dark:bg-white/[0.06] hover:bg-[var(--accent)] hover:text-white text-stone-600 dark:text-stone-300 px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1 cursor-pointer font-medium transition-colors border-0"
                      >
                        {insertedId === `src-${source.id}` ? <Check className="w-2.5 h-2.5 text-inherit" /> : <Plus className="w-2.5 h-2.5" />}
                        <span>插入</span>
                      </button>
                    </div>
                    {source.content && (
                      <p className="text-stone-600 dark:text-stone-400 line-clamp-3 text-[11px] bg-[var(--canvas)]/70 p-2.5 rounded-lg border-0 leading-relaxed">
                        {source.content}
                      </p>
                    )}
                    <div className={`text-[10px] pt-0.5 ${
                      source.verification_status === 'confirmed' ? 'text-[var(--accent)] font-medium' : 'text-[#9b6a2f] dark:text-[#c49258]'
                    }`}>
                      {source.verification_status === 'confirmed' ? '✓ 已核实' : '⚠ 待核实'}
                      {staleReferenceIds.includes(source.id) && <span className="ml-2 text-[var(--h1-color)]">引用后有修改</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!hasVisibleContent && (
            <div className="py-12 text-center text-stone-400 dark:text-stone-500 text-xs">
              暂无匹配的事实资料
            </div>
          )}
        </FloatingScrollbar>
      </aside>
    </>
  );
};
