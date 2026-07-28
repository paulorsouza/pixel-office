// Dock: a barra de ícones que substituiu a dica fixa de teclas e os botões
// soltos que brigavam pelo canto da tela ("Meu menu", "Decorar sala").
//
// Duas formas, decididas por LARGURA (layout), não por tipo de ponteiro:
//   • tela larga  — fileira de ícones no canto inferior esquerdo;
//   • até 760px   — um botão só, que abre a MESMA lista como folha de tela cheia.
// No celular a fileira brigaria com a barra da reunião (bottom-center) e daria
// alvos pequenos; a folha resolve os dois de uma vez.

import { createSheet } from './Sheet.js';

const COMPACT = '(max-width: 760px)';

/**
 * @param items  [{ id, icon, label, hint, visible?(), onSelect() }]
 */
export function createDock(shell, items) {
  const host = shell.dockHost;
  const compactQuery = window.matchMedia(COMPACT);
  let signature = '';

  const menu = createSheet(shell, {
    id: 'hud-menu-sheet',
    title: 'Menu',
    subtitle: 'Tudo o que dá para abrir daqui de dentro',
  });

  const visibleItems = () => items.filter((item) => item.visible?.() !== false);

  // O toque no botão não pode virar comando de movimento no mundo atrás dele.
  // Mesma lição do TouchControls: com `preventDefault` no pointerdown o `click`
  // não chega, então quem confirma é o pointerup.
  const bind = (element, handler) => {
    element.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    element.addEventListener('pointerup', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (element.contains(event.target)) handler();
    });
  };

  const choose = (item) => {
    menu.close();
    item.onSelect();
  };

  function renderMenu() {
    menu.body.replaceChildren();
    const list = document.createElement('div');
    list.className = 'hud-menu-list';
    for (const item of visibleItems()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hud-menu-item';
      button.innerHTML = `<i aria-hidden="true"></i><span><b></b><small></small></span>`;
      button.querySelector('i').textContent = item.icon;
      button.querySelector('b').textContent = item.label;
      button.querySelector('small').textContent = item.hint || '';
      bind(button, () => choose(item));
      list.append(button);
    }
    menu.body.append(list);
  }

  function render() {
    // A largura é LIDA aqui, não guardada pelo evento `change`: um evento perdido
    // (acontece ao emular tela) deixava o dock na forma errada, e `refresh()` roda
    // a cada quadro de qualquer jeito. A assinatura é quem evita redesenhar à toa.
    const compact = compactQuery.matches;
    const list = visibleItems();
    const next = `${compact ? 'c' : 'r'}:${list.map((item) => item.id).join(',')}`;
    if (next === signature) return;
    signature = next;
    host.replaceChildren();

    if (compact) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hud-dock-btn';
      button.setAttribute('aria-label', 'Abrir o menu');
      button.textContent = '☰';
      bind(button, () => { renderMenu(); menu.toggle(); });
      host.append(button);
      if (menu.isOpen()) renderMenu();   // item sumiu/apareceu com a folha aberta
      return;
    }

    menu.close();
    for (const item of list) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hud-dock-btn';
      button.setAttribute('aria-label', item.label);
      button.innerHTML = '<span></span>';
      button.prepend(item.icon);
      button.querySelector('span').textContent = item.label;
      bind(button, () => choose(item));
      host.append(button);
    }
  }

  // Redesenha ao cruzar o limiar mesmo sem ninguém chamar `refresh()` (o harness
  // da HUD não tem loop de jogo).
  const onMediaChange = () => render();
  compactQuery.addEventListener('change', onMediaChange);
  render();

  return {
    /** Barato de chamar todo frame: só redesenha quando a lista visível muda. */
    refresh: render,
    close: () => menu.close(),
    destroy() {
      compactQuery.removeEventListener('change', onMediaChange);
      menu.destroy();
      host.replaceChildren();
    },
  };
}
