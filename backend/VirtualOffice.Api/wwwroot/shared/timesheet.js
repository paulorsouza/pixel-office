// Controle de horas compartilhado (app web + painel do jogo).
//
// A ideia desta tela: LANÇAR não pode custar um formulário. A grade da semana é
// o formulário — cada célula (tipo × dia) é um botão que abre a folha de
// lançamento já sabendo o dia e o tipo, e a duração se escolhe TOCANDO num
// preset, que já grava. O formulário completo continua ali para o caso torto
// (nota, dupla, outro card), só deixou de ser o caminho de todo dia.
import { h, hm, hoursDecimal, avatar, placeholder, dayKey } from "./work-core.js";

const DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
// Durações que cobrem 95% dos lançamentos; o resto vai no ± de 15 em 15.
const PRESETS = [15, 30, 60, 90, 120, 180, 240, 360, 480];
const STEP = 15;

/** Segunda-feira da semana deslocada por `offset` semanas, no fuso do navegador. */
function mondayOf(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  return d;
}

const midnight = (shiftDays = 0) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + shiftDays);
  return d;
};

/** "2026-08-04" → "Ter 04/08" */
function dateLabel(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
    .replace(".", "").replace(",", "");
}

export function mountTimesheet(host, ctx) {
  const { client, feedback } = ctx;
  let weekOffset = 0;
  let activities = [];
  let workItems = [];
  let users = [];
  let activeTaskId = null;
  let data = null;
  let ticker = null;
  let disposed = false;

  const root = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
  host.replaceChildren(root);
  root.replaceChildren(placeholder("Carregando horas…"));

  async function loadMeta() {
    const [a, w, u, me] = await Promise.all([
      client.get("/api/activity-types").catch(() => []),
      client.get("/api/workitems").catch(() => []),
      client.get("/api/users").catch(() => []),
      client.get("/api/me").catch(() => null),
    ]);
    activities = a;
    workItems = w.filter((x) => x.status !== "Done");
    users = u;
    // A atividade ativa já vem escolhida na folha: quem lança desenvolvimento
    // quase sempre lança nela, e escolher card era o passo mais chato.
    activeTaskId = me?.activeTask?.id ?? null;
  }

  async function refresh() {
    if (disposed) return;
    const from = mondayOf(weekOffset);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    try {
      data = await client.get(`/api/timesheet?from=${from.toISOString()}&to=${to.toISOString()}`);
      draw(from);
    } catch (error) {
      root.replaceChildren(placeholder(error.message, "error"));
    }
  }

  // ------------------------------------------------------------- draw

  function draw(from) {
    const days = [...Array(7)].map((_, i) => {
      const d = new Date(from);
      d.setDate(d.getDate() + i);
      return d;
    });
    const today = dayKey(new Date());
    const totalWeek = data.totalMinutes ?? 0;
    const todayMinutes = data.dayTotals?.[today] ?? 0;
    const devTarget = activities.find((a) => a.key === "task")?.dailyTargetMinutes ?? 0;

    root.replaceChildren(
      header(from),
      data.running ? runningBar() : "",
      quickBar(),
      h("div", { class: "wq-stats" },
        stat("Hoje", hm(todayMinutes), devTarget ? `meta ${hm(devTarget)} · ${Math.min(100, Math.round((todayMinutes / devTarget) * 100))}%` : ""),
        stat("Semana", hm(totalWeek), `${hoursDecimal(totalWeek)} h decimais`),
        stat("Média/dia útil", hm(totalWeek / 5), `${data.entries.length} lançamentos`),
        stat("Ganho na semana", `${data.goldEarned} 🪙`, "em moedas")),
      gridPanel(days, today),
      entriesPanel());

    clearInterval(ticker);
    if (data.running) ticker = setInterval(tickRunning, 1000);
  }

  function header(from) {
    const end = new Date(from.getTime() + 6 * 864e5);
    const fmt = (d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    return h("div", { class: "wq-toolbar", style: { paddingBottom: "0" } },
      h("button", { class: "wq-btn sm", onclick: () => { weekOffset--; refresh(); } }, "←"),
      h("b", { style: { fontSize: "13.5px", minWidth: "108px", textAlign: "center" } }, `${fmt(from)} – ${fmt(end)}`),
      h("button", { class: "wq-btn sm", onclick: () => { weekOffset++; refresh(); } }, "→"),
      weekOffset !== 0 && h("button", { class: "wq-btn sm ghost", onclick: () => { weekOffset = 0; refresh(); } }, "hoje"),
      h("div", { class: "wq-spacer" }),
      h("button", { class: "wq-btn primary", onclick: () => openSheet() }, "＋ Lançamento"));
  }

  function runningBar() {
    const label = data.running.workItem
      ? `${data.running.workItem.code} · ${data.running.workItem.title}`
      : activityName(data.running.category);
    return h("div", { class: "wq-running" },
      h("span", { class: "pulse" }),
      h("div", { style: { flex: 1, minWidth: 0 } },
        h("div", { style: { fontSize: "12px", fontWeight: "600", opacity: ".75" } }, "Contador rodando"),
        h("div", { style: { fontSize: "13.5px", fontWeight: "650" } }, label)),
      h("span", { class: "elapsed", id: "wq-elapsed" }, elapsed()),
      h("button", {
        class: "wq-btn", onclick: async (event) => {
          event.target.disabled = true;
          try {
            const result = await client.post("/api/timer/stop");
            feedback.toast(result?.minutes
              ? `${hm(result.minutes)} registrados · +${result.gold} 🪙`
              : "Contador parado", "ok");
            ctx.onReward?.(result);
          } catch (error) {
            feedback.toast(error.message, "error");
          }
          refresh();
        },
      }, "■ Parar"));
  }

  const elapsed = () => {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(data.running.startUtc)) / 1000));
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
  };

  function tickRunning() {
    const el = root.querySelector("#wq-elapsed");
    if (!el || !data.running) return clearInterval(ticker);
    el.textContent = elapsed();
  }

  /**
   * Lançamento rápido: um clique registra a duração padrão do tipo — os 6 h de
   * desenvolvimento, a hora de pair, os 30 min de estudo. É o caminho do dia a
   * dia. O `±` ao lado abre a folha no mesmo tipo para ajustar antes de gravar.
   */
  function quickBar() {
    return h("div", { class: "wq-panel", style: { padding: "12px" } },
      h("div", { style: { fontSize: "11.5px", fontWeight: "700", color: "var(--wq-text-3)", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: "9px" } },
        "Lançamento rápido · hoje"),
      h("div", { class: "wq-quick" },
        activities.map((a) => h("div", { class: "wq-quick-item" },
          h("button", {
            class: "main", title: `${a.goldPerHour} 🪙 por hora`,
            onclick: (event) => quickLog(a, event.currentTarget),
          },
            h("span", { class: "ico" }, a.icon),
            h("span", { class: "txt" },
              h("b", {}, `${hm(a.defaultMinutes)} · ${a.name}`),
              h("small", {}, `+${Math.round(a.goldPerHour * a.defaultMinutes / 60)} 🪙`))),
          h("button", {
            class: "side", title: "outra duração, outro dia, com nota…",
            onclick: () => openSheet({ activityKey: a.key }),
          }, "±"))),
        h("div", { class: "wq-quick-item" },
          h("button", { class: "main", onclick: (e) => repeatLastDay(e.currentTarget) },
            h("span", { class: "ico" }, "🔁"),
            h("span", { class: "txt" }, h("b", {}, "Repetir o último dia"), h("small", {}, "copia tudo para hoje")))),
        h("div", { class: "wq-quick-item" },
          h("button", { class: "main", onclick: () => openSheet() },
            h("span", { class: "ico" }, "⚙"),
            h("span", { class: "txt" }, h("b", {}, "Outro valor"), h("small", {}, "data, duração e nota"))))));
  }

  async function quickLog(activity, button) {
    button.disabled = true;
    try {
      const result = await client.post("/api/timeentries/quick", { activityKey: activity.key, minutes: 0 });
      feedback.toast(`${activity.icon} ${hm(activity.defaultMinutes)} de ${activity.name} · +${result.gold} 🪙`, "ok");
      ctx.onReward?.(result);
      await refresh();
    } catch (error) {
      // O caso clássico é desenvolvimento sem atividade ativa. Reclamar e parar
      // ali obrigava a pessoa a ir ao quadro só para voltar; a folha resolve no
      // lugar, já com o tipo escolhido.
      feedback.toast(error.message, "error");
      button.disabled = false;
      if (activity.requiresWorkItem) openSheet({ activityKey: activity.key });
    }
  }

  // ------------------------------------------------------- grade da semana

  /** Uma linha por TIPO, mesmo zerado: a linha vazia é o convite para lançar. */
  function gridRows() {
    const logged = new Map((data.byActivity ?? []).map((r) => [r.activityKey, r]));
    const rows = activities.map((a) => ({
      key: a.key, name: a.name, icon: a.icon,
      minutes: logged.get(a.key)?.minutes ?? 0,
      days: logged.get(a.key)?.days ?? {},
    }));
    // Tipo desativado no catálogo mas com horas na semana continua aparecendo.
    for (const row of data.byActivity ?? []) {
      if (!rows.some((r) => r.key === row.activityKey)) {
        rows.push({ key: row.activityKey, name: row.name, icon: row.icon, minutes: row.minutes, days: row.days });
      }
    }
    return rows;
  }

  function gridPanel(days, today) {
    const rows = gridRows();
    const colTotal = (key) => rows.reduce((sum, r) => sum + (r.days[key] ?? 0), 0);
    const cell = (m) => (m ? hm(m) : "·");
    return h("div", { class: "wq-panel wq-scroll" },
      h("table", { class: "wq-table wq-grid" },
        h("thead", {}, h("tr", {},
          h("th", {}, "Tipo"),
          days.map((d, i) => h("th", { class: `num ${dayKey(d) === today ? "today" : ""}` }, `${DAY_NAMES[i]} ${d.getDate()}`)),
          h("th", { class: "num" }, "Total"))),
        h("tbody", {},
          rows.map((r) => h("tr", {},
            h("td", {}, h("span", { style: { display: "inline-flex", gap: "7px", alignItems: "center" } },
              h("span", {}, r.icon), h("span", {}, r.name))),
            days.map((d) => {
              const key = dayKey(d);
              const m = r.days[key] ?? 0;
              return h("td", { class: `num ${m ? "" : "zero"}` },
                h("button", {
                  class: `wq-cell${m ? " on" : ""}`,
                  title: `lançar ${r.icon} ${r.name} em ${dateLabel(key)}`,
                  onclick: () => openSheet({ date: key, activityKey: r.key }),
                }, m ? hm(m) : "＋"));
            }),
            h("td", { class: "num", style: { fontWeight: "700" } }, cell(r.minutes)))),
          rows.length === 0 && h("tr", {}, h("td", { colspan: "9", class: "wq-faint" }, "Sem tipos de lançamento."))),
        h("tfoot", {}, h("tr", {},
          h("td", {}, "Total"),
          days.map((d) => h("td", { class: "num" }, cell(colTotal(dayKey(d))))),
          h("td", { class: "num" }, cell(data.totalMinutes))))));
  }

  function entriesPanel() {
    return h("div", { class: "wq-panel" },
      h("div", { class: "wq-panel-head" }, "Lançamentos da semana",
        h("span", { class: "wq-spacer" }),
        h("span", { class: "wq-faint", style: { textTransform: "none", letterSpacing: "0" } }, "toque para editar")),
      h("div", { class: "wq-scroll" },
        h("table", { class: "wq-table" }, h("tbody", {},
          data.entries.map((e) => h("tr", {
            style: { cursor: "pointer" },
            onclick: (event) => { if (!event.target.closest("button")) openSheet({ entry: e }); },
          },
            h("td", { class: "wq-muted", style: { width: "96px", whiteSpace: "nowrap" } }, dateLabel(e.date)),
            h("td", { style: { width: "132px" } },
              h("span", { class: "wq-chip", style: chipFor(e.category) },
                `${activityIcon(e.category)} ${activityName(e.category)}`)),
            h("td", {}, e.workItem ? `${e.workItem.code} · ${e.workItem.title}` : (e.note || h("span", { class: "wq-faint" }, "—"))),
            h("td", { style: { width: "40px" } }, e.pair ? avatar(e.pair, "sm") : ""),
            h("td", { class: "num wq-faint", style: { width: "104px", whiteSpace: "nowrap" } },
              `+${e.goldAwarded} 🪙`),
            h("td", { class: "num", style: { width: "70px", fontWeight: "650" } }, hm(e.minutes)),
            h("td", { style: { width: "38px" } },
              h("button", {
                class: "wq-icon-btn", title: "apagar lançamento",
                onclick: () => removeEntry(e),
              }, "✕")))),
          data.entries.length === 0 && h("tr", {}, h("td", { class: "wq-faint" }, "Nada por aqui ainda."))))));
  }

  async function removeEntry(entry) {
    if (!confirm("Apagar este lançamento? As moedas dele são estornadas.")) return;
    try {
      await client.del(`/api/timeentries/${entry.id}`);
      feedback.toast("Lançamento apagado", "ok");
      ctx.onReward?.(null);
      refresh();
    } catch (error) {
      feedback.toast(error.message, "error");
    }
  }

  // ------------------------------------------------- folha de lançamento

  /**
   * A mesma folha serve para criar e para editar.
   * @param options.date        dia já escolhido (clique na célula da grade)
   * @param options.activityKey tipo já escolhido
   * @param options.entry       lançamento existente → vira edição
   */
  function openSheet(options = {}) {
    if (activities.length === 0) { feedback.toast("Catálogo de tipos indisponível.", "error"); return; }
    const entry = options.entry ?? null;
    let activity = activityOf(entry?.category ?? options.activityKey) ?? activities[0];
    let minutes = entry?.minutes ?? activity.defaultMinutes;
    let busy = false;

    const f = {};
    const presets = h("div", { class: "wq-presets" });
    const pairField = h("label", { class: "wq-field" });
    const hint = h("small", { class: "wq-faint" });
    const go = h("button", { class: "wq-btn primary" });

    f.activity = h("select", {
      class: "wq-select",
      onchange: (event) => {
        activity = activityOf(event.target.value) ?? activity;
        if (!entry) setMinutes(activity.defaultMinutes);
        syncActivity();
      },
    }, activities.map((a) => h("option", { value: a.key, selected: a.key === activity.key ? "" : null },
      `${a.icon} ${a.name}`)));

    // A data de um lançamento existente é fixa: o PATCH não move o dia. Para
    // mudar de dia, apaga e lança de novo — e a folha já diz isso.
    f.date = h("input", {
      class: "wq-input", type: "date",
      value: entry?.date ?? options.date ?? dayKey(new Date()),
      disabled: entry ? "" : null,
    });

    f.minutes = h("input", {
      class: "wq-input", type: "number", min: "5", max: "1440", step: String(STEP),
      style: { width: "84px", textAlign: "center" },
      oninput: () => { minutes = Number(f.minutes.value) || 0; syncMinutes(false); },
    });

    // Sem card por padrão: estudo e reunião não são de ninguém, e amarrar a hora
    // na atividade ativa só porque ela existe suja o "lançado" do card. Quem
    // EXIGE card (desenvolvimento) recebe a ativa em `syncActivity`.
    f.workItem = h("select", { class: "wq-select" },
      h("option", { value: "0" }, "— nenhuma —"),
      taskOptions().map(({ id, label }) => h("option", {
        value: String(id),
        selected: String(id) === String(entry?.workItem?.id ?? 0) ? "" : null,
      }, label)));

    f.note = h("input", { class: "wq-input", placeholder: "opcional", value: entry?.note ?? "" });

    f.pair = h("select", { class: "wq-select" },
      h("option", { value: "0" }, "— ninguém —"),
      users.filter((u) => u.id !== client.userId).map((u) => h("option", {
        value: String(u.id), selected: String(u.id) === String(entry?.pair?.id ?? 0) ? "" : null,
      }, u.name)));
    pairField.append(h("label", {}, "Dupla"), f.pair);

    const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
      h("div", { class: "wq-field-row" },
        h("label", { class: "wq-field" }, h("label", {}, "Tipo"), f.activity),
        h("label", { class: "wq-field" },
          h("label", {}, entry ? "Data (não muda na edição)" : "Data"), f.date)),
      h("div", { class: "wq-field" },
        h("label", {}, entry ? "Duração — toque para salvar" : "Duração — toque para lançar"),
        presets,
        h("div", { class: "wq-stepper" },
          h("button", { class: "wq-btn", type: "button", onclick: () => setMinutes(minutes - STEP) }, "−"),
          f.minutes,
          h("button", { class: "wq-btn", type: "button", onclick: () => setMinutes(minutes + STEP) }, "＋"),
          h("span", { class: "wq-spacer" }),
          go)),
      h("label", { class: "wq-field" }, h("label", {}, "Atividade do quadro"), f.workItem),
      pairField,
      h("label", { class: "wq-field" }, h("label", {}, "Nota"), f.note),
      hint);

    const dialog = feedback.modal({
      title: entry ? "Editar lançamento" : "Lançar horas",
      body,
      foot: h("div", { style: { display: "flex", gap: "8px", width: "100%" } },
        entry && h("button", {
          class: "wq-btn danger",
          onclick: async () => { dialog.close(); await removeEntry(entry); },
        }, "Apagar"),
        h("span", { class: "wq-spacer" }),
        h("button", { class: "wq-btn ghost", onclick: () => dialog.close() }, "Cancelar")),
    });

    function syncActivity() {
      pairField.hidden = !activity.allowsPair;
      // O tipo que exige card já chega com a atividade ativa escolhida — é o
      // passo que fazia o lançamento rápido de desenvolvimento dar erro.
      if (activity.requiresWorkItem && f.workItem.value === "0" && activeTaskId) {
        f.workItem.value = String(activeTaskId);
      }
      hint.textContent = `+${activity.goldPerHour} 🪙 por hora`
        + (activity.requiresWorkItem ? " · exige uma atividade do quadro" : "");
      presets.replaceChildren(...PRESETS.map((value) => h("button", {
        class: `wq-preset${value === minutes ? " on" : ""}${value === activity.defaultMinutes ? " default" : ""}`,
        type: "button",
        title: value === activity.defaultMinutes ? "duração padrão deste tipo" : "",
        onclick: () => { setMinutes(value); save(); },
      }, hm(value))));
      syncMinutes();
    }

    function setMinutes(value) {
      minutes = Math.min(1440, Math.max(STEP, Math.round(value / STEP) * STEP));
      syncMinutes();
    }

    /** @param writeField false quando o valor veio do próprio campo numérico. */
    function syncMinutes(writeField = true) {
      if (writeField) f.minutes.value = String(minutes);
      go.textContent = `${entry ? "Salvar" : "Lançar"} ${hm(minutes)}`;
      go.disabled = busy || minutes <= 0;
      for (const button of presets.children) {
        button.classList.toggle("on", button.textContent === hm(minutes));
      }
    }

    go.onclick = () => save();
    syncActivity();

    async function save() {
      if (busy || !(minutes > 0)) return;
      const workItemId = Number(f.workItem.value) || 0;
      if (activity.requiresWorkItem && !workItemId) {
        feedback.toast(`${activity.name} precisa de uma atividade do quadro.`, "error");
        f.workItem.focus();
        return;
      }
      busy = true;
      syncMinutes();
      try {
        const payload = {
          minutes,
          workItemId,
          activityKey: activity.key,
          note: f.note.value,
          pairUserId: activity.allowsPair ? Number(f.pair.value) || 0 : 0,
        };
        let gold;
        if (entry) {
          gold = (await client.patch(`/api/timeentries/${entry.id}`, payload))?.goldAwarded;
        } else {
          const result = await client.post("/api/timeentries", {
            ...payload,
            date: new Date(`${f.date.value}T12:00:00Z`).toISOString(),
            source: "manual",
          });
          gold = result?.gold;
          ctx.onReward?.(result);
        }
        dialog.close();
        feedback.toast(`${activity.icon} ${hm(minutes)} de ${activity.name}`
          + (gold ? ` · +${gold} 🪙` : " · sem moedas (teto do dia)"), "ok");
        await refresh();
      } catch (error) {
        feedback.toast(error.message, "error");
      }
      busy = false;
      syncMinutes();
    }
  }

  /** Ativa primeiro, depois as usadas na semana, depois o resto do quadro. */
  function taskOptions() {
    const seen = new Set();
    const out = [];
    const push = (id, code, title) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push({ id, label: `${code} · ${title}` });
    };
    const active = workItems.find((w) => w.id === activeTaskId);
    if (active) push(active.id, `★ ${active.code}`, active.title);
    for (const entry of data?.entries ?? []) {
      if (entry.workItem) push(entry.workItem.id, entry.workItem.code, entry.workItem.title);
    }
    for (const item of workItems) push(item.id, item.code, item.title);
    return out;
  }

  // ------------------------------------------------------- repetir o dia

  /**
   * Copia para hoje tudo que foi lançado no último dia com movimento. Duas
   * semanas para trás é o bastante — quem some por mais tempo que isso não está
   * "repetindo ontem".
   */
  async function repeatLastDay(button) {
    button.disabled = true;
    try {
      const to = midnight();
      const from = midnight(-14);
      const recent = await client.get(`/api/timesheet?from=${from.toISOString()}&to=${to.toISOString()}`);
      const source = lastDayOf(recent.entries ?? [], dayKey(new Date()));
      if (!source) {
        feedback.toast("Não achei um dia anterior com lançamentos.", "error");
        return;
      }
      confirmRepeat(source);
    } catch (error) {
      feedback.toast(error.message, "error");
    }
    button.disabled = false;
  }

  /** O corte por data é aqui, não na consulta: a janela do servidor é em UTC e
   *  as bordas do dia escorregam com o fuso — hoje NUNCA pode virar a fonte. */
  function lastDayOf(entries, before) {
    const past = entries.filter((e) => e.date < before);
    const day = past.reduce((best, e) => (best === null || e.date > best ? e.date : best), null);
    return day ? { date: day, entries: past.filter((e) => e.date === day) } : null;
  }

  function confirmRepeat(source) {
    const copy = h("button", { class: "wq-btn primary" }, `Copiar ${source.entries.length} para hoje`);
    const dialog = feedback.modal({
      title: `Repetir ${dateLabel(source.date)}`,
      body: h("div", { style: { display: "flex", flexDirection: "column", gap: "9px" } },
        h("p", { style: { fontSize: "13px" } },
          "Estes lançamentos serão criados de novo, com a data de hoje:"),
        h("ul", { style: { display: "flex", flexDirection: "column", gap: "5px" } },
          source.entries.map((e) => h("li", { style: { display: "flex", gap: "7px", alignItems: "center", fontSize: "13px" } },
            h("span", { class: "wq-chip", style: chipFor(e.category) },
              `${activityIcon(e.category)} ${activityName(e.category)}`),
            h("b", {}, hm(e.minutes)),
            h("span", { class: "wq-faint" }, e.workItem ? e.workItem.code : (e.note || "")))))),
      foot: h("div", { style: { display: "flex", gap: "8px" } },
        h("button", { class: "wq-btn ghost", onclick: () => dialog.close() }, "Cancelar"), copy),
    });

    copy.onclick = async () => {
      copy.disabled = true;
      const today = new Date(`${dayKey(new Date())}T12:00:00Z`).toISOString();
      let done = 0;
      let gold = 0;
      try {
        // Em série de propósito: cada lançamento passa pelo teto diário, e o
        // servidor precisa ver o anterior já gravado para aplicar o corte.
        for (const e of source.entries) {
          const result = await client.post("/api/timeentries", {
            date: today,
            minutes: e.minutes,
            workItemId: e.workItem?.id ?? 0,
            activityKey: e.category,
            note: e.note ?? "",
            pairUserId: e.pair?.id ?? 0,
            source: "manual",
          });
          done += 1;
          gold += result?.gold ?? 0;
          ctx.onReward?.(result);
        }
        dialog.close();
        feedback.toast(`${done} lançamento(s) copiados · +${gold} 🪙`, "ok");
      } catch (error) {
        feedback.toast(done ? `${done} copiados, aí deu erro: ${error.message}` : error.message, "error");
        copy.disabled = false;
      }
      await refresh();
    };
  }

  // -------------------------------------------------------- helpers

  const activityOf = (key) => activities.find((a) => a.key === key);
  const activityName = (key) => activityOf(key)?.name ?? key;
  const activityIcon = (key) => activityOf(key)?.icon ?? "📌";
  const chipFor = (key) => {
    const color = activityOf(key)?.color ?? "#8b929d";
    return { background: `${color}22`, color };
  };

  const stat = (k, v, sub) => h("div", { class: "wq-stat" },
    h("div", { class: "k" }, k), h("div", { class: "v" }, v), sub && h("div", { class: "sub" }, sub));

  loadMeta().then(refresh);

  return {
    refresh,
    destroy() { disposed = true; clearInterval(ticker); host.replaceChildren(); },
  };
}
