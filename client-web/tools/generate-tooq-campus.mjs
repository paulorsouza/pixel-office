import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTiledMap } from '../src/TiledRuntimeLoader.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tile = 16;
const furnitureCatalog = JSON.parse(
  fs.readFileSync(path.join(root, 'assets/furniture/catalog.json'), 'utf8'),
);
const collisionByFurniture = new Map(
  furnitureCatalog.items
    .filter((item) => item.collision)
    .map((item) => [item.id, item.collision]),
);
for (const id of ['station_white_dual', 'station_white_pc', 'station_dark_dual']) {
  collisionByFurniture.set(id, { x: -0.5, y: 0.1, w: 2, h: 0.8 });
}
const moveis = JSON.parse(fs.readFileSync(path.join(root, 'tiled/tilesets/tileset-moveis.tsj'), 'utf8'));
const moveisFirstGid = 4083;
const tileByAsset = new Map((moveis.tiles || []).map((entry) => {
  const properties = Object.fromEntries((entry.properties || []).map((property) => [property.name, property.value]));
  return [properties.assetId, entry];
}));
const exterior = JSON.parse(fs.readFileSync(path.join(root, 'tiled/tilesets/tileset-exterior.tsj'), 'utf8'));
const exteriorFirstGid = 5187;
const exteriorTileByAsset = new Map((exterior.tiles || []).map((entry) => {
  const properties = Object.fromEntries((entry.properties || []).map((property) => [property.name, property.value]));
  return [properties.assetId, entry];
}));

let objectId = 1;
const property = (name, type, value) => ({ name, type, value });
const props = (values = {}) => Object.entries(values).map(([name, value]) => {
  if (name === 'extraJson') return property(name, 'string', JSON.stringify(value));
  const type = typeof value === 'boolean' ? 'bool' : typeof value === 'number'
    ? (Number.isInteger(value) ? 'int' : 'float') : 'string';
  return property(name, type, value);
});
const object = (name, type, x, y, width = 0, height = 0, properties = {}) => ({
  id: objectId++, name, type, x: x * tile, y: y * tile,
  width: width * tile, height: height * tile,
  rotation: 0, visible: true, properties: props(properties),
});
const layer = (id, name, role, objects = []) => ({
  id, name, type: 'objectgroup', draworder: 'topdown', visible: true, opacity: 1,
  objects, properties: props({ oqRole: role }),
});
const door = (parent, side, at, len = 2, extra = {}) => {
  const room = currentRooms.find((entry) => entry.id === parent);
  if (!room) throw new Error(`Sala ${parent} não encontrada`);
  return doorForRect(parent, room, side, at, len, 'interior_sliding_door', extra);
};
const doorForRect = (
  parent,
  rect,
  side,
  at,
  len = 2,
  texture = 'interior_sliding_door',
  extra = {},
) => {
  const horizontal = side === 'N' || side === 'S';
  const x = horizontal ? rect.x + at : (side === 'E' ? rect.x + rect.w : rect.x);
  const y = horizontal ? (side === 'S' ? rect.y + rect.h : rect.y) : rect.y + at;
  return object(`Porta · ${parent}`, 'door', x, y, horizontal ? len : 0, horizontal ? 0 : len, {
    parent, side, texture, frame: 6,
    extraJson: { automatic: true, ...extra },
  });
};
const roomObject = (definition) => object(
  definition.name,
  'room',
  definition.x,
  definition.y,
  definition.w,
  definition.h,
  {
    id: definition.id,
    floor: definition.floor || 'cream',
    extraJson: {
      wallStyle: definition.wallStyle || 'white',
      southWall3d: definition.doorSide !== 'N',
      ...(definition.meeting ? { meeting: true } : {}),
      ...(definition.slotIndex != null ? { slotIndex: definition.slotIndex } : {}),
      ...(definition.extra || {}),
    },
  },
);
const furniture = (assetId, x, y, properties = {}) => {
  const entry = tileByAsset.get(assetId);
  if (!entry) throw new Error(`Asset ${assetId} ausente do tileset-moveis`);
  const collision = collisionByFurniture.get(assetId);
  return {
    ...object(assetId, '', x + 0.5, y + 1, entry.imagewidth / tile, entry.imageheight / tile, {
      assetId,
      ...(collision ? {
        collisionX: collision.x,
        collisionY: collision.y,
        collisionW: collision.w,
        collisionH: collision.h,
      } : {}),
      ...properties,
    }),
    gid: moveisFirstGid + entry.id,
  };
};
const prop = (assetId, x, y, properties = {}) => {
  const entry = exteriorTileByAsset.get(assetId);
  if (!entry) throw new Error(`Asset exterior ${assetId} ausente do tileset`);
  return {
    ...object(assetId, 'prop', x, y, entry.imagewidth / tile, entry.imageheight / tile, {
      assetId,
      ...properties,
    }),
    gid: exteriorFirstGid + entry.id,
  };
};
const armchairSeat = (seatDir) => ({
  interactionType: 'seat',
  // Valores já calibrados no tooq-office-1 para as poltronas 16×32.
  seatX: -0.5,
  seatY: -0.875,
  seatDir,
  seatPose: 'sit',
});
const workstationSeat = (interactionKey) => ({
  interactionType: 'seat',
  interactionKey,
  seatX: 0,
  seatY: -1.625,
  seatDir: 'up',
  seatPose: 'idle',
  seatCover: 20,
});
const spawn = (name, x, y) => object(name, 'spawn', x + 0.5, y, 0, 0, { id: name });
const portal = (id, x, y, w, h, targetScene, targetSpawn, label, extra = {}) => object(
  id, 'portal', x, y, w, h,
  { id, targetScene, targetSpawn, label, ...(Object.keys(extra).length ? { extraJson: extra } : {}) },
);

function mapDocument(id, name, subtitle, width, height, layers, cameraMinZoom = 0.65) {
  const visualLayer = {
    id: 100,
    name: 'Pincel · Desenho livre',
    type: 'tilelayer',
    width: 1,
    height: 1,
    data: [0],
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    properties: props({ oqRole: 'visual', id: 'free-draw', depth: -85 }),
  };
  const allLayers = [visualLayer, ...layers];
  return {
    compressionlevel: -1,
    height,
    width,
    infinite: false,
    layers: allLayers,
    nextlayerid: Math.max(...allLayers.map((entry) => entry.id)) + 1,
    nextobjectid: objectId + 1,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.11.2',
    tileheight: tile,
    tilewidth: tile,
    tilesets: [
      { firstgid: 1, source: '../tilesets/tileset-construcao.tsj' },
      { firstgid: 4033, source: '../tilesets/tileset-superficies.tsj' },
      { firstgid: moveisFirstGid, source: '../tilesets/tileset-moveis.tsj' },
      { firstgid: 5187, source: '../tilesets/tileset-exterior.tsj' },
    ],
    type: 'map',
    version: '1.10',
    properties: props({
      oqSchema: 'office-quest@1',
      id,
      name,
      subtitle,
      kind: 'interior',
      visualMode: 'procedural',
      runtimeFile: `${id}.json`,
      cameraZoom: 2.15,
      cameraMinZoom,
      assetsJson: JSON.stringify(['interior_sliding_door', 'interior_door_glass_double']),
    }),
  };
}

// Prédio principal: quantidades do briefing são intencionais e verificadas no teste.
objectId = 1;
const campusOffsetX = 12;
const campusOffsetY = 30;
const campusMapWidth = 152;
const campusMapHeight = 162;
const campusDefinitions = [];
const meetingSegments = [
  [2, 21], [21, 40], [40, 58],
  [70, 98], [98, 125],
];
for (let index = 0; index < meetingSegments.length; index++) {
  const [left, right] = meetingSegments[index];
  campusDefinitions.push({
    id: `meeting-${index + 1}`,
    name: ['Sala Aurora', 'Sala Vega', 'Sala Órion', 'Sala Íris', 'Sala Atlas'][index],
    x: left,
    y: 2,
    w: right - left + 1,
    h: 18,
    floor: 'wood',
    wallStyle: 'stone', doorSide: 'S', meeting: true, category: 'meeting',
  });
}
const oneOnOneSegments = [
  [2, 13], [13, 24], [24, 35], [35, 46], [46, 58],
  [70, 81], [81, 92], [92, 103], [103, 114], [114, 125],
];
for (let index = 0; index < oneOnOneSegments.length; index++) {
  const [left, right] = oneOnOneSegments[index];
  campusDefinitions.push({
    id: `one-on-one-${index + 1}`, name: `Sala 1×1 ${index + 1}`,
    x: left,
    y: 26,
    w: right - left + 1,
    h: 11,
    floor: 'wood',
    doorSide: 'S',
    category: 'one-on-one',
  });
}
campusDefinitions.push(
  { id: 'games', name: 'Sala de jogos', x: 2, y: 44, w: 57, h: 22, floor: 'wood', doorSide: 'S', category: 'games' },
  { id: 'kitchen', name: 'Cozinha', x: 70, y: 44, w: 29, h: 22, floor: 'wood', doorSide: 'S', category: 'kitchen' },
  { id: 'study-1', name: 'Sala de estudos 1', x: 98, y: 44, w: 28, h: 22, floor: 'wood', doorSide: 'S', category: 'study' },
  { id: 'study-2', name: 'Sala de estudos 2', x: 2, y: 73, w: 57, h: 18, floor: 'wood', doorSide: 'S', category: 'study' },
  { id: 'study-3', name: 'Sala de estudos 3', x: 70, y: 73, w: 56, h: 18, floor: 'wood', doorSide: 'S', category: 'study' },
  {
    id: 'elevator-shaft',
    name: '',
    x: 40,
    y: 104,
    w: 5,
    h: 4,
    floor: 'wood',
    wallStyle: 'white',
    category: 'elevator-shaft',
    extra: { hideLabel: true },
  },
);
for (const room of campusDefinitions) {
  room.x += campusOffsetX;
  room.y += campusOffsetY;
}
let currentRooms = campusDefinitions;
const campusRoomObjects = campusDefinitions.map(roomObject);
const campusDoors = campusDefinitions
  .filter((room) => room.category !== 'elevator-shaft')
  .map((room) => {
    const side = room.doorSide;
    const at = side === 'E' || side === 'W' ? 4 : Math.floor(room.w / 2) - 1;
    return door(room.id, side, at);
  });
const campusFurniture = [];
for (const room of campusDefinitions.filter((entry) => entry.category === 'meeting')) {
  campusFurniture.push(
    furniture('of_171', room.x + 10, room.y + 3.5, { interactionType: 'kanban', interactionKey: `${room.id}:kanban` }),
    furniture('of_172', room.x + 13, room.y + 3.5, { interactionType: 'timeclock', interactionKey: `${room.id}:clock` }),
    furniture('station_white_dual', room.x + 10, room.y + 11, workstationSeat(`${room.id}:station`)),
    furniture('of_196', room.x + 6, room.y + 12, armchairSeat('right')),
    furniture('of_197', room.x + 15, room.y + 12, armchairSeat('left')),
  );
}
for (const room of campusDefinitions.filter((entry) => entry.category === 'one-on-one')) {
  campusFurniture.push(
    furniture('of_196', room.x + 3, room.y + 6, armchairSeat('right')),
    furniture('of_197', room.x + 8, room.y + 6, armchairSeat('left')),
  );
}
for (const room of campusDefinitions.filter((entry) => entry.category === 'study')) {
  const center = Math.floor(room.w / 2);
  const stationAX = room.x + Math.floor(room.w * 0.34);
  const stationBX = room.x + Math.floor(room.w * 0.66);
  campusFurniture.push(
    furniture('of_170', room.x + center, room.y + 3.5, { interactionType: 'whiteboard', interactionKey: `${room.id}:whiteboard` }),
    furniture('station_white_pc', stationAX, room.y + 12, workstationSeat(`${room.id}:station-a`)),
    furniture('station_dark_dual', stationBX, room.y + 12, workstationSeat(`${room.id}:station-b`)),
  );
}
const kitchen = campusDefinitions.find((entry) => entry.id === 'kitchen');
campusFurniture.push(
  furniture('of_320', kitchen.x + 10, kitchen.y + 8, { interactionType: 'coffee', interactionKey: 'kitchen:coffee-a' }),
  furniture('of_321', kitchen.x + 16, kitchen.y + 8, { interactionType: 'coffee', interactionKey: 'kitchen:coffee-b' }),
  furniture('of_196', kitchen.x + 12, kitchen.y + 15, armchairSeat('right')),
  furniture('of_197', kitchen.x + 26, kitchen.y + 15, armchairSeat('left')),
);
campusFurniture.push(
  furniture('of_323', 29 + campusOffsetX, 104 + campusOffsetY, { solid: true }),
  furniture('of_172', 34 + campusOffsetX, 99.5 + campusOffsetY, { interactionType: 'timeclock', interactionKey: 'reception:clock' }),
  furniture('of_175', 94 + campusOffsetX, 104 + campusOffsetY, { interactionType: 'store', interactionKey: 'reception:store', solid: true }),
);
const campusMechanics = [
  object('Xadrez A', 'chess', 12 + campusOffsetX, 51 + campusOffsetY, 3, 3, { id: 'games-chess-a', boardId: 'campus-games-a' }),
  object('Xadrez B', 'chess', 30 + campusOffsetX, 51 + campusOffsetY, 3, 3, { id: 'games-chess-b', boardId: 'campus-games-b' }),
  object('Núcleo · elevador', 'verticalAccess', 39.5 + campusOffsetX, 107 + campusOffsetY, 6, 4, {
    id: 'campus-elevator',
    accessType: 'elevator',
    visualX: 42.5 + campusOffsetX,
    visualY: 107 + campusOffsetY,
    floorIndex: 0,
    targetScene: 'personal-wing',
    targetSpawn: 'from-campus-elevator',
    targetWing: 0,
    label: 'Subir de elevador para as salas pessoais',
  }),
  object('Núcleo · escadas', 'verticalAccess', 72 + campusOffsetX, 95 + campusOffsetY, 7, 4, {
    id: 'campus-stairs',
    accessType: 'stairs',
    visualX: 75.5 + campusOffsetX,
    visualY: 95 + campusOffsetY,
    blockX: 74.5 + campusOffsetX,
    blockY: 91 + campusOffsetY,
    blockW: 2,
    blockH: 4,
    floorIndex: 0,
    targetScene: 'personal-wing',
    targetSpawn: 'from-campus-stairs',
    targetWing: 0,
    label: 'Subir pelas escadas para as salas pessoais',
  }),
];
const campusBuilding = {
  x: 2 + campusOffsetX,
  y: 2 + campusOffsetY,
  w: 124,
  h: 112,
};
const openExit = (parent, rect, side, at, len = 3) => (
  doorForRect(parent, rect, side, at, len, '', { openExit: true })
);
const meetingRooms = campusDefinitions.filter((room) => room.category === 'meeting');
const gamesRoom = campusDefinitions.find((room) => room.id === 'games');
const studyOne = campusDefinitions.find((room) => room.id === 'study-1');
const rearExitPairs = [meetingRooms[0], meetingRooms.at(-1)].flatMap((room) => {
  const at = Math.floor(room.w / 2) - 1;
  return [
    openExit(room.id, room, 'N', at),
    openExit('building', campusBuilding, 'N', room.x - campusBuilding.x + at),
  ];
});
const campusOpenExits = [
  openExit('building', campusBuilding, 'S', 60, 4),
  openExit('building', campusBuilding, 'W', 98, 4),
  openExit('building', campusBuilding, 'E', 98, 4),
  openExit(gamesRoom.id, gamesRoom, 'W', 9, 4),
  openExit('building', campusBuilding, 'W', gamesRoom.y - campusBuilding.y + 9, 4),
  openExit(studyOne.id, studyOne, 'E', 9, 4),
  openExit('building', campusBuilding, 'E', studyOne.y - campusBuilding.y + 9, 4),
  ...rearExitPairs,
];
const campusYardProps = [
  // Fundos: área principal do jardim.
  prop('fountain', 76, 15, {
    collisionX: -0.8, collisionY: -0.8, collisionW: 1.6, collisionH: 0.8,
  }),
  prop('bench', 61, 20, {
    collisionX: -1.4, collisionY: -0.5, collisionW: 2.8, collisionH: 0.5,
  }),
  prop('bench', 91, 20, {
    flipX: true, collisionX: -1.4, collisionY: -0.5, collisionW: 2.8, collisionH: 0.5,
  }),
  prop('tree1', 38, 11, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('tree2', 114, 11, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('tree2', 49, 24, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('tree1', 103, 24, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('bush1', 54, 13),
  prop('bush2', 98, 13),
  prop('flower1', 58, 17),
  prop('flower2', 94, 17),
  // Laterais: árvores e pequenos canteiros sem fechar os caminhos de saída.
  prop('tree1', 7, 43, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('tree2', 145, 48, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('tree2', 6, 67, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('tree1', 146, 73, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('tree1', 6, 105, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('tree2', 146, 101, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('tree2', 5, 86, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('tree1', 147, 86, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('bush1', 8, 55),
  prop('bush2', 144, 59),
  prop('flower2', 8, 92),
  prop('flower1', 144, 91),
  prop('bench', 8, 116, {
    collisionX: -1.4, collisionY: -0.5, collisionW: 2.8, collisionH: 0.5,
  }),
  prop('bench', 144, 116, {
    flipX: true, collisionX: -1.4, collisionY: -0.5, collisionW: 2.8, collisionH: 0.5,
  }),
  // Frente menor, ainda agradável.
  prop('tree1', 29, 154, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('tree2', 123, 154, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('bush1', 48, 153),
  prop('bush2', 104, 153),
  prop('flower1', 57, 151),
  prop('flower2', 95, 151),
];
// Vegetação esparsa no contorno: o jogador ainda alcança o portal em qualquer
// ponto da borda, sem uma cerca ou fileira de arbustos bloqueando a saída.
const campusBoundaryProps = [];
for (let x = 6; x <= 146; x += 14) campusBoundaryProps.push(prop(x % 28 ? 'bush1' : 'bush2', x, 3));
for (let y = 16; y <= 150; y += 17) {
  campusBoundaryProps.push(prop(y % 34 ? 'bush2' : 'bush1', 3, y));
  campusBoundaryProps.push(prop(y % 34 ? 'bush1' : 'bush2', 149, y));
}
const campusLayers = [
  layer(1, 'Objetos · Prédio', 'structures', [
    object('Quintal do campus', 'yard', 0, 0, campusMapWidth, campusMapHeight, { ground: 'grass' }),
    object('Prédio principal', 'building', campusBuilding.x, campusBuilding.y, campusBuilding.w, campusBuilding.h, { floor: 'wood' }),
  ]),
  layer(2, 'Objetos · Zonas abertas', 'zones', [
    object('Recepção e convivência', 'zone', 3 + campusOffsetX, 91 + campusOffsetY, 122, 22, { id: 'reception', floor: 'wood' }),
  ]),
  layer(3, 'Objetos · Salas', 'rooms', campusRoomObjects),
  layer(4, 'Objetos · Móveis', 'furniture', campusFurniture),
  layer(5, 'Objetos · Portas', 'doors', [...campusDoors, ...campusOpenExits]),
  layer(6, 'Objetos · Jardim', 'landscape', [
    object('Passeio dos fundos', 'path', 12, 26, 128, 6, { floor: 'cream' }),
    object('Praça dos fundos', 'path', 66, 11, 20, 9, { floor: 'cream' }),
    object('Caminho traseiro esquerdo', 'path', 21, 0, 6, 32, { floor: 'cream' }),
    object('Caminho traseiro direito', 'path', 125, 0, 6, 32, { floor: 'cream' }),
    object('Passeio lateral oeste', 'path', 8, 30, 6, 119, { floor: 'cream' }),
    object('Passeio lateral leste', 'path', 138, 30, 6, 119, { floor: 'cream' }),
    object('Terraço frontal', 'path', 12, 144, 128, 5, { floor: 'cream' }),
    object('Caminho frontal', 'path', 73, 144, 6, 18, { floor: 'cream' }),
    object('Saída oeste jogos', 'path', 0, gamesRoom.y + 8, 14, 6, { floor: 'cream' }),
    object('Saída leste estudos', 'path', 138, studyOne.y + 8, 14, 6, { floor: 'cream' }),
    object('Saída oeste recepção', 'path', 0, campusBuilding.y + 96, 14, 8, { floor: 'cream' }),
    object('Saída leste recepção', 'path', 138, campusBuilding.y + 96, 14, 8, { floor: 'cream' }),
    ...campusYardProps,
    ...campusBoundaryProps,
  ]),
  layer(7, 'Objetos · Colisões', 'collisions', [
    object('Limite norte', 'collision', 0, 0, campusMapWidth, 1),
    object('Limite oeste', 'collision', 0, 0, 1, campusMapHeight),
    object('Limite leste', 'collision', campusMapWidth - 1, 0, 1, campusMapHeight),
    object('Limite sul', 'collision', 0, campusMapHeight - 1, campusMapWidth, 1),
  ]),
  layer(8, 'Objetos · Navegação', 'navigation', [
    spawn('default', 64 + campusOffsetX, 109 + campusOffsetY),
    spawn('entrance', 64 + campusOffsetX, 151),
    spawn('from-personal-wing', 42.5 + campusOffsetX, 112 + campusOffsetY),
    spawn('from-personal-wing-elevator', 42.5 + campusOffsetX, 112 + campusOffsetY),
    spawn('from-personal-wing-stairs', 75.5 + campusOffsetX, 100 + campusOffsetY),
    spawn('from-yard', 64 + campusOffsetX, 148),
    spawn('yard-center', 76, 15),
    spawn('circulation-top', 64 + campusOffsetX, 22 + campusOffsetY),
    spawn('circulation-middle', 64 + campusOffsetX, 69 + campusOffsetY),
    spawn('qa-elevator', 42.5 + campusOffsetX, 109 + campusOffsetY),
    spawn('qa-stairs', 75.5 + campusOffsetX, 97 + campusOffsetY),
    spawn('qa-meeting', 12 + campusOffsetX, 15 + campusOffsetY),
    spawn('qa-kitchen', 84 + campusOffsetX, 60 + campusOffsetY),
    spawn('qa-yard-fountain', 76, 18),
    spawn('qa-yard-west', 9, 87),
    spawn('qa-yard-east', 143, 87),
    spawn('qa-yard-front', 76, 153),
    spawn('qa-rear-exit', 23, 35),
    spawn('qa-edge-south', 76, 160),
    // Pontos estáveis também servem aos testes visuais e a futuros atalhos internos.
    spawn('one-on-one-left', 8 + campusOffsetX, 33 + campusOffsetY),
    spawn('one-on-one-right', 119 + campusOffsetX, 33 + campusOffsetY),
    spawn('one-on-one-left-door', 8 + campusOffsetX, 39 + campusOffsetY),
    portal('yard-exit-north', 0, 0, campusMapWidth, 2, 'world', 'from-campus', 'Voltar ao mundo aberto'),
    portal('yard-exit-south', 0, campusMapHeight - 2, campusMapWidth, 2, 'world', 'from-campus', 'Voltar ao mundo aberto'),
    portal('yard-exit-west', 0, 2, 2, campusMapHeight - 4, 'world', 'from-campus', 'Voltar ao mundo aberto'),
    portal('yard-exit-east', campusMapWidth - 2, 2, 2, campusMapHeight - 4, 'world', 'from-campus', 'Voltar ao mundo aberto'),
  ]),
  layer(9, 'Objetos · Câmera', 'camera', [
    object('Limite da câmera', 'camera', 0, 0, campusMapWidth, campusMapHeight),
  ]),
  layer(10, 'Objetos · Mecânicas', 'mechanics', campusMechanics),
];
const campusMap = mapDocument(
  'tooq-campus',
  'Tooq Office',
  'Reuniões, 1×1, jogos, cozinha, estudos e acesso às alas pessoais',
  campusMapWidth,
  campusMapHeight,
  campusLayers,
  0.38,
);

// Uma ala é sempre um módulo regular com 12 cômodos; o runtime injeta donos e roomKeys.
objectId = 1;
const wingDefinitions = [];
const wingBoundaries = [2, 17, 32, 47, 62, 77, 93];
for (let slotIndex = 0; slotIndex < 12; slotIndex++) {
  const column = slotIndex % 6;
  const lower = slotIndex >= 6;
  wingDefinitions.push({
    id: `slot-${slotIndex}`,
    name: 'Sala disponível',
    x: wingBoundaries[column],
    y: lower ? 40 : 2,
    w: wingBoundaries[column + 1] - wingBoundaries[column] + 1,
    h: 18,
    floor: 'wood',
    doorSide: lower ? 'N' : 'S',
    slotIndex,
  });
}
currentRooms = wingDefinitions;
const wingRoomObjects = wingDefinitions.map(roomObject);
const wingDoors = wingDefinitions.map((room) => door(
  room.id,
  room.doorSide,
  Math.floor(room.w / 2) - 1,
));
const wingMechanics = [
  object('Ala · elevador', 'verticalAccess', 14, 21, 6, 4, {
    id: 'wing-elevator',
    accessType: 'elevator',
    visualX: 17,
    visualY: 21,
    floorIndex: 1,
    targetScene: 'tooq-campus',
    targetSpawn: 'from-personal-wing-elevator',
    label: 'Descer de elevador para o térreo',
  }),
  object('Ala · escadas', 'verticalAccess', 26, 24, 7, 4, {
    id: 'wing-stairs',
    accessType: 'stairs',
    visualX: 29.5,
    visualY: 24,
    blockX: 28.5,
    blockY: 20,
    blockW: 2,
    blockH: 4,
    floorIndex: 1,
    targetScene: 'tooq-campus',
    targetSpawn: 'from-personal-wing-stairs',
    label: 'Descer pelas escadas para o térreo',
  }),
];
const wingLayers = [
  layer(1, 'Objetos · Prédio', 'structures', [
    object('Ala pessoal', 'building', 2, 2, 92, 56, { floor: 'wood' }),
  ]),
  layer(2, 'Objetos · Zonas abertas', 'zones', [
    object('Corredor compartilhado', 'zone', 3, 20, 90, 20, { id: 'shared-corridor', floor: 'wood' }),
  ]),
  layer(3, 'Objetos · Salas', 'rooms', wingRoomObjects),
  layer(4, 'Objetos · Móveis', 'furniture', [
    furniture('of_172', 47, 27, { interactionType: 'timeclock', interactionKey: 'wing:clock' }),
    furniture('of_196', 42, 33, armchairSeat('right')),
    furniture('of_197', 51, 33, armchairSeat('left')),
  ]),
  layer(5, 'Objetos · Portas', 'doors', wingDoors),
  layer(6, 'Objetos · Navegação', 'navigation', [
    spawn('default', 8, 31),
    spawn('from-campus', 17, 26),
    spawn('from-campus-elevator', 17, 26),
    spawn('from-campus-stairs', 29.5, 29),
    spawn('qa-wing-elevator', 17, 23),
    spawn('qa-wing-stairs', 29.5, 26),
    spawn('from-prev', 88, 31),
    spawn('from-next', 8, 31),
    portal('previous-wing', 1, 27, 2, 8, 'personal-wing', 'from-prev', 'Ala anterior', { wingDelta: -1 }),
    portal('next-wing', 93, 27, 2, 8, 'personal-wing', 'from-next', 'Próxima ala', { wingDelta: 1 }),
  ]),
  layer(7, 'Objetos · Câmera', 'camera', [
    object('Limite da câmera', 'camera', 0, 0, 96, 64),
  ]),
  layer(8, 'Objetos · Mecânicas', 'mechanics', wingMechanics),
];
const wingMap = mapDocument(
  'personal-wing',
  'Ala pessoal',
  '12 salas públicas por módulo',
  96,
  64,
  wingLayers,
);

fs.writeFileSync(path.join(root, 'tiled/maps/tooq-campus.tmj'), `${JSON.stringify(campusMap, null, 2)}\n`);
fs.writeFileSync(path.join(root, 'tiled/maps/personal-wing.tmj'), `${JSON.stringify(wingMap, null, 2)}\n`);

const manifestPath = path.join(root, 'maps/scenes.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
for (const scene of [
  { id: 'tooq-campus', file: 'tiled/maps/tooq-campus.tmj' },
  { id: 'personal-wing', file: 'tiled/maps/personal-wing.tmj' },
  { id: 'player-home-shell', file: 'tiled/maps/player-home-shell.tmj' },
]) {
  if (!manifest.scenes.some((entry) => entry.id === scene.id)) manifest.scenes.push(scene);
}
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

// Hub v2: cidade cercada, três escritórios e vilarejo com doze casas.
objectId = 1;
const worldWidth = 220;
const worldHeight = 150;
const surfacesFirstGid = 4033;
const grassGid = surfacesFirstGid;
const asphaltGid = surfacesFirstGid + 6;
const dashHGid = surfacesFirstGid + 14;
const dashVGid = surfacesFirstGid + 15;
const sidewalkGid = surfacesFirstGid + 25;
const exteriorGid = (assetId) => exteriorFirstGid + exteriorTileByAsset.get(assetId).id;
const worldTiles = (fill = 0) => Array(worldWidth * worldHeight).fill(fill);
const groundData = worldTiles(grassGid);
const roadData = worldTiles();
const fenceData = worldTiles();
const paint = (data, x, y, w, h, gid) => {
  for (let py = Math.max(0, y); py < Math.min(worldHeight, y + h); py++) {
    for (let px = Math.max(0, x); px < Math.min(worldWidth, x + w); px++) {
      data[py * worldWidth + px] = gid;
    }
  }
};
const road = (x, y, w, h, vertical = false) => {
  paint(roadData, x, y, w, h, asphaltGid);
  if (vertical) {
    const center = x + Math.floor(w / 2);
    for (let py = y; py < y + h; py += 2) roadData[py * worldWidth + center] = dashVGid;
  } else {
    const center = y + Math.floor(h / 2);
    for (let px = x; px < x + w; px += 2) roadData[center * worldWidth + px] = dashHGid;
  }
};
road(4, 72, 212, 8);
road(73, 58, 8, 18, true);
road(23, 37, 8, 39, true);
road(115, 37, 8, 39, true);
road(180, 4, 8, 142, true);
for (const y of [26, 48, 98, 120, 142]) road(150, y, 66, 6);
paint(roadData, 4, 70, 212, 2, sidewalkGid);
paint(roadData, 4, 80, 212, 2, sidewalkGid);

const fenceTop = exteriorGid('fence_metal_top_middle');
const fenceBottom = exteriorGid('fence_metal_bottom_middle');
const fenceLeft = exteriorGid('fence_metal_middle_left');
const fenceRight = exteriorGid('fence_metal_middle_right');
for (let x = 0; x < worldWidth; x++) {
  fenceData[x] = fenceTop;
  fenceData[(worldHeight - 1) * worldWidth + x] = fenceBottom;
}
for (let y = 1; y < worldHeight - 1; y++) {
  fenceData[y * worldWidth] = fenceLeft;
  fenceData[y * worldWidth + worldWidth - 1] = fenceRight;
}

const worldProps = [
  prop('office_tooq', 68, 64, { originX: 0, originY: 1 }),
  prop('office_generic', 15, 40, { originX: 0, originY: 1 }),
  prop('office_lime', 110, 40, { originX: 0, originY: 1 }),
  prop('fountain', 98, 104, {
    originX: 0.5, originY: 1,
    collisionX: -0.8, collisionY: -0.8, collisionW: 1.6, collisionH: 0.8,
  }),
  prop('bench', 89, 109, {
    originX: 0.5, originY: 1,
    collisionX: -1.4, collisionY: -0.5, collisionW: 2.8, collisionH: 0.5,
  }),
  prop('bench', 107, 109, {
    originX: 0.5, originY: 1, flipX: true,
    collisionX: -1.4, collisionY: -0.5, collisionW: 2.8, collisionH: 0.5,
  }),
];
const treePositions = [
  [8, 16, 'tree1'], [38, 14, 'tree2'], [67, 14, 'tree1'], [95, 15, 'tree2'],
  [137, 14, 'tree1'], [145, 54, 'tree2'], [10, 55, 'tree2'], [49, 52, 'tree1'],
  [94, 49, 'tree1'], [58, 68, 'tree1'], [97, 68, 'tree2'], [137, 55, 'tree2'],
  [12, 101, 'tree1'], [34, 114, 'tree2'],
  [58, 103, 'tree1'], [83, 118, 'tree2'], [122, 106, 'tree1'], [144, 122, 'tree2'],
  [20, 136, 'tree2'], [53, 137, 'tree1'], [91, 138, 'tree2'], [130, 138, 'tree1'],
];
for (const [x, y, assetId] of treePositions) {
  worldProps.push(prop(assetId, x, y, {
    originX: 0.5, originY: 1,
    collisionX: -1.2, collisionY: -0.8, collisionW: 2.4, collisionH: 0.8,
  }));
}
for (const [x, y, assetId] of [
  [63, 69, 'bush1'], [66, 69, 'flower1'], [90, 69, 'flower2'], [93, 69, 'bush2'],
  [44, 86, 'bush1'], [53, 88, 'flower1'], [62, 86, 'bush2'],
  [116, 87, 'flower2'], [126, 88, 'bush1'], [139, 86, 'bush2'],
  [92, 112, 'flower1'], [104, 112, 'flower2'],
]) worldProps.push(prop(assetId, x, y, { originX: 0.5, originY: 1 }));

const homes = [];
const homeGeometry = {
  house_country: { width: 18, doorOffset: 2.5 },
  house_japanese: { width: 15, doorOffset: 4.5 },
};
const homeRows = [24, 46, 68, 96, 118, 140];
for (let index = 0; index < 12; index++) {
  const left = index % 2 === 0;
  const row = Math.floor(index / 2);
  const id = `house-${String(index + 1).padStart(2, '0')}`;
  const assetId = index % 3 === 1 ? 'house_japanese' : 'house_country';
  const x = left ? 156 : 190;
  const y = homeRows[row];
  homes.push({ id, assetId, x, y, left });
  worldProps.push(prop(assetId, x, y, { originX: 0, originY: 1 }));
}

const worldCollisions = [
  object('Cerca norte', 'collision', 0, 0, worldWidth, 1),
  object('Cerca sul', 'collision', 0, worldHeight - 1, worldWidth, 1),
  object('Cerca oeste', 'collision', 0, 0, 1, worldHeight),
  object('Cerca leste', 'collision', worldWidth - 1, 0, 1, worldHeight),
];
const façadeFootprint = (name, x, bottom, w, h) => {
  worldCollisions.push(object(`Fachada · ${name}`, 'collision', x, bottom - h, w, h));
};
façadeFootprint('Tooq Office', 68, 64, 19, 18);
façadeFootprint('Coworking', 15, 40, 19, 18);
façadeFootprint('Dark Company', 110, 40, 12, 19);
for (const home of homes) {
  const { width } = homeGeometry[home.assetId];
  const height = home.assetId === 'house_japanese' ? 15 : 16;
  façadeFootprint(home.id, home.x, home.y, width, height);
}

const worldNavigation = [
  spawn('default', 75, 67),
  spawn('from-campus', 75, 67),
  spawn('from-office', 22, 43),
  spawn('office-1-exit', 116, 43),
  portal('tooq-office-door', 73, 63.5, 3, 2, 'tooq-campus', 'entrance', 'Entrar no Tooq Office'),
  portal('coworking-door', 20, 39.5, 3, 2, 'tooq-office', 'yard-gate', 'Entrar no Coworking'),
  portal('dark-company-door', 114.5, 39.5, 3, 2, 'tooq-office-1', 'yard-gate', 'Entrar na Dark Company'),
];
for (const home of homes) {
  const { doorOffset } = homeGeometry[home.assetId];
  const doorX = home.x + doorOffset;
  worldNavigation.push(
    spawn(`${home.id}-exit`, doorX + 1, home.y),
    portal(
      `${home.id}-door`,
      doorX,
      home.y - 0.5,
      3,
      2,
      `player-home-shell@${home.id}`,
      'default',
      `Entrar na Casa ${Number(home.id.slice(-2))}`,
      { homeId: home.id },
    ),
  );
}

const tileLayer = (id, name, data, depth) => ({
  id,
  name,
  type: 'tilelayer',
  width: worldWidth,
  height: worldHeight,
  data,
  visible: true,
  opacity: 1,
  x: 0,
  y: 0,
  properties: props({ oqRole: 'visual', id: name.toLowerCase().replace(/\W+/g, '-'), depth }),
});
const worldMap = {
  compressionlevel: -1,
  infinite: false,
  width: worldWidth,
  height: worldHeight,
  tilewidth: tile,
  tileheight: tile,
  orientation: 'orthogonal',
  renderorder: 'right-down',
  type: 'map',
  version: '1.10',
  tiledversion: '1.11.2',
  nextlayerid: 10,
  nextobjectid: objectId,
  layers: [
    tileLayer(1, 'Pincel · Grama', groundData, -100),
    tileLayer(2, 'Pincel · Estradas', roadData, -95),
    tileLayer(3, 'Pincel · Cercas', fenceData, 100000),
    layer(4, 'Objetos · Props do mundo', 'props', worldProps),
    layer(5, 'Objetos · Colisões', 'collisions', worldCollisions),
    layer(6, 'Objetos · Spawns e portais', 'navigation', worldNavigation),
    layer(7, 'Objetos · Mecânicas', 'mechanics', []),
  ],
  tilesets: [
    { firstgid: 1, source: '../tilesets/tileset-construcao.tsj' },
    { firstgid: surfacesFirstGid, source: '../tilesets/tileset-superficies.tsj' },
    { firstgid: moveisFirstGid, source: '../tilesets/tileset-moveis.tsj' },
    { firstgid: exteriorFirstGid, source: '../tilesets/tileset-exterior.tsj' },
  ],
  properties: props({
    oqMap: true,
    id: 'world',
    name: 'Mundo aberto da Tooq',
    subtitle: 'Escritórios, estradas e Vila dos Jogadores',
    kind: 'world',
    tile,
    cameraZoom: 2.15,
    cameraMinZoom: 0.3,
    assetsJson: JSON.stringify([]),
  }),
};
worldMap.nextobjectid = objectId;
fs.writeFileSync(path.join(root, 'tiled/maps/world.tmj'), `${JSON.stringify(worldMap, null, 2)}\n`);

// Interior vazio compartilhado pelas futuras casas compráveis.
objectId = 1;
const homeBuilding = { x: 2, y: 2, w: 28, h: 20 };
const homeExit = doorForRect('building', homeBuilding, 'S', 12, 4, '', { openExit: true });
const homeShellMap = mapDocument(
  'player-home-shell',
  'Casa disponível',
  'Interior vazio para futura personalização',
  32,
  24,
  [
    layer(1, 'Objetos · Prédio', 'structures', [
      object('Interior da casa', 'building', homeBuilding.x, homeBuilding.y, homeBuilding.w, homeBuilding.h, { floor: 'wood' }),
    ]),
    layer(2, 'Objetos · Portas', 'doors', [homeExit]),
    layer(3, 'Objetos · Navegação', 'navigation', [
      spawn('default', 16, 17),
      spawn('from-world', 16, 17),
      portal('return-home', 14, 19, 4, 4, 'world', 'house-01-exit', 'Voltar para a vila'),
    ]),
    layer(4, 'Objetos · Câmera', 'camera', [
      object('Limite da câmera', 'camera', 0, 0, 32, 24),
    ]),
  ],
  0.65,
);
homeShellMap.layers.unshift({
  id: 1000,
  name: 'Pincel · Piso base',
  type: 'tilelayer',
  width: 32,
  height: 24,
  data: Array(32 * 24).fill(surfacesFirstGid + 1),
  visible: true,
  opacity: 1,
  x: 0,
  y: 0,
  properties: props({ oqRole: 'visual', id: 'home-base-floor', depth: -101 }),
});
homeShellMap.nextlayerid = 1001;
fs.writeFileSync(path.join(root, 'tiled/maps/player-home-shell.tmj'), `${JSON.stringify(homeShellMap, null, 2)}\n`);

const fileFetchJson = async (url) => JSON.parse(fs.readFileSync(fileURLToPath(url), 'utf8'));
for (const id of ['world', 'tooq-campus', 'personal-wing', 'player-home-shell']) {
  const tmjPath = path.join(root, `tiled/maps/${id}.tmj`);
  const runtime = await loadTiledMap(pathToFileURL(tmjPath).href, { fetchJson: fileFetchJson });
  delete runtime.tiledSource;
  delete runtime.tiledTextures;
  // O snapshot é só compatibilidade do conversor legado, que não conhece as estações compostas.
  // O runtime real continua lendo os assets station_* diretamente do TMJ.
  if (id === 'tooq-campus') {
    for (const item of runtime.furniture || []) {
      if (item.id === 'station_white_dual' || item.id === 'station_white_pc') item.id = 'of_225';
      if (item.id === 'station_dark_dual') item.id = 'of_227';
    }
    runtime.assets = [
      'interior_sliding_door',
      ...new Set((runtime.furniture || []).map((item) => item.id)),
      ...new Set((runtime.props || []).map((item) => item.texture)),
    ];
  }
  fs.writeFileSync(path.join(root, `maps/${id}.json`), `${JSON.stringify(runtime, null, 2)}\n`);
}

console.log(JSON.stringify({
  campus: {
    meetings: campusDefinitions.filter((entry) => entry.category === 'meeting').length,
    oneOnOne: campusDefinitions.filter((entry) => entry.category === 'one-on-one').length,
    games: campusDefinitions.filter((entry) => entry.category === 'games').length,
    kitchens: campusDefinitions.filter((entry) => entry.category === 'kitchen').length,
    studies: campusDefinitions.filter((entry) => entry.category === 'study').length,
  },
  personalWingSlots: wingDefinitions.length,
}, null, 2));
