// A/V por proximidade (LiveKit). Uma sala por cena; o cliente ajusta o volume de
// cada participante pela distância entre os avatares (posições vêm da presença).
// Áudio é automático por proximidade; vídeo/tela são sob demanda.
// A interface (barra estilo Meet, grade, modos de layout) vive em MeetingHUD.js;
// este módulo cuida da sala LiveKit e alimenta o HUD com estado e tracks.
// Se o LiveKit não estiver no ar, degrada em silêncio — o resto do jogo segue.
import { auth, resolveApiBase } from './auth.js';
import { createMeetingHUD } from './MeetingHUD.js';

const NEAR_PX = 90;    // dentro disso: volume cheio
const FAR_PX = 280;    // além disso: mudo
const APPLY_INTERVAL_MS = 150;

export function createProximityVoice(options = {}) {
  const apiBase = options.apiBase ? String(options.apiBase).replace(/\/$/, '') : resolveApiBase();
  const presence = options.presence;
  const LK = () => window.LivekitClient;

  let room = null;
  let currentScene = '';
  let connecting = false;
  let failed = false;        // última tentativa de conexão falhou (LiveKit inacessível)
  let enabled = true;        // proximidade ligada (recebe áudio); mic é separado
  let startedAt = 0;
  let lastApply = 0;
  let micHintShown = false;
  let audioBlockedShown = false;

  const hud = createMeetingHUD({
    onToggleMic: () => toggleLocal('microphone'),
    onToggleCamera: () => toggleLocal('camera'),
    onToggleScreen: () => toggleLocal('screen'),
    onJoin: async () => {
      enabled = true;
      failed = false;
      await connect(currentScene || presence.currentScene());
    },
    onLeave: async () => { enabled = false; await disconnect(); },
    listDevices: (kind) => LK()?.Room.getLocalDevices(kind, kind !== 'audiooutput') ?? [],
    activeDevice: (kind) => room?.getActiveDevice?.(kind) || '',
    switchDevice: async (kind, deviceId) => {
      try { await room?.switchActiveDevice(kind, deviceId); }
      catch { hud.toast('Não consegui trocar o dispositivo', { tone: 'error' }); }
      refresh();
    },
  });

  function uidFromIdentity(identity) {
    const n = parseInt(String(identity).split('-')[0], 10);
    return Number.isFinite(n) ? n : null;
  }

  function localName() {
    return auth.name() || 'Você';
  }

  function sceneDisplayName() {
    return document.querySelector('#scene-name')?.textContent || currentScene || '';
  }

  async function toggleLocal(kind) {
    const lp = room?.localParticipant;
    if (!lp) return;
    try {
      if (kind === 'microphone') await lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled);
      else if (kind === 'camera') await lp.setCameraEnabled(!lp.isCameraEnabled);
      else await lp.setScreenShareEnabled(!lp.isScreenShareEnabled);
    } catch {
      if (kind !== 'screen') { // cancelar o picker de tela não é erro
        const device = kind === 'microphone' ? 'o microfone' : 'a câmera';
        hud.toast(`Sem permissão para usar ${device} — verifique o navegador`, { tone: 'error' });
      }
    }
    refresh();
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
    if (!LK() || connecting || !enabled || !scene) { refresh(); return; }
    if (room && currentScene === scene) return;
    if (room) await disconnect();
    connecting = true;
    failed = false;
    refresh();
    try {
      const info = await fetchToken(scene);
      const events = LK().RoomEvent;
      const r = new (LK().Room)({ adaptiveStream: true, dynacast: true });
      r.on(events.TrackSubscribed, onTrackSubscribed);
      r.on(events.TrackUnsubscribed, onTrackUnsubscribed);
      r.on(events.LocalTrackPublished, onLocalTrackPublished);
      r.on(events.LocalTrackUnpublished, onLocalTrackUnpublished);
      r.on(events.ParticipantConnected, refresh);
      r.on(events.ParticipantDisconnected, refresh);
      r.on(events.TrackMuted, refresh);
      r.on(events.TrackUnmuted, refresh);
      r.on(events.ActiveSpeakersChanged, (speakers) => {
        hud.setSpeaking(new Set((speakers || []).map((s) => s.identity)));
      });
      r.on(events.AudioPlaybackStatusChanged, () => maybeOfferAudioStart(r));
      r.on(events.Reconnecting, () => { connecting = true; refresh(); });
      r.on(events.Reconnected, () => { connecting = false; refresh(); });
      r.on(events.Disconnected, () => {
        if (room === r) { room = null; startedAt = 0; cleanupMedia(); }
        refresh();
      });
      await r.connect(info.url, info.token);
      room = r;
      currentScene = scene;
      startedAt = Date.now();
      maybeOfferAudioStart(r);
      if (!micHintShown) {
        micHintShown = true;
        hud.toast('Você entrou na voz por proximidade — o microfone começa desligado', {
          actionLabel: 'Ligar mic', onAction: () => toggleLocal('microphone'), duration: 6000,
        });
      }
    } catch (error) {
      console.warn('Áudio de proximidade indisponível (LiveKit inacessível deste endereço).', error?.message || error);
      room = null;
      failed = true;
    } finally {
      connecting = false;
      refresh();
    }
  }

  async function disconnect() {
    const r = room; room = null; currentScene = ''; startedAt = 0;
    try { await r?.disconnect(); } catch { /* ignore */ }
    cleanupMedia();
    refresh();
  }

  function cleanupMedia() {
    hud.clearMedia();
    hud.setSpeaking(new Set());
    document.querySelectorAll('audio[data-identity]').forEach((el) => el.remove());
  }

  // navegadores bloqueiam autoplay de áudio sem gesto; o LiveKit avisa e a gente
  // oferece um clique para liberar
  function maybeOfferAudioStart(r) {
    if (r.canPlaybackAudio || audioBlockedShown) return;
    audioBlockedShown = true;
    hud.toast('O navegador bloqueou o áudio da reunião', {
      tone: 'error', duration: 15000,
      actionLabel: 'Ativar áudio',
      onAction: () => { r.startAudio().catch(() => {}); audioBlockedShown = false; },
    });
  }

  // ---- tracks ----

  function sourceOf(pub) {
    const src = pub?.source;
    const S = LK().Track.Source;
    return src === S.ScreenShare ? 'screen' : 'camera';
  }

  function onTrackSubscribed(track, pub, participant) {
    if (track.kind === 'audio') {
      const el = track.attach();          // LiveKit toca sozinho; volume é por-participante
      el.dataset.identity = participant.identity;
      el.style.display = 'none';
      document.body.append(el);
    } else {
      const source = sourceOf(pub);
      hud.addTrack(participant.identity, source, track.attach());
      if (source === 'screen' && hud.getMode() === 'game') {
        hud.toast(`${participant.name || 'Alguém'} está apresentando a tela`, {
          actionLabel: 'Ver', onAction: () => hud.setMode('split'),
        });
      }
    }
    refresh();
  }

  function onTrackUnsubscribed(track, pub, participant) {
    const source = sourceOf(pub);
    track.detach().forEach((el) => {
      if (track.kind !== 'audio') hud.removeTrack(participant.identity, source, el);
      el.remove();
    });
    refresh();
  }

  function onLocalTrackPublished(pub) {
    const track = pub?.track;
    if (!track || track.kind === 'audio' || !room) return;   // o próprio mic nunca é anexado
    hud.addTrack(room.localParticipant.identity, sourceOf(pub), track.attach());
    refresh();
  }

  function onLocalTrackUnpublished(pub) {
    const track = pub?.track;
    if (!track || track.kind === 'audio' || !room) return;
    const source = sourceOf(pub);
    track.detach().forEach((el) => {
      hud.removeTrack(room.localParticipant.identity, source, el);
      el.remove();
    });
    refresh();
  }

  // ---- estado → HUD ----

  function roster() {
    if (!room) return [];
    const lp = room.localParticipant;
    const list = [{
      identity: lp.identity,
      name: localName(),
      isLocal: true,
      micOn: lp.isMicrophoneEnabled,
      camOn: lp.isCameraEnabled,
    }];
    const namesByUid = new Map(presence.peersInScene().map((p) => [p.userId, p.name]));
    room.remoteParticipants.forEach((p) => {
      const uid = uidFromIdentity(p.identity);
      list.push({
        identity: p.identity,
        name: p.name || namesByUid.get(uid) || `Colega ${uid ?? '?'}`,
        isLocal: false,
        micOn: p.isMicrophoneEnabled,
        camOn: p.isCameraEnabled,
      });
    });
    return list;
  }

  // quem está na cena mas fora da voz (aparece no painel de pessoas)
  function bystanders() {
    const inVoice = new Set();
    room?.remoteParticipants.forEach((p) => {
      const uid = uidFromIdentity(p.identity);
      if (uid != null) inVoice.add(uid);
    });
    return presence.peersInScene().filter((p) => !inVoice.has(p.userId));
  }

  function refresh() {
    const lp = room?.localParticipant;
    hud.setSession({
      status: room ? (connecting ? 'connecting' : 'connected')
        : connecting ? 'connecting'
        : failed ? 'failed'
        : enabled && currentScene ? 'connecting'
        : 'off',
      micOn: Boolean(lp?.isMicrophoneEnabled),
      camOn: Boolean(lp?.isCameraEnabled),
      screenOn: Boolean(lp?.isScreenShareEnabled),
      startedAt,
      sceneName: sceneDisplayName(),
    });
    hud.syncParticipants(roster(), bystanders());
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
      hud.setProximity(participant.identity, volume);
    });
  }

  return {
    async initialize() {
      hud.initialize();
      refresh();
      // pessoas entrando/saindo da cena atualizam o painel mesmo sem evento LiveKit
      presence?.events?.addEventListener('change', refresh);
    },
    // chamado no create() de cada cena
    attachScene(sceneId) {
      if (enabled) connect(sceneId);
      else { currentScene = sceneId; refresh(); }
    },
    update() { applyProximity(); },
    async shutdown() { await disconnect(); },
  };
}
