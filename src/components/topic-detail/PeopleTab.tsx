import React, { useState } from 'react';
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
  X,
  UserPlus
} from 'lucide-react';

interface PeopleTabProps {
  topicPeople: Person[];
  allPeople: Person[];
  relationships: PersonRelationship[];
  onToggleTopicPerson: (person: Person) => Promise<void>;
  onSavePerson?: (personData: Partial<Person> & { name: string }) => Promise<Person>;
  onNavigateToPeople: () => void;
}

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
  const unattachedPeople = allPeople.filter((p) => !topicPersonIds.has(p.id));

  return (
    <div className="py-6 space-y-8 max-w-5xl mx-auto">
      {/* 1. Active Topic Characters */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <User className="w-4 h-4 text-rose-600" />
              <span>本期视频核心出场人物 ({topicPeople.length})</span>
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              人物是叙事类视频的核心灵魂，可在此直接编辑档案或引入新人物
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openCreateModal}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 px-3 py-1.5 rounded-lg shadow-sm transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>新建人物档案</span>
            </button>

            <button
              onClick={onNavigateToPeople}
              className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200/80 px-3 py-1.5 rounded-lg border border-stone-200 transition-colors"
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
              className="bg-white rounded-xl border border-stone-200 p-5 space-y-3 shadow-subtle flex flex-col justify-between hover:border-stone-400/80 transition-all"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    {person.avatar_url ? (
                      <img
                        src={person.avatar_url}
                        alt={person.name}
                        className="w-10 h-10 rounded-full object-cover border border-stone-200"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center font-bold text-stone-700 border border-stone-200 text-sm">
                        {person.name.slice(0, 1)}
                      </div>
                    )}
                    <div>
                      <h4 className="text-base font-bold text-stone-900 leading-tight">{person.name}</h4>
                      {person.identity && (
                        <span className="text-xs text-rose-700 font-semibold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200/70 inline-block mt-0.5">
                          {person.identity}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => openEditModal(person)}
                    className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
                    title="编辑人物档案"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {person.aliases && (
                  <p className="text-xs text-stone-500">
                    <span className="font-semibold text-stone-400">别名/外号:</span> {person.aliases}
                  </p>
                )}

                {person.description && (
                  <p className="text-xs text-stone-600 leading-relaxed bg-stone-50 p-2.5 rounded-lg border border-stone-100">
                    {person.description}
                  </p>
                )}

                {person.quotes && (
                  <div className="text-xs text-stone-700 italic border-l-2 border-rose-500 pl-2.5 py-1 bg-rose-50/40 rounded-r">
                    "{person.quotes}"
                  </div>
                )}

                {person.platform_accounts && (
                  <div className="text-[11px] text-stone-500 bg-stone-50 px-2 py-1 rounded border border-stone-100 font-mono truncate">
                    {person.platform_accounts}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-stone-100 flex items-center justify-between">
                <button
                  onClick={() => openEditModal(person)}
                  className="text-xs text-stone-600 hover:text-stone-900 font-medium flex items-center gap-1"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>编辑资料</span>
                </button>

                <button
                  onClick={() => onToggleTopicPerson(person)}
                  className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-0.5 rounded transition-colors"
                >
                  移出本期
                </button>
              </div>
            </div>
          ))}

          {topicPeople.length === 0 && (
            <div className="col-span-full p-8 text-center border-2 border-dashed border-stone-200 rounded-xl bg-white text-stone-400 space-y-2">
              <div>当前尚未关联人物</div>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg border border-rose-200 transition-colors"
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
        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-3 shadow-subtle">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
              <span>从全局人物库快速引入</span>
              <span className="text-xs text-stone-400 font-normal">（点击直接关联至本选题）</span>
            </h4>
            <span className="text-xs text-stone-400 font-mono">未关联 {unattachedPeople.length} 人</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {unattachedPeople.map((person) => (
              <div
                key={person.id}
                className="p-3 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-white hover:border-stone-300 flex items-center justify-between gap-2 transition-all"
              >
                <div className="min-w-0">
                  <div className="font-bold text-xs text-stone-900 truncate">👤 {person.name}</div>
                  {person.identity && (
                    <div className="text-[10px] text-stone-500 truncate">{person.identity}</div>
                  )}
                </div>

                <button
                  onClick={() => onToggleTopicPerson(person)}
                  className="shrink-0 flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg border border-rose-200 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>引入</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Character Relationships */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-bold text-stone-900">本期人物关系网 (Relationships)</h4>
          <span className="text-xs text-stone-400">自动匹配本期出场人物之间的既有关系</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {relevantRelationships.map((rel) => (
            <div
              key={rel.id}
              className="bg-white rounded-xl border border-stone-200 p-4 flex items-center justify-between shadow-subtle"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold text-stone-900">
                  <span>{rel.person_a_name || '人物A'}</span>
                  <span className="text-xs bg-rose-50 text-rose-700 font-semibold px-2 py-0.5 rounded border border-rose-200">
                    {rel.relationship}
                  </span>
                  <span>{rel.person_b_name || '人物B'}</span>
                </div>
                {rel.description && (
                  <p className="text-xs text-stone-500">{rel.description}</p>
                )}
              </div>
            </div>
          ))}

          {relevantRelationships.length === 0 && (
            <div className="col-span-full p-5 text-center text-xs text-stone-400 bg-white border border-stone-200 rounded-xl">
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
        subtitle="沉淀至全局人物库，所有选题均可共享"
      >
        <form onSubmit={handleSavePersonSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-800">
              人物姓名 / 核心昵称 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="例如：大胃袋良子"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm focus:bg-white focus:border-stone-900 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-stone-800">核心身份 / 标签</label>
              <input
                type="text"
                placeholder="例如：吃播网红 / 探店博主"
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm focus:bg-white focus:border-stone-900 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-stone-800">别名 / 外号</label>
              <input
                type="text"
                placeholder="例如：良子、峨眉山战神"
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm focus:bg-white focus:border-stone-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-800">主要平台账号 / 粉丝量</label>
            <input
              type="text"
              placeholder="例如：抖音 @大胃袋良子 (120w)、B站同名"
              value={platformAccounts}
              onChange={(e) => setPlatformAccounts(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm focus:bg-white focus:border-stone-900 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-800">经典语录 / 名言口癖</label>
            <input
              type="text"
              placeholder="例如：“今天这顿必须拿下！”"
              value={quotes}
              onChange={(e) => setQuotes(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm focus:bg-white focus:border-stone-900 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-800">人物背景简介 / 特质分析</label>
            <textarea
              rows={3}
              placeholder="简要概括该人物的生平经历、公共事件、人设演变..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm focus:bg-white focus:border-stone-900 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-lg"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-5 py-2 text-sm bg-stone-900 hover:bg-stone-800 text-white rounded-lg font-semibold disabled:opacity-50"
            >
              {editingPerson ? '保存修改' : '创建并引入本期'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
