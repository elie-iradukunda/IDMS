// ─────────────────────────────────────────────────────────────
// API client — a thin fetch wrapper that attaches the JWT, parses
// JSON, and turns non-2xx responses into thrown Errors carrying the
// backend's { error, duplicates } payload. On 401 it emits a global
// event so the auth layer can log the user out.
// ─────────────────────────────────────────────────────────────
const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'ids_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

export async function api(path, { method = 'GET', body, headers = {}, withMeta = false } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Network / server-unreachable
    throw new Error('Cannot reach the server. Is the API running on :4000?');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('ids:unauthorized'));
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  // Paged endpoints answer with the page as the body and the full match count
  // in X-Total-Count, so a list can say "showing 25 of 2,431" without a second
  // request. The header is absent on unpaged endpoints; fall back to the
  // length of what actually arrived rather than reporting zero.
  if (withMeta) {
    const header = res.headers.get('X-Total-Count');
    const total = header !== null && header !== '' ? Number(header) : (Array.isArray(data) ? data.length : 0);
    return { rows: data, total: Number.isFinite(total) ? total : 0 };
  }
  return data;
}

export const get = (p) => api(p);
export const getList = (p) => api(p, { withMeta: true });
export const post = (p, body) => api(p, { method: 'POST', body });
export const patch = (p, body) => api(p, { method: 'PATCH', body });
export const del = (p) => api(p, { method: 'DELETE' });

// Build a query string, skipping empty / "all" values.
export function qs(params = {}) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== 'all') usp.set(k, v);
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}
