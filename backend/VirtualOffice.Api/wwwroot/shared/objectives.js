// Objetivos diários e semanais (app web + painel do jogo).
import { h, hm, placeholder } from "./work-core.js";

const SCOPE_LABEL = { Daily: "Objetivos de hoje", Weekly: "Objetivos da semana" };

export function mountObjectives(host, ctx) {
  const { client, feedback, compact = false } = ctx;
  let disposed = false;

  const root = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
  host.replaceChildren(root);
  root.replaceChildren(placeholder("Carregando objetivos…"));

  async function refresh() {
    if (disposed) return;
    try {
      const data = await client.get("/api/objectives");
      draw(data);
    } catch (error) {
      root.replaceChildren(placeholder(error.message, "error"));
    }
  }

  function draw(data) {
    const groups = ["Daily", "Weekly"].map((scope) => {
      const list = (data.objectives ?? []).filter((o) => o.scope === scope);
      if (list.length === 0) return "";
      const done = list.filter((o) => o.done).length;
      return h("section", {},
        h("div", { class: "wq-panel-head", style: { border: "none", padding: "0 0 8px" } },
          SCOPE_LABEL[scope],
          h("span", { class: "wq-spacer" }),
          h("span", { class: "wq-faint", style: { textTransform: "none", letterSpacing: "0" } },
            `${done}/${list.length} concluídos`)),
        h("div", { class: "wq-goals" }, list.map(goal)));
    });
    root.replaceChildren(...groups);
  }

  function goal(o) {
    const pct = o.target > 0 ? Math.min(100, Math.round((o.value / o.target) * 100)) : 0;
    // Métricas de tempo falam em horas; contagens falam em unidades.
    const shown = o.metric === "minutes"
      ? `${hm(o.value)} de ${hm(o.target)}`
      : `${Math.min(o.value, o.target)} de ${o.target}`;
    return h("div", { class: `wq-goal${o.done ? " done" : ""}` },
      h("span", { class: "ico" }, o.done ? "✅" : o.icon),
      h("div", { class: "body" },
        h("div", { class: "name" }, o.name),
        !compact && h("div", { class: "desc" }, o.description),
        h("div", { class: "wq-progress" },
          h("i", { style: { width: `${pct}%`, background: o.done ? "var(--wq-green)" : "var(--wq-accent)" } })),
        h("div", { class: "foot" },
          h("span", {}, shown),
          h("span", { class: "reward" }, `+${o.goldReward} 🪙`))));
  }

  /** Toast de objetivo concluído — chamado pelo SignalR dos dois clientes. */
  function celebrate(completions) {
    for (const c of completions ?? []) {
      feedback?.toast(`${c.icon} ${c.name} · +${c.gold} 🪙`, "ok");
    }
    refresh();
  }

  refresh();

  return {
    refresh,
    celebrate,
    destroy() { disposed = true; host.replaceChildren(); },
  };
}
