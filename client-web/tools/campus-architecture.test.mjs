import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTiledMap } from '../src/TiledRuntimeLoader.js';

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
  // Um cômodo de cada: o prédio pequeno é a decisão de produto, não um estágio.
  for (const id of ['meeting', 'games', 'kitchen', 'study', 'one-on-one']) {
    assert.equal(rooms.filter((room) => room.id === id).length, 1, `cômodo ausente: ${id}`);
  }
  assert.equal(rooms.filter((room) => room.extra.meeting).length, 1);
  const building = objectsIn(campus, 'structures').find((item) => item.type === 'building');
  assert.ok(
    (building.width / 16) * (building.height / 16) <= 2200,
    'o prédio precisa caber em poucas telas — foi o ponto do redesenho',
  );
});

test('a sala grande é uma zona de voz própria, em duas metades do mesmo canal', () => {
  const campus = read('../tiled/maps/tooq-campus.tmj');
  const zones = objectsIn(campus, 'zones').map((zone) => ({
    id: properties(zone).id,
    extra: JSON.parse(properties(zone).extraJson || '{}'),
  }));
  const openSpace = zones.filter((zone) => zone.id === 'open-space');
  assert.equal(openSpace.length, 2, 'a sala grande é um "L": duas metades');
  assert.ok(openSpace.every((zone) => zone.extra.voice === true));
  // Tapete é só piso: se virar canal, cada tapete abre uma reunião paralela.
  assert.ok(zones.filter((zone) => zone.id.startsWith('rug-')).every((zone) => !zone.extra.voice));
});

test('a sala de reunião fica na entrada e ganha fone pela flag de reunião', () => {
  const campus = read('../tiled/maps/tooq-campus.tmj');
  const meeting = objectsIn(campus, 'rooms')
    .find((room) => properties(room).id === 'meeting');
  const building = objectsIn(campus, 'structures').find((item) => item.type === 'building');
  const entrance = objectsIn(campus, 'doors').find((entry) => (
    properties(entry).parent === 'building' && properties(entry).side === 'S'
  ));

  assert.equal(JSON.parse(properties(meeting).extraJson).meeting, true);
  // Encostada na parede sul do prédio, do mesmo lado da porta de entrada.
  assert.equal(meeting.y + meeting.height, building.y + building.height);
  assert.ok(Math.abs(meeting.x - building.x) < 16);
  assert.ok(entrance, 'o prédio precisa de um vão de entrada ao sul');
  // A porta deslizante foi desenhada para a parede norte, de duas linhas; girada na tira
  // fina da lateral ela fica solta no chão. E precisa sair do centro, que é onde a
  // `MeetingHeadset` pendura o fone.
  const meetingDoor = properties(objectsIn(campus, 'doors')
    .find((entry) => properties(entry).parent === 'meeting'));
  assert.equal(meetingDoor.side, 'N');
  const headsetColumn = meeting.x / 16 + meeting.width / 32;
  const doorColumns = [meeting.x / 16 + meetingDoor.at, meeting.x / 16 + meetingDoor.at + 1];
  assert.ok(!doorColumns.includes(headsetColumn), 'porta e fone disputam o mesmo lugar');
});

test('toda estação é o próprio assento de trabalho, sem procurar sofá próximo', () => {
  const campus = read('../maps/tooq-campus.json');
  const workstations = campus.furniture.filter((item) => (
    item.interactionType === 'seat' && item.interactionKey?.includes(':station')
  ));

  assert.ok(workstations.length >= 6);
  for (const workstation of workstations) {
    assert.ok(workstation.collision.h >= 0.75, `${workstation.interactionKey} precisa bloquear a mesa`);
    assert.equal(workstation.seatPose, 'idle');
    assert.equal(workstation.seatDir, 'up');
    assert.equal(workstation.seatY, -1.625);
    assert.equal(workstation.seatCover, 20);
  }
  // Assento de estar: cadeira de perfil com a pose lateral, ou sofá de frente com o
  // `seatCover` escondendo as pernas. O que não pode é assento sem um dos dois.
  const lounging = campus.furniture.filter((item) => (
    item.interactionType === 'seat' && !item.interactionKey
  ));
  assert.ok(lounging.length > 0);
  assert.ok(lounging.some((seat) => seat.seatPose === 'sit'), 'sumiram as cadeiras de perfil');
  assert.ok(lounging.some((seat) => seat.seatPose === 'idle'), 'nenhum sofá ficou utilizável');
  assert.ok(lounging.every((seat) => (
    seat.seatPose === 'sit' || (seat.seatDir === 'down' && seat.seatCover > 0)
  )));
});

test('campus mantém portas internas frontais e usa vãos livres nas saídas externas', () => {
  const campus = read('../tiled/maps/tooq-campus.tmj');
  const rooms = objectsIn(campus, 'rooms');
  const doors = objectsIn(campus, 'doors');
  const building = objectsIn(campus, 'structures')
    .find((item) => item.type === 'building');

  assert.equal(properties(building).floor, 'wood');
  const exits = doors.filter((entry) => (
    JSON.parse(properties(entry).extraJson || '{}').openExit
  ));
  const internal = doors.filter((entry) => !exits.includes(entry));
  assert.ok(internal.every((entry) => ['S', 'N'].includes(properties(entry).side)));
  assert.ok(exits.length >= 3);
  assert.deepEqual(
    [...new Set(exits.map((entry) => properties(entry).side))].sort(),
    ['E', 'S', 'W'],
  );
  assert.ok(exits.every((entry) => !properties(entry).texture), 'saída externa não deve ter porta');
  // Todo cômodo fechado precisa de porta — uma sala sem vão é uma sala inalcançável.
  const closed = rooms.filter((entry) => properties(entry).id !== 'elevator-shaft');
  for (const entry of closed) {
    assert.ok(
      doors.some((item) => properties(item).parent === properties(entry).id),
      `sala sem porta: ${properties(entry).id}`,
    );
  }
});

test('a faixa de cômodos compartilha paredes e ocupa o prédio de ponta a ponta', () => {
  const campus = read('../tiled/maps/tooq-campus.tmj');
  const building = objectsIn(campus, 'structures').find((item) => item.type === 'building');
  const row = objectsIn(campus, 'rooms')
    .map((entry) => ({
      x: entry.x / 16,
      y: entry.y / 16,
      right: (entry.x + entry.width) / 16 - 1,
      id: properties(entry).id,
    }))
    .filter((entry) => ['kitchen', 'games', 'study', 'one-on-one'].includes(entry.id))
    .sort((a, b) => a.x - b.x);

  assert.equal(row.length, 4);
  assert.equal(row[0].x, building.x / 16);
  assert.equal(row.at(-1).right, (building.x + building.width) / 16 - 1);
  assert.ok(row.every((entry) => entry.y === building.y / 16));
  for (let index = 1; index < row.length; index++) {
    assert.equal(row[index - 1].right, row[index].x, 'salas vizinhas dividem a parede');
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
  assert.ok(access.every((item) => properties(item).targetScene === 'personal-wing'));
  assert.deepEqual(
    access.map((item) => properties(item).targetSpawn).sort(),
    ['from-elevator', 'from-stairs-below'],
  );
  // Núcleo agrupado num canto: os dois acessos ficam lado a lado, fora da faixa de entrada.
  const meeting = objectsIn(campus, 'rooms').find((item) => properties(item).id === 'meeting');
  assert.ok(access.every((item) => item.x > meeting.x + meeting.width));
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

test('o andar desce ao térreo pelo elevador e anda de andar pelas escadas', () => {
  const wing = read('../tiled/maps/personal-wing.tmj');
  const access = objectsIn(wing, 'mechanics').filter((item) => item.type === 'verticalAccess');
  const byId = new Map(access.map((item) => [properties(item).id, properties(item)]));

  assert.equal(byId.get('wing-elevator').targetScene, 'tooq-campus');
  assert.equal(byId.get('wing-stairs-up').floorDelta, 1);
  assert.equal(byId.get('wing-stairs-down').floorDelta, -1);
  // Spawn nomeado pelo lado de onde a pessoa chega: o mesmo destino serve andar e térreo.
  assert.equal(byId.get('wing-stairs-up').targetSpawn, 'from-stairs-below');
  assert.equal(byId.get('wing-stairs-down').targetSpawn, 'from-stairs-above');
  const spawns = objectsIn(wing, 'navigation')
    .filter((item) => item.type === 'spawn')
    .map((item) => properties(item).id);
  for (const id of ['from-stairs-above', 'from-stairs-below', 'from-elevator']) {
    assert.ok(spawns.includes(id), `spawn ausente na ala: ${id}`);
  }
  const campusSpawns = objectsIn(read('../tiled/maps/tooq-campus.tmj'), 'navigation')
    .filter((item) => item.type === 'spawn')
    .map((item) => properties(item).id);
  for (const id of ['from-stairs-above', 'from-elevator']) {
    assert.ok(campusSpawns.includes(id), `spawn ausente no térreo: ${id}`);
  }
  assert.ok(access.every((item) => item.y / 16 === properties(item).visualY));
});

test('cada andar tem seis salas físicas e públicas', () => {
  const wing = read('../tiled/maps/personal-wing.tmj');
  const rooms = objectsIn(wing, 'rooms');
  const slots = rooms
    .map((room) => JSON.parse(properties(room).extraJson || '{}').slotIndex)
    .filter((slot) => slot != null);
  assert.deepEqual(slots.sort((a, b) => a - b), [...Array(6).keys()]);
  assert.ok(rooms.every((room) => properties(room).floor === 'wood'));
  // O poço do elevador existe em todo andar, não só no térreo: sem ele a porta do
  // elevador fica colada numa parede que não existe.
  assert.ok(rooms.some((room) => properties(room).id === 'elevator-shaft'));
});

test('salas pessoais compartilham paredes e usam o perímetro do andar', () => {
  const wing = read('../tiled/maps/personal-wing.tmj');
  const rooms = objectsIn(wing, 'rooms')
    .filter((room) => JSON.parse(properties(room).extraJson || '{}').slotIndex != null)
    .map((room) => ({
      x: room.x / 16,
      y: room.y / 16,
      right: (room.x + room.width) / 16 - 1,
    }));
  const building = objectsIn(wing, 'structures').find((item) => item.type === 'building');
  const left = building.x / 16;
  const right = (building.x + building.width) / 16 - 1;

  assert.equal(properties(building).floor, 'wood');
  for (const y of new Set(rooms.map((room) => room.y))) {
    const row = rooms.filter((room) => room.y === y).sort((a, b) => a.x - b.x);
    assert.equal(row.length, 3);
    assert.equal(row[0].x, left);
    assert.equal(row.at(-1).right, right);
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

test('só cadeira de perfil é assento, e espelhada o encaixe acompanha', () => {
  const campus = read('../tiled/maps/tooq-campus.tmj');
  const seats = objectsIn(campus, 'furniture')
    .map((item) => properties(item))
    .filter((values) => values.interactionType === 'seat' && !values.interactionKey?.includes(':station'));

  assert.ok(seats.length > 0);
  for (const seat of seats) {
    if (seat.seatPose === 'sit') {
      // A folha `sit` do pack só tem lateral boa (ASSETS.md §3.1): de perfil, é cadeira de
      // perfil. `of_306`/`of_307` têm o encosto à direita, então sem espelhar encara a
      // esquerda — e espelhar move o conteúdo para a outra metade do quadro de 32 px.
      assert.ok(['of_306', 'of_307'].includes(seat.assetId), `pose lateral em peça de frente: ${seat.assetId}`);
      assert.equal(seat.seatY, -1.125);
      assert.equal(seat.seatX, seat.flipX ? 0.5 : -0.5);
      assert.equal(seat.seatDir, seat.flipX ? 'right' : 'left');
      continue;
    }
    // Sofá é de frente: usa o truque da estação ao contrário — `idle` virado para a câmera
    // e `seatCover` redesenhando a frente do estofado por cima das pernas.
    assert.equal(seat.seatPose, 'idle');
    assert.equal(seat.seatDir, 'down');
    assert.ok(seat.seatCover > 0, `sofá sem seatCover deixa o avatar em pé sobre ele: ${seat.assetId}`);
  }
});

// Asset faltando não quebra o gerador nem o carregador: só some no jogo, ou trava o
// preload num 404. Como o boot do Phaser não roda aqui, a checagem é do arquivo em disco.
for (const sceneId of ['tooq-campus', 'personal-wing']) {
  test(`toda textura de ${sceneId} existe em disco`, async () => {
    const map = await loadTiledMap(
      pathToFileURL(fileURLToPath(new URL(`../tiled/maps/${sceneId}.tmj`, import.meta.url))).href,
      { fetchJson: async (url) => JSON.parse(fs.readFileSync(fileURLToPath(url), 'utf8')) },
    );
    assert.ok(map.tiledTextures.length > 0);
    for (const texture of map.tiledTextures) {
      assert.ok(fs.existsSync(fileURLToPath(texture.url)), `textura ausente: ${texture.key}`);
    }
    // A mesa de xadrez é desenhada pela mecânica, então não aparece em tiledTextures.
    if (map.entities?.some((entity) => entity.type === 'chess')) {
      assert.ok(fs.existsSync(new URL('../assets/furniture/composites/chess_table.png', import.meta.url)));
    }
  });
}

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
  assert.equal(façadeCollisions.length, 16);
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

test('Casino Nerd oferece Arrange Dice, Nerd Slots unificado e Blackjack orientados a dados', () => {
  const casino = read('../tiled/maps/casino-nerd.tmj');
  const allMechanics = objectsIn(casino, 'mechanics');
  const mechanics = allMechanics
    .filter((item) => item.type === 'arrangeDiceTable');
  const slots = allMechanics.filter((item) => item.type === 'nerdSlotMachine');
  const blackjack = allMechanics.filter((item) => item.type === 'blackjackTable');
  const navigation = objectsIn(casino, 'navigation');
  const structures = objectsIn(casino, 'structures');
  const building = structures.find((item) => item.type === 'building');
  const buildingExtra = JSON.parse(properties(building).extraJson);

  assert.equal(mechanics.length, 3);
  assert.equal(new Set(mechanics.map((item) => properties(item).tableId)).size, 3);
  assert.ok(mechanics.every((item) => properties(item).gameId === 'arrange-dice'));
  assert.ok(mechanics.every((item) => item.width === 64 && item.height === 40));
  assert.equal(slots.length, 2);
  assert.ok(slots.every((item) => properties(item).gameId === 'nerd-slots'));
  assert.ok(slots.every((item) => item.width === 40 && item.height === 60));
  assert.equal(new Set(slots.map((item) => properties(item).tableId)).size, 2);
  assert.equal(allMechanics.filter((item) => item.type === 'pokemonSlotMachine').length, 0);
  assert.equal(blackjack.length, 1);
  assert.equal(properties(blackjack[0]).gameId, 'blackjack');
  assert.equal(blackjack[0].width, 80);
  assert.equal(blackjack[0].height, 40);
  assert.ok(navigation.some((item) => properties(item).id === 'tables'));
  assert.ok(navigation.some((item) => properties(item).id === 'slots'));
  assert.ok(navigation.some((item) => properties(item).id === 'blackjack'));
  for (const [spawnId, target] of [['slots', slots[0]], ['blackjack', blackjack[0]]]) {
    const spawn = navigation.find((item) => properties(item).id === spawnId);
    const radius = Number(properties(target).interactionRadius) * 16;
    const interactionX = target.x + target.width / 2;
    const interactionY = target.y + target.height - 16;
    assert.ok(Math.hypot(spawn.x - interactionX, spawn.y - interactionY) <= radius,
      `spawn ${spawnId} precisa alcançar a interação após redimensionar o asset`);
  }
  assert.equal(buildingExtra.voice, true, 'todo o prédio deve compartilhar a reunião');
  assert.equal(buildingExtra.id, 'casino-meeting');
  assert.equal(structures.filter((item) => (
    item.type === 'zone' && JSON.parse(properties(item).extraJson || '{}').voice
  )).length, 0, 'não deve existir uma sala de reunião separada');
  assert.ok(fs.existsSync(new URL('../assets/casino/generic/nerd-slot-machine.png', import.meta.url)));
  assert.ok(fs.existsSync(new URL('../assets/casino/generic/blackjack-table.png', import.meta.url)));
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

// O vão da porta é recortado da parede por chave de tile no `MapRenderer`
// (`${rect.x + door.at + i},${bottom}`): meio tile de desalinho não casa com chave
// nenhuma, a parede continua inteira e a porta vira um adesivo colado por cima.
test('toda porta cai na grade de tiles do prédio ou do cômodo', () => {
  const manifest = read('../maps/scenes.json');
  for (const scene of manifest.scenes) {
    const map = read(`../${scene.file}`);
    const objects = map.layers.flatMap((layer) => layer.objects || []);
    const parents = new Map(objects
      .filter((item) => ['building', 'room'].includes(item.type))
      .map((item) => [item.type === 'building' ? 'building' : properties(item).id, item]));
    for (const door of objects.filter((item) => item.type === 'door')) {
      const parent = parents.get(properties(door).parent);
      assert.ok(parent, `${scene.id}: porta sem parent — ${door.name}`);
      const at = ['N', 'S'].includes(properties(door).side)
        ? (door.x - parent.x) / 16
        : (door.y - parent.y) / 16;
      assert.ok(Number.isInteger(at), `${scene.id}: porta fora da grade — ${door.name} (at=${at})`);
    }
  }
});

// `casino_nerd.png` reaproveita o footprint e a máscara do `office_generic.png`, então
// a entrada desenhada cai no mesmo recorte nos dois prédios: portal e spawn precisam
// pousar sobre ela, senão o jogador entra atravessando a parede ao lado da porta.
test('portal e spawn dos prédios do mundo pousam sobre a entrada da fachada', () => {
  const world = read('../tiled/maps/world.tmj');
  const props = objectsIn(world, 'props');
  const navigation = objectsIn(world, 'navigation');
  // Faixa da porta medida em pixels nas duas artes (`assets/world/*.png`).
  const doorway = { start: 90, end: 121 };
  const entrances = [
    { assetId: 'casino_nerd', portal: 'casino-nerd-door', spawn: 'from-casino-nerd' },
    { assetId: 'office_generic', portal: 'tooq-comercio-door', spawn: 'from-tooq-comercio' },
  ].map((entry) => {
    const portal = navigation.find((item) => item.name === entry.portal);
    const spawn = navigation.find((item) => item.name === entry.spawn);
    // `office_generic` se repete no mundo (o Coworking usa a mesma arte): a fachada
    // desta entrada é a que fica embaixo do portal, não a primeira da camada.
    const façade = props.find((item) => (
      properties(item).assetId === entry.assetId
      && portal.x >= item.x && portal.x < item.x + item.width
    ));
    assert.ok(façade, `${entry.portal} não está sobre nenhuma fachada ${entry.assetId}`);
    return {
      ...entry,
      left: portal.x - façade.x,
      right: portal.x + portal.width - façade.x,
      spawnAt: spawn.x - façade.x,
    };
  });

  for (const entrance of entrances) {
    assert.ok(
      entrance.left <= doorway.start && entrance.right >= doorway.end,
      `${entrance.portal} não cobre a porta desenhada na fachada`,
    );
    assert.ok(
      entrance.spawnAt >= entrance.left && entrance.spawnAt <= entrance.right,
      `${entrance.spawn} devolve o jogador fora da soleira`,
    );
  }
  assert.equal(entrances[0].left, entrances[1].left, 'fachadas iguais, mesmo offset de porta');
  assert.equal(entrances[0].spawnAt, entrances[1].spawnAt);
});
