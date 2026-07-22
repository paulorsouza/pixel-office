// Fone de reunião. Cada sala marcada como reunião (meeting) ganha um fone
// pendurado na parede norte. Pegar o fone (F) fixa o jogador no call daquela sala
// mesmo saindo dela; soltar (F perto do gancho, ou o botão do HUD) volta ao
// comportamento por posição.
// Derivado de map.rooms — aditivo, não depende de objeto no Tiled (o mapa é manual).

const GRAB_RANGE = 2.0;   // tiles

export function createMeetingHeadsets(scene, map, handlers = {}) {
  const tile = map.tile || 16;
  const meetingRooms = (map.rooms || []).filter((room) => room.meeting || room.id === 'meeting');

  const stands = meetingRooms.map((room) => {
    const x = (room.x + room.w / 2) * tile;
    // pendurado na parede norte da sala, na altura da face da parede
    const y = (room.y + 1) * tile;

    // origem no centro-inferior, como o resto da mobília, e profundidade por Y
    // para desenhar por cima da parede
    const sprite = scene.add.image(x, y, 'headset_wall')
      .setOrigin(0.5, 1).setDepth(y);
    const brilho = scene.add.circle(x, y - 8, 13).setStrokeStyle(2, 0x9a86ff, 0.9)
      .setFillStyle(0x7c5cff, 0).setDepth(y - 1);

    const pulse = scene.tweens.add({
      targets: brilho, scale: 1.6, alpha: { from: 0.7, to: 0 },
      duration: 1500, repeat: -1, ease: 'Sine.easeOut',
    });

    return { room, x, y, sprite, brilho, pulse, held: false };
  });

  function setHeld(stand, held) {
    if (stand.held === held) return;
    stand.held = held;
    // fone "vestido": o gancho fica vazio no lugar, para o jogador saber onde devolver
    stand.sprite.setTexture(held ? 'headset_wall_empty' : 'headset_wall');
    stand.brilho.setVisible(!held);
    if (held) stand.pulse.pause(); else stand.pulse.resume();
  }

  function releaseAll(notify = false) {
    let released = false;
    for (const stand of stands) if (stand.held) { setHeld(stand, false); released = true; }
    if (released && notify) handlers.onRelease?.();
  }

  function nearestWithin(player, wantHeld) {
    let best = null;
    let bestDist = Infinity;
    for (const stand of stands) {
      if (stand.held !== wantHeld) continue;
      const d = Phaser.Math.Distance.Between(
        stand.x, stand.y, player.body.center.x, player.body.center.y,
      ) / tile;
      if (d < bestDist) { bestDist = d; best = stand; }
    }
    return bestDist <= GRAB_RANGE ? best : null;
  }

  let nearbyGrab = null;
  let nearbyHeld = null;

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    for (const stand of stands) stand.pulse?.remove();
  });

  return {
    any: () => stands.length > 0,
    hasHeld: () => stands.some((stand) => stand.held),

    // devolve o prompt de interação para a HUD do jogo (mesma faixa do portal/móvel)
    update(player, blocked = false) {
      nearbyHeld = blocked ? null : nearestWithin(player, true);
      nearbyGrab = blocked ? null : nearestWithin(player, false);
      if (nearbyHeld) return { label: 'F — soltar o fone e sair da reunião' };
      if (nearbyGrab) return { label: 'F — pegar o fone e entrar na reunião' };
      return null;
    },

    // chamado no handler do F; true = consumiu a interação
    interact() {
      if (nearbyHeld) { setHeld(nearbyHeld, false); handlers.onRelease?.(); return true; }
      if (nearbyGrab) {
        releaseAll();                // um fone por vez
        setHeld(nearbyGrab, true);
        handlers.onGrab?.(nearbyGrab.room);
        return true;
      }
      return false;
    },

    // soltar de qualquer lugar (botão "Soltar o fone" da HUD)
    releaseAll,
  };
}
