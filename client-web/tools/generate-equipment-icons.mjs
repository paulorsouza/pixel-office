// Desenha a arte dos itens: um PNG 32×32 por equipamento e um 48×48 por tipo de baú.
//
// Antes o card da bag mostrava uma "caixa com um desenho dentro" montada em CSS
// (`.item-glyph.icon-mouse` e companhia): um contorno por slot, repetido em todos os
// cinco itens daquele slot, com a cor trocada. O mouse comum e o Mouse Quantum eram
// o mesmo desenho pintado de outra cor — o que faz a raridade parecer etiqueta e não
// item.
//
// Aqui cada item vira arte de verdade: a silhueta é do slot (mouse é mouse), mas a
// FORMA muda por raridade — o Quantum tem antena, o teclado holográfico projeta
// teclas, a carteira infinita ganha corrente. Como o desenho é código, os 40 itens
// saem no mesmo estilo e no mesmo pixel grid do resto do jogo, o que recortar de
// pack nenhum garantia.
//
// Os BAÚS seguem a mesma regra e pela mesma razão: os cinco desenhavam a mesma caixa
// marrom em CSS, e só a cor da borda dizia que um era Lendário. Agora cada tipo tem
// silhueta própria — a tampa, as cintas, a fechadura e o que sai de dentro mudam.
//
//   node client-web/tools/generate-equipment-icons.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, encodePng, fillRect, setPixel } from './png.mjs';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(toolsDir, '..');
const catalogPath = resolve(clientRoot, 'assets/equipment/catalog.json');
const outDir = resolve(clientRoot, 'assets/equipment/items');
const chestDir = resolve(clientRoot, 'assets/equipment/chests');

const SIZE = 32;
const OUTLINE = [26, 20, 28, 255];
const SHINE = [255, 255, 255, 70];

function rgba(hex, alpha = 255) {
  const value = String(hex || '').replace('#', '');
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value;
  const number = Number.parseInt(full, 16);
  return Number.isFinite(number)
    ? [(number >> 16) & 255, (number >> 8) & 255, number & 255, alpha]
    : [200, 200, 210, alpha];
}

const shade = (color, factor) => [
  Math.round(color[0] * factor), Math.round(color[1] * factor), Math.round(color[2] * factor), color[3],
];

/** Retângulo com contorno: é o traço que dá liga entre os 40 ícones. */
function box(canvas, x, y, w, h, fill) {
  fillRect(canvas, x - 1, y - 1, w + 2, h + 2, OUTLINE);
  fillRect(canvas, x, y, w, h, fill);
}

// ---------------------------------------------------------------- recipes
//
// `tier` é 0..4 (comum → exótico). Cada recipe usa o tier para ACRESCENTAR peça,
// nunca só para trocar cor: é o que faz a evolução do slot ser visível no card.

function mouse(canvas, base, detail, tier) {
  // O contorno reto lia como geladeira. O que faz um mouse ser um mouse na miniatura
  // é a silhueta de ovo: cantos comidos em cima e embaixo, e a divisão dos botões.
  box(canvas, 10, 8, 12, 17, base);
  for (const [x, y] of [[10, 8], [21, 8], [10, 24], [21, 24], [11, 8], [20, 8]]) {
    fillRect(canvas, x, y, 1, 1, [0, 0, 0, 0]);
    fillRect(canvas, x, y === 8 ? 7 : 25, 1, 1, [0, 0, 0, 0]);
  }
  fillRect(canvas, 11, 9, 10, 7, shade(base, 1.14));     // botões
  fillRect(canvas, 15, 9, 2, 5, detail);                 // roda
  fillRect(canvas, 11, 16, 10, 1, shade(base, 0.68));
  if (tier >= 1) fillRect(canvas, 12, 18, 8, 5, shade(base, 0.88));
  if (tier >= 2) { fillRect(canvas, 9, 14, 1, 7, detail); fillRect(canvas, 22, 14, 1, 7, detail); }
  if (tier >= 3) fillRect(canvas, 13, 21, 6, 2, shade(detail, 1.2));
  // Fio some quando o item vira sem fio: é a diferença que o nome promete.
  if (tier <= 2) { fillRect(canvas, 15, 3, 2, 5, OUTLINE); fillRect(canvas, 15, 1, 2, 2, OUTLINE); }
  else fillRect(canvas, 14, 4, 4, 2, detail);
  if (tier >= 4) { fillRect(canvas, 6, 6, 2, 2, detail); fillRect(canvas, 24, 22, 2, 2, detail); }
}

function keyboard(canvas, base, detail, tier) {
  const height = tier >= 1 ? 12 : 14;
  const y = 16 - Math.floor(height / 2);
  box(canvas, 3, y, 26, height, base);
  for (let row = 0; row < (height >= 14 ? 3 : 2); row += 1) {
    for (let key = 0; key < 8; key += 1) {
      fillRect(canvas, 5 + key * 3, y + 2 + row * 4, 2, 2, shade(detail, 1));
    }
  }
  fillRect(canvas, 9, y + height - 3, 14, 2, shade(base, 0.8));   // barra de espaço
  if (tier >= 2) fillRect(canvas, 3, y + height, 26, 1, detail);  // luz por baixo
  if (tier >= 3) { fillRect(canvas, 2, y - 2, 28, 1, detail); fillRect(canvas, 2, y + height + 1, 28, 1, detail); }
  if (tier >= 4) {
    for (let key = 0; key < 8; key += 1) fillRect(canvas, 5 + key * 3, y - 5, 2, 3, [...detail.slice(0, 3), 120]);
  }
}

function amulet(canvas, base, detail, tier) {
  // Corrente em V: dois fios descendo até a pedra. Pontilhado espalhado no topo
  // parecia sujeira na miniatura, não colar.
  for (let step = 0; step < 7; step += 1) {
    setPixel(canvas, 9 + step, 4 + step, shade(detail, 0.85));
    setPixel(canvas, 23 - step, 4 + step, shade(detail, 0.85));
  }
  const radius = tier >= 3 ? 8 : 7;
  const cx = 16;
  const cy = 19;
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      const distance = Math.abs(x) + Math.abs(y);          // losango: pedra lapidada
      if (distance > radius) continue;
      setPixel(canvas, cx + x, cy + y, distance === radius ? OUTLINE : base);
    }
  }
  fillRect(canvas, cx - 3, cy - 4, 3, 3, shade(base, 1.25));
  fillRect(canvas, cx - 2, cy - 1, 5, 4, detail);
  if (tier >= 1) fillRect(canvas, cx - 1, cy + 3, 3, 2, shade(detail, 1.2));
  if (tier >= 2) { setPixel(canvas, cx - 6, cy - 6, SHINE); setPixel(canvas, cx + 6, cy + 5, SHINE); }
  if (tier >= 4) {
    for (const [x, y] of [[6, 10], [26, 12], [7, 26], [25, 25]]) {
      fillRect(canvas, x, y - 1, 1, 3, detail);
      fillRect(canvas, x - 1, y, 3, 1, detail);
    }
  }
}

function phone(canvas, base, detail, tier) {
  const wide = tier >= 3;
  const width = wide ? 16 : 12;
  const x = 16 - Math.floor(width / 2);
  box(canvas, x, 4, width, 24, shade(base, 0.55));
  fillRect(canvas, x + 2, 7, width - 4, 16, base);
  fillRect(canvas, x + 3, 8, width - 6, 6, shade(base, 1.2));
  if (wide) fillRect(canvas, 16, 4, 1, 24, shade(detail, 0.8));   // dobra
  fillRect(canvas, 14, 25, 4, 1, detail);
  if (tier >= 1) fillRect(canvas, x + 3, 16, width - 6, 5, detail);
  if (tier >= 2) fillRect(canvas, x + width - 5, 5, 3, 2, shade(detail, 1.3));  // câmera
  if (tier >= 4) {
    for (let y = 2; y < 30; y += 4) { setPixel(canvas, x - 3, y, detail); setPixel(canvas, x + width + 2, y + 2, detail); }
  }
}

function wallet(canvas, base, detail, tier) {
  box(canvas, 4, 10, 24, 14, base);
  fillRect(canvas, 4, 10, 24, 3, shade(base, 1.18));
  fillRect(canvas, 4, 17, 24, 1, shade(base, 0.7));
  fillRect(canvas, 8, 7, 12, 4, shade(detail, 1.05));            // nota saindo
  fillRect(canvas, 10, 8, 8, 2, shade(detail, 0.75));
  if (tier >= 1) fillRect(canvas, 19, 19, 7, 4, shade(detail, 1.15));  // cartão
  if (tier >= 2) fillRect(canvas, 20, 20, 3, 2, [247, 221, 177, 255]);
  if (tier >= 3) { fillRect(canvas, 3, 13, 1, 8, detail); fillRect(canvas, 28, 13, 1, 8, detail); }
  if (tier >= 4) {
    for (const x of [7, 12, 17, 22]) fillRect(canvas, x, 25, 2, 2, detail);
  }
}

function wheel(canvas, x, y, detail) {
  box(canvas, x, y, 5, 5, [24, 22, 30, 255]);
  fillRect(canvas, x + 1, y + 1, 3, 3, shade(detail, 0.9));
}

function skate(canvas, base, detail, tier) {
  box(canvas, 3, 14, 26, 5, base);
  fillRect(canvas, 5, 15, 22, 2, shade(base, 1.15));
  fillRect(canvas, 12, 16, 8, 2, detail);
  wheel(canvas, 6, 20, detail);
  wheel(canvas, 21, 20, detail);
  if (tier >= 1) { fillRect(canvas, 2, 12, 5, 2, detail); fillRect(canvas, 25, 12, 5, 2, detail); }
  if (tier >= 2) for (let x = 4; x < 28; x += 4) setPixel(canvas, x, 27, detail);
}

function roller(canvas, base, detail, tier) {
  for (const x of [4, 18]) {
    box(canvas, x, 8, 10, 11, base);
    fillRect(canvas, x + 1, 9, 8, 4, shade(base, 1.15));
    fillRect(canvas, x + 1, 15, 8, 2, detail);
    for (const wx of [x + 1, x + 6]) wheel(canvas, wx, 21, detail);
  }
  if (tier >= 1) for (const x of [4, 18]) fillRect(canvas, x, 6, 10, 2, detail);
}

function scooter(canvas, base, detail, tier) {
  box(canvas, 5, 20, 22, 4, base);
  fillRect(canvas, 21, 5, 3, 16, shade(base, 0.8));
  box(canvas, 17, 3, 11, 3, detail);
  wheel(canvas, 5, 24, detail);
  wheel(canvas, 22, 24, detail);
  if (tier >= 1) fillRect(canvas, 7, 16, 8, 5, shade(detail, 0.9));   // bateria
  if (tier >= 2) for (let y = 8; y < 20; y += 3) setPixel(canvas, 4, y, detail);
}

// Roda escura sobre card escuro sumia: o pneu precisa de um aro CLARO para a
// silhueta aparecer no tamanho de miniatura.
function bigWheel(canvas, x, y, detail) {
  box(canvas, x, y, 8, 8, [30, 28, 36, 255]);
  fillRect(canvas, x + 1, y + 1, 6, 6, [128, 134, 150, 255]);
  fillRect(canvas, x + 2, y + 2, 4, 4, [40, 38, 48, 255]);
  fillRect(canvas, x + 3, y + 3, 2, 2, shade(detail, 1.1));
}

function motorcycle(canvas, base, detail, tier) {
  // A versão anterior era um bloco de 20×8 entre duas rodinhas: lia como sofá. Moto
  // precisa de RODA GRANDE, tanque estreito e garfo diagonal — o vão entre o tanque
  // e o chão é o que dá a silhueta.
  bigWheel(canvas, 2, 17, detail);
  bigWheel(canvas, 22, 17, detail);
  fillRect(canvas, 9, 19, 14, 2, [92, 98, 114, 255]);           // quadro
  box(canvas, 12, 10, 10, 8, base);                             // tanque
  fillRect(canvas, 13, 11, 8, 2, shade(base, 1.25));
  box(canvas, 6, 9, 7, 4, shade(base, 0.6));                    // banco
  for (let step = 0; step < 5; step += 1) {                     // garfo
    fillRect(canvas, 22 + Math.floor(step / 2), 11 + step, 2, 2, [150, 158, 172, 255]);
  }
  box(canvas, 21, 7, 7, 2, detail);                             // guidão
  fillRect(canvas, 8, 21, 11, 2, shade(detail, 0.8));           // escapamento
  if (tier >= 1) fillRect(canvas, 26, 13, 3, 4, shade(detail, 1.25));  // farol
  if (tier >= 2) { fillRect(canvas, 2, 12, 4, 2, detail); fillRect(canvas, 1, 15, 4, 1, detail); }
  if (tier >= 3) fillRect(canvas, 12, 16, 9, 2, shade(detail, 1.1));
}

const RECIPES = {
  mouse, keyboard, amulet, phone, wallet, skate, roller, scooter, motorcycle,
};

// ---------------------------------------------------------------- baús
//
// 48×48: o baú é o herói da própria seção, não uma miniatura numa grade. A silhueta
// muda por tipo — não só a cor —, então dá para reconhecer um Lendário de longe,
// que é o que a fileira antiga (cinco caixas marrons iguais) não permitia.

const CHEST_SIZE = 48;

/**
 * Corpo, tampa, cintas e fechadura. Todo baú começa por aqui.
 *
 * `bands` e `lock` saem para a caixa do beta: presente tem laço, não cinta de ferro
 * nem fechadura — e o laço desenhado POR CIMA das cintas lia como grade.
 */
function chestBase(canvas, { wood, woodLight, woodDark, band, bandLight, lock }, options = {}) {
  // tampa (arco de três degraus, para não virar um retângulo)
  fillRect(canvas, 9, 12, 30, 3, OUTLINE);
  fillRect(canvas, 7, 15, 34, 3, OUTLINE);
  fillRect(canvas, 10, 13, 28, 2, woodLight);
  fillRect(canvas, 8, 15, 32, 4, wood);
  fillRect(canvas, 8, 19, 32, 2, woodDark);
  // corpo
  fillRect(canvas, 6, 21, 36, 2, OUTLINE);
  fillRect(canvas, 6, 21, 2, 15, OUTLINE);
  fillRect(canvas, 40, 21, 2, 15, OUTLINE);
  fillRect(canvas, 6, 34, 36, 2, OUTLINE);
  fillRect(canvas, 8, 23, 32, 11, wood);
  fillRect(canvas, 8, 23, 32, 2, woodLight);
  fillRect(canvas, 8, 32, 32, 2, woodDark);
  // cintas de metal
  if (options.bands !== false) {
    for (const x of [12, 34]) {
      fillRect(canvas, x, 13, 3, 21, band);
      fillRect(canvas, x, 13, 1, 21, bandLight);
    }
  }
  // fechadura
  if (options.lock !== false) {
    fillRect(canvas, 21, 18, 6, 8, OUTLINE);
    fillRect(canvas, 22, 19, 4, 6, lock);
    fillRect(canvas, 23, 21, 2, 3, OUTLINE);
  }
  // pés
  fillRect(canvas, 8, 36, 5, 2, OUTLINE);
  fillRect(canvas, 35, 36, 5, 2, OUTLINE);
}

const CHEST_PALETTES = {
  common: {
    wood: [150, 96, 54, 255], woodLight: [186, 125, 74, 255], woodDark: [104, 64, 38, 255],
    band: [120, 126, 140, 255], bandLight: [166, 172, 186, 255], lock: [214, 176, 96, 255],
  },
  rare: {
    wood: [64, 104, 152, 255], woodLight: [92, 142, 196, 255], woodDark: [40, 68, 106, 255],
    band: [176, 186, 202, 255], bandLight: [220, 228, 240, 255], lock: [232, 206, 120, 255],
  },
  premium: {
    wood: [58, 56, 72, 255], woodLight: [86, 84, 106, 255], woodDark: [36, 34, 48, 255],
    band: [206, 168, 88, 255], bandLight: [244, 214, 140, 255], lock: [244, 226, 160, 255],
  },
  legendary: {
    wood: [198, 148, 52, 255], woodLight: [240, 198, 96, 255], woodDark: [140, 98, 32, 255],
    band: [246, 226, 150, 255], bandLight: [255, 248, 208, 255], lock: [255, 240, 190, 255],
  },
  exotic: {
    wood: [126, 62, 148, 255], woodLight: [176, 96, 202, 255], woodDark: [78, 36, 96, 255],
    band: [255, 150, 226, 255], bandLight: [255, 210, 244, 255], lock: [190, 246, 255, 255],
  },
  // A caixa do beta não sorteia nada: entrega o catálogo inteiro. Então ela não é um
  // baú melhor — é outra coisa, e a arte diz isso com laço de presente em vez de
  // fechadura reforçada.
  beta: {
    wood: [196, 74, 92, 255], woodLight: [232, 112, 128, 255], woodDark: [140, 48, 66, 255],
    band: [246, 216, 116, 255], bandLight: [255, 242, 186, 255], lock: [255, 250, 220, 255],
  },
};

/** O que cada tipo acrescenta por cima da base. É isto que separa as silhuetas. */
const CHEST_EXTRAS = {
  // Comum: nada. Uma caixa de madeira honesta é o degrau de comparação dos outros.
  common: () => {},
  rare: (canvas, p) => {
    // rebites nas cintas: o primeiro degrau "reforçado"
    for (const y of [16, 24, 31]) {
      fillRect(canvas, 12, y, 3, 1, p.bandLight);
      fillRect(canvas, 34, y, 3, 1, p.bandLight);
    }
    fillRect(canvas, 22, 27, 4, 3, [120, 200, 255, 255]);   // gema na frente
    fillRect(canvas, 22, 27, 4, 1, [206, 240, 255, 255]);
  },
  premium: (canvas, p) => {
    // Moldura dourada + selo em cima da tampa. A fileira de pastilhas que estava aqui
    // lia como teclado: quatro quadradinhos iguais em linha são um teclado, não um selo.
    fillRect(canvas, 8, 23, 32, 1, p.band);
    fillRect(canvas, 8, 33, 32, 1, p.band);
    fillRect(canvas, 18, 27, 12, 4, p.wood);
    fillRect(canvas, 19, 28, 10, 2, p.band);
    fillRect(canvas, 22, 15, 4, 4, p.bandLight);
    fillRect(canvas, 23, 16, 2, 2, p.woodDark);
  },
  legendary: (canvas, p) => {
    // Cantoneiras + FAÍSCAS. As três barras verticais que estavam aqui liam como
    // antenas: luz saindo de dentro precisa se espalhar, não subir em linha reta.
    for (const [x, y] of [[6, 21], [38, 21], [6, 31], [38, 31]]) {
      fillRect(canvas, x, y, 4, 4, p.bandLight);
      fillRect(canvas, x + 1, y + 1, 2, 2, p.wood);
    }
    for (const [x, y, s] of [[13, 7, 2], [23, 4, 3], [33, 8, 2], [18, 9, 1], [29, 10, 1]]) {
      fillRect(canvas, x, y, s, s, [255, 240, 170, 210]);
      fillRect(canvas, x, y - 1, 1, 1, [255, 252, 226, 160]);
    }
    // Frincha de luz na juntura da tampa: é de lá que a luz sai.
    fillRect(canvas, 10, 14, 28, 1, [255, 250, 214, 190]);
    fillRect(canvas, 21, 15, 6, 2, [255, 250, 214, 255]);
  },
  exotic: (canvas, p) => {
    // cristais flutuando e brilho: o topo do jogo se anuncia de longe
    for (const [x, y, s] of [[8, 6, 3], [38, 9, 2], [4, 14, 2], [42, 17, 3], [24, 2, 2]]) {
      fillRect(canvas, x, y, s, s, p.bandLight);
      fillRect(canvas, x, y, 1, 1, [255, 255, 255, 220]);
    }
    for (const x of [14, 22, 30]) fillRect(canvas, x, 8, 2, 4, [255, 160, 236, 150]);
    fillRect(canvas, 20, 26, 8, 4, [190, 246, 255, 255]);
    fillRect(canvas, 20, 26, 8, 1, [255, 255, 255, 255]);
  },
  beta: (canvas, p) => {
    // Fita em cruz + laço. As alças ficam DEITADAS ao lado do nó: em pé, elas
    // continuavam as cintas do baú comum e a caixa lia como jaula.
    fillRect(canvas, 21, 12, 6, 22, p.band);
    fillRect(canvas, 21, 12, 2, 22, p.bandLight);
    fillRect(canvas, 8, 26, 32, 4, p.band);
    fillRect(canvas, 8, 26, 32, 1, p.bandLight);
    for (const x of [14, 28]) {
      fillRect(canvas, x, 8, 6, 4, p.band);
      fillRect(canvas, x + 1, 9, 4, 2, p.woodDark);
    }
    fillRect(canvas, 21, 7, 6, 5, p.bandLight);
    fillRect(canvas, 23, 9, 2, 2, p.wood);
  },
};

function drawChest(tier) {
  const canvas = createCanvas(CHEST_SIZE, CHEST_SIZE);
  const palette = CHEST_PALETTES[tier];
  if (!palette) return null;
  chestBase(canvas, palette, tier === 'beta' ? { bands: false, lock: false } : {});
  CHEST_EXTRAS[tier]?.(canvas, palette);
  return canvas;
}

// ---------------------------------------------------------------- geração

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
// A raridade é do SERVIDOR (EquipmentCatalog.cs) — aqui ela chega pela ordem em que
// os itens do slot aparecem no catálogo visual, que é a mesma. Ler o C# a partir de
// um script de asset seria pior: viraria um parser de código para saber uma cor.
const bySlot = new Map();
for (const item of catalog.items) {
  if (!bySlot.has(item.slot)) bySlot.set(item.slot, []);
  bySlot.get(item.slot).push(item);
}

await mkdir(outDir, { recursive: true });
let written = 0;
for (const [slot, items] of bySlot) {
  for (const item of items) {
    const recipe = RECIPES[item.icon || item.visual || slot];
    if (!recipe) {
      console.warn(`sem receita para ${item.id} (${item.icon || slot})`);
      continue;
    }
    // Veículos são muitos por slot: a "raridade" deles vem da posição dentro do
    // próprio visual (dois skates, duas motos…), não da lista inteira do slot.
    const peers = slot === 'vehicle'
      ? items.filter((other) => (other.icon || other.visual) === (item.icon || item.visual))
      : items;
    const canvas = createCanvas(SIZE, SIZE);
    recipe(canvas, rgba(item.accent), rgba(item.secondary), Math.min(4, peers.indexOf(item)));
    await writeFile(resolve(outDir, `${item.id}.png`), encodePng(canvas));
    written += 1;
  }
}
console.log(`${written} ícones em assets/equipment/items/`);

await mkdir(chestDir, { recursive: true });
for (const tier of Object.keys(CHEST_PALETTES)) {
  const canvas = drawChest(tier);
  if (canvas) await writeFile(resolve(chestDir, `${tier}.png`), encodePng(canvas));
}
console.log(`${Object.keys(CHEST_PALETTES).length} baús em assets/equipment/chests/`);
