import { API, h, hm } from "./api.js";

let days = 14;

export async function renderReports(view, { actions }) {
  view.innerHTML = `<div class="loading">Carregando relatórios…</div>`;
  const data = await API.get(`/api/reports/summary?days=${days}`);
  actions.replaceChildren(
    h("select", { class: "select", onchange: (e) => { days = Number(e.target.value); renderReports(view, { actions }); } },
      ...[7, 14, 30, 60].map((d) => h("option", { value: d, selected: d === days ? "selected" : null }, `últimos ${d} dias`))));

  const maxDay = Math.max(1, ...data.perDay.map((d) => d.minutes));
  const catLabel = (c) => ({ task: "Tasks", reuniao: "Reuniões", outro: "Outro" }[c] ?? c);

  view.innerHTML = "";
  view.append(
    h("div", { class: "grid", style: { gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "16px" } },
      stat("Total no período", hm(data.perDay.reduce((a, d) => a + d.minutes, 0))),
      stat("Média por dia", hm(data.perDay.reduce((a, d) => a + d.minutes, 0) / data.days)),
      stat("Pessoas ativas", String(data.perUser.length))),

    h("div", { class: "panel panel-pad", style: { marginBottom: "16px" } },
      h("div", { class: "chart-title" }, "Horas por dia"),
      h("div", { style: { display: "flex", alignItems: "flex-end", gap: "5px", height: "170px", marginTop: "12px" } },
        data.perDay.map((d) => {
          const date = new Date(d.date + "T12:00:00");
          const pct = Math.round(100 * d.minutes / maxDay);
          return h("div", { class: "bar-col", title: `${date.toLocaleDateString("pt-BR")}: ${hm(d.minutes)}` },
            h("span", { class: "bar-val" }, d.minutes ? hm(d.minutes) : ""),
            h("div", { class: "bar", style: { height: `${Math.max(pct, d.minutes ? 3 : 0)}%` } }),
            h("span", { class: "bar-lbl" }, `${date.getDate()}/${date.getMonth() + 1}`));
        }))),

    h("div", { class: "grid", style: { gridTemplateColumns: "1fr 1fr" } },
      hbarPanel("Por categoria", data.perCategory.map((c) => ({ label: catLabel(c.category), minutes: c.minutes, color: "#7c5cff" }))),
      hbarPanel("Por pessoa", data.perUser.map((u) => ({ label: u.name, minutes: u.minutes, color: u.color })))),
    h("div", { style: { marginTop: "16px" } },
      hbarPanel("Por épico", data.perEpic.map((e) => ({ label: e.name, minutes: e.minutes, color: e.color })))));

  injectChartCss();
}

function stat(k, v) { return h("div", { class: "stat" }, h("div", { class: "k" }, k), h("div", { class: "v" }, v)); }

function hbarPanel(title, rows) {
  const max = Math.max(1, ...rows.map((r) => r.minutes));
  return h("div", { class: "panel panel-pad" },
    h("div", { class: "chart-title" }, title),
    h("div", { style: { marginTop: "10px", display: "flex", flexDirection: "column", gap: "9px" } },
      rows.length ? rows.map((r) =>
        h("div", { style: { display: "flex", alignItems: "center", gap: "10px" } },
          h("span", { style: { width: "120px", fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, r.label),
          h("div", { style: { flex: "1", height: "13px", background: "var(--surface-2)", borderRadius: "7px", overflow: "hidden" } },
            h("div", { style: { width: `${Math.round(100 * r.minutes / max)}%`, height: "100%", background: r.color, borderRadius: "7px" } })),
          h("span", { style: { width: "62px", textAlign: "right", fontSize: "12.5px", color: "var(--text-2)" } }, hm(r.minutes))))
        : h("div", { class: "faint" }, "Sem dados.")));
}

function injectChartCss() {
  if (document.getElementById("chart-css")) return;
  const s = document.createElement("style"); s.id = "chart-css";
  s.textContent = `.chart-title{font-size:13px;font-weight:650;color:var(--text-2)}
    .bar-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end}
    .bar{width:100%;max-width:40px;background:linear-gradient(180deg,#8a6bff,#7c5cff);border-radius:6px 6px 0 0}
    .bar-val{font-size:10.5px;color:var(--text-3)} .bar-lbl{font-size:10.5px;color:var(--text-3)}`;
  document.head.append(s);
}
