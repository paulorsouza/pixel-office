// Lista plana de atividades — a mesma base do quadro, vista como tabela.
// Usa os diálogos compartilhados, então editar aqui é idêntico a editar no kanban.
import {
  h, hm, avatar, keepFocus, placeholder, relativeDay,
  STATUS_LABEL, STATUS_COLOR, PRIORITY_LABEL, PRIORITY_COLOR, TYPE_ORDER,
} from "./work-core.js";
import { createCardDialogs, TYPE_COLOR } from "./card-dialogs.js";
import { createQuickAdd } from "./quick-add.js";
import { loadBoardMeta } from "./board.js";

const SORTS = {
  priority: (a, b) => rank(b.priority) - rank(a.priority) || a.id - b.id,
  code: (a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }),
  logged: (a, b) => b.loggedMinutes - a.loggedMinutes,
  due: (a, b) => (a.dueUtc ? +new Date(a.dueUtc) : Infinity) - (b.dueUtc ? +new Date(b.dueUtc) : Infinity),
};
const rank = (p) => ({ Urgent: 3, High: 2, Medium: 1, Low: 0 }[p] ?? 1);

export function mountBacklog(host, ctx) {
  const { client, feedback } = ctx;
  const filters = { q: "", type: "", includeArchived: false, sort: "priority" };
  let meta = { sprints: [], epics: [], users: [], labels: [] };
  let items = [];
  let disposed = false;

  const toolbar = h("div", { class: "wq-toolbar" });
  const panel = h("div", { class: "wq-panel wq-scroll" });

  const dialogs = createCardDialogs({
    client, feedback, meta: () => meta,
    onChanged: () => refresh(),
    onActiveTaskChange: (w) => ctx.onActiveTaskChange?.(w),
    onTimerChange: () => ctx.onTimerChange?.(),
  });

  // Criado UMA vez e reaproveitado: a barra é redesenhada a cada refresh, e o
  // que estava sendo digitado (e as pílulas escolhidas) não pode ir junto.
  const quickAdd = createQuickAdd({
    client, feedback, meta: () => meta, currentUserId: client.userId,
    onCreated: () => refresh(),
    openFull: (payload) => dialogs.openEditor(null, payload.status, payload),
  });

  host.replaceChildren(toolbar, quickAdd.el, panel);
  panel.replaceChildren(placeholder("Carregando…"));

  async function refresh() {
    if (disposed) return;
    const q = new URLSearchParams();
    if (filters.q.trim()) q.set("q", filters.q.trim());
    if (filters.type) q.set("type", filters.type);
    if (filters.includeArchived) q.set("includeArchived", "true");
    try {
      const data = await client.get(`/api/board?${q}`);
      items = [...(data.items ?? [])].sort(SORTS[filters.sort]);
      draw();
    } catch (error) {
      panel.replaceChildren(placeholder(error.message, "error"));
    }
  }

  function draw() {
    keepFocus(host, ".wq-search, .wq-quick-input", drawNow);
  }

  function drawNow() {
    toolbar.replaceChildren(
      h("div", { class: "wq-seg" },
        ["", ...TYPE_ORDER].map((t) => h("button", {
          class: filters.type === t ? "on" : "",
          onclick: () => { filters.type = t; refresh(); },
        }, t === "" ? "Tudo" : t === "Atendimento" ? "Atend." : `${t}s`))),
      h("select", {
        class: "wq-select",
        onchange: (e) => { filters.sort = e.target.value; refresh(); },
      },
        [["priority", "Por prioridade"], ["code", "Por código"], ["logged", "Por horas lançadas"], ["due", "Por prazo"]]
          .map(([v, label]) => h("option", { value: v, selected: filters.sort === v ? "" : null }, label))),
      h("label", { class: "wq-btn sm", style: { gap: "6px" } },
        h("input", {
          type: "checkbox", checked: filters.includeArchived ? "" : null,
          onchange: (e) => { filters.includeArchived = e.target.checked; refresh(); },
        }), "Mostrar arquivadas"),
      h("input", {
        class: "wq-input wq-search", type: "search", placeholder: "Buscar…", value: filters.q,
        dataset: { focusKey: "busca" },
        oninput: (e) => { filters.q = e.target.value; clearTimeout(draw.t); draw.t = setTimeout(refresh, 300); },
      }),
      h("div", { class: "wq-spacer" }),
      h("span", { class: "wq-faint" }, `${items.length} atividades`),
      h("button", { class: "wq-btn", onclick: () => dialogs.openEditor(null) }, "Formulário completo"));

    panel.replaceChildren(h("table", { class: "wq-table" },
      h("thead", {}, h("tr", {},
        ["Código", "Tipo", "Título", "Status", "Prioridade", "Épico", "Resp.", "Prazo"].map((t) => h("th", {}, t)),
        h("th", { class: "num" }, "Horas"))),
      h("tbody", {},
        items.map((w) => h("tr", {
          style: { cursor: "pointer", opacity: w.archivedUtc ? ".55" : "1" },
          onclick: () => dialogs.openDetail(w.id),
        },
          h("td", { class: "wq-card-code" }, w.code),
          h("td", {}, h("span", {
            class: "wq-chip", style: { background: `${TYPE_COLOR[w.type]}1f`, color: TYPE_COLOR[w.type] },
          }, w.type === "Atendimento" ? "ATEND" : w.type.toUpperCase())),
          h("td", { style: { fontWeight: "550" } },
            w.title, w.isBlocked && h("span", { style: { color: "var(--wq-red)" } }, " ⛔")),
          h("td", {}, h("span", {
            class: "wq-chip", style: { background: `${STATUS_COLOR[w.status]}22`, color: STATUS_COLOR[w.status] },
          }, STATUS_LABEL[w.status])),
          h("td", {}, h("span", {
            class: "wq-chip", style: { background: `${PRIORITY_COLOR[w.priority]}22`, color: PRIORITY_COLOR[w.priority] },
          }, PRIORITY_LABEL[w.priority])),
          h("td", { class: "wq-muted" }, w.epic?.name ?? "—"),
          h("td", {}, w.assignee ? avatar(w.assignee, "sm") : h("span", { class: "wq-faint" }, "—")),
          h("td", { class: "wq-muted" }, w.dueUtc ? relativeDay(w.dueUtc) : "—"),
          h("td", { class: "num wq-muted" }, w.loggedMinutes ? hm(w.loggedMinutes) : "—"))),
        items.length === 0 && h("tr", {}, h("td", { colspan: "9", class: "wq-faint" }, "Nenhuma atividade.")))));
  }

  loadBoardMeta(client).then((loaded) => { meta = loaded; return refresh(); });

  return { refresh, destroy() { disposed = true; host.replaceChildren(); } };
}
