// Fone de reunião. Cada sala marcada como reunião (meeting) ganha um fone no chão.
// Pegar o fone (E) fixa o jogador no call daquela sala mesmo saindo dela; soltar
// (E perto do suporte, ou o botão do HUD) volta ao comportamento por posição.
// Derivado de map.rooms — aditivo, não depende de objeto no Tiled (o mapa é manual).

const GRAB_RANGE = 2.0;   // tiles

export function createMeetingHeadsets(scene, map, handlers = {}) {
  const tile = map.tile || 16;
  const meetingRooms = (map.rooms || []).filter((room) => room.meeting || room.id === 'meeting');

  const stands = meetingRooms.map((room) => {
    const x = (room.x + room.w / 2) * tile;
    // logo abaixo da parede norte da sala, sem encostar nela
    const y = (room.y + Math.min(room.h - 1.5, 2.4)) * tile;

    const base = scene.add.ellipse(x, y + 11, 30, 12, 0x140e1f, 0.5).setDepth(y - 1);
    const ring = scene.add.circle(x, y + 2, 15).setStrokeStyle(2, 0x9a86ff, 0.9)
      .setFillStyle(0x7c5cff, 0).setDepth(y - 1);
    const glyph = scene.add.text(x, y, '🎧', { fontSize: '19px' }).setOrigin(0.5).setDepth(y + 1);

    const float = scene.tweens.add({
      targets: glyph, y: y - 4, duration: 950, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    const pulse = scene.tweens.add({
      targets: ring, scale: 1.7, alpha: { from: 0.85, to: 0 },
      duration: 1500, repeat: -1, ease: 'Sine.easeOut',
    });

    return { room, x, y, base, ring, glyph, float, pulse, held: false };
  });

  function setHeld(stand, held) {
    if (stand.held === held) return;
    stand.held = held;
    // fone "vestido": suporte esvazia (glifo apagado, sem pulso) mas continua no
    // lugar para o jogador saber onde devolver
    stand.glyph.setAlpha(held ? 0.28 : 1);
    stand.ring.setVisible(!held);
    if (held) { stand.pulse.pause(); stand.float.pause(); stand.glyph.setY(stand.y); }
    else { stand.pulse.resume(); stand.float.resume(); }
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
    for (const stand of stands) { stand.float?.remove(); stand.pulse?.remove(); }
  });

  return {
    any: () => stands.length > 0,
    hasHeld: () => stands.some((stand) => stand.held),

    // devolve o prompt de interação para a HUD do jogo (mesma faixa do portal/móvel)
    update(player, blocked = false) {
      nearbyHeld = blocked ? null : nearestWithin(player, true);
      nearbyGrab = blocked ? null : nearestWithin(player, false);
      if (nearbyHeld) return { label: 'Soltar o fone — sair da reunião' };
      if (nearbyGrab) return { label: 'Pegar o fone — entrar na reunião' };
      return null;
    },

    // chamado no handler do E; true = consumiu a interação
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
