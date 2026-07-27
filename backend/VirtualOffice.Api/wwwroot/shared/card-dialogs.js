// Criação, edição e detalhe de um card. Fica separado do quadro porque o backlog
// (lista) e o kanban (colunas) precisam exatamente do mesmo formulário — manter
// duas versões foi o que fez os dois divergirem antes.
import {
  h, hm, avatar, placeholder, relativeDay,
  STATUS_LABEL, STATUS_ORDER, STATUS_COLOR,
  PRIORITY_ORDER, PRIORITY_LABEL, PRIORITY_COLOR, TYPE_ORDER,
} from "./work-core.js";

export const TYPE_COLOR = { Task: "#2f6bff", Bug: "#e5484d", Atendimento: "#0d9488" };

/**
 * @param ctx.meta  função que devolve { sprints, epics, users, labels }
 * @param ctx.onChanged  chamado depois de qualquer escrita bem-sucedida
 */
export function createCardDialogs(ctx) {
  const { client, feedback, meta, onChanged } = ctx;

  const field = (label, control) => h("label", { class: "wq-field" }, h("label", {}, label), control);
  const pick = (options, value) => h("select", { class: "wq-select" },
    options.map(([v, label]) => h("option", { value: v, selected: String(value) === String(v) ? "" : null }, label)));
  const chipStyle = (l, on) => ({
    background: on ? l.color : "transparent",
    color: on ? "#fff" : l.color,
    border: `1px solid ${l.color}`,
    height: "22px",
    cursor: "pointer",
  });

  async function setActive(w) {
    try {
      await client.post("/api/me/active-task", { workItemId: w.id });
      ctx.onActiveTaskChange?.(w);
      feedback.toast(`${w.code} agora é a sua atividade ativa`, "ok");
      onChanged?.();
    } catch (error) {
      feedback.toast(error.message, "error");
    }
  }

  async function startTimer(w) {
    try {
      await client.post("/api/timer/start", { workItemId: w.id, category: "task" });
      ctx.onActiveTaskChange?.(w);
      ctx.onTimerChange?.();
      feedback.toast(`Contador rodando em ${w.code}`, "ok");
      onChanged?.();
    } catch (error) {
      feedback.toast(error.message, "error");
    }
  }

  // -------------------------------------------------- criar / editar

  function openEditor(existing, status, defaults = {}) {
    const { sprints, epics, users, labels } = meta();
    const f = {};
    const selected = new Set((existing?.labels ?? []).map((l) => l.id));

    const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
      field("Título", f.title = h("input", { class: "wq-input", value: existing?.title ?? "", placeholder: "O que precisa ser feito?" })),
      field("Descrição", f.desc = h("textarea", { class: "wq-input", placeholder: "Contexto, critérios de aceite…" }, existing?.description ?? "")),
      h("div", { class: "wq-field-row" },
        field("Tipo", f.type = pick(TYPE_ORDER.map((t) => [t, t]), existing?.type ?? "Task")),
        field("Prioridade", f.priority = pick(PRIORITY_ORDER.map((p) => [p, PRIORITY_LABEL[p]]), existing?.priority ?? "Medium")),
        field("Status", f.status = pick(STATUS_ORDER.map((s) => [s, STATUS_LABEL[s]]), existing?.status ?? status ?? "Backlog"))),
      h("div", { class: "wq-field-row" },
        field("Responsável", f.assignee = pick(
          [["0", "— ninguém —"], ...users.map((u) => [String(u.id), u.name])],
          String(existing?.assigneeId ?? defaults.assigneeId ?? "0"))),
        field("Épico", f.epic = pick([["0", "— nenhum —"], ...epics.map((e) => [String(e.id), e.name])], String(existing?.epicId ?? "0"))),
        field("Sprint", f.sprint = pick(
          [["0", "— backlog —"], ...sprints.map((s) => [String(s.id), s.name])],
          String(existing?.sprintId ?? defaults.sprintId ?? "0")))),
      h("div", { class: "wq-field-row" },
        field("Estimativa (h)", f.estimate = h("input", { class: "wq-input", type: "number", min: "0", step: "0.5", value: existing?.estimateHours ?? "" })),
        field("Prazo", f.due = h("input", { class: "wq-input", type: "date", value: existing?.dueUtc ? String(existing.dueUtc).slice(0, 10) : "" }))),
      field("Etiquetas", h("div", { class: "wq-card-labels" },
        labels.map((l) => {
          const chip = h("button", {
            class: "wq-chip",
            style: chipStyle(l, selected.has(l.id)),
            onclick: () => {
              selected.has(l.id) ? selected.delete(l.id) : selected.add(l.id);
              Object.assign(chip.style, chipStyle(l, selected.has(l.id)));
            },
          }, l.name);
          return chip;
        }))));

    const save = h("button", { class: "wq-btn primary" }, existing ? "Salvar" : "Criar atividade");
    const dialog = feedback.modal({
      title: existing ? `Editar ${existing.code}` : "Nova atividade",
      body,
      foot: h("div", { style: { display: "flex", gap: "8px" } },
        h("button", { class: "wq-btn ghost", onclick: () => dialog.close() }, "Cancelar"), save),
    });
    setTimeout(() => f.title.focus(), 40);

    save.onclick = async () => {
      if (!f.title.value.trim()) { f.title.focus(); return; }
      save.disabled = true;
      const payload = {
        title: f.title.value,
        description: f.desc.value,
        type: f.type.value,
        priority: f.priority.value,
        status: f.status.value,
        assigneeId: Number(f.assignee.value),
        epicId: Number(f.epic.value),
        sprintId: Number(f.sprint.value),
        estimateHours: f.estimate.value ? Number(f.estimate.value) : 0,
        dueUtc: f.due.value ? new Date(`${f.due.value}T12:00:00Z`).toISOString() : null,
        labelIds: [...selected],
      };
      try {
        if (existing) await client.patch(`/api/workitems/${existing.id}`, payload);
        else await client.post("/api/workitems", payload);
        dialog.close();
        feedback.toast(existing ? "Atividade atualizada" : "Atividade criada", "ok");
        onChanged?.();
      } catch (error) {
        feedback.toast(error.message, "error");
        save.disabled = false;
      }
    };
  }

  // ------------------------------------------------------- detalhe

  async function openDetail(id) {
    const content = h("div", {}, placeholder("Carregando…"));
    const dialog = feedback.modal({ title: "Atividade", body: content, wide: true });
    try {
      renderDetail(dialog, content, await client.get(`/api/workitems/${id}`));
    } catch (error) {
      content.replaceChildren(placeholder(error.message, "error"));
    }
  }

  function renderDetail(dialog, content, data) {
    const w = data.card;
    const reload = async () => {
      renderDetail(dialog, content, await client.get(`/api/workitems/${w.id}`));
      onChanged?.();
    };

    const { done, total } = w.checklist;
    const newCheck = h("input", { class: "wq-input", placeholder: "Adicionar item ao checklist…" });
    const newComment = h("textarea", { class: "wq-input", placeholder: "Escreva um comentário…" });

    content.replaceChildren(h("div", { class: "wq-detail" },
      h("div", { style: { display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 } },
        h("div", {},
          h("div", { class: "wq-card-meta", style: { marginBottom: "4px" } },
            h("b", { class: "wq-card-code" }, w.code),
            w.epic && h("span", { class: "wq-chip", style: { background: `${w.epic.color}22`, color: w.epic.color } }, w.epic.name),
            w.labels.map((l) => h("span", { class: "wq-chip", style: { background: `${l.color}22`, color: l.color } }, l.name))),
          h("h2", { style: { fontSize: "17px", fontWeight: "650", lineHeight: "1.3" } }, w.title)),
        w.description && h("section", {}, h("h3", {}, "Descrição"),
          h("p", { style: { whiteSpace: "pre-wrap", fontSize: "13.5px" } }, w.description)),

        h("section", {},
          h("h3", {}, `Checklist${total ? ` · ${done}/${total}` : ""}`),
          total > 0 && h("div", { class: "wq-progress" },
            h("i", { style: { width: `${Math.round((done / total) * 100)}%` } })),
          h("ul", { class: "wq-checklist" },
            data.checklist.map((c) => h("li", { class: c.done ? "done" : "" },
              h("input", {
                type: "checkbox", checked: c.done ? "" : null,
                onchange: async (e) => {
                  await client.patch(`/api/checklist/${c.id}`, { done: e.target.checked });
                  reload();
                },
              }),
              h("span", {}, c.text),
              h("button", {
                class: "wq-icon-btn",
                onclick: async () => { await client.del(`/api/checklist/${c.id}`); reload(); },
              }, "✕"))),
            data.checklist.length === 0 && h("li", { class: "wq-faint" }, "Nada aqui ainda.")),
          h("form", {
            style: { display: "flex", gap: "6px" },
            onsubmit: async (event) => {
              event.preventDefault();
              if (!newCheck.value.trim()) return;
              await client.post(`/api/workitems/${w.id}/checklist`, { text: newCheck.value });
              newCheck.value = "";
              reload();
            },
          }, newCheck, h("button", { class: "wq-btn", type: "submit" }, "＋"))),

        h("section", {},
          h("h3", {}, `Comentários · ${data.comments.length}`),
          data.comments.map((c) => h("div", { class: "wq-comment" },
            avatar(c.author),
            h("div", { class: "body" },
              h("div", { class: "who" },
                h("b", {}, c.author?.name ?? "?"),
                h("time", {}, new Date(c.createdUtc).toLocaleString("pt-BR",
                  { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }))),
              h("p", {}, c.body)))),
          h("form", {
            style: { display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" },
            onsubmit: async (event) => {
              event.preventDefault();
              if (!newComment.value.trim()) return;
              await client.post(`/api/workitems/${w.id}/comments`, { body: newComment.value });
              newComment.value = "";
              reload();
            },
          }, newComment, h("button", { class: "wq-btn primary", type: "submit" }, "Comentar")))),

      h("div", { class: "wq-detail-side" },
        sideRow("Status", h("span", {
          class: "wq-chip", style: { background: `${STATUS_COLOR[w.status]}22`, color: STATUS_COLOR[w.status] },
        }, STATUS_LABEL[w.status])),
        sideRow("Prioridade", h("span", {
          class: "wq-chip", style: { background: `${PRIORITY_COLOR[w.priority]}22`, color: PRIORITY_COLOR[w.priority] },
        }, PRIORITY_LABEL[w.priority])),
        sideRow("Responsável", w.assignee
          ? h("span", { style: { display: "flex", gap: "6px", alignItems: "center" } }, avatar(w.assignee, "sm"), w.assignee.name)
          : h("span", { class: "wq-faint" }, "ninguém")),
        sideRow("Sprint", w.sprint?.name ?? "—"),
        sideRow("Lançado", `${hm(w.loggedMinutes)}${w.estimateHours ? ` de ${w.estimateHours}h` : ""}`),
        w.dueUtc && sideRow("Prazo", relativeDay(w.dueUtc)),
        w.isBlocked && sideRow("Impedimento", h("span", { style: { color: "var(--wq-red)" } }, w.blockedReason || "bloqueado")),

        h("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
          h("button", { class: "wq-btn sm", onclick: () => { dialog.close(); openEditor(w); } }, "✎ Editar"),
          h("button", { class: "wq-btn sm", onclick: () => setActive(w) }, "★ Ativa"),
          h("button", { class: "wq-btn sm", onclick: () => startTimer(w) }, "▶ Contar"),
          h("button", {
            class: `wq-btn sm${w.isBlocked ? " danger" : ""}`,
            onclick: async () => {
              const reason = w.isBlocked ? "" : (prompt("Qual o impedimento?") ?? "");
              if (!w.isBlocked && !reason.trim()) return;
              await client.patch(`/api/workitems/${w.id}`, { isBlocked: !w.isBlocked, blockedReason: reason });
              reload();
            },
          }, w.isBlocked ? "⛔ Desbloquear" : "⛔ Bloquear"),
          h("button", {
            class: "wq-btn sm danger",
            onclick: async () => {
              await client.patch(`/api/workitems/${w.id}`, { archived: true });
              dialog.close();
              feedback.toast(`${w.code} arquivada`, "ok");
              onChanged?.();
            },
          }, "🗄 Arquivar")),

        h("section", {},
          h("h3", {}, "Histórico"),
          h("ul", { class: "wq-timeline" },
            data.events.slice(0, 12).map((e) => h("li", {},
              h("time", {}, new Date(e.createdUtc).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })),
              h("span", {}, describeEvent(e)))),
            data.events.length === 0 && h("li", { class: "wq-faint" }, "sem histórico"))))));
  }

  const sideRow = (label, value) => h("div", {},
    h("h3", { style: { marginBottom: "3px" } }, label),
    typeof value === "string" ? h("div", { style: { fontSize: "13px" } }, value) : value);

  function describeEvent(e) {
    const who = e.actor?.name ?? "alguém";
    switch (e.kind) {
      case "created": return `${who} criou`;
      case "status": return `${who}: ${STATUS_LABEL[e.fromValue] ?? e.fromValue} → ${STATUS_LABEL[e.toValue] ?? e.toValue}`;
      case "assignee": return `${who} mudou o responsável`;
      case "priority": return `${who}: prioridade ${PRIORITY_LABEL[e.toValue] ?? e.toValue}`;
      case "blocked": return `${who} marcou bloqueio: ${e.toValue || "—"}`;
      case "sprint": return `${who} mudou o sprint`;
      case "comment": return `${who} comentou`;
      default: return `${who}: ${e.kind}`;
    }
  }

  return { openEditor, openDetail, setActive, startTimer };
}
