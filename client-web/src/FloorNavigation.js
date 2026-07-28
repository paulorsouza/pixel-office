// Para onde um acesso vertical leva. É função pura de propósito: foi justamente aqui que
// escada de subir e de descer caíram no mesmo andar (o portal do elevador/escada não
// repassava `floorDelta`, e a resolução voltava para o `targetWing`, que é fixo).

export const PERSONAL_WING_SCENE = 'personal-wing';
export const CAMPUS_SCENE = 'tooq-campus';

/** Andar de salas pessoais de uma referência de cena, ou `null` fora deles (térreo). */
export function personalWingIndex(sceneRef) {
  const [template, rawWing] = String(sceneRef || '').split('@');
  if (template !== PERSONAL_WING_SCENE) return null;
  const wing = Number(rawWing);
  return Number.isInteger(wing) && wing >= 0 ? wing : 0;
}

/**
 * Cena de destino de um portal, já resolvendo andar.
 * @param {object} portal `{ targetScene, targetWing, floorDelta, wingDelta }`
 * @param {string} currentSceneId cena de origem
 * @returns {string} referência de cena (`tooq-campus` ou `personal-wing@N`)
 */
export function resolveSceneTarget(portal, currentSceneId) {
  const currentWing = personalWingIndex(currentSceneId);
  const floorDelta = Number(portal.floorDelta || 0);
  if (floorDelta && currentWing != null) {
    // Andares são cenas: descer do primeiro andar cai no térreo, que é outro mapa.
    const floor = currentWing + floorDelta;
    return floor < 0 ? CAMPUS_SCENE : `${PERSONAL_WING_SCENE}@${floor}`;
  }
  if (portal.wingDelta && currentWing != null) {
    return `${PERSONAL_WING_SCENE}@${currentWing + portal.wingDelta}`;
  }
  if (portal.targetScene === PERSONAL_WING_SCENE) {
    return `${PERSONAL_WING_SCENE}@${portal.targetWing || 0}`;
  }
  return portal.targetScene;
}
