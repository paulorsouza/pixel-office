import { API, h, esc, avatar, hm, modal, option, toast,
  STATUS, STATUS_ORDER, STATUS_COLOR } from "./api.js";
import { App } from "./main.js";
import { openTaskModal } from "./task-modal.js";

let filters = { sprintId: null, assigneeId: "", type: "" };
let sprints = [], epics = [], items = [];

export async function renderBoard(view, { actions }) {
  view.innerHTML = `<div class="loading">Carregando board…</div>`;
  [sprints, epics] = await Promise.all([API.get("/api/sprints"), API.get("/api/epics")]);
  if (filters.sprintId == null) filters.sprintId = String(sprints.find((s) => s.isActive)?.id ?? "");

  actions.replaceChildren(
    h("button", { class: "btn primary", onclick: () => openTaskModal(null, { sprints, epics, users: App.users, onSaved: () => load(view) }) },
      "＋ Nova atividade"));

  view.innerHTML = "";
  view.append(buildToolbar(view), h("div", { class: "board", id: "board" }));
  await load(view);
}

function buildToolbar(view) {
  return h("div", { class: "toolbar" },
    h("select", { class: "select", onchange: (e) => { filters.sprintId = e.target.value; load(view); } },
      option("", "Todos os sprints", filters.sprintId === ""),
      ...sprints.map((s) => option(String(s.id), s.name + (s.isActive ? " · ativo" : ""), String(s.sprintId) === String(s.id) || String(filters.sprintId) === String(s.id)))),
    h("select", { class: "select", onchange: (e) => { filters.assigneeId = e.target.value; load(view); } },
      option("", "Todos os responsáveis", !filters.assigneeId),
      ...App.users.map((u) => option(String(u.id), u.name, String(filters.assigneeId) === String(u.id)))),
    h("div", { class: "seg" },
      ...["", "Task", "Bug", "Atendimento"].map((t) =>
        h("button", { class: filters.type === t ? "on" : "", onclick: () => { filters.type = t; load(view); } },
          t === "" ? "Tudo" : t + "s"))),
    h("div", { class: "spacer" }),
    h("span", { class: "faint", id: "board-count" }));
}

async function load(view) {
  let url = "/api/workitems";
  const q = [];
  if (filters.sprintId !== "") q.push(`sprintId=${filters.sprintId}`);
  if (filters.type) q.push(`type=${filters.type}`);
  if (q.length) url += "?" + q.join("&");
  items = await API.get(url);
  if (filters.assigneeId) items = items.filter((w) => String(w.assigneeId) === String(filters.assigneeId));
  draw(view);
}

function draw(view) {
  const board = view.querySelector("#board");
  board.innerHTML = "";
  const cnt = view.querySelector("#board-count");
  if (cnt) cnt.textContent = `${items.length} atividades`;

  for (const status of STATUS_ORDER) {
    const colItems = items.filter((w) => w.status === status);
    const body = h("div", { class: "kcol-body" }, colItems.map(card));
    const col = h("div", { class: "kcol", dataset: { status } },
      h("div", { class: "kcol-head" },
        h("span", { class: "status-dot", style: { background: STATUS_COLOR[status] } }),
        STATUS[status], h("span", { class: "count" }, colItems.length)),
      body,
      h("button", { class: "kcol-add", onclick: () => openTaskModal(null, { sprints, epics, users: App.users, status, sprintId: filters.sprintId, onSaved: () => load(view) }) },
        "＋ adicionar"));

    // drag & drop
    col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("drop-target"); });
    col.addEventListener("dragleave", (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove("drop-target"); });
    col.addEventListener("drop", async (e) => {
      e.preventDefault();
      col.classList.remove("drop-target");
      const id = Number(e.dataTransfer.getData("id"));
      const w = items.find((x) => x.id === id);
      if (!w || w.status === status) return;
      w.status = status; // otimista
      draw(view);
      try {
        const r = await API.patch(`/api/workitems/${id}`, { status });
        if (r?.xpInfo) toast(`${w.code} concluída · +${r.xpInfo.bonus} XP 🎉`, "#16a34a");
        await App.refreshMe();
      } catch (err) { toast("Falha ao mover: " + err.message); load(view); }
    });
    board.append(col);
  }
}

function card(w) {
  const epic = w.epic;
  const assignee = w.assignee;
  const active = App.me?.activeTask?.id === w.id;
  const el = h("div", { class: "kcard", draggable: "true",
    onclick: () => openTaskModal(w, { sprints, epics, users: App.users, onSaved: (v) => renderBoard(v || document.getElementById("view"), { actions: document.getElementById("topbar-actions") }) }) },
    epic && h("div", { class: "epic-bar", style: { background: epic.color } }),
    h("div", { class: "row1" },
      h("span", { class: `badge ${w.type}` }, w.type),
      active && h("span", { class: "active-star", title: "sua task ativa" }, "★"),
      h("span", { class: "spacer" }),
      h("span", { class: "code" }, w.code)),
    h("div", { class: "title" }, w.title),
    h("div", { class: "row2" },
      assignee ? avatar(assignee, "sm") : h("span", { class: "faint", style: { fontSize: "11.5px" } }, "sem resp."),
      epic && h("span", { class: "faint", style: { fontSize: "11.5px" } }, epic.name),
      h("span", { class: "est" },
        w.loggedMinutes ? `⏱ ${hm(w.loggedMinutes)}` : "",
        w.estimateHours ? ` / ${w.estimateHours}h` : "")));
  el.addEventListener("dragstart", (e) => { e.dataTransfer.setData("id", w.id); el.classList.add("dragging"); });
  el.addEventListener("dragend", () => el.classList.remove("dragging"));
  return el;
}
