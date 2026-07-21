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
          [...skins, ...medals].length === 0 && h("div", { class: "faint" }, "Jogue para dropar itens."))),
      accountPanel())));
}

function chip(t) { return h("span", { class: "badge" }, t); }

/// Conta: trocar senha e vincular/desvincular o Google na MESMA conta (nada de
/// progresso duplicado). Só aparece para quem entrou com token de verdade.
function accountPanel() {
  const panel = h("div", { class: "panel" }, h("div", { class: "panel-head" }, "🔐 Conta"));
  const body = h("div", { class: "panel-pad account-form", style: { display: "grid", gap: "10px" } });
  panel.append(body);

  (async () => {
    const identity = await fetch("/auth/me", { headers: { Authorization: `Bearer ${API.token}` } })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!identity) {
      body.append(h("div", { class: "faint" }, "Entre com usuário e senha para gerenciar a conta."));
      return;
    }

    const msg = h("div", { class: "form-msg" });
    const current = h("input", { type: "password", placeholder: "senha atual", autocomplete: "current-password" });
    const next = h("input", { type: "password", placeholder: "nova senha (mín. 8)", autocomplete: "new-password" });
    const username = h("input", { placeholder: "escolha um usuário", autocomplete: "username" });
    current.hidden = !identity.hasPassword;      // conta só-Google define a primeira senha
    username.hidden = !!identity.username;

    const save = h("button", { class: "btn primary" }, identity.hasPassword ? "Trocar senha" : "Definir senha");
    save.onclick = async () => {
      save.disabled = true;
      msg.textContent = "";
      try {
        const res = await fetch("/auth/password", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API.token}` },
          body: JSON.stringify({
            currentPassword: current.value, newPassword: next.value, username: username.value,
          }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error || `Erro ${res.status}`);
        API.token = payload.access_token;
        msg.style.color = "var(--green)";
        msg.textContent = "Senha atualizada. As outras sessões foram encerradas.";
        current.value = next.value = "";
      } catch (err) {
        msg.style.color = "";
        msg.textContent = err.message;
      }
      save.disabled = false;
    };

    body.append(
      h("div", { class: "faint" }, `Usuário: ${identity.username || "—"} · ${identity.email || "sem e-mail"}`),
      username, current, next, save, msg);

    const cfg = await API.get("/auth/config").catch(() => ({ googleEnabled: false }));
    if (!cfg.googleEnabled) return;
    if (identity.hasGoogle) {
      body.append(h("div", { class: "faint" }, "Google vinculado a esta conta."));
      return;
    }
    const link = h("button", { class: "btn" }, "Vincular conta Google");
    // Passa o token no start: o callback pendura o Google neste usuário em vez de criar outro.
    link.onclick = () => {
      const back = encodeURIComponent(location.origin + "/");
      location.href = `/auth/google/login?return=${back}&link=${encodeURIComponent(API.token)}`;
    };
    body.append(link);
  })();

  return panel;
}
