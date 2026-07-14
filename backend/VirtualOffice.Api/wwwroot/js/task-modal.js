import { API, h, avatar, hm, modal, option, toast, STATUS, STATUS_ORDER } from "./api.js";
import { App } from "./main.js";

// item = null → criar; item = obj → editar
export function openTaskModal(item, { sprints, epics, users, status, sprintId, onSaved }) {
  const isNew = !item;
  const w = item ?? { type: "Task", status: status ?? "Backlog", epicId: 0, sprintId: Number(sprintId) || 0, assigneeId: App.me.user.id, title: "", description: "", estimateHours: null };
  const active = App.me?.activeTask?.id === w.id;

  const f = {};
  const body = h("div", {},
    field("Título", f.title = h("input", { class: "input", value: w.title ?? "", placeholder: "O que precisa ser feito?" })),
    field("Descrição", f.desc = h("textarea", { class: "input", rows: 3 }, w.description ?? "")),
    h("div", { class: "field-row" },
      field("Tipo", f.type = sel(["Task", "Bug", "Atendimento"].map((t) => option(t, t, w.type === t)))),
      field("Status", f.status = sel(STATUS_ORDER.map((s) => option(s, STATUS[s], w.status === s))))),
    h("div", { class: "field-row" },
      field("Épico", f.epic = sel([option("0", "—", !w.epicId), ...epics.map((e) => option(String(e.id), e.name, w.epicId === e.id))])),
      field("Sprint", f.sprint = sel([option("0", "— backlog —", !w.sprintId), ...sprints.map((s) => option(String(s.id), s.name, w.sprintId === s.id))]))),
    h("div", { class: "field-row" },
      field("Responsável", f.assignee = sel([option("0", "—", !w.assigneeId), ...users.map((u) => option(String(u.id), u.name, w.assigneeId === u.id))])),
      field("Estimativa (h)", f.est = h("input", { class: "input", type: "number", min: "0", step: "0.5", value: w.estimateHours ?? "" }))),
    !isNew && w.loggedMinutes > 0 && h("div", { class: "field" }, h("label", {}, "Horas lançadas"), h("div", { class: "muted" }, hm(w.loggedMinutes))));

  const foot = h("div", {},
    !isNew && h("button", { class: active ? "btn" : "btn", onclick: () => setActive(w.id) },
      active ? "★ Task ativa" : "★ Definir ativa"),
    h("div", { class: "spacer", style: { flex: "1" } }),
    h("button", { class: "btn ghost", onclick: () => m.close() }, "Cancelar"),
    h("button", { class: "btn primary", onclick: save }, isNew ? "Criar" : "Salvar"));
  foot.style.display = "flex"; foot.style.width = "100%"; foot.style.gap = "8px";

  const m = modal({
    title: isNew ? "Nova atividade" : `${w.code} · ${w.type}`,
    body, foot,
  });
  setTimeout(() => f.title.focus(), 30);

  async function save() {
    const payload = {
      title: f.title.value.trim(), description: f.desc.value,
      type: f.type.value, status: f.status.value,
      epicId: Number(f.epic.value), sprintId: Number(f.sprint.value),
      assigneeId: Number(f.assignee.value), estimateHours: Number(f.est.value) || 0,
    };
    if (!payload.title) { f.title.focus(); return; }
    try {
      if (isNew) await API.post("/api/workitems", payload);
      else await API.patch(`/api/workitems/${w.id}`, payload);
      m.close();
      toast(isNew ? "Atividade criada" : "Atividade salva", "#16a34a");
      await App.refreshMe();
      onSaved?.(document.getElementById("view"));
    } catch (e) { toast(e.message); }
  }

  async function setActive(id) {
    try {
      await API.post("/api/me/active-task", { workItemId: id });
      await App.refreshMe();
      toast("Task ativa definida", "#7c5cff");
      m.close();
      onSaved?.(document.getElementById("view"));
    } catch (e) { toast(e.message); }
  }
}

function field(label, control) {
  return h("div", { class: "field" }, h("label", {}, label), control);
}
function sel(opts) { return h("select", { class: "select" }, ...opts); }
