// Presença em rede dos avatares no mundo Phaser.
// Uma conexão SignalR persistente (independente da de mobília): recebe posições
// dos outros jogadores e desenha avatares remotos interpolados na cena atual.
// A isolação por cena é feita no cliente (render só de quem está na mesma cena),
// para não afetar a lista de "online" do app web, que usa a presença global.
import { auth, resolveApiBase } from './auth.js';

const MOVE_INTERVAL_MS = 100;   // frequência máxima de envio da própria posição
const MOVING_TIMEOUT_MS = 220;  // sem update recente ⇒ avatar remoto entra em idle

export function createPresence(options = {}) {
  const query = new URLSearchParams(location.search);
  const apiBase = options.apiBase ? String(options.apiBase).replace(/\/$/, '') : resolveApiBase();
  const userId = Number(options.userId || auth.userId() || query.get('userId') || query.get('user') || 1);

  const events = new EventTarget();
  const remotes = new Map(); // key -> { userId, name, color, scene, x, y, tx, ty, dir, lastMoveAt, sprite, label }
  let connection = null;
  let selfKey = null;

  let scene = null;          // Phaser.Scene atual
  let sceneId = '';
  let localPlayer = null;

  let lastSentAt = 0;
  let lastSent = { x: null, y: null, dir: null };
  let lastZone = '';

  const emit = (type, detail = {}) => events.dispatchEvent(new CustomEvent(type, { detail }));

  function upsert(state) {
    if (!state || state.key === selfKey) return;
    const existing = remotes.get(state.key);
    const rec = existing || {
      key: state.key, tx: state.x, ty: state.y, sprite: null, label: null, lastMoveAt: 0,
    };
    rec.userId = state.userId;
    rec.name = state.name || '';
    rec.color = state.color || '#7c5cff';
    rec.scene = state.scene || '';
    rec.x = existing ? rec.x : state.x;
    rec.y = existing ? rec.y : state.y;
    rec.tx = state.x;
    rec.ty = state.y;
    rec.dir = state.dir || rec.dir || 'down';
    remotes.set(state.key, rec);
    ensureSprite(rec);
    emit('change');
  }

  function remove(key) {
    const rec = remotes.get(key);
    if (rec) { destroySprite(rec); remotes.delete(key); emit('change'); }
  }

  // ---- sprites (só para quem está na cena atual) ----
  function ensureSprite(rec) {
    if (!scene || !localPlayer) return;
    const visible = rec.scene === sceneId;
    if (visible && !rec.sprite) {
      rec.sprite = scene.physics
        ? scene.add.sprite(rec.x, rec.y, 'adam_idle', 18)
        : null;
      if (rec.sprite) {
        rec.sprite.setOrigin(0.5, 0.5);
        rec.label = scene.add.text(rec.x, rec.y - 22, rec.name, {
          fontSize: '9px', fontFamily: 'monospace', color: '#fff',
          backgroundColor: rec.color, padding: { x: 3, y: 1 },
        }).setOrigin(0.5, 1).setDepth(1e6);
      }
    } else if (!visible && rec.sprite) {
      destroySprite(rec);
    }
  }

  function destroySprite(rec) {
    rec.sprite?.destroy(); rec.sprite = null;
    rec.label?.destroy(); rec.label = null;
  }

  // ---- conexão ----
  async function connect() {
    if (!window.signalR || connection) return;
    connection = new window.signalR.HubConnectionBuilder()
      .withUrl(`${apiBase}/hub/office`, { withCredentials: false, accessTokenFactory: () => auth.token() })
      .withAutomaticReconnect()
      .build();

    connection.on('Snapshot', (players) => { (players || []).forEach(upsert); });
    connection.on('PlayerJoined', upsert);
    connection.on('PlayerLeft', remove);
    connection.on('PlayerMoved', ({ key, x, y, dir }) => {
      const rec = remotes.get(key);
      if (!rec) return;
      rec.tx = x; rec.ty = y; rec.dir = dir || rec.dir; rec.lastMoveAt = performance.now();
    });
    connection.on('PlayerScene', ({ key, scene: s }) => {
      const rec = remotes.get(key);
      if (!rec) return;
      rec.scene = s || '';
      ensureSprite(rec);
      emit('change');
    });
    // xadrez: repassa os eventos do hub para quem escutar (a mecânica de xadrez)
    for (const name of ['ChessState', 'ChessMoved', 'ChessSeats', 'ChessReset']) {
      connection.on(name, (payload) => emit(name, payload));
    }

    try {
      await connection.start();
      selfKey = connection.connectionId;
      await connection.invoke('Join', userId).catch(() => {});
      if (sceneId) await connection.invoke('SetScene', sceneId).catch(() => {});
    } catch (error) {
      console.warn('Presença em rede indisponível; jogo segue offline.', error);
      connection = null;
    }
  }

  return {
    events,
    userId,
    async initialize() { await connect(); },

    // chamado no create() de cada cena
    attach(phaserScene, currentSceneId, playerSprite) {
      scene = phaserScene;
      sceneId = currentSceneId;
      localPlayer = playerSprite;
      lastSent = { x: null, y: null, dir: null };
      // recria os sprites remotos desta cena (a cena anterior foi destruída)
      for (const rec of remotes.values()) { rec.sprite = null; rec.label = null; ensureSprite(rec); }
      if (connection && selfKey) connection.invoke('SetScene', sceneId).catch(() => {});
    },

    detach() {
      for (const rec of remotes.values()) { rec.sprite = null; rec.label = null; }
      scene = null; localPlayer = null;
    },

    // enviado a cada frame; o módulo faz o throttle
    updateLocal(x, y, dir) {
      if (!connection || selfKey == null) return;
      const now = performance.now();
      const moved = lastSent.x === null
        || Math.abs(x - lastSent.x) > 1 || Math.abs(y - lastSent.y) > 1 || dir !== lastSent.dir;
      if (!moved || now - lastSentAt < MOVE_INTERVAL_MS) return;
      lastSentAt = now;
      lastSent = { x, y, dir };
      connection.invoke('Move', x, y, dir).catch(() => {});
    },

    // interpolação + animação dos avatares remotos
    interpolate(delta) {
      if (!scene) return;
      const now = performance.now();
      const t = Math.min(1, delta / 80);
      for (const rec of remotes.values()) {
        if (!rec.sprite) continue;
        rec.x += (rec.tx - rec.x) * t;
        rec.y += (rec.ty - rec.y) * t;
        rec.sprite.setPosition(rec.x, rec.y);
        rec.sprite.setDepth(rec.y + 16);
        const moving = now - rec.lastMoveAt < MOVING_TIMEOUT_MS;
        const anim = `${moving ? 'run' : 'idle'}-${rec.dir}`;
        if (scene.anims.exists(anim)) rec.sprite.anims.play(anim, true);
        rec.label?.setPosition(rec.x, rec.y - 22);
        rec.label?.setDepth(1e6);
      }
    },

    // ---- xadrez em rede (usa a mesma conexão do hub) ----
    chessJoin(boardId) { connection?.invoke('JoinChess', boardId).catch(() => {}); },
    chessMove(boardId, from, to, promo) { connection?.invoke('ChessMove', boardId, from, to, promo || null).catch(() => {}); },
    chessReset(boardId) { connection?.invoke('ChessReset', boardId).catch(() => {}); },
    chessLeave(boardId) { connection?.invoke('LeaveChess', boardId).catch(() => {}); },

    // zona atual (ex.: 'meeting' inicia o lançamento de horas de reunião no backend)
    setZone(zone) {
      const z = zone || '';
      if (!connection || selfKey == null || z === lastZone) return;
      lastZone = z;
      connection.invoke('SetZone', z).catch(() => {});
    },

    // para a camada de A/V: quem está na mesma cena e onde
    peersInScene() {
      const out = [];
      for (const rec of remotes.values()) {
        if (rec.scene === sceneId) out.push({ key: rec.key, userId: rec.userId, name: rec.name, x: rec.x, y: rec.y });
      }
      return out;
    },
    localPosition() { return localPlayer ? { x: localPlayer.x, y: localPlayer.y } : null; },
    currentScene() { return sceneId; },
  };
}
