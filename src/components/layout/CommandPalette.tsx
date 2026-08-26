import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Plus,
  Kanban,
  User,
  FileText,
  Calendar,
  Film,
  Handshake,
  Database,
  Settings,
  Hash,
  CornerDownLeft,
  Inbox,
  Download,
  Palette,
  Keyboard,
  CheckCircle2,
  Sparkles,
  HelpCircle,
  Check,
} from 'lucide-react';
import { Topic, Person, Tag, AppTheme, TopicStatus } from '../../types';
import { NavView } from './Sidebar';
import { StatusBadge, PriorityBadge } from '../ui/Badge';
import { fetchTopicPage } from '../../lib/storage';
import { THEME_CONFIG_LIST } from '../../lib/theme';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  topics: Topic[];
  people: Person[];
  tags?: Tag[];
  currentTheme?: AppTheme;
  onSelectTopic: (topicId: string) => void;
  onSelectPerson: (personId: string) => void;
  onSelectTag?: (tagName: string) => void;
  onNavigate: (view: NavView) => void;
  onOpenQuickCreate: (initialTitle: string) => void;
  onOpenQuickDrops?: () => void;
  onSelectTheme?: (theme: AppTheme) => void;
  onExportBackup?: () => void;
  onExportMarkdown?: () => void;
  onFilterStatus?: (status: TopicStatus) => void;
}

interface SelectableItem {
  id: string;
  category: 'action' | 'topic' | 'tag' | 'person' | 'nav' | 'theme' | 'help';
  categoryLabel: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
  icon: React.ComponentType<{ className?: string }>;
  extra?: React.ReactNode;
  onSelect: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  topics,
  people,
  tags = [],
  currentTheme,
  onSelectTopic,
  onSelectPerson,
  onSelectTag,
  onNavigate,
  onOpenQuickCreate,
  onOpenQuickDrops,
  onSelectTheme,
  onExportBackup,
  onExportMarkdown,
  onFilterStatus,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [debouncedCleanQ, setDebouncedCleanQ] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const rawQ = query.trim();

  // Mode detection based on prefix
  const { mode, cleanQ } = useMemo(() => {
    if (rawQ.startsWith('#')) return { mode: 'tag', cleanQ: rawQ.slice(1).trim().toLowerCase() };
    if (rawQ.startsWith('@')) return { mode: 'person', cleanQ: rawQ.slice(1).trim().toLowerCase() };
    if (rawQ.startsWith('>')) return { mode: 'action', cleanQ: rawQ.slice(1).trim().toLowerCase() };
    if (rawQ.startsWith('?') || rawQ.startsWith('？') || rawQ === 'help' || rawQ === '帮助') {
      return { mode: 'help', cleanQ: rawQ.replace(/^[?？]/, '').trim().toLowerCase() };
    }
    return { mode: 'all', cleanQ: rawQ.toLowerCase() };
  }, [rawQ]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedCleanQ(cleanQ), 200);
    return () => window.clearTimeout(timeout);
  }, [cleanQ]);

  const topicSearchQuery = useQuery({
    queryKey: ['command-topic-search', debouncedCleanQ],
    queryFn: () => fetchTopicPage({ scope: 'all', q: debouncedCleanQ, page: 1, page_size: 20, sort: 'updated_at' }),
    enabled: isOpen && mode === 'all' && debouncedCleanQ.length > 0,
  });

  // 1. Navigation commands
  const allNavCommands = useMemo(() => [
    { label: '前往 今日生产聚焦', view: 'today' as NavView, icon: Calendar, desc: '推进当前重点选题，减少选择焦虑', keywords: ['今日', '聚焦', 'today', 'focus', '任务'] },
    { label: '前往 选题全景看板', view: 'kanban' as NavView, icon: Kanban, desc: '4 个活跃阶段 + 2 个归档状态', keywords: ['看板', 'kanban', 'board', '选题看板', '主页'] },
    { label: '前往 标签与创作赛道', view: 'tags' as NavView, icon: Hash, desc: '分类赛道沉淀与选题资产盘点', keywords: ['标签', '赛道', 'tags', 'track', '分类'] },
    { label: '前往 人物档案库', view: 'people' as NavView, icon: User, desc: '网红与事件当事人关系库', keywords: ['人物', '网红', '档案', 'people', '关系网', '主播'] },
    { label: '前往 已发布视频复盘', view: 'published' as NavView, icon: Film, desc: '归档成片与 B 站数据沉淀', keywords: ['发布', '复盘', 'published', '成片', '视频', 'bilibili', 'b站'] },
    { label: '前往 商单中心', view: 'deals' as NavView, icon: Handshake, desc: '管理商务沟通、交付、审核与回款', keywords: ['商单', '商务', '品牌', '客户', '回款', '花火', 'deal'] },
    { label: '前往 选题库', view: 'database' as NavView, icon: Database, desc: '全量多维数据表格与归档沉淀', keywords: ['选题库', '数据表格', 'database', '表格', '归档'] },
    { label: '前往 偏好与数据备份', view: 'settings' as NavView, icon: Settings, desc: '语速设置、视觉主题与数据备份', keywords: ['设置', '偏好', '备份', 'settings', '主题', '语速', '导出'] },
  ], []);

  // 2. Help items
  const helpItems: SelectableItem[] = useMemo(() => [
    {
      id: 'help-cmd-p',
      category: 'help',
      categoryLabel: '全局快捷键',
      title: 'Ctrl + P / Cmd + P',
      subtitle: '全局呼出此指令面板（任何输入框、正文聚焦或专注全屏均可用）',
      keywords: ['ctrl+p', 'cmd+p', '快捷键', '搜索', '指令'],
      icon: Keyboard,
      onSelect: () => onClose(),
    },
    {
      id: 'help-teleprompter',
      category: 'help',
      categoryLabel: '文案与演播',
      title: 'Cmd / Ctrl + Shift + P',
      subtitle: '全屏沉浸录音提词器（文案编辑页快速进入导播演播模式）',
      keywords: ['提词器', '录音', 'teleprompter', '演播'],
      icon: Keyboard,
      onSelect: () => onClose(),
    },
    {
      id: 'help-zen',
      category: 'help',
      categoryLabel: '文案与演播',
      title: 'Cmd / Ctrl + Shift + F',
      subtitle: '文案编辑专注全屏模式（纯净无干扰沉浸写作）',
      keywords: ['专注', '全屏', 'zen', '写作'],
      icon: Keyboard,
      onSelect: () => onClose(),
    },
    {
      id: 'help-quick-new',
      category: 'help',
      categoryLabel: '看板操作',
      title: 'N',
      subtitle: '快速新建选题（非输入状态下直接按 N 键）',
      keywords: ['新建', 'n', 'new'],
      icon: Keyboard,
      onSelect: () => {
        onClose();
        onOpenQuickCreate('');
      },
    },
    {
      id: 'help-search-slash',
      category: 'help',
      categoryLabel: '看板操作',
      title: '/',
      subtitle: '快速呼出指令搜索面板（非输入状态下按斜杠键）',
      keywords: ['/', '斜杠', '搜索'],
      icon: Keyboard,
      onSelect: () => onClose(),
    },
    {
      id: 'help-esc',
      category: 'help',
      categoryLabel: '通用操作',
      title: 'Esc',
      subtitle: '关闭当前浮窗、弹窗、气口选单、抽屉或退出专注全屏',
      keywords: ['esc', '退出', '关闭'],
      icon: Keyboard,
      onSelect: () => onClose(),
    },
  ], [onClose, onOpenQuickCreate]);

  // Match item helper supporting title, subtitle, categoryLabel, and rich keywords
  const matchItem = (item: SelectableItem, q: string): boolean => {
    if (!q) return true;
    if (item.title.toLowerCase().includes(q)) return true;
    if (item.subtitle && item.subtitle.toLowerCase().includes(q)) return true;
    if (item.categoryLabel.toLowerCase().includes(q)) return true;
    if (item.keywords && item.keywords.some((k) => k.toLowerCase().includes(q))) return true;
    return false;
  };

  // 3. Build flat selectable items
  const items: SelectableItem[] = useMemo(() => {
    const list: SelectableItem[] = [];

    // Help Mode
    if (mode === 'help') {
      return helpItems;
    }

    // Quick create action (if query entered and mode allows)
    if (rawQ && (mode === 'all' || mode === 'action')) {
      const cleanTitle = rawQ.replace(/^[>#@]\s*/, '').trim();
      if (cleanTitle) {
        list.push({
          id: 'action-quick-create',
          category: 'action',
          categoryLabel: '快捷动作',
          title: `新建选题："${cleanTitle}"`,
          subtitle: '回车立即打开新建弹窗捕获灵感',
          keywords: ['新建', '创建', 'new', 'create', cleanTitle],
          icon: Plus,
          onSelect: () => {
            onClose();
            onOpenQuickCreate(cleanTitle);
          },
        });
      }
    }

    // Utility Actions
    const utilityActions: SelectableItem[] = [];

    if (onOpenQuickDrops) {
      utilityActions.push({
        id: 'action-open-drops',
        category: 'action',
        categoryLabel: '快捷动作',
        title: '打开手机灵感快投箱',
        subtitle: '查看手机快捷指令或 Webhook 投递的碎片灵感',
        keywords: ['快投箱', '手机', '灵感', 'drop', 'quick drop', '快捷指令', 'webhook', 'ios'],
        icon: Inbox,
        onSelect: () => {
          onClose();
          onOpenQuickDrops();
        },
      });
    }

    utilityActions.push({
      id: 'action-new-topic',
      category: 'action',
      categoryLabel: '快捷动作',
      title: '新建选题 / 收集灵感',
      subtitle: '打开新建选题弹窗 (快捷键 N)',
      keywords: ['新建', '创建', '灵感', '选题', 'new', 'create', 'n', '+'],
      icon: Plus,
      onSelect: () => {
        onClose();
        onOpenQuickCreate('');
      },
    });

    if (onExportBackup) {
      utilityActions.push({
        id: 'action-export-backup',
        category: 'action',
        categoryLabel: '快捷动作',
        title: '下载全量数据备份 (JSON)',
        subtitle: '导出包含所有选题、人物、赛道与文案的离线备份包',
        keywords: ['备份', '导出', 'backup', 'json', '下载', '恢复'],
        icon: Download,
        onSelect: () => {
          onClose();
          onExportBackup();
        },
      });
    }

    if (onExportMarkdown) {
      utilityActions.push({
        id: 'action-export-markdown',
        category: 'action',
        categoryLabel: '快捷动作',
        title: '导出所有文案讲稿 (Markdown)',
        subtitle: '导出所有已撰写文案的 Markdown 合集压缩归档',
        keywords: ['导出', 'markdown', 'md', '文案', '讲稿', '文档', '解说词'],
        icon: FileText,
        onSelect: () => {
          onClose();
          onExportMarkdown();
        },
      });
    }

    utilityActions.push({
      id: 'action-help-mode',
      category: 'action',
      categoryLabel: '快捷动作',
      title: '快捷键与帮助总览',
      subtitle: '查看全站所有高效创作快捷键清单 (输入 ?)',
      keywords: ['帮助', '快捷键', 'help', 'hotkey', '手册', '说明', '?'],
      icon: HelpCircle,
      onSelect: () => {
        setQuery('?');
      },
    });

    // Theme Actions (All 8 canonical themes from THEME_CONFIG_LIST with full synonyms)
    const themeActions: SelectableItem[] = THEME_CONFIG_LIST.map((t) => {
      const isCurrent = currentTheme === t.id;
      const isDarkType = t.id.includes('dark') || t.id.includes('obsidian');
      return {
        id: `theme-${t.id}`,
        category: 'theme',
        categoryLabel: '视觉主题',
        title: `外观：${t.title}`,
        subtitle: t.desc,
        keywords: [
          '主题',
          'theme',
          '外观',
          '皮肤',
          '配色',
          '颜色',
          t.id,
          t.title,
          isDarkType ? '深色' : '浅色',
          isDarkType ? '暗色' : '明亮',
          t.tag || '',
        ],
        icon: Palette,
        extra: (
          <div className="flex items-center gap-1.5 shrink-0">
            {t.tag && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold shrink-0">
                {t.tag}
              </span>
            )}
            {isCurrent && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold shrink-0 flex items-center gap-0.5">
                <Check className="w-3 h-3 stroke-[2.5]" />
                <span>当前使用</span>
              </span>
            )}
          </div>
        ),
        onSelect: () => {
          onSelectTheme?.(t.id);
          onClose();
        },
      };
    });

    // Status Filter Actions
    const statusActions: SelectableItem[] = onFilterStatus
      ? [
          {
            id: 'filter-scripting',
            category: 'action',
            categoryLabel: '生命周期直达',
            title: '看板筛选：写稿中 (Scripting)',
            subtitle: '只看正在撰写文案解说的选题',
            keywords: ['写稿中', 'scripting', '写稿', '文案', '筛选'],
            icon: FileText,
            onSelect: () => {
              onFilterStatus('scripting');
              onNavigate('kanban');
              onClose();
            },
          },
          {
            id: 'filter-production',
            category: 'action',
            categoryLabel: '生命周期直达',
            title: '看板筛选：待制作 (Production)',
            subtitle: '只看文案已定稿、等待录音剪辑的选题',
            keywords: ['待制作', 'production', '录音', '剪辑', '制作', '筛选'],
            icon: Sparkles,
            onSelect: () => {
              onFilterStatus('production');
              onNavigate('kanban');
              onClose();
            },
          },
          {
            id: 'filter-approved',
            category: 'action',
            categoryLabel: '生命周期直达',
            title: '看板筛选：已立项 (Approved)',
            subtitle: '只看故事线成立、准备开工的选题',
            keywords: ['已立项', 'approved', '立项', '开工', '筛选'],
            icon: CheckCircle2,
            onSelect: () => {
              onFilterStatus('approved');
              onNavigate('kanban');
              onClose();
            },
          },
          {
            id: 'filter-inbox',
            category: 'action',
            categoryLabel: '生命周期直达',
            title: '看板筛选：收集箱 (Inbox)',
            subtitle: '查看所有处于灵感碎片与线索阶段的选题',
            keywords: ['收集箱', 'inbox', '灵感', '线索', '筛选'],
            icon: Inbox,
            onSelect: () => {
              onFilterStatus('inbox');
              onNavigate('kanban');
              onClose();
            },
          },
        ]
      : [];

    // Tag Mode
    if (mode === 'tag') {
      const matched = cleanQ ? tags.filter((t) => t.name.toLowerCase().includes(cleanQ)) : tags;
      matched.forEach((tag) => {
        list.push({
          id: `tag-${tag.id}`,
          category: 'tag',
          categoryLabel: '创作赛道',
          title: `#${tag.name}`,
          subtitle: '按赛道快速筛选看板',
          icon: Hash,
          onSelect: () => {
            if (onSelectTag) onSelectTag(tag.name);
            else onNavigate('tags');
            onClose();
          },
        });
      });
      return list;
    }

    // Person Mode
    if (mode === 'person') {
      const matched = cleanQ
        ? people.filter(
            (p) =>
              p.name.toLowerCase().includes(cleanQ) ||
              (p.aliases || '').toLowerCase().includes(cleanQ) ||
              (p.identity || '').toLowerCase().includes(cleanQ)
          )
        : people;
      matched.forEach((person) => {
        list.push({
          id: `person-${person.id}`,
          category: 'person',
          categoryLabel: '人物档案',
          title: person.name,
          subtitle: person.identity ? `${person.identity}${person.aliases ? ` · 别名：${person.aliases}` : ''}` : person.aliases || undefined,
          icon: User,
          onSelect: () => {
            onSelectPerson(person.id);
            onClose();
          },
        });
      });
      return list;
    }

    // Action Mode ('>' prefix)
    if (mode === 'action') {
      const allActionPool = [...utilityActions, ...statusActions, ...themeActions];
      const matched = cleanQ ? allActionPool.filter((c) => matchItem(c, cleanQ)) : allActionPool;
      return [...list, ...matched];
    }

    // Default 'all' Mode when query is empty:
    if (!cleanQ) {
      list.push(...utilityActions.slice(0, 4));
      list.push(...themeActions);
      allNavCommands.forEach((cmd) => {
        list.push({
          id: `nav-${cmd.view}`,
          category: 'nav',
          categoryLabel: '页面跳转',
          title: cmd.label,
          subtitle: cmd.desc,
          keywords: cmd.keywords,
          icon: cmd.icon,
          onSelect: () => {
            onNavigate(cmd.view);
            onClose();
          },
        });
      });
      topics.slice(0, 5).forEach((topic) => {
        list.push({
          id: `topic-${topic.id}`,
          category: 'topic',
          categoryLabel: '近期活跃选题',
          title: topic.title,
          subtitle: topic.next_action ? `⚡ 下一步：${topic.next_action}` : topic.summary || topic.hook || undefined,
          icon: FileText,
          extra: (
            <div className="flex items-center gap-1.5 shrink-0">
              <StatusBadge status={topic.status} />
              {topic.priority && topic.priority !== 'none' && (
                <PriorityBadge priority={topic.priority} />
              )}
            </div>
          ),
          onSelect: () => {
            onSelectTopic(topic.id);
            onClose();
          },
        });
      });
      tags.slice(0, 4).forEach((tag) => {
        list.push({
          id: `tag-${tag.id}`,
          category: 'tag',
          categoryLabel: '创作赛道',
          title: `#${tag.name}`,
          subtitle: '按此赛道快速筛选看板',
          icon: Hash,
          onSelect: () => {
            if (onSelectTag) onSelectTag(tag.name);
            else onNavigate('tags');
            onClose();
          },
        });
      });
      return list;
    }

    // When query is entered in 'all' mode:
    if (cleanQ) {
      // 1. Matched Theme Actions (NEVER truncate themes so all 8 are visible when searching theme/外观)
      const matchedThemes = themeActions.filter((t) => matchItem(t, cleanQ));
      if (matchedThemes.length > 0) {
        list.push(...matchedThemes);
      }

      // 2. Matched Utility & Status Actions
      const matchedActions = [...utilityActions, ...statusActions].filter((c) => matchItem(c, cleanQ));
      list.push(...matchedActions.slice(0, 5));

      // 3. Matched Navs
      const matchedNavs = allNavCommands.filter((cmd) => {
        const item: SelectableItem = {
          id: `nav-${cmd.view}`,
          category: 'nav',
          categoryLabel: '页面跳转',
          title: cmd.label,
          subtitle: cmd.desc,
          keywords: cmd.keywords,
          icon: cmd.icon,
          onSelect: () => {},
        };
        return matchItem(item, cleanQ);
      });
      matchedNavs.forEach((cmd) => {
        list.push({
          id: `nav-${cmd.view}`,
          category: 'nav',
          categoryLabel: '页面跳转',
          title: cmd.label,
          subtitle: cmd.desc,
          keywords: cmd.keywords,
          icon: cmd.icon,
          onSelect: () => {
            onNavigate(cmd.view);
            onClose();
          },
        });
      });

      // 4. Matched Topics
      const matchedTopics = topicSearchQuery.data?.items || topics.filter((t) => t.title.toLowerCase().includes(cleanQ));
      matchedTopics.slice(0, 6).forEach((topic) => {
        list.push({
          id: `topic-${topic.id}`,
          category: 'topic',
          categoryLabel: '匹配选题',
          title: topic.title,
          subtitle: topic.next_action ? `⚡ 下一步：${topic.next_action}` : topic.summary || topic.hook || undefined,
          icon: FileText,
          extra: (
            <div className="flex items-center gap-1.5 shrink-0">
              <StatusBadge status={topic.status} />
              {topic.priority && topic.priority !== 'none' && (
                <PriorityBadge priority={topic.priority} />
              )}
            </div>
          ),
          onSelect: () => {
            onSelectTopic(topic.id);
            onClose();
          },
        });
      });

      // 5. Matched People
      const matchedPeople = people.filter(
        (p) =>
          p.name.toLowerCase().includes(cleanQ) ||
          (p.aliases || '').toLowerCase().includes(cleanQ) ||
          (p.identity || '').toLowerCase().includes(cleanQ)
      );
      matchedPeople.slice(0, 4).forEach((person) => {
        list.push({
          id: `person-${person.id}`,
          category: 'person',
          categoryLabel: '人物档案',
          title: person.name,
          subtitle: person.identity ? `${person.identity}${person.aliases ? ` · 别名：${person.aliases}` : ''}` : person.aliases || undefined,
          icon: User,
          onSelect: () => {
            onSelectPerson(person.id);
            onClose();
          },
        });
      });

      // 6. Matched Tags
      const matchedTags = tags.filter((t) => t.name.toLowerCase().includes(cleanQ));
      matchedTags.slice(0, 4).forEach((tag) => {
        list.push({
          id: `tag-${tag.id}`,
          category: 'tag',
          categoryLabel: '创作赛道',
          title: `#${tag.name}`,
          subtitle: '按赛道快速筛选',
          icon: Hash,
          onSelect: () => {
            if (onSelectTag) onSelectTag(tag.name);
            else onNavigate('tags');
            onClose();
          },
        });
      });
    }

    return list;
  }, [
    mode,
    cleanQ,
    rawQ,
    helpItems,
    onOpenQuickDrops,
    onExportBackup,
    onExportMarkdown,
    currentTheme,
    onSelectTheme,
    onClose,
    onFilterStatus,
    onNavigate,
    tags,
    onSelectTag,
    people,
    onSelectPerson,
    allNavCommands,
    topics,
    onSelectTopic,
    topicSearchQuery.data?.items,
    onOpenQuickCreate,
  ]);

  // Reset or clamp selectedIndex
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[selectedIndex]) {
        items[selectedIndex].onSelect();
      }
    }
  };

  const handleSetPrefix = (prefix: string) => {
    setQuery(prefix);
    inputRef.current?.focus();
  };

  if (!isOpen) return null;

  const paletteContent = (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-12 sm:pt-16 p-4 sm:p-6" role="presentation">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs animate-in fade-in duration-200" onClick={onClose} aria-hidden="true" />

      {/* Palette Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="全局指令搜索面板"
        className="relative w-full max-w-2xl bg-white dark:bg-stone-900 rounded-2xl shadow-modal border border-stone-200/70 dark:border-stone-800 overflow-hidden flex flex-col z-10 animate-in fade-in slide-in-from-top-2 zoom-in-95 duration-200 ease-editorial-out transition-colors max-h-[85dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Header */}
        <div className="flex items-center px-4 py-3.5 border-b border-stone-200/70 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/90">
          <Search className="w-5 h-5 text-stone-400 dark:text-stone-500 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="输入指令、搜索选题、#赛道、@人物、>动作、?帮助..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full text-sm sm:text-base bg-transparent border-none outline-none text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 font-medium"
          />
          {mode !== 'all' && (
            <span className="mr-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 shrink-0 font-mono">
              {mode === 'tag' ? '# 赛道模式' : mode === 'person' ? '@ 人物模式' : mode === 'help' ? '? 快捷键模式' : '> 动作模式'}
            </span>
          )}
          <kbd className="text-xs bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 px-2 py-0.5 rounded-lg border border-stone-200/70 dark:border-stone-700 font-mono shrink-0 shadow-2xs">
            ESC
          </kbd>
        </div>

        {/* Mode Quick Filter Chips */}
        <div className="px-4 py-2 bg-stone-500/[0.03] dark:bg-stone-800/60 border-b border-stone-200/60 dark:border-stone-700/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs font-semibold transition-colors">
          <span className="text-stone-400 dark:text-stone-500 text-[10px] uppercase font-bold tracking-wider mr-1 shrink-0">模式:</span>
          <button
            type="button"
            onClick={() => handleSetPrefix('')}
            className={`px-3 py-1 rounded-xl transition-all cursor-pointer shrink-0 ${
              mode === 'all' && !query
                ? 'bg-rose-600 text-white shadow-2xs font-bold'
                : 'bg-stone-500/[0.05] dark:bg-stone-700/60 hover:bg-stone-500/[0.1] dark:hover:bg-stone-600 text-stone-800 dark:text-stone-100 font-medium'
            }`}
          >
            全部
          </button>
          <button
            type="button"
            onClick={() => handleSetPrefix('> ')}
            className={`px-3 py-1 rounded-xl transition-all cursor-pointer shrink-0 font-mono ${
              mode === 'action'
                ? 'bg-rose-600 text-white shadow-2xs font-bold'
                : 'bg-stone-500/[0.05] dark:bg-stone-700/60 hover:bg-stone-500/[0.1] dark:hover:bg-stone-600 text-stone-800 dark:text-stone-100 font-medium'
            }`}
          >
            &gt; 快捷动作
          </button>
          <button
            type="button"
            onClick={() => handleSetPrefix('# ')}
            className={`px-3 py-1 rounded-xl transition-all cursor-pointer shrink-0 font-mono ${
              mode === 'tag'
                ? 'bg-rose-600 text-white shadow-2xs font-bold'
                : 'bg-stone-500/[0.05] dark:bg-stone-700/60 hover:bg-stone-500/[0.1] dark:hover:bg-stone-600 text-stone-800 dark:text-stone-100 font-medium'
            }`}
          >
            # 赛道标签
          </button>
          <button
            type="button"
            onClick={() => handleSetPrefix('@ ')}
            className={`px-3 py-1 rounded-xl transition-all cursor-pointer shrink-0 font-mono ${
              mode === 'person'
                ? 'bg-rose-600 text-white shadow-2xs font-bold'
                : 'bg-stone-500/[0.05] dark:bg-stone-700/60 hover:bg-stone-500/[0.1] dark:hover:bg-stone-600 text-stone-800 dark:text-stone-100 font-medium'
            }`}
          >
            @ 人物库
          </button>
          <button
            type="button"
            onClick={() => handleSetPrefix('? ')}
            className={`px-3 py-1 rounded-xl transition-all cursor-pointer shrink-0 font-mono ${
              mode === 'help'
                ? 'bg-rose-600 text-white shadow-2xs font-bold'
                : 'bg-stone-500/[0.05] dark:bg-stone-700/60 hover:bg-stone-500/[0.1] dark:hover:bg-stone-600 text-stone-800 dark:text-stone-100 font-medium'
            }`}
          >
            ? 快捷键大全
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-[480px] overflow-y-auto overscroll-contain p-2 space-y-1 divide-y divide-stone-50 dark:divide-stone-800/60">
          {items.map((item, index) => {
            const isSelected = index === selectedIndex;
            const Icon = item.icon;
            const prevItem = index > 0 ? items[index - 1] : null;
            const isNewCategory = !prevItem || prevItem.categoryLabel !== item.categoryLabel;

            return (
              <React.Fragment key={item.id}>
                {isNewCategory && (
                  <div className="pt-2.5 pb-1 px-3 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-wider flex items-center justify-between">
                    <span>{item.categoryLabel}</span>
                  </div>
                )}
                <button
                  ref={(el) => { itemRefs.current[index] = el; }}
                  onClick={item.onSelect}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer group ${
                    isSelected
                      ? 'bg-rose-50/70 dark:bg-rose-950/50 text-rose-950 dark:text-rose-100 ring-1 ring-rose-200 dark:ring-rose-800 shadow-2xs'
                      : 'text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800/60'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                        isSelected
                          ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 group-hover:bg-stone-200/80 dark:group-hover:bg-stone-700 group-hover:text-stone-800 dark:group-hover:text-stone-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>

                    <div className="truncate flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-stone-900 dark:text-stone-100 text-sm truncate">
                          {item.title}
                        </span>
                      </div>

                      {item.subtitle && (
                        <div className="text-xs text-stone-400 dark:text-stone-500 group-hover:text-stone-500 dark:group-hover:text-stone-400 truncate mt-0.5 font-normal">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    {item.extra}
                    <CornerDownLeft
                      className={`w-3.5 h-3.5 transition-opacity ${
                        isSelected ? 'text-rose-600 dark:text-rose-400 opacity-100' : 'text-stone-300 dark:text-stone-600 opacity-0 group-hover:opacity-60'
                      }`}
                    />
                  </div>
                </button>
              </React.Fragment>
            );
          })}

          {items.length === 0 && (
            <div className="py-12 text-center text-stone-400 dark:text-stone-500 space-y-1">
              <div className="text-sm font-medium">没有找到匹配项</div>
              <div className="text-xs text-stone-400 dark:text-stone-500">
                可尝试输入 <strong className="text-stone-600 dark:text-stone-300">#</strong> 查赛道、<strong className="text-stone-600 dark:text-stone-300">@</strong> 查人物、<strong className="text-stone-600 dark:text-stone-300">&gt;</strong> 执行动作、<strong className="text-stone-600 dark:text-stone-300">?</strong> 查看快捷键
              </div>
            </div>
          )}
        </div>

        {/* Footer Keybinding Hints Bar */}
        <div className="px-4 py-2.5 bg-stone-50 dark:bg-stone-900/90 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400 font-medium shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="bg-white dark:bg-stone-800 px-1.5 py-0.5 rounded border border-stone-200 dark:border-stone-700 font-mono shadow-2xs text-stone-700 dark:text-stone-300">↑</kbd>
              <kbd className="bg-white dark:bg-stone-800 px-1.5 py-0.5 rounded border border-stone-200 dark:border-stone-700 font-mono shadow-2xs text-stone-700 dark:text-stone-300">↓</kbd>
              <span>选择</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-white dark:bg-stone-800 px-1.5 py-0.5 rounded border border-stone-200 dark:border-stone-700 font-mono shadow-2xs text-stone-700 dark:text-stone-300">↵</kbd>
              <span>确认执行</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-white dark:bg-stone-800 px-1.5 py-0.5 rounded border border-stone-200 dark:border-stone-700 font-mono shadow-2xs text-stone-700 dark:text-stone-300">ESC</kbd>
              <span>关闭</span>
            </span>
          </div>

          <div className="text-stone-400 dark:text-stone-500 text-[10px] font-mono">
            共 {items.length} 个可用指令与资源
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(paletteContent, document.body);
  }

  return paletteContent;
};
