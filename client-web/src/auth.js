// Autenticação do cliente: conta local (usuário + senha) e, quando configurado,
// login com Google — os dois emitem o mesmo par de tokens da aplicação. Mantém o
// access token fresco (refresh rotativo) e injeta o Bearer nas requisições. Quando
// não há token, o app cai no modo de desenvolvimento (X-User-Id / ?userId=).

const STORAGE_KEY = 'oq_auth';

const browserLocation = globalThis.location || new URL('http://localhost:8123/');
const query = new URLSearchParams(browserLocation.search);

export function resolveApiBase() {
  const override = query.get('api');
  if (override) return override.replace(/\/$/, '');
  // Dev: o servidor estático do jogo roda em :8123 e o backend em :5210.
  if (browserLocation.port === '8123') return 'http://localhost:5210';
  // Produção: game e API são servidos na mesma origem (atrás do proxy).
  return browserLocation.origin;
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
  if (!browserLocation.hash || browserLocation.hash.length < 2) return;
  const frag = new URLSearchParams(browserLocation.hash.slice(1));
  const access = frag.get('access_token');
  if (access) {
    save(fromTokens(access, frag.get('refresh_token'), frag.get('expires_in')));
    frag.delete('access_token');
    frag.delete('refresh_token');
    frag.delete('expires_in');
    frag.delete('token_type');
    const rest = frag.toString();
    // preserva o resto do hash (ex.: #world) sem os tokens
    globalThis.history?.replaceState(
      null,
      '',
      browserLocation.pathname + browserLocation.search + (rest ? `#${rest}` : ''),
    );
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

// POST em /auth/*, devolvendo o corpo JSON ou lançando com a mensagem do servidor.
async function postAuth(path, body) {
  const res = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch { /* 204 ou corpo vazio */ }
  if (!res.ok) throw new Error(payload?.error || `Falha (${res.status})`);
  return payload;
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

  // ---- conta local (usuário + senha) ----
  async register({ username, password, name, email }) {
    const body = await postAuth('/auth/register', { username, password, name, email });
    save(fromTokens(body.access_token, body.refresh_token, body.expires_in));
    return body.user;
  },

  async signIn({ username, password }) {
    const body = await postAuth('/auth/login', { username, password });
    save(fromTokens(body.access_token, body.refresh_token, body.expires_in));
    return body.user;
  },

  // Troca a senha (e define o usuário, se a conta veio só do Google).
  async changePassword({ currentPassword, newPassword, username }) {
    const token = await auth.token();
    const res = await fetch(`${apiBase}/auth/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword, username }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.error || `Falha (${res.status})`);
    save(fromTokens(payload.access_token, payload.refresh_token, payload.expires_in));
    return payload.user;
  },

  // Identidade completa (inclui hasPassword/hasGoogle) — exige token válido.
  async me() {
    const token = await auth.token();
    if (!token) return null;
    const res = await fetch(`${apiBase}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    return res.ok ? res.json() : null;
  },

  // Redireciona para o consentimento do Google; volta para returnUrl com os tokens.
  login(returnUrl = browserLocation.href) {
    browserLocation.href = `${apiBase}/auth/google/login?return=${encodeURIComponent(returnUrl)}`;
  },

  // Mesmo fluxo, mas pendurando o Google na conta já logada (não cria outra).
  async linkGoogle(returnUrl = browserLocation.href) {
    const token = await auth.token();
    if (!token) throw new Error('Entre na conta antes de vincular o Google.');
    browserLocation.href = `${apiBase}/auth/google/login?return=${encodeURIComponent(returnUrl)}`
      + `&link=${encodeURIComponent(token)}`;
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
      return { googleEnabled: false, passwordEnabled: true, registrationOpen: true, devBypass: true };
    }
  },
};

if (globalThis.window) window.__auth = auth;
