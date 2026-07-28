// Prévia do mapa em PNG, sem Phaser: o cliente é WebGL e o pane de captura trava nele,
// então a planta é conferida aqui — piso, paredes, portas, móveis e props com a arte real,
// na mesma matemática de posicionamento do `MapRenderer`.
//
//   node tools/map-preview.mjs tooq-campus
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTiledMap } from '../src/TiledRuntimeLoader.js';
import { decodePng, encodePng, createCanvas, blit, fillRect, setPixel } from './png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TILE = 16;
const cache = new Map();
const image = (file) => {
  if (!cache.has(file)) cache.set(file, decodePng(fs.readFileSync(file)));
  return cache.get(file);
};

const FLOOR_FILE = {
  wood: 'floor_wood', gray: 'floor_carpet', carpet: 'floor_carpet',
  light: 'floor_cream', cream: 'floor_cream', terra: 'floor_sage',
  sage: 'floor_sage', water: 'floor_water',
};
const GRASS = [0x5f, 0x8f, 0x4a, 255];

// Mesmos quadros de `room_builder.png` usados pelo renderer.
const F = (column, row) => row * 16 + column;
const WALL = {
  TL: F(7, 1), TOP: F(8, 1), TR: F(9, 1),
  L: F(7, 2), R: F(9, 2),
  BL: F(7, 3), BOT: F(8, 3), BR: F(9, 3),
};
const wallFace = (row) => ({ cap: F(1, row), face: F(1, row + 1) });
const NORTH_WALL = { white: wallFace(11), stone: wallFace(7), brick: wallFace(9), lavender: wallFace(5) };

function fillFloor(canvas, rect, floor) {
  const name = FLOOR_FILE[floor] || FLOOR_FILE.cream;
  const texture = image(path.join(root, `assets/floors/${name}.png`));
  for (let y = 0; y < rect.h * TILE; y++) {
    for (let x = 0; x < rect.w * TILE; x++) {
      const source = ((y % texture.height) * texture.width + (x % texture.width)) * 4;
      const target = ((rect.y * TILE + y) * canvas.width + rect.x * TILE + x) * 4;
      if (target < 0 || target >= canvas.data.length) continue;
      texture.data.copy(canvas.data, target, source, source + 4);
    }
  }
}

function drawTile(canvas, frame, x, y) {
  const sheet = image(path.join(root, 'assets/tiles/room_builder.png'));
  const columns = Math.floor(sheet.width / TILE);
  const sx = (frame % columns) * TILE;
  const sy = Math.floor(frame / columns) * TILE;
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const source = ((sy + py) * sheet.width + sx + px) * 4;
      if (!sheet.data[source + 3]) continue;
      const tx = x * TILE + px;
      const ty = y * TILE + py;
      if (tx < 0 || ty < 0 || tx >= canvas.width || ty >= canvas.height) continue;
      sheet.data.copy(canvas.data, (ty * canvas.width + tx) * 4, source, source + 4);
    }
  }
}

function drawWalls(canvas, rect) {
  const right = rect.x + rect.w - 1;
  const bottom = rect.y + rect.h - 1;
  const north = NORTH_WALL[rect.wallStyle] || NORTH_WALL.white;
  const doors = new Set();
  for (const door of rect.doors || []) {
    const length = door.len || 2;
    for (let i = 0; i < length; i++) {
      if (door.side === 'N') {
        doors.add(`${rect.x + door.at + i},${rect.y}`);
        doors.add(`${rect.x + door.at + i},${rect.y + 1}`);
      } else if (door.side === 'S') {
        doors.add(`${rect.x + door.at + i},${bottom}`);
        if (rect.southWall3d) doors.add(`${rect.x + door.at + i},${bottom - 1}`);
      } else if (door.side === 'W') doors.add(`${rect.x},${rect.y + door.at + i}`);
      else doors.add(`${right},${rect.y + door.at + i}`);
    }
  }
  const put = (x, y, frame) => {
    if (doors.has(`${x},${y}`)) return;
    drawTile(canvas, frame, x, y);
  };
  const hasNorthFace = bottom > rect.y + 2;
  put(rect.x, rect.y, WALL.TL);
  put(right, rect.y, WALL.TR);
  if (!rect.southWall3d) {
    put(rect.x, bottom, WALL.BL);
    put(right, bottom, WALL.BR);
  }
  for (let x = rect.x + 1; x < right; x++) {
    put(x, rect.y, hasNorthFace ? north.cap : WALL.TOP);
    if (hasNorthFace) put(x, rect.y + 1, north.face);
    if (rect.southWall3d) {
      put(x, bottom - 1, north.cap);
      put(x, bottom, north.face);
    } else put(x, bottom, WALL.BOT);
  }
  const sideEnd = rect.southWall3d ? bottom + 1 : bottom;
  for (let y = rect.y + 1; y < sideEnd; y++) {
    put(rect.x, y, WALL.L);
    put(right, y, WALL.R);
  }
}

function textureFile(map, id) {
  const entry = (map.tiledTextures || []).find((texture) => texture.key === id);
  return entry ? fileURLToPath(entry.url) : null;
}

function drawSprite(canvas, map, item, textureId) {
  const file = textureFile(map, textureId);
  if (!file || !fs.existsSync(file)) return false;
  const sprite = image(file);
  const originX = item.originX ?? 0.5;
  const originY = item.originY ?? 1;
  const x = item.x * TILE + TILE / 2 + (item.offsetX || 0) - sprite.width * originX;
  const y = item.y * TILE + TILE + (item.offsetY || 0) - sprite.height * originY;
  if (item.flipX) {
    const mirrored = createCanvas(sprite.width, sprite.height);
    for (let py = 0; py < sprite.height; py++) {
      for (let px = 0; px < sprite.width; px++) {
        const source = (py * sprite.width + (sprite.width - 1 - px)) * 4;
        sprite.data.copy(mirrored.data, (py * sprite.width + px) * 4, source, source + 4);
      }
    }
    blit(canvas, mirrored, Math.round(x), Math.round(y));
    return true;
  }
  blit(canvas, sprite, Math.round(x), Math.round(y));
  return true;
}

const sceneId = process.argv[2] || 'tooq-campus';
const tmj = path.join(root, `tiled/maps/${sceneId}.tmj`);
const map = await loadTiledMap(pathToFileURL(tmj).href, {
  fetchJson: async (url) => JSON.parse(fs.readFileSync(fileURLToPath(url), 'utf8')),
});

const canvas = createCanvas(map.w * TILE, map.h * TILE);
fillRect(canvas, 0, 0, canvas.width, canvas.height, GRASS);
if (map.yard) fillRect(canvas, map.yard.x * TILE, map.yard.y * TILE, map.yard.w * TILE, map.yard.h * TILE, GRASS);
for (const rect of map.paths || []) fillFloor(canvas, rect, rect.floor);
if (map.building) fillFloor(canvas, map.building, map.building.floor);
for (const zone of map.zones || []) fillFloor(canvas, zone, zone.floor);
for (const room of map.rooms || []) {
  // Mesmo recuo do renderer: o piso da sala para dentro das paredes.
  const north = room.h > 3 ? 2 : 1;
  const south = room.southWall3d ? 2 : 1;
  fillFloor(canvas, {
    x: room.x + 1,
    y: room.y + north,
    w: Math.max(0, room.w - 2),
    h: Math.max(0, room.h - north - south),
  }, room.floor);
}
if (map.building) drawWalls(canvas, map.building);
for (const room of map.rooms || []) drawWalls(canvas, room);

// Móveis e props na ordem de profundidade (Y), como o renderer faz.
const drawables = [
  ...(map.props || []).map((item) => ({ item, texture: item.texture })),
  ...(map.furniture || []).map((item) => ({ item, texture: item.id })),
].sort((a, b) => a.item.y - b.item.y);
const missing = new Set();
for (const drawable of drawables) {
  if (!drawSprite(canvas, map, drawable.item, drawable.texture)) missing.add(drawable.texture);
}

// Mecânicas desenham a própria arte no runtime; aqui vale o mesmo, senão elevador, escada
// e tabuleiro somem justo da conferência.
for (const entity of map.entities || []) {
  const values = { ...entity, ...entity.properties };
  if (entity.type === 'verticalAccess') {
    const elevator = values.accessType === 'elevator';
    const file = path.join(root, `assets/architecture/limezu_${elevator ? 'elevator_door' : 'stairs_wood'}.png`);
    const sheet = image(file);
    // A porta do elevador é uma folha de animação: só o primeiro quadro (32×32) é a porta.
    const sprite = elevator ? createCanvas(32, 32) : sheet;
    if (elevator) {
      for (let y = 0; y < 32; y++) {
        sheet.data.copy(sprite.data, y * 32 * 4, y * sheet.width * 4, y * sheet.width * 4 + 32 * 4);
      }
    }
    const x = Number(values.visualX ?? entity.x + entity.w / 2) * TILE - sprite.width / 2;
    const y = Number(values.visualY ?? entity.y) * TILE - sprite.height;
    if (elevator) fillRect(canvas, Math.round(x), Math.round(y), 32, 32, [0x11, 0x17, 0x22, 255]);
    blit(canvas, sprite, Math.round(x), Math.round(y));
  }
  if (entity.type === 'chess') {
    const file = textureFile(map, values.assetId) || path.join(root, 'assets/furniture/composites/chess_table.png');
    const sprite = image(file);
    blit(
      canvas,
      sprite,
      Math.round((entity.x + entity.w / 2) * TILE - sprite.width / 2),
      Math.round((entity.y + entity.h) * TILE - sprite.height),
    );
  }
}

// Marcações de leitura rápida: portais em ciano, spawns em magenta.
for (const portal of map.portals || []) {
  for (let x = 0; x < portal.w * TILE; x++) {
    setPixel(canvas, portal.x * TILE + x, portal.y * TILE, [0, 220, 220, 255]);
    setPixel(canvas, portal.x * TILE + x, (portal.y + portal.h) * TILE - 1, [0, 220, 220, 255]);
  }
}
for (const spawn of Object.values(map.spawns || {})) {
  fillRect(canvas, Math.round(spawn.x * TILE) - 1, Math.round(spawn.y * TILE) - 1, 3, 3, [255, 0, 200, 255]);
}

// Recorte opcional (em tiles) com zoom, para conferir um canto de perto:
//   node tools/map-preview.mjs tooq-campus 20 30 24 14
const [cropX, cropY, cropW, cropH] = process.argv.slice(3).map(Number);
let output = canvas;
if (Number.isFinite(cropW) && Number.isFinite(cropH)) {
  const zoom = Math.max(1, Math.round(900 / (cropW * TILE)));
  output = createCanvas(cropW * TILE * zoom, cropH * TILE * zoom);
  for (let y = 0; y < output.height; y++) {
    for (let x = 0; x < output.width; x++) {
      const sourceX = cropX * TILE + Math.floor(x / zoom);
      const sourceY = cropY * TILE + Math.floor(y / zoom);
      if (sourceX >= canvas.width || sourceY >= canvas.height) continue;
      const source = (sourceY * canvas.width + sourceX) * 4;
      canvas.data.copy(output.data, (y * output.width + x) * 4, source, source + 4);
    }
  }
}

const outputDir = path.join(root, 'tools/.asset-sheets');
fs.mkdirSync(outputDir, { recursive: true });
const file = path.join(outputDir, `map-${sceneId}.png`);
fs.writeFileSync(file, encodePng(output));
console.log(`${map.w}×${map.h} tiles · ${path.relative(root, file)}`);
if (missing.size) console.log('sem textura:', [...missing].join(', '));
