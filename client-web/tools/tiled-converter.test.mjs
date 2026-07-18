import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  CLIENT_ROOT,
  FIRST_GID,
  generateTilesets,
  runtimeToTiled,
  tiledToRuntime,
} from './tiled-converter.mjs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const manifest = readJson(resolve(CLIENT_ROOT, 'maps/scenes.json'));
const palettes = readJson(resolve(CLIENT_ROOT, 'tiled/palettes.json')).palettes;
const animations = readJson(resolve(CLIENT_ROOT, 'assets/animations/catalog.json'));
const equipmentCatalog = readJson(resolve(CLIENT_ROOT, 'assets/equipment/catalog.json'));
const characterCatalog = readJson(resolve(CLIENT_ROOT, 'assets/character/catalog.json'));
const furnitureCatalog = readJson(resolve(CLIENT_ROOT, 'assets/furniture/catalog.json'));
const clientIndexSource = readFileSync(resolve(CLIENT_ROOT, 'index.html'), 'utf8');
const rendererSource = readFileSync(resolve(CLIENT_ROOT, 'src/MapRenderer.js'), 'utf8');
const rendererModule = await import(
  `data:text/javascript;base64,${Buffer.from(rendererSource).toString('base64')}`
);
const equipmentSource = readFileSync(resolve(CLIENT_ROOT, 'src/EquipmentSystem.js'), 'utf8');
const equipmentModule = await import(
  `data:text/javascript;base64,${Buffer.from(equipmentSource).toString('base64')}`
);
const characterSource = readFileSync(resolve(CLIENT_ROOT, 'src/CharacterSystem.js'), 'utf8');
const characterModule = await import(
  `data:text/javascript;base64,${Buffer.from(characterSource).toString('base64')}`
);
const decorationModule = await import(
  `${pathToFileURL(resolve(CLIENT_ROOT, 'src/RoomDecorationSystem.js')).href}?test=${Date.now()}`
);

test('catálogo de decoração é curado, categorizado e usa assets versionados', () => {
  assert.ok(furnitureCatalog.items.length >= 30);
  assert.deepEqual(
    furnitureCatalog.categories.map((category) => category.id),
    ['desks', 'workstations', 'seating', 'storage', 'decor'],
  );
  for (const item of furnitureCatalog.items) {
    assert.ok(existsSync(resolve(CLIENT_ROOT, item.path)), `${item.id}: ${item.path}`);
    assert.ok(
      furnitureCatalog.categories.some((category) => category.id === item.category),
      `${item.id}: categoria válida`,
    );
  }
  assert.match(clientIndexSource, /id="room-decoration-panel"/);
  assert.match(clientIndexSource, /id="room-decoration-catalog"/);
});

test('decoração persistida substitui apenas os móveis da sala escolhida', () => {
  const baseMap = readJson(resolve(CLIENT_ROOT, 'maps/tooq-office.json'));
  const officeA = baseMap.rooms.find((room) => room.id === 'office-a');
  const officeB = baseMap.rooms.find((room) => room.id === 'office-b');
  const officeBBefore = decorationModule.roomFurniture(baseMap, officeB);
  const decorated = decorationModule.applyRoomDecorationState(baseMap, {
    'office-a': [{ id: 'of_258', x: 8, y: 9, flipX: true }],
  }, furnitureCatalog);

  assert.deepEqual(decorationModule.roomFurniture(decorated, officeA), [{
    id: 'of_258',
    x: 8,
    y: 9,
    flipX: true,
    collision: furnitureCatalog.items.find((item) => item.id === 'of_258').collision,
  }]);
  assert.deepEqual(decorationModule.roomFurniture(decorated, officeB), officeBBefore);
  assert.notEqual(decorated, baseMap);
});

test('posicionamento respeita limites, circulação da porta e outros móveis', () => {
  const room = {
    id: 'test-room', x: 0, y: 0, w: 10, h: 10,
    doors: [{ side: 'S', at: 4, len: 2 }],
  };
  const item = decorationModule.normalizePlacedFurniture(
    furnitureCatalog,
    { id: 'of_98', x: 2, y: 3 },
  );
  assert.equal(decorationModule.validateFurniturePlacement(room, item, []).valid, true);
  assert.equal(
    decorationModule.validateFurniturePlacement(room, { ...item, x: 0 }, []).valid,
    false,
  );
  assert.equal(decorationModule.validateFurniturePlacement(room, item, [{ ...item }]).valid, false);
  assert.equal(
    decorationModule.validateFurniturePlacement(room, { ...item, x: 4.5, y: 7 }, []).valid,
    false,
  );
});

test('personagem modular oferece cinco camadas válidas e assets versionados', () => {
  assert.deepEqual(
    characterCatalog.categories.map((category) => category.id),
    ['body', 'eyes', 'outfit', 'hairstyle', 'accessory'],
  );
  assert.equal(characterCatalog.frame.width, 16);
  assert.equal(characterCatalog.frame.height, 32);
  for (const category of characterCatalog.categories) {
    assert.ok(category.options.length >= 4, `${category.id}: opções suficientes`);
    for (const option of category.options) {
      if (option.path) assert.ok(existsSync(resolve(CLIENT_ROOT, option.path)), option.path);
    }
  }
  assert.match(clientIndexSource, /id="menu-tab-character"/);
  assert.match(clientIndexSource, /id="character-panel-view"/);
});

test('seleção inválida volta ao padrão e poses respeitam direção e veículo', () => {
  const normalized = characterModule.normalizeCharacterSelection(characterCatalog, {
    body: 'inexistente',
    eyes: 'eyes-05',
    accessory: 'glasses-03',
  });
  assert.equal(normalized.body, characterCatalog.defaultSelection.body);
  assert.equal(normalized.eyes, 'eyes-05');
  assert.equal(normalized.accessory, 'glasses-03');
  assert.deepEqual(
    characterModule.characterFrameSpec(characterCatalog, 'idle', 'down', 0, false),
    { pose: 'idle', frame: 18, name: 'idle-18' },
  );
  assert.deepEqual(
    characterModule.characterFrameSpec(characterCatalog, 'walk', 'right', 0, true),
    { pose: 'walk', frame: 0, name: 'walk-0' },
  );
  assert.deepEqual(
    characterModule.characterFrameSpec(characterCatalog, 'sit', 'left', 0, true),
    { pose: 'sit', frame: 6, name: 'sit-6' },
  );
  assert.deepEqual(
    characterModule.characterFrameSpec(characterCatalog, 'sit', 'down', 0, false),
    { pose: 'idle', frame: 18, name: 'idle-18' },
  );
});

test('catálogo oferece quatro veículos progressivos e os slots do loadout RPG', () => {
  const vehicles = equipmentCatalog.items.filter((item) => item.slot === 'vehicle');
  assert.deepEqual(
    vehicles.map((item) => item.id),
    ['skate', 'roller-skates', 'electric-scooter', 'motorcycle'],
  );
  assert.deepEqual(
    equipmentCatalog.slots.map((slot) => slot.id),
    ['earrings', 'necklace', 'bracelet', 'mouse', 'keyboard', 'vehicle'],
  );
  assert.ok(existsSync(resolve(CLIENT_ROOT, 'assets/chars/Adam_sit.png')));
  for (let index = 1; index < vehicles.length; index += 1) {
    assert.ok(vehicles[index].speed > vehicles[index - 1].speed);
  }
  for (const item of equipmentCatalog.items) {
    assert.ok(equipmentCatalog.slots.some((slot) => slot.id === item.slot), `${item.id}: slot válido`);
  }
});

test('loadout valida o slot de cada item e não trata acessórios como veículos', () => {
  const loadout = equipmentModule.normalizeLoadout(equipmentCatalog, {
    vehicle: 'motorcycle',
    necklace: 'silver-chain',
    mouse: 'gold-chain',
  });
  assert.equal(loadout.vehicle, 'motorcycle');
  assert.equal(loadout.necklace, 'silver-chain');
  assert.equal(loadout.mouse, null);

  const accessory = equipmentModule.movementProfile(equipmentCatalog, 'silver-chain', true);
  assert.equal(accessory.active, false);
  assert.equal(accessory.equipment, null);
  assert.equal(accessory.speed, equipmentCatalog.walkSpeed);
});

test('loadout abre com Tab e não mantém HUD fixo de veículo', () => {
  assert.match(equipmentSource, /event\.code === 'Tab'/);
  assert.doesNotMatch(equipmentSource, /KeyQ|equipment-toggle|equipment-current/);
  assert.doesNotMatch(clientIndexSource, /id="equipment-toggle"|id="equipment-current"/);
  assert.match(clientIndexSource, /<b>Tab<\/b> equipamentos/);
});

test('Shift ativa somente o equipamento selecionado e aplica sua velocidade', () => {
  const walking = equipmentModule.movementProfile(equipmentCatalog, 'motorcycle', false);
  assert.equal(walking.active, false);
  assert.equal(walking.speed, equipmentCatalog.walkSpeed);

  const riding = equipmentModule.movementProfile(equipmentCatalog, 'motorcycle', true);
  assert.equal(riding.active, true);
  assert.equal(riding.equipment.id, 'motorcycle');
  assert.equal(riding.speed, 232);

  const invalid = equipmentModule.movementProfile(equipmentCatalog, 'jetpack', true);
  assert.equal(invalid.active, false);
  assert.equal(invalid.equipment, null);
  assert.equal(invalid.speed, equipmentCatalog.walkSpeed);
});

test('skate e patins usam base estável e os patins cobrem os pés', () => {
  const skate = equipmentModule.equipmentById(equipmentCatalog, 'skate');
  const rollerSkates = equipmentModule.equipmentById(equipmentCatalog, 'roller-skates');
  assert.equal(skate.riderSheet, 'adam_idle');
  assert.equal(rollerSkates.riderSheet, 'adam_idle');
  assert.equal(rollerSkates.renderLayer, 'front');
  assert.match(equipmentSource, /equipment\.renderLayer === 'front'/);
});

test('moto usa pose sentada horizontal e orientação frontal/traseira na vertical', () => {
  const motorcycle = equipmentModule.equipmentById(equipmentCatalog, 'motorcycle');
  assert.deepEqual(
    equipmentModule.riderAnimationSpec(motorcycle, 'down', 18),
    {
      sheet: 'adam_idle',
      frameWidth: 16,
      start: 18,
      end: 23,
      frameRate: 5,
    },
  );
  assert.deepEqual(
    equipmentModule.riderAnimationSpec(motorcycle, 'left', 12),
    {
      sheet: 'adam_sit',
      frameWidth: 32,
      start: 6,
      end: 8,
      frameRate: 5,
    },
  );
});

test('spritesheets e prévias do catálogo de animações existem', () => {
  for (const [assetId, spec] of Object.entries(animations)) {
    assert.ok(existsSync(resolve(CLIENT_ROOT, spec.path)), `${assetId}: ${spec.path}`);
    assert.ok(existsSync(resolve(CLIENT_ROOT, spec.preview)), `${assetId}: ${spec.preview}`);
  }
});

test('porta automática abre sem colisão e só a restaura depois de fechar', () => {
  const previousPhaser = globalThis.Phaser;
  globalThis.Phaser = {
    Math: {
      Distance: {
        Between: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
      },
    },
  };

  try {
    const completions = [];
    const sprite = {
      playCalls: 0,
      reverseCalls: 0,
      play() { this.playCalls += 1; },
      playReverse() { this.reverseCalls += 1; },
      once(_event, callback) { completions.push(callback); },
    };
    const door = {
      sprite,
      blocker: { body: { enable: true } },
      animation: 'sliding-door',
      state: 'closed',
      sensorX: 0,
      sensorY: 0,
      openRadius: 10,
      closeRadius: 20,
    };
    const scene = { automaticDoors: [door] };
    const player = { body: { center: { x: 5, y: 0 } } };

    rendererModule.updateAutomaticDoors(scene, player);
    assert.equal(door.state, 'opening');
    assert.equal(door.blocker.body.enable, false);
    assert.equal(sprite.playCalls, 1);
    completions.shift()();
    assert.equal(door.state, 'open');

    player.body.center.x = 30;
    rendererModule.updateAutomaticDoors(scene, player);
    assert.equal(door.state, 'closing');
    assert.equal(door.blocker.body.enable, false);
    assert.equal(sprite.reverseCalls, 1);
    completions.shift()();
    assert.equal(door.state, 'closed');
    assert.equal(door.blocker.body.enable, true);
  } finally {
    globalThis.Phaser = previousPhaser;
  }
});

test('todos os PNGs referenciados pelos tilesets existem', () => {
  generateTilesets();
  const tilesetPaths = [
    'surfaces.tsj',
    'room-builder.tsj',
    'world-assets.tsj',
    'office-furniture.tsj',
    ...palettes.map((palette) => palette.file),
  ].map((file) => resolve(CLIENT_ROOT, 'tiled/tilesets', file));
  for (const tilesetPath of tilesetPaths) {
    const tileset = readJson(tilesetPath);
    if (tileset.image) assert.ok(existsSync(resolve(dirname(tilesetPath), tileset.image)));
    for (const tile of tileset.tiles || []) {
      assert.ok(existsSync(resolve(dirname(tilesetPath), tile.image)), tile.image);
    }
  }
});

for (const scene of manifest.scenes) {
  test(`round-trip preserva ${scene.id}`, () => {
    const catalogs = generateTilesets();
    const original = readJson(resolve(CLIENT_ROOT, 'maps', scene.file));
    const tiled = runtimeToTiled(original, catalogs, scene.file);
    const restored = tiledToRuntime(tiled, catalogs);
    assert.deepEqual(restored, original);
  });
}

test('objeto novo herdado da paleta vira móvel e preserva flip', () => {
  const catalogs = generateTilesets();
  const original = readJson(resolve(CLIENT_ROOT, 'maps/world.json'));
  const tiled = runtimeToTiled(original, catalogs, 'world.json');
  const asset = catalogs.furniture.byAsset.get('of_1');
  const layer = tiled.layers.find((candidate) => (
    candidate.properties?.some((item) => item.name === 'oqRole' && item.value === 'furniture')
  ));
  layer.objects.push({
    gid: ((FIRST_GID.furniture + asset.localId) | 0x80000000) >>> 0,
    height: asset.height,
    id: tiled.nextobjectid++,
    name: '',
    opacity: 1,
    rotation: 0,
    type: '',
    visible: true,
    width: asset.width,
    x: 8 * 16 + 8,
    y: 8 * 16 + 16,
  });
  const restored = tiledToRuntime(tiled, catalogs);
  assert.deepEqual(restored.furniture.at(-1), { id: 'of_1', x: 8, y: 8, flipX: true });
  assert.ok(restored.assets.includes('of_1'));
});

test('objeto arrastado da paleta curada mantém o asset original', () => {
  const catalogs = generateTilesets();
  const original = readJson(resolve(CLIENT_ROOT, 'maps/world.json'));
  const tiled = runtimeToTiled(original, catalogs, 'world.json');
  const asset = catalogs.officePalette.byAsset.get('of_317');
  const layer = tiled.layers.find((candidate) => (
    candidate.properties?.some((item) => item.name === 'oqRole' && item.value === 'furniture')
  ));
  layer.objects.push({
    gid: FIRST_GID.officePalette + asset.localId,
    height: asset.height,
    id: tiled.nextobjectid++,
    name: '',
    opacity: 1,
    rotation: 0,
    type: '',
    visible: true,
    width: asset.width,
    x: 10 * 16 + 8,
    y: 10 * 16 + 16,
  });
  const restored = tiledToRuntime(tiled, catalogs);
  assert.deepEqual(restored.furniture.at(-1), { id: 'of_317', x: 10, y: 10 });
});
