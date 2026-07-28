import { registerMechanic } from './MechanicsRegistry.js';

const ELEVATOR_TEXTURE = 'limezu_elevator_door';
const ELEVATOR_ANIMATION = 'limezu_elevator_door_open';
const STAIRS_TEXTURE = 'limezu_stairs_wood';
// Mesma escada, com os degraus mergulhando num vão escuro: sem duas artes, subir e descer
// ficam indistinguíveis no mapa.
const STAIRS_DOWN_TEXTURE = 'limezu_stairs_wood_down';

const value = (entity, key, fallback) => (
  Object.hasOwn(entity, key) ? entity[key] : (entity.properties?.[key] ?? fallback)
);

function elevatorDisplay(scene, entity, tile) {
  const x = Number(value(entity, 'visualX', Number(entity.x) + Number(entity.w) / 2)) * tile;
  const y = Number(value(entity, 'visualY', Number(entity.y))) * tile;
  const cabin = scene.add.rectangle(x, y - tile, 2 * tile, 2 * tile, 0x111722, 1)
    .setOrigin(0.5, 0.5)
    .setDepth(y - 2);
  if (!scene.anims.exists(ELEVATOR_ANIMATION)) {
    scene.anims.create({
      key: ELEVATOR_ANIMATION,
      frames: scene.anims.generateFrameNumbers(ELEVATOR_TEXTURE, { start: 0, end: 13 }),
      frameRate: 12,
      repeat: 0,
    });
  }
  const door = scene.add.sprite(x, y, ELEVATOR_TEXTURE, 0)
    .setOrigin(0.5, 1)
    .setDepth(y);
  return { displays: [cabin, door], door };
}

function stairsDisplay(scene, entity, tile) {
  const x = Number(value(entity, 'visualX', Number(entity.x) + Number(entity.w) / 2)) * tile;
  const y = Number(value(entity, 'visualY', Number(entity.y))) * tile;
  const goingDown = Number(value(entity, 'floorDelta', 0)) < 0
    || value(entity, 'stairsDirection') === 'down';
  return scene.add.image(x, y, goingDown ? STAIRS_DOWN_TEXTURE : STAIRS_TEXTURE)
    .setOrigin(0.5, 1)
    .setDepth(y);
}

function stairsBlocker(scene, entity, tile, solids) {
  const visualX = Number(value(entity, 'visualX', Number(entity.x) + Number(entity.w) / 2));
  const visualY = Number(value(entity, 'visualY', Number(entity.y)));
  const blockX = Number(value(entity, 'blockX', visualX - 1));
  const blockY = Number(value(entity, 'blockY', visualY - 4));
  const blockW = Number(value(entity, 'blockW', 2));
  const blockH = Number(value(entity, 'blockH', 4));
  const zone = scene.add.zone(
    blockX * tile,
    blockY * tile,
    blockW * tile,
    blockH * tile,
  ).setOrigin(0, 0);
  scene.physics.add.existing(zone, true);
  solids?.add(zone);
  return zone;
}

registerMechanic('verticalAccess', {
  preload({ scene }) {
    if (!scene.textures.exists(ELEVATOR_TEXTURE)) {
      scene.load.spritesheet(
        ELEVATOR_TEXTURE,
        'assets/architecture/limezu_elevator_door.png',
        { frameWidth: 32, frameHeight: 32 },
      );
    }
    if (!scene.textures.exists(STAIRS_TEXTURE)) {
      scene.load.image(STAIRS_TEXTURE, 'assets/architecture/limezu_stairs_wood.png');
    }
    if (!scene.textures.exists(STAIRS_DOWN_TEXTURE)) {
      scene.load.image(STAIRS_DOWN_TEXTURE, 'assets/architecture/limezu_stairs_wood_down.png');
    }
  },
  validate(entity) {
    const accessType = value(entity, 'accessType');
    if (!['elevator', 'stairs'].includes(accessType)) {
      throw new Error('accessType precisa ser elevator ou stairs');
    }
    if (!value(entity, 'targetScene')) {
      throw new Error('targetScene é obrigatório para o acesso vertical funcionar');
    }
  },
  create({ scene, map, entity, context }) {
    const tile = map.tile || 16;
    const accessType = value(entity, 'accessType');
    const visual = accessType === 'elevator'
      ? elevatorDisplay(scene, entity, tile)
      : stairsDisplay(scene, entity, tile);
    const displays = accessType === 'elevator' ? visual.displays : [visual];
    const elevatorDoor = accessType === 'elevator' ? visual.door : null;
    const blocker = accessType === 'stairs'
      ? stairsBlocker(scene, entity, tile, context.solids)
      : null;
    let elevatorOpen = false;

    return {
      accessType,
      floorIndex: Number(value(entity, 'floorIndex', 0)),
      portal: {
        id: entity.id || entity.name,
        x: Number(value(entity, 'x')),
        y: Number(value(entity, 'y')),
        w: Number(value(entity, 'w')),
        h: Number(value(entity, 'h')),
        targetScene: value(entity, 'targetScene'),
        targetSpawn: value(entity, 'targetSpawn'),
        targetWing: Number(value(entity, 'targetWing', 0)),
        // Sem repassar `floorDelta`, a escada de subir e a de descer caem no mesmo andar:
        // `changeScene` volta para o ramo de `targetWing`, que é fixo.
        floorDelta: Number(value(entity, 'floorDelta', 0)),
        // O elevador serve o prédio inteiro: em vez de um destino fixo, abre o seletor.
        chooseFloor: accessType === 'elevator' && value(entity, 'chooseFloor', true) !== false,
        label: value(entity, 'label', accessType === 'elevator' ? 'Usar elevador' : 'Usar escadas'),
      },
      update() {
        if (accessType !== 'elevator' || !scene.player?.body) return;
        const footX = scene.player.body.center.x / tile;
        const footY = scene.player.body.bottom / tile;
        const near = footX >= Number(entity.x) - 1
          && footX <= Number(entity.x) + Number(entity.w) + 1
          && footY >= Number(entity.y) - 1
          && footY <= Number(entity.y) + Number(entity.h) + 1;
        if (near && !elevatorOpen) {
          elevatorOpen = true;
          elevatorDoor.play(ELEVATOR_ANIMATION);
        } else if (!near && elevatorOpen) {
          elevatorOpen = false;
          elevatorDoor.stop().setFrame(0);
        }
      },
      destroy: () => {
        displays.forEach((display) => display.destroy());
        if (blocker?.active) {
          context.solids?.remove(blocker, true, true);
          if (blocker.active) blocker.destroy();
        }
      },
    };
  },
});
