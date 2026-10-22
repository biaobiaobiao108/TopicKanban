import React, { useState } from 'react';
import { CitationInput, Topic, Source } from '../../types';
import { User, Quote, Sparkles, FileSearch, Search, X, Plus, Check, AlertTriangle } from 'lucide-react';
import { FloatingScrollbar } from '../ui/FloatingScrollbar';

interface ScriptReferenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  topic: Topic;
  sources: Source[];
  staleReferenceIds: string[];
  onInsertContent: (citation: CitationInput) => Promise<void>;
}

type RefTab = 'all' | 'sources' | 'people' | 'outline';

export const ScriptReferenceDrawer: React.FC<ScriptReferenceDrawerProps> = ({
  isOpen,
  onClose,
  topic,
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

  const peopleList = topic.people || [];
  const filteredPeople = peopleList.filter(
    p =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.quotes || '').toLowerCase().includes(q) ||
      (p.identity || '').toLowerCase().includes(q),
  );

  const filteredSources = sources.filter(
    s =>
      !q ||
      s.title.toLowerCase().includes(q) ||
      (s.content || '').toLowerCase().includes(q) ||
      (s.author || '').toLowerCase().includes(q) ||
      (s.event_date || '').toLowerCase().includes(q),
  );

  const showHook = Boolean(topic.hook && (!q || topic.hook.toLowerCase().includes(q)));
  const showStoryline = Boolean(topic.storyline && (!q || topic.storyline.toLowerCase().includes(q)));
  const hasOutlineContent = showHook || showStoryline;
  const hasVisibleContent =
    activeTab === 'people'
      ? filteredPeople.length > 0
      : activeTab === 'outline'
        ? hasOutlineContent
        : activeTab === 'sources'
          ? filteredSources.length > 0
          : hasOutlineContent || filteredPeople.length > 0 || filteredSources.length > 0;

  return (
    <>
      {/* Mobile/Tablet Backdrop for light-dismiss */}
      <div
        className="fixed inset-0 z-20 bg-overlay lg:hidden backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="script-reference-drawer absolute right-0 top-0 bottom-0 h-full z-30 flex flex-col border-l border-line bg-canvas shadow-xl xl:shadow-none animate-in slide-in-from-right duration-200 overflow-hidden">
        {/* Search Input & Close (Clean & unbordered) */}
        <div className="px-3.5 pt-3 pb-1.5 shrink-0 bg-canvas flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-ink-muted" />
            <input
              type="text"
              placeholder="搜索人物语录、资料..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-black/[0.04] rounded-xl text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:bg-surface focus:ring-1 focus:ring-accent transition-all border-0"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-ink-muted hover:text-ink rounded-lg hover:bg-overlay cursor-pointer transition-colors shrink-0"
            aria-label="收起事实参考"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tabs (Clean segmented pills centered with symmetrical margins) */}
        <div className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs overflow-x-auto no-scrollbar shrink-0 bg-canvas">
          <div className="inline-flex items-center justify-center gap-0.5 rounded-xl bg-black/[0.03] p-0.5">
            {[
              { id: 'all', label: '全部' },
              { id: 'sources', label: '资料' },
              { id: 'people', label: '人物' },
              { id: 'outline', label: '大纲' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as RefTab)}
                className={`px-2 py-1 rounded-lg shrink-0 text-2xs transition-all cursor-pointer border-0 ${
                  activeTab === tab.id
                    ? 'bg-surface text-accent-dark font-semibold shadow-2xs'
                    : 'text-ink-muted hover:text-ink font-medium'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Stream */}
        <FloatingScrollbar className="px-3.5 pb-6 pt-2 space-y-3.5 text-xs" wrapperClassName="flex-1 min-h-0">
          {/* 1. Outline & Hook */}
          {(activeTab === 'all' || activeTab === 'outline') && hasOutlineContent && (
            <div className="space-y-2">
              <div className="text-3xs font-semibold text-ink-muted uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-accent" />
                <span>核心看点与大纲</span>
              </div>

              {showHook && topic.hook && (
                <div className="bg-surface p-3.5 rounded-xl shadow-subtle space-y-2 border-0">
                  <div className="flex items-center justify-between text-ink font-medium text-xs">
                    <span className="font-semibold text-ink">🎯 黄金 3 秒 Hook</span>
                    <button
                      type="button"
                      onClick={() =>
                        void handleInsert('hook', {
                          reference_type: 'outline',
                          reference_id: 'hook',
                          reference_title: '核心 Hook',
                          reference_snapshot: topic.hook,
                          quoted_text: topic.hook,
                          verification_status: 'confirmed',
                        })
                      }
                      className="text-2xs bg-black/[0.04] hover:bg-accent hover:text-white text-ink-muted px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer font-medium transition-colors border-0"
                    >
                      {insertedId === 'hook' ? (
                        <Check className="w-2.5 h-2.5 text-inherit" />
                      ) : (
                        <Plus className="w-2.5 h-2.5" />
                      )}
                      <span>插入</span>
                    </button>
                  </div>
                  <p className="text-ink leading-relaxed italic text-2xs bg-canvas/70 p-2.5 rounded-lg border-0">
                    {topic.hook}
                  </p>
                </div>
              )}

              {showStoryline && topic.storyline && (
                <div className="bg-surface p-3.5 rounded-xl shadow-subtle space-y-2 border-0">
                  <div className="flex items-center justify-between text-ink font-medium text-xs">
                    <span className="font-semibold text-ink">📖 故事主线阶段</span>
                    <button
                      type="button"
                      onClick={() =>
                        void handleInsert('storyline', {
                          reference_type: 'outline',
                          reference_id: 'storyline',
                          reference_title: '故事主线',
                          reference_snapshot: topic.storyline,
                          quoted_text: topic.storyline,
                          verification_status: 'confirmed',
                        })
                      }
                      className="text-2xs bg-black/[0.04] hover:bg-accent hover:text-white text-ink-muted px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer font-medium transition-colors border-0"
                    >
                      {insertedId === 'storyline' ? (
                        <Check className="w-2.5 h-2.5 text-inherit" />
                      ) : (
                        <Plus className="w-2.5 h-2.5" />
                      )}
                      <span>插入</span>
                    </button>
                  </div>
                  <p className="text-ink leading-relaxed whitespace-pre-wrap text-2xs bg-canvas/70 p-2.5 rounded-lg border-0">
                    {topic.storyline}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 2. People & Quotes */}
          {(activeTab === 'all' || activeTab === 'people') && filteredPeople.length > 0 && (
            <div className="space-y-2">
              <div className="text-3xs font-semibold text-ink-muted uppercase tracking-wider flex items-center gap-1">
                <User className="w-3 h-3 text-ink-muted" />
                <span>人物语录与名言</span>
              </div>

              {filteredPeople.map(person => (
                <div key={person.id} className="bg-surface p-3.5 rounded-xl shadow-subtle space-y-2.5 border-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-ink text-xs">{person.name}</span>
                      {person.identity && (
                        <span className="text-3xs bg-black/[0.04] text-ink-muted px-1.5 py-0.5 rounded-md font-medium border-0">
                          {person.identity}
                        </span>
                      )}
                    </div>
                  </div>

                  {person.quotes ? (
                    <div className="border border-line bg-canvas/60 px-3 py-2 rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between text-accent-dark font-medium text-2xs">
                        <span className="flex items-center gap-1">
                          <Quote className="w-2.5 h-2.5 text-accent" /> 经典原话
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void handleInsert(`quote-${person.id}`, {
                              reference_type: 'person',
                              reference_id: person.id,
                              reference_title: `${person.name}语录`,
                              reference_snapshot: `“${person.quotes}” —— ${person.name}`,
                              quoted_text: `“${person.quotes}” —— ${person.name}`,
                              verification_status: 'confirmed',
                            })
                          }
                          className="text-2xs bg-black/[0.04] hover:bg-accent hover:text-white text-ink-muted px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer font-medium transition-colors border-0"
                        >
                          {insertedId === `quote-${person.id}` ? (
                            <Check className="w-2.5 h-2.5 text-inherit" />
                          ) : (
                            <Plus className="w-2.5 h-2.5" />
                          )}
                          <span>插入引用</span>
                        </button>
                      </div>
                      <p className="text-ink italic leading-relaxed text-2xs">“{person.quotes}”</p>
                    </div>
                  ) : (
                    <p className="text-2xs text-ink-muted">{person.description || '暂无语录记录'}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Sources */}
          {(activeTab === 'all' || activeTab === 'sources') && filteredSources.length > 0 && (
            <div className="space-y-2">
              <div className="text-3xs font-semibold text-ink-muted uppercase tracking-wider flex items-center gap-1">
                <FileSearch className="w-3 h-3 text-ink-muted" />
                <span>资料素材 ({filteredSources.length})</span>
              </div>

              <div className="space-y-2.5">
                {filteredSources.map(source => (
                  <div key={source.id} className="bg-surface p-3.5 rounded-xl shadow-subtle space-y-2 border-0">
                    <div className="flex items-start justify-between gap-1">
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="font-semibold text-ink text-xs truncate">{source.title}</div>
                        {source.event_date && (
                          <span className="inline-block text-3xs font-mono text-accent-dark bg-accent-soft px-1.5 py-0.2 rounded font-medium">
                            📅 {source.event_date}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void handleInsert(`src-${source.id}`, {
                            reference_type: 'source',
                            reference_id: source.id,
                            reference_title: source.title,
                            reference_snapshot: source.content || source.title,
                            quoted_text: source.content || source.title,
                            verification_status: source.verification_status,
                          })
                        }
                        className="text-2xs bg-black/[0.04] hover:bg-accent hover:text-white text-ink-muted px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1 cursor-pointer font-medium transition-colors border-0"
                      >
                        {insertedId === `src-${source.id}` ? (
                          <Check className="w-2.5 h-2.5 text-inherit" />
                        ) : (
                          <Plus className="w-2.5 h-2.5" />
                        )}
                        <span>插入</span>
                      </button>
                    </div>
                    {source.content && (
                      <p className="text-ink-muted line-clamp-3 text-2xs bg-canvas/70 p-2.5 rounded-lg border-0 leading-relaxed">
                        {source.content}
                      </p>
                    )}
                    <div
                      className={`text-3xs pt-0.5 ${
                        source.verification_status === 'confirmed' ? 'text-accent font-medium' : 'text-stage-scripting'
                      }`}
                    >
                      {source.verification_status === 'confirmed' ? (
                        <span className="inline-flex items-center gap-1">
                          <Check className="h-3 w-3" aria-hidden="true" />
                          已核实
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          待核实
                        </span>
                      )}
                      {staleReferenceIds.includes(source.id) && <span className="ml-2 text-warning">引用后有修改</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!hasVisibleContent && <div className="py-12 text-center text-ink-muted text-xs">暂无匹配的事实资料</div>}
        </FloatingScrollbar>
      </aside>
    </>
  );
};
