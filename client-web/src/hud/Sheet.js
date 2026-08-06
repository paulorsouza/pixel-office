// Folha do chassi: painel lateral no desktop, tela cheia no celular.
//
// O conteúdo mora num único container rolável (`.hud-sheet-body`) com
// `overscroll-behavior:contain`. Isso não é enfeite: o `body` da página é
// `overflow:hidden` (o mundo é um canvas), então uma folha sem área rolável
// própria simplesmente não rola — e no toque a rolagem ainda vazava para trás.

/**
 * @param options.blocking  false = o mundo continua respondendo com a folha
 *   aberta. É o caso do chat: conversa é coisa que se acompanha ANDANDO, e
 *   congelar o avatar para ler uma linha transformava o chat numa parada.
 *   Clique dentro da folha não vaza para o mundo porque o Phaser escuta no
 *   canvas, e a folha está por cima dele.
 */
export function createSheet(shell, { id, title, subtitle = '', onOpen, blocking = true } = {}) {
  const element = document.createElement('aside');
  element.className = 'hud-sheet';
  element.id = id;
  element.hidden = true;
  element.setAttribute('aria-label', title);
  element.innerHTML = `
    <header class="hud-sheet-head">
      <div style="flex:1;min-width:0">
        <h2></h2>
        <p></p>
      </div>
      <button class="hud-sheet-close" type="button" aria-label="Fechar">×</button>
    </header>
    <div class="hud-sheet-body"></div>`;
  document.body.append(element);

  const heading = element.querySelector('h2');
  const description = element.querySelector('p');
  const body = element.querySelector('.hud-sheet-body');
  const setHeader = (nextTitle, nextSubtitle = '') => {
    heading.textContent = nextTitle;
    description.textContent = nextSubtitle;
    description.hidden = !nextSubtitle;
  };
  setHeader(title, subtitle);

  const sheet = {
    element,
    body,
    setHeader,
    isOpen: () => !element.hidden,
    isSheet: true,
    blocking,
    id,
    open() {
      if (!element.hidden) return;
      shell.closeSheets(sheet);
      element.hidden = false;
      body.scrollTop = 0;
      onOpen?.(body);
      element.querySelector('.hud-sheet-close').focus();
    },
    close() {
      if (element.hidden) return;
      // Devolver o foco ao mundo: com o foco preso num botão escondido, a
      // primeira tecla de movimento ia para o botão em vez de para o jogo.
      if (element.contains(document.activeElement)) document.activeElement.blur();
      element.hidden = true;
    },
    toggle() { if (element.hidden) sheet.open(); else sheet.close(); },
    destroy() { element.remove(); },
  };

  element.querySelector('.hud-sheet-close').onclick = () => sheet.close();
  shell.register(sheet);
  return sheet;
}
