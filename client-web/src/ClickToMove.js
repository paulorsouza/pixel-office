// Entrada de movimento por ponteiro: um toque no celular, um clique no desktop.
//
// Deliberadamente só ANDA. Sentar, entrar num portal ou abrir um móvel continua
// exigindo confirmação (E no teclado, botão de ação no toque) — clicar não dispara
// ação nenhuma, para ninguém sentar sem querer ao tocar na tela.

const TAP_SLOP_PX = 10;      // acima disso é arrasto (a câmera/editor usam arrasto)
const TAP_MAX_MS = 600;

export function createClickToMove(scene, navigation, options = {}) {
  const isBlocked = options.isBlocked || (() => false);
  let downAt = 0;
  let downX = 0;
  let downY = 0;
  let marker = null;
  let gesture = null;   // 'tap' | 'pinch'

  function showMarker(x, y, ok) {
    marker?.destroy();
    const color = ok ? 0xffe9c9 : 0xff6b6b;
    marker = scene.add.circle(x, y, 3, color, 0.9)
      .setStrokeStyle(1, color, 1)
      .setDepth(999999);
    scene.tweens.add({
      targets: marker,
      radius: ok ? 9 : 6,
      alpha: 0,
      duration: ok ? 420 : 260,
      onComplete: () => { marker?.destroy(); marker = null; },
    });
  }

  const pointersDown = () => scene.input.manager.pointers.filter((p) => p.isDown).length;

  const onPointerDown = (pointer) => {
    // Segundo dedo na tela = pinça de zoom, não comando de movimento. Sem esta
    // marca, soltar os dedos da pinça mandava o avatar para o meio do gesto.
    if (pointersDown() > 1) gesture = 'pinch';
    else gesture = 'tap';
    downAt = scene.time.now;
    downX = pointer.x;
    downY = pointer.y;
  };

  const onPointerUp = (pointer) => {
    const wasPinch = gesture === 'pinch';
    if (pointersDown() === 0) gesture = null;
    if (wasPinch) return;
    if (isBlocked()) return;
    // Botão direito/meio não movem: ficam livres para menu de contexto futuro.
    if (pointer.button !== 0) return;
    if (scene.time.now - downAt > TAP_MAX_MS) return;
    if (Math.hypot(pointer.x - downX, pointer.y - downY) > TAP_SLOP_PX) return;

    // Sentado, o toque levanta e já caminha — senão o comando parecia ignorado.
    options.onBeforeMove?.();

    const ok = navigation.moveTo(pointer.worldX, pointer.worldY, scene.player.body);
    showMarker(pointer.worldX, pointer.worldY, ok);
    if (!ok) options.onUnreachable?.();
  };

  scene.input.on('pointerdown', onPointerDown);
  scene.input.on('pointerup', onPointerUp);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.input.off('pointerdown', onPointerDown);
    scene.input.off('pointerup', onPointerUp);
    marker?.destroy();
    marker = null;
  });

  return {
    clearMarker() { marker?.destroy(); marker = null; },
  };
}
