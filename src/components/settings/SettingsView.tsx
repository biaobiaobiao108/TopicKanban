import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AppSettings,
  AppTheme,
  EditorFontSize,
  EditorLineHeight,
  BackupData,
  DEFAULT_APP_SETTINGS,
  StorageStats,
  StorageOptimizeResult,
} from '../../types';
import { validateBackupData } from '../../lib/backupValidation';
import { exportBackupData, importBackupData, exportScriptsMarkdown, fetchStorageStats, optimizeStorage, MAX_BACKUP_IMPORT_BYTES } from '../../lib/storage';
import { authenticatedFetch } from '../../lib/auth';
import { applyTheme } from '../../lib/theme';
import { resolvePublicUrl } from '../../lib/publicUrl';
import { copyTextToClipboard } from '../../lib/clipboard';
import { formatBeijingDateTime, getBeijingDateString } from '../../lib/actionDate';
import { PageHeader } from '../layout/PageHeader';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { PwaInstallCard } from '../ui/PwaInstall';
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
  Flame,
  FileText,
  Eye,
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
  publicBaseUrl: string;
  lastChecked?: string;
}

interface HealthResponse {
  runtime?: 'bun';
  public_base_url?: string;
  database?: { connected?: boolean; message?: string; tables?: number };
}

function formatBackupSummary(data: BackupData): string {
  return `选题 ${data.topics.length}、资料 ${data.sources.length}、报告 ${data.reports.length}、人物 ${data.people.length}、草稿 ${data.drafts.length}、引用 ${data.citations.length}、标签 ${data.tags.length}、视频 ${data.published.length}`;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSaveSettings,
  onReloadAllData,
  onLogout,
}) => {
  const { showToast } = useToast();
  const [readingSpeed, setReadingSpeed] = useState(settings.reading_speed || DEFAULT_APP_SETTINGS.reading_speed);
  const [selectedTheme, setSelectedTheme] = useState<AppTheme>(settings.theme || DEFAULT_APP_SETTINGS.theme);
  const [editorFontSize, setEditorFontSize] = useState<EditorFontSize>(settings.editor_font_size || DEFAULT_APP_SETTINGS.editor_font_size || 'standard');
  const [editorLineHeight, setEditorLineHeight] = useState<EditorLineHeight>(settings.editor_line_height || DEFAULT_APP_SETTINGS.editor_line_height || 'relaxed');

  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [isLoadingStorage, setIsLoadingStorage] = useState(false);
  const [isOptimizingStorage, setIsOptimizingStorage] = useState(false);
  const [isOptimizeDialogOpen, setIsOptimizeDialogOpen] = useState(false);

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
    publicBaseUrl: '',
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
          publicBaseUrl: data.public_base_url || '',
          lastChecked: formatBeijingDateTime(new Date(), 'zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
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
        lastChecked: formatBeijingDateTime(new Date(), 'zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        publicBaseUrl: '',
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (healthControllerRef.current === controller) healthControllerRef.current = null;
    }
  }, []);

  const loadStorageStats = useCallback(async () => {
    setIsLoadingStorage(true);
    try {
      const stats = await fetchStorageStats();
      if (isMountedRef.current) setStorageStats(stats);
    } catch {
      // ignore
    } finally {
      if (isMountedRef.current) setIsLoadingStorage(false);
    }
  }, []);

  const handleConfirmOptimize = async () => {
    setIsOptimizingStorage(true);
    try {
      const result = await optimizeStorage();
      if (isMountedRef.current) {
        setStorageStats(result.after);
        setIsOptimizeDialogOpen(false);
      }
      showToast({
        message: result.reclaimed_bytes > 0
          ? `存储压缩完成，已释放 ${formatBytes(result.reclaimed_bytes)} 磁盘空间`
          : '数据库已完成重整，当前处于最佳紧凑状态',
        tone: 'success',
      });
      void checkRuntimeStatus();
    } catch (err) {
      showToast({
        message: err instanceof Error ? `压缩失败：${err.message}` : '压缩失败',
        tone: 'error',
      });
    } finally {
      if (isMountedRef.current) setIsOptimizingStorage(false);
    }
  };

  useEffect(() => {
    void checkRuntimeStatus();
    void loadStorageStats();
    return () => {
      isMountedRef.current = false;
      healthControllerRef.current?.abort();
      timeoutIdsRef.current.forEach(clearTimeout);
    };
  }, [checkRuntimeStatus, loadStorageStats]);

  const handleSelectTheme = (theme: AppTheme) => {
    setSelectedTheme(theme);
    applyTheme(theme);
  };

  const handleSaveAllPreferences = async () => {
    setIsSaving(true);
    try {
      const payload: AppSettings = {
        reading_speed: Number(readingSpeed),
        theme: selectedTheme,
        editor_font_size: editorFontSize,
        editor_line_height: editorLineHeight,
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
      const blob = await exportBackupData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bilibili-kanban-backup-${getBeijingDateString()}.json`;
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
      a.download = `bilibili-scripts-archive-${getBeijingDateString()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setImportStatus({ type: 'error', text: error instanceof Error ? `导出文案失败：${error.message}` : '导出文案失败' });
    } finally {
      setIsExportingMd(false);
    }
  };

  const [pendingImportContent, setPendingImportContent] = useState<{
    file: File;
    summary: string;
  } | null>(null);

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (file.size > MAX_BACKUP_IMPORT_BYTES) {
      setImportStatus({ type: 'error', text: `备份文件超过 ${(MAX_BACKUP_IMPORT_BYTES / 1024 / 1024).toFixed(0)} MB 限制` });
      return;
    }

    void file.text().then((content) => {
      if (!content) return;
      try {
        const data = JSON.parse(content) as unknown;
        const validation = validateBackupData(data);
        if (!validation.success) throw new Error(validation.error);
        setPendingImportContent({
          file,
          summary: formatBackupSummary(validation.data),
        });
      } catch (error) {
        setImportStatus({ type: 'error', text: error instanceof Error ? `导入解析失败：${error.message}` : '导入解析失败' });
      }
    }).catch((error) => {
      setImportStatus({ type: 'error', text: error instanceof Error ? `导入解析失败：${error.message}` : '导入解析失败' });
    });
  };

  const handleConfirmImport = async () => {
    if (!pendingImportContent) return;
    setIsImporting(true);
    setImportStatus({ type: 'info', text: '正在恢复备份并重新载入工作台...' });
    try {
      const result = await importBackupData(pendingImportContent.file);
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
    <div className="flex min-h-0 min-w-0 h-full w-full flex-1 flex-col overflow-y-auto mobile-bottom-nav-content transition-colors md:pb-8">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-6">
        <PageHeader
          title="偏好设置与数据管理"
          icon={Settings}
          actions={(
            <>
            {savedSuccess && (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 animate-in fade-in dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> 偏好已保存在此浏览器
              </span>
            )}
            <button
              type="button"
              onClick={handleSaveAllPreferences}
              disabled={isSaving}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 text-xs font-semibold text-white shadow-2xs transition-all hover:bg-[var(--accent-dark)] disabled:opacity-50 sm:text-sm cursor-pointer"
            >
              <Zap className={`h-4 w-4 ${isSaving ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>{isSaving ? '正在保存…' : '保存全部偏好设置'}</span>
            </button>
            </>
          )}
        />

        <PwaInstallCard />

        {/* 1. Appearance */}
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--line)] p-5 sm:p-6 space-y-5 shadow-subtle transition-colors">
          <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Palette className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">视觉外观主题</h2>
              </div>
            </div>
          </div>

          {/* Theme Selector */}
          <div className="space-y-2.5">
            <label className="text-xs sm:text-sm font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
              <span>视觉主题调色</span>
              <span className="text-[11px] font-normal text-stone-600 dark:text-stone-400">(即时生效)</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  id: 'warm_paper' as const,
                  title: '暖沙纸境',
                  desc: '温润暖纸画布与松柏绿操作色，适合长时间阅读',
                  icon: BookOpen,
                  colors: ['#f5f0e5', '#faf6ee', '#784c31', '#6d635a'],
                },
                {
                  id: 'light' as const,
                  title: '经典浅色',
                  desc: '象映温润自然纸境与苍松墨绿，漫反射护眼质感',
                  icon: Sun,
                  colors: ['#f6f4ef', '#faf9f6', '#365e4e', '#718078'],
                },
                {
                  id: 'dark' as const,
                  title: 'Tokyo Night',
                  desc: '靛蓝夜色画布与柔和蓝紫强调色，适合夜间写稿',
                  icon: Moon,
                  colors: ['#1a1b26', '#24283b', '#7aa2f7', '#a9b1d6'],
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
                        ? 'border-[var(--accent)]/45 bg-[var(--accent-soft)]'
                        : 'border-stone-200/70 dark:border-stone-700 bg-white dark:bg-stone-800/80 hover:bg-stone-50/80 dark:hover:bg-stone-800 hover:border-stone-300 dark:hover:border-stone-600 shadow-2xs'
                    }`}
                  >
                    <div className="space-y-1.5 w-full">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${isSelected ? 'text-[var(--accent)]' : 'text-stone-500 dark:text-stone-400'}`} />
                          <span className={`text-xs font-bold ${isSelected ? 'text-[var(--ink)]' : 'text-stone-800 dark:text-stone-200'}`}>
                            {themeOpt.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-normal">
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
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--line)] p-5 sm:p-6 space-y-6 shadow-subtle transition-colors">
          <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Mic className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">文案写作与播音录制偏好 (Studio)</h2>
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
                          ? 'border-[var(--accent)]/45 bg-[var(--accent-soft)] text-[var(--ink)] font-bold'
                            : 'border-stone-200/70 dark:border-stone-700 bg-stone-500/[0.03] dark:bg-stone-800/60 text-stone-700 dark:text-stone-300 hover:bg-stone-100'
                        }`}
                      >
                        <div className="text-xs">{opt.label}</div>
                        <div className="text-[10px] text-stone-600 dark:text-stone-400 font-normal">{opt.sub}</div>
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
                          ? 'border-[var(--accent)]/45 bg-[var(--accent-soft)] text-[var(--ink)] font-bold'
                            : 'border-stone-200/70 dark:border-stone-700 bg-stone-500/[0.03] dark:bg-stone-800/60 text-stone-700 dark:text-stone-300 hover:bg-stone-100'
                        }`}
                      >
                        <div className="text-xs">{opt.label}</div>
                        <div className="text-[10px] text-stone-600 dark:text-stone-400 font-normal">{opt.sub}</div>
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
                  <Eye className="w-4 h-4 text-[var(--accent)]" />
                  <span>排版实时效果预览 (所见即所得)</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="bg-stone-500/[0.06] dark:bg-stone-800 text-[var(--ink-muted)] px-2.5 py-0.5 rounded-full font-semibold font-mono tabular-nums border border-[var(--line)]">
                    {editorFontSize === 'compact' ? '14px 紧凑' : editorFontSize === 'large' ? '19px 播音大字' : '16px 标准'}
                  </span>
                  <span className="bg-stone-500/[0.06] dark:bg-stone-800 text-[var(--ink-muted)] px-2.5 py-0.5 rounded-full font-semibold font-mono tabular-nums border border-[var(--line)]">
                    {editorLineHeight === 'normal' ? '1.6 倍行距' : editorLineHeight === 'loose' ? '2.1 倍行距' : '1.8 倍行距'}
                  </span>
                </div>
              </div>

              <div
                className="p-4 bg-[var(--canvas)]/70 dark:bg-stone-800/60 rounded-xl border border-[var(--line)] text-[var(--ink)] transition-all duration-150 space-y-3"
                style={{
                  fontSize: editorFontSize === 'compact' ? '14px' : editorFontSize === 'large' ? '19px' : '16px',
                  lineHeight: editorLineHeight === 'normal' ? 1.6 : editorLineHeight === 'loose' ? 2.1 : 1.8,
                }}
              >
                <h3 className="border-b border-[var(--line)]/60 pb-2 font-bold leading-snug" style={{ fontSize: '1.15em' }}>
                  【解说样段】镜头拉远，时代的荒诞切片
                </h3>
                <p>
                  很多人以为这只是一场荒诞闹剧。镜头拉远之后，我们才看见事件背后令人唏嘘的现实切片。
                </p>
                <p>
                  在长达三年的跟踪调查中，我们发现了三个截然不同的事实反转：当事人的说法变了，旁观者的记忆也变了，只有时间留下的细节始终对得上。
                </p>
                <p>
                  这段内容会分行展示：<br />短句停顿之后，继续把关键细节说清楚。<br />行距变化也会同步反映在这里。
                </p>
                <ul className="list-disc space-y-1 pl-6 marker:text-[var(--accent)]">
                  <li>先交代故事发生的背景</li>
                  <li>再呈现人物行动与事实反转</li>
                  <li>最后落到选择带来的结果</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Speech Speed Configuration + Presets */}
          <div className="space-y-3 pt-3 border-t border-stone-100 dark:border-stone-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-stone-600 dark:text-stone-400" />
                <label htmlFor="settings-reading-speed" className="text-xs sm:text-sm font-bold text-stone-800 dark:text-stone-200">文案朗读语速基准</label>
              </div>
              <span className="font-mono font-bold text-xs sm:text-sm text-[var(--accent-dark)] bg-[var(--accent-soft)] px-2.5 py-0.5 rounded-full">
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
                    ? 'bg-[var(--accent)] text-white shadow-2xs font-bold'
                    : 'bg-stone-100/80 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200/80'
                }`}
              >
                <Flame className="w-3 h-3 text-[var(--accent)]" />
                <span>快节奏吐槽 / 盘点 (320字)</span>
              </button>

              <button
                type="button"
                onClick={() => setReadingSpeed(280)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  readingSpeed === 280
                    ? 'bg-[var(--accent)] text-white shadow-2xs font-bold'
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
                    ? 'bg-[var(--accent)] text-white shadow-2xs font-bold'
                    : 'bg-stone-100/80 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200/80'
                }`}
              >
                <Coffee className="w-3 h-3 text-blue-400" />
                <span>慢调情绪铺垫 (240字)</span>
              </button>
            </div>

            <input
              id="settings-reading-speed"
              name="reading_speed"
              type="range"
              min="180"
              max="420"
              step="10"
              value={readingSpeed}
              onChange={(e) => setReadingSpeed(Number(e.target.value))}
              className="w-full h-2 bg-stone-200 dark:bg-stone-700 rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
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

        {/* 4. Security & Infrastructure Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Password Protection */}
          <div className="bg-[var(--surface)] rounded-2xl border border-[var(--line)] p-5 space-y-3 shadow-subtle transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[var(--accent)]" />
                <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">访问控制与安全密码</h2>
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

          {/* Infrastructure Storage Status & Vacuum Optimization */}
          <div className="bg-[var(--surface)] rounded-2xl border border-[var(--line)] p-5 space-y-4 shadow-subtle transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">数据库存储与物理收缩</h2>
              </div>
              <button
                onClick={() => {
                  void checkRuntimeStatus();
                  void loadStorageStats();
                }}
                disabled={runtimeStatus.isChecking || isLoadingStorage}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
                aria-label="重新检测存储状态"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${runtimeStatus.isChecking || isLoadingStorage ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${runtimeStatus.databaseConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                {runtimeStatus.databaseConnected
                  ? 'Bun + SQLite 本地引擎正常运行中'
                  : '后端服务未连通'}
              </span>
            </div>

            {storageStats ? (
              <div className="space-y-2.5 pt-1">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-stone-500/[0.03] dark:bg-stone-800/60 border border-stone-200/60 dark:border-stone-700/60">
                    <span className="text-[11px] text-stone-400 dark:text-stone-500 block">主数据库文件</span>
                    <span className="font-mono font-bold text-stone-800 dark:text-stone-200">
                      {formatBytes(storageStats.db_file_bytes)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-stone-500/[0.03] dark:bg-stone-800/60 border border-stone-200/60 dark:border-stone-700/60">
                    <span className="text-[11px] text-stone-400 dark:text-stone-500 block">WAL 预写日志</span>
                    <span className="font-mono font-bold text-stone-800 dark:text-stone-200">
                      {formatBytes(storageStats.wal_file_bytes)}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-stone-500/[0.03] dark:bg-stone-800/60 border border-stone-200/60 dark:border-stone-700/60 flex items-center justify-between text-xs">
                  <span className="text-stone-500 dark:text-stone-400 text-[11px]">
                    可收缩空闲页 (Freelist)：
                  </span>
                  <span className="font-mono text-stone-800 dark:text-stone-200 font-semibold">
                    {storageStats.freelist_count > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400 font-bold">
                        {storageStats.freelist_count} 页 ({formatBytes(storageStats.freelist_bytes)})
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">已完全紧凑</span>
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-stone-400 dark:text-stone-500">
                    回收站积压：<strong className="text-stone-700 dark:text-stone-300">{storageStats.trashed_topics_count}</strong> 个选题
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsOptimizeDialogOpen(true)}
                    disabled={isOptimizingStorage}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900 dark:bg-stone-100 hover:bg-stone-800 dark:hover:bg-white text-white dark:text-stone-900 text-xs font-semibold transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 dark:text-amber-600" />
                    <span>{isOptimizingStorage ? '正在收缩...' : '整理并压缩存储 (VACUUM)'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-stone-400 dark:text-stone-500 truncate">
                {runtimeStatus.databaseMessage}
              </p>
            )}
          </div>
        </div>

        {/* 5. Quick Drop Ingestion Configuration */}
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--line)] p-5 sm:p-6 space-y-4 shadow-subtle transition-colors">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Smartphone className="w-5 h-5" />
            </span>
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">手机快捷指令 · 灵感碎片快投配置</h2>
          </div>

          <div className="p-4 bg-stone-500/[0.03] dark:bg-stone-800/60 rounded-2xl border border-stone-200/70 dark:border-stone-700 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-stone-700 dark:text-stone-300">快投 Webhook 接口 URL：</span>
              <button
                type="button"
                onClick={async () => {
              const url = resolvePublicUrl('/api/inbox/quick-drop', runtimeStatus.publicBaseUrl);
                  const copied = await copyTextToClipboard(url);
                  if (!copied) {
                    showToast({ message: '无法复制接口地址，请检查浏览器剪贴板权限后重试', tone: 'info' });
                    return;
                  }
                  setIsCopiedDropUrl(true);
                  setTimeout(() => setIsCopiedDropUrl(false), 2000);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:text-[var(--accent-dark)] cursor-pointer"
              >
                {isCopiedDropUrl ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopiedDropUrl ? '已复制接口地址' : '复制地址'}</span>
              </button>
            </div>

            <div className="p-3 bg-[var(--canvas)]/80 dark:bg-stone-800/80 rounded-xl border border-[var(--line)] font-mono text-[11px] text-stone-700 dark:text-stone-300 select-all break-all">
              {resolvePublicUrl('/api/inbox/quick-drop', runtimeStatus.publicBaseUrl)}
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
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--line)] p-5 sm:p-6 space-y-4 shadow-subtle transition-colors">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Database className="w-5 h-5" />
            </span>
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">数据安全、全量备份与文案归档</h2>
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
              className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-dark)] active:scale-[0.98] text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? '正在导出...' : '下载全量备份 (.json)'}</span>
            </button>

            {/* Export Markdown Archive */}
            <button
              onClick={handleExportMarkdown}
              disabled={isExporting || isImporting || isExportingMd}
              className="flex items-center gap-2 bg-[var(--canvas)]/70 dark:bg-stone-800 hover:bg-[var(--surface)] text-stone-800 dark:text-stone-200 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border border-[var(--line)] transition-colors disabled:opacity-50 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-[var(--accent)]" />
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

      <ConfirmDialog
        isOpen={isOptimizeDialogOpen}
        onClose={() => setIsOptimizeDialogOpen(false)}
        onConfirm={handleConfirmOptimize}
        title="整理并压缩数据库存储 (VACUUM)"
        description={
          storageStats
            ? `将执行 SQLite 空间整理与 WAL 日志归档，回收被删除笔记、草稿与历史操作释放的空闲碎片，将磁盘空间物理归还给操作系统。\n\n当前存储情况：\n• 数据库文件：${formatBytes(storageStats.db_file_bytes)}\n• WAL 日志文件：${formatBytes(storageStats.wal_file_bytes)}\n• 可回收空闲碎片：${storageStats.freelist_count} 页 (${formatBytes(storageStats.freelist_bytes)})\n• 回收站选题：${storageStats.trashed_topics_count} 个\n\n确定立即执行压缩整理吗？`
            : '将执行 SQLite 空间整理与 WAL 日志归档，回收空闲磁盘页并归还给操作系统。确定立即执行吗？'
        }
        confirmText="立即压缩整理"
        tone="primary"
        isLoading={isOptimizingStorage}
      />
    </div>
  );
};
