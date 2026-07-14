import { API, h, avatar, hm, STATUS, STATUS_COLOR } from "./api.js";
import { App } from "./main.js";
import { openTaskModal } from "./task-modal.js";

export async function renderBacklog(view, { actions }) {
  view.innerHTML = `<div class="loading">Carregando…</div>`;
  const [items, sprints, epics] = await Promise.all([
    API.get("/api/workitems"), API.get("/api/sprints"), API.get("/api/epics")]);
  actions.replaceChildren(
    h("button", { class: "btn primary", onclick: () => openTaskModal(null, { sprints, epics, users: App.users, onSaved: () => renderBacklog(view, { actions }) }) }, "＋ Nova atividade"));

  const rows = items.map((w) =>
    h("tr", { onclick: () => openTaskModal(w, { sprints, epics, users: App.users, onSaved: () => renderBacklog(view, { actions }) }) },
      h("td", { style: { fontVariantNumeric: "tabular-nums", color: "var(--text-3)", width: "70px" } }, w.code),
      h("td", {}, h("span", { class: `badge ${w.type}` }, w.type)),
      h("td", { style: { fontWeight: "550" } }, w.title),
      h("td", {}, h("span", { class: "badge", style: { background: "transparent", color: STATUS_COLOR[w.status] } },
        h("span", { class: "dot", style: { background: STATUS_COLOR[w.status] } }), STATUS[w.status])),
      h("td", {}, w.epic ? h("span", { class: "muted" }, w.epic.name) : "—"),
      h("td", {}, w.assignee ? avatar(w.assignee, "sm") : h("span", { class: "faint" }, "—")),
      h("td", { style: { textAlign: "right", color: "var(--text-2)" } }, w.loggedMinutes ? hm(w.loggedMinutes) : "—")));

  view.innerHTML = "";
  view.append(h("div", { class: "panel" },
    h("table", { class: "tbl" },
      h("thead", {}, h("tr", {},
        ...["Código", "Tipo", "Título", "Status", "Épico", "Resp.", "Horas"].map((t) => h("th", {}, t)))),
      h("tbody", {}, rows))));
}
