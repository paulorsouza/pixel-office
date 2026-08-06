// Chat do jogo — a folha do HUD.
//
// Vale aqui a mesma regra do kanban: a TELA não é reimplementada. Ela vem de
// `backend/.../wwwroot/shared/chat-*`, a mesma que o app web abre, e este
// arquivo é só a hospedagem — folha do chassi, tema escuro, botão no dock com o
// contador de não lidas, e o repasse de "onde o avatar está" para o servidor.
//
// O socket também é o que já existe: o transporte sai do `PresenceSystem`, e não
// de uma segunda conexão SignalR só para conversar.

import { createSheet } from './Sheet.js';

let modulesPromise = null;

async function loadModules(apiBase) {
  modulesPromise ??= (async () => {
    const base = String(apiBase || '').replace(/\/$/, '');
    const [core, ui] = await Promise.all([
      import(`${base}/shared/chat-core.js`),
      import(`${base}/shared/chat-ui.js`),
    ]);
    core.ensureChatStyles(base);
    return { core, ui, base };
  })();
  return modulesPromise;
}

/**
 * @param options.shell     chassi da HUD (a folha se registra nele)
 * @param options.presence  dono da conexão do hub (`chatTransport`)
 * @param options.apiBase   origem do backend (em dev o jogo está em outra porta)
 * @param options.token     função que devolve o JWT atual
 * @param options.userId    identidade de fallback quando não há token
 * @param options.onToast   aviso curto no mundo (PM que chega com a folha fechada)
 */
export function createChatPanel({ shell, presence, apiBase, token, userId, onToast = () => {} }) {
  let store = null;
  let ui = null;
  let ready = null;
  // Último lugar enviado. O jogo chama `setPlace` a cada quadro; sem esta
  // comparação seriam 60 invocações por segundo dizendo a mesma coisa.
  let placeKey = '';

  let mounted = null;   // promessa da montagem em curso (abrir é assíncrono)

  const sheet = createSheet(shell, {
    id: 'hud-chat',
    title: 'Chat',
    subtitle: 'Global, prédio, sala e conversas privadas',
    onOpen: (body) => { mounted = mount(body); },
  });

  async function ensureStore() {
    ready ??= (async () => {
      const modules = await loadModules(apiBase);
      const { createWorkClient } = await import(`${modules.base}/shared/work-core.js`);
      const client = createWorkClient({ base: modules.base, token, userId });
      store = modules.core.createChatStore({
        client,
        transport: presence.chatTransport,
        currentUserId: Number(userId) || 0,
      });
      // Mensagem em canal fechado: o badge conta sempre; o toast é só da PM,
      // que é dirigida a você — o global tocando o tempo todo viraria ruído.
      store.onIncoming = (message) => {
        if (String(message.channel).startsWith('dm:')) onToast(`✉️ ${message.name}: ${message.text}`);
      };
      await store.select('global');
      await store.refreshInbox();
      return { modules, client };
    })();
    return ready;
  }

  async function mount(body) {
    // Fechar a folha não desmonta: a conversa aberta, a rolagem e o rascunho
    // continuam onde estavam quando a pessoa volta.
    if (ui && body.contains(ui.element)) return;
    const { modules, client } = await ensureStore();
    if (!sheet.isOpen()) return;
    ui?.destroy();
    ui = modules.ui.mountChat(body, {
      store,
      client,
      currentUserId: Number(userId) || 0,
      // No jogo quem manda no prédio/sala é o avatar: um seletor aqui diria
      // que dá para conversar numa sala em que a pessoa não está.
      canPickPlace: false,
      theme: 'dark',
    });
  }

  return {
    id: 'chat',
    sheet,
    isOpen: () => sheet.isOpen(),
    toggle: () => sheet.toggle(),
    open: () => sheet.open(),
    close: () => sheet.close(),
    unread: () => store?.unreadTotal() ?? 0,

    /**
     * Onde o avatar está agora. Chamado a cada quadro; só vai à rede quando muda.
     * `roomId` nulo é legítimo: corredor e rua têm prédio, mas não têm sala.
     */
    setPlace({ buildingId, buildingName, sceneId, roomId, roomName } = {}) {
      const key = `${buildingId || ''}|${sceneId || ''}|${roomId || ''}`;
      if (key === placeKey) return;
      placeKey = key;
      ensureStore().then(() => store.setLocation(
        buildingId ? { buildingId, buildingName, sceneId, roomId, roomName } : null,
      )).catch(() => {});
    },

    /** Abre a PM com um avatar do mundo. */
    async openDirect(user) {
      sheet.open();
      await mounted;
      await ui?.openDirect(user);
    },

    destroy() {
      ui?.destroy();
      store?.dispose();
      sheet.destroy();
    },
  };
}
