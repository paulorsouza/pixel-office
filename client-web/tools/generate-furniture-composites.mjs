// Peças que o pack não tem, montadas a partir da arte dele (mesma ideia das `station_*`).
// O Modern Office traz a mesa em segmentos de 1 tile — borda de trás (of_245), miolo
// (of_246) e frente com pernas (of_247). Ladrilhar direto deixa o contorno escuro de cada
// segmento no meio da mesa, então aqui as emendas internas são costuradas: a mesa larga
// vira uma peça só, com pernas apenas nas pontas.
//
//   node tools/generate-furniture-composites.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, createCanvas, blit, setPixel, fillRect } from './png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const office = (id) => decodePng(fs.readFileSync(path.join(root, `assets/furniture/office/${id}.png`)));
const outputDir = path.join(root, 'assets/furniture/composites');

const TILE = 16;
// Paleta lida da própria arte (of_245/of_246/of_247), para a peça nova não destoar.
const SURFACE = [0xd0, 0xbe, 0x9c, 255];
const SHADE = [0xca, 0xab, 0x8b, 255];
const OUTLINE = [0x3a, 0x3a, 0x50, 255];
const PANEL = [0xa7, 0x97, 0x96, 255];

const pixel = (image, x, y) => {
  const index = (y * image.width + x) * 4;
  return [...image.data.subarray(index, index + 4)];
};

/** Recorta o conteúdo 16×16 de um segmento de mesa (fica no rodapé do quadro 32×48). */
function segment(id, height = TILE) {
  const source = office(id);
  const tile = createCanvas(TILE, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < TILE; x++) {
      const [r, g, b, a] = pixel(source, x, source.height - height + y);
      if (a) setPixel(tile, x, y, [r, g, b, a]);
    }
  }
  return tile;
}

/**
 * Mesa retangular contínua de `columns`×`rows` tiles.
 * Cada emenda interna recebe a cor da superfície no lugar dos dois contornos, e as pernas
 * do segmento frontal só ficam nas colunas das pontas.
 */
function table(columns, rows) {
  const back = segment('of_245');
  const middle = segment('of_246');
  const front = segment('of_247');
  const canvas = createCanvas(columns * TILE, rows * TILE);

  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      const piece = row === 0 ? back : row === rows - 1 ? front : middle;
      blit(canvas, piece, column * TILE, row * TILE);
    }
  }

  // Costura das emendas: as colunas 14/15 de um segmento e a 0 do seguinte viram superfície.
  for (let seam = 1; seam < columns; seam++) {
    const x = seam * TILE;
    for (let y = 0; y < canvas.height; y++) {
      const reference = pixel(canvas, x + 6, y);
      if (!reference[3]) continue;
      // A linha do topo é contorno em toda a extensão; o resto acompanha o miolo.
      for (const target of [x - 2, x - 1, x]) setPixel(canvas, target, y, reference);
    }
  }
  // Devolve o sombreado à borda direita da peça inteira.
  for (let y = 1; y < canvas.height; y++) {
    if (pixel(canvas, canvas.width - 2, y)[3]) setPixel(canvas, canvas.width - 2, y, SHADE);
  }
  // Pernas: apagadas nas colunas do meio (a frente vira um painel liso).
  for (let column = 1; column < columns - 1; column++) {
    for (let y = canvas.height - 3; y < canvas.height; y++) {
      for (let x = column * TILE + 1; x < (column + 1) * TILE - 1; x++) {
        if (pixel(canvas, x, y)[3]) setPixel(canvas, x, y, PANEL);
      }
    }
  }
  return canvas;
}

/** Mesa de xadrez: tabuleiro 8×8 e peças desenhadas sobre a mesa de 2×2 tiles. */
function chessTable() {
  const canvas = table(2, 2);
  const light = [0xe8, 0xdc, 0xc0, 255];
  const dark = [0x8a, 0x6a, 0x4a, 255];
  const boardX = 4;
  const boardY = 8;
  const cell = 3;
  const cellH = 2;

  fillRect(canvas, boardX - 1, boardY - 1, 8 * cell + 2, 8 * cellH + 2, OUTLINE);
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
      fillRect(
        canvas,
        boardX + column * cell,
        boardY + row * cellH,
        cell,
        cellH,
        (row + column) % 2 ? dark : light,
      );
    }
  }

  // Peças: as duas fileiras de cada lado, 2×2 dentro da casa de 3×2 — no pixel art desta
  // escala a silhueta é isso: um bloco com o topo mais claro e o pé escuro.
  const piece = (column, row, body, top) => {
    const x = boardX + column * cell;
    const y = boardY + row * cellH;
    setPixel(canvas, x, y, top);
    setPixel(canvas, x + 1, y, body);
    setPixel(canvas, x, y + 1, body);
    setPixel(canvas, x + 1, y + 1, OUTLINE);
  };
  const darkBody = [0x33, 0x30, 0x45, 255];
  const darkTop = [0x5a, 0x54, 0x74, 255];
  const lightBody = [0xef, 0xe7, 0xd4, 255];
  const lightTop = [0xff, 0xff, 0xff, 255];
  for (let column = 0; column < 8; column += 1) {
    piece(column, 0, darkBody, darkTop);
    piece(column, 1, darkBody, darkTop);
    piece(column, 6, lightBody, lightTop);
    piece(column, 7, lightBody, lightTop);
  }
  return canvas;
}

/**
 * Escada de descida a partir da de subida: no topo (o fundo da cena) os degraus mergulham
 * no piso, então a arte escurece com a profundidade e termina num vão preto. Sem isso as
 * duas escadas ficam idênticas e ninguém sabe qual sobe.
 */
function stairsDown() {
  const source = decodePng(fs.readFileSync(path.join(root, 'assets/architecture/limezu_stairs_wood.png')));
  const canvas = createCanvas(source.width, source.height);
  source.data.copy(canvas.data);
  const depth = Math.round(source.height * 0.55);
  for (let y = 0; y < depth; y++) {
    // 1 no fim da faixa, ~0,18 na boca do vão: escurecimento contínuo, sem degrau de cor.
    const shade = 0.18 + 0.82 * (y / depth);
    for (let x = 0; x < source.width; x++) {
      const index = (y * source.width + x) * 4;
      if (!canvas.data[index + 3]) continue;
      for (let channel = 0; channel < 3; channel++) {
        canvas.data[index + channel] = Math.round(canvas.data[index + channel] * shade);
      }
    }
  }
  // Boca do vão: faixa cheia entre os corrimãos, para ler como buraco e não como sombra.
  const railing = 6;
  fillRect(canvas, railing, 0, source.width - railing * 2, 5, [0x10, 0x0f, 0x18, 255]);
  fillRect(canvas, railing, 5, source.width - railing * 2, 1, [0x24, 0x22, 0x30, 255]);
  return canvas;
}

const composites = [
  { id: 'table_meeting', image: table(6, 3), name: 'Mesa de reunião' },
  { id: 'table_round', image: table(3, 2), name: 'Mesa de apoio' },
  { id: 'table_long', image: table(4, 2), name: 'Mesa comprida' },
  { id: 'chess_table', image: chessTable(), name: 'Mesa de xadrez' },
];

fs.mkdirSync(outputDir, { recursive: true });
for (const composite of composites) {
  fs.writeFileSync(path.join(outputDir, `${composite.id}.png`), encodePng(composite.image));
}

// A escada de descida é arquitetura, não mobília: mora junto da de subida e é carregada
// pela mecânica, não pelo tileset.
fs.writeFileSync(
  path.join(root, 'assets/architecture/limezu_stairs_wood_down.png'),
  encodePng(stairsDown()),
);

// Registro no tileset: as peças entram no fim, então nenhum gid existente muda de posição.
const tilesetPath = path.join(root, 'tiled/tilesets/tileset-moveis.tsj');
const tileset = JSON.parse(fs.readFileSync(tilesetPath, 'utf8'));
const byAsset = new Map(tileset.tiles.map((tile) => {
  const values = Object.fromEntries((tile.properties || []).map((item) => [item.name, item.value]));
  return [values.assetId, tile];
}));
let nextId = Math.max(...tileset.tiles.map((tile) => tile.id)) + 1;
for (const composite of composites) {
  const entry = byAsset.get(composite.id) || { id: nextId++ };
  Object.assign(entry, {
    image: `../../assets/furniture/composites/${composite.id}.png`,
    imagewidth: composite.image.width,
    imageheight: composite.image.height,
    type: 'furniture',
    properties: [
      { name: 'assetId', type: 'string', value: composite.id },
      { name: 'category', type: 'string', value: 'furniture' },
      { name: 'family', type: 'string', value: 'composite' },
    ],
  });
  if (!byAsset.has(composite.id)) tileset.tiles.push(entry);
}
tileset.tilecount = tileset.tiles.length;
fs.writeFileSync(tilesetPath, `${JSON.stringify(tileset, null, 2)}\n`);

console.log(composites.map((item) => `${item.id} ${item.image.width}x${item.image.height}`).join('\n'));
