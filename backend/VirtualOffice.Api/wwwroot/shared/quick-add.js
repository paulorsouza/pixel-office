// Captura de atividade em UMA linha — o caminho padrão para criar card.
//
// O formulário completo (`card-dialogs.js`) continua existindo e é o mesmo de
// sempre; ele deixou de ser a porta de entrada. Aqui a pessoa digita o título,
// dá Enter, e o campo continua focado para a próxima — dá para despejar dez
// atividades seguidas sem tocar no mouse.
//
// Duas fontes decidem cada campo:
//   - TOKEN digitado (`/bug`, `!alta`, `@ana`…), que vale só para aquela linha;
//   - PÍLULA clicada, que é grudenta e sobrevive à criação — quem vai cadastrar
//     cinco bugs seguidos clica uma vez em BUG e esquece.
// Token novo tem a palavra final: se o texto muda o campo, a pílula cede.
import { h, PRIORITY_COLOR, PRIORITY_LABEL, TYPE_ORDER } from "./work-core.js";
import { TYPE_COLOR } from "./card-dialogs.js";
import { dueToIso, parseQuickTask, QUICK_HINT } from "./quick-parse.js";

const CHIP_TONE = { label: "#0d9488", epic: "#7c5cff", estimate: "#5b636e", due: "#d98a00" };
// Ordem de CLIQUE, não a de leitura: sai do padrão subindo, e a baixa fica por último.
const PRIORITY_CYCLE = ["Medium", "High", "Urgent", "Low"];
const typeLabel = (type) => (type === "Atendimento" ? "ATEND" : type.toUpperCase());

/**
 * @param ctx.meta      função que devolve { sprints, epics, users, labels }
 * @param ctx.status    coluna de destino (kanban); ausente = o backend decide
 * @param ctx.defaults  { sprintId, assigneeId } herdados dos filtros da tela —
 *                      pode ser função, porque o filtro muda e o campo não é
 *                      recriado a cada redesenho
 * @param ctx.openFull  recebe o payload já montado quando a pessoa pede o formulário
 * @returns { el, focus }  — o nó é REUSADO entre redesenhos, então o que estava
 *          digitado e as pílulas grudentas sobrevivem a um refresh do quadro.
 */
export function createQuickAdd(ctx) {
  const { client, feedback, meta, status = null, onCreated, openFull } = ctx;
  const compact = ctx.compact ?? false;
  const defaultsOf = () => (typeof ctx.defaults === "function" ? ctx.defaults() : ctx.defaults) ?? {};
  const overrides = {};
  let lastParsed = {};
  let busy = false;

  const input = h("input", {
    class: "wq-input wq-quick-input",
    type: "text",
    autocomplete: "off",
    enterkeyhint: "done",
    placeholder: ctx.placeholder ?? "Nova atividade… (Enter cria)",
    dataset: { focusKey: `quick:${status ?? "backlog"}` },
    oninput: () => sync(),
    onkeydown: (event) => {
      if (event.key === "Escape") { reset(); input.blur(); return; }
      if (event.key !== "Enter") return;
      // O Enter é tratado na mão, não pela submissão implícita do form: ela
      // depende do "botão padrão" e some junto com ele nos casos em que o botão
      // está escondido (a coluna fechada do kanban).
      event.preventDefault();
      // Ctrl/⌘+Enter leva o que já foi digitado para o formulário completo.
      submit({ full: event.ctrlKey || event.metaKey });
    },
  });

  const typePill = h("button", { type: "button", class: "wq-pill", onclick: () => cycle("type", TYPE_ORDER) });
  const priorityPill = h("button", {
    type: "button", class: "wq-pill", onclick: () => cycle("priority", PRIORITY_CYCLE),
  });
  const assigneePill = h("select", {
    class: "wq-pill-select", title: "responsável",
    onchange: (event) => { overrides.assigneeId = Number(event.target.value); sync(); },
  });
  const extras = h("span", { class: "wq-quick-extras" });
  const hint = h("small", { class: "wq-faint wq-quick-hint" }, QUICK_HINT);

  const chips = h("div", { class: "wq-quick-chips" },
    typePill, priorityPill, assigneePill, extras, h("span", { class: "wq-spacer" }), hint);

  const submitBtn = h("button", { class: "wq-btn primary wq-quick-go", type: "submit" }, compact ? "＋" : "Criar");

  const el = h("form", {
    class: `wq-quick-add${compact ? " compact" : ""}`,
    onsubmit: (event) => { event.preventDefault(); submit(); },
    onfocusin: () => syncOpen(),
    // O `focusout` chega ANTES de o foco pousar no próximo elemento; sem o
    // adiamento, clicar numa pílula fecharia a linha por um instante.
    onfocusout: () => setTimeout(syncOpen, 0),
  }, h("div", { class: "wq-quick-add-row" }, input, submitBtn), chips);

  /**
   * Aberto = tem foco dentro ou tem texto. Estado calculado, não acumulado: o
   * campo é reaproveitado entre desenhos do quadro, e cada `replaceChildren`
   * embaralha a ordem de blur/focus — quem depende dessa ordem erra.
   */
  function syncOpen() {
    el.classList.toggle("open", Boolean(input.value.trim()) || el.contains(document.activeElement));
  }

  // ------------------------------------------------------------- estado

  /** Junta o que foi digitado com as pílulas e devolve o card que será criado. */
  function effective() {
    const info = meta?.() ?? {};
    const parsed = parseQuickTask(input.value, {
      users: info.users ?? [],
      labels: info.labels ?? [],
      epics: info.epics ?? [],
      currentUserId: ctx.currentUserId ?? client.userId,
    });
    // A pílula vence o token porque quem clicou clicou DEPOIS; quando o texto
    // muda o campo, `sync` apaga a pílula e o token volta a mandar.
    return {
      parsed,
      type: overrides.type ?? parsed.type ?? "Task",
      priority: overrides.priority ?? parsed.priority ?? "Medium",
      assigneeId: overrides.assigneeId ?? parsed.assigneeId ?? (Number(defaultsOf().assigneeId) || 0),
    };
  }

  function cycle(field, order) {
    const current = effective()[field];
    overrides[field] = order[(order.indexOf(current) + 1) % order.length];
    // `sync` só derruba a pílula quando o texto MUDA o campo; como aqui o texto
    // não mudou, a escolha do clique sobrevive às próximas teclas.
    sync();
  }

  function reset() {
    input.value = "";
    delete overrides.type;
    delete overrides.priority;
    delete overrides.assigneeId;
    sync();
  }

  function sync() {
    const state = effective();
    // Token novo derruba a pílula: só quando o VALOR lido do texto muda, senão
    // um clique na pílula seria desfeito na tecla seguinte.
    for (const field of ["type", "priority", "assigneeId"]) {
      const found = state.parsed[field];
      if (found !== lastParsed[field] && found != null) delete overrides[field];
      lastParsed[field] = found;
    }
    const now = effective();

    typePill.textContent = typeLabel(now.type);
    Object.assign(typePill.style, pillStyle(TYPE_COLOR[now.type]));
    priorityPill.textContent = PRIORITY_LABEL[now.priority];
    Object.assign(priorityPill.style, pillStyle(PRIORITY_COLOR[now.priority]));
    syncAssignee(now.assigneeId);

    extras.replaceChildren(...now.parsed.chips
      .filter((chip) => chip.field !== "type" && chip.field !== "priority" && chip.field !== "assignee")
      .map((chip) => h("span", { class: "wq-pill read", style: pillStyle(CHIP_TONE[chip.field] ?? "#5b636e") },
        chip.label)));
    hint.hidden = Boolean(input.value.trim());
    submitBtn.disabled = busy;
    syncOpen();
  }

  function syncAssignee(selectedId) {
    const users = meta?.().users ?? [];
    if (assigneePill.dataset.users !== String(users.length)) {
      assigneePill.dataset.users = String(users.length);
      assigneePill.replaceChildren(
        h("option", { value: "0" }, "sem resp."),
        ...users.map((u) => h("option", { value: String(u.id) }, u.name)));
    }
    assigneePill.value = String(selectedId || 0);
  }

  const pillStyle = (color) => ({ background: `${color}1f`, color, borderColor: `${color}55` });

  // ------------------------------------------------------------- criação

  async function submit({ full = false } = {}) {
    const state = effective();
    const title = state.parsed.title.trim();
    if (!title) { input.focus(); return; }

    const payload = {
      title,
      description: "",
      type: state.type,
      priority: state.priority,
      assigneeId: state.assigneeId,
      epicId: state.parsed.epicId ?? 0,
      sprintId: Number(defaultsOf().sprintId) || 0,
      estimateHours: state.parsed.estimateHours ?? 0,
      dueUtc: dueToIso(state.parsed.due),
      labelIds: state.parsed.labelIds,
    };
    if (status) payload.status = status;

    if (full) { openFull?.(payload); return; }
    if (busy) return;
    busy = true;
    submitBtn.disabled = true;
    try {
      const card = await client.post("/api/workitems", payload);
      input.value = "";
      // As pílulas ficam: cadastrar cinco bugs seguidos é um clique, não cinco.
      lastParsed = {};
      feedback.toast(`${card?.code ?? "Atividade"} criada`, "ok");
      onCreated?.(card);
    } catch (error) {
      feedback.toast(error.message, "error");
    }
    busy = false;
    sync();
    input.focus();
  }

  sync();
  return { el, focus: () => input.focus(), sync };
}
