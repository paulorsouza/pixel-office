import { API, h, avatar, toast } from "./api.js";
import { App } from "./main.js";

let room = null, wanted = false;

export async function renderMeeting(view) {
  view.innerHTML = "";
  const tiles = h("div", { id: "mtiles", style: { display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "16px" } });
  const controls = h("div", { id: "mctl", style: { display: "flex", gap: "8px", flexWrap: "wrap" } });
  const status = h("div", { class: "muted", id: "mstatus" }, "Você entra na sala de reunião do escritório — os que estão no jogo também aparecem aqui.");

  view.append(
    h("div", { class: "panel panel-pad" },
      h("div", { style: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" } },
        h("div", { style: { fontSize: "17px", fontWeight: "700" } }, "🎧 Sala de reunião"),
        h("span", { class: "spacer", style: { flex: "1" } }),
        h("button", { class: "btn primary", id: "mjoin", onclick: toggle }, "Entrar na reunião")),
      status, controls, tiles));

  // sai da reunião ao trocar de página
  window.addEventListener("hashchange", cleanup, { once: true });
}

async function toggle() {
  if (room) return leave();
  await join();
}

async function join() {
  wanted = true;
  document.getElementById("mstatus").textContent = "Conectando…";
  try {
    await App.hub?.invoke("SetZone", "meeting"); // entra na sala (conta como reunião)
    const info = await API.post("/api/av/token");
    room = new LivekitClient.Room({ adaptiveStream: true, dynacast: true });
    room.on("trackSubscribed", (track, pub, p) => addTile(track, pub, p));
    room.on("trackUnsubscribed", (track) => track.detach().forEach((el) => el.closest(".mtile")?.remove()));
    room.on("participantDisconnected", (p) => document.querySelectorAll(`[data-p="${p.sid}"]`).forEach((t) => t.remove()));
    room.on("localTrackPublished", (pub) => { if (pub.track?.kind === "video") addTile(pub.track, pub, room.localParticipant, true); renderControls(); });
    room.on("localTrackUnpublished", (pub) => { pub.track?.detach().forEach((el) => el.closest(".mtile")?.remove()); renderControls(); });
    room.on("disconnected", () => { cleanup(); });
    await room.connect(info.url, info.token);
    document.getElementById("mstatus").textContent = "Conectado — ligue o microfone para falar.";
    document.getElementById("mjoin").textContent = "Sair da reunião";
    document.getElementById("mjoin").classList.remove("primary");
    document.getElementById("mjoin").classList.add("danger");
    renderControls();
  } catch (e) {
    toast("Falha ao entrar: " + e.message);
    document.getElementById("mstatus").textContent = "Não foi possível conectar (o LiveKit está rodando?).";
    wanted = false;
  }
}

async function leave() {
  wanted = false;
  try { await room?.disconnect(); } catch {}
  try { await App.hub?.invoke("SetZone", ""); } catch {}
  cleanup();
}

function cleanup() {
  room = null;
  const j = document.getElementById("mjoin");
  if (j) { j.textContent = "Entrar na reunião"; j.classList.add("primary"); j.classList.remove("danger"); }
  const c = document.getElementById("mctl"); if (c) c.innerHTML = "";
  const t = document.getElementById("mtiles"); if (t) t.innerHTML = "";
  const s = document.getElementById("mstatus"); if (s) s.textContent = "Você saiu da reunião.";
}

function renderControls() {
  const c = document.getElementById("mctl");
  if (!c || !room) return;
  const lp = room.localParticipant;
  const btn = (label, on, fn) => h("button", { class: on ? "btn primary" : "btn", onclick: fn }, label);
  c.replaceChildren(
    btn(lp.isMicrophoneEnabled ? "🎤 Mic ligado" : "🎤 Mic", lp.isMicrophoneEnabled, async () => { try { await lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled); } catch (e) { toast("Sem acesso ao mic"); } renderControls(); }),
    btn(lp.isCameraEnabled ? "📷 Câmera ligada" : "📷 Câmera", lp.isCameraEnabled, async () => { try { await lp.setCameraEnabled(!lp.isCameraEnabled); } catch { toast("Sem acesso à câmera"); } renderControls(); }),
    btn(lp.isScreenShareEnabled ? "🖥️ Parar tela" : "🖥️ Compartilhar tela", lp.isScreenShareEnabled, async () => { try { await lp.setScreenShareEnabled(!lp.isScreenShareEnabled); } catch { toast("Compartilhamento cancelado"); } renderControls(); }));
}

function addTile(track, pub, participant, isLocal) {
  if (track.kind === "audio") { document.body.append(track.attach()); return; }
  const tiles = document.getElementById("mtiles");
  if (!tiles) return;
  const video = track.attach();
  Object.assign(video.style, { width: "220px", height: "132px", objectFit: "cover", borderRadius: "10px", background: "#000", display: "block" });
  const tile = h("div", { class: "mtile", dataset: { p: participant.sid }, style: { position: "relative" } },
    video, h("span", { class: "badge", style: { position: "absolute", left: "8px", bottom: "8px", background: "rgba(0,0,0,.6)", color: "#fff" } },
      (isLocal ? "Você" : (participant.name || participant.identity)) + (pub.source === LivekitClient.Track.Source.ScreenShare ? " · tela" : "")));
  tiles.append(tile);
}
