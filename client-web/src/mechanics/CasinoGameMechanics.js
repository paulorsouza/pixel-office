import { registerMechanic } from './MechanicsRegistry.js';

const property = (entity, key, fallback = undefined) =>
  entity.properties?.[key] ?? entity[key] ?? fallback;

function casinoMechanic({
  type,
  texture,
  asset,
  panelKey,
  defaultLabel,
  claimKind,
  tint,
  baseTint = 0xffffff,
}) {
  registerMechanic(type, {
    preload({ scene }) {
      if (!scene.textures.exists(texture)) scene.load.image(texture, asset);
    },

    validate(entity) {
      if (!property(entity, 'gameId')) throw new Error('gameId é obrigatório');
      if (!property(entity, 'tableId', entity.id)) throw new Error('tableId é obrigatório');
    },

    create({ scene, map, entity, context }) {
      const tile = map.tile || 16;
      const width = Number(entity.w || 6);
      const height = Number(entity.h || 6);
      const x = (Number(entity.x) + width / 2) * tile;
      const bottom = (Number(entity.y) + height) * tile;
      const tableId = property(entity, 'tableId', entity.id);
      const gameId = property(entity, 'gameId');
      const label = property(entity, 'label', defaultLabel);
      const radius = Number(property(entity, 'interactionRadius', 3.5)) * tile;
      const claimId = `${claimKind}:${tableId}`;

      const display = scene.add.image(x, bottom, texture)
        .setOrigin(0.5, 1)
        .setDisplaySize(width * tile, height * tile)
        .setDepth(bottom);
      const solid = scene.add.zone(
        (Number(entity.x) + 0.45) * tile,
        (Number(entity.y) + height - 1.15) * tile,
        Math.max(0.5, width - 0.9) * tile,
        1.05 * tile,
      ).setOrigin(0, 0);
      scene.physics.add.existing(solid, true);
      context.solids?.add(solid);

      let opening = false;
      const open = async () => {
        const panel = context[panelKey];
        if (opening || !panel) return false;
        opening = true;
        try {
          const occupied = context.presence?.claimOf(claimId);
          if (occupied && !occupied.mine) {
            context.onToast?.(`${occupied.name} está usando esta mesa`);
            return true;
          }
          const claimed = occupied?.mine
            || await context.presence?.claimEntity(claimId, claimKind, { gameId, tableId });
          if (context.presence && !claimed) {
            context.onToast?.('Alguém chegou primeiro');
            return true;
          }
          await panel.open(gameId, {
            tableId,
            onClose: () => context.presence?.releaseEntity(claimId),
          });
          return true;
        } catch (error) {
          context.presence?.releaseEntity(claimId);
          context.onToast?.(error.message || 'Não foi possível abrir o jogo');
          return true;
        } finally {
          opening = false;
        }
      };

      return {
        interaction: {
          id: tableId,
          x,
          y: bottom - tile,
          radius,
          priority: 20,
          label,
          interact: open,
        },
        update() {
          const near = Math.hypot(scene.player?.x - x, scene.player?.y - (bottom - tile)) <= radius;
          display.setTint(near ? tint : baseTint);
        },
        destroy() {
          context.presence?.releaseEntity(claimId);
          display.destroy();
          if (solid.active) solid.destroy();
        },
      };
    },
  });
}

casinoMechanic({
  type: 'nerdSlotMachine',
  texture: 'casino_nerd_slot_machine',
  asset: 'assets/casino/generic/nerd-slot-machine.png',
  panelKey: 'nerdSlotsPanel',
  defaultLabel: 'Jogar Nerd Slots',
  claimKind: 'nerd-slots',
  tint: 0xffd8f2,
});

casinoMechanic({
  type: 'blackjackTable',
  texture: 'casino_blackjack_table',
  asset: 'assets/casino/generic/blackjack-table.png',
  panelKey: 'blackjackPanel',
  defaultLabel: 'Jogar Blackjack',
  claimKind: 'blackjack',
  tint: 0xd4fff4,
});
