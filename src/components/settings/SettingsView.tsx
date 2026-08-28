import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AppSettings,
  AppTheme,
  EditorFontSize,
  EditorLineHeight,
  BackupData,
  DEFAULT_APP_SETTINGS,
  DEFAULT_VOICEOVER_CUES,
} from '../../types';
import { validateBackupData } from '../../lib/backupValidation';
import { exportBackupData, importBackupData, exportScriptsMarkdown } from '../../lib/storage';
import { authenticatedFetch } from '../../lib/auth';
import { applyTheme } from '../../lib/theme';
import { resolvePublicUrl } from '../../lib/publicUrl';
import { PageHeader } from '../layout/PageHeader';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import {
  Settings,
  Download,
  Upload,
  Gauge,
  Database,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  RefreshCw,
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  XCircle,
  Lock,
  KeyRound,
  LogOut,
  Smartphone,
  Copy,
  Check,
  Palette,
  Sun,
  Moon,
  Laptop,
  BookOpen,
  Type,
  AlignLeft,
  Zap,
  Mic,
  Coffee,
  Compass,
  Leaf,
  Stars,
  Flame,
  Clock,
  Share2,
  FileText,
  Eye,
  Globe,
  Plus,
  X,
  Trash2,
} from 'lucide-react';

interface SettingsViewProps {
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => Promise<void>;
  onReloadAllData: () => Promise<void>;
  onLogout?: () => void;
}

interface RuntimeStatus {
  isChecking: boolean;
  runtime: 'bun' | 'unknown';
  databaseConnected: boolean;
  databaseMessage: string;
  databaseTables?: number;
  kvConnected: boolean;
  kvMessage: string;
  lastChecked?: string;
}

interface HealthResponse {
  runtime?: 'bun';
  public_base_url?: string;
  database?: { connected?: boolean; message?: string; tables?: number };
  kv?: { connected?: boolean; message?: string };
}

function formatBackupSummary(data: BackupData): string {
  return `选题 ${data.topics.length}、资料 ${data.sources.length}、时间线 ${data.timeline.length}、人物 ${data.people.length}、草稿 ${data.drafts.length}、引用 ${data.citations.length}、标签 ${data.tags.length}、视频 ${data.published.length}`;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSaveSettings,
  onReloadAllData,
  onLogout,
}) => {
  const [readingSpeed, setReadingSpeed] = useState(settings.reading_speed || DEFAULT_APP_SETTINGS.reading_speed);
  const [selectedTheme, setSelectedTheme] = useState<AppTheme>(settings.theme || DEFAULT_APP_SETTINGS.theme);
  const [editorFontSize, setEditorFontSize] = useState<EditorFontSize>(settings.editor_font_size || DEFAULT_APP_SETTINGS.editor_font_size || 'standard');
  const [editorLineHeight, setEditorLineHeight] = useState<EditorLineHeight>(settings.editor_line_height || DEFAULT_APP_SETTINGS.editor_line_height || 'relaxed');
  const [typewriterDefault, setTypewriterDefault] = useState<boolean>(settings.typewriter_mode_default ?? DEFAULT_APP_SETTINGS.typewriter_mode_default ?? false);
  const [staleActionDays, setStaleActionDays] = useState<number>(settings.stale_action_days || DEFAULT_APP_SETTINGS.stale_action_days || 5);
  const [defaultShareTtl, setDefaultShareTtl] = useState<number>(settings.default_share_ttl_days || DEFAULT_APP_SETTINGS.default_share_ttl_days || 3);
  const [reviewerBranding, setReviewerBranding] = useState<string>(settings.reviewer_branding || '');
  const [publicBaseUrl, setPublicBaseUrl] = useState<string>(settings.public_base_url || '');
  const [voiceoverCues, setVoiceoverCues] = useState<string[]>(settings.voiceover_cues || DEFAULT_VOICEOVER_CUES);
  const [newCueInput, setNewCueInput] = useState('');

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingMd, setIsExportingMd] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isCopiedDropUrl, setIsCopiedDropUrl] = useState(false);
  const timeoutIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const healthControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    setSelectedTheme(settings.theme || DEFAULT_APP_SETTINGS.theme);
    setReadingSpeed(settings.reading_speed || DEFAULT_APP_SETTINGS.reading_speed);
    setEditorFontSize(settings.editor_font_size || 'standard');
    setEditorLineHeight(settings.editor_line_height || 'relaxed');
    setTypewriterDefault(settings.typewriter_mode_default ?? false);
    setStaleActionDays(settings.stale_action_days || 5);
    setDefaultShareTtl(settings.default_share_ttl_days || 3);
    setReviewerBranding(settings.reviewer_branding || '');
    setPublicBaseUrl(settings.public_base_url || '');
    setVoiceoverCues(settings.voiceover_cues || DEFAULT_VOICEOVER_CUES);
  }, [settings]);

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timeoutId = setTimeout(() => {
      timeoutIdsRef.current = timeoutIdsRef.current.filter((id) => id !== timeoutId);
      callback();
    }, delay);
    timeoutIdsRef.current.push(timeoutId);
  }, []);

  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>({
    isChecking: true,
    runtime: 'unknown',
    databaseConnected: false,
    databaseMessage: '正在检测后端连接...',
    kvConnected: false,
    kvMessage: '正在检测后端连接...',
  });

  const checkRuntimeStatus = useCallback(async () => {
    healthControllerRef.current?.abort();
    const controller = new AbortController();
    healthControllerRef.current = controller;
    setRuntimeStatus((prev) => ({ ...prev, isChecking: true }));
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      timeoutId = setTimeout(() => controller.abort(), 3000);

      const res = await authenticatedFetch('/api/health', { signal: controller.signal });
      if (res.ok) {
        const data = (await res.json()) as HealthResponse;
        if (!isMountedRef.current) return;
        setRuntimeStatus({
          isChecking: false,
          runtime: data.runtime || 'unknown',
          databaseConnected: data.database?.connected || false,
          databaseMessage: data.database?.message || '数据库状态未知',
          databaseTables: data.database?.tables,
          kvConnected: data.kv?.connected || false,
          kvMessage: data.kv?.message || '键值存储状态未知',
          lastChecked: new Date().toLocaleTimeString(),
        });
      } else {
        throw new Error('API 返回异常状态码');
      }
    } catch {
      if (!isMountedRef.current || controller.signal.aborted) return;
      setRuntimeStatus({
        isChecking: false,
        runtime: 'unknown',
        databaseConnected: false,
        databaseMessage: '后端服务未连接，请确认 Bun 服务正常运行',
        kvConnected: false,
        kvMessage: '键值存储状态未知',
        lastChecked: new Date().toLocaleTimeString(),
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (healthControllerRef.current === controller) healthControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    void checkRuntimeStatus();
    return () => {
      isMountedRef.current = false;
      healthControllerRef.current?.abort();
      timeoutIdsRef.current.forEach(clearTimeout);
    };
  }, [checkRuntimeStatus]);

  const handleSelectTheme = (theme: AppTheme) => {
    setSelectedTheme(theme);
    applyTheme(theme);
  };

  const handleAddVoiceoverCue = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCueInput.trim().replace(/^\[+|\]+$/g, '');
    if (!trimmed) return;
    if (voiceoverCues.includes(trimmed)) {
      setNewCueInput('');
      return;
    }
    setVoiceoverCues((prev) => [...prev, trimmed]);
    setNewCueInput('');
  };

  const handleRemoveVoiceoverCue = (cueToRemove: string) => {
    setVoiceoverCues((prev) => prev.filter((c) => c !== cueToRemove));
  };

  const handleResetVoiceoverCues = () => {
    setVoiceoverCues(DEFAULT_VOICEOVER_CUES);
  };

  const handleSaveAllPreferences = async () => {
    setIsSaving(true);
    try {
      const payload: AppSettings = {
        reading_speed: Number(readingSpeed),
        theme: selectedTheme,
        editor_font_size: editorFontSize,
        editor_line_height: editorLineHeight,
        typewriter_mode_default: typewriterDefault,
        stale_action_days: Number(staleActionDays),
        default_share_ttl_days: Number(defaultShareTtl),
        reviewer_branding: reviewerBranding.trim(),
        public_base_url: publicBaseUrl.trim().replace(/\/+$/, ''),
        voiceover_cues: voiceoverCues,
      };
      await onSaveSettings(payload);
      setSavedSuccess(true);
      schedule(() => setSavedSuccess(false), 2500);
    } catch (error) {
      setImportStatus({ type: 'error', text: error instanceof Error ? `保存设置失败：${error.message}` : '保存设置失败' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportJson = async () => {
    setIsExporting(true);
    try {
      const jsonStr = await exportBackupData();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bilibili-kanban-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setImportStatus({ type: 'error', text: error instanceof Error ? `导出失败：${error.message}` : '导出失败' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportMarkdown = async () => {
    setIsExportingMd(true);
    try {
      const mdContent = await exportScriptsMarkdown();
      const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bilibili-scripts-archive-${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setImportStatus({ type: 'error', text: error instanceof Error ? `导出文案失败：${error.message}` : '导出文案失败' });
    } finally {
      setIsExportingMd(false);
    }
  };

  const [pendingImportContent, setPendingImportContent] = useState<{
    content: string;
    summary: string;
  } | null>(null);

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        try {
          const data = JSON.parse(content) as unknown;
          const validation = validateBackupData(data);
          if (!validation.success) throw new Error(validation.error);
          setPendingImportContent({
            content,
            summary: formatBackupSummary(validation.data),
          });
        } catch (error) {
          setImportStatus({ type: 'error', text: error instanceof Error ? `导入解析失败：${error.message}` : '导入解析失败' });
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!pendingImportContent) return;
    setIsImporting(true);
    setImportStatus({ type: 'info', text: '正在恢复备份并重新载入工作台...' });
    try {
      const result = await importBackupData(pendingImportContent.content);
      if (!result.success) throw new Error(result.error || '导入失败');
      await onReloadAllData();
      setImportStatus({ type: 'success', text: '备份数据恢复成功！' });
      schedule(() => setImportStatus(null), 3000);
      setPendingImportContent(null);
    } catch (error) {
      setImportStatus({ type: 'error', text: error instanceof Error ? `导入失败：${error.message}` : '导入失败' });
    } finally {
      setIsImporting(false);
    }
  };

  const sampleChars = 1000;
  const rawMin = sampleChars / readingSpeed;
  const estM = Math.floor(rawMin);
  const estS = Math.round((rawMin - estM) * 60);

  return (
    <div className="flex-1 w-full h-full overflow-y-auto pb-24 md:pb-8 transition-colors">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
        <PageHeader
          title="偏好设置与数据管理"
          icon={Settings}
          actions={(
            <>
            {savedSuccess && (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 animate-in fade-in dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> 设置已同步至本地 SQLite
              </span>
            )}
            <button
              type="button"
              onClick={handleSaveAllPreferences}
              disabled={isSaving}
              className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-stone-900 px-4 text-xs font-bold text-white shadow-sm transition-all hover:bg-stone-800 disabled:opacity-50 dark:bg-rose-600 dark:hover:bg-rose-700 sm:text-sm"
            >
              <Zap className={`h-4 w-4 ${isSaving ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>{isSaving ? '正在保存…' : '保存全部偏好设置'}</span>
            </button>
            </>
          )}
        />

        {/* 1. Appearance */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 p-5 sm:p-6 space-y-5 shadow-2xs transition-colors">
          <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <Palette className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">视觉外观主题</h3>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold bg-rose-500/10 text-rose-700 dark:text-rose-300 px-2.5 py-0.5 rounded-full">
              SQLite KV
            </span>
          </div>

          {/* Theme Selector */}
          <div className="space-y-2.5">
            <label className="text-xs sm:text-sm font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
              <span>视觉主题调色</span>
              <span className="text-[11px] font-normal text-stone-400 dark:text-stone-500">(即时生效)</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  id: 'nordic_frost' as const,
                  title: '北欧冷杉',
                  desc: 'Craft / Linear 极简冷雾青与冷杉青绿，通透冷静',
                  icon: Compass,
                  tag: '推荐',
                  colors: ['#f8fafb', '#edf2f2', '#2d7a64', '#0ea5e9'],
                },
                {
                  id: 'parisian_dawn' as const,
                  title: '巴黎晨光',
                  desc: '生椰浅灰麦色与波尔多复古红，法式编辑部调性',
                  icon: Coffee,
                  colors: ['#faf8f5', '#ece7e1', '#c84b5b', '#b87e43'],
                },
                {
                  id: 'midnight_obsidian' as const,
                  title: '深海星图',
                  desc: 'Raycast 曜石黑与极光电光蓝，极客夜间沉浸写稿',
                  icon: Stars,
                  tag: '极客',
                  colors: ['#151921', '#1c212c', '#0ea5e9', '#a855f7'],
                },
                {
                  id: 'kyoto_zen' as const,
                  title: '京都茶席',
                  desc: '素竹青砂与宇治浓抹茶绿，禅意宁静专注',
                  icon: Leaf,
                  colors: ['#f8faf7', '#ebeee7', '#3d6b4f', '#c2413b'],
                },
                {
                  id: 'warm_paper' as const,
                  title: '暖沙纸境',
                  desc: '温润燕麦暖纸与莫兰迪暖红，治愈护眼书卷手感',
                  icon: BookOpen,
                  colors: ['#faf7f2', '#f0ebe4', '#de5b6d', '#6b5fb5'],
                },
                {
                  id: 'light' as const,
                  title: '经典浅色',
                  desc: '瑞士杂志编辑部调性 (Stone 灰阶 + Rose 强调色)',
                  icon: Sun,
                  colors: ['#fafaf9', '#ffffff', '#e11d48', '#78716c'],
                },
                {
                  id: 'dark' as const,
                  title: '深色专注',
                  desc: '低照度暗黑风，沉浸夜间码字与写稿',
                  icon: Moon,
                  colors: ['#0c0a09', '#1c1917', '#f43f5e', '#a8a29e'],
                },
                {
                  id: 'system' as const,
                  title: '跟随系统',
                  desc: '自动跟随操作系统的深浅色模式切换',
                  icon: Laptop,
                },
              ].map((themeOpt) => {
                const Icon = themeOpt.icon;
                const isSelected = selectedTheme === themeOpt.id;
                return (
                  <button
                    key={themeOpt.id}
                    type="button"
                    onClick={() => handleSelectTheme(themeOpt.id)}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer space-y-2 relative flex flex-col justify-between ${
                      isSelected
                        ? 'border-rose-500 bg-rose-500/10 dark:bg-rose-950/40 shadow-2xs ring-1 ring-rose-500/30'
                        : 'border-stone-200/70 dark:border-stone-700 bg-white dark:bg-stone-800/80 hover:bg-stone-50/80 dark:hover:bg-stone-800 hover:border-stone-300 dark:hover:border-stone-600 shadow-2xs'
                    }`}
                  >
                    <div className="space-y-1.5 w-full">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${isSelected ? 'text-rose-600 dark:text-rose-400' : 'text-stone-500 dark:text-stone-400'}`} />
                          <span className={`text-xs font-bold ${isSelected ? 'text-rose-900 dark:text-rose-200' : 'text-stone-800 dark:text-stone-200'}`}>
                            {themeOpt.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {themeOpt.tag && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300">
                              {themeOpt.tag}
                            </span>
                          )}
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-rose-600 dark:bg-rose-400" />
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-normal">
                        {themeOpt.desc}
                      </p>
                    </div>

                    {themeOpt.colors && (
                      <div className="flex items-center gap-1 pt-1">
                        {themeOpt.colors.map((c, i) => (
                          <span
                            key={i}
                            className="w-2.5 h-2.5 rounded-full border border-black/10 dark:border-white/10"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 2. Scripting & Studio Preferences */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 p-5 sm:p-6 space-y-6 shadow-2xs transition-colors">
          <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Mic className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">文案写作与播音录制偏好 (Studio)</h3>
              </div>
            </div>
          </div>

          {/* Typography: Font size & Line height */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Font Size */}
              <div className="space-y-2">
                <label className="text-xs sm:text-sm font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                  <Type className="w-4 h-4 text-stone-500" />
                  <span>编辑器正文字号</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'compact' as const, label: '紧凑 14px', sub: '高信息密度' },
                    { id: 'standard' as const, label: '标准 16px', sub: '编辑部默认' },
                    { id: 'large' as const, label: '大字 19px', sub: '播音提词防错' },
                  ].map((opt) => {
                    const isSelected = editorFontSize === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setEditorFontSize(opt.id)}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'border-rose-500 bg-rose-500/10 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-bold shadow-2xs ring-1 ring-rose-500/30'
                            : 'border-stone-200/70 dark:border-stone-700 bg-stone-500/[0.03] dark:bg-stone-800/60 text-stone-700 dark:text-stone-300 hover:bg-stone-100'
                        }`}
                      >
                        <div className="text-xs">{opt.label}</div>
                        <div className="text-[10px] text-stone-400 font-normal">{opt.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Line Height */}
              <div className="space-y-2">
                <label className="text-xs sm:text-sm font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                  <AlignLeft className="w-4 h-4 text-stone-500" />
                  <span>行距松紧度</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'normal' as const, label: '紧凑 1.6', sub: '紧凑版面' },
                    { id: 'relaxed' as const, label: '舒适 1.8', sub: '推荐阅读' },
                    { id: 'loose' as const, label: '宽松 2.1', sub: '扫读播音' },
                  ].map((opt) => {
                    const isSelected = editorLineHeight === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setEditorLineHeight(opt.id)}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'border-rose-500 bg-rose-500/10 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-bold shadow-2xs ring-1 ring-rose-500/30'
                            : 'border-stone-200/70 dark:border-stone-700 bg-stone-500/[0.03] dark:bg-stone-800/60 text-stone-700 dark:text-stone-300 hover:bg-stone-100'
                        }`}
                      >
                        <div className="text-xs">{opt.label}</div>
                        <div className="text-[10px] text-stone-400 font-normal">{opt.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Dynamic Live Typography Preview Box */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-stone-500/[0.03] dark:bg-stone-800/50 border border-stone-200/70 dark:border-stone-700/80 space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-stone-700 dark:text-stone-200">
                  <Eye className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                  <span>排版实时效果预览 (所见即所得)</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="bg-white dark:bg-stone-700 text-stone-700 dark:text-stone-300 px-2.5 py-0.5 rounded-full font-semibold shadow-2xs">
                    {editorFontSize === 'compact' ? '14px 紧凑' : editorFontSize === 'large' ? '19px 播音大字' : '16px 标准'}
                  </span>
                  <span className="bg-white dark:bg-stone-700 text-stone-700 dark:text-stone-300 px-2.5 py-0.5 rounded-full font-semibold shadow-2xs">
                    {editorLineHeight === 'normal' ? '1.6 倍行距' : editorLineHeight === 'loose' ? '2.1 倍行距' : '1.8 倍行距'}
                  </span>
                </div>
              </div>

              <div
                className="p-4 bg-white dark:bg-stone-900 rounded-xl border border-stone-200/70 dark:border-stone-800 text-stone-800 dark:text-stone-100 transition-all duration-150 shadow-2xs"
                style={{
                  fontSize: editorFontSize === 'compact' ? '14px' : editorFontSize === 'large' ? '19px' : '16px',
                  lineHeight: editorLineHeight === 'normal' ? 1.6 : editorLineHeight === 'loose' ? 2.1 : 1.8,
                }}
              >
                <div className="font-bold text-stone-900 dark:text-stone-100 mb-1.5 opacity-90 text-sm sm:text-base">
                  【解说样段】镜头拉远，时代的荒诞切片
                </div>
                <p className="text-stone-700 dark:text-stone-300">
                  很多人以为这是一个荒诞的闹剧，但当镜头拉远，我们才看清整个事件背后令人唏嘘的社会切片。在长达三年的跟踪调查中，我们发现了三个截然不同的事实反转……
                </p>
              </div>
            </div>
          </div>

          {/* Typewriter mode default */}
          <div className="flex items-center justify-between p-3.5 bg-stone-500/[0.03] dark:bg-stone-800/60 rounded-2xl border border-stone-200/70 dark:border-stone-700">
            <div>
              <div className="text-xs sm:text-sm font-bold text-stone-800 dark:text-stone-200">打字机居中模式默认开启</div>
              <p className="text-[11px] text-stone-400 dark:text-stone-500">进入文案编辑器时自动锁定当前光标在屏幕垂直居中位置，码字视线不漂移</p>
            </div>
            <button
              type="button"
              onClick={() => setTypewriterDefault((prev) => !prev)}
              className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out ${
                typewriterDefault ? 'bg-rose-600' : 'bg-stone-300 dark:bg-stone-700'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                  typewriterDefault ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Voiceover Cue Management */}
          <div className="p-4 sm:p-5 bg-stone-500/[0.03] dark:bg-stone-800/60 rounded-2xl border border-stone-200/70 dark:border-stone-700 space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">录音提词 · 演播气口标记库</h4>
                  <p className="text-[11px] text-stone-400 dark:text-stone-500">
                    在写稿与提词演播时快捷插入的配音提示词（如 [停顿 1s]、[重音]、[反讽语气]），提词器中将高亮呈现
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetVoiceoverCues}
                className="text-[11px] text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 underline cursor-pointer"
              >
                恢复默认气口
              </button>
            </div>

            {/* Cue badges list */}
            <div className="flex flex-wrap gap-2 pt-1">
              {voiceoverCues.map((cue) => (
                <span
                  key={cue}
                  className="inline-flex items-center gap-1.5 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 px-3 py-1 rounded-full text-xs font-mono font-semibold border border-stone-200/70 dark:border-stone-700 shadow-2xs group"
                >
                  <span className="text-rose-600 dark:text-rose-400 font-bold">[{cue}]</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveVoiceoverCue(cue)}
                    className="text-stone-400 hover:text-red-500 p-0.5 rounded-full transition-colors cursor-pointer"
                    title={`删除 [${cue}] 气口`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            {/* Add new cue form */}
            <form onSubmit={handleAddVoiceoverCue} className="flex items-center gap-2 pt-2">
              <input
                type="text"
                enterKeyHint="done"
                autoComplete="off"
                value={newCueInput}
                onChange={(e) => setNewCueInput(e.target.value)}
                placeholder="输入新气口标记，如：高潮配乐、叹气、深吸气"
                className="flex-1 px-3.5 py-2 bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-700 rounded-xl text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                disabled={!newCueInput.trim()}
                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-40 transition-all cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>添加气口</span>
              </button>
            </form>
          </div>

          {/* Speech Speed Configuration + Presets */}
          <div className="space-y-3 pt-3 border-t border-stone-100 dark:border-stone-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-stone-600 dark:text-stone-400" />
                <label className="text-xs sm:text-sm font-bold text-stone-800 dark:text-stone-200">文案朗读语速基准</label>
              </div>
              <span className="font-mono font-bold text-xs sm:text-sm text-rose-700 dark:text-rose-300 bg-rose-500/10 dark:bg-rose-950/60 px-2.5 py-0.5 rounded-full">
                {readingSpeed} 字 / 分钟
              </span>
            </div>

            {/* Speed Presets Pill Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-stone-400 dark:text-stone-500 font-medium">快捷预设：</span>
              <button
                type="button"
                onClick={() => setReadingSpeed(320)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  readingSpeed === 320
                    ? 'bg-rose-600 text-white shadow-2xs font-bold'
                    : 'bg-stone-100/80 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200/80'
                }`}
              >
                <Flame className="w-3 h-3 text-rose-400" />
                <span>快节奏吐槽 / 盘点 (320字)</span>
              </button>

              <button
                type="button"
                onClick={() => setReadingSpeed(280)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  readingSpeed === 280
                    ? 'bg-rose-600 text-white shadow-2xs font-bold'
                    : 'bg-stone-100/80 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200/80'
                }`}
              >
                <Mic className="w-3 h-3 text-amber-400" />
                <span>纪实叙事解说 (280字 默认)</span>
              </button>

              <button
                type="button"
                onClick={() => setReadingSpeed(240)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  readingSpeed === 240
                    ? 'bg-rose-600 text-white shadow-2xs font-bold'
                    : 'bg-stone-100/80 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200/80'
                }`}
              >
                <Coffee className="w-3 h-3 text-blue-400" />
                <span>慢调情绪铺垫 (240字)</span>
              </button>
            </div>

            <input
              type="range"
              min="180"
              max="420"
              step="10"
              value={readingSpeed}
              onChange={(e) => setReadingSpeed(Number(e.target.value))}
              className="w-full h-2 bg-stone-200 dark:bg-stone-700 rounded-lg appearance-none cursor-pointer accent-rose-600"
            />

            <div className="p-3 bg-stone-500/[0.03] dark:bg-stone-800/60 rounded-xl border border-stone-200/50 dark:border-stone-800 flex items-center justify-between text-xs">
              <span className="text-stone-600 dark:text-stone-300">
                💡 换算参考：<strong>1,000 字</strong> 文案录制预计耗时：
              </span>
              <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                约 {estM} 分 {estS} 秒
              </span>
            </div>
          </div>
        </div>

        {/* 3. Workflow & Review Snapshots Preferences */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 p-5 sm:p-6 space-y-5 shadow-2xs transition-colors">
          <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <Share2 className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">选题生产流与外部审稿偏好</h3>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Stale Action Alert Days */}
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-500" />
                <span>下一步行动停滞预警阈值</span>
              </label>
              <p className="text-[11px] text-stone-400 dark:text-stone-500">选题在立项或写稿中超过设定天数未更新行动时标红预警</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { days: 3, label: '3 天 (敏捷)' },
                  { days: 5, label: '5 天 (推荐)' },
                  { days: 7, label: '7 天 (宽松)' },
                ].map((opt) => {
                  const isSelected = staleActionDays === opt.days;
                  return (
                    <button
                      key={opt.days}
                      type="button"
                      onClick={() => setStaleActionDays(opt.days)}
                      className={`p-2.5 rounded-xl border text-center text-xs transition-all cursor-pointer ${
                        isSelected
                          ? 'border-rose-500 bg-rose-500/10 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-bold shadow-2xs'
                          : 'border-stone-200/70 dark:border-stone-700 bg-stone-500/[0.03] dark:bg-stone-800/60 text-stone-700 dark:text-stone-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Default Share Snapshot TTL */}
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                <Share2 className="w-4 h-4 text-purple-500" />
                <span>外部审稿快照默认有效期</span>
              </label>
              <p className="text-[11px] text-stone-400 dark:text-stone-500">生成免登录外部审稿链接时的默认销毁时限</p>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { days: 1, label: '1 天' },
                  { days: 3, label: '3 天' },
                  { days: 7, label: '7 天' },
                  { days: 30, label: '30 天' },
                ].map((opt) => {
                  const isSelected = defaultShareTtl === opt.days;
                  return (
                    <button
                      key={opt.days}
                      type="button"
                      onClick={() => setDefaultShareTtl(opt.days)}
                      className={`p-2.5 rounded-xl border text-center text-xs transition-all cursor-pointer ${
                        isSelected
                          ? 'border-purple-500 bg-purple-500/15 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 font-bold shadow-2xs'
                          : 'border-stone-200/70 dark:border-stone-700 bg-stone-500/[0.03] dark:bg-stone-800/60 text-stone-700 dark:text-stone-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Reviewer Branding / Watermark */}
          <div className="space-y-2 pt-2 border-t border-stone-100 dark:border-stone-800">
            <label className="text-xs sm:text-sm font-bold text-stone-800 dark:text-stone-200">
              外部审稿样稿署名 / 频道标语
            </label>
            <p className="text-[11px] text-stone-400 dark:text-stone-500">
              设置展示在外部只读审稿页顶部的频道名称或免责提示（例如：<code>B站 @你的频道名 内部审稿样稿</code>）
            </p>
            <input
              type="text"
              placeholder="例如：B站 @良子说事 内部审稿样稿 · 请勿外传"
              value={reviewerBranding}
              onChange={(e) => setReviewerBranding(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 text-xs sm:text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 focus:outline-none"
            />
          </div>

          {/* Public Base URL (Reverse Proxy Support) */}
          <div className="space-y-2 pt-2 border-t border-stone-100 dark:border-stone-800">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-rose-500" />
                <span>公开访问基准域名 (Public Base URL / 反代域名)</span>
              </label>
              {publicBaseUrl && (
                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full font-bold">
                  已配置公网适配
                </span>
              )}
            </div>
            <p className="text-[11px] text-stone-400 dark:text-stone-500">
              配置反向代理的公网域名（例如：<code>https://kanban.example.com</code>）。配置后，无论在本地内网还是远程写稿，生成的审稿链接与快投箱 Webhook 都将自动采用此公网域名。
            </p>
            <input
              type="url"
              placeholder="例如：https://kanban.example.com (留空则自动跟随当前访问地址)"
              value={publicBaseUrl}
              onChange={(e) => setPublicBaseUrl(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 text-xs sm:text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 focus:outline-none font-mono"
            />
          </div>
        </div>

        {/* 4. Security & Infrastructure Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Password Protection */}
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 p-5 space-y-3 shadow-2xs transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-rose-600 dark:text-rose-500" />
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">访问控制与安全密码</h3>
              </div>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400 hover:text-red-700 bg-red-500/10 px-2.5 py-1 rounded-xl font-semibold transition-colors cursor-pointer"
                >
                  <LogOut className="w-3 h-3" />
                  <span>退出登录</span>
                </button>
              )}
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
              访问密码由环境变量 <code className="bg-stone-100 dark:bg-stone-800 px-1 py-0.5 rounded font-mono text-stone-800 dark:text-stone-200">APP_PASSWORD</code> 统一管理；无状态 HMAC Token 自动维持 7 天免密。
            </p>
          </div>

          {/* Infrastructure Storage Status */}
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 p-5 space-y-3 shadow-2xs transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">数据库与存储实时探测</h3>
              </div>
              <button
                onClick={checkRuntimeStatus}
                disabled={runtimeStatus.isChecking}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
                title="重新检测"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${runtimeStatus.isChecking ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${runtimeStatus.databaseConnected && runtimeStatus.kvConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                {runtimeStatus.databaseConnected && runtimeStatus.kvConnected
                  ? 'Bun + SQLite 本地服务正常运行中'
                  : '后端服务未连通'}
              </span>
            </div>
            <p className="text-[11px] text-stone-400 dark:text-stone-500 truncate">
              {runtimeStatus.databaseMessage}
            </p>
          </div>
        </div>

        {/* 5. Quick Drop Ingestion Configuration */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 p-5 sm:p-6 space-y-4 shadow-2xs transition-colors">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <Smartphone className="w-5 h-5" />
            </span>
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">手机快捷指令 · 灵感碎片快投配置</h3>
          </div>

          <div className="p-4 bg-stone-500/[0.03] dark:bg-stone-800/60 rounded-2xl border border-stone-200/70 dark:border-stone-700 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-stone-700 dark:text-stone-300">快投 Webhook 接口 URL：</span>
              <button
                type="button"
                onClick={async () => {
                  const url = resolvePublicUrl('/api/inbox/quick-drop', publicBaseUrl);
                  await navigator.clipboard.writeText(url);
                  setIsCopiedDropUrl(true);
                  setTimeout(() => setIsCopiedDropUrl(false), 2000);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 cursor-pointer"
              >
                {isCopiedDropUrl ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopiedDropUrl ? '已复制接口地址' : '复制地址'}</span>
              </button>
            </div>

            <div className="p-3 bg-white dark:bg-stone-900 rounded-xl border border-stone-200/70 dark:border-stone-700 font-mono text-[11px] text-stone-700 dark:text-stone-300 select-all break-all shadow-2xs">
              {resolvePublicUrl('/api/inbox/quick-drop', publicBaseUrl)}
            </div>

            <div className="space-y-1.5 pt-1 text-[11px] text-stone-500 dark:text-stone-400">
              <p><strong>iOS 快捷指令配置参数：</strong></p>
              <ul className="list-disc list-inside space-y-1 pl-1 text-stone-600 dark:text-stone-300">
                <li>请求方法：<code className="bg-stone-200/70 dark:bg-stone-700 px-1 py-0.5 rounded font-mono text-stone-800 dark:text-stone-200">POST</code></li>
                <li>请求头：<code className="bg-stone-200/70 dark:bg-stone-700 px-1 py-0.5 rounded font-mono text-stone-800 dark:text-stone-200">X-Quick-Drop-Token: 你的独立快投 Token</code></li>
                <li>快投 Token 由环境变量 <code className="bg-stone-200/70 dark:bg-stone-700 px-1 py-0.5 rounded font-mono text-stone-800 dark:text-stone-200">QUICK_DROP_TOKEN</code> 配置，独立于工作台主密码。</li>
                <li>请求体 JSON：<code className="bg-stone-200/70 dark:bg-stone-700 px-1 py-0.5 rounded font-mono text-stone-800 dark:text-stone-200">&#123; "content": "分享内容", "url": "网页链接" &#125;</code></li>
              </ul>
            </div>
          </div>
        </div>

        {/* 6. Data Backup & Markdown Archive */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 p-5 sm:p-6 space-y-4 shadow-2xs transition-colors">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Database className="w-5 h-5" />
            </span>
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">数据安全、全量备份与文案归档</h3>
          </div>

          {importStatus && (
            <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
              importStatus.type === 'error' ? 'bg-red-500/10 text-red-800 dark:text-red-300 border-red-500/20' :
              importStatus.type === 'success' ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/20' :
              'bg-blue-500/10 text-blue-800 dark:text-blue-300 border-blue-500/20'
            }`}>
              <Sparkles className="w-4 h-4" />
              <span>{importStatus.text}</span>
            </div>
          )}

          <div className="flex items-center gap-3 sm:gap-4 pt-2 flex-wrap">
            {/* Download JSON Backup */}
            <button
              onClick={handleExportJson}
              disabled={isExporting || isImporting || isExportingMd}
              className="flex items-center gap-2 bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 active:scale-[0.98] text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? '正在导出...' : '下载全量备份 (.json)'}</span>
            </button>

            {/* Export Markdown Archive */}
            <button
              onClick={handleExportMarkdown}
              disabled={isExporting || isImporting || isExportingMd}
              className="flex items-center gap-2 bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border border-stone-200/70 dark:border-stone-700 transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <span>{isExportingMd ? '正在导出...' : '导出文案合辑 (.md)'}</span>
            </button>

            {/* Restore File */}
            <label className={`flex items-center gap-2 bg-stone-100/80 dark:bg-stone-800 hover:bg-stone-200/80 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border border-stone-200/70 dark:border-stone-700 transition-colors ${isImporting || isExporting ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
              <Upload className="w-4 h-4 text-stone-500 dark:text-stone-400" />
              <span>{isImporting ? '正在恢复...' : '恢复备份文件'}</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportFile}
                disabled={isImporting || isExporting || isExportingMd}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={Boolean(pendingImportContent)}
        onClose={() => setPendingImportContent(null)}
        onConfirm={handleConfirmImport}
        title="确认恢复数据备份"
        description={pendingImportContent ? `将覆盖当前所有数据，且操作无法撤销。\n\n备份包含：${pendingImportContent.summary}\n\n确定继续恢复吗？` : ''}
        confirmText="覆盖并恢复备份"
        tone="danger"
        isLoading={isImporting}
      />
    </div>
  );
};
