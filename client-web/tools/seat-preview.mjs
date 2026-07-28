// Prévia de encaixe do avatar sentado. Sentar é dois números (`seatY` e `seatCover`) que
// só se acertam olhando: aqui o móvel e o avatar são compostos com a mesma matemática do
// runtime, sem precisar do Phaser.
//
//   node tools/seat-preview.mjs of_200 idle down -0.75 12
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, createCanvas, blit, setPixel } from './png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'assets/character/catalog.json'), 'utf8'));
const DIRECTION_STARTS = { right: 0, up: 6, left: 12, down: 18 };
const SIT_STARTS = { right: 0, left: 6, up: 12, down: 18 };

/** Recorta um quadro do avatar da folha modular (16×32, poses em linhas). */
function avatarFrame(pose, direction) {
  const spec = catalog.frame.poses[pose] || catalog.frame.poses.idle;
  const start = pose === 'sit'
    ? (SIT_STARTS[direction] ?? SIT_STARTS.down)
    : (DIRECTION_STARTS[direction] ?? DIRECTION_STARTS.down);
  const sheet = decodePng(fs.readFileSync(path.join(root, 'assets/character/bodies/body_01.png')));
  const { width, height } = catalog.frame;
  const frame = createCanvas(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = ((spec.y + y) * sheet.width + start * width + x) * 4;
      sheet.data.copy(frame.data, (y * width + x) * 4, source, source + 4);
    }
  }
  return frame;
}

const [assetId, pose = 'sit', direction = 'left', rawSeatY = '-0.875', rawCover = '0'] = process.argv.slice(2);
if (!assetId) throw new Error('uso: node tools/seat-preview.mjs <assetId> [pose] [direção] [seatY] [seatCover]');
const seatY = Number(rawSeatY);
const seatCover = Number(rawCover);

const tileset = JSON.parse(fs.readFileSync(path.join(root, 'tiled/tilesets/tileset-moveis.tsj'), 'utf8'));
const entry = tileset.tiles.find((tile) => (tile.properties || [])
  .some((item) => item.name === 'assetId' && item.value === assetId));
if (!entry) throw new Error(`asset desconhecido: ${assetId}`);
const sprite = decodePng(fs.readFileSync(path.resolve(path.join(root, 'tiled/tilesets'), entry.image)));

// Runtime: o móvel é desenhado com origem no centro-inferior; o avatar, centrado no ponto
// de assento — `display + (seatX, seatY)·16`.
const margin = 12;
const canvas = createCanvas(sprite.width + margin * 2, sprite.height + margin * 2 + 16);
for (let y = 0; y < canvas.height; y++) {
  for (let x = 0; x < canvas.width; x++) {
    const tone = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 150 : 162;
    setPixel(canvas, x, y, [tone, tone - 6, tone - 20, 255]);
  }
}
const displayX = margin + sprite.width / 2;
const displayY = margin + sprite.height;
blit(canvas, sprite, margin, margin);

const avatar = avatarFrame(pose, direction);
const seatX = Number(process.env.SEAT_X || (pose === 'sit' ? -0.5 : 0));
blit(
  canvas,
  avatar,
  Math.round(displayX + seatX * 16 - avatar.width / 2),
  Math.round(displayY + seatY * 16 - avatar.height / 2),
);

// `seatCover` redesenha a faixa de baixo do móvel na frente do avatar (é o truque da
// estação): sem ele o avatar fica "em pé em cima" do sofá.
if (seatCover > 0) {
  const band = createCanvas(sprite.width, seatCover);
  for (let y = 0; y < seatCover; y++) {
    const source = (sprite.height - seatCover + y) * sprite.width * 4;
    sprite.data.copy(band.data, y * sprite.width * 4, source, source + sprite.width * 4);
  }
  blit(canvas, band, margin, margin + sprite.height - seatCover);
}

const zoom = 8;
const output = createCanvas(canvas.width * zoom, canvas.height * zoom);
for (let y = 0; y < output.height; y++) {
  for (let x = 0; x < output.width; x++) {
    const source = (Math.floor(y / zoom) * canvas.width + Math.floor(x / zoom)) * 4;
    canvas.data.copy(output.data, (y * output.width + x) * 4, source, source + 4);
  }
}
const outputDir = path.join(root, 'tools/.asset-sheets');
fs.mkdirSync(outputDir, { recursive: true });
const file = path.join(outputDir, `seat-${assetId}-${pose}-${direction}.png`);
fs.writeFileSync(file, encodePng(output));
console.log(`${assetId} · ${pose} ${direction} · seatY=${seatY} seatCover=${seatCover} → ${path.relative(root, file)}`);
