// Núcleo da UI de trabalho (kanban / horas / objetivos).
//
// Este módulo é servido pelo backend e consumido por DOIS clientes:
//   - o app web (mesma origem)
//   - o cliente do jogo em Phaser (outra origem em dev, mesma atrás do proxy)
// Por isso nada aqui pode depender de `location.origin`, de CSS global ou de
// elementos fixos da página: tudo recebe o contexto por parâmetro.

export function createWorkClient({ base = "", token = null, userId = null } = {}) {
  const root = String(base || "").replace(/\/$/, "");
  const resolveToken = typeof token === "function" ? token : () => token;

  async function req(method, path, body) {
    const auth = (await resolveToken()) || null;
    const res = await fetch(`${root}${path}`, {
      method,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: `Bearer ${auth}` } : { "X-User-Id": String(userId ?? "") }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let message = `Erro ${res.status}`;
      try { message = (await res.json())?.error ?? message; } catch { /* sem corpo JSON */ }
      throw new Error(message);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    base: root,
    userId,
    get: (p) => req("GET", p),
    post: (p, b) => req("POST", p, b ?? {}),
    patch: (p, b) => req("PATCH", p, b ?? {}),
    del: (p) => req("DELETE", p),
  };
}

// ---------- DOM ----------

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(4)) {
    if (kid == null || kid === false || kid === "") continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- formatação ----------

export function hm(minutes) {
  const total = Math.round(minutes || 0);
  const sign = total < 0 ? "-" : "";
  const abs = Math.abs(total);
  const hrs = Math.floor(abs / 60);
  const min = abs % 60;
  return hrs > 0 ? `${sign}${hrs}h${String(min).padStart(2, "0")}` : `${sign}${min}min`;
}

export const hoursDecimal = (minutes) => (Math.round((minutes / 60) * 100) / 100).toFixed(2);

export function dayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const shortDate = (date) =>
  new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/** Data relativa curta — "hoje", "ontem", "há 3 d". */
export function relativeDay(date) {
  const target = new Date(date);
  const days = Math.round((new Date(dayKey(new Date())) - new Date(dayKey(target))) / 864e5);
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  if (days === -1) return "amanhã";
  return days > 0 ? `há ${days} d` : `em ${-days} d`;
}

// ---------- constantes de domínio ----------

export const STATUS_LABEL = {
  Backlog: "Backlog", Todo: "A fazer", InProgress: "Fazendo", Review: "Revisão", Done: "Concluído",
};
export const STATUS_ORDER = ["Backlog", "Todo", "InProgress", "Review", "Done"];
export const STATUS_COLOR = {
  Backlog: "#8b929d", Todo: "#2f6bff", InProgress: "#d98a00", Review: "#7c5cff", Done: "#16a34a",
};
export const PRIORITY_ORDER = ["Urgent", "High", "Medium", "Low"];
export const PRIORITY_LABEL = { Urgent: "Urgente", High: "Alta", Medium: "Média", Low: "Baixa" };
export const PRIORITY_COLOR = { Urgent: "#e5484d", High: "#d98a00", Medium: "#2f6bff", Low: "#8b929d" };
export const TYPE_ORDER = ["Task", "Bug", "Atendimento"];

const AVATAR_COLORS = ["#7c5cff", "#e0685f", "#0d9488", "#d98a00", "#2f6bff", "#db2777", "#65a30d", "#0891b2"];
export const colorFor = (user) => user?.color || AVATAR_COLORS[(user?.id ?? 0) % AVATAR_COLORS.length];
export function initials(name) {
  const parts = String(name ?? "?").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
export const avatar = (user, size = "") =>
  h("span", { class: `wq-avatar ${size}`, style: { background: colorFor(user) }, title: user?.name ?? "" },
    initials(user?.name));

// ---------- feedback dentro do container (funciona no jogo e no app) ----------

/**
 * Toasts e modais vivem numa camada própria.
 *
 * - `fixed: false` (padrão) — a camada fica dentro do container. É o que o jogo
 *   precisa: o painel é uma janela com z-index próprio e o body é do Phaser.
 * - `fixed: true` — camada presa à viewport, para páginas que rolam; ela leva a
 *   classe `wq` porque, fora do container, não herdaria os tokens.
 */
export function createFeedback(container, { fixed = false, theme = null } = {}) {
  const layer = h("div", { class: fixed ? "wq wq-layer fixed" : "wq-layer" });
  if (fixed && theme) layer.dataset.theme = theme;
  (fixed ? document.body : container).append(layer);

  const toast = (message, tone = "info") => {
    const el = h("div", { class: `wq-toast ${tone}` }, message);
    layer.append(el);
    setTimeout(() => el.classList.add("out"), 3200);
    setTimeout(() => el.remove(), 3600);
  };

  const modal = ({ title, body, foot, wide = false }) => {
    const close = () => backdrop.remove();
    const backdrop = h("div", {
      class: "wq-backdrop",
      onclick: (e) => { if (e.target === backdrop) close(); },
    }, h("div", { class: `wq-modal${wide ? " wide" : ""}` },
      h("header", {}, h("h2", {}, title), h("button", { class: "wq-icon-btn", onclick: () => close() }, "✕")),
      h("div", { class: "wq-modal-body" }, body),
      foot && h("footer", {}, foot)));
    layer.append(backdrop);
    return { close, el: backdrop };
  };

  return { toast, modal, layer };
}

/** Estado vazio/carregando/erro padronizado. */
export const placeholder = (message, tone = "") =>
  h("div", { class: `wq-placeholder ${tone}` }, message);

/**
 * Injeta o CSS compartilhado a partir do backend. Idempotente — o jogo pode
 * chamar em toda abertura de painel sem duplicar o <link>.
 */
export function ensureWorkStyles(base = "") {
  const href = `${String(base || "").replace(/\/$/, "")}/shared/work-ui.css`;
  if (document.querySelector(`link[data-wq-styles="${href}"]`)) return;
  document.head.append(h("link", { rel: "stylesheet", href, dataset: { wqStyles: href } }));
}
