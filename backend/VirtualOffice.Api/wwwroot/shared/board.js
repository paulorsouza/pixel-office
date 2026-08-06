// Quadro kanban compartilhado (app web + painel do jogo).
// Formulário e detalhe do card vivem em `card-dialogs.js` — aqui é só o quadro.
import {
  h, hm, avatar, keepFocus, placeholder, relativeDay,
  STATUS_LABEL, STATUS_ORDER, STATUS_COLOR,
  PRIORITY_ORDER, PRIORITY_LABEL, PRIORITY_COLOR, TYPE_ORDER,
} from "./work-core.js";
import { createCardDialogs, TYPE_COLOR } from "./card-dialogs.js";
import { createQuickAdd } from "./quick-add.js";

const debounce = (fn, ms) => {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
};

/** Carrega sprints/épicos/usuários/etiquetas uma vez e devolve um acessor síncrono. */
export async function loadBoardMeta(client) {
  const [sprints, epics, users, labels] = await Promise.all([
    client.get("/api/sprints").catch(() => []),
    client.get("/api/epics").catch(() => []),
    client.get("/api/users").catch(() => []),
    client.get("/api/labels").catch(() => []),
  ]);
  return { sprints, epics, users, labels };
}

export function mountBoard(host, ctx) {
  const { client, feedback, currentUserId = client.userId } = ctx;
  const filters = { sprintId: null, assigneeId: "", type: "", priority: "", labelId: "", q: "", mine: false };
  let meta = { sprints: [], epics: [], users: [], labels: [] };
  let items = [];
  let activeTaskId = ctx.activeTaskId ?? null;
  let dragging = null;
  let disposed = false;

  const toolbar = h("div", { class: "wq-toolbar" });
  const board = h("div", { class: "wq-board" });
  host.replaceChildren(toolbar, board);
  board.replaceChildren(placeholder("Carregando quadro…"));

  const dialogs = createCardDialogs({
    client,
    feedback,
    meta: () => meta,
    onChanged: () => refresh(),
    onActiveTaskChange: (w) => { activeTaskId = w.id; ctx.onActiveTaskChange?.(w); },
    onTimerChange: () => ctx.onTimerChange?.(),
  });

  // ------------------------------------------------------------- dados

  function query() {
    const q = new URLSearchParams();
    if (filters.sprintId !== "") q.set("sprintId", filters.sprintId);
    if (filters.type) q.set("type", filters.type);
    if (filters.priority) q.set("priority", filters.priority);
    if (filters.labelId) q.set("labelId", filters.labelId);
    if (filters.q.trim()) q.set("q", filters.q.trim());
    const assignee = filters.mine ? String(currentUserId) : filters.assigneeId;
    if (assignee !== "") q.set("assigneeId", assignee);
    const search = q.toString();
    return search ? `/api/board?${search}` : "/api/board";
  }

  async function refresh() {
    if (disposed) return;
    try {
      const data = await client.get(query());
      items = data.items ?? [];
      draw();
    } catch (error) {
      board.replaceChildren(placeholder(error.message, "error"));
    }
  }

  // --------------------------------------------------------- toolbar

  function drawToolbar() {
    const select = (value, onchange, options) =>
      h("select", { class: "wq-select", onchange: (e) => { onchange(e.target.value); refresh(); } },
        options.map(([v, label]) =>
          h("option", { value: v, selected: String(value) === String(v) ? "" : null }, label)));

    toolbar.replaceChildren(
      select(filters.sprintId, (v) => (filters.sprintId = v),
        [["", "Todos os sprints"], ["0", "Sem sprint"],
          ...meta.sprints.map((s) => [String(s.id), s.name + (s.isActive ? " · ativo" : "")])]),
      select(filters.assigneeId, (v) => { filters.assigneeId = v; filters.mine = false; },
        [["", "Todos"], ["0", "Sem responsável"], ...meta.users.map((u) => [String(u.id), u.name])]),
      select(filters.priority, (v) => (filters.priority = v),
        [["", "Toda prioridade"], ...PRIORITY_ORDER.map((p) => [p, PRIORITY_LABEL[p]])]),
      meta.labels.length > 0 && select(filters.labelId, (v) => (filters.labelId = v),
        [["", "Toda etiqueta"], ...meta.labels.map((l) => [String(l.id), l.name])]),
      h("div", { class: "wq-seg" },
        ["", ...TYPE_ORDER].map((t) =>
          h("button", {
            class: filters.type === t ? "on" : "",
            onclick: () => { filters.type = t; drawToolbar(); refresh(); },
          }, t === "" ? "Tudo" : t === "Atendimento" ? "Atend." : `${t}s`))),
      h("button", {
        class: `wq-btn sm${filters.mine ? " primary" : ""}`,
        onclick: () => { filters.mine = !filters.mine; filters.assigneeId = ""; drawToolbar(); refresh(); },
      }, "★ Só meus"),
      h("input", {
        class: "wq-input wq-search", type: "search", placeholder: "Buscar título ou código…",
        value: filters.q, dataset: { focusKey: "busca" },
        oninput: debounce((e) => { filters.q = e.target.value; refresh(); }, 300),
      }),
      h("div", { class: "wq-spacer" }),
      h("span", { class: "wq-faint" }, `${items.length} atividades`),
      h("button", { class: "wq-btn", onclick: () => newCard() }, "Formulário completo"));
  }

  const cardDefaults = () => ({
    sprintId: filters.sprintId,
    assigneeId: filters.mine ? currentUserId : filters.assigneeId,
  });
  const newCard = (status) => dialogs.openEditor(null, status, cardDefaults());

  // Uma captura rápida por coluna, criada uma vez só. As colunas são refeitas a
  // cada refresh (inclusive os que vêm do SignalR): recriar o campo junto
  // apagaria o que a pessoa está digitando bem no meio da frase.
  const adders = new Map();
  function adderFor(status) {
    if (!adders.has(status)) {
      adders.set(status, createQuickAdd({
        client, feedback, meta: () => meta, currentUserId, status, compact: true,
        defaults: cardDefaults,
        placeholder: `＋ em ${STATUS_LABEL[status]}`,
        onCreated: () => refresh(),
        openFull: (payload) => dialogs.openEditor(null, status, payload),
      }));
    }
    return adders.get(status).el;
  }

  // ----------------------------------------------------------- quadro

  function draw() {
    keepFocus(host, ".wq-search, .wq-quick-input", () => {
      drawToolbar();
      board.replaceChildren(...STATUS_ORDER.map(column));
    });
    // O campo é o mesmo nó de antes, mas acabou de ser reinserido: quem sabe se
    // ele está aberto ou fechado é ele, depois que o foco assentar.
    for (const adder of adders.values()) adder.sync();
  }

  function column(status) {
    const columnItems = items.filter((w) => w.status === status);
    const body = h("div", { class: "wq-col-body" },
      columnItems.length ? columnItems.map(card) : h("div", { class: "wq-placeholder" }, "vazio"));
    const col = h("div", { class: "wq-col", dataset: { status } },
      h("div", { class: "wq-col-head" },
        h("span", { class: "wq-dot", style: { background: STATUS_COLOR[status] } }),
        STATUS_LABEL[status],
        h("span", { class: "count" }, String(columnItems.length))),
      body,
      adderFor(status));

    let line = null;
    const clearLine = () => { line?.remove(); line = null; };

    col.addEventListener("dragover", (event) => {
      if (!dragging) return;
      event.preventDefault();
      col.classList.add("drop");
      const cards = [...body.querySelectorAll(".wq-card")].filter((el) => el !== dragging.el);
      const index = cards.findIndex((el) => {
        const rect = el.getBoundingClientRect();
        return event.clientY < rect.top + rect.height / 2;
      });
      line ??= h("div", { class: "wq-drop-line" });
      if (index === -1) body.append(line);
      else cards[index].before(line);
      dragging.target = { status, index: index === -1 ? cards.length : index };
    });
    col.addEventListener("dragleave", (event) => {
      if (col.contains(event.relatedTarget)) return;
      col.classList.remove("drop");
      clearLine();
    });
    col.addEventListener("drop", async (event) => {
      event.preventDefault();
      col.classList.remove("drop");
      clearLine();
      const move = dragging?.target;
      const item = dragging?.item;
      if (!move || !item) return;
      try {
        const result = await client.post(`/api/workitems/${item.id}/move`, {
          status: move.status, position: move.index,
        });
        if (result?.reward) rewardToast(result.reward, item.code);
        await refresh();
      } catch (error) {
        feedback.toast(`Não deu para mover: ${error.message}`, "error");
        refresh();
      }
    });
    return col;
  }

  function card(w) {
    const checklist = w.checklist ?? { total: 0, done: 0 };
    const isActive = activeTaskId === w.id;
    const el = h("div", {
      class: `wq-card${w.isBlocked ? " blocked" : ""}`,
      draggable: "true",
      style: { "--wq-card-accent": w.epic?.color || TYPE_COLOR[w.type] || "transparent" },
      onclick: (event) => { if (!event.target.closest("button")) dialogs.openDetail(w.id); },
    },
      h("div", { class: "wq-card-top" },
        h("span", {
          class: "wq-chip",
          style: { background: `${TYPE_COLOR[w.type]}1f`, color: TYPE_COLOR[w.type] },
        }, w.type === "Atendimento" ? "ATEND" : w.type.toUpperCase()),
        w.priority !== "Medium" && h("span", {
          class: "wq-chip",
          style: { background: `${PRIORITY_COLOR[w.priority]}1f`, color: PRIORITY_COLOR[w.priority] },
          title: `Prioridade ${PRIORITY_LABEL[w.priority]}`,
        }, PRIORITY_LABEL[w.priority]),
        isActive && h("span", { class: "wq-star", title: "sua atividade ativa" }, "★"),
        h("span", { class: "wq-spacer" }),
        h("span", { class: "wq-card-code" }, w.code)),
      h("div", { class: "wq-card-title" }, w.title),
      w.isBlocked && h("div", { class: "wq-card-meta", style: { color: "var(--wq-red)" } },
        `⛔ ${w.blockedReason || "bloqueado"}`),
      w.labels?.length > 0 && h("div", { class: "wq-card-labels" },
        w.labels.map((l) => h("span", {
          class: "wq-chip", style: { background: `${l.color}22`, color: l.color },
        }, l.name))),
      h("div", { class: "wq-card-meta" },
        w.assignee ? avatar(w.assignee, "sm") : h("span", { class: "wq-faint" }, "sem resp."),
        checklist.total > 0 && h("span", { title: "checklist" }, `☑ ${checklist.done}/${checklist.total}`),
        w.commentCount > 0 && h("span", { title: "comentários" }, `💬 ${w.commentCount}`),
        w.dueUtc && h("span", { class: `wq-due ${dueTone(w.dueUtc, w.status)}`, title: "prazo" },
          `📅 ${relativeDay(w.dueUtc)}`),
        h("span", { class: "grow" }),
        (w.loggedMinutes > 0 || w.estimateHours) && h("span", { title: "lançado / estimado" },
          `⏱ ${hm(w.loggedMinutes)}${w.estimateHours ? ` / ${w.estimateHours}h` : ""}`),
        h("span", { class: "wq-card-actions" },
          h("button", {
            class: "wq-icon-btn",
            title: isActive ? "já é a atividade ativa" : "definir como atividade ativa",
            onclick: () => dialogs.setActive(w),
          }, isActive ? "★" : "☆"),
          h("button", {
            class: "wq-icon-btn", title: "iniciar contador nesta atividade",
            onclick: () => dialogs.startTimer(w),
          }, "▶"))));

    el.addEventListener("dragstart", () => {
      dragging = { el, item: w, target: null };
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      dragging = null;
      board.querySelectorAll(".wq-drop-line").forEach((n) => n.remove());
      board.querySelectorAll(".wq-col.drop").forEach((n) => n.classList.remove("drop"));
    });
    return el;
  }

  const dueTone = (due, status) => {
    if (status === "Done") return "";
    const days = Math.round((new Date(due) - new Date()) / 864e5);
    return days < 0 ? "late" : days <= 2 ? "soon" : "";
  };

  function rewardToast(reward, code) {
    const parts = [`${code} concluída!`];
    if (reward.gold) parts.push(`+${reward.gold} 🪙`);
    feedback.toast(parts.join(" · ") + (reward.leveledUp ? ` · nível ${reward.level}! 🎉` : ""), "ok");
    ctx.onReward?.(reward);
  }

  loadBoardMeta(client).then((loaded) => {
    meta = loaded;
    if (filters.sprintId == null) filters.sprintId = String(loaded.sprints.find((s) => s.isActive)?.id ?? "");
    return refresh();
  });

  return {
    refresh,
    setActiveTask(id) { activeTaskId = id; if (items.length) draw(); },
    destroy() { disposed = true; host.replaceChildren(); },
  };
}
