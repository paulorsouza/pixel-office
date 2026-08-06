import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { furnitureSeat } from './MapRenderer.js';
import {
  normalizePlacedFurniture,
  validateFurniturePlacement,
} from './RoomDecorationSystem.js';

const catalog = JSON.parse(readFileSync(
  fileURLToPath(new URL('../assets/furniture/catalog.json', import.meta.url)),
  'utf8',
));

const spec = (id) => catalog.items.find((item) => item.id === id);

test('móvel do Tiled continua mandando no próprio encaixe', () => {
  // No mapa cada instância é posicionada à mão, espelhada inclusive: o número
  // do Tiled é o número final e não pode ser espelhado de novo aqui.
  const cenario = { seatX: 0.5, seatY: -1.125, seatDir: 'right', seatPose: 'sit', flipX: true };
  assert.deepEqual(furnitureSeat(cenario), {
    x: 0.5, y: -1.125, dir: 'right', pose: 'sit', cover: 0,
  });
});

test('móvel sem calibração nenhuma cai no encaixe antigo', () => {
  assert.deepEqual(furnitureSeat({ id: 'of_9999' }), {
    x: 0, y: -0.125, dir: 'left', pose: 'sit', cover: 0,
  });
});

test('cadeira do inventário espelha o assento junto com a peça', () => {
  const seat = spec('of_306').seat;
  const parada = furnitureSeat({ id: 'of_306', seat });
  const girada = furnitureSeat({ id: 'of_306', seat, flipX: true });
  assert.equal(parada.x, -0.5);
  assert.equal(parada.dir, 'left');
  // Girar a cadeira sem girar o assento fazia o avatar sentar no encosto.
  assert.equal(girada.x, 0.5);
  assert.equal(girada.dir, 'right');
  assert.equal(girada.y, parada.y, 'altura do assento não muda com o espelho');
});

test('o encaixe do catálogo bate com o que o Tiled já calibrou', () => {
  // `of_306` existe nos dois mundos: comprada no editor e posta à mão no mapa.
  // Sentar numa e na outra tem de ser o MESMO encaixe.
  const doCatalogo = furnitureSeat({ id: 'of_306', seat: spec('of_306').seat });
  const doTiled = furnitureSeat({
    seatX: -0.5, seatY: -1.125, seatDir: 'left', seatPose: 'sit',
  });
  assert.deepEqual(doCatalogo, doTiled);
});

test('instância colocada carrega o assento do catálogo', () => {
  const item = normalizePlacedFurniture(catalog, { id: 'of_306', x: 4, y: 5, placementId: 7 });
  assert.deepEqual(item.seat, spec('of_306').seat);
  assert.equal(normalizePlacedFurniture(catalog, { id: 'of_258', x: 4, y: 5 }).seat, undefined);
});

test('espaço ocupado por móvel de cenário também recusa a peça', () => {
  const room = { id: 'sala', x: 0, y: 0, w: 12, h: 12, southWall3d: true };
  // Vem do Tiled: sem `owned`, sem `ownerId`, sem `placementId`.
  const cenario = { id: 'of_258', x: 5, y: 5, collision: { x: -0.5, y: 0.1, w: 2, h: 0.75 } };
  const candidata = normalizePlacedFurniture(catalog, { id: 'of_306', x: 5, y: 5 });

  assert.equal(validateFurniturePlacement(room, candidata, []).valid, true);
  const comCenario = validateFurniturePlacement(room, candidata, [cenario]);
  assert.equal(comCenario.valid, false, 'validar só contra os MEUS deixava empilhar no cenário');
  assert.match(comCenario.reason, /ocupado/);
});

test('quadro de parede não disputa espaço com o que está no chão', () => {
  // Peça sem colisão passa por cima: pendurar um quadro atrás da mesa vale.
  const room = { id: 'sala', x: 0, y: 0, w: 12, h: 12, southWall3d: true };
  const mesa = { id: 'of_258', x: 5, y: 5, collision: { x: -0.5, y: 0.1, w: 2, h: 0.75 } };
  const quadro = normalizePlacedFurniture(catalog, { id: 'of_171', x: 5, y: 5 });
  assert.equal(quadro.collision, undefined);
  assert.equal(validateFurniturePlacement(room, quadro, [mesa]).valid, true);
});
