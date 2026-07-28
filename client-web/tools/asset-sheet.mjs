// Folha de contato dos móveis: o `tileset-moveis.tsj` tem 1104 peças cujo `assetId` é só
// um número do pack (lr_37, kt_190...). Sem ver a arte não dá para escolher sofá, mesa de
// reunião ou geladeira — este script monta uma imagem única com os assets e seus números.
//
//   node tools/asset-sheet.mjs lr            # todos os lr_*
//   node tools/asset-sheet.mjs kt 1 120      # fatia (os temas grandes não cabem numa folha)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, createCanvas, blit, fillRect, setPixel } from './png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'tools/.asset-sheets');

// Fonte 3×5 só de dígitos: o rótulo é o número do asset dentro da família.
const DIGITS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '001', '001', '001'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
};

function drawNumber(canvas, value, x, y, color) {
  let cursor = x;
  for (const character of String(value)) {
    const glyph = DIGITS[character];
    for (let row = 0; row < 5; row++) {
      for (let column = 0; column < 3; column++) {
        if (glyph[row][column] === '1') setPixel(canvas, cursor + column, y + row, color);
      }
    }
    cursor += 4;
  }
}

function scale(image, factor) {
  const output = createCanvas(image.width * factor, image.height * factor);
  for (let y = 0; y < output.height; y++) {
    for (let x = 0; x < output.width; x++) {
      const source = (Math.floor(y / factor) * image.width + Math.floor(x / factor)) * 4;
      image.data.copy(output.data, (y * output.width + x) * 4, source, source + 4);
    }
  }
  return output;
}

const [prefix, rawFrom, rawTo] = process.argv.slice(2);
if (!prefix) throw new Error('uso: node tools/asset-sheet.mjs <prefixo> [de] [ate]');
const from = Number(rawFrom || 1);
const to = Number(rawTo || Infinity);

const tileset = JSON.parse(fs.readFileSync(path.join(root, 'tiled/tilesets/tileset-moveis.tsj'), 'utf8'));
const entries = tileset.tiles
  .map((tile) => {
    const values = Object.fromEntries((tile.properties || []).map((item) => [item.name, item.value]));
    const match = /^([a-z_]+?)_(\d+)$/.exec(values.assetId || '');
    return match && match[1] === prefix
      ? { assetId: values.assetId, number: Number(match[2]), image: tile.image }
      : null;
  })
  .filter((entry) => entry && entry.number >= from && entry.number <= to)
  .sort((a, b) => a.number - b.number);
if (!entries.length) throw new Error(`nenhum asset com o prefixo ${prefix}`);

const cellW = 36;
const cellH = 72;
const columns = 14;
const rows = Math.ceil(entries.length / columns);
const sheet = createCanvas(columns * cellW, rows * cellH);

// Xadrez claro no fundo: sem ele a peça transparente some contra o branco do visualizador.
for (let y = 0; y < sheet.height; y++) {
  for (let x = 0; x < sheet.width; x++) {
    const tone = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 226 : 244;
    setPixel(sheet, x, y, [tone, tone, tone, 255]);
  }
}

for (const [index, entry] of entries.entries()) {
  const column = index % columns;
  const row = Math.floor(index / columns);
  const x = column * cellW;
  const y = row * cellH;
  fillRect(sheet, x, y + cellH - 8, cellW, 8, [24, 26, 34, 255]);
  const image = decodePng(fs.readFileSync(path.resolve(path.join(root, 'tiled/tilesets'), entry.image)));
  blit(
    sheet,
    image,
    x + Math.round((cellW - image.width) / 2),
    y + (cellH - 8 - image.height),
  );
  drawNumber(sheet, entry.number, x + 2, y + cellH - 7, [235, 238, 245, 255]);
}

fs.mkdirSync(outputDir, { recursive: true });
const file = path.join(outputDir, `${prefix}${rawFrom ? `-${from}-${entries.at(-1).number}` : ''}.png`);
// Fatia curta é sempre pedido de inspeção de perto: vale o zoom maior.
fs.writeFileSync(file, encodePng(scale(sheet, entries.length <= 30 ? 5 : 2)));
console.log(`${entries.length} peças · ${path.relative(root, file)}`);
