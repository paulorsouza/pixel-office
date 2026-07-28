// Controles de toque: botão de ação contextual e pinça de zoom.
//
// O botão NÃO inventa regra nenhuma — ele espelha o mesmo prompt que a HUD já
// calcula (`activeFurniturePrompt || activeHeadsetPrompt || activePortal`) e
// dispara os MESMOS handlers do teclado. É por isso que confirmar no celular e
// apertar E no desktop fazem exatamente a mesma coisa.

/**
 * `pointer: coarse` pega celular e tablet sem pegar notebook com tela sensível
 * (que tem mouse e teclado e não precisa dos botões). `?touch=1` força, para dar
 * para testar no desktop.
 */
export function isTouchDevice() {
  const forced = new URLSearchParams(location.search).get('touch');
  if (forced === '1') return true;
  if (forced === '0') return false;
  return window.matchMedia?.('(pointer: coarse)').matches
    || (navigator.maxTouchPoints ?? 0) > 0;
}

/** Tira o prefixo de tecla ("F — soltar o fone") que não faz sentido no toque. */
const stripKeyHint = (label) => String(label || '').replace(/^\s*[A-Z]\s*[—-]\s*/, '');

export function createTouchControls(scene, options = {}) {
  const root = document.querySelector('#touch-controls');
  const actionButton = document.querySelector('#touch-action');
  const actionLabel = document.querySelector('#touch-action-label');
  const headsetButton = document.querySelector('#touch-headset');
  if (!root) return { update() {}, destroy() {} };

  const enabled = isTouchDevice();
  root.hidden = !enabled;
  if (!enabled) return { update() {}, destroy() {} };

  // O toque no botão não pode virar comando de movimento no canvas atrás dele.
  // `stopPropagation` já basta: o Phaser escuta em window, na fase de bolha.
  //
  // Agimos no `pointerup`, não no `click`: com `preventDefault` no `pointerdown`
  // (necessário para o navegador não sintetizar mouse depois do toque) o `click`
  // simplesmente não chega — foi assim que o botão ficou mudo no primeiro teste.
  const bind = (el, handler) => {
    el.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    el.addEventListener('pointerup', (event) => {
      event.preventDefault();
      event.stopPropagation();
      // Soltar fora do botão (arrastou o dedo pra longe) não confirma.
      if (el.contains(event.target)) handler();
    });
  };
  bind(actionButton, () => options.onAction?.());
  bind(headsetButton, () => options.onHeadset?.());

  // ------------------------------------------------------------- pinça

  let pinchDistance = 0;
  const activePointers = () => scene.input.manager.pointers.filter((p) => p.isDown);

  const onPointerMove = () => {
    // Painel aberto (cardgame, equipamentos, decoração) cobre a tela, mas o Phaser
    // continua vendo o gesto pela janela: sem este guarda, dois dedos rolando o
    // álbum de cartas davam zoom no mundo atrás do overlay.
    if (options.isBlocked?.()) { pinchDistance = 0; return; }
    const [a, b] = activePointers();
    if (!a || !b) { pinchDistance = 0; return; }
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    if (pinchDistance > 0 && distance > 0) {
      // Proporcional: aproximar os dedos pela metade tira metade do zoom.
      options.onZoom?.(distance / pinchDistance);
    }
    pinchDistance = distance;
  };
  const onPointerUp = () => { if (activePointers().length < 2) pinchDistance = 0; };

  scene.input.on('pointermove', onPointerMove);
  scene.input.on('pointerup', onPointerUp);

  const dispose = () => {
    scene.input.off('pointermove', onPointerMove);
    scene.input.off('pointerup', onPointerUp);
    root.hidden = true;
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, dispose);

  let shownLabel = null;

  return {
    /**
     * @param prompt  o mesmo objeto {label} que a HUD mostra, ou null
     * @param kind    'headset' quando o prompt veio do fone (dispara F, não E)
     * @param seated  sentado o botão vira "Levantar" — nesse estado não há prompt
     */
    update({ prompt, kind, seated, blocked } = {}) {
      const label = seated ? 'Levantar' : stripKeyHint(prompt?.label);
      const visible = Boolean(!blocked && (seated || prompt));
      if (label !== shownLabel) {
        actionLabel.textContent = label || '';
        shownLabel = label;
      }
      actionButton.hidden = !visible;
      // O fone ganha botão próprio: com um só, pegar o fone competiria com sentar.
      headsetButton.hidden = !(kind === 'headset' && !blocked);
    },
    destroy: dispose,
  };
}
