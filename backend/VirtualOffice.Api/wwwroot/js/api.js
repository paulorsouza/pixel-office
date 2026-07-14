// Wrapper de API + helpers de UI compartilhados.
export const API = {
  uid: null,
  async req(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "X-User-Id": API.uid ?? "" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = `Erro ${res.status}`;
      try { msg = (await res.json()).error ?? msg; } catch {}
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  },
  get: (u) => API.req("GET", u),
  post: (u, b) => API.req("POST", u, b ?? {}),
  patch: (u, b) => API.req("PATCH", u, b),
  put: (u, b) => API.req("PUT", u, b),
  del: (u) => API.req("DELETE", u),
};

// ---------- helpers ----------
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return e;
}

const AVATAR_COLORS = ["#7c5cff", "#e0685f", "#0d9488", "#d98a00", "#2f6bff", "#db2777", "#65a30d", "#0891b2"];
export function colorFor(user) {
  if (user?.color) return user.color;
  const id = user?.id ?? 0;
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}
export function initials(name) {
  const p = String(name ?? "?").trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}
export function avatar(user, cls = "") {
  return h("span", { class: `avatar ${cls}`, style: { background: colorFor(user) }, title: user?.name ?? "" },
    initials(user?.name));
}

export function hm(minutes) {
  const m = Math.round(minutes || 0);
  const hrs = Math.floor(m / 60), min = m % 60;
  return hrs > 0 ? `${hrs}h${String(min).padStart(2, "0")}` : `${min}min`;
}
export const STATUS = { Backlog: "Backlog", Todo: "A fazer", InProgress: "Fazendo", Review: "Revisão", Done: "Concluído" };
export const STATUS_ORDER = ["Backlog", "Todo", "InProgress", "Review", "Done"];
export const STATUS_COLOR = { Backlog: "#8b929d", Todo: "#2f6bff", InProgress: "#d98a00", Review: "#7c5cff", Done: "#16a34a" };
export const TYPE_LABEL = { Task: "Task", Bug: "Bug", Atendimento: "Atendimento" };

// ---------- toast / modal ----------
export function toast(msg, color) {
  const box = document.getElementById("toasts");
  const t = h("div", { class: "toast" },
    h("span", { class: "bar", style: color ? { background: color } : {} }),
    h("span", {}, msg));
  box.append(t);
  setTimeout(() => t.remove(), 4200);
}

export function modal({ title, body, foot }) {
  const root = document.getElementById("modal-root");
  const close = () => (root.innerHTML = "");
  const back = h("div", { class: "modal-backdrop", onclick: (e) => { if (e.target === back) close(); } },
    h("div", { class: "modal" },
      h("div", { class: "modal-head" }, h("h2", {}, title), h("div", { class: "spacer" }),
        h("button", { class: "btn icon ghost sm", onclick: close }, "✕")),
      h("div", { class: "modal-body" }, body),
      foot && h("div", { class: "modal-foot" }, foot)));
  root.innerHTML = "";
  root.append(back);
  return { close };
}

export function option(value, label, selected) {
  return h("option", { value, selected: selected ? "selected" : null }, label);
}
