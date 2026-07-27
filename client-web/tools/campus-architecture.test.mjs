import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file) => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));
const properties = (value) => Object.fromEntries(
  (value.properties || []).map((entry) => [entry.name, entry.value]),
);
const objectsIn = (map, role) => map.layers
  .filter((layer) => properties(layer).oqRole === role)
  .flatMap((layer) => layer.objects || []);

test('campus respeita as quantidades de cômodos do produto', () => {
  const campus = read('../tiled/maps/tooq-campus.tmj');
  const rooms = objectsIn(campus, 'rooms').map((room) => ({
    ...room,
    extra: JSON.parse(properties(room).extraJson || '{}'),
    id: properties(room).id,
  }));
  assert.equal(rooms.filter((room) => room.extra.meeting).length, 5);
  assert.equal(rooms.filter((room) => room.id.startsWith('one-on-one-')).length, 10);
  assert.equal(rooms.filter((room) => room.id === 'games').length, 1);
  assert.equal(rooms.filter((room) => room.id === 'kitchen').length, 1);
  assert.equal(rooms.filter((room) => room.id.startsWith('study-')).length, 3);
});

test('toda estação é o próprio assento de trabalho, sem procurar sofá próximo', () => {
  const campus = read('../maps/tooq-campus.json');
  const workstations = campus.furniture.filter((item) => (
    item.interactionType === 'seat' && item.interactionKey?.includes(':station')
  ));

  assert.equal(workstations.length, 11);
  for (const workstation of workstations) {
    assert.ok(workstation.collision.h >= 0.75, `${workstation.interactionKey} precisa bloquear a mesa`);
    assert.equal(workstation.seatPose, 'idle');
    assert.equal(workstation.seatDir, 'up');
    assert.equal(workstation.seatY, -1.625);
    assert.equal(workstation.seatCover, 20);
  }
  const sofas = campus.furniture.filter((item) => (
    item.interactionType === 'seat' && !item.interactionKey
  ));
  assert.ok(sofas.length > 0);
  assert.ok(sofas.every((sofa) => sofa.seatPose === 'sit'));
});

test('campus mantém portas internas frontais e usa vãos livres nas saídas externas', () => {
  const campus = read('../tiled/maps/tooq-campus.tmj');
  const rooms = objectsIn(campus, 'rooms');
  const doors = objectsIn(campus, 'doors');
  const building = objectsIn(campus, 'structures')
    .find((item) => item.type === 'building');

  assert.equal(properties(building).floor, 'wood');
  assert.ok(rooms.every((room) => properties(room).floor === 'wood'));
  const exits = doors.filter((entry) => (
    JSON.parse(properties(entry).extraJson || '{}').openExit
  ));
  const internal = doors.filter((entry) => !exits.includes(entry));
  assert.ok(internal.every((entry) => properties(entry).side === 'S'));
  assert.ok(exits.length >= 7);
  assert.deepEqual(
    [...new Set(exits.map((entry) => properties(entry).side))].sort(),
    ['E', 'N', 'S', 'W'],
  );
  assert.ok(exits.every((entry) => !properties(entry).texture), 'saída externa não deve ter porta');
});

test('fileiras compartilham paredes sem bloquear o eixo central de circulação', () => {
  const campus = read('../tiled/maps/tooq-campus.tmj');
  const rooms = objectsIn(campus, 'rooms').map((room) => ({
    x: room.x / 16,
    y: room.y / 16,
    right: (room.x + room.width) / 16 - 1,
    id: properties(room).id,
  }));

  for (const prefix of ['meeting-', 'one-on-one-']) {
    const row = rooms.filter((room) => room.id.startsWith(prefix)).sort((a, b) => a.x - b.x);
    assert.equal(row[0].x, 14);
    assert.equal(row.at(-1).right, 137);
    assert.ok(row.every((room) => room.right <= 70 || room.x >= 82));
    for (const side of [
      row.filter((room) => room.right <= 70),
      row.filter((room) => room.x >= 82),
    ]) {
      for (let index = 1; index < side.length; index++) {
        assert.equal(side[index - 1].right, side[index].x);
      }
    }
  }
});

test('quintal envolve o prédio e qualquer borda oferece retorno ao mundo', () => {
  const campus = read('../tiled/maps/tooq-campus.tmj');
  const structures = objectsIn(campus, 'structures');
  const landscape = objectsIn(campus, 'landscape');
  const collisions = objectsIn(campus, 'collisions');
  const navigation = objectsIn(campus, 'navigation');

  const yard = structures.find((item) => item.type === 'yard');
  const building = structures.find((item) => item.type === 'building');
  assert.equal(properties(yard).ground, 'grass');
  assert.ok(building.x > yard.x);
  assert.ok(building.y > yard.y);
  assert.ok(building.x + building.width < yard.x + yard.width);
  assert.ok(building.y + building.height < yard.y + yard.height);
  const back = building.y - yard.y;
  const front = yard.y + yard.height - building.y - building.height;
  assert.ok(back > front, 'o jardim dos fundos precisa ser maior que o frontal');
  assert.ok(landscape.some((item) => item.type === 'path'));
  assert.equal(collisions.filter((item) => item.type === 'collision').length, 4);
  assert.ok(landscape.some((item) => properties(item).assetId === 'fountain'));
  const trees = landscape.filter((item) => ['tree1', 'tree2'].includes(properties(item).assetId));
  assert.ok(trees.some((item) => item.x < building.x));
  assert.ok(trees.some((item) => item.x > building.x + building.width));
  assert.ok(trees.some((item) => item.y < building.y));
  const exits = navigation.filter((item) => properties(item).id?.startsWith('yard-exit-'));
  assert.equal(exits.length, 4);
  assert.ok(exits.every((exit) => (
    properties(exit).targetScene === 'world' && properties(exit).targetSpawn === 'from-campus'
  )));
  const sides = new Set(exits.map((exit) => properties(exit).id.split('-').at(-1)));
  assert.deepEqual([...sides].sort(), ['east', 'north', 'south', 'west']);
});

test('núcleo vertical reserva elevador e escadas sem invadir o corredor central', () => {
  const campus = read('../tiled/maps/tooq-campus.tmj');
  const access = objectsIn(campus, 'mechanics').filter((item) => item.type === 'verticalAccess');
  assert.deepEqual(
    access.map((item) => properties(item).accessType).sort(),
    ['elevator', 'stairs'],
  );
  assert.ok(access.every((item) => item.x + item.width <= 59 * 16 || item.x >= 70 * 16));
  assert.ok(access.every((item) => properties(item).targetScene === 'personal-wing'));
  assert.deepEqual(
    access.map((item) => properties(item).targetSpawn).sort(),
    ['from-campus-elevator', 'from-campus-stairs'],
  );
  for (const item of access) {
    assert.equal(item.y / 16, properties(item).visualY);
    assert.ok(item.height >= 4 * 16, 'sensor precisa ocupar somente a faixa livre à frente');
  }
  const stairs = access.find((item) => properties(item).accessType === 'stairs');
  const stairValues = properties(stairs);
  assert.equal(stairValues.blockY + stairValues.blockH, stairs.y / 16);
  assert.equal(stairValues.blockX + stairValues.blockW / 2, stairValues.visualX);

  const shaft = objectsIn(campus, 'rooms')
    .find((item) => properties(item).id === 'elevator-shaft');
  assert.ok(shaft);
  assert.equal(JSON.parse(properties(shaft).extraJson).hideLabel, true);
  assert.ok(fs.existsSync(new URL('../assets/architecture/limezu_elevator_door.png', import.meta.url)));
  assert.ok(fs.existsSync(new URL('../assets/architecture/limezu_stairs_wood.png', import.meta.url)));
});

test('elevador e escadas da ala pessoal retornam de verdade ao térreo', () => {
  const wing = read('../tiled/maps/personal-wing.tmj');
  const access = objectsIn(wing, 'mechanics').filter((item) => item.type === 'verticalAccess');
  assert.deepEqual(
    access.map((item) => properties(item).accessType).sort(),
    ['elevator', 'stairs'],
  );
  assert.ok(access.every((item) => properties(item).targetScene === 'tooq-campus'));
  assert.deepEqual(
    access.map((item) => properties(item).targetSpawn).sort(),
    ['from-personal-wing-elevator', 'from-personal-wing-stairs'],
  );
  assert.ok(access.every((item) => item.y / 16 === properties(item).visualY));
});

test('ala pessoal tem doze slots físicos e públicos', () => {
  const wing = read('../tiled/maps/personal-wing.tmj');
  const rooms = objectsIn(wing, 'rooms');
  const slots = rooms.map((room) => JSON.parse(properties(room).extraJson || '{}').slotIndex);
  assert.deepEqual(slots.sort((a, b) => a - b), [...Array(12).keys()]);
  assert.equal(new Set(slots).size, 12);
  assert.ok(rooms.every((room) => properties(room).floor === 'wood'));
});

test('salas pessoais compartilham paredes e usam o perímetro da ala', () => {
  const wing = read('../tiled/maps/personal-wing.tmj');
  const rooms = objectsIn(wing, 'rooms').map((room) => ({
    x: room.x / 16,
    y: room.y / 16,
    right: (room.x + room.width) / 16 - 1,
  }));
  const building = objectsIn(wing, 'structures').find((item) => item.type === 'building');

  assert.equal(properties(building).floor, 'wood');
  for (const y of new Set(rooms.map((room) => room.y))) {
    const row = rooms.filter((room) => room.y === y).sort((a, b) => a.x - b.x);
    assert.equal(row[0].x, 2);
    assert.equal(row.at(-1).right, 93);
    for (let index = 1; index < row.length; index++) {
      assert.equal(row[index - 1].right, row[index].x);
    }
  }
});

test('campus expõe as features reais por interação orientada a dados', () => {
  const campus = read('../tiled/maps/tooq-campus.tmj');
  const types = new Set(objectsIn(campus, 'furniture')
    .map((item) => properties(item).interactionType)
    .filter(Boolean));
  for (const required of ['kanban', 'timeclock', 'coffee', 'whiteboard', 'seat', 'store']) {
    assert.ok(types.has(required), `interação ausente: ${required}`);
  }
  assert.ok(objectsIn(campus, 'furniture').some((item) => {
    const values = properties(item);
    return values.interactionType === 'seat' && values.interactionKey?.includes(':station');
  }), 'a estação precisa iniciar trabalho pelo próprio assento');
  assert.ok(objectsIn(campus, 'mechanics').some((item) => item.type === 'chess'));
});

test('todo objeto físico do campus possui footprint calibrado', () => {
  const campus = read('../tiled/maps/tooq-campus.tmj');
  const physicalFurniture = new Set([
    'of_175', 'of_196', 'of_197', 'of_320', 'of_321', 'of_323',
    'station_white_dual', 'station_white_pc', 'station_dark_dual',
  ]);
  for (const item of objectsIn(campus, 'furniture')) {
    const values = properties(item);
    if (!physicalFurniture.has(values.assetId)) continue;
    assert.ok(values.collisionW > 0 && values.collisionH > 0, `sem footprint: ${values.assetId}`);
  }

  const landscape = objectsIn(campus, 'landscape');
  for (const assetId of ['fountain', 'bench', 'tree1', 'tree2']) {
    const matches = landscape.filter((item) => properties(item).assetId === assetId);
    assert.ok(matches.length > 0);
    assert.ok(matches.every((item) => properties(item).collisionW > 0));
  }
});

test('poltronas do campus preservam o encaixe calibrado do avatar', () => {
  const campus = read('../tiled/maps/tooq-campus.tmj');
  const armchairs = objectsIn(campus, 'furniture')
    .filter((item) => ['of_196', 'of_197'].includes(properties(item).assetId));
  assert.ok(armchairs.length > 0);
  for (const armchair of armchairs) {
    const values = properties(armchair);
    assert.equal(values.seatX, -0.5);
    assert.equal(values.seatY, -0.875);
    assert.equal(values.seatPose, 'sit');
  }
});

test('hub mantém os três escritórios e registra o interior das casas', () => {
  const manifest = read('../maps/scenes.json');
  for (const id of [
    'world', 'tooq-office', 'tooq-office-1', 'tooq-campus', 'personal-wing',
    'player-home-shell',
  ]) {
    assert.ok(manifest.scenes.some((scene) => scene.id === id), `cena ausente: ${id}`);
  }
  const world = read('../tiled/maps/world.tmj');
  const portals = objectsIn(world, 'navigation')
    .filter((item) => item.type === 'portal')
    .map((item) => properties(item));
  assert.ok(portals.some((portal) => portal.targetScene === 'tooq-campus'));
  assert.ok(portals.some((portal) => portal.targetScene === 'tooq-office'));
  assert.ok(portals.some((portal) => portal.targetScene === 'tooq-office-1'));
  assert.equal(
    portals.filter((portal) => portal.targetScene?.startsWith('player-home-shell@')).length,
    12,
  );
});

test('mundo aberto tem cidade cercada, estradas e Tooq Office perto do spawn', () => {
  const world = read('../tiled/maps/world.tmj');
  const propsLayer = objectsIn(world, 'props');
  const navigation = objectsIn(world, 'navigation');
  const collisions = objectsIn(world, 'collisions');
  const visual = world.layers.filter((layer) => properties(layer).oqRole === 'visual');
  const assetIds = propsLayer.map((item) => properties(item).assetId);

  assert.ok(world.width >= 200 && world.height >= 140);
  assert.ok(assetIds.includes('office_tooq'));
  assert.ok(assetIds.includes('office_generic'));
  assert.ok(assetIds.includes('office_lime'));
  assert.equal(assetIds.filter((id) => ['house_country', 'house_japanese'].includes(id)).length, 12);
  const façades = propsLayer.filter((item) => [
    'office_tooq', 'office_generic', 'office_lime', 'house_country', 'house_japanese',
  ].includes(properties(item).assetId));
  assert.ok(
    façades.every((item) => properties(item).originX === 0),
    'fachadas, portas e footprints devem compartilhar a mesma borda esquerda',
  );
  assert.equal(collisions.filter((item) => item.name.startsWith('Cerca ')).length, 4);
  const façadeCollisions = collisions.filter((item) => item.name.startsWith('Fachada ·'));
  assert.equal(façadeCollisions.length, 15);
  assert.ok(
    façadeCollisions.every((item) => item.width >= 12 * 16 && item.height >= 15 * 16),
    'cada prédio e casa precisa bloquear toda a área ocupada pela fachada',
  );
  assert.ok(visual.some((layer) => layer.name.includes('Estradas') && layer.data.some(Boolean)));
  assert.ok(visual.some((layer) => layer.name.includes('Cercas') && layer.data.some(Boolean)));

  const defaultSpawn = navigation.find((item) => properties(item).id === 'default');
  const tooq = navigation.find((item) => properties(item).id === 'tooq-office-door');
  const distance = Math.hypot(defaultSpawn.x - tooq.x, defaultSpawn.y - tooq.y) / 16;
  assert.ok(distance < 25, 'Tooq Office deve permanecer perto do spawn principal');
});

test('vilarejo possui doze destinos únicos para o interior vazio compartilhado', () => {
  const world = read('../tiled/maps/world.tmj');
  const navigation = objectsIn(world, 'navigation');
  const homes = navigation
    .filter((item) => properties(item).id?.match(/^house-\d{2}-door$/))
    .map((item) => properties(item));
  assert.equal(homes.length, 12);
  assert.equal(new Set(homes.map((home) => home.targetScene)).size, 12);
  assert.ok(homes.every((home) => home.targetScene.startsWith('player-home-shell@house-')));

  const shell = read('../tiled/maps/player-home-shell.tmj');
  assert.equal(objectsIn(shell, 'furniture').length, 0);
  const returnPortal = objectsIn(shell, 'navigation')
    .find((item) => properties(item).id === 'return-home');
  assert.equal(properties(returnPortal).targetScene, 'world');
});
