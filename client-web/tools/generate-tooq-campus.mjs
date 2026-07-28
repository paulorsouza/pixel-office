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
// Folga entre as faixas: o tileset de móveis cresce quando entram peças compostas, e um
// gid encostado no vizinho passa a resolver para o tileset errado sem erro nenhum.
const exteriorFirstGid = 6000;
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
      { firstgid: exteriorFirstGid, source: '../tilesets/tileset-exterior.tsj' },
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

// Prédio principal. A planta é pequena de propósito: um andar cabe na tela e o time se
// esbarra. Faixa norte com os quatro cômodos fechados, sala grande em "L" no miolo e a
// sala de reunião logo na entrada — quem chega vê a porta dela antes de qualquer coisa.
objectId = 1;
const campusMapWidth = 66;
const campusMapHeight = 52;
const campusBuilding = { x: 7, y: 10, w: 52, h: 34 };
const bx = campusBuilding.x;
const by = campusBuilding.y;

/**
 * Coloca uma peça pela sua arte: `x` é a coluna do canto esquerdo e `y` a **linha da base**
 * (a última linha que a arte ocupa). `furniture()` fala em quadro do Tiled, que é ancorado
 * no centro-inferior — só coincide com a arte por acaso, e nas peças de quadro justo ou
 * mais largas que 2 tiles o erro vira móvel dentro da parede.
 *
 * Contrato do runtime, medido: `item.x = objeto.x/16 − 0,5`, `item.y = objeto.y/16 − 1`,
 * e o renderer desenha em `(item.x·16 + 8, item.y·16 + 16)` com origem no centro-inferior.
 * Logo a arte ocupa `[display.x − quadro/2, display.x + quadro/2] × [display.y − altura, display.y]`.
 */
const place = (assetId, x, y, properties = {}) => {
  const entry = tileByAsset.get(assetId);
  if (!entry) throw new Error(`Asset ${assetId} ausente do tileset-moveis`);
  return furniture(assetId, x + entry.imagewidth / tile / 2 - 0.5, y, properties);
};
/** Footprint da base em tiles de conteúdo, resolvido a partir da largura do quadro. */
const base = (assetId, width = null, { inset = 0, depth = 0.8, top = 0.1 } = {}) => {
  const frame = tileByAsset.get(assetId).imagewidth / tile;
  const solidWidth = width ?? frame;
  return {
    collisionX: inset + 0.5 - frame / 2,
    collisionY: top,
    collisionW: solidWidth,
    collisionH: depth,
  };
};

const campusDefinitions = [
  {
    id: 'kitchen', name: 'Cozinha', x: 0, y: 0, w: 14, h: 11,
    floor: 'cream', doorSide: 'S', category: 'kitchen',
  },
  {
    id: 'games', name: 'Sala de jogos', x: 13, y: 0, w: 17, h: 11,
    floor: 'sage', doorSide: 'S', category: 'games',
  },
  {
    id: 'study', name: 'Sala de estudos', x: 29, y: 0, w: 13, h: 11,
    floor: 'carpet', doorSide: 'S', category: 'study',
  },
  {
    id: 'one-on-one', name: 'Sala 1×1', x: 41, y: 0, w: 11, h: 11,
    floor: 'carpet', doorSide: 'S', category: 'one-on-one',
  },
  {
    // Porta na parede norte, não na lateral: a porta deslizante foi desenhada para a
    // parede de duas linhas: girada na tira fina da lateral, ela fica solta no chão.
    // Fora do centro para não disputar o lugar com o fone da reunião, que a
    // `MeetingHeadset` pendura no meio da parede norte.
    id: 'meeting', name: 'Sala Aurora', x: 0, y: 22, w: 16, h: 12,
    floor: 'carpet', wallStyle: 'stone', doorSide: 'N', doorAt: 3, meeting: true,
    category: 'meeting', extra: { southWall3d: true },
  },
  {
    id: 'elevator-shaft', name: '', x: 44, y: 22, w: 5, h: 4,
    floor: 'wood', wallStyle: 'white', category: 'elevator-shaft',
    extra: { hideLabel: true },
  },
];
for (const room of campusDefinitions) {
  room.x += bx;
  room.y += by;
}
let currentRooms = campusDefinitions;
const room = (id) => campusDefinitions.find((entry) => entry.id === id);
const campusRoomObjects = campusDefinitions.map(roomObject);
const campusDoors = campusDefinitions
  .filter((entry) => entry.category !== 'elevator-shaft')
  .map((entry) => door(
    entry.id,
    entry.doorSide,
    entry.doorAt ?? (entry.doorSide === 'E' || entry.doorSide === 'W' ? 5 : Math.floor(entry.w / 2) - 1),
  ));

const kitchen = room('kitchen');
const games = room('games');
const study = room('study');
const oneOnOne = room('one-on-one');
const meeting = room('meeting');
const shaft = room('elevator-shaft');

/**
 * Cadeira em que dá para sentar. **Só cadeira de perfil serve**: a folha `sit` do pack tem
 * uma pose lateral boa e as de frente/costas leem como pessoa em pé (ver `ASSETS.md` §3.1),
 * então poltrona vista de frente (`of_196`–`of_199`) e sofá viram decoração.
 * `of_306`/`of_307` têm o **encosto à direita** (medido: a parte mais alta da arte fica nas
 * colunas 10–13 do conteúdo), então sem espelhar quem senta encara a **esquerda**; para o
 * outro lado, a mesma peça espelhada. Espelhar move o conteúdo dentro do quadro de 32 px,
 * então a coluna e o `seatX` acompanham.
 */
const chair = (x, y, facing, dark = false, extra = {}) => {
  const assetId = dark ? 'of_307' : 'of_306';
  const mirrored = facing === 'right';
  return place(assetId, mirrored ? x - 1 : x, y, {
    ...(mirrored ? { flipX: true } : {}),
    ...base(assetId, 1, { inset: mirrored ? 1 : 0 }),
    interactionType: 'seat',
    seatX: mirrored ? 0.5 : -0.5,
    // Conferido em `tools/seat-preview.mjs`: com −0,875 (o valor herdado das poltronas) o
    // avatar fica baixo demais e sobra encosto acima da cabeça.
    seatY: -1.125,
    seatDir: facing,
    seatPose: 'sit',
    ...extra,
  });
};

/**
 * Sofá em que dá para sentar. O sofá é visto de frente e a folha `sit` não tem pose de
 * frente que preste, então vale o mesmo truque da estação, invertido: o avatar usa o `idle`
 * virado para a câmera e o `seatCover` redesenha a frente do sofá na frente dele — as
 * pernas param na frente do estofado em vez de ficarem em pé sobre o móvel.
 * Números conferidos em `tools/seat-preview.mjs`. Um assento por sofá: o claim é por móvel.
 */
const sofaSeat = () => ({
  interactionType: 'seat',
  seatX: 0,
  seatY: -1.35,
  seatDir: 'down',
  seatPose: 'idle',
  // 11 cobria a perna inteira e o avatar ficava sem pernas; 7 corta no pé, na altura da
  // frente do sofá, que é onde a perna de quem está sentado some mesmo.
  seatCover: 7,
});

const campusFurniture = [
  // Cozinha: bancada corrida encostada na parede norte e mesa no meio.
  place('kt_159', kitchen.x + 1, kitchen.y + 3, base('kt_159')),
  place('kt_192', kitchen.x + 3, kitchen.y + 3, base('kt_192')),
  place('kt_143', kitchen.x + 5, kitchen.y + 3, base('kt_143')),
  place('kt_129', kitchen.x + 7, kitchen.y + 3, base('kt_129')),
  place('of_320', kitchen.x + 9, kitchen.y + 3, {
    ...base('of_320', 1.65), interactionType: 'coffee', interactionKey: 'kitchen:coffee-a',
  }),
  place('of_321', kitchen.x + 11, kitchen.y + 3, {
    ...base('of_321', 1.65), interactionType: 'coffee', interactionKey: 'kitchen:coffee-b',
  }),
  place('table_long', kitchen.x + 4, kitchen.y + 7, base('table_long')),
  chair(kitchen.x + 3, kitchen.y + 7, 'right'),
  chair(kitchen.x + 8, kitchen.y + 7, 'left'),
  place('of_100', kitchen.x + 11, kitchen.y + 8, base('of_100', 1, { depth: 0.45 })),

  // Sala de jogos: dois tabuleiros (a mesa vem da mecânica) com cadeira de cada lado.
  chair(games.x + 3, games.y + 5, 'right'),
  chair(games.x + 6, games.y + 5, 'left'),
  chair(games.x + 10, games.y + 5, 'right', true),
  chair(games.x + 13, games.y + 5, 'left', true),
  place('of_116', games.x + 7, games.y + 2, base('of_116', 2, { depth: 0.5 })),
  place('of_205', games.x + 6, games.y + 8, { ...base('of_205', 2), ...sofaSeat() }),
  place('lr_13', games.x + 14, games.y + 8, base('lr_13', 1, { depth: 0.45 })),
  place('of_99', games.x + 1, games.y + 8, base('of_99', 1, { depth: 0.45 })),

  // Estudos: armários na parede, quadro branco e duas estações reais de trabalho.
  place('of_194', study.x + 1, study.y + 3, base('of_194', 2, { depth: 0.5 })),
  place('of_195', study.x + 3, study.y + 3, base('of_195', 2, { depth: 0.5 })),
  place('of_170', study.x + 6, study.y + 2, {
    interactionType: 'whiteboard', interactionKey: 'study:whiteboard',
  }),
  place('station_white_pc', study.x + 2, study.y + 8, workstationSeat('study:station-a')),
  place('station_dark_dual', study.x + 7, study.y + 8, workstationSeat('study:station-b')),
  place('of_98', study.x + 10, study.y + 8, base('of_98', 1, { depth: 0.45 })),

  // 1×1: duas cadeiras frente a frente com uma mesa de apoio no meio.
  place('table_round', oneOnOne.x + 4, oneOnOne.y + 6, base('table_round')),
  chair(oneOnOne.x + 3, oneOnOne.y + 6, 'right'),
  chair(oneOnOne.x + 7, oneOnOne.y + 6, 'left'),
  place('of_163', oneOnOne.x + 4, oneOnOne.y + 2),
  place('of_98', oneOnOne.x + 8, oneOnOne.y + 8, base('of_98', 1, { depth: 0.45 })),

  // Reunião: mesa de seis lugares, três cadeiras de cada lado, quadro de planejamento e
  // painel de métricas na parede do fundo.
  place('table_meeting', meeting.x + 4, meeting.y + 7, base('table_meeting')),
  chair(meeting.x + 3, meeting.y + 6, 'right'),
  chair(meeting.x + 3, meeting.y + 8, 'right'),
  chair(meeting.x + 10, meeting.y + 6, 'left'),
  chair(meeting.x + 10, meeting.y + 8, 'left'),
  place('of_171', meeting.x + 4, meeting.y + 2, {
    interactionType: 'kanban', interactionKey: 'meeting:kanban',
  }),
  place('of_172', meeting.x + 8, meeting.y + 2, {
    interactionType: 'timeclock', interactionKey: 'meeting:clock',
  }),
  place('of_100', meeting.x + 13, meeting.y + 9, base('of_100', 1, { depth: 0.45 })),

  // Sala grande — ilha de estações a oeste, com a faixa central livre para circular até as
  // portas do norte.
  ...[0, 1].flatMap((row) => [0, 1, 2].map((column) => place(
    ['station_white_dual', 'station_white_pc', 'station_dark_dual'][column],
    bx + 2 + column * 3,
    by + 15 + row * 5,
    workstationSeat(`open-space:station-${row}-${column}`),
  ))),
  place('of_207', bx + 12, by + 15, base('of_207', 1, { depth: 0.4 })),
  place('of_207', bx + 12, by + 20, base('of_207', 1, { depth: 0.4 })),

  // Cantinho de café da sala grande, encostado na ilha.
  place('table_round', bx + 18, by + 17, base('table_round')),
  chair(bx + 17, by + 17, 'right', true),
  chair(bx + 21, by + 17, 'left', true),

  // Mesa comunitária no eixo central, entre a entrada e as portas dos cômodos.
  place('table_long', bx + 24, by + 19, base('table_long')),
  chair(bx + 23, by + 19, 'right'),
  chair(bx + 28, by + 19, 'left'),

  // Sala grande — lounge a leste. Os sofás são cenário: o pack não tem pose de sentar de
  // frente que preste, então quem quiser sentar usa as cadeiras da mesa de centro.
  place('of_116', bx + 41, by + 12, base('of_116', 2, { depth: 0.5 })),
  place('of_200', bx + 39, by + 15, { ...base('of_200', 2), ...sofaSeat() }),
  place('of_205', bx + 43, by + 15, { ...base('of_205', 2), ...sofaSeat() }),
  place('of_190', bx + 41, by + 18, base('of_190', 2, { depth: 0.5 })),
  chair(bx + 40, by + 18, 'right'),
  chair(bx + 44, by + 18, 'left'),
  place('of_98', bx + 37, by + 20, base('of_98', 1, { depth: 0.45 })),
  place('of_100', bx + 48, by + 20, base('of_100', 1, { depth: 0.45 })),
  place('of_173', bx + 23, by + 12, base('of_173', 1, { depth: 0.45 })),
  place('of_147', bx + 25, by + 12, base('of_147', 2, { depth: 0.5 })),

  // Recepção, junto da entrada: balcão, loja e relógio de ponto.
  place('of_323', bx + 24, by + 29, { ...base('of_323', 1.6), solid: true }),
  place('of_175', bx + 20, by + 29, {
    ...base('of_175', 1.5), interactionType: 'store', interactionKey: 'reception:store', solid: true,
  }),
  // Painéis só ficam bem na parede norte (é a única face que a câmera vê): o relógio da
  // recepção mora na parede sul da faixa de cômodos, de frente para quem entra.
  place('of_172', bx + 27, by + 11, {
    interactionType: 'timeclock', interactionKey: 'reception:clock',
  }),
  place('of_98', bx + 18, by + 31, base('of_98', 1, { depth: 0.45 })),
  place('of_100', bx + 33, by + 31, base('of_100', 1, { depth: 0.45 })),

  // Espera do núcleo vertical: quem desce do andar cai numa sala, não num corredor vazio.
  place('table_round', bx + 38, by + 31, base('table_round')),
  chair(bx + 37, by + 31, 'right', true),
  chair(bx + 42, by + 31, 'left', true),
  place('of_99', bx + 34, by + 31, base('of_99', 1, { depth: 0.45 })),
  place('of_100', bx + 46, by + 31, base('of_100', 1, { depth: 0.45 })),
];

const campusMechanics = [
  object('Xadrez A', 'chess', games.x + 4, games.y + 4, 2, 2, {
    id: 'games-chess-a', boardId: 'campus-games-a',
  }),
  object('Xadrez B', 'chess', games.x + 11, games.y + 4, 2, 2, {
    id: 'games-chess-b', boardId: 'campus-games-b',
  }),
  object('Núcleo · elevador', 'verticalAccess', shaft.x - 0.5, shaft.y + 4, 6, 4, {
    id: 'campus-elevator',
    accessType: 'elevator',
    visualX: shaft.x + 2.5,
    visualY: shaft.y + 4,
    floorIndex: 0,
    targetScene: 'personal-wing',
    targetSpawn: 'from-elevator',
    targetWing: 0,
    label: 'Chamar o elevador',
  }),
  object('Núcleo · escadas', 'verticalAccess', bx + 37, by + 26, 5, 4, {
    id: 'campus-stairs',
    accessType: 'stairs',
    visualX: bx + 39.5,
    visualY: by + 26,
    blockX: bx + 38.5,
    blockY: by + 22,
    blockW: 2,
    blockH: 4,
    floorIndex: 0,
    targetScene: 'personal-wing',
    targetSpawn: 'from-stairs-below',
    targetWing: 0,
    label: 'Subir pelas escadas para as salas pessoais',
  }),
];

const openExit = (parent, rect, side, at, len = 3) => (
  doorForRect(parent, rect, side, at, len, '', { openExit: true })
);
const campusOpenExits = [
  openExit('building', campusBuilding, 'S', 28, 4),
  openExit('building', campusBuilding, 'W', 12, 4),
  openExit('building', campusBuilding, 'E', 12, 4),
];

// Zonas: a sala grande é um "L" — as duas metades compartilham o id, então valem como um
// canal de voz só. Os tapetes são zonas mudas, apenas piso.
const campusZones = [
  object('Sala grande', 'zone', bx + 1, by + 11, 50, 11, {
    id: 'open-space', floor: 'wood', extraJson: { voice: true },
  }),
  object('Sala grande', 'zone', bx + 16, by + 22, 35, 10, {
    id: 'open-space', floor: 'wood', extraJson: { voice: true, hideLabel: true },
  }),
  object('Tapete das estações', 'zone', bx + 1, by + 12, 13, 9, {
    id: 'rug-stations', floor: 'sage', extraJson: { hideLabel: true },
  }),
  object('Tapete do lounge', 'zone', bx + 36, by + 11, 14, 10, {
    id: 'rug-lounge', floor: 'carpet', extraJson: { hideLabel: true },
  }),
  object('Tapete da recepção', 'zone', bx + 19, by + 25, 14, 7, {
    id: 'rug-reception', floor: 'cream', extraJson: { hideLabel: true },
  }),
];

const campusYardProps = [
  prop('fountain', 33, 5, { collisionX: -0.8, collisionY: -0.8, collisionW: 1.6, collisionH: 0.8 }),
  prop('bench', 26, 8, { collisionX: -1.4, collisionY: -0.5, collisionW: 2.8, collisionH: 0.5 }),
  prop('bench', 40, 8, { flipX: true, collisionX: -1.4, collisionY: -0.5, collisionW: 2.8, collisionH: 0.5 }),
  prop('tree1', 16, 6, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('tree2', 50, 6, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('bush1', 22, 3),
  prop('bush2', 44, 3),
  prop('flower1', 29, 8),
  prop('flower2', 37, 8),
  prop('tree2', 4, 20, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('tree1', 62, 20, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('tree1', 4, 38, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('tree2', 62, 38, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('bush2', 2, 29),
  prop('bush1', 64, 29),
  prop('bench', 12, 47, { collisionX: -1.4, collisionY: -0.5, collisionW: 2.8, collisionH: 0.5 }),
  prop('bench', 54, 47, { flipX: true, collisionX: -1.4, collisionY: -0.5, collisionW: 2.8, collisionH: 0.5 }),
  prop('tree1', 18, 50, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('tree2', 48, 50, { collisionX: -1.4, collisionY: -1.2, collisionW: 2.8, collisionH: 1.2 }),
  prop('flower1', 26, 49),
  prop('flower2', 40, 49),
];
// Vegetação esparsa no contorno: dá borda ao terreno sem fechar o caminho até o portal.
const campusBoundaryProps = [];
for (let x = 6; x <= 60; x += 12) campusBoundaryProps.push(prop(x % 24 ? 'bush1' : 'bush2', x, 1));
for (let y = 14; y <= 46; y += 11) {
  campusBoundaryProps.push(prop(y % 22 ? 'bush2' : 'bush1', 1, y));
  campusBoundaryProps.push(prop(y % 22 ? 'bush1' : 'bush2', 64, y));
}

const campusLayers = [
  layer(1, 'Objetos · Prédio', 'structures', [
    object('Quintal do campus', 'yard', 0, 0, campusMapWidth, campusMapHeight, { ground: 'grass' }),
    object('Prédio principal', 'building', campusBuilding.x, campusBuilding.y, campusBuilding.w, campusBuilding.h, { floor: 'wood' }),
  ]),
  layer(2, 'Objetos · Zonas abertas', 'zones', campusZones),
  layer(3, 'Objetos · Salas', 'rooms', campusRoomObjects),
  layer(4, 'Objetos · Móveis', 'furniture', campusFurniture),
  layer(5, 'Objetos · Portas', 'doors', [...campusDoors, ...campusOpenExits]),
  layer(6, 'Objetos · Jardim', 'landscape', [
    object('Passeio dos fundos', 'path', 5, 6, 56, 4, { floor: 'cream' }),
    object('Praça dos fundos', 'path', 27, 2, 12, 5, { floor: 'cream' }),
    object('Passeio lateral oeste', 'path', 3, 9, 4, 36, { floor: 'cream' }),
    object('Passeio lateral leste', 'path', 59, 9, 4, 36, { floor: 'cream' }),
    object('Terraço frontal', 'path', 5, 44, 56, 4, { floor: 'cream' }),
    object('Caminho frontal', 'path', 35, 44, 4, 8, { floor: 'cream' }),
    object('Saída oeste', 'path', 0, by + 22, 7, 4, { floor: 'cream' }),
    object('Saída leste', 'path', 59, by + 22, 7, 4, { floor: 'cream' }),
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
    spawn('default', bx + 28, by + 30),
    spawn('entrance', bx + 28, 47),
    // Chegada dos andares: o nome diz de onde a pessoa vem, então o mesmo destino vale
    // para o térreo e para qualquer andar.
    spawn('from-elevator', shaft.x + 2, shaft.y + 6),
    spawn('from-stairs-above', bx + 39, by + 28),
    spawn('from-personal-wing', shaft.x + 2, shaft.y + 6),
    spawn('from-personal-wing-elevator', shaft.x + 2, shaft.y + 6),
    spawn('from-personal-wing-stairs', bx + 39, by + 28),
    spawn('from-yard', bx + 28, 45),
    spawn('yard-center', 33, 6),
    spawn('circulation-open', bx + 26, by + 16),
    spawn('qa-elevator', shaft.x + 2, shaft.y + 5),
    spawn('qa-stairs', bx + 36, by + 27),
    spawn('qa-meeting', meeting.x + 8, meeting.y + 8),
    spawn('qa-kitchen', kitchen.x + 7, kitchen.y + 7),
    spawn('qa-games', games.x + 8, games.y + 7),
    spawn('qa-study', study.x + 6, study.y + 7),
    spawn('qa-one-on-one', oneOnOne.x + 5, oneOnOne.y + 7),
    spawn('qa-lounge', bx + 42, by + 16),
    spawn('qa-yard-fountain', 33, 8),
    spawn('qa-yard-west', 4, 27),
    spawn('qa-yard-east', 61, 27),
    spawn('qa-yard-front', 36, 46),
    spawn('qa-edge-south', 33, 50),
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
  'Sala grande, reunião, jogos, 1×1, cozinha, estudos e acesso aos andares',
  campusMapWidth,
  campusMapHeight,
  campusLayers,
  0.6,
);

// Cada andar de salas pessoais é um módulo regular de seis cômodos — três de cada lado do
// corredor — e o runtime injeta donos e roomKeys. O prédio começa com dois andares desses.
objectId = 1;
const wingDefinitions = [];
const wingBoundaries = [2, 17, 32, 47];
const wingLowerY = 28;
for (let slotIndex = 0; slotIndex < 6; slotIndex++) {
  const column = slotIndex % 3;
  const lower = slotIndex >= 3;
  wingDefinitions.push({
    id: `slot-${slotIndex}`,
    name: 'Sala disponível',
    x: wingBoundaries[column],
    y: lower ? wingLowerY : 2,
    w: wingBoundaries[column + 1] - wingBoundaries[column] + 1,
    h: 16,
    floor: 'wood',
    doorSide: lower ? 'N' : 'S',
    slotIndex,
  });
}
currentRooms = wingDefinitions;
// Poço técnico do elevador, igual ao do térreo: sem ele a porta do elevador fica colada
// numa parede que não existe, e o prédio não se sustenta de um andar para o outro.
const wingShaft = {
  id: 'elevator-shaft', name: '', x: 3, y: 18, w: 5, h: 4,
  floor: 'wood', wallStyle: 'white', extra: { hideLabel: true },
};
const wingWidth = 50;
const wingHeight = 46;
const wingWalk = { x: 2, y: 2, w: 46, h: 42 };
const wingRoomObjects = [...wingDefinitions, wingShaft].map(roomObject);
const wingDoors = wingDefinitions.map((entry) => door(
  entry.id,
  entry.doorSide,
  Math.floor(entry.w / 2) - 1,
));
// Elevador é expresso para o térreo; as escadas sobem e descem um andar. Os spawns são
// nomeados pelo lado de onde a pessoa chega, então o mesmo destino serve térreo e andar.
const wingMechanics = [
  object('Ala · elevador', 'verticalAccess', wingShaft.x - 0.5, wingShaft.y + 4, 6, 4, {
    id: 'wing-elevator',
    accessType: 'elevator',
    visualX: wingShaft.x + 2.5,
    visualY: wingShaft.y + 4,
    floorIndex: 1,
    targetScene: 'tooq-campus',
    targetSpawn: 'from-elevator',
    label: 'Chamar o elevador',
  }),
  object('Ala · escada de subida', 'verticalAccess', 20.5, 21, 7, 4, {
    id: 'wing-stairs-up',
    accessType: 'stairs',
    visualX: 24,
    visualY: 21,
    blockX: 23,
    blockY: 18,
    blockW: 2,
    blockH: 3,
    floorIndex: 1,
    floorDelta: 1,
    targetScene: 'personal-wing',
    targetSpawn: 'from-stairs-below',
    label: 'Subir um andar',
  }),
  object('Ala · escada de descida', 'verticalAccess', 30.5, 21, 7, 4, {
    id: 'wing-stairs-down',
    accessType: 'stairs',
    visualX: 34,
    visualY: 21,
    blockX: 33,
    blockY: 18,
    blockW: 2,
    blockH: 3,
    floorIndex: 1,
    floorDelta: -1,
    targetScene: 'personal-wing',
    targetSpawn: 'from-stairs-above',
    label: 'Descer um andar',
  }),
];
const wingLayers = [
  layer(1, 'Objetos · Prédio', 'structures', [
    object('Ala pessoal', 'building', wingWalk.x, wingWalk.y, wingWalk.w, wingWalk.h, { floor: 'wood' }),
  ]),
  layer(2, 'Objetos · Zonas abertas', 'zones', [
    // Sem `voice`: o corredor é passagem. Quem quer conversar entra numa sala.
    object('Corredor do andar', 'zone', 3, 18, 44, 10, { id: 'shared-corridor', floor: 'wood' }),
    object('Tapete do corredor', 'zone', 16, 23, 16, 4, {
      id: 'rug-corridor', floor: 'carpet', extraJson: { hideLabel: true },
    }),
  ]),
  layer(3, 'Objetos · Salas', 'rooms', wingRoomObjects),
  layer(4, 'Objetos · Móveis', 'furniture', [
    place('of_172', 38, 19, { interactionType: 'timeclock', interactionKey: 'wing:clock' }),
    place('of_190', 21, 25, base('of_190', 2, { depth: 0.5 })),
    chair(20, 25, 'right'),
    chair(24, 25, 'left'),
    place('of_98', 10, 27, base('of_98', 1, { depth: 0.45 })),
    place('of_100', 44, 27, base('of_100', 1, { depth: 0.45 })),
    place('of_173', 41, 19, base('of_173', 1, { depth: 0.45 })),
  ]),
  layer(5, 'Objetos · Portas', 'doors', wingDoors),
  layer(6, 'Objetos · Navegação', 'navigation', [
    spawn('default', wingShaft.x + 2, wingShaft.y + 6),
    spawn('from-elevator', wingShaft.x + 2, wingShaft.y + 6),
    spawn('from-stairs-above', 24, 24),
    spawn('from-stairs-below', 34, 24),
    // Aliases da nomenclatura anterior: links e testes antigos continuam válidos.
    spawn('from-campus', wingShaft.x + 2, wingShaft.y + 6),
    spawn('from-campus-elevator', wingShaft.x + 2, wingShaft.y + 6),
    spawn('from-campus-stairs', 24, 24),
    spawn('qa-wing-elevator', wingShaft.x + 2, wingShaft.y + 5),
    spawn('qa-wing-stairs', 24, 23),
    spawn('qa-wing-room', 9, 16),
  ]),
  layer(7, 'Objetos · Câmera', 'camera', [
    object('Limite da câmera', 'camera', 0, 0, wingWidth, wingHeight),
  ]),
  layer(8, 'Objetos · Mecânicas', 'mechanics', wingMechanics),
];
const wingMap = mapDocument(
  'personal-wing',
  'Andar de salas pessoais',
  'Seis salas públicas por andar',
  wingWidth,
  wingHeight,
  wingLayers,
  0.6,
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

// Equivalentes `of_*` para os assets que o conversor legado não tem no tileset dele.
const LEGACY_SNAPSHOT_ASSET = {
  station_white_dual: 'of_225',
  station_white_pc: 'of_225',
  station_dark_dual: 'of_227',
  table_meeting: 'of_258',
  table_long: 'of_258',
  table_round: 'of_294',
  kt_159: 'of_176',
  kt_192: 'of_323',
  kt_143: 'of_320',
  kt_129: 'of_321',
  lr_13: 'of_98',
};

const fileFetchJson = async (url) => JSON.parse(fs.readFileSync(fileURLToPath(url), 'utf8'));
for (const id of ['world', 'tooq-campus', 'personal-wing', 'player-home-shell']) {
  const tmjPath = path.join(root, `tiled/maps/${id}.tmj`);
  const runtime = await loadTiledMap(pathToFileURL(tmjPath).href, { fetchJson: fileFetchJson });
  delete runtime.tiledSource;
  delete runtime.tiledTextures;
  // O snapshot é só compatibilidade do conversor legado, cujo tileset conhece apenas os
  // `of_*`. O runtime real lê estações, cozinha e mesas compostas direto do TMJ.
  if (id === 'tooq-campus') {
    for (const item of runtime.furniture || []) {
      const legacy = LEGACY_SNAPSHOT_ASSET[item.id];
      if (legacy) item.id = legacy;
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
