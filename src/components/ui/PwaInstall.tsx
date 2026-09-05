import React, { useState } from 'react';
import { Download, MoreVertical, Plus, Share, Smartphone, X } from 'lucide-react';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import {
  dismissPwaInstallBanner,
  isPwaInstallBannerDismissed,
} from '../../lib/pwa';
import { Modal } from './Modal';
import { useToast } from './Toast';

type InstallHelpMode = 'ios' | 'manual';
type InstallButtonVariant = 'menu' | 'inline';

interface InstallHelpModalProps {
  mode: InstallHelpMode;
  isOpen: boolean;
  onClose: () => void;
}

const InstallHelpModal: React.FC<InstallHelpModalProps> = ({ mode, isOpen, onClose }) => (
  <Modal isOpen={isOpen} onClose={onClose} title="安装到手机" maxWidth="sm">
    <div className="space-y-4 text-sm leading-6 text-stone-700 dark:text-stone-300">
      {mode === 'ios' ? (
        <>
          <p>当前浏览器没有自动安装按钮，请按下面步骤将工作台添加到主屏幕：</p>
          <ol className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300"><Share className="h-4 w-4" /></span>
              <span><strong className="text-stone-900 dark:text-stone-100">打开分享菜单</strong><br />点击浏览器底部或顶部的分享按钮。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300"><Plus className="h-4 w-4" /></span>
              <span><strong className="text-stone-900 dark:text-stone-100">添加到主屏幕</strong><br />在分享菜单中选择“添加到主屏幕”。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300"><Smartphone className="h-4 w-4" /></span>
              <span><strong className="text-stone-900 dark:text-stone-100">确认添加</strong><br />从主屏幕图标打开后，会以独立 App 窗口运行。</span>
            </li>
          </ol>
        </>
      ) : (
        <>
          <p>请打开浏览器菜单，选择“安装应用”“添加到主屏幕”或同类选项。</p>
          <div className="flex items-start gap-3 rounded-xl border border-stone-200/80 bg-stone-50 px-3 py-3 dark:border-stone-700 dark:bg-stone-800/70">
            <MoreVertical className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>如果看不到安装选项，请确认当前地址使用 HTTPS，并优先使用最新版 Chrome、Edge 或 Samsung Internet。</span>
          </div>
        </>
      )}
    </div>
  </Modal>
);

interface PwaInstallButtonProps {
  variant?: InstallButtonVariant;
}

export const PwaInstallButton: React.FC<PwaInstallButtonProps> = ({ variant = 'inline' }) => {
  const { canPrompt, isIOS, isSecureContext, isStandalone, isSupported, promptInstall } = usePwaInstall();
  const { showToast } = useToast();
  const [helpMode, setHelpMode] = useState<InstallHelpMode | null>(null);

  if (isStandalone) return null;

  const openHelp = () => setHelpMode(isIOS ? 'ios' : 'manual');
  const handleInstall = async () => {
    if (isIOS || !canPrompt) {
      openHelp();
      return;
    }
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      showToast({ message: '已打开安装提示，请按系统提示完成安装', tone: 'success' });
    } else if (outcome === 'dismissed') {
      showToast({ message: '已取消安装，之后仍可从设置再次安装', tone: 'info' });
    } else {
      openHelp();
    }
  };

  const label = isIOS ? '添加到主屏幕' : canPrompt ? '安装到手机' : '查看安装说明';
  const buttonClass = variant === 'menu'
    ? 'flex min-h-11 w-full items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-750'
    : 'inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-2xs transition-all hover:bg-rose-700 active:scale-[0.98]';

  return (
    <>
      <button type="button" onClick={() => void handleInstall()} className={buttonClass}>
        <Download className="h-4 w-4" aria-hidden="true" />
        <span>{label}</span>
      </button>
      {!isSecureContext && (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">当前地址不是 HTTPS，正式部署后才能获得完整安装能力。</p>
      )}
      {!isSupported && (
        <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400">当前浏览器不提供 PWA 安装能力，建议使用 Safari 或最新版 Chrome。</p>
      )}
      <InstallHelpModal
        mode={helpMode || 'manual'}
        isOpen={helpMode !== null}
        onClose={() => setHelpMode(null)}
      />
    </>
  );
};

export const PwaInstallCard: React.FC = () => {
  const { isStandalone } = usePwaInstall();

  return (
    <section className="rounded-2xl border border-stone-200/70 bg-white p-5 shadow-2xs transition-colors dark:border-stone-800 dark:bg-stone-900 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-rose-500/10 p-1.5 text-rose-600 dark:text-rose-400"><Smartphone className="h-5 w-5" /></span>
          <div>
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">安装到手机</h2>
            <p className="mt-1 text-xs leading-5 text-stone-600 dark:text-stone-400">
              {isStandalone ? '当前已作为独立 App 运行。' : '安装后可从主屏幕直接打开，获得更接近原生 App 的使用体验。'}
            </p>
          </div>
        </div>
        {!isStandalone && <PwaInstallButton />}
      </div>
    </section>
  );
};

export const PwaInstallPromptBanner: React.FC = () => {
  const { isInstallable, isIOS, isStandalone } = usePwaInstall();
  const [isDismissed, setIsDismissed] = useState(isPwaInstallBannerDismissed);
  const [isClosing, setIsClosing] = useState(false);

  if (isStandalone || !isInstallable || isDismissed) return null;

  const handleDismiss = () => {
    if (isClosing) return;
    dismissPwaInstallBanner();
    setIsClosing(true);
    const delay = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 0 : 180;
    window.setTimeout(() => setIsDismissed(true), delay);
  };

  return (
    <div className={`pwa-install-banner ${isClosing ? 'pwa-install-banner-closing' : ''} border-b border-rose-200/80 bg-rose-50/90 px-4 py-2.5 dark:border-rose-900/60 dark:bg-rose-950/30 sm:px-6`}>
      <div className="mx-auto flex max-w-7xl items-center gap-3 text-xs text-rose-950 dark:text-rose-100">
        <Smartphone className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
        <p className="min-w-0 flex-1">{isIOS ? '把选题工作台添加到主屏幕，随时像 App 一样打开。' : '把选题工作台安装到设备，获得独立 App 窗口。'}</p>
        <PwaInstallButton />
        <button
          type="button"
          aria-label="关闭安装提示"
          onClick={handleDismiss}
          className="shrink-0 rounded-lg p-1.5 text-rose-700 transition-colors hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-900/40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
