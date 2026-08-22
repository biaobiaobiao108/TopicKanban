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
    <div className="min-h-screen w-screen bg-[#fafaf9] flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl border border-stone-200/90 shadow-card p-7 sm:p-9 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden mx-auto shadow-sm">
            <img src="/icon.png" alt="工作台 Logo" className="w-full h-full object-cover rounded-2xl" />
          </div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight">选题生产工作台</h1>
          <p className="text-xs text-stone-500">
            B站叙事类视频创作者工作台 • 访问鉴权保护
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-stone-700">
              工作台访问密码
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                autoFocus
                required
                placeholder="请输入访问口令密码..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-3.5 pr-10 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-sm focus:bg-white focus:border-stone-900 focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!password || loading}
            className="w-full flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-800 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
          >
            <span>{loading ? '验证中...' : '进入工作台'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Security Info */}
        <div className="pt-4 border-t border-stone-100 space-y-2 text-center">
          <div className="text-[11px] text-stone-500 bg-stone-50 p-2.5 rounded-xl border border-stone-200/80">
            <span className="font-semibold text-stone-700">访问口令由工作台管理员配置</span>
            <div className="text-[10px] text-stone-400 mt-1">本地模式可在偏好设置修改，云端使用 Cloudflare APP_PASSWORD</div>
          </div>

          <div className="flex items-center justify-center gap-1 text-[10px] text-stone-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>已开启端到端访问权限隔离保护</span>
          </div>
        </div>
      </div>
    </div>
  );
};
