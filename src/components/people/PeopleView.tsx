import React, { useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Person, PersonRelationship, Topic } from '../../types';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
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
  Link2,
  Sparkles,
  Quote,
  Layers
} from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { PageHeader } from '../layout/PageHeader';
import { fetchPeopleOptions, fetchPeoplePage } from '../../lib/storage';
import { sanitizeExternalHttpUrl } from '../../lib/urlSafety';

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
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [deletingPerson, setDeletingPerson] = useState<Person | null>(null);

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

    await queryClient.invalidateQueries({ queryKey: ['people-page'] });
    await queryClient.invalidateQueries({ queryKey: ['people-options'] });

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

    await queryClient.invalidateQueries({ queryKey: ['relationships'] });
    await queryClient.invalidateQueries({ queryKey: ['people-page'] });
    await queryClient.invalidateQueries({ queryKey: ['workspace'] });

    setIsRelModalOpen(false);
  };

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setDebouncedSearchTerm(searchTerm.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const peoplePageQuery = useQuery({
    queryKey: ['people-page', page, debouncedSearchTerm],
    queryFn: () => fetchPeoplePage(page, 30, debouncedSearchTerm),
    placeholderData: keepPreviousData,
  });
  const filteredPeople = peoplePageQuery.data?.items || [];
  const totalPeople = peoplePageQuery.data?.total || 0;
  const peopleOptionsQuery = useQuery({
    queryKey: ['people-options'],
    queryFn: fetchPeopleOptions,
  });
  const peopleOptions = peopleOptionsQuery.data || people.map((person) => ({ id: person.id, name: person.name }));

  return (
    <div className="min-h-0 min-w-0 flex-1 w-full h-full overflow-y-auto overscroll-contain mobile-bottom-nav-content">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <PageHeader
          title="互联网人物档案与关系库"
          icon={Users}
          actions={(
            <>
            <button
              type="button"
              onClick={() => {
                if (peopleOptions.length < 2) {
                  showToast({ message: '请先创建至少2位人物以建立关系', tone: 'info' });
                  return;
                }
                setRelPersonA(peopleOptions[0]?.id || '');
                setRelPersonB(peopleOptions[1]?.id || '');
                setRelName('');
                setRelDesc('');
                setIsRelModalOpen(true);
              }}
              className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-stone-100/80 px-3.5 text-xs font-semibold text-stone-800 transition-colors hover:bg-stone-200/80 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700 sm:text-sm"
            >
              <Link2 className="h-4 w-4 text-stone-500 dark:text-stone-400" aria-hidden="true" />
              <span>+ 记录人物关系</span>
            </button>

            <button
              type="button"
              onClick={openAddPersonModal}
              className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-semibold text-white shadow-2xs transition-all hover:bg-rose-700 hover:shadow-xs active:scale-[0.98] sm:text-sm"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
              <span>新建人物档案</span>
            </button>
            </>
          )}
        />

        {/* Search Bar */}
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-stone-400 dark:text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            id="people-search"
            name="people_search"
            aria-label="搜索人物"
            autoComplete="off"
            placeholder="搜索人物姓名、身份、别名或语录..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3.5 py-2.5 bg-white dark:bg-stone-900 border border-stone-200/70 dark:border-stone-800 rounded-xl text-xs sm:text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:border-rose-500 dark:focus:border-rose-500 shadow-2xs transition-colors"
          />
        </div>

        {/* People Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPeople.map((person) => {
            const relatedTopics = person.related_topic_previews || [];
            const safeAvatarUrl = sanitizeExternalHttpUrl(person.avatar_url);

            const personRels = relationships.filter(
              (r) => r.person_a_id === person.id || r.person_b_id === person.id
            );

            return (
              <div
                key={person.id}
                className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 p-5 space-y-4 shadow-2xs hover:shadow-card hover:-translate-y-0.5 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Header info */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      {safeAvatarUrl ? (
                        <img
                          src={safeAvatarUrl}
                          alt={person.name}
                          width={48}
                          height={48}
                          loading="lazy"
                          decoding="async"
                          className="w-12 h-12 rounded-2xl object-cover border border-stone-200/70 dark:border-stone-700 shadow-2xs shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-700 dark:text-rose-300 flex items-center justify-center font-bold text-lg border border-rose-500/20 shrink-0">
                          {person.name.slice(0, 1)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 leading-tight truncate">
                          {person.name}
                        </h3>
                        {person.identity && (
                          <span className="inline-block mt-1 text-[11px] text-rose-700 dark:text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded-full font-semibold">
                            {person.identity}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditPersonModal(person)}
                        aria-label={`编辑人物档案：${person.name}`}
                        className="p-1.5 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer transition-colors"
                        title="编辑人物档案"
                      >
                        <Edit2 aria-hidden="true" className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingPerson(person)}
                        aria-label={`删除人物档案：${person.name}`}
                        className="p-1.5 text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
                        title="删除人物档案"
                      >
                        <Trash2 aria-hidden="true" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {person.aliases && (
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      <strong className="text-stone-700 dark:text-stone-300 font-semibold">昵称/外号：</strong>
                      {person.aliases}
                    </p>
                  )}

                  {person.description && (
                    <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed bg-stone-500/[0.03] dark:bg-stone-800/60 p-3 rounded-xl border border-stone-200/50 dark:border-stone-800/80">
                      {person.description}
                    </p>
                  )}

                  {person.quotes && (
                    <div className="text-xs text-stone-700 dark:text-stone-300 italic border-l-2 border-rose-500 pl-3 bg-rose-500/[0.04] dark:bg-rose-950/20 py-2 rounded-r-xl">
                      “{person.quotes}”
                    </div>
                  )}

                  {/* Relationships list */}
                  {personRels.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[11px] font-semibold text-stone-400 dark:text-stone-500">已知关系网：</div>
                      <div className="flex flex-wrap gap-1.5">
                        {personRels.map((r) => {
                          const targetName =
                            r.person_a_id === person.id ? r.person_b_name : r.person_a_name;
                          return (
                            <span
                              key={r.id}
                              className="inline-flex items-center text-xs bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 px-2.5 py-0.5 rounded-lg"
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
                    <span className="font-semibold">登场选题 ({relatedTopics.length})</span>
                    <span className="font-mono text-[11px] truncate max-w-[140px]">{person.platform_accounts}</span>
                  </div>
                  {relatedTopics.length > 0 && (
                    <div className="space-y-1">
                      {relatedTopics.slice(0, 2).map((t) => (
                        <button
                          key={t.id}
                          onClick={() => onSelectTopic(t.id)}
                          className="w-full text-left text-xs font-medium text-stone-700 dark:text-stone-300 hover:text-rose-600 dark:hover:text-rose-400 truncate block transition-colors cursor-pointer"
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

          {filteredPeople.length === 0 && !peoplePageQuery.isFetching && (
            <div className="col-span-full p-12 text-center border-2 border-dashed border-stone-200/80 dark:border-stone-800 rounded-2xl bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400">
              暂无人物档案记录，点击右上角新建人物！
            </div>
          )}
        </div>

        {totalPeople > 0 && (
          <div className="flex items-center justify-center gap-3 text-xs text-stone-500 dark:text-stone-400">
            <button type="button" disabled={page <= 1 || peoplePageQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-stone-200 bg-white px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900">上一页</button>
            <span><span className="font-mono tabular-nums">{page} / {Math.max(1, peoplePageQuery.data?.total_pages || 1)}</span> · 共 <span className="font-mono tabular-nums">{totalPeople}</span> 人</span>
            <button type="button" disabled={page >= (peoplePageQuery.data?.total_pages || 1) || peoplePageQuery.isFetching} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-stone-200 bg-white px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900">下一页</button>
          </div>
        )}

        {/* Modal: Add/Edit Person */}
        <Modal
          isOpen={isPersonModalOpen}
          onClose={() => setIsPersonModalOpen(false)}
          title={editingPerson ? '编辑人物档案' : '新建人物档案'}
          maxWidth="md"
        >
          <form onSubmit={handlePersonSubmit} className="space-y-4">
            <div>
              <label htmlFor="person-name" className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1">
                姓名 / 核心称呼 <span className="text-rose-600">*</span>
              </label>
              <input
                id="person-name"
                name="name"
                type="text"
                required
                autoComplete="name"
                placeholder="例如：大胃袋良子"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="person-aliases" className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1">常用昵称 / 别名</label>
                <input
                  id="person-aliases"
                  name="aliases"
                  type="text"
                  autoComplete="off"
                  placeholder="良子, 峨眉山战神"
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="person-identity" className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1">身份标签</label>
                <input
                  id="person-identity"
                  name="identity"
                  type="text"
                  autoComplete="off"
                  placeholder="吃播博主 / 健身教练"
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="person-avatar-url" className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1">头像图片 URL</label>
              <input
                id="person-avatar-url"
                name="avatar_url"
                type="url"
                autoComplete="url"
                placeholder="https://..."
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="person-platform-accounts" className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1">主要平台与账号</label>
              <input
                id="person-platform-accounts"
                name="platform_accounts"
                type="text"
                autoComplete="off"
                placeholder="抖音: @良子大胃袋 (280w), B站: @良子吃不饱"
                value={platformAccounts}
                onChange={(e) => setPlatformAccounts(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="person-quotes" className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1">经典名言 / 代表语录</label>
              <input
                id="person-quotes"
                name="quotes"
                type="text"
                autoComplete="off"
                placeholder="“这次上峨眉山，我不是来旅游的...”"
                value={quotes}
                onChange={(e) => setQuotes(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="person-description" className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1">一句话人物生平与人设简介</label>
              <textarea
                id="person-description"
                name="description"
                autoComplete="off"
                rows={3}
                placeholder="记录该人物的行为特征、性格反差与过往核心黑历史..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 focus:outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200/70 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setIsPersonModalOpen(false)}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl cursor-pointer transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs sm:text-sm bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold cursor-pointer transition-all shadow-2xs"
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
          maxWidth="md"
        >
          <form onSubmit={handleRelSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label id="relationship-person-a-label" className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1">人物 A</label>
                <CustomSelect
                  value={relPersonA}
                  onChange={(val) => setRelPersonA(val)}
                  ariaLabel="人物 A"
                  ariaLabelledBy="relationship-person-a-label"
                  className="w-full"
                  buttonClassName="w-full justify-between py-2 text-sm bg-stone-500/[0.03] dark:bg-stone-800 border-stone-200/80 dark:border-stone-700 rounded-xl"
                  options={peopleOptions.map((p) => ({ value: p.id, label: p.name }))}
                />
              </div>
              <div>
                <label id="relationship-person-b-label" className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1">人物 B</label>
                <CustomSelect
                  value={relPersonB}
                  onChange={(val) => setRelPersonB(val)}
                  ariaLabel="人物 B"
                  ariaLabelledBy="relationship-person-b-label"
                  className="w-full"
                  buttonClassName="w-full justify-between py-2 text-sm bg-stone-500/[0.03] dark:bg-stone-800 border-stone-200/80 dark:border-stone-700 rounded-xl"
                  options={peopleOptions.map((p) => ({ value: p.id, label: p.name }))}
                />
              </div>
            </div>

            <div>
              <label htmlFor="relationship-name" className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1">
                关系定性 <span className="text-rose-600">*</span>
              </label>
              <input
                id="relationship-name"
                name="relationship_name"
                type="text"
                required
                autoComplete="off"
                placeholder="例如：师徒反目 / 商业对手 / 前合伙人"
                value={relName}
                onChange={(e) => setRelName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="relationship-description" className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1">关系背景补充说明</label>
              <textarea
                id="relationship-description"
                name="relationship_description"
                autoComplete="off"
                rows={2}
                placeholder="简要说明双方爆发冲突或合作的关键时间点与事件..."
                value={relDesc}
                onChange={(e) => setRelDesc(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 focus:outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200/70 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setIsRelModalOpen(false)}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl cursor-pointer transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs sm:text-sm bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold cursor-pointer transition-all shadow-2xs"
              >
                保存关系
              </button>
            </div>
          </form>
        </Modal>

        <ConfirmDialog
          isOpen={Boolean(deletingPerson)}
          onClose={() => setDeletingPerson(null)}
          onConfirm={async () => {
            if (!deletingPerson) return;
            await onDeletePerson(deletingPerson.id);
            if (filteredPeople.length === 1 && page > 1) setPage((current) => current - 1);
            await queryClient.invalidateQueries({ queryKey: ['people-page'] });
            await queryClient.invalidateQueries({ queryKey: ['people-options'] });
            await queryClient.invalidateQueries({ queryKey: ['people'] });
            await queryClient.invalidateQueries({ queryKey: ['relationships'] });
            await queryClient.invalidateQueries({ queryKey: ['workspace'] });
            setDeletingPerson(null);
            showToast({ message: `已删除人物档案「${deletingPerson.name}」`, tone: 'info' });
          }}
          title="删除人物档案"
          description={deletingPerson ? `确定要删除人物档案「${deletingPerson.name}」吗？\n\n人物关联关系网将一并解除，但不会影响已写文案内容。` : ''}
          confirmText="删除档案"
          tone="danger"
        />
      </div>
    </div>
  );
};
