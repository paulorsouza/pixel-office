// Avatar dos outros jogadores. Reusa exatamente os mesmos visuais do avatar local
// (camadas modulares do CharacterSystem + veículo procedural do EquipmentSystem),
// alimentados por um "player fantasma" — um objeto com a mesma superfície que aqueles
// módulos consomem (x, y, body.bottom), sem precisar de corpo físico do Phaser.
// Sem aparência na rede (bots, cliente antigo), cai no corpo base `adam_idle/run`.
import { createCharacterVisual, normalizeCharacterSelection } from './CharacterSystem.js';
import { createEquipmentVisual, equipmentById } from './EquipmentSystem.js';

const BODY_OFFSET = 16;   // do centro do sprite até os pés (mesma referência do label)

export function normalizeAppearance(catalogs, raw) {
  if (!raw) return null;
  let data = raw;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { return null; }
  }
  if (!data || typeof data !== 'object') return null;
  const vehicleId = typeof data.vehicle === 'string' ? data.vehicle : null;
  return {
    character: normalizeCharacterSelection(catalogs.character, data.character || {}),
    // só veículo de verdade do catálogo vira visual
    vehicle: equipmentById(catalogs.equipment, vehicleId)?.slot === 'vehicle' ? vehicleId : null,
  };
}

export function createRemoteAvatar(scene, catalogs, record) {
  const ghost = {
    x: record.x, y: record.y,
    body: { bottom: record.y + BODY_OFFSET },
    setVisible() {},
  };
  // a seleção é lida a cada frame, então trocar de skin em rede reflete na hora
  const customizer = { getSelection: () => record.appearance?.character || {} };

  let character = null;
  let equipment = null;
  let fallback = null;

  function useModular() {
    if (character) return;
    character = createCharacterVisual(scene, catalogs.character, customizer, ghost);
    equipment = createEquipmentVisual(scene);
    fallback?.destroy();
    fallback = null;
  }

  function useFallback() {
    if (fallback) return;
    character?.destroy();
    character = null;
    equipment?.destroy();
    equipment = null;
    fallback = scene.add.sprite(record.x, record.y, 'adam_idle', 18).setOrigin(0.5, 0.5);
  }

  return {
    update(moving, time) {
      ghost.x = record.x;
      ghost.y = record.y;
      ghost.body.bottom = record.y + BODY_OFFSET;
      const direction = record.dir || 'down';

      if (!record.appearance) {
        useFallback();
        fallback.setPosition(record.x, record.y).setDepth(record.y + BODY_OFFSET);
        const anim = `${moving ? 'run' : 'idle'}-${direction}`;
        if (scene.anims.exists(anim)) fallback.anims.play(anim, true);
        return;
      }

      useModular();
      const vehicle = record.appearance.vehicle
        ? equipmentById(catalogs.equipment, record.appearance.vehicle)
        : null;
      // mesma regra do avatar local: só a moto tem pose sentada
      const pose = vehicle ? (vehicle.id === 'motorcycle' ? 'sit' : 'idle') : (moving ? 'walk' : 'idle');
      character.update(direction, pose, moving || Boolean(vehicle), time);
      equipment.update(ghost, vehicle, direction, Boolean(vehicle), moving, time);
    },
    destroy() {
      character?.destroy();
      equipment?.destroy();
      fallback?.destroy();
      character = null; equipment = null; fallback = null;
    },
  };
}
