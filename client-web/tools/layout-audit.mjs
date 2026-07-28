// Auditoria de planta: aponta o que o olho só pega depois de entrar no jogo — móvel
// desenhado por cima da parede, colisões empilhadas, assento sem mesa ao lado e cadeira
// virada para o lado errado.
//
//   node tools/layout-audit.mjs tooq-campus
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTiledMap } from '../src/TiledRuntimeLoader.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tile = 16;
const moveis = JSON.parse(fs.readFileSync(path.join(root, 'tiled/tilesets/tileset-moveis.tsj'), 'utf8'));
const frameByAsset = new Map((moveis.tiles || []).map((entry) => {
  const values = Object.fromEntries((entry.properties || []).map((item) => [item.name, item.value]));
  return [values.assetId, { w: entry.imagewidth / tile, h: entry.imageheight / tile }];
}));

/** Retângulo em tiles ocupado pela arte, com a mesma origem do renderer (centro-inferior). */
function artRect(item) {
  const frame = frameByAsset.get(item.id);
  if (!frame) return null;
  const centerX = item.x + 0.5;
  const bottom = item.y + 1;
  return {
    x: centerX - frame.w / 2,
    y: bottom - frame.h,
    w: frame.w,
    h: frame.h,
    right: centerX + frame.w / 2,
    bottom,
  };
}

/** Linhas e colunas que a parede da sala ocupa (o miolo livre é o resto). */
function interiorOf(room) {
  const north = room.h > 3 ? 2 : 1;
  const south = room.southWall3d ? 2 : 1;
  return {
    x: room.x + 1,
    y: room.y + north,
    right: room.x + room.w - 1,
    bottom: room.y + room.h - south,
  };
}

const sceneId = process.argv[2] || 'tooq-campus';
const map = await loadTiledMap(
  pathToFileURL(path.join(root, `tiled/maps/${sceneId}.tmj`)).href,
  { fetchJson: async (url) => JSON.parse(fs.readFileSync(fileURLToPath(url), 'utf8')) },
);

const findings = [];
const roomOf = (item) => (map.rooms || []).find((room) => (
  item.x > room.x && item.x < room.x + room.w - 1
  && item.y > room.y && item.y < room.y + room.h - 1
));

for (const item of map.furniture || []) {
  const art = artRect(item);
  if (!art) {
    findings.push(`${item.id} @${item.x},${item.y}: asset fora do tileset`);
    continue;
  }
  const room = roomOf(item);
  if (room) {
    const inside = interiorOf(room);
    // Quadro, TV e lousa são pendurados: ocupar a parede é o certo para eles.
    const wallMounted = /^of_(96|97|11[0-9]|16[0-9]|17[0-2])$/.test(item.id);
    // A arte pode encostar na face da parede norte (é o que dá o "encostado na parede"),
    // mas passar da face para cima invade o topo e lê como móvel sobre a parede.
    if (!wallMounted && art.y < inside.y - 1) {
      findings.push(
        `${item.id} @${item.x},${item.y}: arte sobe até a linha ${art.y} e o miolo de `
        + `${room.id} começa em ${inside.y} — móvel em cima da parede`,
      );
    }
    if (art.bottom > inside.bottom) {
      findings.push(`${item.id} @${item.x},${item.y}: base ${art.bottom} passa do miolo de ${room.id} (${inside.bottom})`);
    }
    if (art.x < inside.x || art.right > inside.right) {
      findings.push(`${item.id} @${item.x},${item.y}: arte encosta na parede lateral de ${room.id}`);
    }
  }
}

// Colisões empilhadas: duas bases no mesmo tile viram um bloco invisível maior do que
// qualquer um dos móveis, e o jogador esbarra no nada.
const solids = (map.furniture || [])
  .filter((item) => item.collision?.w > 0)
  .map((item) => ({
    id: item.id,
    x: item.x + (item.collision.x || 0),
    y: item.y + (item.collision.y || 0),
    w: item.collision.w,
    h: item.collision.h,
  }));
for (let a = 0; a < solids.length; a++) {
  for (let b = a + 1; b < solids.length; b++) {
    const one = solids[a];
    const two = solids[b];
    if (one.x < two.x + two.w && two.x < one.x + one.w
      && one.y < two.y + two.h && two.y < one.y + one.h) {
      findings.push(`colisão sobreposta: ${one.id} @${one.x},${one.y} × ${two.id} @${two.x},${two.y}`);
    }
  }
}

// Assento precisa de mesa do lado para onde encara; senão a pessoa senta olhando o vazio.
// Sofá encara a câmera e não depende de mesa ao lado; a checagem é das cadeiras de perfil.
const seats = (map.furniture || []).filter((item) => (
  item.interactionType === 'seat'
  && item.seatPose === 'sit'
  && !item.interactionKey?.includes(':station')
));
const surfaces = [
  ...(map.furniture || []).filter((item) => /^(table_|of_2[456789]|of_19[03]|of_3[12])/.test(item.id)),
  // O tabuleiro é mecânica, não mobília, mas para a cadeira ao lado é mesa igual.
  ...(map.entities || [])
    .filter((entity) => entity.type === 'chess')
    .map((entity) => ({ id: entity.id, x: entity.x, y: entity.y + entity.h - 1, chess: entity })),
];
for (const seat of seats) {
  const dir = seat.seatDir || (seat.flipX ? 'right' : 'left');
  const near = surfaces.some((surface) => {
    const art = surface.chess
      ? {
        x: surface.chess.x,
        right: surface.chess.x + surface.chess.w,
        bottom: surface.chess.y + surface.chess.h,
      }
      : artRect(surface);
    if (!art) return false;
    const sameRow = Math.abs(art.bottom - (seat.y + 1)) <= 1.5;
    if (!sameRow) return false;
    return dir === 'right' ? art.x >= seat.x && art.x - seat.x <= 2.5
      : art.right <= seat.x + 1.5 && seat.x - art.right <= 2.5;
  });
  if (!near) findings.push(`assento sem mesa à ${dir === 'right' ? 'direita' : 'esquerda'}: ${seat.id} @${seat.x},${seat.y}`);
}

console.log(`${sceneId}: ${findings.length} achado(s)`);
for (const finding of findings) console.log(' -', finding);
