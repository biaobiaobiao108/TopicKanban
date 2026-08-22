import React, { type ErrorInfo, type ReactNode } from 'react';

interface ViewErrorBoundaryProps {
  children: ReactNode;
}

interface ViewErrorBoundaryState {
  error: Error | null;
}

export class ViewErrorBoundary extends React.Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
  state: ViewErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ViewErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('工作台页面渲染失败', error, info);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex-1 grid place-items-center p-6">
        <div role="alert" className="w-full max-w-lg rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900">
          <h2 className="text-base font-bold">页面加载失败</h2>
          <p className="mt-2 text-sm text-red-800">
            部署更新后，浏览器中的旧资源可能已经失效。请刷新页面加载最新版本。
          </p>
          <details className="mt-3 text-xs text-red-700">
            <summary className="cursor-pointer font-semibold">错误详情</summary>
            <p className="mt-1 break-all">{this.state.error.message}</p>
          </details>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-red-100"
          >
            刷新页面
          </button>
        </div>
      </div>
    );
  }
}
