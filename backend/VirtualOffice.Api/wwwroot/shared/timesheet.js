// Controle de horas compartilhado (app web + painel do jogo).
import { h, hm, hoursDecimal, avatar, placeholder, dayKey } from "./work-core.js";

const DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Segunda-feira da semana deslocada por `offset` semanas, no fuso do navegador. */
function mondayOf(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  return d;
}

export function mountTimesheet(host, ctx) {
  const { client, feedback } = ctx;
  let weekOffset = 0;
  let activities = [];
  let workItems = [];
  let users = [];
  let data = null;
  let ticker = null;
  let disposed = false;

  const root = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
  host.replaceChildren(root);
  root.replaceChildren(placeholder("Carregando horas…"));

  async function loadMeta() {
    const [a, w, u] = await Promise.all([
      client.get("/api/activity-types").catch(() => []),
      client.get("/api/workitems").catch(() => []),
      client.get("/api/users").catch(() => []),
    ]);
    activities = a;
    workItems = w.filter((x) => x.status !== "Done");
    users = u;
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
        stat("Ganho na semana", `${data.xpEarned} XP`, `+${data.goldEarned} 🪙`)),
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
      h("button", { class: "wq-btn primary", onclick: () => openEntry() }, "＋ Lançamento"));
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
              ? `${hm(result.minutes)} registrados · +${result.xp} XP · +${result.gold} 🪙`
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
   * desenvolvimento, a hora de pair, os 30 min de estudo. É o caminho do dia a dia.
   */
  function quickBar() {
    return h("div", { class: "wq-panel", style: { padding: "12px" } },
      h("div", { style: { fontSize: "11.5px", fontWeight: "700", color: "var(--wq-text-3)", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: "9px" } },
        "Lançamento rápido · hoje"),
      h("div", { class: "wq-quick" },
        activities.map((a) => h("button", {
          title: `${a.xpPerHour} XP e ${a.goldPerHour} 🪙 por hora`,
          onclick: (event) => quickLog(a, event.currentTarget),
        },
          h("span", { class: "ico" }, a.icon),
          h("span", { class: "txt" },
            h("b", {}, `${hm(a.defaultMinutes)} · ${a.name}`),
            h("small", {}, `+${Math.round(a.xpPerHour * a.defaultMinutes / 60)} XP · +${Math.round(a.goldPerHour * a.defaultMinutes / 60)} 🪙`)))),
        h("button", { onclick: () => openEntry() },
          h("span", { class: "ico" }, "⚙"),
          h("span", { class: "txt" }, h("b", {}, "Outro valor"), h("small", {}, "data, duração e nota")))));
  }

  async function quickLog(activity, button) {
    button.disabled = true;
    try {
      const result = await client.post("/api/timeentries/quick", { activityKey: activity.key, minutes: 0 });
      feedback.toast(`${activity.icon} ${hm(activity.defaultMinutes)} de ${activity.name} · +${result.xp} XP · +${result.gold} 🪙`, "ok");
      ctx.onReward?.(result);
      await refresh();
    } catch (error) {
      feedback.toast(error.message, "error");
      button.disabled = false;
    }
  }

  function gridPanel(days, today) {
    const rows = data.byActivity ?? [];
    const colTotal = (key) => rows.reduce((sum, r) => sum + (r.days[key] ?? 0), 0);
    const cell = (m) => (m ? hm(m) : "·");
    return h("div", { class: "wq-panel wq-scroll" },
      h("table", { class: "wq-table" },
        h("thead", {}, h("tr", {},
          h("th", {}, "Tipo"),
          days.map((d, i) => h("th", { class: `num ${dayKey(d) === today ? "today" : ""}` }, `${DAY_NAMES[i]} ${d.getDate()}`)),
          h("th", { class: "num" }, "Total"))),
        h("tbody", {},
          rows.map((r) => h("tr", {},
            h("td", {}, h("span", { style: { display: "inline-flex", gap: "7px", alignItems: "center" } },
              h("span", {}, r.icon), h("span", {}, r.name))),
            days.map((d) => {
              const m = r.days[dayKey(d)] ?? 0;
              return h("td", { class: `num ${m ? "" : "zero"}` }, cell(m));
            }),
            h("td", { class: "num", style: { fontWeight: "700" } }, cell(r.minutes)))),
          rows.length === 0 && h("tr", {}, h("td", { colspan: "9", class: "wq-faint" }, "Sem lançamentos nesta semana."))),
        h("tfoot", {}, h("tr", {},
          h("td", {}, "Total"),
          days.map((d) => h("td", { class: "num" }, cell(colTotal(dayKey(d))))),
          h("td", { class: "num" }, cell(data.totalMinutes))))));
  }

  function entriesPanel() {
    return h("div", { class: "wq-panel" },
      h("div", { class: "wq-panel-head" }, "Lançamentos da semana"),
      h("div", { class: "wq-scroll" },
        h("table", { class: "wq-table" }, h("tbody", {},
          data.entries.map((e) => h("tr", {},
            h("td", { class: "wq-muted", style: { width: "96px", whiteSpace: "nowrap" } },
              new Date(e.startUtc).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })),
            h("td", { style: { width: "132px" } },
              h("span", { class: "wq-chip", style: chipFor(e.category) },
                `${activityIcon(e.category)} ${activityName(e.category)}`)),
            h("td", {}, e.workItem ? `${e.workItem.code} · ${e.workItem.title}` : (e.note || h("span", { class: "wq-faint" }, "—"))),
            h("td", { style: { width: "40px" } }, e.pair ? avatar(e.pair, "sm") : ""),
            h("td", { class: "num wq-faint", style: { width: "104px", whiteSpace: "nowrap" } },
              `+${e.xpAwarded} XP · +${e.goldAwarded}🪙`),
            h("td", { class: "num", style: { width: "70px", fontWeight: "650" } }, hm(e.minutes)),
            h("td", { style: { width: "38px" } },
              h("button", {
                class: "wq-icon-btn", title: "apagar lançamento",
                onclick: async () => {
                  if (!confirm("Apagar este lançamento? O XP e as moedas dele são estornados.")) return;
                  try {
                    await client.del(`/api/timeentries/${e.id}`);
                    feedback.toast("Lançamento apagado", "ok");
                    ctx.onReward?.(null);
                    refresh();
                  } catch (error) {
                    feedback.toast(error.message, "error");
                  }
                },
              }, "✕")))),
          data.entries.length === 0 && h("tr", {}, h("td", { class: "wq-faint" }, "Nada por aqui ainda."))))));
  }

  // ------------------------------------------------- lançamento manual

  function openEntry() {
    const f = {};
    const first = activities[0];
    const pairWrap = h("div", { class: "wq-field" });

    const syncActivity = () => {
      const activity = activities.find((a) => a.key === f.activity.value) ?? first;
      f.minutes.value = String(activity.defaultMinutes);
      f.workItem.disabled = false;
      f.workItem.parentElement.style.opacity = activity.requiresWorkItem ? "1" : ".65";
      pairWrap.hidden = !activity.allowsPair;
      f.hint.textContent = `+${activity.xpPerHour} XP e +${activity.goldPerHour} 🪙 por hora`
        + (activity.requiresWorkItem ? " · exige uma atividade do quadro" : "");
    };

    const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
      h("div", { class: "wq-field-row" },
        h("label", { class: "wq-field" }, h("label", {}, "Tipo"),
          f.activity = h("select", { class: "wq-select", onchange: syncActivity },
            activities.map((a) => h("option", { value: a.key }, `${a.icon} ${a.name}`)))),
        h("label", { class: "wq-field" }, h("label", {}, "Data"),
          f.date = h("input", { class: "wq-input", type: "date", value: dayKey(new Date()) })),
        h("label", { class: "wq-field" }, h("label", {}, "Minutos"),
          f.minutes = h("input", { class: "wq-input", type: "number", min: "1", max: "1440", step: "15" }))),
      h("label", { class: "wq-field" }, h("label", {}, "Atividade do quadro"),
        f.workItem = h("select", { class: "wq-select" },
          h("option", { value: "0" }, "— nenhuma —"),
          workItems.map((w) => h("option", { value: String(w.id) }, `${w.code} · ${w.title}`)))),
      pairWrap,
      h("label", { class: "wq-field" }, h("label", {}, "Nota"),
        f.note = h("input", { class: "wq-input", placeholder: "opcional" })),
      f.hint = h("small", { class: "wq-faint" }));

    pairWrap.append(h("label", {}, "Dupla"),
      f.pair = h("select", { class: "wq-select" },
        h("option", { value: "0" }, "— ninguém —"),
        users.filter((u) => u.id !== client.userId).map((u) => h("option", { value: String(u.id) }, u.name))));

    syncActivity();

    const save = h("button", { class: "wq-btn primary" }, "Lançar");
    const dialog = feedback.modal({
      title: "Lançamento de horas",
      body,
      foot: h("div", { style: { display: "flex", gap: "8px" } },
        h("button", { class: "wq-btn ghost", onclick: () => dialog.close() }, "Cancelar"), save),
    });

    save.onclick = async () => {
      save.disabled = true;
      try {
        const result = await client.post("/api/timeentries", {
          date: new Date(`${f.date.value}T12:00:00Z`).toISOString(),
          minutes: Number(f.minutes.value),
          workItemId: Number(f.workItem.value),
          activityKey: f.activity.value,
          note: f.note.value,
          pairUserId: Number(f.pair.value),
          source: "manual",
        });
        dialog.close();
        feedback.toast(`Lançado · +${result.xp} XP · +${result.gold} 🪙`, "ok");
        ctx.onReward?.(result);
        await refresh();
      } catch (error) {
        feedback.toast(error.message, "error");
        save.disabled = false;
      }
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
