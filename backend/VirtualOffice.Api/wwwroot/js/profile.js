import { API, h, avatar, hm } from "./api.js";
import { App } from "./main.js";

export async function renderProfile(view) {
  view.innerHTML = `<div class="loading">Carregando perfil…</div>`;
  const [me, inv, lb] = await Promise.all([
    API.get("/api/me"), API.get("/api/inventory"), API.get("/api/leaderboard")]);
  App.me = me;
  const li = me.levelInfo;
  const pct = Math.min(100, Math.round(100 * (li.xp - li.levelFloor) / Math.max(1, li.nextLevelXp - li.levelFloor)));
  const skins = inv.filter((i) => i.def.kind === "Skin");
  const medals = inv.filter((i) => i.def.kind === "Medal");
  const rarityColor = { Common: "#8b929d", Rare: "#2f6bff", Epic: "#a855f7", Legendary: "#d98a00" };

  view.innerHTML = "";
  view.append(h("div", { class: "grid", style: { gridTemplateColumns: "1.2fr .8fr" } },
    h("div", { class: "grid" },
      // nível
      h("div", { class: "panel panel-pad" },
        h("div", { style: { display: "flex", alignItems: "center", gap: "14px" } },
          avatar(me.user, "lg"),
          h("div", {}, h("div", { style: { fontWeight: "750", fontSize: "17px" } }, me.user.name),
            h("div", { class: "muted" }, me.user.role)),
          h("div", { class: "spacer" }),
          h("div", { style: { textAlign: "right" } },
            h("div", { style: { fontSize: "22px", fontWeight: "800" } }, `Nível ${li.level}`),
            h("div", { class: "faint" }, `${li.xp} / ${li.nextLevelXp} XP`))),
        h("div", { style: { height: "10px", background: "var(--surface-2)", borderRadius: "6px", marginTop: "14px", overflow: "hidden" } },
          h("div", { style: { width: pct + "%", height: "100%", background: "linear-gradient(90deg,#7c5cff,#a98bff)" } })),
        h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "14px" } },
          chip(`⏱ ${hm(me.stats.minutesTotal)} lançadas`),
          chip(`🎧 ${hm(me.stats.minutesMeeting)} reuniões`),
          chip(`✅ ${me.stats.tasksDone} tasks`),
          chip(`🐛 ${me.stats.bugsDone} bugs`),
          chip(`💬 ${me.stats.ticketsDone} atendimentos`))),
      // objetivos
      h("div", { class: "panel" }, h("div", { class: "panel-head" }, "🏅 Objetivos"),
        h("div", { class: "panel-pad", style: { paddingTop: "6px" } },
          me.achievements.map((a) => h("div", { style: { display: "flex", alignItems: "center", gap: "12px", padding: "9px 0", borderBottom: "1px solid var(--border)" } },
            h("div", { style: { fontSize: "22px", width: "30px", textAlign: "center", filter: a.done ? "" : "grayscale(1) opacity(.5)" } }, a.icon),
            h("div", { style: { flex: "1" } },
              h("div", { style: { fontWeight: "550" } }, a.name, a.done ? " ✓" : ""),
              h("div", { style: { height: "5px", background: "var(--surface-2)", borderRadius: "3px", marginTop: "5px", overflow: "hidden" } },
                h("div", { style: { width: `${Math.round(100 * a.progress / a.target)}%`, height: "100%", background: a.done ? "var(--green)" : "var(--accent)" } }))),
            h("span", { class: "faint", style: { fontSize: "12px" } }, `${a.progress}/${a.target}`)))))),
    h("div", { class: "grid" },
      // ranking
      h("div", { class: "panel" }, h("div", { class: "panel-head" }, "🏆 Ranking de XP"),
        h("div", { class: "panel-pad", style: { paddingTop: "8px" } },
          lb.map((u, i) => h("div", { style: { display: "flex", alignItems: "center", gap: "10px", padding: "7px 0" } },
            h("span", { class: "faint", style: { width: "20px" } }, `${i + 1}º`),
            avatar(u, "sm"),
            h("span", {}, u.name, u.id === me.user.id ? " (você)" : ""),
            h("span", { class: "spacer", style: { flex: "1" } }),
            h("span", { class: "faint", style: { fontSize: "12.5px" } }, `nv ${u.level} · ${u.xp} XP`))))),
      // skins
      h("div", { class: "panel" }, h("div", { class: "panel-head" }, "👕 Skins & medalhas"),
        h("div", { class: "panel-pad", style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(84px,1fr))", gap: "8px" } },
          [...skins, ...medals].map((i) => h("div", { style: { textAlign: "center", padding: "10px 6px", border: `1px solid ${rarityColor[i.def.rarity]}`, borderRadius: "10px", fontSize: "11.5px" } },
            h("div", { style: { fontSize: "24px", marginBottom: "4px" } }, i.def.icon),
            i.def.name.replace("Medalha: ", ""),
            i.equipped && h("div", { style: { color: "var(--green)", fontSize: "10.5px", marginTop: "3px" } }, "em uso"))),
          [...skins, ...medals].length === 0 && h("div", { class: "faint" }, "Jogue para dropar itens."))))));
}

function chip(t) { return h("span", { class: "badge" }, t); }
