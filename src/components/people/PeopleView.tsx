import React, { useState } from 'react';
import { Person, PersonRelationship, Topic } from '../../types';
import { Modal } from '../ui/Modal';
import {
  Users,
  Plus,
  Search,
  ExternalLink,
  Edit2,
  Trash2,
  MessageSquare,
  FileText,
  UserCheck,
  Link2
} from 'lucide-react';

interface PeopleViewProps {
  people: Person[];
  relationships: PersonRelationship[];
  topics: Topic[];
  onSavePerson: (person: Partial<Person> & { name: string }) => Promise<Person | void>;
  onDeletePerson: (personId: string) => Promise<void>;
  onSaveRelationship: (rel: { person_a_id: string; person_b_id: string; relationship: string; description?: string }) => Promise<void>;
  onDeleteRelationship: (relId: string) => Promise<void>;
  onSelectTopic: (topicId: string) => void;
}

export const PeopleView: React.FC<PeopleViewProps> = ({
  people,
  relationships,
  topics,
  onSavePerson,
  onDeletePerson,
  onSaveRelationship,
  onDeleteRelationship,
  onSelectTopic,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);

  const [isRelModalOpen, setIsRelModalOpen] = useState(false);

  // Person form
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [identity, setIdentity] = useState('');
  const [platformAccounts, setPlatformAccounts] = useState('');
  const [quotes, setQuotes] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  // Relationship form
  const [relPersonA, setRelPersonA] = useState('');
  const [relPersonB, setRelPersonB] = useState('');
  const [relName, setRelName] = useState('');
  const [relDesc, setRelDesc] = useState('');

  const openAddPersonModal = () => {
    setEditingPerson(null);
    setName('');
    setAliases('');
    setAvatarUrl('');
    setIdentity('');
    setPlatformAccounts('');
    setQuotes('');
    setDescription('');
    setNotes('');
    setIsPersonModalOpen(true);
  };

  const openEditPersonModal = (p: Person) => {
    setEditingPerson(p);
    setName(p.name);
    setAliases(p.aliases);
    setAvatarUrl(p.avatar_url);
    setIdentity(p.identity);
    setPlatformAccounts(p.platform_accounts);
    setQuotes(p.quotes);
    setDescription(p.description);
    setNotes(p.notes);
    setIsPersonModalOpen(true);
  };

  const handlePersonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await onSavePerson({
      id: editingPerson?.id,
      name: name.trim(),
      aliases: aliases.trim(),
      avatar_url: avatarUrl.trim(),
      identity: identity.trim(),
      platform_accounts: platformAccounts.trim(),
      quotes: quotes.trim(),
      description: description.trim(),
      notes: notes.trim(),
    });

    setIsPersonModalOpen(false);
  };

  const handleRelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!relPersonA || !relPersonB || !relName.trim()) return;

    await onSaveRelationship({
      person_a_id: relPersonA,
      person_b_id: relPersonB,
      relationship: relName.trim(),
      description: relDesc.trim(),
    });

    setIsRelModalOpen(false);
  };

  const filteredPeople = people.filter((p) => {
    const q = searchTerm.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.aliases?.toLowerCase().includes(q) ||
      p.identity?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 w-full h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-rose-600" />
            <span>互联网人物档案与关系库</span>
          </h2>
          <p className="text-sm text-stone-500 mt-1">
            沉淀网红、主播与事件当事人数据库，长线复用背景与人物关系
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (people.length < 2) {
                alert('请先创建至少2位人物以建立关系');
                return;
              }
              setRelPersonA(people[0]?.id || '');
              setRelPersonB(people[1]?.id || '');
              setRelName('');
              setRelDesc('');
              setIsRelModalOpen(true);
            }}
            className="flex items-center gap-1.5 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 px-3.5 py-2 rounded-lg text-sm font-semibold border border-stone-200 dark:border-stone-700 transition-colors cursor-pointer"
          >
            <Link2 className="w-4 h-4 text-stone-500 dark:text-stone-400" />
            <span>+ 记录人物关系</span>
          </button>

          <button
            onClick={openAddPersonModal}
            className="flex items-center gap-1.5 bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>新建人物档案</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-stone-400 dark:text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="搜索人物姓名、身份、别名或语录..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:border-stone-400 dark:focus:border-stone-600 shadow-2xs transition-colors"
        />
      </div>

      {/* People Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredPeople.map((person) => {
          // Find topics involving this person
          const relatedTopics = topics.filter((t) =>
            t.people?.some((p) => p.id === person.id)
          );

          // Find relationships involving this person
          const personRels = relationships.filter(
            (r) => r.person_a_id === person.id || r.person_b_id === person.id
          );

          return (
            <div
              key={person.id}
              className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4 shadow-subtle hover:shadow-card transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                {/* Header info */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {person.avatar_url ? (
                      <img
                        src={person.avatar_url}
                        alt={person.name}
                        className="w-12 h-12 rounded-full object-cover border border-stone-200 dark:border-stone-700 shadow-2xs"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 flex items-center justify-center font-bold text-lg border border-rose-200 dark:border-rose-900/60">
                        {person.name.slice(0, 1)}
                      </div>
                    )}
                    <div>
                      <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100 leading-tight">{person.name}</h3>
                      {person.identity && (
                        <span className="inline-block mt-0.5 text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 px-2 py-0.5 rounded-md font-semibold">
                          {person.identity}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditPersonModal(person)}
                      className="p-1.5 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer transition-colors"
                      title="编辑人物"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`确定要删除人物档案「${person.name}」吗？`)) {
                          onDeletePerson(person.id);
                        }
                      }}
                      className="p-1.5 text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
                      title="删除人物"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {person.aliases && (
                  <p className="text-xs text-stone-400 dark:text-stone-500">
                    <strong className="text-stone-500 dark:text-stone-400">昵称/别名：</strong>
                    {person.aliases}
                  </p>
                )}

                {person.description && (
                  <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed bg-stone-50 dark:bg-stone-800/60 p-3 rounded-lg border border-stone-100 dark:border-stone-800">
                    {person.description}
                  </p>
                )}

                {person.quotes && (
                  <div className="text-xs text-stone-700 dark:text-stone-300 italic border-l-2 border-rose-500 pl-2.5 bg-rose-50/40 dark:bg-rose-950/30 py-1.5 rounded-r">
                    {person.quotes}
                  </div>
                )}

                {/* Relationships list */}
                {personRels.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="text-[11px] font-semibold text-stone-400 dark:text-stone-500">已知关系网：</div>
                    <div className="flex flex-wrap gap-1">
                      {personRels.map((r) => {
                        const targetName =
                          r.person_a_id === person.id ? r.person_b_name : r.person_a_name;
                        return (
                          <span
                            key={r.id}
                            className="text-xs bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 px-2 py-0.5 rounded border border-stone-200 dark:border-stone-700"
                          >
                            与 {targetName}: {r.relationship}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Related topics link */}
              <div className="pt-3 border-t border-stone-100 dark:border-stone-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-stone-400 dark:text-stone-500">
                  <span>登场选题 ({relatedTopics.length})</span>
                  <span className="font-mono">{person.platform_accounts}</span>
                </div>
                {relatedTopics.length > 0 && (
                  <div className="space-y-1">
                    {relatedTopics.slice(0, 2).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => onSelectTopic(t.id)}
                        className="w-full text-left text-xs font-medium text-stone-700 dark:text-stone-300 hover:text-rose-600 dark:hover:text-rose-400 truncate block hover:underline cursor-pointer"
                      >
                        • {t.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filteredPeople.length === 0 && (
          <div className="col-span-full p-12 text-center border-2 border-dashed border-stone-200 dark:border-stone-800 rounded-xl bg-white dark:bg-stone-900 text-stone-400 dark:text-stone-500">
            暂无人物档案记录，点击右上角新建人物！
          </div>
        )}
      </div>

      {/* Modal: Add/Edit Person */}
      <Modal
        isOpen={isPersonModalOpen}
        onClose={() => setIsPersonModalOpen(false)}
        title={editingPerson ? '编辑人物档案' : '新建人物档案'}
        subtitle="独立实体库，便于在多个视频选题中关联与复用"
        maxWidth="md"
      >
        <form onSubmit={handlePersonSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
              姓名 / 核心称呼 <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="例如：大胃袋良子"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">常用昵称 / 别名</label>
              <input
                type="text"
                placeholder="良子, 峨眉山战神"
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">身份标签</label>
              <input
                type="text"
                placeholder="吃播博主 / 健身教练"
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">头像图片 URL</label>
            <input
              type="url"
              placeholder="https://..."
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">主要平台与账号</label>
            <input
              type="text"
              placeholder="抖音: @良子大胃袋 (280w), B站: @良子吃不饱"
              value={platformAccounts}
              onChange={(e) => setPlatformAccounts(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">经典名言 / 代表语录</label>
            <input
              type="text"
              placeholder="“这次上峨眉山，我不是来旅游的...”"
              value={quotes}
              onChange={(e) => setQuotes(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">一句话人物生平与人设简介</label>
            <textarea
              rows={3}
              placeholder="记录该人物的行为特征、性格反差与过往核心黑历史..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setIsPersonModalOpen(false)}
              className="px-4 py-2 text-sm text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg cursor-pointer transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white rounded-lg font-medium cursor-pointer transition-colors"
            >
              {editingPerson ? '更新档案' : '创建档案'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Add Relationship */}
      <Modal
        isOpen={isRelModalOpen}
        onClose={() => setIsRelModalOpen(false)}
        title="记录人物对应关系"
        subtitle="记录两位人物之间的历史渊源与合作/冲突关系"
        maxWidth="md"
      >
        <form onSubmit={handleRelSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">人物 A</label>
              <select
                value={relPersonA}
                onChange={(e) => setRelPersonA(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">人物 B</label>
              <select
                value={relPersonB}
                onChange={(e) => setRelPersonB(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
              关系名称 <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="例如：健身教练 / 商业合伙人 / 助理转恋人"
              value={relName}
              onChange={(e) => setRelName(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">关系详细描述</label>
            <textarea
              rows={3}
              placeholder="记录两人如何认识、何时决裂或产生利益纠葛..."
              value={relDesc}
              onChange={(e) => setRelDesc(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setIsRelModalOpen(false)}
              className="px-4 py-2 text-sm text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg cursor-pointer transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white rounded-lg font-medium cursor-pointer transition-colors"
            >
              保存关系
            </button>
          </div>
        </form>
      </Modal>
      </div>
    </div>
  );
};
