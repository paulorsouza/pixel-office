import { API, h, esc, avatar, initials, colorFor } from "./api.js";
import { renderBoard } from "./board.js";
import { renderBacklog } from "./backlog.js";
import { renderHours } from "./hours.js";
import { renderReports } from "./reports.js";
import { renderMeeting } from "./meeting.js";
import { renderChat } from "./chat.js";
import { renderProfile } from "./profile.js";

const PAGES = {
  board: { title: "Kanban", sub: "arraste os cards entre as colunas", render: renderBoard },
  backlog: { title: "Backlog", sub: "todas as atividades", render: renderBacklog },
  hours: { title: "Horas", sub: "sua semana de trabalho", render: renderHours },
  reports: { title: "Relatórios", sub: "horas do time", render: renderReports },
  meeting: { title: "Reunião", sub: "entre na call sem abrir o jogo", render: renderMeeting },
  chat: { title: "Chat do jogo", sub: "quem está no escritório agora", render: renderChat },
  profile: { title: "Perfil", sub: "nível, conquistas e itens", render: renderProfile },
};

// ---------- sessão (Google/JWT) ----------
const Session = {
  data: null,
  load() { try { return JSON.parse(localStorage.getItem("oq_auth") || "null"); } catch { return null; } },
  save(s) { s ? localStorage.setItem("oq_auth", JSON.stringify(s)) : localStorage.removeItem("oq_auth"); Session.data = s; },
  decode(access) {
    try {
      const p = access.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(p.padEnd(p.length + ((4 - (p.length % 4)) % 4), "=")));
    } catch { return null; }
  },
  fromTokens(access, refresh, expiresIn) {
    const p = Session.decode(access) || {};
    return { access, refresh, expiresAt: Date.now() + (Number(expiresIn) || 1800) * 1000, uid: p.uid ? Number(p.uid) : null };
  },
  // Captura tokens de /auth/google/callback (…#access_token=…) e limpa a URL.
  captureFragment() {
    if (location.hash.length < 2) return;
    const f = new URLSearchParams(location.hash.slice(1));
    if (f.get("access_token")) {
      Session.save(Session.fromTokens(f.get("access_token"), f.get("refresh_token"), f.get("expires_in")));
      history.replaceState(null, "", location.pathname + location.search);
    }
  },
  async freshToken() {
    const s = Session.data;
    if (!s?.access) return null;
    if (Date.now() < s.expiresAt - 60_000) return s.access;
    if (!s.refresh) { Session.save(null); return null; }
    const res = await fetch("/auth/refresh", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: s.refresh }),
    });
    if (!res.ok) { Session.save(null); return null; }
    const b = await res.json();
    Session.save(Session.fromTokens(b.access_token, b.refresh_token, b.expires_in));
    return Session.data.access;
  },
};

export const App = {
  me: null,
  users: [],
  hub: null,

  async init() {
    Session.captureFragment();
    Session.data = Session.load();
    if (Session.data?.access) {
      const token = await Session.freshToken();
      if (token) { API.token = token; try { await App.boot(); return; } catch { Session.save(null); API.token = null; } }
    }
    const uid = localStorage.getItem("uid");
    if (uid) { API.uid = uid; try { await App.boot(); return; } catch { localStorage.removeItem("uid"); } }
    await App.showLogin();
  },

  async showLogin() {
    const cfg = await API.get("/auth/config").catch(() => ({ googleEnabled: false, passwordEnabled: true, devBypass: true }));
    const el = document.getElementById("login");
    el.className = "login";
    el.innerHTML = "";
    el.append(h("div", { class: "logo-lg" }, "◆"), h("h1", {}, "Office Quest"));

    if (cfg.passwordEnabled !== false) el.append(App.accountForm(cfg));

    if (cfg.googleEnabled) {
      el.append(
        h("p", {}, cfg.passwordEnabled === false ? "Entre com sua conta Tooq" : "ou entre com sua conta Tooq"),
        h("button", { class: "btn primary", onclick: () => App.googleLogin() }, "Entrar com Google"));
    }
    // Só em dev: o seletor simbólico de usuário (com DevBypass=false a API recusa).
    if (cfg.devBypass) {
      const users = await API.get("/api/users").catch(() => []);
      el.append(
        h("p", {}, "ou entre como (dev):"),
        h("div", { class: "cards" }, users.map((u) =>
          h("div", { class: "ucard", onclick: () => App.login(u.id) },
            avatar(u, "lg"), h("b", {}, u.name), h("span", {}, u.role),
            h("div", { class: "lvl" }, `⭐ ${u.xp} XP`)))));
    }
  },

  // Conta local (usuário + senha) — o caminho do beta. A mesma conta aceita o
  // Google depois, pelo botão de vincular no perfil.
  accountForm(cfg) {
    const username = h("input", { placeholder: "usuário", autocomplete: "username" });
    const password = h("input", { type: "password", placeholder: "senha", autocomplete: "current-password" });
    const name = h("input", { placeholder: "nome exibido (opcional)", autocomplete: "nickname" });
    const msg = h("div", { class: "form-msg" });
    const submit = h("button", { class: "btn primary", type: "submit" }, "Entrar");
    let mode = "login";

    const loginTab = h("button", { type: "button", class: "btn primary" }, "Entrar");
    const registerTab = h("button", { type: "button", class: "btn" }, "Criar conta");
    const setMode = (value) => {
      mode = value;
      loginTab.className = "btn" + (mode === "login" ? " primary" : "");
      registerTab.className = "btn" + (mode === "register" ? " primary" : "");
      name.hidden = mode !== "register";
      password.autocomplete = mode === "register" ? "new-password" : "current-password";
      submit.textContent = mode === "register" ? "Criar conta e entrar" : "Entrar";
      msg.textContent = "";
    };
    loginTab.onclick = () => setMode("login");
    registerTab.onclick = () => setMode("register");

    const tabs = cfg.registrationOpen ? h("div", { class: "tabs" }, loginTab, registerTab) : null;
    name.hidden = true;

    const form = h("form", {
      class: "account-form",
      onsubmit: async (ev) => {
        ev.preventDefault();
        submit.disabled = true;
        msg.textContent = "";
        try {
          const path = mode === "register" ? "/auth/register" : "/auth/login";
          const body = mode === "register"
            ? { username: username.value, password: password.value, name: name.value }
            : { username: username.value, password: password.value };
          const res = await fetch(path, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
          });
          const payload = await res.json().catch(() => null);
          if (!res.ok) throw new Error(payload?.error || `Erro ${res.status}`);
          Session.save(Session.fromTokens(payload.access_token, payload.refresh_token, payload.expires_in));
          API.token = payload.access_token;
          API.uid = null;
          localStorage.removeItem("uid");
          await App.boot();
        } catch (err) {
          msg.textContent = err.message;
          submit.disabled = false;
        }
      },
    }, tabs, username, password, name, submit, msg);
    return form;
  },

  googleLogin() {
    location.href = `/auth/google/login?return=${encodeURIComponent(location.origin + "/")}`;
  },

  login(uid) {
    API.uid = String(uid);
    localStorage.setItem("uid", API.uid);
    App.boot();
  },
  async logout() {
    const s = Session.data;
    Session.save(null);
    localStorage.removeItem("uid");
    if (s?.refresh) {
      try {
        await fetch("/auth/logout", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: s.refresh }),
        });
      } catch { /* best-effort */ }
    }
    location.reload();
  },

  async boot() {
    App.me = await API.get("/api/me");
    App.users = await API.get("/api/users");
    document.getElementById("login").className = "";
    document.getElementById("login").innerHTML = "";
    document.getElementById("app").classList.remove("hidden");
    App.renderMe();
    document.querySelectorAll("#nav .nav-item").forEach((a) =>
      a.addEventListener("click", () => (location.hash = "#/" + a.dataset.route)));
    window.addEventListener("hashchange", App.route);
    await App.connectHub();
    App.route();
  },

  renderMe() {
    const u = App.me.user;
    document.getElementById("me-card").replaceChildren(
      avatar(u),
      h("div", { class: "info" }, h("b", {}, u.name), h("span", {}, u.role)),
      h("div", { class: "spacer" }),
      h("button", { class: "btn icon ghost sm", title: "Sair", onclick: () => App.logout() }, "⎋"));
  },

  route() {
    const name = (location.hash.replace("#/", "") || "board").split("?")[0];
    const page = PAGES[name] ?? PAGES.board;
    document.querySelectorAll("#nav .nav-item").forEach((a) =>
      a.classList.toggle("active", a.dataset.route === name));
    document.getElementById("page-title").textContent = page.title;
    document.getElementById("page-sub").textContent = page.sub;
    document.getElementById("topbar-actions").innerHTML = "";
    const view = document.getElementById("view");
    view.innerHTML = "";
    page.render(view, { actions: document.getElementById("topbar-actions") });
  },

  userById(id) { return App.users.find((u) => u.id === id); },

  // hub compartilhado (presença + chat do jogo)
  async connectHub() {
    if (App.hub) return;
    App.hub = new signalR.HubConnectionBuilder()
      .withUrl("/hub/office", API.token ? { accessTokenFactory: () => Session.freshToken() } : {})
      .withAutomaticReconnect().build();
    // handlers específicos são registrados pelas páginas chat/meeting
    try {
      await App.hub.start();
      // com token o servidor deriva o usuário do JWT; o argumento é fallback de dev.
      // "panel": o painel não disputa o avatar do mundo com o cliente do jogo.
      await App.hub.invoke("Join", Number(API.uid) || 0, "panel");
    } catch { App.hub = null; }
  },

  async refreshMe() { App.me = await API.get("/api/me"); App.renderMe(); },
};

App.init();
