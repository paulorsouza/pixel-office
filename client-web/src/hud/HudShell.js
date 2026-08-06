// Chassi da HUD do jogo.
//
// Existe por um motivo só: antes, "tem painel na frente?" era uma lista escrita à
// mão em `main.js` (`uiIsBlocking`). Toda vez que entrava um painel novo alguém
// esquecia de acrescentá-lo lá, e clique, pinça e botão de ação vazavam para o
// mundo atrás — foi o que quase aconteceu com o cardgame. Aqui o painel se
// REGISTRA, e quem pergunta pergunta ao chassi.
//
// O chassi também é o dono das regiões da tela e da faixa de z-index (ver o
// bloco "HUD v2" em `hud.css`). Nada de `position:fixed` novo solto por aí.

import { isEditable } from './KeyboardGuard.js';

export function createHudShell() {
  // { id, isOpen(), close(), blocking } — `blocking` falso é para a HUD que
  // convive com o jogo (a barra da reunião, por exemplo, não bloqueia o mundo).
  const panels = new Map();

  const dock = document.createElement('div');
  dock.id = 'hud-dock';
  dock.setAttribute('role', 'toolbar');
  dock.setAttribute('aria-label', 'Menu do jogo');
  document.body.append(dock);

  // Esc fecha o de dentro para fora. Só as folhas do chassi entram aqui: o menu
  // de equipamentos e o painel de móvel já têm o Escape deles, e dois handlers
  // fechando a mesma coisa dão o efeito de "fechou dois painéis com um toque".
  const sheets = new Set();
  const onKeyDown = (event) => {
    if (event.code !== 'Escape') return;
    // Digitando, Esc é "sai do campo", não "fecha a folha": quem está escrevendo
    // uma mensagem espera recuperar o teclado, não perder o rascunho. Quem trata
    // esse caso é o dono do campo (no chat, o `ChatPanel`); aqui só saímos da
    // frente — este handler roda ANTES dele, por ter sido registrado primeiro.
    if (isEditable(document.activeElement)) return;
    const open = [...sheets].filter((sheet) => sheet.isOpen());
    if (!open.length) return;
    event.preventDefault();
    open[open.length - 1].close();
  };
  window.addEventListener('keydown', onKeyDown);

  return {
    dockHost: dock,

    /** Painel que, aberto, impede o mundo de receber clique/pinça/tecla. */
    register(panel) {
      panels.set(panel.id, { blocking: true, ...panel });
      if (panel.isSheet) sheets.add(panel);
      return () => { panels.delete(panel.id); sheets.delete(panel); };
    },

    /** Fonte única do antigo `uiIsBlocking()`. */
    isBlocking() {
      for (const panel of panels.values()) {
        if (panel.blocking && panel.isOpen()) return true;
      }
      return false;
    },

    /** Abrir um painel fecha as folhas do chassi: elas nunca disputam a tela. */
    closeSheets(except = null) {
      for (const sheet of sheets) {
        if (sheet !== except && sheet.isOpen()) sheet.close();
      }
    },

    openPanels: () => [...panels.values()].filter((panel) => panel.isOpen()).map((p) => p.id),

    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      dock.remove();
      panels.clear();
      sheets.clear();
    },
  };
}
