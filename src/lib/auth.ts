const AUTH_KEY = 'topic_kanban_auth_token_v1';
export function isAuthenticated(): boolean {
  const token = localStorage.getItem(AUTH_KEY);
  return !!token && token.startsWith('v1.');
}

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_KEY);
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    logout();
    window.dispatchEvent(new Event('kanban:unauthorized'));
  }
  return response;
}

export async function login(password: string): Promise<{ success: boolean; message?: string }> {
  const trimmed = password.trim();
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: trimmed }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = (await res.json()) as { success?: boolean; token?: string; message?: string };
      if (data.success && data.token) {
        localStorage.setItem(AUTH_KEY, data.token);
        return { success: true };
      }
      return { success: false, message: data?.message || '访问密码错误，请重新输入' };
    }
  } catch {
    return { success: false, message: '服务暂时不可用，请确认本地 Pages 服务或云端部署正常' };
  }

  return { success: false, message: '服务响应异常，请稍后重试' };
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY);
}
