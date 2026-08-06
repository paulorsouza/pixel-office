// Dock: os botões fixos do canto inferior esquerdo.
//
// Hoje é praticamente um botão só — o do menu —, porque a unificação levou
// tudo para dentro da janela do MainMenu. O que sobra aqui é o que precisa
// estar a um clique do mundo, sem passar pelo menu.
//
// Já teve um "modo compacto" que, abaixo de 760px, trocava a fileira por um ☰
// que abria a MESMA lista como folha. Isso fazia sentido quando eram sete
// botões; com um item só virou bug: em tela estreita o botão do menu abria uma
// folha com uma linha ("Menu") em vez de abrir o menu. Removido.

/**
 * @param items  [{ id, icon, label, hint, visible?(), badge?(), onSelect() }]
 *   `badge()` devolve um número; zero (ou ausente) esconde o contador. Ele é
 *   atualizado FORA do `signature`: mudar de 2 para 3 não pode reconstruir o
 *   botão, senão o clique se perde entre o pointerdown e o pointerup.
 */
export function createDock(shell, items) {
  const host = shell.dockHost;
  let signature = '';

  const visibleItems = () => items.filter((item) => item.visible?.() !== false);

  // O toque no botão não pode virar comando de movimento no mundo atrás dele.
  // Lição do TouchControls: com `preventDefault` no pointerdown o `click` não
  // chega, então quem confirma é o pointerup.
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

  function paintBadges() {
    for (const item of items) {
      const badge = host.querySelector(`[data-dock="${item.id}"] .hud-dock-badge`);
      if (!badge) continue;
      const count = item.badge?.() || 0;
      badge.hidden = count === 0;
      badge.textContent = count > 99 ? '99+' : String(count);
    }
  }

  function render() {
    const list = visibleItems();
    const next = list.map((item) => item.id).join(',');
    if (next === signature) { paintBadges(); return; }
    signature = next;
    host.replaceChildren();

    for (const item of list) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hud-dock-btn';
      button.dataset.dock = item.id;
      button.title = item.hint ? `${item.label} — ${item.hint}` : item.label;
      button.setAttribute('aria-label', item.label);
      button.innerHTML = '<span></span><i class="hud-dock-badge" hidden></i>';
      button.prepend(item.icon);
      button.querySelector('span').textContent = item.label;
      bind(button, () => item.onSelect());
      host.append(button);
    }
    paintBadges();
  }

  render();

  return {
    /** Barato de chamar todo frame: só redesenha quando a lista visível muda. */
    refresh: render,
    destroy() { host.replaceChildren(); },
  };
}
