import React, { useMemo, useState } from 'react';
import { Person, PersonRelationship } from '../../types';
import { Modal } from '../ui/Modal';
import {
  User,
  ArrowRight,
  Plus,
  Edit2,
  Trash2,
  ExternalLink,
  Sparkles,
  Quote,
  CheckCircle2,
  Search,
  X,
  UserPlus
} from 'lucide-react';
import { sanitizeExternalHttpUrl } from '../../lib/urlSafety';

interface PeopleTabProps {
  topicPeople: Person[];
  allPeople: Person[];
  relationships: PersonRelationship[];
  onToggleTopicPerson: (person: Person) => Promise<void>;
  onSavePerson?: (personData: Partial<Person> & { name: string }) => Promise<Person>;
  onNavigateToPeople: () => void;
}

const QUICK_ATTACH_LIMIT = 8;

export const PeopleTab: React.FC<PeopleTabProps> = ({
  topicPeople,
  allPeople,
  relationships,
  onToggleTopicPerson,
  onSavePerson,
  onNavigateToPeople,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [personSearch, setPersonSearch] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [identity, setIdentity] = useState('');
  const [platformAccounts, setPlatformAccounts] = useState('');
  const [quotes, setQuotes] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  // Filter relationships where both or either person is involved in this topic
  const topicPersonIds = new Set(topicPeople.map((p) => p.id));
  const relevantRelationships = relationships.filter(
    (r) => topicPersonIds.has(r.person_a_id) || topicPersonIds.has(r.person_b_id)
  );

  const openCreateModal = () => {
    setEditingPerson(null);
    setName('');
    setAliases('');
    setIdentity('');
    setPlatformAccounts('');
    setQuotes('');
    setDescription('');
    setNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (person: Person) => {
    setEditingPerson(person);
    setName(person.name);
    setAliases(person.aliases || '');
    setIdentity(person.identity || '');
    setPlatformAccounts(person.platform_accounts || '');
    setQuotes(person.quotes || '');
    setDescription(person.description || '');
    setNotes(person.notes || '');
    setIsModalOpen(true);
  };

  const handleSavePersonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (onSavePerson) {
      const saved = await onSavePerson({
        id: editingPerson?.id,
        name: name.trim(),
        aliases: aliases.trim(),
        identity: identity.trim(),
        platform_accounts: platformAccounts.trim(),
        quotes: quotes.trim(),
        description: description.trim(),
        notes: notes.trim(),
      });

      // If creating new, automatically attach to this topic
      if (!editingPerson) {
        if (!topicPeople.some((p) => p.id === saved.id)) {
          await onToggleTopicPerson(saved);
        }
      }
    }

    setIsModalOpen(false);
  };

  // Other people in library not yet attached to this topic
  const unattachedPeople = useMemo(
    () => allPeople.filter((person) => !topicPersonIds.has(person.id)),
    [allPeople, topicPeople],
  );
  const personSearchResults = useMemo(() => {
    const query = personSearch.trim().toLocaleLowerCase();
    if (!query) return { people: [] as Person[], total: 0 };

    const matchedPeople = unattachedPeople.filter((person) =>
      [person.name, person.aliases, person.identity, person.platform_accounts]
        .some((value) => value?.toLocaleLowerCase().includes(query)),
    );
    return {
      people: matchedPeople.slice(0, QUICK_ATTACH_LIMIT),
      total: matchedPeople.length,
    };
  }, [personSearch, unattachedPeople]);

  return (
    <div className="py-6 space-y-8 max-w-5xl mx-auto">
      {/* 1. Active Topic Characters */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-base font-bold text-ink flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-accent-soft text-accent">
                <User className="w-4 h-4" />
              </span>
              <span>本期视频核心出场人物 ({topicPeople.length})</span>
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openCreateModal}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-accent hover:bg-accent-dark active:scale-[0.98] px-3.5 py-2 rounded-xl shadow-2xs transition-all cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>新建人物档案</span>
            </button>

            <button
              onClick={onNavigateToPeople}
              className="flex items-center gap-1.5 text-xs font-semibold text-ink bg-control hover:bg-control px-3.5 py-2 rounded-xl border border-line transition-colors cursor-pointer"
            >
              <span>全局人物档案库</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {topicPeople.map((person) => (
            <div
              key={person.id}
              className="bg-surface rounded-2xl border border-line p-5 space-y-3 shadow-subtle flex flex-col justify-between hover:shadow-card hover:-translate-y-0.5 transition-all"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    {sanitizeExternalHttpUrl(person.avatar_url) ? (
                      <img
                        src={sanitizeExternalHttpUrl(person.avatar_url)}
                        alt={person.name}
                        width={40}
                        height={40}
                        loading="lazy"
                        decoding="async"
                        className="w-10 h-10 rounded-full object-cover border border-line"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-control flex items-center justify-center font-bold text-ink border border-line text-sm">
                        {person.name.slice(0, 1)}
                      </div>
                    )}
                    <div>
                      <h4 className="text-base font-bold text-ink leading-tight">{person.name}</h4>
                      {person.identity && (
                        <span className="text-xs text-accent-dark font-semibold bg-accent-soft px-2 py-0.5 rounded-full inline-block mt-0.5">
                          {person.identity}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => openEditModal(person)}
                    className="p-1.5 text-ink-muted hover:text-ink hover:bg-control rounded-lg transition-colors cursor-pointer"
                    aria-label="编辑人物档案"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {person.aliases && (
                  <p className="text-xs text-ink-muted">
                    <span className="font-semibold text-ink-muted">别名/外号:</span> {person.aliases}
                  </p>
                )}

                {person.description && (
                  <p className="text-xs text-ink-muted leading-relaxed bg-control p-2.5 rounded-xl border border-line line-clamp-3">
                    {person.description}
                  </p>
                )}

                {person.quotes && (
                  <div className="text-xs text-ink italic border border-line px-2.5 py-1 bg-accent-soft/45 rounded-lg">
                    "{person.quotes}"
                  </div>
                )}

                {person.platform_accounts && (
                  <div className="text-[11px] text-ink-muted bg-control px-2.5 py-1 rounded-lg border border-line font-mono truncate">
                    {person.platform_accounts}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-line flex items-center justify-between">
                <button
                  onClick={() => openEditModal(person)}
                  className="text-xs text-ink-muted hover:text-ink font-medium flex items-center gap-1 cursor-pointer"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>编辑资料</span>
                </button>

                <button
                  onClick={() => onToggleTopicPerson(person)}
                  className="text-xs text-danger hover:text-danger bg-danger-soft px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  移出本期
                </button>
              </div>
            </div>
          ))}

          {topicPeople.length === 0 && (
            <div className="col-span-full p-8 text-center border-2 border-dashed border-line rounded-2xl bg-surface text-ink-muted space-y-2">
              <div>当前尚未关联人物</div>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-dark bg-accent-soft hover:bg-surface px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>立即新建并引入人物</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Quick Attach from Global People Library */}
      {unattachedPeople.length > 0 && (
        <div className="bg-surface rounded-2xl border border-line p-5 space-y-3 shadow-2xs transition-colors">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-ink">从全局人物库快速引入</h4>
              <p className="mt-1 text-xs text-ink-muted">搜索姓名、别名或身份，再选择要关联的人物。</p>
            </div>
            <span className="text-xs text-ink-muted">未关联 <span className="font-mono tabular-nums">{unattachedPeople.length}</span> 人</span>
          </div>

          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <input
              type="search"
              value={personSearch}
              onChange={(event) => setPersonSearch(event.target.value)}
              aria-label="搜索未关联人物"
              autoComplete="off"
              placeholder="输入人物姓名、别名或身份..."
              className="min-h-11 w-full rounded-xl border border-line bg-control pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent"
            />
          </label>

          {personSearch.trim() ? (
            personSearchResults.people.length > 0 ? (
              <>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
                  {personSearchResults.people.map((person) => (
              <div
                key={person.id}
                className="p-3 rounded-xl border border-line bg-control hover:bg-control flex items-center justify-between gap-2 transition-all"
              >
                <div className="min-w-0">
                  <div className="font-bold text-xs text-ink truncate">👤 {person.name}</div>
                  {person.identity && (
                    <div className="text-[10px] text-ink-muted truncate">{person.identity}</div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onToggleTopicPerson(person)}
                  aria-label={`引入人物：${person.name}`}
                  className="shrink-0 flex items-center gap-1 text-xs font-semibold text-accent-dark bg-accent-soft hover:bg-surface px-2.5 py-1 rounded-xl transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>引入</span>
                </button>
              </div>
                  ))}
                </div>
                {personSearchResults.total > QUICK_ATTACH_LIMIT && (
                  <p className="text-xs text-ink-muted" role="status">
                    找到 {personSearchResults.total} 人，仅显示前 {QUICK_ATTACH_LIMIT} 位，请继续缩小搜索范围。
                  </p>
                )}
              </>
            ) : (
              <p className="rounded-xl bg-canvas px-3 py-4 text-center text-xs text-ink-muted" role="status">
                没有找到匹配的未关联人物。
              </p>
            )
          ) : (
            <p className="rounded-xl bg-canvas px-3 py-4 text-center text-xs text-ink-muted">
              输入关键词后显示匹配人物。
            </p>
          )}
        </div>
      )}

      {/* 3. Character Relationships */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-bold text-ink">本期人物关系网 (Relationships)</h4>
          <span className="text-xs text-ink-muted">自动匹配本期出场人物之间的既有关系</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {relevantRelationships.map((rel) => (
            <div
              key={rel.id}
              className="bg-surface rounded-2xl border border-line p-4 flex items-center justify-between shadow-subtle"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold text-ink">
                  <span>{rel.person_a_name || '人物A'}</span>
                  <span className="text-xs bg-accent-soft text-accent-dark font-semibold px-2.5 py-0.5 rounded-full">
                    {rel.relationship}
                  </span>
                  <span>{rel.person_b_name || '人物B'}</span>
                </div>
                {rel.description && (
                  <p className="text-xs text-ink-muted">{rel.description}</p>
                )}
              </div>
            </div>
          ))}

          {relevantRelationships.length === 0 && (
            <div className="col-span-full p-5 text-center text-xs text-ink-muted bg-surface border border-line rounded-2xl shadow-subtle">
              暂无已记录的本期人物关联关系（可在「人物档案与关系库」中统一配置网状关系）
            </div>
          )}
        </div>
      </div>

      {/* Person Edit / Create Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPerson ? `编辑人物档案：${editingPerson.name}` : '新建人物实体档案'}
      >
        <form onSubmit={handleSavePersonSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-ink">
              人物姓名 / 核心昵称 <span className="text-ink-muted">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="例如：大胃袋良子"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2 bg-control border border-line rounded-xl text-sm text-ink placeholder:text-ink-muted focus:bg-surface focus:border-accent focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-ink">核心身份 / 标签</label>
              <input
                type="text"
                placeholder="例如：吃播网红 / 探店博主"
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                className="w-full px-3.5 py-2 bg-control border border-line rounded-xl text-sm text-ink placeholder:text-ink-muted focus:bg-surface focus:border-accent focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-ink">别名 / 外号</label>
              <input
                type="text"
                placeholder="例如：良子、峨眉山战神"
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
                className="w-full px-3.5 py-2 bg-control border border-line rounded-xl text-sm text-ink placeholder:text-ink-muted focus:bg-surface focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-ink">主要平台账号 / 粉丝量</label>
            <input
              type="text"
              placeholder="例如：抖音 @大胃袋良子 (120w)、B站同名"
              value={platformAccounts}
              onChange={(e) => setPlatformAccounts(e.target.value)}
              className="w-full px-3.5 py-2 bg-control border border-line rounded-xl text-sm text-ink placeholder:text-ink-muted focus:bg-surface focus:border-accent focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-ink">经典语录 / 名言口癖</label>
            <input
              type="text"
              placeholder="例如：“今天这顿必须拿下！”"
              value={quotes}
              onChange={(e) => setQuotes(e.target.value)}
              className="w-full px-3.5 py-2 bg-control border border-line rounded-xl text-sm text-ink placeholder:text-ink-muted focus:bg-surface focus:border-accent focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-ink">人物背景简介 / 特质分析</label>
            <textarea
              rows={3}
              placeholder="简要概括该人物的生平经历、公共事件、人设演变..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 bg-control border border-line rounded-xl text-sm text-ink placeholder:text-ink-muted focus:bg-surface focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-ink-muted hover:bg-control rounded-xl transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-5 py-2 text-xs bg-accent hover:bg-accent-dark text-white rounded-xl font-bold disabled:opacity-50 transition-all shadow-2xs cursor-pointer"
            >
              {editingPerson ? '保存修改' : '创建并引入本期'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
