import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
const mainSource = readFileSync(resolve(CLIENT_ROOT, 'src/main.js'), 'utf8');
const equipmentSource = readFileSync(resolve(CLIENT_ROOT, 'src/EquipmentSystem.js'), 'utf8');
const equipmentModule = await import(
  `data:text/javascript;base64,${Buffer.from(equipmentSource).toString('base64')}`
);
// O catálogo do cliente guarda presets de piloto; quem os expande é `prepare`, e o
// runtime chama isso no boot. Sem repetir aqui, os testes de animação testariam um
// catálogo que nunca existe em produção.
equipmentModule.prepareEquipmentCatalog(equipmentCatalog);
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

test('reinício de cena descarta interações e portas do mapa anterior', () => {
  const scene = {
    furnitureObjects: [{ item: { interactionType: 'coffee' } }],
    automaticDoors: [{ key: 'door:old' }],
  };
  rendererModule.resetSceneRenderState(scene);
  assert.deepEqual(scene.furnitureObjects, []);
  assert.deepEqual(scene.automaticDoors, []);
});

test('profundidade de móvel usa a borda da colisão como linha dos pés', () => {
  const desk = { x: 4, y: 10, collision: { x: -0.5, y: 0.1, w: 2, h: 0.75 } };
  const depth = rendererModule.furnitureSortDepth(desk, 16, 176);
  assert.equal(depth, (10 + 0.1 + 0.75) * 16);
  assert.ok(10.7 * 16 < depth, 'avatar atrás deve ficar sob a mesa');
  assert.ok(11 * 16 > depth, 'avatar à frente deve ficar sobre a mesa');
});

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
  const catalogs = generateTilesets(false);
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
  const catalogs = generateTilesets(false);
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
  const catalogs = generateTilesets(false);
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
  const catalogs = generateTilesets(false);
  const original = readJson(resolve(CLIENT_ROOT, 'maps/world.json'));
  delete original.visualMode;
  delete original.visualLayers;
  original.camera.bounds = { x: 1, y: 1, w: original.w - 2, h: original.h - 1 };
  const tiled = runtimeToTiled(original, catalogs, 'world.json');
  const freeDraw = tiled.layers.find((layer) => (
    layer.properties?.some((property) => property.name === 'id' && property.value === 'free-draw')
  ));

  assert.ok(freeDraw, 'a camada de desenho livre precisa existir');
  assert.match(freeDraw.name, /Desenho livre/);
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
  const catalogs = generateTilesets(false);
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
  const catalogs = generateTilesets(false);
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
  const catalogs = generateTilesets(false);
  const original = readJson(resolve(CLIENT_ROOT, 'maps/world.json'));
  const expandedWidth = original.w + 24;
  const expandedHeight = original.h + 18;
  const expanded = expandMapCanvas(original, expandedWidth, expandedHeight, catalogs);
  const offsetX = Math.floor((expandedWidth - original.w) / 2);
  const offsetY = Math.floor((expandedHeight - original.h) / 2);
  const floors = expanded.visualLayers.find((layer) => layer.id === 'base-floors');

  assert.equal(expanded.w, expandedWidth);
  assert.equal(expanded.h, expandedHeight);
  assert.equal(expanded.camera.bounds, undefined);
  assert.equal(expanded.camera.minZoom, original.camera.minZoom);
  assert.equal(expanded.spawns.default.x, original.spawns.default.x + offsetX);
  assert.equal(expanded.spawns.default.y, original.spawns.default.y + offsetY);
  assert.equal(floors.tiles.length, expandedWidth * expandedHeight);
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
  const catalogs = generateTilesets(false);
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

test('personagem modular oferece sete camadas válidas e assets versionados', () => {
  // Acessório virou TRÊS camadas (costas, rosto, cabeça) para dar para usar óculos,
  // boné e mochila ao mesmo tempo. A ordem é a de desenho: mochila antes do cabelo,
  // chapéu depois.
  assert.deepEqual(
    characterCatalog.categories.map((category) => category.id),
    ['body', 'eyes', 'outfit', 'back', 'hairstyle', 'face', 'head'],
  );
  assert.equal(characterCatalog.frame.width, 16);
  assert.equal(characterCatalog.frame.height, 32);
  // Folha recortada: idle, walk e sit, nesta ordem, 32px cada.
  assert.deepEqual(
    Object.entries(characterCatalog.frame.poses).map(([pose, spec]) => [pose, spec.y]),
    [['idle', 0], ['walk', 32], ['sit', 64]],
  );
  for (const category of characterCatalog.categories) {
    assert.ok(category.options.length >= 4, `${category.id}: opções suficientes`);
    // Modelo × cor: a tela agrupa por família, então toda opção precisa declarar a sua.
    for (const option of category.options) {
      assert.ok(option.family && option.familyName, `${option.id}: família declarada`);
      if (option.path) assert.ok(existsSync(resolve(CLIENT_ROOT, option.path)), option.path);
    }
  }
  assert.match(clientIndexSource, /id="menu-tab-character"/);
  assert.match(clientIndexSource, /id="character-panel-view"/);
  assert.match(clientIndexSource, /id="character-layers"/);
});

test('seleção inválida volta ao padrão e poses respeitam direção e veículo', () => {
  const normalized = characterModule.normalizeCharacterSelection(characterCatalog, {
    body: 'inexistente',
    eyes: 'eyes-05',
    // Chave da v2, quando acessório era uma camada só: a peça continua válida e
    // precisa reaparecer na camada nova, sem migração de dados.
    accessory: 'glasses-03',
  });
  assert.equal(normalized.body, characterCatalog.defaultSelection.body);
  assert.equal(normalized.eyes, 'eyes-05');
  assert.equal(normalized.face, 'glasses-03');
  assert.equal(normalized.head, 'none');
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
  // sentar de frente e de costas passou a ter arte propria (frames 12..23 da
  // linha sit); antes essas direcoes caiam no idle em pe
  assert.deepEqual(
    characterModule.characterFrameSpec(characterCatalog, 'sit', 'down', 0, false),
    { pose: 'sit', frame: 18, name: 'sit-18' },
  );
  assert.deepEqual(
    characterModule.characterFrameSpec(characterCatalog, 'sit', 'up', 0, false),
    { pose: 'sit', frame: 12, name: 'sit-12' },
  );
});

test('catálogo oferece vários modelos por meio de locomoção e os slots do loadout RPG', () => {
  const vehicles = equipmentCatalog.items.filter((item) => item.slot === 'vehicle');
  for (const visual of ['skate', 'roller-skates', 'electric-scooter', 'motorcycle']) {
    assert.ok(vehicles.filter((item) => (item.visual || item.id) === visual).length >= 2, visual);
  }
  assert.equal(equipmentCatalog.defaultEquipment, 'skate');
  assert.deepEqual(
    equipmentCatalog.slots.map((slot) => slot.id),
    ['mouse', 'keyboard', 'amulet', 'vehicle', 'phone', 'wallet'],
  );
  assert.ok(existsSync(resolve(CLIENT_ROOT, 'assets/chars/Adam_sit.png')));
  for (const item of equipmentCatalog.items) {
    assert.ok(equipmentCatalog.slots.some((slot) => slot.id === item.slot), `${item.id}: slot válido`);
    // A arte é buscada por id (`assets/equipment/items/<id>.png`). Item sem PNG vira
    // card com imagem quebrada, e só quem abre a bag descobre — daí o teste.
    assert.ok(
      existsSync(resolve(CLIENT_ROOT, `assets/equipment/items/${item.id}.png`)),
      `${item.id}: arte gerada (rode tools/generate-equipment-icons.mjs)`,
    );
  }
  // Os tipos de baú do servidor (LootboxCatalog.cs). A lista é curta e estável; o que
  // o teste protege é a arte, buscada por tipo do mesmo jeito que a do item.
  for (const tier of ['common', 'rare', 'premium', 'legendary', 'exotic', 'beta']) {
    assert.ok(
      existsSync(resolve(CLIENT_ROOT, `assets/equipment/chests/${tier}.png`)),
      `baú ${tier}: arte gerada`,
    );
  }
  // Todo slot precisa ter o que vestir, senão o tabuleiro nasce com um encaixe morto.
  for (const slot of equipmentCatalog.slots) {
    assert.ok(
      equipmentCatalog.items.some((item) => item.slot === slot.id),
      `${slot.id}: nenhum item visual`,
    );
  }
});

test('o catálogo do cliente é só visual — efeito e preço são do servidor', () => {
  // Duas verdades sobre quanto um item paga é como o balanceamento se perde. O
  // servidor é dono disso (docs/PLANO_EQUIPAMENTOS.md §7); aqui, só sprite e cor.
  for (const item of equipmentCatalog.items) {
    for (const forbidden of ['price', 'rarity', 'effects', 'name', 'description']) {
      assert.ok(!Object.hasOwn(item, forbidden), `${item.id}: ${forbidden} não mora no cliente`);
    }
    assert.ok(item.accent && item.secondary, `${item.id}: cores`);
  }
});

test('acessório não vira veículo e loadout do servidor vira mapa de slot', () => {
  const amulet = equipmentModule.movementProfile(equipmentCatalog, 'amulet-clover', true);
  assert.equal(amulet.active, false);
  assert.equal(amulet.equipment, null);
  assert.equal(amulet.speed, equipmentCatalog.walkSpeed);

  const snapshot = {
    slots: [{ id: 'vehicle' }, { id: 'mouse' }, { id: 'amulet' }],
    loadout: {
      vehicle: { id: 'motorcycle', instanceId: 7 },
      mouse: { id: 'mouse-rgb', instanceId: 9 },
      amulet: null,
    },
  };
  assert.deepEqual(
    equipmentModule.loadoutIds(snapshot),
    { vehicle: 'motorcycle', mouse: 'mouse-rgb', amulet: null },
  );

  // O merge junta as duas metades do item sem deixar o servidor apagar o visual.
  const merged = equipmentModule.mergeEquipmentItem(equipmentCatalog, {
    id: 'motorcycle', name: 'Moto', rarity: 'legendary', instanceId: 7,
  });
  assert.equal(merged.speed, 232);
  assert.equal(merged.visual, 'motorcycle');
  assert.equal(merged.rarity, 'legendary');
});

test('as cinco raridades têm cor, e a cor nunca é o único sinal', () => {
  const hudCss = readFileSync(resolve(CLIENT_ROOT, 'src/hud/hud.css'), 'utf8');
  for (const rarity of ['common', 'uncommon', 'rare', 'legendary', 'exotic']) {
    assert.match(hudCss, new RegExp(`\\[data-rarity="${rarity}"\\]\\{--rarity:`), rarity);
  }
  // Quem colore também escreve o nome: só a cor deixaria de fora quem não
  // distingue verde de azul. O chip é o texto ao lado da borda.
  assert.match(equipmentSource, /class="rarity-chip"/);
  assert.match(hudCss, /\.rarity-chip\{/);
  // `title` não abre no toque, e mobile é obrigatório (AGENTS.md §2): o efeito do
  // item precisa estar no card, não escondido atrás do ponteiro.
  assert.doesNotMatch(equipmentSource, /title="\$\{escapeHtml\(\[item\.description/);
});

test('a bag agrupa por slot e compara com o que já está equipado', () => {
  assert.match(equipmentSource, /inventory-group-title/);
  assert.match(equipmentSource, /const renderCompare/);
  // A comparação mostra os dois lados em vez de calcular delta: as frases de efeito
  // vêm prontas do servidor, e refazer a conta aqui criaria uma segunda régua.
  assert.match(equipmentSource, /Trocando por/);
  assert.doesNotMatch(equipmentSource, /passiveCoinPercent|storeDiscountPercent/);
});

test('loadout abre com Tab e não mantém HUD fixo de veículo', () => {
  // Tab é do menu do jogo (`main.js`), não deste módulo: com dois donos, a mesma
  // tecla abria uma janela e fechava a outra. A asserção seguia apontando para o
  // EquipmentSystem, onde o atalho não mora desde que o menu único nasceu.
  assert.match(mainSource, /event\.code === 'Tab'/);
  assert.doesNotMatch(equipmentSource, /KeyQ|equipment-toggle|equipment-current/);
  assert.doesNotMatch(clientIndexSource, /id="equipment-toggle"|id="equipment-current"/);
  assert.match(clientIndexSource, /<kbd>Tab<\/kbd> abrir\/fechar/);
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
    // occupants é a lista de TODOS os avatares da cena; o teste tinha ficado
    // na assinatura antiga, que recebia só o player local
    const ocupantes = [{ x: 5, y: 0 }];

    rendererModule.updateAutomaticDoors(scene, ocupantes);
    assert.equal(door.state, 'opening');
    assert.equal(door.blocker.body.enable, false);
    assert.equal(sprite.playCalls, 1);
    completions.shift()();
    assert.equal(door.state, 'open');

    ocupantes[0].x = 30;
    rendererModule.updateAutomaticDoors(scene, ocupantes);
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

test('porta lateral gira a animação e usa o centro do vão como âncora', () => {
  const rect = { x: 4, y: 26, w: 10, h: 10 };
  const west = rendererModule.doorFixtureTransform(rect, { side: 'W', at: 4, len: 2 }, 16);
  const east = rendererModule.doorFixtureTransform(rect, { side: 'E', at: 4, len: 2 }, 16);

  assert.deepEqual(west, {
    x: 72, y: 496, originX: 0.5, originY: 0.5, angle: 90,
  });
  assert.deepEqual(east, {
    x: 216, y: 496, originX: 0.5, originY: 0.5, angle: -90,
  });
});

test('todos os PNGs referenciados pelos tilesets existem', () => {
  // varre a pasta em vez de uma lista fixa: tileset novo entra na checagem
  // sozinho, e tileset removido não quebra o teste
  const tilesetsDir = resolve(CLIENT_ROOT, 'tiled/tilesets');
  const tilesetPaths = readdirSync(tilesetsDir)
    .filter((file) => file.endsWith('.tsj'))
    .map((file) => resolve(tilesetsDir, file));
  assert.ok(tilesetPaths.length > 0, 'nenhum tileset encontrado');
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
  const runtimeFile = scene.runtimeFile || `${scene.id}.json`;
  const runtimePath = resolve(CLIENT_ROOT, 'maps', runtimeFile);
  if (existsSync(runtimePath)) {
    test(`round-trip preserva ${scene.id}`, () => {
      const catalogs = generateTilesets(false);
      const original = readJson(runtimePath);
      const tiled = runtimeToTiled(original, catalogs, runtimeFile);
      const restored = tiledToRuntime(tiled, catalogs);
      assert.deepEqual(restored, original);
    });
  }

  test(`runtime direto carrega ${scene.id}`, async () => {
    const direct = await loadTiledMap(pathToFileURL(resolve(CLIENT_ROOT, scene.file)).href, {
      fetchJson: fileFetchJson,
    });
    assert.equal(direct.id, scene.id);
    assert.ok(direct.kind);
    assert.ok(direct.spawns.default);
    assert.ok((direct.visualLayers?.length ?? 0) > 0 || direct.visualMode === 'procedural');
    assert.match(direct.tiledSource, new RegExp(`${scene.id}\\.tmj$`));
    assert.ok(direct.tiledTextures.length > 0 || direct.visualMode === 'procedural');
    if (direct.kind === 'world') {
      assert.ok(direct.camera?.bounds);
      assert.ok(direct.camera.bounds.w >= direct.w);
      assert.ok(direct.camera.bounds.h >= direct.h);
    }
  });
}

test('todo o interior do cassino pertence ao mesmo canal de reunião', async () => {
  const casino = await loadTiledMap(
    pathToFileURL(resolve(CLIENT_ROOT, 'tiled/maps/casino-nerd.tmj')).href,
    { fetchJson: fileFetchJson },
  );
  assert.equal(decorationModule.voiceZoneAtPoint(casino, 10, 10)?.id, 'casino-meeting');
  assert.equal(decorationModule.voiceZoneAtPoint(casino, 45, 32)?.id, 'casino-meeting');
  assert.equal(decorationModule.voiceZoneAtPoint(casino, 1, 1), null);
});

test('móvel do Tiled leva interactionType para o runtime', async () => {
  const direct = await loadTiledMap(
    pathToFileURL(resolve(CLIENT_ROOT, 'tiled/maps/tooq-office-1.tmj')).href,
    { fetchJson: fileFetchJson },
  );
  const cadeira = direct.furniture.find((item) => item.id === 'of_315');
  const bancada = direct.furniture.find((item) => item.id === 'of_320');
  const planta = direct.furniture.find((item) => item.id === 'of_98');
  assert.equal(cadeira.interactionType, 'seat');
  assert.equal(bancada.interactionType, 'coffee');
  // sem a propriedade no Tiled o móvel continua sendo só cenário
  assert.equal(planta.interactionType, undefined);
  // o encaixe do avatar sentado também é dado do móvel: a estação senta de costas
  // para o monitor (idle up), a cadeira solta senta de lado (sit)
  const estacao = direct.furniture.find((item) => item.id === 'station_white_dual');
  assert.equal(estacao.seatPose, 'idle');
  assert.equal(estacao.seatDir, 'up');
  assert.equal(estacao.seatY, -1.625);
  // a estação redesenha os 20 px de baixo (a cadeira) na frente do avatar sentado
  assert.equal(estacao.seatCover, 20);
  assert.equal(cadeira.seatPose, 'sit');
  assert.ok(['left', 'right'].includes(cadeira.seatDir), 'cadeira solta senta de perfil');
  assert.equal(cadeira.seatX, -0.5);
  assert.equal(cadeira.seatCover, undefined);
});

test('o avatar sentado não cai dentro de colisão nenhuma', async () => {
  const direct = await loadTiledMap(
    pathToFileURL(resolve(CLIENT_ROOT, 'tiled/maps/tooq-office-1.tmj')).href,
    { fetchJson: fileFetchJson },
  );
  const tile = direct.tile;
  const solids = [];
  for (const layer of direct.visualLayers) {
    if (!layer.properties?.collision) continue;
    for (const cell of layer.tiles) solids.push({ x: cell.x, y: cell.y, w: 1, h: 1, item: null });
  }
  for (const item of direct.furniture) {
    const c = item.collision;
    if (c) solids.push({ x: item.x + c.x, y: item.y + c.y, w: c.w, h: c.h, item });
  }
  const assentos = direct.furniture.filter((item) => item.interactionType === 'seat');
  assert.ok(assentos.length > 0, 'o mapa precisa ter assentos');
  for (const seat of assentos) {
    // main.js: âncora + seatX/seatY; corpo 10×8 no offset (3,22) de um sprite 16×32
    const ax = (seat.x + 0.5) * tile + (seat.seatX || 0) * tile;
    const ay = (seat.y + 1) * tile + (seat.seatY === undefined ? -2 : seat.seatY * tile);
    const body = { x0: (ax - 5) / tile, x1: (ax + 5) / tile, y0: (ay + 6) / tile, y1: (ay + 14) / tile };
    for (const solid of solids) {
      if (solid.item === seat) continue;   // a colisão da própria cadeira é esperada
      const bate = body.x1 > solid.x && body.x0 < solid.x + solid.w
        && body.y1 > solid.y && body.y0 < solid.y + solid.h;
      assert.ok(!bate, `assento ${seat.id} em ${seat.x},${seat.y} cai dentro de ${solid.item?.id || 'parede'}`);
    }
  }
});

test('todo móvel do mapa herda a colisão do catálogo do jogo', async () => {
  const direct = await loadTiledMap(
    pathToFileURL(resolve(CLIENT_ROOT, 'tiled/maps/tooq-office-1.tmj')).href,
    { fetchJson: fileFetchJson },
  );
  const esperado = new Map(furnitureCatalog.items.map((item) => [item.id, item.collision || null]));
  for (const item of direct.furniture) {
    if (!esperado.has(item.id)) continue;
    assert.deepEqual(item.collision ?? null, esperado.get(item.id), `colisão divergente em ${item.id}`);
  }
});

test('runtime direto valida manifesto, portais e spawns em conjunto', async () => {
  const maps = await loadTiledSceneMaps(manifest, {
    baseUrl: pathToFileURL(resolve(CLIENT_ROOT, 'index.html')).href,
    fetchJson: fileFetchJson,
  });
  assert.deepEqual(Object.keys(maps), manifest.scenes.map((scene) => scene.id));
});

test('objeto novo herdado da paleta vira móvel e preserva flip', () => {
  const catalogs = generateTilesets(false);
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
  const catalogs = generateTilesets(false);
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
