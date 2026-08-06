// Estado do chat — global, prédio, sala e PM.
//
// Servido pelo backend e consumido por DOIS clientes (app web e cliente Phaser),
// pela mesma razão da UI de trabalho: um chat que diverge entre a janela do jogo
// e a do navegador não é um chat, são dois. Por isso nada aqui toca em
// `location.origin`, CSS global ou elemento fixo da página.
//
// A divisão é: este módulo guarda o ESTADO (canais, histórico, não lidas) e
// `chat-ui.js` desenha. O socket entra por um `transport` mínimo — `on`/`invoke` —
// que o app web preenche com a conexão dele e o jogo com a da presença.

import { ensureWorkStyles, h } from "./work-core.js";

/**
 * Injeta o CSS do chat (e o de trabalho, de onde vêm os tokens) a partir do
 * backend. Idempotente: o jogo pode chamar a cada abertura da folha.
 */
export function ensureChatStyles(base = "") {
  const root = String(base || "").replace(/\/$/, "");
  ensureWorkStyles(root);
  const href = `${root}/shared/chat-ui.css`;
  if (document.querySelector(`link[data-wq-styles="${href}"]`)) return;
  document.head.append(h("link", { rel: "stylesheet", href, dataset: { wqStyles: href } }));
}

/** Canal de PM entre duas pessoas. Canônico: menor:maior, igual ao servidor. */
export const directChannel = (a, b) => `dm:${Math.min(a, b)}:${Math.max(a, b)}`;

export const channelKind = (channel) => {
  if (channel === "global") return "global";
  if (channel?.startsWith("building:")) return "building";
  if (channel?.startsWith("room:")) return "room";
  if (channel?.startsWith("dm:")) return "dm";
  return "";
};

/**
 * @param options.client        `createWorkClient` de work-core.js (mesma origem do backend)
 * @param options.transport     { on(evento, cb), invoke(metodo, ...args) } — o hub
 * @param options.currentUserId quem sou eu (para "minha mensagem" e para as PMs)
 */
export function createChatStore({ client, transport, currentUserId }) {
  const listeners = new Set();
  // channel -> { messages: [], hasMore, loading, loaded }
  const threads = new Map();
  const unread = new Map();      // channel -> número de não lidas
  const directs = new Map();     // channel -> { userId, name, color, lastText, lastUtc }
  let place = { building: null, buildingName: "", room: null, roomName: "" };
  let selected = "global";
  let disposed = false;

  const emit = () => { for (const listener of listeners) listener(); };

  const thread = (channel) => {
    if (!threads.has(channel)) {
      threads.set(channel, { messages: [], hasMore: false, loading: false, loaded: false });
    }
    return threads.get(channel);
  };

  // ---------- canais visíveis, na ordem em que a tela mostra ----------
  function channels() {
    const list = [
      { id: "global", kind: "global", icon: "🌐", label: "Global", sub: "todo mundo online" },
    ];
    if (place.building) {
      list.push({
        id: place.building, kind: "building", icon: "🏢",
        label: place.buildingName || "Prédio", sub: "quem está neste prédio",
      });
    }
    if (place.room) {
      list.push({
        id: place.room, kind: "room", icon: "🚪",
        label: place.roomName || "Sala", sub: "quem está nesta sala",
      });
    }
    for (const [id, peer] of directs) {
      list.push({
        id, kind: "dm", icon: "✉️", userId: peer.userId,
        label: peer.name, sub: peer.lastText || "conversa privada", color: peer.color,
      });
    }
    return list.map((entry) => ({ ...entry, unread: unread.get(entry.id) || 0 }));
  }

  // ---------- histórico ----------
  async function load(channel, { older = false } = {}) {
    const state = thread(channel);
    if (state.loading) return;
    if (older && !state.hasMore) return;
    state.loading = true;
    emit();
    try {
      const before = older && state.messages.length ? state.messages[0].id : null;
      const query = `channel=${encodeURIComponent(channel)}${before ? `&before=${before}` : ""}`;
      const page = await client.get(`/api/chat/history?${query}`);
      const incoming = page?.messages ?? [];
      // Um socket rápido pode ter entregue a mensagem antes de o histórico
      // chegar: sem deduplicar por id, ela apareceria duas vezes na lista.
      const seen = new Set(state.messages.map((m) => m.id));
      state.messages = older
        ? [...incoming.filter((m) => !seen.has(m.id)), ...state.messages]
        : [...incoming, ...state.messages.filter((m) => !incoming.some((i) => i.id === m.id))];
      state.hasMore = Boolean(page?.hasMore);
      state.loaded = true;
      state.error = null;
    } catch (error) {
      state.error = error.message;
    } finally {
      state.loading = false;
      emit();
    }
  }

  // ---------- leitura ----------
  async function markRead(channel) {
    const state = threads.get(channel);
    const last = state?.messages.at(-1);
    unread.set(channel, 0);
    const peer = directs.get(channel);
    if (peer) peer.unread = 0;
    if (!last) { emit(); return; }
    emit();
    try {
      await client.post("/api/chat/read", { channel, messageId: last.id });
    } catch { /* badge desatualizado é melhor que erro na cara */ }
  }

  // ---------- caixa de entrada (PMs + não lidas) ----------
  async function refreshInbox() {
    const places = channels().filter((c) => c.kind !== "dm").map((c) => c.id);
    try {
      const inbox = await client.get(`/api/chat/inbox?channels=${encodeURIComponent(places.join(","))}`);
      for (const [channel, count] of Object.entries(inbox?.counts ?? {})) {
        if (channel !== selected) unread.set(channel, count);
      }
      for (const direct of inbox?.directs ?? []) {
        directs.set(direct.channel, {
          userId: direct.userId, name: direct.name, color: direct.color,
          lastText: direct.lastText, lastUtc: direct.lastUtc,
        });
        if (direct.channel !== selected) unread.set(direct.channel, direct.unread);
      }
      emit();
    } catch { /* offline: a tela continua com o que tem */ }
  }

  // ---------- socket ----------
  transport?.on?.("ChatMessage", (message) => {
    if (disposed || !message?.channel) return;
    const state = threads.get(message.channel);
    // Só acumula em conversa já carregada: senão o histórico entraria pela
    // metade (as antigas faltando) e o "carregar mais" mentiria.
    if (state?.loaded && !state.messages.some((m) => m.id === message.id)) {
      state.messages.push(message);
      if (state.messages.length > 300) state.messages.splice(0, state.messages.length - 300);
    }
    if (channelKind(message.channel) === "dm") {
      const peerIsMe = message.userId === currentUserId;
      const existing = directs.get(message.channel);
      directs.set(message.channel, {
        userId: peerIsMe ? (existing?.userId ?? peerOf(message.channel)) : message.userId,
        name: peerIsMe ? (existing?.name ?? "Conversa") : message.name,
        color: peerIsMe ? (existing?.color ?? "#7c5cff") : message.color,
        lastText: message.text,
        lastUtc: message.sentUtc,
      });
      // Nome de quem não escreveu ainda só chega pela caixa de entrada.
      if (peerIsMe && !existing) refreshInbox();
    }
    if (message.channel === selected) {
      if (message.userId !== currentUserId) markRead(message.channel);
    } else if (message.userId !== currentUserId) {
      unread.set(message.channel, (unread.get(message.channel) || 0) + 1);
      store.onIncoming?.(message);
    }
    emit();
  });

  // O servidor confirma em que canais esta conexão está ouvindo. É ele quem
  // manda: no jogo o lugar muda sozinho ao trocar de sala.
  transport?.on?.("ChatChannels", (payload) => {
    if (disposed) return;
    place = {
      building: payload?.building || null,
      buildingName: payload?.buildingName || "",
      room: payload?.room || null,
      roomName: payload?.roomName || "",
    };
    // O canal aberto sumiu debaixo dos pés (saiu da sala): volta para o global.
    if (selected !== "global" && channelKind(selected) !== "dm"
        && selected !== place.building && selected !== place.room) {
      store.select("global");
    }
    emit();
    refreshInbox();
  });

  const peerOf = (channel) => {
    const [, a, b] = channel.split(":");
    return Number(a) === currentUserId ? Number(b) : Number(a);
  };

  const store = {
    /** Chamado quando chega mensagem em canal que não está aberto (badge/toast). */
    onIncoming: null,

    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },

    channels,
    selected: () => selected,
    place: () => ({ ...place }),
    thread: (channel = selected) => thread(channel),
    unreadTotal: () => [...unread.values()].reduce((sum, n) => sum + n, 0),

    /** Anuncia (ou muda) o prédio/sala em que esta conexão fala. */
    async setLocation(location) {
      try {
        await transport?.invoke?.("ChatSetLocation", location || null);
      } catch { /* sem hub o chat fica só com o histórico */ }
    },

    async select(channel) {
      selected = channel;
      emit();
      const state = thread(channel);
      if (!state.loaded) await load(channel);
      await markRead(channel);
    },

    loadOlder: () => load(selected, { older: true }),

    /** Abre (criando se preciso) a conversa privada com alguém. */
    async openDirect(user) {
      const channel = directChannel(currentUserId, user.id ?? user.userId);
      if (!directs.has(channel)) {
        directs.set(channel, {
          userId: user.id ?? user.userId, name: user.name,
          color: user.color || "#7c5cff", lastText: "", lastUtc: null,
        });
      }
      await store.select(channel);
      return channel;
    },

    /**
     * Manda no canal aberto. O servidor recusa canal que não é desta conexão —
     * é o mesmo `false` que vira o aviso na tela.
     */
    async send(text) {
      const message = String(text ?? "").trim();
      if (!message) return false;
      try {
        return (await transport?.invoke?.("SendChat", selected, message)) !== false;
      } catch {
        return false;
      }
    },

    refreshInbox,

    /** Prédios e salas com gente agora — é como o app web escolhe onde falar. */
    directory: () => client.get("/api/chat/directory"),

    dispose() {
      disposed = true;
      listeners.clear();
    },
  };

  return store;
}
