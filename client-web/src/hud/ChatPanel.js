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
 */
export function createChatPanel({ shell, presence, apiBase, token, userId }) {
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
    // O mundo continua respondendo com o chat aberto: conversa é coisa que se
    // acompanha andando. Quem tira o teclado do jogo é o foco do campo, não a
    // folha — e disso cuida o `KeyboardGuard`.
    blocking: false,
    onOpen: (body) => {
      mounted = mount(body);
      store?.setVisible(true);
    },
  });

  // Fechar pelo × ou pelo Esc não passa por nenhum gancho da folha: o estado de
  // "à vista" é observado, e não avisado. Sem isto, a folha fechada continuaria
  // marcando tudo como lido e nenhuma notificação apareceria.
  let wasOpen = false;
  const syncVisibility = () => {
    const open = sheet.isOpen();
    if (open === wasOpen) return;
    wasOpen = open;
    store?.setVisible(open);
    if (!open) ui?.blur();
  };

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
      // Mensagem que não está à vista vira cartão no canto — clicar nele abre o
      // chat já no canal certo. O badge do dock conta em paralelo.
      store.onIncoming = (message) => notify(message);
      store.onAnyMessage = (message) => panel.onMessage?.(message);
      await store.select('global');
      await store.refreshInbox();
      // A folha nasce fechada: o estado tem de começar coerente, senão a primeira
      // mensagem seria comida pelo "canal selecionado" antes de qualquer aviso.
      store.setVisible(sheet.isOpen());
      return { modules, client };
    })();
    return ready;
  }

  // ---------------------------------------------------- aviso no canto
  // Um toast comum não serve: ele conta o que aconteceu e some. Aqui o aviso é o
  // caminho de volta — tocar nele abre o chat NO CANAL da mensagem, que é o que
  // a pessoa quer fazer ao ver "fulano falou".
  const NOTICE_MS = 7000;
  const NOTICE_MAX = 3;
  let noticeHost = null;

  function ensureNoticeHost() {
    if (noticeHost?.isConnected) return noticeHost;
    noticeHost = document.createElement('div');
    noticeHost.id = 'hud-chat-notices';
    noticeHost.setAttribute('role', 'status');
    noticeHost.setAttribute('aria-live', 'polite');
    document.body.append(noticeHost);
    return noticeHost;
  }

  const initials = (name) => {
    const parts = String(name ?? '?').trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  };

  function notify(message) {
    // Com a folha aberta o cartão seria redundante (a barra lateral já marca o
    // canal), e no celular ela é tela cheia — o aviso nasceria escondido.
    if (sheet.isOpen()) return;
    const host = ensureNoticeHost();
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'hud-chat-notice';
    const direct = String(message.channel).startsWith('dm:');
    card.innerHTML = '<i></i><span><b></b><small></small></span>';
    const avatar = card.querySelector('i');
    avatar.textContent = direct ? '✉' : initials(message.name);
    avatar.style.background = message.color || '#7c5cff';
    card.querySelector('b').textContent = direct ? `${message.name} · privado` : message.name;
    card.querySelector('small').textContent = message.text;
    card.setAttribute('aria-label', `${message.name}: ${message.text}. Abrir o chat.`);

    const dismiss = () => { card.classList.add('bye'); setTimeout(() => card.remove(), 220); };
    card.onclick = () => {
      dismiss();
      panel.openAt(message.channel);
    };
    host.append(card);
    while (host.childElementCount > NOTICE_MAX) host.firstElementChild.remove();
    setTimeout(dismiss, NOTICE_MS);
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

  const panel = {
    id: 'chat',
    sheet,

    /** Repassado a cada mensagem que chega, para o balão sobre a cabeça. */
    onMessage: null,

    isOpen: () => sheet.isOpen(),
    toggle: () => { sheet.toggle(); syncVisibility(); },
    open: () => { sheet.open(); syncVisibility(); },
    close: () => { sheet.close(); syncVisibility(); },
    unread: () => store?.unreadTotal() ?? 0,

    /** Chamado todo quadro pelo jogo: o Esc e o × fecham por fora daqui. */
    refresh: syncVisibility,

    /** O cursor está no campo de mensagem? */
    isTyping: () => Boolean(ui?.isTyping?.()),

    /** Devolve o teclado ao mundo sem fechar a conversa. */
    blur: () => ui?.blur?.(),

    /** Abre a folha com o cursor já no campo — é o que a tecla Enter faz. */
    async focus() {
      panel.open();
      await mounted;
      ui?.focus();
    },

    /** Abre a folha num canal específico (o cartão de aviso usa). */
    async openAt(channel) {
      panel.open();
      await mounted;
      await store?.select(channel);
      ui?.focus();
    },

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
      noticeHost?.remove();
      noticeHost = null;
    },
  };

  return panel;
}
