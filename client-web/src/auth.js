// Autenticação do cliente: captura os tokens que o backend devolve no fragmento
// da URL após o login com Google, mantém o access token fresco (refresh rotativo)
// e injeta o Bearer nas requisições. Quando não há token, o app cai no modo de
// desenvolvimento (X-User-Id / ?userId=), sem quebrar o loop atual.

const STORAGE_KEY = 'oq_auth';

const query = new URLSearchParams(location.search);

export function resolveApiBase() {
  const override = query.get('api');
  if (override) return override.replace(/\/$/, '');
  // Dev: o servidor estático do jogo roda em :8123 e o backend em :5210.
  if (location.port === '8123') return 'http://localhost:5210';
  // Produção: game e API são servidos na mesma origem (atrás do proxy).
  return location.origin;
}

const apiBase = resolveApiBase();

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function save(session) {
  if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else localStorage.removeItem(STORAGE_KEY);
  state = session;
}

// Decodifica o payload do JWT só para leituras locais (uid/nome). A validação de
// verdade é sempre no servidor; aqui é apenas dica de UI/ownership.
function decodePayload(accessToken) {
  try {
    const part = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')));
  } catch {
    return null;
  }
}

function fromTokens(access, refresh, expiresIn) {
  const payload = decodePayload(access) || {};
  return {
    access,
    refresh,
    expiresAt: Date.now() + (Number(expiresIn) || 1800) * 1000,
    uid: payload.uid ? Number(payload.uid) : null,
    name: payload.name || null,
    role: payload.role || 'Member',
    email: payload.email || null,
  };
}

// Captura tokens vindos de /auth/google/callback (…#access_token=…&refresh_token=…).
function captureFromFragment() {
  if (!location.hash || location.hash.length < 2) return;
  const frag = new URLSearchParams(location.hash.slice(1));
  const access = frag.get('access_token');
  if (access) {
    save(fromTokens(access, frag.get('refresh_token'), frag.get('expires_in')));
    frag.delete('access_token');
    frag.delete('refresh_token');
    frag.delete('expires_in');
    frag.delete('token_type');
    const rest = frag.toString();
    // preserva o resto do hash (ex.: #world) sem os tokens
    history.replaceState(null, '', location.pathname + location.search + (rest ? `#${rest}` : ''));
  } else if (frag.get('error')) {
    console.warn('Login falhou:', frag.get('error'));
  }
}

let state = load();
captureFromFragment();

let refreshing = null;

async function refresh() {
  if (!state?.refresh) return null;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch(`${apiBase}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: state.refresh }),
      });
      if (!res.ok) {
        save(null); // refresh expirado/revogado: exige novo login
        return null;
      }
      const body = await res.json();
      save(fromTokens(body.access_token, body.refresh_token, body.expires_in));
      return state.access;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export const auth = {
  apiBase,
  isAuthenticated: () => !!state?.access,
  userId: () => state?.uid ?? null,
  name: () => state?.name ?? null,
  role: () => state?.role ?? null,

  // Access token válido; renova de forma preguiçosa quando perto de expirar.
  async token() {
    if (!state?.access) return null;
    if (Date.now() > state.expiresAt - 60_000) return refresh();
    return state.access;
  },

  // Redireciona para o consentimento do Google; volta para returnUrl com os tokens.
  login(returnUrl = location.href) {
    location.href = `${apiBase}/auth/google/login?return=${encodeURIComponent(returnUrl)}`;
  },

  async logout() {
    const token = state?.refresh;
    save(null);
    if (token) {
      try {
        await fetch(`${apiBase}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: token }),
        });
      } catch { /* logout best-effort */ }
    }
  },

  async config() {
    try {
      return await (await fetch(`${apiBase}/auth/config`, { cache: 'no-store' })).json();
    } catch {
      return { googleEnabled: false, devBypass: true };
    }
  },
};

window.__auth = auth;
