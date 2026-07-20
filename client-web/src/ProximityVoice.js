// A/V por proximidade (LiveKit). Uma sala por cena; o cliente ajusta o volume de
// cada participante pela distância entre os avatares (posições vêm da presença).
// Áudio é automático por proximidade; vídeo/tela são sob demanda (botões do HUD).
// Se o LiveKit não estiver no ar, degrada em silêncio — o resto do jogo segue.
import { auth, resolveApiBase } from './auth.js';

const NEAR_PX = 90;    // dentro disso: volume cheio
const FAR_PX = 280;    // além disso: mudo
const APPLY_INTERVAL_MS = 150;

export function createProximityVoice(options = {}) {
  const query = new URLSearchParams(location.search);
  const apiBase = options.apiBase ? String(options.apiBase).replace(/\/$/, '') : resolveApiBase();
  const presence = options.presence;
  const LK = () => window.LivekitClient;

  let room = null;
  let currentScene = '';
  let connecting = false;
  let failed = false;        // última tentativa de conexão falhou (LiveKit inacessível)
  let enabled = true;        // proximidade ligada (recebe áudio); mic é separado
  let lastApply = 0;
  let hud = null;
  let videoStrip = null;

  function uidFromIdentity(identity) {
    const n = parseInt(String(identity).split('-')[0], 10);
    return Number.isFinite(n) ? n : null;
  }

  async function fetchToken(scene) {
    const t = await auth.token();
    const res = await fetch(`${apiBase}/api/av/proximity-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(t ? { Authorization: `Bearer ${t}` } : { 'X-User-Id': String(presence.userId) }),
      },
      body: JSON.stringify({ sceneId: scene }),
    });
    if (!res.ok) throw new Error(`token ${res.status}`);
    return res.json();
  }

  async function connect(scene) {
    if (!LK() || connecting || !enabled) return;
    if (room && currentScene === scene) return;
    if (room) await disconnect();
    connecting = true;
    failed = false;
    updateHud();
    try {
      const info = await fetchToken(scene);
      const r = new (LK().Room)({ adaptiveStream: true, dynacast: true });
      r.on(LK().RoomEvent.TrackSubscribed, onTrackSubscribed);
      r.on(LK().RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
      r.on(LK().RoomEvent.Disconnected, () => { if (room === r) room = null; updateHud(); });
      await r.connect(info.url, info.token);
      room = r;
      currentScene = scene;
    } catch (error) {
      console.warn('Áudio de proximidade indisponível (LiveKit inacessível deste endereço).', error?.message || error);
      room = null;
      failed = true;
    } finally {
      connecting = false;
      updateHud();
    }
  }

  async function disconnect() {
    const r = room; room = null; currentScene = '';
    try { await r?.disconnect(); } catch { /* ignore */ }
    videoStrip && (videoStrip.innerHTML = '');
    updateHud();
  }

  function onTrackSubscribed(track, _pub, participant) {
    if (track.kind === 'audio') {
      const el = track.attach();          // LiveKit toca sozinho; volume é por-participante
      el.dataset.identity = participant.identity;
      el.style.display = 'none';
      document.body.append(el);
      return;
    }
    // vídeo / tela → tile no canto
    ensureVideoStrip();
    const el = track.attach();
    el.className = 'pv-tile';
    el.dataset.identity = participant.identity;
    videoStrip.append(el);
  }

  function onTrackUnsubscribed(track) {
    track.detach().forEach((el) => el.remove());
  }

  // volume de cada participante pela distância entre os avatares
  function applyProximity() {
    if (!room || !presence) return;
    const now = performance.now();
    if (now - lastApply < APPLY_INTERVAL_MS) return;
    lastApply = now;
    const me = presence.localPosition();
    if (!me) return;
    const byUid = new Map(presence.peersInScene().map((p) => [p.userId, p]));
    room.remoteParticipants.forEach((participant) => {
      const peer = byUid.get(uidFromIdentity(participant.identity));
      let volume = 0;
      if (peer) {
        const d = Math.hypot(peer.x - me.x, peer.y - me.y);
        volume = d <= NEAR_PX ? 1 : d >= FAR_PX ? 0 : 1 - (d - NEAR_PX) / (FAR_PX - NEAR_PX);
      }
      try { participant.setVolume(volume); } catch { /* participante sem áudio ainda */ }
    });
  }

  // ---- HUD ----
  function ensureVideoStrip() {
    if (videoStrip) return;
    videoStrip = document.createElement('div');
    videoStrip.id = 'pv-strip';
    document.body.append(videoStrip);
    injectStyles();
  }

  function ensureHud() {
    if (hud) return;
    injectStyles();
    hud = document.createElement('div');
    hud.id = 'pv-hud';
    document.body.append(hud);
    updateHud();
  }

  function btn(label, on, onClick) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = 'pv-btn' + (on ? ' on' : '');
    b.onclick = onClick;
    return b;
  }

  function updateHud() {
    if (!hud) return;
    hud.innerHTML = '';
    const lp = room?.localParticipant;
    const connected = !!room;
    const status = document.createElement('span');
    status.className = 'pv-status';
    status.textContent = connected ? '🟢 voz de proximidade'
      : connecting ? '⏳ conectando…'
      : failed ? '🔇 voz indisponível'
      : enabled ? '⏳ conectando…'
      : '🔇 voz desligada';
    if (failed && !connected) status.title = 'O LiveKit não está acessível deste endereço (ex.: via túnel https). Funciona abrindo o jogo local em http://localhost:8080.';
    hud.append(status);
    if (connected && lp) {
      hud.append(
        btn(lp.isMicrophoneEnabled ? '🎤 mic on' : '🎤 mic', lp.isMicrophoneEnabled, async () => {
          try { await lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled); } catch { /* sem permissão */ }
          updateHud();
        }),
        btn(lp.isCameraEnabled ? '📷 câmera on' : '📷 câmera', lp.isCameraEnabled, async () => {
          try { await lp.setCameraEnabled(!lp.isCameraEnabled); } catch { /* sem permissão */ }
          updateHud();
        }),
        btn(lp.isScreenShareEnabled ? '🖥️ parar tela' : '🖥️ tela', lp.isScreenShareEnabled, async () => {
          try { await lp.setScreenShareEnabled(!lp.isScreenShareEnabled); } catch { /* cancelado */ }
          updateHud();
        }),
      );
    }
    hud.append(btn(enabled ? '✖ sair da voz' : '🔊 entrar na voz', false, async () => {
      enabled = !enabled;
      if (enabled) await connect(currentScene || presence.currentScene());
      else await disconnect();
      updateHud();
    }));
  }

  function injectStyles() {
    if (document.getElementById('pv-styles')) return;
    const s = document.createElement('style');
    s.id = 'pv-styles';
    s.textContent = `
      #pv-hud{position:fixed;left:12px;bottom:12px;display:flex;gap:6px;align-items:center;
        background:rgba(20,22,30,.82);padding:6px 8px;border-radius:10px;z-index:50;font:12px system-ui}
      #pv-hud .pv-status{color:#cbd5e1;margin-right:4px}
      .pv-btn{background:#2b2f3a;color:#e5e7eb;border:0;border-radius:7px;padding:5px 8px;cursor:pointer}
      .pv-btn.on{background:#7c5cff;color:#fff}
      #pv-strip{position:fixed;right:12px;top:12px;display:flex;flex-direction:column;gap:6px;z-index:50}
      .pv-tile{width:180px;height:108px;object-fit:cover;border-radius:8px;background:#000}`;
    document.head.append(s);
  }

  return {
    async initialize() { ensureHud(); },
    // chamado no create() de cada cena
    attachScene(sceneId) {
      ensureHud();
      if (enabled) connect(sceneId);
    },
    update() { applyProximity(); },
    async shutdown() { await disconnect(); },
  };
}
