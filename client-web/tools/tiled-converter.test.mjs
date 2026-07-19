import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  loadTiledMap,
  loadTiledSceneMaps,
  tiledContentCameraBounds,
} from '../src/TiledRuntimeLoader.js';

import {
  CLIENT_ROOT,
  FIRST_GID,
  expandMapCanvas,
  generateTilesets,
  makeMapEditable,
  runtimeToTiled,
  tiledToRuntime,
} from './tiled-converter.mjs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const fileFetchJson = async (url) => readJson(fileURLToPath(url));
const manifest = readJson(resolve(CLIENT_ROOT, 'maps/scenes.json'));
const palettes = readJson(resolve(CLIENT_ROOT, 'tiled/palettes.json')).palettes;
const animations = readJson(resolve(CLIENT_ROOT, 'assets/animations/catalog.json'));
const equipmentCatalog = readJson(resolve(CLIENT_ROOT, 'assets/equipment/catalog.json'));
const characterCatalog = readJson(resolve(CLIENT_ROOT, 'assets/character/catalog.json'));
const furnitureCatalog = readJson(resolve(CLIENT_ROOT, 'assets/furniture/catalog.json'));
const clientIndexSource = readFileSync(resolve(CLIENT_ROOT, 'index.html'), 'utf8');
const rendererSource = readFileSync(resolve(CLIENT_ROOT, 'src/MapRenderer.js'), 'utf8');
const rendererModule = await import(
  `${pathToFileURL(resolve(CLIENT_ROOT, 'src/MapRenderer.js')).href}?test=${Date.now()}`
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
const mechanicsModule = await import(
  `${pathToFileURL(resolve(CLIENT_ROOT, 'src/mechanics/MechanicsRegistry.js')).href}?test=${Date.now()}`
);

test('registro de mecânicas recebe entidades novas sem alterar o renderer', () => {
  const registry = new mechanicsModule.MechanicsRegistry();
  registry.register('meetingZone', { create: () => ({}) });
  assert.equal(registry.has('meetingZone'), true);
  assert.deepEqual(registry.types(), ['meetingZone']);
  assert.throws(
    () => registry.register('meetingZone', { create: () => ({}) }),
    /já registrada/,
  );
});

test('colisões e portais antigos são normalizados como mecânicas', () => {
  const entities = mechanicsModule.mapMechanicEntities({
    entities: [{ id: 'custom', type: 'meetingZone' }],
    collisions: [{ x: 1, y: 2, w: 3, h: 1 }],
    portals: [{ id: 'exit', x: 4, y: 5, w: 2, h: 2, targetScene: 'world' }],
  });
  assert.deepEqual(entities.map((entity) => entity.type), ['meetingZone', 'collision', 'portal']);
  assert.equal(mechanicsModule.mechanicsRegistry.has('collision'), true);
  assert.equal(mechanicsModule.mechanicsRegistry.has('portal'), true);
});

test('classe desconhecida do Tiled atravessa o conversor como entidade genérica', () => {
  const catalogs = generateTilesets();
  const original = readJson(resolve(CLIENT_ROOT, 'maps/world.json'));
  const tiled = runtimeToTiled(original, catalogs, 'world.json');
  tiled.layers.push({
    color: '#ff70a6',
    draworder: 'topdown',
    id: tiled.nextlayerid++,
    name: 'Gameplay · Reuniões',
    objects: [{
      height: 48,
      id: tiled.nextobjectid++,
      name: 'daily-room',
      opacity: 1,
      properties: [{ name: 'channel', type: 'string', value: 'daily' }],
      rotation: 0,
      type: 'meetingZone',
      visible: true,
      width: 64,
      x: 160,
      y: 96,
    }],
    opacity: 1,
    type: 'objectgroup',
    visible: true,
    x: 0,
    y: 0,
  });

  const restored = tiledToRuntime(tiled, catalogs);
  assert.deepEqual(restored.entities, [{
    id: 'daily-room',
    type: 'meetingZone',
    x: 10,
    y: 6,
    layer: 'Gameplay · Reuniões',
    w: 4,
    h: 3,
    properties: { channel: 'daily' },
  }]);
});

test('entidades genéricas preservam propriedades no round-trip', () => {
  const catalogs = generateTilesets();
  const original = readJson(resolve(CLIENT_ROOT, 'maps/world.json'));
  original.entities = [{
    id: 'standup',
    type: 'meetingZone',
    x: 3,
    y: 4,
    w: 5,
    h: 2,
    layer: 'gameplay-meetings',
    properties: { channel: 'daily', capacity: 8 },
  }];
  const restored = tiledToRuntime(runtimeToTiled(original, catalogs, 'world.json'), catalogs);
  assert.deepEqual(restored.entities, original.entities);
});

test('tile layer criada no Tiled vira camada visual renderizável', () => {
  const catalogs = generateTilesets();
  const original = readJson(resolve(CLIENT_ROOT, 'maps/world.json'));
  delete original.visualMode;
  delete original.visualLayers;
  original.camera.bounds = { x: 1, y: 1, w: original.w - 2, h: original.h - 1 };
  const tiled = runtimeToTiled(original, catalogs, 'world.json');
  const data = Array(tiled.width * tiled.height).fill(0);
  data[2 * tiled.width + 1] = FIRST_GID.surfaces + catalogs.surfaces.byAsset.get('wood').localId;
  data[2 * tiled.width + 2] = FIRST_GID.walls + 24;
  data[2 * tiled.width + 3] = FIRST_GID.furniture + catalogs.furniture.byAsset.get('of_317').localId;
  tiled.layers.push({
    data,
    height: tiled.height,
    id: tiled.nextlayerid++,
    name: 'Decoração especial',
    opacity: 0.8,
    properties: [
      { name: 'depth', type: 'int', value: -40 },
      { name: 'ySort', type: 'bool', value: true },
    ],
    type: 'tilelayer',
    visible: true,
    width: tiled.width,
    x: 0,
    y: 0,
  });

  const restored = tiledToRuntime(tiled, catalogs);
  assert.deepEqual(restored.visualLayers, [{
    id: 'Decoração especial',
    name: 'Decoração especial',
    width: tiled.width,
    height: tiled.height,
    depth: -40,
    tiles: [
      { x: 1, y: 2, texture: 'wood' },
      { x: 2, y: 2, texture: 'tiles', frame: 24 },
      { x: 3, y: 2, texture: 'of_317' },
    ],
    opacity: 0.8,
    properties: { ySort: true },
  }]);
  assert.ok(restored.assets.includes('of_317'));
});

test('mapa gerado oferece uma camada livre editável sem poluir o runtime vazio', () => {
  const catalogs = generateTilesets();
  const original = readJson(resolve(CLIENT_ROOT, 'maps/world.json'));
  delete original.visualMode;
  delete original.visualLayers;
  original.camera.bounds = { x: 1, y: 1, w: original.w - 2, h: original.h - 1 };
  const tiled = runtimeToTiled(original, catalogs, 'world.json');
  const freeDraw = tiled.layers.find((layer) => (
    layer.properties?.some((property) => property.name === 'id' && property.value === 'free-draw')
  ));

  assert.ok(freeDraw, 'a camada de desenho livre precisa existir');
  assert.match(freeDraw.name, /DESENHO LIVRE/);
  assert.equal(freeDraw.type, 'tilelayer');
  assert.equal(freeDraw.locked, false);
  assert.ok(freeDraw.data.every((gid) => gid === 0));

  const camera = tiled.layers.find((layer) => (
    layer.properties?.some((property) => property.name === 'oqRole' && property.value === 'camera')
  ));
  assert.equal(camera.locked, true);
  assert.equal(camera.objects.length, 1);

  const restored = tiledToRuntime(tiled, catalogs);
  assert.equal(restored.visualLayers, undefined);

  freeDraw.data[3 * tiled.width + 2] = (
    FIRST_GID.surfaces + catalogs.surfaces.byAsset.get('wood').localId
  );
  const painted = tiledToRuntime(tiled, catalogs);
  assert.deepEqual(painted.visualLayers, [{
    id: 'free-draw',
    name: freeDraw.name,
    width: tiled.width,
    height: tiled.height,
    depth: -85,
    tiles: [{ x: 2, y: 3, texture: 'wood' }],
  }]);
});

test('camada da câmera rejeita objetos extras e limites fora do mapa', () => {
  const catalogs = generateTilesets();
  const original = readJson(resolve(CLIENT_ROOT, 'maps/world.json'));
  original.camera.bounds = { x: 1, y: 1, w: original.w - 2, h: original.h - 1 };
  const tiled = runtimeToTiled(original, catalogs, 'world.json');
  const camera = tiled.layers.find((layer) => (
    layer.properties?.some((property) => property.name === 'oqRole' && property.value === 'camera')
  ));

  camera.objects.push({
    height: 16,
    id: tiled.nextobjectid++,
    name: 'objeto acidental',
    rotation: 0,
    visible: true,
    width: 16,
    x: 0,
    y: 0,
  });
  assert.throws(() => tiledToRuntime(tiled, catalogs), /somente um retângulo camera/);

  camera.objects.pop();
  camera.objects[0].x = -16;
  assert.throws(() => tiledToRuntime(tiled, catalogs), /permanecer dentro do mapa/);
});

test('câmera do mundo inclui automaticamente objetos colocados fora do canvas', () => {
  const bounds = tiledContentCameraBounds({
    width: 10,
    height: 8,
    tilewidth: 16,
    tileheight: 16,
  }, [{
    object: { x: -32, y: 16, width: 64, height: 48, visible: true },
    asset: { width: 64, height: 48, originX: 0.5, originY: 1 },
  }, {
    object: { x: 500, y: 500, width: 16, height: 16, visible: false },
    asset: { width: 16, height: 16, originX: 0.5, originY: 1 },
  }], 2);

  assert.deepEqual(bounds, { x: -6, y: -4, w: 16, h: 12 });
});

test('modo editável transforma o visual procedural em tile layers desbloqueadas', () => {
  const catalogs = generateTilesets();
  const original = readJson(resolve(CLIENT_ROOT, 'maps/world.json'));
  const editable = makeMapEditable(original, catalogs);
  const tiled = runtimeToTiled(editable, catalogs, 'world.json');
  const roles = tiled.layers.flatMap((layer) => (
    layer.properties?.filter((property) => property.name === 'oqRole').map((property) => property.value) || []
  ));
  const visualLayers = tiled.layers.filter((layer) => roles && (
    layer.properties?.some((property) => property.name === 'oqRole' && property.value === 'visual')
  ));

  assert.equal(editable.visualMode, 'tiled');
  assert.deepEqual(editable.visualLayers.slice(0, 3).map((layer) => layer.id), [
    'base-floors',
    'base-walls',
    'base-hedges',
  ]);
  assert.ok(editable.visualLayers[0].tiles.length > 0);
  assert.equal(editable.visualLayers[1].properties.collision, true);
  assert.equal(editable.visualLayers[2].properties.collision, true);
  assert.equal(roles.some((role) => role.startsWith('preview')), false);
  assert.ok(visualLayers.every((layer) => layer.locked === false));

  const restored = tiledToRuntime(tiled, catalogs);
  assert.deepEqual(restored, editable);
});

test('canvas ampliado centraliza o mundo e deixa a câmera seguir o tamanho do mapa', () => {
  const catalogs = generateTilesets();
  const original = readJson(resolve(CLIENT_ROOT, 'maps/world.json'));
  const expanded = expandMapCanvas(original, 96, 72, catalogs);
  const offsetX = Math.floor((96 - original.w) / 2);
  const offsetY = Math.floor((72 - original.h) / 2);
  const floors = expanded.visualLayers.find((layer) => layer.id === 'base-floors');

  assert.equal(expanded.w, 96);
  assert.equal(expanded.h, 72);
  assert.equal(expanded.camera.bounds, undefined);
  assert.equal(expanded.camera.minZoom, 0.35);
  assert.equal(expanded.spawns.default.x, original.spawns.default.x + offsetX);
  assert.equal(expanded.spawns.default.y, original.spawns.default.y + offsetY);
  assert.equal(floors.tiles.length, 96 * 72);
  assert.equal(expanded.paths, undefined);
  assert.equal(expanded.hedges, undefined);

  const restored = tiledToRuntime(runtimeToTiled(expanded, catalogs, 'world.json'), catalogs);
  assert.deepEqual(restored, expanded);
});

test('colisão de tile layer acompanha exatamente os tiles pintados', () => {
  assert.deepEqual(rendererModule.tileLayerCollisionRects({
    x: 2,
    y: 3,
    tiles: [
      { x: 1, y: 4 },
      { x: 2, y: 4 },
      { x: 5, y: 4 },
      { x: 0, y: 6 },
    ],
  }), [
    { x: 3, y: 7, w: 2, h: 1 },
    { x: 7, y: 7, w: 1, h: 1 },
    { x: 2, y: 9, w: 1, h: 1 },
  ]);
});

test('instância de template do Tiled herda classe e propriedades', () => {
  const catalogs = generateTilesets();
  const original = readJson(resolve(CLIENT_ROOT, 'maps/world.json'));
  const tiled = runtimeToTiled(original, catalogs, 'world.json');
  const navigation = tiled.layers.find((layer) => (
    layer.properties?.some((property) => property.name === 'oqRole' && property.value === 'navigation')
  ));
  navigation.objects.push({
    id: tiled.nextobjectid++,
    properties: [
      { name: 'id', type: 'string', value: 'template-portal' },
      { name: 'targetScene', type: 'string', value: 'tooq-office' },
    ],
    template: '../templates/portal.tj',
    x: 160,
    y: 96,
  });

  const restored = tiledToRuntime(tiled, catalogs);
  assert.deepEqual(restored.portals.at(-1), {
    id: 'template-portal',
    x: 10,
    y: 6,
    w: 3,
    h: 2,
    targetScene: 'tooq-office',
    targetSpawn: 'default',
    label: 'Entrar',
  });
});

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
    'palette-gates.tsj',
    'palette-access-control.tsj',
    'palette-fences.tsj',
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

test('runtime direto aceita um tileset externo novo sem cadastro no conversor', async () => {
  const files = new Map([
    ['https://example.test/maps/custom.tmj', {
      type: 'map',
      tilewidth: 16,
      tileheight: 16,
      width: 1,
      height: 1,
      properties: [
        { name: 'id', type: 'string', value: 'custom' },
        { name: 'name', type: 'string', value: 'Custom' },
        { name: 'kind', type: 'string', value: 'world' },
        { name: 'visualMode', type: 'string', value: 'tiled' },
        { name: 'ground', type: 'string', value: 'grass' },
      ],
      tilesets: [{ firstgid: 1, source: '../tilesets/custom.tsj' }],
      layers: [
        {
          type: 'tilelayer',
          name: 'Minha camada',
          width: 1,
          height: 1,
          data: [1],
        },
        {
          type: 'objectgroup',
          name: 'navigation',
          objects: [{
            id: 1,
            name: 'default',
            type: 'spawn',
            point: true,
            x: 8,
            y: 16,
          }],
        },
      ],
    }],
    ['https://example.test/tilesets/custom.tsj', {
      type: 'tileset',
      name: 'Custom',
      tilewidth: 16,
      tileheight: 16,
      tilecount: 1,
      columns: 0,
      tiles: [{
        id: 0,
        image: '../assets/custom-road.png',
        imagewidth: 16,
        imageheight: 16,
        properties: [
          { name: 'assetId', type: 'string', value: 'custom-road' },
          { name: 'category', type: 'string', value: 'surface' },
        ],
      }],
    }],
  ]);
  const map = await loadTiledMap('https://example.test/maps/custom.tmj', {
    fetchJson: async (url) => files.get(url),
  });

  assert.deepEqual(map.visualLayers[0].tiles, [
    { x: 0, y: 0, texture: 'custom-road' },
  ]);
  assert.deepEqual(map.tiledTextures, [{
    key: 'custom-road',
    url: 'https://example.test/assets/custom-road.png',
    type: 'image',
  }]);
});

for (const scene of manifest.scenes) {
  test(`round-trip preserva ${scene.id}`, () => {
    const catalogs = generateTilesets();
    const runtimeFile = scene.runtimeFile || `${scene.id}.json`;
    const original = readJson(resolve(CLIENT_ROOT, 'maps', runtimeFile));
    const tiled = runtimeToTiled(original, catalogs, runtimeFile);
    const restored = tiledToRuntime(tiled, catalogs);
    assert.deepEqual(restored, original);
  });

  test(`runtime direto carrega ${scene.id}`, async () => {
    const direct = await loadTiledMap(pathToFileURL(resolve(CLIENT_ROOT, scene.file)).href, {
      fetchJson: fileFetchJson,
    });
    assert.equal(direct.id, scene.id);
    assert.ok(direct.kind);
    assert.ok(direct.spawns.default);
    assert.ok(direct.visualLayers.length > 0);
    assert.match(direct.tiledSource, new RegExp(`${scene.id}\\.tmj$`));
    assert.ok(direct.tiledTextures.length > 0);
    if (direct.kind === 'world') {
      assert.ok(direct.camera?.bounds);
      assert.ok(direct.camera.bounds.w >= direct.w);
      assert.ok(direct.camera.bounds.h >= direct.h);
    }
  });
}

test('runtime direto valida manifesto, portais e spawns em conjunto', async () => {
  const maps = await loadTiledSceneMaps(manifest, {
    baseUrl: pathToFileURL(resolve(CLIENT_ROOT, 'index.html')).href,
    fetchJson: fileFetchJson,
  });
  assert.deepEqual(Object.keys(maps), manifest.scenes.map((scene) => scene.id));
});

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
