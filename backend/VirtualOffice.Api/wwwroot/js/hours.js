import { API, h, hm, modal, option, toast, STATUS } from "./api.js";
import { App } from "./main.js";

let weekOffset = 0;

function monday(off) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7);
  return d;
}

export async function renderHours(view, { actions }) {
  const from = monday(weekOffset), to = new Date(from); to.setDate(to.getDate() + 7);
  view.innerHTML = `<div class="loading">Carregando horas…</div>`;
  const [entries, workItems] = await Promise.all([
    API.get(`/api/timeentries?from=${from.toISOString()}&to=${to.toISOString()}`),
    API.get("/api/workitems")]);

  actions.replaceChildren(
    h("button", { class: "btn", onclick: () => { weekOffset--; renderHours(view, { actions }); } }, "←"),
    h("span", { class: "muted", style: { padding: "0 6px" } },
      `${from.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} – ${new Date(from.getTime() + 6 * 864e5).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`),
    h("button", { class: "btn", onclick: () => { weekOffset++; renderHours(view, { actions }); } }, "→"),
    weekOffset !== 0 && h("button", { class: "btn ghost", onclick: () => { weekOffset = 0; renderHours(view, { actions }); } }, "hoje"),
    h("button", { class: "btn primary", onclick: () => manual(workItems, () => renderHours(view, { actions })) }, "＋ Lançamento"));

  const days = [...Array(7)].map((_, i) => { const d = new Date(from); d.setDate(d.getDate() + i); return d; });
  const dayNames = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const todayKey = new Date().toDateString();

  const rows = new Map();
  for (const e of entries) {
    if (!e.endUtc) continue;
    const key = e.workItem ? `wi${e.workItem.id}` : `c${e.category}`;
    if (!rows.has(key)) rows.set(key, {
      label: e.workItem ? `${e.workItem.code} · ${e.workItem.title}` : (e.category === "reuniao" ? "Reunião" : "Outro"),
      days: [0, 0, 0, 0, 0, 0, 0], total: 0,
    });
    const r = rows.get(key), di = (new Date(e.startUtc).getDay() + 6) % 7;
    r.days[di] += e.minutes; r.total += e.minutes;
  }
  const colTotals = [0, 0, 0, 0, 0, 0, 0];
  rows.forEach((r) => r.days.forEach((m, i) => (colTotals[i] += m)));
  const grand = colTotals.reduce((a, b) => a + b, 0);
  const cell = (m) => (m ? hm(m) : "·");

  view.innerHTML = "";
  view.append(
    h("div", { class: "grid", style: { gridTemplateColumns: "repeat(4, 1fr)", marginBottom: "18px" } },
      stat("Total da semana", hm(grand)),
      stat("Reuniões", hm([...entries].filter((e) => e.category === "reuniao" && e.endUtc).reduce((a, e) => a + e.minutes, 0))),
      stat("Lançamentos", String([...entries].filter((e) => e.endUtc).length)),
      stat("Média/dia útil", hm(grand / 5))),
    h("div", { class: "panel", style: { overflow: "auto" } },
      h("table", { class: "tbl" },
        h("thead", {}, h("tr", {}, h("th", {}, "Atividade"),
          ...days.map((d, i) => h("th", { style: { textAlign: "right", color: d.toDateString() === todayKey ? "var(--accent)" : "" } }, `${dayNames[i]} ${d.getDate()}`)),
          h("th", { style: { textAlign: "right" } }, "Total"))),
        h("tbody", {},
          [...rows.values()].map((r) => h("tr", {}, h("td", {}, r.label),
            ...r.days.map((m) => h("td", { style: { textAlign: "right", color: m ? "" : "var(--text-3)" } }, cell(m))),
            h("td", { style: { textAlign: "right", fontWeight: "700" } }, cell(r.total)))),
          rows.size === 0 && h("tr", {}, h("td", { colspan: "9", class: "faint" }, "Sem lançamentos nesta semana."))),
        h("tfoot", {}, h("tr", { style: { fontWeight: "700" } }, h("td", {}, "Total"),
          ...colTotals.map((m) => h("td", { style: { textAlign: "right" } }, cell(m))),
          h("td", { style: { textAlign: "right" } }, cell(grand)))))),
    h("div", { class: "panel", style: { marginTop: "16px" } },
      h("div", { class: "panel-head" }, "Lançamentos da semana"),
      h("table", { class: "tbl" }, h("tbody", {},
        entries.filter((e) => e.endUtc).map((e) => h("tr", {},
          h("td", { class: "muted", style: { width: "120px" } }, new Date(e.startUtc).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })),
          h("td", {}, e.workItem ? `${e.workItem.code} ${e.workItem.title}` : (e.category === "reuniao" ? "Reunião" : "Outro")),
          h("td", { style: { textAlign: "right", width: "80px" } }, hm(e.minutes)),
          h("td", { style: { width: "40px" } }, h("button", { class: "btn icon ghost sm danger", onclick: async (ev) => { ev.stopPropagation(); await API.del(`/api/timeentries/${e.id}`); renderHours(view, { actions }); } }, "✕")))),
        entries.filter((e) => e.endUtc).length === 0 && h("tr", {}, h("td", { class: "faint" }, "Nada por aqui.")))))
  );
}

function stat(k, v) { return h("div", { class: "stat" }, h("div", { class: "k" }, k), h("div", { class: "v" }, v)); }

function manual(workItems, onDone) {
  const f = {};
  const body = h("div", {},
    h("div", { class: "field-row" },
      h("div", { class: "field" }, h("label", {}, "Data"), f.date = h("input", { class: "input", type: "date", value: new Date().toISOString().slice(0, 10) })),
      h("div", { class: "field" }, h("label", {}, "Minutos"), f.min = h("input", { class: "input", type: "number", min: "1", value: "60" }))),
    h("div", { class: "field" }, h("label", {}, "Atividade (opcional)"),
      f.wi = h("select", { class: "select" }, option("0", "— nenhuma —", true), ...workItems.map((w) => option(String(w.id), `${w.code} · ${w.title}`)))),
    h("div", { class: "field" }, h("label", {}, "Categoria"),
      f.cat = h("select", { class: "select" }, option("task", "Task", true), option("reuniao", "Reunião"), option("outro", "Outro"))));
  const m = modal({
    title: "Lançamento manual", body,
    foot: h("div", { style: { display: "flex", gap: "8px" } },
      h("button", { class: "btn ghost", onclick: () => m.close() }, "Cancelar"),
      h("button", { class: "btn primary", onclick: async () => {
        await API.post("/api/timeentries", { date: f.date.value, minutes: Number(f.min.value), workItemId: Number(f.wi.value), category: f.cat.value });
        m.close(); toast("Lançamento adicionado", "#16a34a"); await App.refreshMe(); onDone();
      } }, "Lançar")),
  });
}
