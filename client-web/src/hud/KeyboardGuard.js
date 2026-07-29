// Quem manda no teclado: o mundo ou o campo de texto.
//
// O bug que isto conserta: não dava para digitar A, S, W, D, E nem F em NENHUM
// input do jogo — criar card no kanban, filtrar o backlog, buscar móvel. O
// motivo não é óbvio, então fica registrado:
//
//   `scene.input.keyboard.addKeys('W,A,S,D')` liga o CAPTURE dessas teclas, e
//   quem chama `preventDefault()` é o KeyboardManager (nível de jogo, escutando
//   em `window`), não o KeyboardPlugin da cena. Desligar o plugin
//   (`keyboard.enabled = false`, que era o que os painéis faziam) impede o
//   avatar de andar, mas o manager continua engolindo a tecla antes de o
//   navegador escrever a letra no input. Só `disableGlobalCapture()` desarma
//   isso — é ele que zera o `manager.preventDefault`.
//
// Por isso o teclado passa a ter UM dono só. Painel nenhum mexe em
// `keyboard.enabled` por conta própria: quem decide é esta função, a partir de
// duas perguntas — o foco está num campo de texto? tem painel aberto na frente?

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Campo em que a pessoa digita (ou escolhe) e que precisa das teclas cruas. */
function isEditable(element) {
  if (!element) return false;
  return element.isContentEditable || EDITABLE_TAGS.has(element.tagName);
}

/**
 * @param options.getKeyboard  devolve o KeyboardPlugin da cena atual (ela reinicia)
 * @param options.isBlocked    tem painel aberto? (o mundo não deve responder)
 */
export function createKeyboardGuard({ getKeyboard, isBlocked = () => false } = {}) {
  let applied = null;   // último estado escrito, para não tocar no Phaser todo frame

  const apply = () => {
    const keyboard = getKeyboard();
    if (!keyboard) { applied = null; return; }
    // Digitar libera a tecla para o navegador; painel aberto só congela o mundo
    // (ali ainda queremos o capture, senão o espaço rola a página atrás).
    const typing = isEditable(document.activeElement);
    const worldListens = !typing && !isBlocked();
    const state = `${typing}|${worldListens}`;
    if (state === applied) return;
    applied = state;

    if (typing) keyboard.disableGlobalCapture();
    else keyboard.enableGlobalCapture();

    if (!worldListens) {
      // Sem isto a tecla que estava pressionada na hora em que o painel abriu
      // continua "em pé" e o avatar sai andando sozinho ao fechar.
      keyboard.resetKeys();
    }
    keyboard.enabled = worldListens;
  };

  // `focusin`/`focusout` borbulham (ao contrário de focus/blur), então um par de
  // listeners no documento cobre qualquer campo, inclusive os que a UI
  // compartilhada do backend cria depois.
  const onFocusChange = () => apply();
  document.addEventListener('focusin', onFocusChange);
  document.addEventListener('focusout', onFocusChange);

  // E a PRIMEIRA tecla depois de clicar no campo? O foco e a tecla podem chegar
  // no mesmo instante, e aí a letra já teria sido engolida antes de qualquer
  // `apply()`. Este listener resolve pela ORDEM: ele está na fase de CAPTURA da
  // janela, que roda antes de tudo; o do Phaser está na fase de bolha, que roda
  // depois. Quando o Phaser for decidir se chama `preventDefault`, o capture já
  // está desarmado — no mesmo evento, não no próximo.
  const onKeyDownCapture = () => apply();
  window.addEventListener('keydown', onKeyDownCapture, true);

  return {
    /** Barato: só escreve no Phaser quando o estado muda. */
    refresh: apply,
    /** A cena reiniciou: o plugin é outro, o estado guardado não vale mais. */
    reset() { applied = null; apply(); },
    destroy() {
      document.removeEventListener('focusin', onFocusChange);
      document.removeEventListener('focusout', onFocusChange);
      window.removeEventListener('keydown', onKeyDownCapture, true);
    },
  };
}
