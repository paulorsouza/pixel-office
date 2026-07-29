import { registerMechanic } from './MechanicsRegistry.js';

const TEXTURE = 'casino_arrange_dice_table';
const ASSET = 'assets/casino/grandia3/arrange-dice-table.png';
const property = (entity, key, fallback = undefined) =>
  entity.properties?.[key] ?? entity[key] ?? fallback;

registerMechanic('arrangeDiceTable', {
  preload({ scene }) {
    if (!scene.textures.exists(TEXTURE)) scene.load.image(TEXTURE, ASSET);
  },

  validate(entity) {
    if (!property(entity, 'gameId')) throw new Error('gameId é obrigatório');
    if (!property(entity, 'tableId', entity.id)) throw new Error('tableId é obrigatório');
  },

  create({ scene, map, entity, context }) {
    const tile = map.tile || 16;
    const width = Number(entity.w || 6);
    const height = Number(entity.h || 4);
    const x = (Number(entity.x) + width / 2) * tile;
    const bottom = (Number(entity.y) + height) * tile;
    const tableId = property(entity, 'tableId', entity.id);
    const gameId = property(entity, 'gameId');
    const label = property(entity, 'label', 'Jogar Arrange Dice');
    const claimId = `arrange-dice:${tableId}`;

    const display = scene.add.image(x, bottom, TEXTURE)
      .setOrigin(0.5, 1)
      .setDepth(bottom);
    const solid = scene.add.zone(
      (Number(entity.x) + 0.4) * tile,
      (Number(entity.y) + height - 1.1) * tile,
      Math.max(0.5, width - 0.8) * tile,
      1.05 * tile,
    ).setOrigin(0, 0);
    scene.physics.add.existing(solid, true);
    context.solids?.add(solid);

    let opening = false;
    const open = async () => {
      if (opening || !context.arrangeDicePanel) return false;
      opening = true;
      try {
        const occupied = context.presence?.claimOf(claimId);
        if (occupied && !occupied.mine) {
          context.onToast?.(`${occupied.name} está usando esta mesa`);
          return true;
        }
        const claimed = occupied?.mine
          || await context.presence?.claimEntity(claimId, 'arrange-dice', { gameId, tableId });
        if (context.presence && !claimed) {
          context.onToast?.('Alguém chegou primeiro');
          return true;
        }
        await context.arrangeDicePanel.open(gameId, {
          tableId,
          onClose: () => context.presence?.releaseEntity(claimId),
        });
        return true;
      } catch (error) {
        context.presence?.releaseEntity(claimId);
        context.onToast?.(error.message || 'Não foi possível abrir a mesa');
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
        radius: Number(property(entity, 'interactionRadius', 3.5)) * tile,
        priority: 20,
        label,
        interact: open,
      },
      update() {
        const near = Math.hypot(scene.player?.x - x, scene.player?.y - (bottom - tile)) <= tile * 3.5;
        display.setTint(near ? 0xcffcff : 0xffffff);
      },
      destroy() {
        context.presence?.releaseEntity(claimId);
        display.destroy();
        if (solid.active) solid.destroy();
      },
    };
  },
});
