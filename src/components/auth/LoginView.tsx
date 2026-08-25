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
    <div className="min-h-screen w-screen bg-stone-50/50 dark:bg-stone-950 flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md bg-white dark:bg-stone-900 rounded-3xl border border-stone-200/70 dark:border-stone-800 shadow-modal p-8 sm:p-10 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Brand Header */}
        <div className="text-center space-y-2.5">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden mx-auto shadow-2xs border border-stone-200/60 dark:border-stone-700 p-1 bg-white dark:bg-stone-800">
            <img src="/icon.png" alt="工作台 Logo" className="w-full h-full object-cover rounded-xl" />
          </div>
          <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">选题生产工作台</h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            B站叙事类视频创作者工作台 • 访问鉴权保护
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="workspace-password" className="block text-xs font-bold text-stone-700 dark:text-stone-300">
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
                className="w-full pl-3.5 pr-10 py-2.5 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 rounded-xl text-stone-900 dark:text-stone-100 text-sm focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 focus:outline-none transition-colors placeholder:text-stone-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-1 cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold flex items-center gap-2 animate-shake">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!password || loading}
            className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-2xs cursor-pointer"
          >
            <span>{loading ? '验证中...' : '进入工作台'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Security Info */}
        <div className="pt-4 border-t border-stone-100 dark:border-stone-800 space-y-2.5 text-center">
          <div className="text-[11px] text-stone-500 dark:text-stone-400 bg-stone-500/[0.03] dark:bg-stone-800/60 p-3 rounded-xl border border-stone-200/50 dark:border-stone-800">
            <span className="font-semibold text-stone-700 dark:text-stone-300">访问口令由工作台管理员配置</span>
            <div className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5">本地开发默认密码为 admin，云端由 APP_PASSWORD 统一管理</div>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[10px] text-stone-400 dark:text-stone-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>已开启端到端访问权限隔离保护</span>
          </div>
        </div>
      </div>
    </div>
  );
};
