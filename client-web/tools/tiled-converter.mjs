#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mapMechanicEntities, mechanicsRegistry } from '../src/mechanics/index.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const CLIENT_ROOT = resolve(SCRIPT_DIR, '..');
const MAPS_DIR = resolve(CLIENT_ROOT, 'maps');
const TILED_DIR = resolve(CLIENT_ROOT, 'tiled');
const TILED_MAPS_DIR = resolve(TILED_DIR, 'maps');
const TILESETS_DIR = resolve(TILED_DIR, 'tilesets');
const PALETTES_PATH = resolve(TILED_DIR, 'palettes.json');
const ANIMATIONS_CATALOG_PATH = resolve(CLIENT_ROOT, 'assets/animations/catalog.json');

const TILED_VERSION = '1.12.2';
const FORMAT_VERSION = '1.10';
const HORIZONTAL_FLIP = 0x80000000;
const GID_MASK = 0x0fffffff;

export const FIRST_GID = {
  surfaces: 1,
  walls: 1000,
  world: 10000,
  furniture: 100000,
  officePalette: 200000,
  decorPalette: 210000,
  gardenPalette: 220000,
  animationPalette: 230000,
};

const SURFACES = [
  { id: 'grass', path: 'assets/world/grass.png' },
  { id: 'wood', path: 'assets/floors/floor_wood.png' },
  { id: 'carpet', path: 'assets/floors/floor_carpet.png' },
  { id: 'cream', path: 'assets/floors/floor_cream.png' },
  { id: 'sage', path: 'assets/floors/floor_sage.png' },
  { id: 'water', path: 'assets/floors/floor_water.png' },
  ...[
    'asphalt', 'asphalt_2', 'asphalt_3', 'asphalt_4',
    'mark_line_h', 'mark_line_h_2', 'mark_line_v', 'mark_line_v_2',
    'mark_dash_h', 'mark_dash_v',
    'mark_corner_1', 'mark_corner_2', 'mark_corner_3', 'mark_corner_4',
    'mark_tee_1', 'mark_tee_2', 'mark_tee_3', 'mark_tee_4', 'mark_cross',
    'sidewalk', 'curb_top', 'curb_bottom', 'curb_left', 'curb_right',
    'curb_bend_tl', 'curb_bend_tr', 'curb_bend_bl', 'curb_bend_br',
    'curb_gutter_1', 'curb_gutter_2',
    'crosswalk_h_l', 'crosswalk_h_r', 'crosswalk_v_t', 'crosswalk_v_b',
  ].map((name) => ({
    id: `road_${name}`,
    path: `assets/world/roads/${name}.png`,
  })),
];

const FLOOR_ALIASES = {
  wood: 'wood',
  gray: 'carpet',
  carpet: 'carpet',
  light: 'cream',
  cream: 'cream',
  terra: 'sage',
  sage: 'sage',
  water: 'water',
  grass: 'grass',
};

const ROOT_FIELDS = new Set([
  'id', 'name', 'subtitle', 'kind', 'tile', 'w', 'h', 'camera', 'background',
  'ground', 'yard', 'assets', 'building', 'spawns', 'zones', 'rooms',
  'furniture', 'details', 'paths', 'hedges', 'props', 'collisions', 'portals',
  'entities', 'visualLayers', 'visualMode',
]);

const RECT_FIELDS = new Set(['id', 'name', 'x', 'y', 'w', 'h', 'floor', 'ground', 'doors']);
const DETAIL_FIELDS = new Set(['x', 'y', 'texture', 'alpha']);
const PROP_FIELDS = new Set([
  'texture', 'x', 'y', 'originX', 'originY', 'offsetX', 'offsetY', 'flipX',
  'depth', 'collision',
]);
const FURNITURE_FIELDS = new Set([
  'id', 'x', 'y', 'offsetX', 'offsetY', 'originX', 'originY', 'flipX', 'depth',
  'solid', 'collision',
]);
const DOOR_FIELDS = new Set(['side', 'at', 'len', 'texture', 'frame', 'flipX', 'depth']);
const PORTAL_FIELDS = new Set([
  'id', 'x', 'y', 'w', 'h', 'targetScene', 'targetSpawn', 'label',
]);
const ENTITY_FIELDS = new Set([
  'id', 'type', 'name', 'x', 'y', 'w', 'h', 'shape', 'points', 'assetId',
  'flipX', 'rotation', 'visible', 'layer', 'properties',
]);
const BUILTIN_OBJECT_TYPES = new Set([
  'building', 'yard', 'zone', 'room', 'door', 'path', 'hedge', 'collision',
  'detail', 'prop', 'furniture', 'spawn', 'portal', 'camera',
]);

function ensureDirectories() {
  mkdirSync(TILED_MAPS_DIR, { recursive: true });
  mkdirSync(TILESETS_DIR, { recursive: true });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function posixPath(path) {
  return path.replaceAll('\\', '/');
}

function pngSize(path) {
  const bytes = readFileSync(path);
  if (
    bytes.length < 24
    || bytes[0] !== 0x89
    || bytes.toString('ascii', 1, 4) !== 'PNG'
  ) {
    throw new Error(`PNG inválido: ${path}`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function property(name, value, forcedType) {
  let type = forcedType;
  if (!type) {
    if (typeof value === 'boolean') type = 'bool';
    else if (typeof value === 'number') type = Number.isInteger(value) ? 'int' : 'float';
    else type = 'string';
  }
  return { name, type, value };
}

function properties(values) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => property(name, value));
}

function propertyMap(owner) {
  return Object.fromEntries((owner.properties || []).map((item) => [item.name, item.value]));
}

function extraFields(value, knownFields) {
  return Object.fromEntries(Object.entries(value || {}).filter(([key]) => !knownFields.has(key)));
}

function extraJson(value, knownFields) {
  const extra = extraFields(value, knownFields);
  return Object.keys(extra).length ? JSON.stringify(extra) : undefined;
}

function parseExtra(props) {
  if (!props.extraJson) return {};
  try {
    return JSON.parse(props.extraJson);
  } catch (error) {
    throw new Error(`extraJson inválido: ${error.message}`);
  }
}

function cleanNumber(value) {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function collectionEntries(directory, category, filter = () => true) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.png')
    .filter((entry) => filter(entry.name))
    .map((entry) => {
      const path = resolve(directory, entry.name);
      return {
        assetId: entry.name.slice(0, -4),
        category,
        path,
        ...pngSize(path),
      };
    })
    .sort((a, b) => a.assetId.localeCompare(b.assetId, 'en', { numeric: true }));
}

function paletteDefinitions() {
  const palettes = readJson(PALETTES_PATH).palettes || [];
  for (const palette of palettes) {
    if (!FIRST_GID[palette.key]) throw new Error(`Paleta sem faixa de GID: ${palette.key}`);
  }
  return palettes;
}

function animationEntries() {
  return Object.entries(readJson(ANIMATIONS_CATALOG_PATH))
    .filter(([, spec]) => (spec.category || 'furniture') === 'furniture')
    .map(([assetId, spec]) => {
      const path = resolve(CLIENT_ROOT, spec.preview);
      return {
        assetId,
        category: 'furniture',
        path,
        ...pngSize(path),
      };
    });
}

function previousIds(path) {
  if (!existsSync(path)) return new Map();
  const tileset = readJson(path);
  return new Map((tileset.tiles || []).map((tile) => {
    const props = propertyMap(tile);
    return [props.assetId, tile.id];
  }));
}

function writeCollectionTileset(path, name, entries, gravar = true) {
  const oldIds = previousIds(path);
  let nextId = Math.max(-1, ...oldIds.values()) + 1;
  const assigned = entries.map((entry) => ({
    ...entry,
    localId: oldIds.has(entry.assetId) ? oldIds.get(entry.assetId) : nextId++,
  }));
  const maxId = Math.max(-1, ...assigned.map((entry) => entry.localId));
  const tileset = {
    columns: 0,
    grid: { height: 16, orientation: 'orthogonal', width: 16 },
    margin: 0,
    name,
    objectalignment: 'bottom',
    spacing: 0,
    tilecount: maxId + 1,
    tiledversion: TILED_VERSION,
    tileheight: Math.max(16, ...assigned.map((entry) => entry.height)),
    tiles: assigned
      .sort((a, b) => a.localId - b.localId)
      .map((entry) => ({
        id: entry.localId,
        image: posixPath(relative(TILESETS_DIR, entry.path)),
        imageheight: entry.height,
        imagewidth: entry.width,
        properties: properties({
          assetId: entry.assetId,
          category: entry.category,
          solid: entry.category === 'furniture' ? false : undefined,
        }),
        type: entry.category,
      })),
    tilewidth: Math.max(16, ...assigned.map((entry) => entry.width)),
    transformations: {
      hflip: true,
      preferuntransformed: true,
      rotate: false,
      vflip: false,
    },
    type: 'tileset',
    version: FORMAT_VERSION,
  };
  if (gravar) writeJson(path, tileset);
  return catalogFromTileset(tileset);
}

function catalogFromTileset(tileset) {
  const entries = (tileset.tiles || []).map((tile) => {
    const props = propertyMap(tile);
    return {
      assetId: props.assetId,
      category: props.category || tile.type,
      height: tile.imageheight,
      localId: tile.id,
      width: tile.imagewidth,
    };
  });
  return {
    byAsset: new Map(entries.map((entry) => [entry.assetId, entry])),
    byLocalId: new Map(entries.map((entry) => [entry.localId, entry])),
    tilecount: tileset.tilecount,
  };
}

function writeSurfaceTileset(gravar = true) {
  const entries = SURFACES.map((surface, localId) => {
    const path = resolve(CLIENT_ROOT, surface.path);
    return { ...surface, localId, ...pngSize(path), path };
  });
  const tileset = {
    columns: 0,
    grid: { height: 16, orientation: 'orthogonal', width: 16 },
    margin: 0,
    name: '01 · Construção · Pisos',
    objectalignment: 'bottom',
    spacing: 0,
    tilecount: entries.length,
    tiledversion: TILED_VERSION,
    tileheight: 16,
    tiles: entries.map((entry) => ({
      id: entry.localId,
      image: posixPath(relative(TILESETS_DIR, entry.path)),
      imageheight: entry.height,
      imagewidth: entry.width,
      properties: properties({ assetId: entry.id, category: 'surface' }),
      type: 'surface',
    })),
    tilewidth: 16,
    type: 'tileset',
    version: FORMAT_VERSION,
  };
  if (gravar) writeJson(resolve(TILESETS_DIR, 'surfaces.tsj'), tileset);
  return catalogFromTileset(tileset);
}

function writeWallTileset(gravar = true) {
  const imagePath = resolve(CLIENT_ROOT, 'assets/tiles/room_builder.png');
  const { width, height } = pngSize(imagePath);
  const tileset = {
    columns: width / 16,
    image: posixPath(relative(TILESETS_DIR, imagePath)),
    imageheight: height,
    imagewidth: width,
    margin: 0,
    name: '01 · Construção · Paredes',
    spacing: 0,
    tilecount: (width / 16) * (height / 16),
    tiledversion: TILED_VERSION,
    tileheight: 16,
    tilewidth: 16,
    transformations: {
      hflip: false,
      preferuntransformed: true,
      rotate: false,
      vflip: false,
    },
    type: 'tileset',
    version: FORMAT_VERSION,
  };
  if (gravar) writeJson(resolve(TILESETS_DIR, 'room-builder.tsj'), tileset);
  return { tilecount: tileset.tilecount };
}

export function generateTilesets(gravar = true) {
  ensureDirectories();
  const worldEntries = [
    ...collectionEntries(
      resolve(CLIENT_ROOT, 'assets/world'),
      'prop',
      (name) => name !== 'office_door.png' && name !== 'grass.png',
    ),
    ...collectionEntries(
      resolve(CLIENT_ROOT, 'assets/world/fences'),
      'prop',
    ).map((entry) => ({ ...entry, assetId: `fence_${entry.assetId}` })),
  ].map((entry) => ({
    ...entry,
    category: entry.assetId === 'grass_detail' ? 'detail' : 'prop',
  }));
  const furnitureEntries = [
    ...collectionEntries(
      resolve(CLIENT_ROOT, 'assets/furniture/office'),
      'furniture',
    ),
    ...animationEntries(),
  ];

  const catalogs = {
    surfaces: writeSurfaceTileset(gravar),
    walls: writeWallTileset(gravar),
    world: writeCollectionTileset(
      resolve(TILESETS_DIR, 'world-assets.tsj'),
      'Office Quest · Mundo',
      worldEntries,
      gravar,
    ),
    furniture: writeCollectionTileset(
      resolve(TILESETS_DIR, 'office-furniture.tsj'),
      'Office Quest · Móveis',
      furnitureEntries,
      gravar,
    ),
  };

  const available = new Map(
    [...worldEntries, ...furnitureEntries].map((entry) => [entry.assetId, entry]),
  );
  for (const palette of paletteDefinitions()) {
    const entries = palette.assetIds.map((assetId) => {
      const entry = available.get(assetId);
      if (!entry) throw new Error(`Asset ${assetId} não existe para a paleta ${palette.name}`);
      return entry;
    });
    catalogs[palette.key] = writeCollectionTileset(
      resolve(TILESETS_DIR, palette.file),
      palette.name,
      entries,
      gravar,
    );
  }

  return catalogs;
}

export function loadTilesetCatalogs() {
  const required = [
    'surfaces.tsj',
    'room-builder.tsj',
    'world-assets.tsj',
    'office-furniture.tsj',
    ...paletteDefinitions().map((palette) => palette.file),
  ];
  if (required.some((file) => !existsSync(resolve(TILESETS_DIR, file)))) {
    return generateTilesets(false);
  }

  const readCatalog = (file) => catalogFromTileset(readJson(resolve(TILESETS_DIR, file)));
  const wallTileset = readJson(resolve(TILESETS_DIR, 'room-builder.tsj'));
  const catalogs = {
    surfaces: readCatalog('surfaces.tsj'),
    walls: { tilecount: wallTileset.tilecount },
    world: readCatalog('world-assets.tsj'),
    furniture: readCatalog('office-furniture.tsj'),
  };
  for (const palette of paletteDefinitions()) catalogs[palette.key] = readCatalog(palette.file);
  return catalogs;
}

function gidFor(catalogs, catalogName, assetId, flipX = false) {
  const entry = catalogs[catalogName].byAsset.get(assetId);
  if (!entry) throw new Error(`Asset não encontrado no tileset ${catalogName}: ${assetId}`);
  let gid = FIRST_GID[catalogName] + entry.localId;
  if (flipX) gid = (gid | HORIZONTAL_FLIP) >>> 0;
  return gid;
}

function resolveGid(catalogs, rawGid) {
  const unsigned = rawGid >>> 0;
  const baseGid = unsigned & GID_MASK;
  const flipX = Boolean(unsigned & HORIZONTAL_FLIP);
  const ranges = Object.entries(FIRST_GID).sort((a, b) => b[1] - a[1]);
  const match = ranges.find(([, firstGid]) => baseGid >= firstGid);
  const catalogName = match?.[0];
  if (!catalogName) throw new Error(`GID desconhecido: ${rawGid}`);
  const localId = baseGid - FIRST_GID[catalogName];
  const entry = catalogs[catalogName].byLocalId?.get(localId);
  if (!entry) throw new Error(`Tile ${localId} não existe no tileset ${catalogName}`);
  return { ...entry, catalogName, flipX };
}

function surfaceGid(catalogs, floor) {
  const canonicalFloor = FLOOR_ALIASES[floor] || 'cream';
  return gidFor(catalogs, 'surfaces', canonicalFloor);
}

function objectLayer(id, name, role, color, objects, options = {}) {
  return {
    color,
    draworder: 'topdown',
    id,
    locked: options.locked ?? false,
    name,
    objects,
    opacity: options.opacity ?? 1,
    properties: properties({ oqRole: role }),
    type: 'objectgroup',
    visible: options.visible ?? true,
    x: 0,
    y: 0,
  };
}

function tileLayer(id, name, role, width, height, data, options = {}) {
  return {
    data,
    height,
    id,
    locked: options.locked ?? true,
    name,
    opacity: options.opacity ?? 1,
    properties: properties({ oqRole: role, ...(options.properties || {}) }),
    type: 'tilelayer',
    visible: options.visible ?? true,
    width,
    x: 0,
    y: 0,
  };
}

function makeObject(id, type, name, geometry, values = {}) {
  return {
    height: geometry.height ?? 0,
    id,
    name: name || '',
    opacity: 1,
    ...(geometry.point ? { point: true } : {}),
    properties: properties(values),
    rotation: 0,
    type,
    visible: true,
    width: geometry.width ?? 0,
    x: geometry.x,
    y: geometry.y,
  };
}

function rectGeometry(rect, tile) {
  return {
    x: rect.x * tile,
    y: rect.y * tile,
    width: rect.w * tile,
    height: rect.h * tile,
  };
}

function tileObject(id, type, name, asset, gid, x, y, values = {}) {
  return {
    gid,
    height: asset.height,
    id,
    name: name || asset.assetId,
    opacity: 1,
    properties: properties(values),
    rotation: 0,
    type,
    visible: true,
    width: asset.width,
    x,
    y,
  };
}

function paintRect(data, mapWidth, mapHeight, rect, gid) {
  const startX = Math.max(0, Math.floor(rect.x));
  const startY = Math.max(0, Math.floor(rect.y));
  const endX = Math.min(mapWidth, Math.ceil(rect.x + rect.w));
  const endY = Math.min(mapHeight, Math.ceil(rect.y + rect.h));
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) data[y * mapWidth + x] = gid;
  }
}

function previewFloors(map, catalogs) {
  const data = Array(map.w * map.h).fill(0);
  if (map.kind === 'world') {
    paintRect(data, map.w, map.h, { x: 0, y: 0, w: map.w, h: map.h }, surfaceGid(catalogs, map.ground));
    for (const path of map.paths || []) paintRect(data, map.w, map.h, path, surfaceGid(catalogs, path.floor));
    return data;
  }

  if (map.yard) paintRect(data, map.w, map.h, map.yard, surfaceGid(catalogs, map.yard.ground || 'grass'));
  for (const path of map.paths || []) paintRect(data, map.w, map.h, path, surfaceGid(catalogs, path.floor));
  if (map.building) paintRect(data, map.w, map.h, map.building, surfaceGid(catalogs, map.building.floor));
  for (const zone of map.zones || []) paintRect(data, map.w, map.h, zone, surfaceGid(catalogs, zone.floor));
  for (const room of map.rooms || []) paintRect(data, map.w, map.h, room, surfaceGid(catalogs, room.floor));
  return data;
}

const wallFrame = (column, row) => row * 16 + column;
const WALL = {
  TL: wallFrame(7, 1), TOP: wallFrame(8, 1), TR: wallFrame(9, 1),
  L: wallFrame(7, 2), R: wallFrame(9, 2),
  BL: wallFrame(7, 3), BOT: wallFrame(8, 3), BR: wallFrame(9, 3),
};
const wallFace = (row) => ({
  cap: wallFrame(1, row),
  face: wallFrame(1, row + 1),
});
const NORTH_WALL = {
  white: wallFace(11),
  stone: wallFace(7),
  brick: wallFace(9),
  lavender: wallFace(5),
};

function paintWalls(data, mapWidth, mapHeight, rect) {
  const right = rect.x + rect.w - 1;
  const bottom = rect.y + rect.h - 1;
  const northWall = NORTH_WALL[rect.wallStyle] || NORTH_WALL.white;
  const gaps = new Set();
  for (const door of rect.doors || []) {
    const len = door.len || 2;
    for (let index = 0; index < len; index += 1) {
      if (door.side === 'N') {
        gaps.add(`${rect.x + door.at + index},${rect.y}`);
        gaps.add(`${rect.x + door.at + index},${rect.y + 1}`);
      } else if (door.side === 'S') {
        gaps.add(`${rect.x + door.at + index},${bottom}`);
        if (rect.southWall3d) gaps.add(`${rect.x + door.at + index},${bottom - 1}`);
      } else if (door.side === 'W') {
        gaps.add(`${rect.x},${rect.y + door.at + index}`);
      } else {
        gaps.add(`${right},${rect.y + door.at + index}`);
      }
    }
  }

  const put = (x, y, frame) => {
    if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight || gaps.has(`${x},${y}`)) return;
    data[y * mapWidth + x] = FIRST_GID.walls + frame;
  };
  const hasNorthFace = bottom > rect.y + 2;
  put(rect.x, rect.y, WALL.TL);
  put(right, rect.y, WALL.TR);
  if (!rect.southWall3d) {
    put(rect.x, bottom, WALL.BL);
    put(right, bottom, WALL.BR);
  }
  for (let x = rect.x + 1; x < right; x += 1) {
    put(x, rect.y, hasNorthFace ? northWall.cap : WALL.TOP);
    if (hasNorthFace) put(x, rect.y + 1, northWall.face);
    if (rect.southWall3d) {
      put(x, bottom - 1, northWall.cap);
      put(x, bottom, northWall.face);
    } else {
      put(x, bottom, WALL.BOT);
    }
  }
  const sideEnd = rect.southWall3d ? bottom + 1 : bottom;
  for (let y = rect.y + 1; y < sideEnd; y += 1) {
    put(rect.x, y, WALL.L);
    put(right, y, WALL.R);
  }
}

function previewWalls(map) {
  const data = Array(map.w * map.h).fill(0);
  if (map.building) paintWalls(data, map.w, map.h, map.building);
  for (const room of map.rooms || []) paintWalls(data, map.w, map.h, room);
  return data;
}

function previewHedges(map, catalogs) {
  const data = Array(map.w * map.h).fill(0);
  const topGid = gidFor(catalogs, 'world', 'hedge_top');
  const fillGid = gidFor(catalogs, 'world', 'hedge_fill');
  for (const hedge of map.hedges || []) {
    const horizontal = hedge.w >= hedge.h;
    for (let y = 0; y < hedge.h; y += 1) {
      for (let x = 0; x < hedge.w; x += 1) {
        const px = hedge.x + x;
        const py = hedge.y + y;
        if (px < 0 || py < 0 || px >= map.w || py >= map.h) continue;
        data[py * map.w + px] = horizontal && y === 0 ? topGid : fillGid;
      }
    }
  }
  return data;
}

function visualTilesFromData(data, width, catalogs) {
  const tiles = [];
  for (let index = 0; index < data.length; index += 1) {
    const gid = data[index];
    if (!gid) continue;
    tiles.push(visualTile(
      gid,
      index % width,
      Math.floor(index / width),
      catalogs,
    ));
  }
  return tiles;
}

export function makeMapEditable(map, catalogs) {
  const baseIds = new Set(['base-floors', 'base-walls', 'base-hedges']);
  const currentLayers = map.visualLayers || [];
  if (map.visualMode === 'tiled' && [...baseIds].every((id) => (
    currentLayers.some((layer) => layer.id === id)
  ))) {
    const normalized = {
      ...map,
      visualLayers: currentLayers.map((layer) => (
        layer.id === 'base-walls' || layer.id === 'base-hedges'
          ? { ...layer, properties: { ...(layer.properties || {}), collision: true } }
          : layer
      )),
    };
    delete normalized.paths;
    delete normalized.hedges;
    return normalized;
  }

  const baseLayers = [
    {
      id: 'base-floors',
      name: 'Pincel · Chão e ruas',
      width: map.w,
      height: map.h,
      depth: -100,
      tiles: visualTilesFromData(previewFloors(map, catalogs), map.w, catalogs),
    },
    {
      id: 'base-walls',
      name: 'Pincel · Paredes',
      width: map.w,
      height: map.h,
      depth: -80,
      tiles: visualTilesFromData(previewWalls(map), map.w, catalogs),
      properties: { ySort: true, depthOffset: 8, collision: true },
    },
    {
      id: 'base-hedges',
      name: 'Pincel · Cercas',
      width: map.w,
      height: map.h,
      depth: -75,
      tiles: visualTilesFromData(previewHedges(map, catalogs), map.w, catalogs),
      properties: { ySort: true, collision: true },
    },
  ];
  const customLayers = currentLayers.filter((layer) => (
    !baseIds.has(layer.id) && layer.id !== 'free-draw'
  ));
  const editable = {
    ...map,
    visualMode: 'tiled',
    visualLayers: [...baseLayers, ...customLayers],
  };
  delete editable.paths;
  delete editable.hedges;
  return editable;
}

function shiftMapItem(item, offsetX, offsetY) {
  if (!item) return item;
  return {
    ...item,
    ...(Number.isFinite(item.x) ? { x: cleanNumber(item.x + offsetX) } : {}),
    ...(Number.isFinite(item.y) ? { y: cleanNumber(item.y + offsetY) } : {}),
  };
}

export function expandMapCanvas(map, width, height, catalogs) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < map.w || height < map.h) {
    throw new Error(`Canvas inválido: use dimensões inteiras iguais ou maiores que ${map.w}×${map.h}`);
  }
  const editable = makeMapEditable(map, catalogs);
  const offsetX = Math.floor((width - editable.w) / 2);
  const offsetY = Math.floor((height - editable.h) / 2);
  const shifted = {
    ...editable,
    w: width,
    h: height,
    camera: {
      ...(editable.camera || {}),
      minZoom: Math.min(editable.camera?.minZoom ?? 0.75, 0.35),
    },
  };
  delete shifted.camera.bounds;

  for (const field of ['building', 'yard']) {
    if (editable[field]) shifted[field] = shiftMapItem(editable[field], offsetX, offsetY);
  }
  for (const field of [
    'zones', 'rooms', 'furniture', 'details', 'props', 'collisions', 'portals', 'entities',
  ]) {
    if (editable[field]) {
      shifted[field] = editable[field].map((item) => shiftMapItem(item, offsetX, offsetY));
    }
  }
  if (editable.spawns) {
    shifted.spawns = Object.fromEntries(Object.entries(editable.spawns).map(([id, spawn]) => (
      [id, shiftMapItem(spawn, offsetX, offsetY)]
    )));
  }

  shifted.visualLayers = editable.visualLayers.map((layer) => {
    const tiles = (layer.tiles || []).map((cell) => ({
      ...cell,
      x: cell.x + offsetX,
      y: cell.y + offsetY,
    }));
    if (layer.id === 'base-floors' && editable.kind === 'world') {
      const floorByCell = new Map();
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) floorByCell.set(`${x},${y}`, { x, y, texture: 'grass' });
      }
      for (const cell of tiles) floorByCell.set(`${cell.x},${cell.y}`, cell);
      return { ...layer, width, height, tiles: [...floorByCell.values()] };
    }
    return { ...layer, width, height, tiles };
  });

  // Depois de assado em tile layers, estes retângulos só duplicariam o desenho e a colisão.
  delete shifted.paths;
  delete shifted.hedges;
  return shifted;
}

function doorGeometry(parent, door, tile) {
  const len = door.len || 3;
  if (door.side === 'N') {
    return { x: (parent.x + door.at) * tile, y: parent.y * tile, width: len * tile, height: 2 * tile };
  }
  if (door.side === 'S') {
    return { x: (parent.x + door.at) * tile, y: (parent.y + parent.h - 1) * tile, width: len * tile, height: tile };
  }
  if (door.side === 'W') {
    return { x: parent.x * tile, y: (parent.y + door.at) * tile, width: tile, height: len * tile };
  }
  return { x: (parent.x + parent.w - 1) * tile, y: (parent.y + door.at) * tile, width: tile, height: len * tile };
}

function mapTilesets() {
  return [
    { firstgid: FIRST_GID.surfaces, source: '../tilesets/surfaces.tsj' },
    { firstgid: FIRST_GID.walls, source: '../tilesets/room-builder.tsj' },
    { firstgid: FIRST_GID.world, source: '../tilesets/world-assets.tsj' },
    { firstgid: FIRST_GID.furniture, source: '../tilesets/office-furniture.tsj' },
    ...paletteDefinitions().map((palette) => ({
      firstgid: FIRST_GID[palette.key],
      source: `../tilesets/${palette.file}`,
    })),
  ];
}

function entityProperties(entity) {
  return {
    ...extraFields(entity, ENTITY_FIELDS),
    ...(entity.properties || {}),
    id: entity.id,
    assetId: entity.assetId,
    oqSourceLayer: entity.layer,
  };
}

function entityObject(entity, objectId, tile, catalogs) {
  const type = entity.type;
  if (!type) throw new Error(`Entidade ${entity.id || objectId} não possui type`);
  const values = entityProperties(entity);
  let object;

  if (entity.assetId) {
    const catalogName = catalogs.furniture.byAsset.has(entity.assetId) ? 'furniture' : 'world';
    const asset = catalogs[catalogName].byAsset.get(entity.assetId);
    if (!asset) throw new Error(`Entidade ${entity.id} usa asset desconhecido: ${entity.assetId}`);
    object = tileObject(
      objectId,
      type,
      entity.name || entity.id,
      asset,
      gidFor(catalogs, catalogName, entity.assetId, entity.flipX),
      (entity.x + 0.5) * tile,
      (entity.y + 1) * tile,
      values,
    );
  } else {
    const geometry = entity.shape === 'point'
      ? { x: entity.x * tile, y: entity.y * tile, point: true }
      : {
          x: entity.x * tile,
          y: entity.y * tile,
          width: (entity.w || 0) * tile,
          height: (entity.h || 0) * tile,
        };
    object = makeObject(objectId, type, entity.name || entity.id, geometry, values);
    if (entity.shape === 'ellipse') object.ellipse = true;
    if (entity.shape === 'polygon') {
      object.polygon = (entity.points || []).map((point) => ({
        x: point.x * tile,
        y: point.y * tile,
      }));
    }
  }

  object.rotation = entity.rotation || 0;
  object.visible = entity.visible !== false;
  return object;
}

function visualCellGid(cell, catalogs) {
  let gid;
  if (cell.texture === 'tiles') gid = FIRST_GID.walls + Number(cell.frame || 0);
  else if (catalogs.surfaces.byAsset.has(cell.texture)) gid = gidFor(catalogs, 'surfaces', cell.texture);
  else {
    const catalogName = catalogs.furniture.byAsset.has(cell.texture) ? 'furniture' : 'world';
    gid = gidFor(catalogs, catalogName, cell.texture);
  }
  return cell.flipX ? ((gid | HORIZONTAL_FLIP) >>> 0) : gid;
}

function visualLayerToTiled(layer, id, map, catalogs) {
  const width = layer.width || map.w;
  const height = layer.height || map.h;
  const data = Array(width * height).fill(0);
  for (const cell of (layer.tiles || [])) {
    const x = Math.round(cell.x);
    const y = Math.round(cell.y);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    data[y * width + x] = visualCellGid(cell, catalogs);
  }
  const tiled = tileLayer(
    id,
    layer.name || layer.id || 'Camada visual',
    'visual',
    width,
    height,
    data,
    {
      locked: false,
      opacity: layer.opacity ?? 1,
      visible: layer.visible !== false,
      properties: {
        id: layer.id,
        depth: layer.depth,
        editorOnly: layer.editorOnly,
        ...(layer.properties || {}),
      },
    },
  );
  tiled.x = layer.x || 0;
  tiled.y = layer.y || 0;
  if (layer.offsetX) tiled.offsetx = layer.offsetX;
  if (layer.offsetY) tiled.offsety = layer.offsetY;
  return tiled;
}

export function runtimeToTiled(map, catalogs, runtimeFile = `${map.id}.json`) {
  const tile = map.tile || 16;
  let nextObjectId = 1;
  let nextLayerId = 1;
  const objectId = () => nextObjectId++;
  const layerId = () => nextLayerId++;

  const structures = [];
  if (map.building) {
    structures.push(makeObject(
      objectId(), 'building', 'Prédio', rectGeometry(map.building, tile),
      { floor: map.building.floor, extraJson: extraJson(map.building, RECT_FIELDS) },
    ));
  }
  if (map.yard) {
    structures.push(makeObject(
      objectId(), 'yard', 'Quintal', rectGeometry(map.yard, tile),
      { ground: map.yard.ground, extraJson: extraJson(map.yard, RECT_FIELDS) },
    ));
  }

  const paths = (map.paths || []).map((path, index) => makeObject(
    objectId(), 'path', `Caminho ${index + 1}`, rectGeometry(path, tile),
    { floor: path.floor, extraJson: extraJson(path, RECT_FIELDS) },
  ));
  const zones = (map.zones || []).map((zone) => makeObject(
    objectId(), 'zone', zone.name || zone.id, rectGeometry(zone, tile),
    { id: zone.id, floor: zone.floor, extraJson: extraJson(zone, RECT_FIELDS) },
  ));
  const rooms = (map.rooms || []).map((room) => makeObject(
    objectId(), 'room', room.name || room.id, rectGeometry(room, tile),
    { id: room.id, floor: room.floor, extraJson: extraJson(room, RECT_FIELDS) },
  ));
  const hedges = (map.hedges || []).map((hedge, index) => makeObject(
    objectId(), 'hedge', `Cerca ${index + 1}`, rectGeometry(hedge, tile),
    { extraJson: extraJson(hedge, RECT_FIELDS) },
  ));

  const details = (map.details || []).map((detail, index) => {
    const assetId = detail.texture || 'grass_detail';
    const asset = catalogs.world.byAsset.get(assetId);
    if (!asset) throw new Error(`Detalhe usa asset desconhecido: ${assetId}`);
    return tileObject(
      objectId(), 'detail', `Detalhe ${index + 1}`, asset,
      gidFor(catalogs, 'world', assetId),
      (detail.x + 0.5) * tile,
      (detail.y + 1) * tile,
      {
        assetId,
        alpha: detail.alpha,
        explicitTexture: Object.hasOwn(detail, 'texture'),
        extraJson: extraJson(detail, DETAIL_FIELDS),
      },
    );
  });

  const props = (map.props || []).map((prop) => {
    const asset = catalogs.world.byAsset.get(prop.texture);
    if (!asset) throw new Error(`Prop usa asset desconhecido: ${prop.texture}`);
    const collision = prop.collision || {};
    return tileObject(
      objectId(), 'prop', prop.texture, asset,
      gidFor(catalogs, 'world', prop.texture, prop.flipX),
      prop.x * tile + (prop.offsetX || 0),
      prop.y * tile + (prop.offsetY || 0),
      {
        assetId: prop.texture,
        originX: prop.originX,
        originY: prop.originY,
        offsetX: prop.offsetX,
        offsetY: prop.offsetY,
        explicitFlipX: Object.hasOwn(prop, 'flipX'),
        depth: prop.depth,
        collisionX: prop.collision ? (collision.x || 0) : undefined,
        collisionY: prop.collision ? (collision.y || 0) : undefined,
        collisionW: collision.w,
        collisionH: collision.h,
        extraJson: extraJson(prop, PROP_FIELDS),
      },
    );
  });

  const furniture = (map.furniture || []).map((item) => {
    const asset = catalogs.furniture.byAsset.get(item.id);
    if (!asset) throw new Error(`Móvel usa asset desconhecido: ${item.id}`);
    const collision = item.collision || {};
    return tileObject(
      objectId(), 'furniture', item.id, asset,
      gidFor(catalogs, 'furniture', item.id, item.flipX),
      (item.x + 0.5) * tile + (item.offsetX || 0),
      (item.y + 1) * tile + (item.offsetY || 0),
      {
        assetId: item.id,
        offsetX: item.offsetX,
        offsetY: item.offsetY,
        originX: item.originX,
        originY: item.originY,
        explicitFlipX: Object.hasOwn(item, 'flipX'),
        depth: item.depth,
        solid: item.solid,
        collisionX: item.collision ? (collision.x || 0) : undefined,
        collisionY: item.collision ? (collision.y || 0) : undefined,
        collisionW: collision.w,
        collisionH: collision.h,
        extraJson: extraJson(item, FURNITURE_FIELDS),
      },
    );
  });

  const doors = [];
  const addDoors = (parent, parentId) => {
    for (const door of parent?.doors || []) {
      doors.push(makeObject(
        objectId(), 'door', `Porta · ${parentId}`, doorGeometry(parent, door, tile),
        {
          parent: parentId,
          side: door.side,
          texture: door.texture,
          frame: door.frame,
          flipX: door.flipX,
          depth: door.depth,
          extraJson: extraJson(door, DOOR_FIELDS),
        },
      ));
    }
  };
  addDoors(map.building, 'building');
  for (const room of map.rooms || []) addDoors(room, room.id);

  const collisions = (map.collisions || []).map((collision, index) => makeObject(
    objectId(), 'collision', `Colisão ${index + 1}`, rectGeometry(collision, tile),
    { extraJson: extraJson(collision, RECT_FIELDS) },
  ));

  const navigation = [];
  for (const [spawnId, spawn] of Object.entries(map.spawns || {})) {
    navigation.push(makeObject(
      objectId(), 'spawn', spawnId,
      { x: (spawn.x + 0.5) * tile, y: spawn.y * tile, point: true },
      { id: spawnId, extraJson: extraJson(spawn, new Set(['x', 'y'])) },
    ));
  }
  for (const portal of map.portals || []) {
    navigation.push(makeObject(
      objectId(), 'portal', portal.id, rectGeometry(portal, tile),
      {
        id: portal.id,
        targetScene: portal.targetScene,
        targetSpawn: portal.targetSpawn,
        label: portal.label,
        extraJson: extraJson(portal, PORTAL_FIELDS),
      },
    ));
  }

  const camera = map.camera?.bounds ? [makeObject(
    objectId(), 'camera', 'Limite da câmera', rectGeometry(map.camera.bounds, tile),
  )] : [];

  const entities = (map.entities || []).map((entity) => entityObject(
    entity,
    objectId(),
    tile,
    catalogs,
  ));
  const visualLayerSources = [...(map.visualLayers || [])];
  if (!visualLayerSources.some((layer) => layer.id === 'free-draw')) {
    visualLayerSources.push({
      id: 'free-draw',
      name: 'Pincel · Desenho livre',
      width: map.w,
      height: map.h,
      depth: -85,
      editorOnly: true,
      tiles: [],
    });
  }
  const visualLayers = visualLayerSources.map((layer) => visualLayerToTiled(
    layer,
    layerId(),
    map,
    catalogs,
  ));

  const structuresLayer = objectLayer(layerId(), 'Objetos · Prédio e quintal', 'structures', '#4c9aff', structures, { opacity: 0.45 });
  const pathsLayer = objectLayer(layerId(), 'Objetos · Caminhos', 'paths', '#e7c873', paths, { opacity: 0.55 });
  const zonesLayer = objectLayer(layerId(), 'Objetos · Zonas abertas', 'zones', '#70d6c7', zones, { opacity: 0.45 });
  const roomsLayer = objectLayer(layerId(), 'Objetos · Salas', 'rooms', '#f4a261', rooms, { opacity: 0.45 });
  const hedgesLayer = objectLayer(layerId(), 'Objetos · Cercas e colisões', 'hedges', '#4f772d', hedges, { opacity: 0.35 });
  const detailsLayer = objectLayer(layerId(), 'Objetos · Detalhes', 'details', '#9ef01a', details);
  const propsLayer = objectLayer(layerId(), 'Objetos · Props do mundo', 'props', '#52b788', props);
  const furnitureLayer = objectLayer(layerId(), 'Objetos · Móveis', 'furniture', '#ffd166', furniture);
  const doorsLayer = objectLayer(layerId(), 'Objetos · Portas', 'doors', '#00b4d8', doors, { opacity: 0.6 });
  const collisionsLayer = objectLayer(layerId(), 'Objetos · Colisões', 'collisions', '#ef233c', collisions, { opacity: 0.55 });
  const navigationLayer = objectLayer(layerId(), 'Objetos · Spawns e portais', 'navigation', '#c77dff', navigation, { opacity: 0.7 });
  const cameraLayer = objectLayer(layerId(), 'Objetos · Limite da câmera (travada)', 'camera', '#ffffff', camera, {
      locked: true,
      opacity: 0.35,
    });
  const mechanicsLayer = objectLayer(layerId(), 'Objetos · Mecânicas', 'mechanics', '#ff70a6', entities, { opacity: 0.75 });
  const objectLayers = [
    structuresLayer,
    pathsLayer,
    zonesLayer,
    roomsLayer,
    hedgesLayer,
    detailsLayer,
    propsLayer,
    furnitureLayer,
    doorsLayer,
    collisionsLayer,
    navigationLayer,
    cameraLayer,
    mechanicsLayer,
  ];
  const emptyEditableRoles = new Set([
    'details', 'props', 'furniture', 'collisions', 'navigation', 'mechanics',
  ]);
  const nativeObjectLayers = objectLayers.filter((layer) => (
    layer.objects.length > 0 || emptyEditableRoles.has(propertyMap(layer).oqRole)
  ));
  const layers = map.visualMode === 'tiled'
    ? [...visualLayers, ...nativeObjectLayers]
    : [
        tileLayer(layerId(), 'Prévia · Pisos (não editar)', 'previewFloors', map.w, map.h, previewFloors(map, catalogs)),
        structuresLayer,
        pathsLayer,
        zonesLayer,
        roomsLayer,
        tileLayer(layerId(), 'Prévia · Cercas (não editar)', 'previewHedges', map.w, map.h, previewHedges(map, catalogs)),
        hedgesLayer,
        tileLayer(layerId(), 'Prévia · Paredes (não editar)', 'previewWalls', map.w, map.h, previewWalls(map)),
        detailsLayer,
        propsLayer,
        furnitureLayer,
        doorsLayer,
        collisionsLayer,
        navigationLayer,
        cameraLayer,
        mechanicsLayer,
        ...visualLayers,
      ];

  const rootExtra = extraJson(map, ROOT_FIELDS);
  return {
    backgroundcolor: map.background || (map.kind === 'world' || map.yard ? '#5c8f3e' : '#20222c'),
    class: 'OfficeQuestScene',
    compressionlevel: -1,
    height: map.h,
    infinite: false,
    layers,
    nextlayerid: nextLayerId,
    nextobjectid: nextObjectId,
    orientation: 'orthogonal',
    properties: properties({
      oqSchema: 'office-quest@1',
      id: map.id,
      name: map.name,
      subtitle: map.subtitle,
      kind: map.kind,
      visualMode: map.visualMode,
      runtimeFile,
      cameraZoom: map.camera?.zoom,
      cameraMinZoom: map.camera?.minZoom,
      cameraMaxZoom: map.camera?.maxZoom,
      background: map.background,
      ground: map.ground,
      assetsJson: JSON.stringify(map.assets || []),
      extraJson: rootExtra,
    }),
    renderorder: 'right-down',
    tiledversion: TILED_VERSION,
    tileheight: tile,
    tilesets: mapTilesets(),
    tilewidth: tile,
    type: 'map',
    version: FORMAT_VERSION,
    width: map.w,
  };
}

function mergeTemplateProperties(base = [], overrides = []) {
  const merged = new Map(base.map((item) => [item.name, item]));
  for (const item of overrides) merged.set(item.name, item);
  return [...merged.values()];
}

function resolveTemplateObject(object, sourcePath) {
  if (!object.template) return object;
  const templatePath = resolve(dirname(sourcePath), object.template);
  const template = readJson(templatePath);
  if (template.type !== 'template' || !template.object) {
    throw new Error(`Template Tiled inválido: ${templatePath}`);
  }
  return {
    ...template.object,
    ...object,
    properties: mergeTemplateProperties(template.object.properties, object.properties),
  };
}

function allObjectRecords(tiled, sourcePath) {
  const result = [];
  const visit = (layers) => {
    for (const layer of layers || []) {
      if (layer.type === 'objectgroup') {
        const layerProps = propertyMap(layer);
        for (const sourceObject of (layer.objects || [])) {
          const object = resolveTemplateObject(sourceObject, sourcePath);
          result.push({
            object,
            layer: layerProps.oqRole || layer.name,
          });
        }
      }
      if (layer.type === 'group') visit(layer.layers);
    }
  };
  visit(tiled.layers);
  return result;
}

function allObjects(tiled, sourcePath) {
  return allObjectRecords(tiled, sourcePath).map((record) => record.object);
}

function allTileLayerRecords(tiled) {
  const result = [];
  let order = 0;
  const visit = (layers) => {
    for (const layer of layers || []) {
      if (layer.type === 'tilelayer') result.push({ layer, order: order++ });
      if (layer.type === 'group') visit(layer.layers);
    }
  };
  visit(tiled.layers);
  return result;
}

function visualTile(rawGid, x, y, catalogs) {
  const unsigned = rawGid >>> 0;
  const baseGid = unsigned & GID_MASK;
  const flipX = Boolean(unsigned & HORIZONTAL_FLIP);
  if (baseGid >= FIRST_GID.walls && baseGid < FIRST_GID.world) {
    return { x, y, texture: 'tiles', frame: baseGid - FIRST_GID.walls, ...(flipX ? { flipX: true } : {}) };
  }
  const asset = resolveGid(catalogs, rawGid);
  return {
    x,
    y,
    texture: asset.assetId,
    ...(asset.flipX ? { flipX: true } : {}),
  };
}

function visualLayersFromTiled(tiled, catalogs) {
  const previews = new Set(['previewFloors', 'previewHedges', 'previewWalls']);
  return allTileLayerRecords(tiled)
    .filter(({ layer }) => !previews.has(propertyMap(layer).oqRole))
    .map(({ layer, order }) => {
      const values = propertyMap(layer);
      const tiles = [];
      const readData = (data, width, startX = 0, startY = 0) => {
        for (let index = 0; index < (data || []).length; index += 1) {
          const gid = data[index];
          if (!gid) continue;
          tiles.push(visualTile(
            gid,
            startX + (index % width),
            startY + Math.floor(index / width),
            catalogs,
          ));
        }
      };
      if (layer.chunks) {
        for (const chunk of layer.chunks) readData(chunk.data, chunk.width, chunk.x, chunk.y);
      } else {
        readData(layer.data, layer.width || tiled.width);
      }
      if (values.editorOnly && tiles.length === 0) return null;
      const customProperties = Object.fromEntries(Object.entries(values).filter(([key]) => (
        key !== 'oqRole' && key !== 'id' && key !== 'depth' && key !== 'editorOnly'
      )));
      const result = {
        id: values.id || layer.name,
        name: layer.name,
        width: layer.width || tiled.width,
        height: layer.height || tiled.height,
        depth: values.depth ?? (-85 + order / 1000),
        tiles,
      };
      if (layer.x) result.x = layer.x;
      if (layer.y) result.y = layer.y;
      if (layer.offsetx) result.offsetX = layer.offsetx;
      if (layer.offsety) result.offsetY = layer.offsety;
      if (layer.opacity !== undefined && layer.opacity !== 1) result.opacity = layer.opacity;
      if (layer.visible === false) result.visible = false;
      if (Object.keys(customProperties).length) result.properties = customProperties;
      return result;
    })
    .filter(Boolean);
}

function objectType(object) {
  return object.type || object.class || '';
}

function rectFromObject(object, tile) {
  return {
    x: cleanNumber(object.x / tile),
    y: cleanNumber(object.y / tile),
    w: cleanNumber(object.width / tile),
    h: cleanNumber(object.height / tile),
  };
}

function optional(target, key, value, props) {
  if (Object.hasOwn(props, key)) target[key] = value;
}

function assetFromObject(object, props, catalogs) {
  const resolved = object.gid ? resolveGid(catalogs, object.gid) : undefined;
  const assetId = props.assetId || resolved?.assetId;
  if (!assetId) throw new Error(`Objeto ${object.name || object.id} não possui assetId nem GID`);
  return {
    ...resolved,
    assetId,
    flipX: Boolean(resolved?.flipX || props.flipX),
  };
}

function doorFromObject(object, parent, tile) {
  const props = propertyMap(object);
  if (!parent) throw new Error(`Porta ${object.name || object.id} aponta para parent inexistente: ${props.parent}`);
  const side = props.side;
  if (!['N', 'S', 'E', 'W'].includes(side)) throw new Error(`Porta ${object.name || object.id} tem side inválido: ${side}`);
  const horizontal = side === 'N' || side === 'S';
  const door = {
    ...parseExtra(props),
    side,
    at: cleanNumber(horizontal ? object.x / tile - parent.x : object.y / tile - parent.y),
    len: cleanNumber(horizontal ? object.width / tile : object.height / tile),
  };
  optional(door, 'texture', props.texture, props);
  optional(door, 'frame', props.frame, props);
  optional(door, 'flipX', props.flipX, props);
  optional(door, 'depth', props.depth, props);
  return door;
}

function appendAsset(assets, assetId) {
  if (assetId && !assets.includes(assetId)) assets.push(assetId);
}

export function tiledToRuntime(tiled, catalogs, sourcePath) {
  const mapProps = propertyMap(tiled);
  if (mapProps.oqSchema !== 'office-quest@1') {
    throw new Error(`Schema Tiled não suportado: ${mapProps.oqSchema || '(ausente)'}`);
  }
  const tile = tiled.tilewidth || 16;
  const resolvedSourcePath = sourcePath || tiledPath(mapProps.id);
  const objectRecords = allObjectRecords(tiled, resolvedSourcePath);
  const objects = objectRecords.map((record) => record.object);
  const layerByObject = new Map(objectRecords.map((record) => [record.object, record.layer]));
  const cameraLayerRecords = objectRecords.filter((record) => record.layer === 'camera');
  if (
    cameraLayerRecords.length > 1
    || cameraLayerRecords.some(({ object }) => objectType(object) !== 'camera')
  ) {
    throw new Error('Limite da câmera inválido: a camada 14 deve conter somente um retângulo camera');
  }
  const visualLayers = visualLayersFromTiled(tiled, catalogs);
  const effectiveType = (object) => {
    const explicit = objectType(object);
    if (explicit) return explicit;
    if (!object.gid) return '';
    return resolveGid(catalogs, object.gid).category || '';
  };
  const byType = (type) => objects.filter((object) => effectiveType(object) === type);

  const entities = objects
    .filter((object) => {
      const type = effectiveType(object);
      return type && !BUILTIN_OBJECT_TYPES.has(type);
    })
    .map((object) => {
      const values = propertyMap(object);
      const type = effectiveType(object);
      const customProperties = {
        ...parseExtra(values),
        ...Object.fromEntries(Object.entries(values).filter(([key]) => (
          key !== 'id' && key !== 'assetId' && key !== 'extraJson' && key !== 'oqSourceLayer'
        ))),
      };
      const result = {
        id: values.id || object.name || `${type}-${object.id}`,
        type,
        x: cleanNumber(object.x / tile),
        y: cleanNumber(object.y / tile),
        layer: values.oqSourceLayer || layerByObject.get(object),
      };
      if (object.name && object.name !== result.id) result.name = object.name;
      if (object.gid) {
        const asset = assetFromObject(object, values, catalogs);
        result.x = cleanNumber(object.x / tile - 0.5);
        result.y = cleanNumber(object.y / tile - 1);
        result.w = cleanNumber(object.width / tile);
        result.h = cleanNumber(object.height / tile);
        result.shape = 'tile';
        result.assetId = asset.assetId;
        if (asset.flipX) result.flipX = true;
      } else if (object.point) {
        result.shape = 'point';
      } else {
        result.w = cleanNumber(object.width / tile);
        result.h = cleanNumber(object.height / tile);
        if (object.ellipse) result.shape = 'ellipse';
        if (object.polygon) {
          result.shape = 'polygon';
          result.points = object.polygon.map((point) => ({
            x: cleanNumber(point.x / tile),
            y: cleanNumber(point.y / tile),
          }));
        }
      }
      if (object.rotation) result.rotation = object.rotation;
      if (object.visible === false) result.visible = false;
      if (Object.keys(customProperties).length) result.properties = customProperties;
      return result;
    });

  const structureFrom = (object, type) => {
    if (!object) return undefined;
    const props = propertyMap(object);
    const result = { ...parseExtra(props), ...rectFromObject(object, tile) };
    if (type === 'building') optional(result, 'floor', props.floor, props);
    if (type === 'yard') optional(result, 'ground', props.ground, props);
    return result;
  };

  const buildingObject = byType('building')[0];
  const building = structureFrom(buildingObject, 'building');
  const yard = structureFrom(byType('yard')[0], 'yard');
  const zones = byType('zone').map((object) => {
    const props = propertyMap(object);
    const result = {
      ...parseExtra(props),
      id: props.id || object.name,
      name: object.name || props.id,
      ...rectFromObject(object, tile),
    };
    optional(result, 'floor', props.floor, props);
    return result;
  });
  const rooms = byType('room').map((object) => {
    const props = propertyMap(object);
    const result = {
      ...parseExtra(props),
      id: props.id || object.name,
      name: object.name || props.id,
      ...rectFromObject(object, tile),
    };
    optional(result, 'floor', props.floor, props);
    return result;
  });

  for (const object of byType('door')) {
    const props = propertyMap(object);
    const parent = props.parent === 'building'
      ? building
      : rooms.find((room) => room.id === props.parent);
    const door = doorFromObject(object, parent, tile);
    parent.doors ||= [];
    parent.doors.push(door);
  }

  const paths = byType('path').map((object) => {
    const props = propertyMap(object);
    const result = { ...parseExtra(props), ...rectFromObject(object, tile) };
    optional(result, 'floor', props.floor, props);
    return result;
  });
  const hedges = byType('hedge').map((object) => ({
    ...parseExtra(propertyMap(object)),
    ...rectFromObject(object, tile),
  }));
  const collisions = byType('collision').map((object) => ({
    ...parseExtra(propertyMap(object)),
    ...rectFromObject(object, tile),
  }));

  const details = byType('detail').map((object) => {
    const props = propertyMap(object);
    const asset = assetFromObject(object, props, catalogs);
    const result = {
      ...parseExtra(props),
      x: cleanNumber(object.x / tile - 0.5),
      y: cleanNumber(object.y / tile - 1),
    };
    if (props.explicitTexture || asset.assetId !== 'grass_detail') result.texture = asset.assetId;
    optional(result, 'alpha', props.alpha, props);
    return result;
  });

  const props = byType('prop').map((object) => {
    const values = propertyMap(object);
    const asset = assetFromObject(object, values, catalogs);
    const offsetX = values.offsetX || 0;
    const offsetY = values.offsetY || 0;
    const result = {
      ...parseExtra(values),
      texture: asset.assetId,
      x: cleanNumber((object.x - offsetX) / tile),
      y: cleanNumber((object.y - offsetY) / tile),
    };
    optional(result, 'originX', values.originX, values);
    optional(result, 'originY', values.originY, values);
    optional(result, 'offsetX', values.offsetX, values);
    optional(result, 'offsetY', values.offsetY, values);
    if (asset.flipX || values.explicitFlipX || Object.hasOwn(values, 'flipX')) {
      result.flipX = asset.flipX;
    }
    optional(result, 'depth', values.depth, values);
    if (Object.hasOwn(values, 'collisionW') && Object.hasOwn(values, 'collisionH')) {
      result.collision = {
        x: values.collisionX || 0,
        y: values.collisionY || 0,
        w: values.collisionW,
        h: values.collisionH,
      };
    }
    return result;
  });

  const furniture = byType('furniture').map((object) => {
    const values = propertyMap(object);
    const asset = assetFromObject(object, values, catalogs);
    const offsetX = values.offsetX || 0;
    const offsetY = values.offsetY || 0;
    const result = {
      ...parseExtra(values),
      id: asset.assetId,
      x: cleanNumber((object.x - offsetX) / tile - 0.5),
      y: cleanNumber((object.y - offsetY) / tile - 1),
    };
    optional(result, 'offsetX', values.offsetX, values);
    optional(result, 'offsetY', values.offsetY, values);
    optional(result, 'originX', values.originX, values);
    optional(result, 'originY', values.originY, values);
    if (asset.flipX || values.explicitFlipX || Object.hasOwn(values, 'flipX')) {
      result.flipX = asset.flipX;
    }
    optional(result, 'depth', values.depth, values);
    optional(result, 'solid', values.solid, values);
    if (Object.hasOwn(values, 'collisionW') && Object.hasOwn(values, 'collisionH')) {
      result.collision = {
        x: values.collisionX || 0,
        y: values.collisionY || 0,
        w: values.collisionW,
        h: values.collisionH,
      };
    }
    return result;
  });

  const spawns = {};
  for (const object of byType('spawn')) {
    const values = propertyMap(object);
    const id = values.id || object.name;
    spawns[id] = {
      ...parseExtra(values),
      x: cleanNumber(object.x / tile - 0.5),
      y: cleanNumber(object.y / tile),
    };
  }
  const portals = byType('portal').map((object) => {
    const values = propertyMap(object);
    const result = {
      ...parseExtra(values),
      id: values.id || object.name,
      ...rectFromObject(object, tile),
      targetScene: values.targetScene,
    };
    optional(result, 'targetSpawn', values.targetSpawn, values);
    optional(result, 'label', values.label, values);
    return result;
  });

  const cameraObject = byType('camera')[0];
  const camera = {};
  if (Object.hasOwn(mapProps, 'cameraZoom')) camera.zoom = mapProps.cameraZoom;
  if (Object.hasOwn(mapProps, 'cameraMinZoom')) camera.minZoom = mapProps.cameraMinZoom;
  if (Object.hasOwn(mapProps, 'cameraMaxZoom')) camera.maxZoom = mapProps.cameraMaxZoom;
  if (cameraObject) camera.bounds = rectFromObject(cameraObject, tile);
  if (camera.bounds && (
    camera.bounds.x < 0
    || camera.bounds.y < 0
    || camera.bounds.w <= 0
    || camera.bounds.h <= 0
    || camera.bounds.x + camera.bounds.w > tiled.width
    || camera.bounds.y + camera.bounds.h > tiled.height
  )) {
    throw new Error('Limite da câmera inválido: o retângulo precisa permanecer dentro do mapa');
  }

  let previousAssets;
  try {
    previousAssets = JSON.parse(mapProps.assetsJson || '[]');
  } catch (error) {
    throw new Error(`assetsJson inválido: ${error.message}`);
  }
  const requiredAssets = [];
  for (const detail of details) appendAsset(requiredAssets, detail.texture || 'grass_detail');
  for (const prop of props) appendAsset(requiredAssets, prop.texture);
  for (const item of furniture) appendAsset(requiredAssets, item.id);
  for (const entity of entities) appendAsset(requiredAssets, entity.assetId);
  for (const layer of visualLayers) {
    for (const cell of layer.tiles) {
      const serializedSurface = catalogs.surfaces.byAsset.has(cell.texture)
        && previousAssets.includes(cell.texture);
      if (cell.texture !== 'tiles' && (
        !catalogs.surfaces.byAsset.has(cell.texture) || serializedSurface
      )) {
        appendAsset(requiredAssets, cell.texture);
      }
    }
  }
  for (const door of [building, ...rooms].flatMap((parent) => parent?.doors || [])) appendAsset(requiredAssets, door.texture);
  if (hedges.length) {
    appendAsset(requiredAssets, 'hedge_top');
    appendAsset(requiredAssets, 'hedge_fill');
  }
  const requiredSet = new Set(requiredAssets);
  const assets = previousAssets.filter((assetId) => requiredSet.has(assetId));
  for (const assetId of requiredAssets) appendAsset(assets, assetId);

  const result = {
    ...parseExtra(mapProps),
    id: mapProps.id,
    name: mapProps.name,
    subtitle: mapProps.subtitle,
    kind: mapProps.kind,
    tile,
    w: tiled.width,
    h: tiled.height,
  };
  if (Object.keys(camera).length) result.camera = camera;
  optional(result, 'background', mapProps.background, mapProps);
  optional(result, 'visualMode', mapProps.visualMode, mapProps);
  if (mapProps.kind === 'world') result.ground = mapProps.ground || 'grass';
  if (yard) result.yard = yard;
  if (assets.length) result.assets = assets;
  if (building) result.building = building;
  if (Object.keys(spawns).length) result.spawns = spawns;
  if (zones.length) result.zones = zones;
  if (rooms.length) result.rooms = rooms;
  if (furniture.length) result.furniture = furniture;
  if (details.length) result.details = details;
  if (paths.length) result.paths = paths;
  if (hedges.length) result.hedges = hedges;
  if (props.length) result.props = props;
  if (collisions.length) result.collisions = collisions;
  if (portals.length) result.portals = portals;
  if (entities.length) result.entities = entities;
  if (visualLayers.length) result.visualLayers = visualLayers;
  return result;
}

function manifest() {
  return readJson(resolve(MAPS_DIR, 'scenes.json'));
}

function sceneTargets(requested = 'all') {
  const scenes = manifest().scenes;
  if (requested === 'all') return scenes;
  const scene = scenes.find((candidate) => candidate.id === requested);
  if (!scene) throw new Error(`Cena não cadastrada em maps/scenes.json: ${requested}`);
  return [scene];
}

function tiledPath(sceneId) {
  return resolve(TILED_MAPS_DIR, `${sceneId}.tmj`);
}

function runtimeFile(scene) {
  return scene.runtimeFile || `${scene.id}.json`;
}

export function toTiled(requested = 'all', force = false) {
  const catalogs = generateTilesets();
  for (const scene of sceneTargets(requested)) {
    const file = runtimeFile(scene);
    const source = resolve(MAPS_DIR, file);
    const destination = tiledPath(scene.id);
    if (existsSync(destination) && !force) {
      throw new Error(`${relative(CLIENT_ROOT, destination)} já existe; use --force para sobrescrever`);
    }
    const map = readJson(source);
    writeJson(destination, runtimeToTiled(map, catalogs, file));
    console.log(`Tiled criado: ${posixPath(relative(CLIENT_ROOT, destination))}`);
  }
}

export function makeEditable(requested = 'all') {
  const catalogs = generateTilesets();
  const converted = new Map();
  const outputs = [];
  for (const scene of sceneTargets(requested)) {
    const file = runtimeFile(scene);
    const runtimePath = resolve(MAPS_DIR, file);
    const destination = tiledPath(scene.id);
    const editable = makeMapEditable(readJson(runtimePath), catalogs);
    const tiled = runtimeToTiled(editable, catalogs, file);
    const restored = tiledToRuntime(tiled, catalogs, destination);
    converted.set(scene.id, restored);
    outputs.push({ scene, runtimePath, destination, tiled, restored });
  }
  validateMaps(converted, requested === 'all');
  for (const output of outputs) {
    writeJson(output.runtimePath, output.restored);
    writeJson(output.destination, output.tiled);
    console.log(`Mapa editável criado: ${posixPath(relative(CLIENT_ROOT, output.destination))}`);
  }
}

export function expandCanvas(sceneId, width, height) {
  if (!sceneId || sceneId === 'all') throw new Error('Informe uma cena para expandir, por exemplo: world');
  const catalogs = generateTilesets();
  const scene = sceneTargets(sceneId)[0];
  const file = runtimeFile(scene);
  const runtimePath = resolve(MAPS_DIR, file);
  const destination = tiledPath(scene.id);
  const expanded = expandMapCanvas(readJson(runtimePath), width, height, catalogs);
  const tiled = runtimeToTiled(expanded, catalogs, file);
  const restored = tiledToRuntime(tiled, catalogs, destination);
  const converted = new Map([[scene.id, restored]]);
  validateMaps(converted, false);
  writeJson(runtimePath, restored);
  writeJson(destination, tiled);
  console.log(`Canvas expandido para ${width}×${height}: ${posixPath(relative(CLIENT_ROOT, destination))}`);
}

export function fromTiled(requested = 'all') {
  const catalogs = loadTilesetCatalogs();
  const converted = new Map();
  for (const scene of sceneTargets(requested)) {
    const source = tiledPath(scene.id);
    if (!existsSync(source)) throw new Error(`Mapa Tiled não encontrado: ${source}`);
    const map = tiledToRuntime(readJson(source), catalogs, source);
    if (map.id !== scene.id) throw new Error(`ID do TMJ (${map.id}) difere do manifesto (${scene.id})`);
    converted.set(scene.id, map);
  }
  validateMaps(converted, requested === 'all');
  for (const scene of sceneTargets(requested)) {
    const destination = resolve(MAPS_DIR, runtimeFile(scene));
    writeJson(destination, converted.get(scene.id));
    console.log(`Runtime atualizado: ${posixPath(relative(CLIENT_ROOT, destination))}`);
  }
}

export function roundTrip(requested = 'all') {
  const catalogs = loadTilesetCatalogs();
  for (const scene of sceneTargets(requested)) {
    const file = runtimeFile(scene);
    const original = readJson(resolve(MAPS_DIR, file));
    const tiled = runtimeToTiled(original, catalogs, file);
    const restored = tiledToRuntime(tiled, catalogs);
    if (JSON.stringify(canonical(original)) !== JSON.stringify(canonical(restored))) {
      throw new Error(`Round-trip alterou o mapa ${scene.id}`);
    }
    console.log(`Round-trip OK: ${scene.id}`);
  }
}

export function validateTiled(requested = 'all') {
  const catalogs = loadTilesetCatalogs();
  const converted = new Map();
  for (const scene of sceneTargets(requested)) {
    const source = tiledPath(scene.id);
    const map = tiledToRuntime(readJson(source), catalogs, source);
    converted.set(scene.id, map);
  }
  validateMaps(converted, requested === 'all');
  for (const sceneId of converted.keys()) console.log(`TMJ válido: ${sceneId}`);
}

export function refreshPreviews(requested = 'all') {
  const catalogs = loadTilesetCatalogs();
  for (const scene of sceneTargets(requested)) {
    const path = tiledPath(scene.id);
    const tiled = readJson(path);
    const runtime = tiledToRuntime(tiled, catalogs, path);
    const fresh = runtimeToTiled(runtime, catalogs, runtimeFile(scene));
    const freshByRole = new Map(fresh.layers.map((layer) => [propertyMap(layer).oqRole, layer]));
    tiled.layers = tiled.layers.map((layer) => {
      const role = propertyMap(layer).oqRole;
      if (!role?.startsWith('preview')) return layer;
      const replacement = freshByRole.get(role);
      if (!replacement) return layer;
      return { ...replacement, id: layer.id, name: layer.name };
    });
    tiled.tilesets = fresh.tilesets;
    tiled.width = fresh.width;
    tiled.height = fresh.height;
    tiled.tilewidth = fresh.tilewidth;
    tiled.tileheight = fresh.tileheight;
    writeJson(path, tiled);
    console.log(`Prévia atualizada: ${posixPath(relative(CLIENT_ROOT, path))}`);
  }
}

function validateMaps(converted, completeSet) {
  const animations = readJson(ANIMATIONS_CATALOG_PATH);
  const allMaps = completeSet
    ? converted
    : new Map(manifest().scenes.map((scene) => {
      const selected = converted.get(scene.id);
      return [scene.id, selected || readJson(resolve(MAPS_DIR, runtimeFile(scene)))];
    }));
  for (const [sceneId, map] of converted) {
    if (!map.id || !map.kind || !map.w || !map.h) throw new Error(`Mapa incompleto: ${sceneId}`);
    if (!map.spawns?.default) throw new Error(`Cena ${sceneId} não possui spawn default`);
    for (const portal of map.portals || []) {
      const target = allMaps.get(portal.targetScene);
      if (!target) throw new Error(`Portal ${portal.id} aponta para cena inexistente: ${portal.targetScene}`);
      if (portal.targetSpawn && !target.spawns?.[portal.targetSpawn]) {
        throw new Error(`Portal ${portal.id} aponta para spawn inexistente: ${portal.targetScene}.${portal.targetSpawn}`);
      }
    }
    for (const assetId of map.assets || []) {
      if (assetId === 'office_door') continue;
      const path = animations[assetId]
        ? resolve(CLIENT_ROOT, animations[assetId].path)
        : assetId.startsWith('of_')
          ? resolve(CLIENT_ROOT, `assets/furniture/office/${assetId}.png`)
          : resolve(CLIENT_ROOT, `assets/world/${assetId}.png`);
      if (!existsSync(path)) throw new Error(`Asset da cena ${sceneId} não existe: ${assetId}`);
    }
    for (const entity of mapMechanicEntities(map)) {
      const handler = mechanicsRegistry.get(entity.type);
      if (!handler) {
        throw new Error(`Cena ${sceneId}: mecânica sem handler registrado: ${entity.type} (${entity.id || entity.name})`);
      }
      handler.validate?.(entity, map);
    }
  }
}

function printHelp() {
  console.log(`
Conversor Tiled ↔ Office Quest

Uso:
  node client-web/tools/tiled-converter.mjs assets
  node client-web/tools/tiled-converter.mjs make-editable [all|scene-id]
  node client-web/tools/tiled-converter.mjs expand-canvas <scene-id> <largura> <altura>
  node client-web/tools/tiled-converter.mjs to-tiled [all|scene-id] [--force]
  node client-web/tools/tiled-converter.mjs from-tiled [all|scene-id]
  node client-web/tools/tiled-converter.mjs refresh-preview [all|scene-id]
  node client-web/tools/tiled-converter.mjs validate [all|scene-id]
  node client-web/tools/tiled-converter.mjs roundtrip [all|scene-id]
`);
}

async function main() {
  const [, , command, requested = 'all', ...flags] = process.argv;
  if (!command || command === 'help' || command === '--help') {
    printHelp();
    return;
  }
  if (command === 'assets') {
    generateTilesets();
    console.log('Tilesets atualizados.');
    return;
  }
  if (command === 'make-editable') {
    makeEditable(requested);
    return;
  }
  if (command === 'expand-canvas') {
    expandCanvas(requested, Number(flags[0]), Number(flags[1]));
    return;
  }
  if (command === 'to-tiled') {
    toTiled(requested, flags.includes('--force'));
    return;
  }
  if (command === 'from-tiled') {
    fromTiled(requested);
    return;
  }
  if (command === 'refresh-preview') {
    refreshPreviews(requested);
    return;
  }
  if (command === 'validate') {
    validateTiled(requested);
    return;
  }
  if (command === 'roundtrip') {
    roundTrip(requested);
    return;
  }
  throw new Error(`Comando desconhecido: ${command}`);
}

const isCli = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isCli) {
  main().catch((error) => {
    console.error(`Erro: ${error.message}`);
    process.exitCode = 1;
  });
}
