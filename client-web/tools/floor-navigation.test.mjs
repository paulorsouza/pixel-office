import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTiledMap } from '../src/TiledRuntimeLoader.js';
import { personalWingIndex, resolveSceneTarget } from '../src/FloorNavigation.js';

const loadMap = (id) => loadTiledMap(
  pathToFileURL(fileURLToPath(new URL(`../tiled/maps/${id}.tmj`, import.meta.url))).href,
  { fetchJson: async (url) => JSON.parse(fs.readFileSync(fileURLToPath(url), 'utf8')) },
);
const accessOf = (map, id) => {
  const entity = map.entities.find((item) => item.id === id);
  assert.ok(entity, `acesso vertical ausente: ${id}`);
  return { ...entity, ...entity.properties };
};

test('andar da cena sai da referência, e o térreo não é andar', () => {
  assert.equal(personalWingIndex('tooq-campus'), null);
  assert.equal(personalWingIndex('personal-wing@0'), 0);
  assert.equal(personalWingIndex('personal-wing@3'), 3);
  assert.equal(personalWingIndex('personal-wing'), 0);
});

test('escada sobe e desce de verdade — o bug era o destino fixo', () => {
  const up = { targetScene: 'personal-wing', targetWing: 0, floorDelta: 1 };
  const down = { targetScene: 'personal-wing', targetWing: 0, floorDelta: -1 };

  assert.equal(resolveSceneTarget(up, 'personal-wing@0'), 'personal-wing@1');
  assert.equal(resolveSceneTarget(up, 'personal-wing@1'), 'personal-wing@2');
  assert.equal(resolveSceneTarget(down, 'personal-wing@1'), 'personal-wing@0');
  // Descer do primeiro andar sai dos andares: o térreo é outra cena.
  assert.equal(resolveSceneTarget(down, 'personal-wing@0'), 'tooq-campus');
  // Sem `floorDelta` o destino é fixo — é o caso da escada do térreo, que só sobe.
  assert.equal(
    resolveSceneTarget({ targetScene: 'personal-wing', targetWing: 0 }, 'tooq-campus'),
    'personal-wing@0',
  );
});

test('os acessos verticais dos mapas casam com os spawns do outro lado', async () => {
  const campus = await loadMap('tooq-campus');
  const wing = await loadMap('personal-wing');
  const spawnsOf = (map) => new Set(Object.keys(map.spawns || {}));

  const campusStairs = accessOf(campus, 'campus-stairs');
  const up = accessOf(wing, 'wing-stairs-up');
  const down = accessOf(wing, 'wing-stairs-down');
  const wingElevator = accessOf(wing, 'wing-elevator');
  const campusElevator = accessOf(campus, 'campus-elevator');

  assert.equal(Number(up.floorDelta), 1);
  assert.equal(Number(down.floorDelta), -1);
  // Quem sobe chega no andar; quem desce do primeiro andar chega no térreo.
  assert.ok(spawnsOf(wing).has(up.targetSpawn));
  assert.ok(spawnsOf(wing).has(down.targetSpawn));
  assert.ok(spawnsOf(campus).has(down.targetSpawn), 'o térreo precisa do mesmo spawn de descida');
  assert.ok(spawnsOf(wing).has(campusStairs.targetSpawn));
  assert.ok(spawnsOf(campus).has(wingElevator.targetSpawn));
  assert.ok(spawnsOf(wing).has(campusElevator.targetSpawn));
  // O elevador serve o prédio: o destino é escolhido no painel, não fixado no mapa.
  assert.equal(campusElevator.accessType, 'elevator');
  assert.equal(wingElevator.accessType, 'elevator');
});

test('poço do elevador existe nos dois lados da viagem', async () => {
  for (const id of ['tooq-campus', 'personal-wing']) {
    const map = await loadMap(id);
    const shaft = map.rooms.find((room) => room.id === 'elevator-shaft');
    assert.ok(shaft, `sem poço em ${id}`);
    const elevator = map.entities.find((item) => (
      (item.properties?.accessType || item.accessType) === 'elevator'
    ));
    const visualX = Number(elevator.properties.visualX);
    const visualY = Number(elevator.properties.visualY);
    // A porta fica na face sul do poço, não solta no meio do salão.
    assert.ok(visualX > shaft.x && visualX < shaft.x + shaft.w);
    assert.equal(visualY, shaft.y + shaft.h);
  }
});

test('a escada de descida tem arte própria', () => {
  assert.ok(fs.existsSync(new URL('../assets/architecture/limezu_stairs_wood.png', import.meta.url)));
  assert.ok(fs.existsSync(new URL('../assets/architecture/limezu_stairs_wood_down.png', import.meta.url)));
});
