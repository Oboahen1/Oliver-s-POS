// API client. Each portal keeps its own session, so an administrator and a
// salesperson can be signed in at the same time in different browser tabs.
export const portal = document.documentElement.dataset.portal || 'sales';
const KEY = `pos_session_${portal}`;

export const session = {
  get() { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; } },
  set(v) { sessionStorage.setItem(KEY, JSON.stringify(v)); },
  clear() { sessionStorage.removeItem(KEY); }
};

export async function api(path, { method = 'GET', body } = {}) {
  const s = session.get();
  const headers = { 'Content-Type': 'application/json' };
  if (s?.token) headers.Authorization = 'Bearer ' + s.token;
  const res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') { session.clear(); location.reload(); throw new Error('Your session expired. Please sign in again.'); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

export function logout() { session.clear(); location.reload(); }
