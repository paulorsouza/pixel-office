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

export const App = {
  me: null,
  users: [],
  hub: null,

  async init() {
    const uid = localStorage.getItem("uid");
    if (uid) { API.uid = uid; try { await App.boot(); return; } catch { localStorage.removeItem("uid"); } }
    await App.showLogin();
  },

  async showLogin() {
    const users = await API.get("/api/users");
    const el = document.getElementById("login");
    el.className = "login";
    el.innerHTML = "";
    el.append(
      h("div", { class: "logo-lg" }, "◆"),
      h("h1", {}, "Office Quest"),
      h("p", {}, "Escolha quem você é para entrar"),
      h("div", { class: "cards" }, users.map((u) =>
        h("div", { class: "ucard", onclick: () => App.login(u.id) },
          avatar(u, "lg"),
          h("b", {}, u.name),
          h("span", {}, u.role),
          h("div", { class: "lvl" }, `⭐ ${u.xp} XP`)))));
  },

  login(uid) {
    API.uid = String(uid);
    localStorage.setItem("uid", API.uid);
    App.boot();
  },
  logout() { localStorage.removeItem("uid"); location.reload(); },

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
    App.hub = new signalR.HubConnectionBuilder().withUrl("/hub/office").withAutomaticReconnect().build();
    // handlers específicos são registrados pelas páginas chat/meeting
    try {
      await App.hub.start();
      await App.hub.invoke("Join", Number(API.uid));
    } catch { App.hub = null; }
  },

  async refreshMe() { App.me = await API.get("/api/me"); App.renderMe(); },
};

App.init();
