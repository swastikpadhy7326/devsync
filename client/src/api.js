// Empty locally (Vite's proxy handles /api). On Vercel it is the Render URL.
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const ACCESS_KEY = 'devsync_access';
const REFRESH_KEY = 'devsync_refresh';
const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

export const tokens = {
  get access() { return localStorage.getItem(ACCESS_KEY); },
  get refresh() { return localStorage.getItem(REFRESH_KEY); },
  set({ accessToken, refreshToken }) {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

let refreshing = null;

async function refreshTokens() {
  if (!tokens.refresh) return false;
  // Several requests can fail at once; they all share one refresh call
  if (!refreshing) {
    refreshing = fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refresh }),
    })
      .then(async (res) => {
        if (!res.ok) return false;
        tokens.set(await res.json());
        return true;
      })
      .catch(() => false)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export class ApiError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

async function request(path, options = {}, retry = true) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`;

  const res = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers,
        body: options.raw ? options.body : options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && retry && tokens.refresh && !NO_REFRESH.includes(path)) {
    if (await refreshTokens()) return request(path, options, false);
    tokens.clear();
    window.dispatchEvent(new Event('devsync:logout'));
  }

    if (options.asBlob && res.ok) return res.blob();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.message || 'Request failed', res.status, data.errors);
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
    upload: (path, blob, headers) => request(path, { method: 'POST', body: blob, raw: true, headers }),
  blob: (path) => request(path, { asBlob: true }),
};