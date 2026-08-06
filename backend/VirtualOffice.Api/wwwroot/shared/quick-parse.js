// Captura rápida: transforma UMA linha de texto nos campos de um card.
//
// Módulo puro de propósito — nada de DOM aqui. Ele é o contrato entre o que a
// pessoa digita e o `POST /api/workitems`, e é o único pedaço desta tela que dá
// para testar sem navegador (`quick-parse.test.mjs`).
//
// Regras que valem para todos os tokens:
//   - só valem como PALAVRA INTEIRA; "email@x.com" não vira responsável;
//   - o que é reconhecido sai do título (o resto do texto vira o título);
//   - o que NÃO casa com nada fica no título — nada é engolido em silêncio.

const norm = (value) => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const TYPE_TOKENS = {
  task: "Task", tarefa: "Task", t: "Task",
  bug: "Bug", b: "Bug",
  atd: "Atendimento", atendimento: "Atendimento", a: "Atendimento",
};

const PRIORITY_TOKENS = {
  u: "Urgent", urgente: "Urgent",
  a: "High", alta: "High", high: "High",
  m: "Medium", media: "Medium",
  b: "Low", baixa: "Low", low: "Low",
};

const PRIORITY_CHIP = { Urgent: "Urgente", High: "Alta", Medium: "Média", Low: "Baixa" };

// Abreviação de 3 letras só: "sex" dificilmente aparece num título, "sexta" sim
// ("reunião de sexta" continua sendo título inteiro).
const WEEKDAYS = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };

/** Dia local em `yyyy-mm-dd` — mesma convenção do `dayKey` de work-core. */
const localKey = (date) => `${date.getFullYear()}`
  + `-${String(date.getMonth() + 1).padStart(2, "0")}`
  + `-${String(date.getDate()).padStart(2, "0")}`;

const shiftDays = (from, days) => {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

/** Atalhos mostrados como dica embaixo do campo. */
export const QUICK_HINT = "/bug  !alta  @pessoa  #etiqueta  ~2h  sex";

/**
 * Converte o dia local (`yyyy-mm-dd`) no ISO que a API espera.
 * Meio-dia UTC: a data cai no dia certo em qualquer fuso do time.
 */
export const dueToIso = (dayKey) => (dayKey ? new Date(`${dayKey}T12:00:00Z`).toISOString() : null);

/**
 * @param text   a linha digitada
 * @param meta   { users, labels, epics, currentUserId } — o mesmo objeto do quadro
 * @param options.today  data de referência (os testes fixam; a UI omite)
 * @returns { title, type?, priority?, assigneeId?, epicId?, labelIds, estimateHours?, due?, chips }
 *          `due` é dia local `yyyy-mm-dd`; `chips` descreve o que foi entendido.
 */
export function parseQuickTask(text, meta = {}, options = {}) {
  const today = options.today ?? new Date();
  const users = meta.users ?? [];
  const labels = meta.labels ?? [];
  const epics = meta.epics ?? [];

  const out = { title: "", labelIds: [], chips: [] };
  const rest = [];
  const chip = (field, label) => out.chips.push({ field, label });

  for (const word of String(text ?? "").trim().split(/\s+/)) {
    if (word && !consume(word)) rest.push(word);
  }
  out.title = rest.join(" ");
  return out;

  function consume(word) {
    const head = word[0];
    if (head === "/") return takeType(word.slice(1));
    if (head === "!") return takePriority(word.slice(1));
    if (head === "@") return takeAssignee(word.slice(1));
    if (head === "#") return takeTag(word.slice(1));
    if (head === "~") return takeEstimate(word.slice(1));
    return takeDue(word);
  }

  function takeType(rest) {
    const type = TYPE_TOKENS[norm(rest)];
    if (!type) return false;
    out.type = type;
    chip("type", type === "Atendimento" ? "Atend." : type);
    return true;
  }

  function takePriority(rest) {
    // "!!" é o atalho de urgente que não exige lembrar a letra.
    const priority = rest === "!" ? "Urgent" : PRIORITY_TOKENS[norm(rest)];
    if (!priority) return false;
    out.priority = priority;
    chip("priority", PRIORITY_CHIP[priority]);
    return true;
  }

  function takeAssignee(rest) {
    const wanted = norm(rest);
    if (!wanted) return false;
    if (wanted === "eu" || wanted === "mim") {
      const me = users.find((u) => u.id === meta.currentUserId);
      if (!me) return false;
      out.assigneeId = me.id;
      chip("assignee", me.name);
      return true;
    }
    const match = users.find((u) => matchesName(u.name, wanted));
    if (!match) return false;
    out.assigneeId = match.id;
    chip("assignee", match.name);
    return true;
  }

  // Etiqueta primeiro, épico depois: etiqueta é o que se usa toda hora.
  function takeTag(rest) {
    const wanted = norm(rest.replace(/_/g, " "));
    if (!wanted) return false;
    const label = labels.find((l) => norm(l.name).startsWith(wanted));
    if (label) {
      if (!out.labelIds.includes(label.id)) out.labelIds.push(label.id);
      chip("label", label.name);
      return true;
    }
    const epic = epics.find((e) => norm(e.name).startsWith(wanted));
    if (!epic) return false;
    out.epicId = epic.id;
    chip("epic", epic.name);
    return true;
  }

  function takeEstimate(rest) {
    const match = /^(\d+(?:[.,]\d+)?)(h|hs|m|min)?$/i.exec(rest);
    if (!match) return false;
    const value = Number(match[1].replace(",", "."));
    if (!(value > 0)) return false;
    const unit = (match[2] ?? "h").toLowerCase();
    const hours = unit.startsWith("m") ? Math.round((value / 60) * 100) / 100 : value;
    out.estimateHours = hours;
    chip("estimate", unit.startsWith("m") ? `${value}min` : `${match[1].replace(",", ".")}h`);
    return true;
  }

  function takeDue(word) {
    const day = dueFor(word);
    if (!day) return false;
    out.due = day;
    chip("due", word.toLowerCase());
    return true;
  }

  function dueFor(word) {
    const plain = norm(word);
    if (plain === "hoje") return localKey(today);
    if (plain === "amanha") return localKey(shiftDays(today, 1));
    if (plain in WEEKDAYS) {
      // Mesmo dia da semana = hoje; o resto é a próxima ocorrência.
      const delta = (WEEKDAYS[plain] - today.getDay() + 7) % 7;
      return localKey(shiftDays(today, delta));
    }
    const date = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(plain);
    if (!date) return null;
    const [, d, m, y] = date;
    const year = y === undefined ? today.getFullYear() : Number(y.length === 2 ? `20${y}` : y);
    const parsed = new Date(year, Number(m) - 1, Number(d), 12);
    if (parsed.getDate() !== Number(d) || parsed.getMonth() !== Number(m) - 1) return null;
    return localKey(parsed);
  }
}

/** "paulo" casa com "Paulo Souza"; "souza" também; "pa" também. */
function matchesName(name, wanted) {
  const full = norm(name);
  if (full.replace(/\s+/g, "").startsWith(wanted)) return true;
  return full.split(/\s+/).some((part) => part.startsWith(wanted));
}
