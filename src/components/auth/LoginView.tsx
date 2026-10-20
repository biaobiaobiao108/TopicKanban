import React, { useState } from 'react';
import { login } from '../../lib/auth';
import { Lock, ArrowRight, ShieldCheck, Sparkles, KeyRound, Eye, EyeOff } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await login(password);
      if (res.success) {
        onLoginSuccess();
      } else {
        setErrorMsg(res.message || '访问密码错误');
      }
    } catch (err: any) {
      setErrorMsg('登录请求失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh w-screen bg-canvas flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md bg-surface rounded-3xl border border-line shadow-modal p-8 sm:p-10 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Brand Header */}
        <div className="text-center space-y-2.5">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden mx-auto shadow-2xs border border-line p-1 bg-surface">
            <img src="/icon.png" alt="喵爪看板 Logo" width={56} height={56} className="w-full h-full object-cover rounded-xl" />
          </div>
          <h1 className="font-serif text-[22px] font-bold text-ink tracking-[0.02em]">喵爪看板</h1>
          <p className="text-xs text-ink-muted">
            视频创作者专属工作台 • 访问鉴权保护
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="workspace-password" className="block text-xs font-bold text-ink">
              工作台访问密码
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="workspace-password"
                name="password"
                autoComplete="current-password"
                autoFocus
                required
                placeholder="请输入访问口令密码..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-3.5 pr-10 py-2.5 bg-control border border-line rounded-xl text-ink text-sm focus:bg-surface focus:border-accent focus:outline-none transition-colors placeholder:text-ink-muted"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-muted p-1 cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-danger-soft border border-danger-line text-danger rounded-xl text-xs font-semibold flex items-center gap-2 animate-shake">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!password || loading}
            className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-dark active:scale-[0.98] text-white py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-2xs cursor-pointer"
          >
            <span>{loading ? '验证中...' : '进入工作台'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Security Info */}
        <div className="pt-4 border-t border-line space-y-2.5 text-center">
          <div className="text-[11px] text-ink-muted bg-control p-3 rounded-xl border border-line">
            <span className="font-semibold text-ink">访问口令由工作台管理员配置</span>
            <div className="text-[10px] text-ink-muted mt-0.5">本地开发默认密码为 admin，云端由 APP_PASSWORD 统一管理</div>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[10px] text-ink-muted">
            <ShieldCheck className="w-3.5 h-3.5 text-success" />
            <span>已开启端到端访问权限隔离保护</span>
          </div>
        </div>
      </div>
    </div>
  );
};
