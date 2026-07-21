import { API, h, esc, avatar } from "./api.js";
import { App } from "./main.js";

const online = new Map(); // key -> player
const log = [];

export async function renderChat(view) {
  online.clear(); log.length = 0;
  view.innerHTML = "";

  const onlineList = h("div", { id: "chat-online", class: "panel-pad" }, h("div", { class: "faint" }, "conectando…"));
  const chatLog = h("div", { id: "chat-log", style: { flex: "1", overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" } });
  const input = h("input", { class: "input", placeholder: "Mensagem para quem está por perto…  (Enter)", onkeydown: (e) => { if (e.key === "Enter") send(e.target); } });

  view.append(h("div", { class: "grid", style: { gridTemplateColumns: "260px 1fr", height: "calc(100vh - 150px)" } },
    h("div", { class: "panel", style: { overflow: "auto" } }, h("div", { class: "panel-head" }, "👥 No escritório"), onlineList),
    h("div", { class: "panel", style: { display: "flex", flexDirection: "column" } },
      h("div", { class: "panel-head" }, "💬 Chat de proximidade"),
      chatLog,
      h("div", { style: { padding: "12px", borderTop: "1px solid var(--border)", display: "flex", gap: "8px" } }, input,
        h("button", { class: "btn primary", onclick: () => send(input) }, "Enviar")))));

  if (!App.hub) { onlineList.innerHTML = `<div class="faint">Sem conexão com o jogo.</div>`; return; }

  App.hub.off("Snapshot"); App.hub.off("PlayerJoined"); App.hub.off("PlayerLeft"); App.hub.off("Chat"); App.hub.off("Status");
  App.hub.on("Snapshot", (ps) => { online.clear(); ps.forEach((p) => online.set(p.key, p)); drawOnline(); });
  App.hub.on("PlayerJoined", (p) => { online.set(p.key, p); drawOnline(); });
  App.hub.on("PlayerLeft", (k) => { online.delete(k); drawOnline(); });
  App.hub.on("Status", (s) => { online.forEach((p) => { if (p.userId === s.userId) p.status = s.status; }); drawOnline(); });
  App.hub.on("Chat", (m) => {
    log.push(m); if (log.length > 60) log.shift();
    const el = document.getElementById("chat-log");
    if (el) { el.append(chatLine(m)); el.scrollTop = el.scrollHeight; }
  });
  try { await App.hub.invoke("Join", Number(API.uid) || 0, "panel"); } catch {}

  function send(inp) {
    const t = inp.value.trim(); if (!t) return;
    App.hub.invoke("Chat", t).catch(() => {});
    inp.value = "";
  }
}

function drawOnline() {
  const el = document.getElementById("chat-online");
  if (!el) return;
  const seen = new Set();
  const rows = [...online.values()].filter((p) => (seen.has(p.userId) ? false : seen.add(p.userId)))
    .map((p) => h("div", { style: { display: "flex", alignItems: "center", gap: "9px", padding: "7px 0" } },
      avatar({ name: p.name, color: p.color }, "sm"),
      h("span", {}, (p.isBot ? "🤖 " : "") + p.name),
      h("span", { class: "spacer", style: { flex: "1" } }),
      p.status && h("span", { class: "faint", style: { fontSize: "11px" } }, san(p.status))));
  el.replaceChildren(...(rows.length ? rows : [h("div", { class: "faint" }, "Ninguém online.")]));
}

function chatLine(m) {
  return h("div", { style: { display: "flex", gap: "9px", alignItems: "baseline" } },
    h("b", { style: { color: "var(--accent)" } }, m.name), h("span", {}, san(m.text)));
}

function san(s) {
  s = String(s ?? "").replace(/🔴/g, "[rec]").replace(/📅/g, "[reunião]").replace(/☕/g, "[café]");
  return s.replace(/:(like|heart|laugh|coffee):/g, "👍");
}
