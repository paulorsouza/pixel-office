// Recorta as peças modulares do Character Generator (LimeZu) para o formato que o
// cliente usa e escreve `assets/character/catalog.json`.
//
// Duas coisas justificam este arquivo existir:
//
// 1. **Tamanho.** A folha do pack tem 896×656 e o jogo usa três linhas dela (idle,
//    walk, sit). Recortada para 384×96, cada peça cai de ~45 KB para ~2 KB — é o que
//    torna viável versionar as 432 opções em vez das 23 escolhidas a dedo.
//
// 2. **Os frames `sit` de cima/baixo não existem no pack.** O pack só traz as
//    laterais; up/down foram gerados por script na primeira leva de 23 peças e a
//    regra estava só no resultado. Aqui ela está escrita: copia o `idle` da direção e
//    refaz as três últimas linhas de pixel (junta as pernas, escurece o joelho,
//    apaga o pé). `--check` prova que a regra é a mesma, comparando com as folhas
//    antigas pixel a pixel — ver ASSETS.md §3.1.
//
// Uso:
//   node client-web/tools/generate-character-parts.mjs            # gera tudo
//   node client-web/tools/generate-character-parts.mjs --check DIR # só confere a regra
//                                                                 # contra folhas 896×656
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blit, createCanvas, decodePng, encodePng } from './png.mjs';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(toolsDir, '..');
const repoRoot = resolve(clientRoot, '..');
const packRoot = resolve(repoRoot, 'LimeZu/personagens/character-generator-parts');
const outRoot = resolve(clientRoot, 'assets/character');

const FRAME_W = 16;
const FRAME_H = 32;
const FRAMES = 24;
// Linhas usadas, na folha do pack (topo de cada pose).
const SOURCE_ROWS = { idle: 32, walk: 64, sit: 128 };
// Ordem das poses na folha recortada. `idle` primeiro porque é a que o preview usa.
const SHEET_ROWS = ['idle', 'walk', 'sit'];
// idle/walk: right(0-5), up(6-11), left(12-17), down(18-23).
// sit: right(0-5), left(6-11), up(12-17), down(18-23) — ordem própria, ver ASSETS.md.
const IDLE_START = { right: 0, up: 6, left: 12, down: 18 };
const SIT_START = { right: 0, left: 6, up: 12, down: 18 };
// Quanto o joelho escurece na linha de baixo do quadril. Medido nas folhas de 2026-07.
const KNEE_SHADE = 0.82;

// ---------------------------------------------------------------- recorte

function cropRow(source, sourceY) {
  const row = createCanvas(FRAME_W * FRAMES, FRAME_H);
  for (let y = 0; y < FRAME_H; y += 1) {
    for (let x = 0; x < row.width; x += 1) {
      const from = ((sourceY + y) * source.width + x) * 4;
      const to = (y * row.width + x) * 4;
      source.data.copy(row.data, to, from, from + 4);
    }
  }
  return row;
}

function pixel(sheet, x, y) {
  const index = (y * sheet.width + x) * 4;
  return sheet.data.subarray(index, index + 4);
}

function writePixel(sheet, x, y, rgba) {
  const index = (y * sheet.width + x) * 4;
  if (rgba) sheet.data.set(rgba, index);
  else sheet.data.fill(0, index, index + 4);
}

/**
 * Escreve os 12 frames `sit` de cima/baixo a partir do `idle` da mesma direção.
 *
 * A silhueta sentada de frente/costas não existe no pack e desenhá-la de verdade
 * (joelho dobrado) é trabalho de pixel art. O que dá para fazer por código é o que
 * as folhas antigas já faziam: manter o tronco do `idle` e trocar as pernas por um
 * quadril alargado — lê como "encaixado na cadeira" de longe, que é a distância em
 * que o jogo mostra o avatar sentado.
 */
function generateSitFrames(sheet, idleY, sitY) {
  for (const direction of ['up', 'down']) {
    for (let step = 0; step < 6; step += 1) {
      const from = (IDLE_START[direction] + step) * FRAME_W;
      const to = (SIT_START[direction] + step) * FRAME_W;
      for (let y = 0; y < FRAME_H; y += 1) {
        for (let x = 0; x < FRAME_W; x += 1) {
          writePixel(sheet, to + x, sitY + y, pixel(sheet, from + x, idleY + y));
        }
      }
      reshapeLegs(sheet, to, sitY);
    }
  }
}

/**
 * Últimas três linhas do frame: quadril, joelho e pé.
 *
 * - linha 29 = a linha 28 (coxa cheia) alargada um pixel para cada lado, o que fecha
 *   o vão entre as pernas;
 * - linha 30 = a mesma linha 29 escurecida, que é o que dá volume de joelho dobrado;
 * - linha 31 = vazia — pé aparecendo embaixo denunciaria alguém em pé.
 */
function reshapeLegs(sheet, frameX, rowY) {
  const thigh = [];
  for (let x = 0; x < FRAME_W; x += 1) {
    const rgba = pixel(sheet, frameX + x, rowY + 28);
    thigh.push(rgba[3] ? Uint8Array.from(rgba) : null);
  }
  const left = thigh.findIndex(Boolean);
  const right = thigh.findLastIndex(Boolean);
  for (let x = 0; x < FRAME_W; x += 1) {
    writePixel(sheet, frameX + x, rowY + 31, null);
    if (left < 0 || x < left - 1 || x > right + 1) {
      writePixel(sheet, frameX + x, rowY + 29, null);
      writePixel(sheet, frameX + x, rowY + 30, null);
      continue;
    }
    const source = thigh[Math.min(Math.max(x, left), right)];
    writePixel(sheet, frameX + x, rowY + 29, source);
    writePixel(sheet, frameX + x, rowY + 30, source && Uint8Array.from([
      Math.round(source[0] * KNEE_SHADE),
      Math.round(source[1] * KNEE_SHADE),
      Math.round(source[2] * KNEE_SHADE),
      source[3],
    ]));
  }
}

/** Folha 384×96 pronta: as três poses recortadas + os `sit` de cima/baixo gerados. */
function buildSheet(source) {
  const sheet = createCanvas(FRAME_W * FRAMES, FRAME_H * SHEET_ROWS.length);
  SHEET_ROWS.forEach((pose, index) => {
    blit(sheet, cropRow(source, SOURCE_ROWS[pose]), 0, index * FRAME_H);
  });
  generateSitFrames(sheet, SHEET_ROWS.indexOf('idle') * FRAME_H, SHEET_ROWS.indexOf('sit') * FRAME_H);
  return sheet;
}

// ---------------------------------------------------------------- cor e nome

const OUTLINE = '58,58,80';

/** Cor que representa a peça na cartela da UI: a mais frequente do frame de frente. */
function accentColor(sheet) {
  const counts = new Map();
  const y0 = SHEET_ROWS.indexOf('idle') * FRAME_H;
  for (let y = y0; y < y0 + FRAME_H; y += 1) {
    for (let x = IDLE_START.down * FRAME_W; x < (IDLE_START.down + 1) * FRAME_W; x += 1) {
      const [r, g, b, a] = pixel(sheet, x, y);
      // Contorno e sombra escura são iguais em todas as peças: contá-los faria a
      // cartela inteira ficar cinza-escura.
      if (a < 200 || `${r},${g},${b}` === OUTLINE || r + g + b < 120) continue;
      const key = `${r},${g},${b}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) return { hex: '#8a7a86', rgb: [138, 122, 134] };
  const rgb = best[0].split(',').map(Number);
  return { hex: `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`, rgb };
}

function hsl([r, g, b]) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const light = (max + min) / 2;
  const delta = max - min;
  if (!delta) return { hue: 0, sat: 0, light };
  const sat = delta / (1 - Math.abs(2 * light - 1));
  const hue = 60 * (max === rn
    ? ((gn - bn) / delta + 6) % 6
    : max === gn ? (bn - rn) / delta + 2 : (rn - gn) / delta + 4);
  return { hue, sat, light };
}

const HUE_NAMES = [
  [15, 'Vermelho'], [42, 'Laranja'], [65, 'Amarelo'], [160, 'Verde'], [200, 'Ciano'],
  [255, 'Azul'], [290, 'Roxo'], [335, 'Rosa'], [360, 'Vermelho'],
];

/**
 * Nome da variante a partir da cor. Os packs numeram as cores (`_01`.._10`) e nada
 * mais; "Azul" diz o que "Cor 2" não diz, e a cartela mostra o tom exato do lado.
 */
function colorName(rgb) {
  const { hue, sat, light } = hsl(rgb);
  if (sat < 0.16) {
    if (light < 0.22) return 'Preto';
    if (light < 0.45) return 'Chumbo';
    if (light < 0.7) return 'Cinza';
    return 'Branco';
  }
  const base = HUE_NAMES.find(([limit]) => hue <= limit)?.[1] || 'Colorido';
  if ((base === 'Laranja' || base === 'Vermelho') && light < 0.42) return 'Marrom';
  if (base === 'Amarelo' && light > 0.6) return 'Loiro';
  if (light < 0.28) return `${base} escuro`;
  if (light > 0.78) return `${base} claro`;
  return base;
}

/**
 * Cabelo (e barba, e bigode) tem vocabulário próprio: "Laranja 1, Laranja 2, Chumbo"
 * descreve o pixel e não o cabelo. As sete cores do pack são as de sempre — ruivo,
 * castanho em três tons, grisalho, grafite e preto azulado.
 */
function hairColorName(rgb) {
  const { hue, sat, light } = hsl(rgb);
  if (hue >= 190 && hue <= 265 && sat < 0.25 && light < 0.5) return 'Preto azulado';
  if (sat < 0.12) {
    if (light < 0.3) return 'Preto';
    if (light < 0.45) return 'Grafite';
    if (light < 0.72) return 'Grisalho';
    return 'Prata';
  }
  if (hue > 70) return colorName(rgb);
  if (light > 0.62) return 'Loiro';
  if (sat > 0.45) return 'Ruivo';
  if (light > 0.42) return 'Castanho claro';
  if (light > 0.33) return 'Castanho';
  return 'Castanho escuro';
}

// Os sete pares de olhos do pack, na ordem dos arquivos. São poucos e fixos: um
// nome escrito à mão vale mais que a cor média de quatro pixels.
const EYE_NAMES = ['Castanhos', 'Verdes', 'Verde-oliva', 'Cinzas', 'Âmbar', 'Azuis', 'Ciano'];

/** "Marrom" três vezes na mesma cartela não ajuda ninguém: numera as repetições. */
function uniqueNames(variants) {
  const seen = new Map();
  const total = new Map();
  for (const variant of variants) total.set(variant.name, (total.get(variant.name) || 0) + 1);
  return variants.map((variant) => {
    if (total.get(variant.name) === 1) return variant;
    const index = (seen.get(variant.name) || 0) + 1;
    seen.set(variant.name, index);
    return { ...variant, name: `${variant.name} ${index}` };
  });
}

// ---------------------------------------------------------------- catálogo

// Acessórios ocupam partes diferentes do corpo, então viraram três camadas: dá para
// usar óculos, boné e mochila ao mesmo tempo. A ordem das camadas na lista é a ordem
// de desenho — mochila entra antes do cabelo, chapéu depois.
const ACCESSORY_GROUPS = {
  back: ['Backpack', 'Gloves'],
  face: ['Mustache', 'Beard', 'Glasses', 'Monocle', 'Medical_Mask'],
  head: [
    'Ladybug', 'Bee', 'Snapback', 'Dino_Snapback', 'Policeman_Hat', 'Bataclava',
    'Detective_Hat', 'Zombie_Brain', 'Bolt', 'Beanie', 'Chef', 'Party_Cone',
  ],
};

const ACCESSORY_NAMES = {
  Ladybug: 'Joaninha', Bee: 'Abelha', Backpack: 'Mochila', Snapback: 'Boné',
  Dino_Snapback: 'Boné dino', Policeman_Hat: 'Quepe', Bataclava: 'Balaclava',
  Detective_Hat: 'Chapéu de detetive', Zombie_Brain: 'Cérebro zumbi', Bolt: 'Parafuso',
  Beanie: 'Gorro', Mustache: 'Bigode', Beard: 'Barba', Gloves: 'Luvas',
  Glasses: 'Óculos', Monocle: 'Monóculo', Medical_Mask: 'Máscara', Chef: 'Chapéu de chef',
  Party_Cone: 'Chapéu de festa',
};

const CATEGORIES = [
  { id: 'body', name: 'Pele', source: 'Bodies', dir: 'bodies', required: true },
  { id: 'eyes', name: 'Olhos', source: 'Eyes', dir: 'eyes', required: true },
  { id: 'outfit', name: 'Roupa', source: 'Outfits', dir: 'outfits', required: true },
  { id: 'back', name: 'Costas', source: 'Accessories', dir: 'accessories', group: 'back' },
  { id: 'hairstyle', name: 'Cabelo', source: 'Hairstyles', dir: 'hairstyles', required: true },
  { id: 'face', name: 'Rosto', source: 'Accessories', dir: 'accessories', group: 'face' },
  { id: 'head', name: 'Cabeça', source: 'Accessories', dir: 'accessories', group: 'head' },
];

/** `Accessory_15_Glasses_03.png` → `{ family: 'glasses', variant: '03', word: 'Glasses' }`. */
function parseName(category, file) {
  const stem = file.replace(/\.png$/i, '');
  if (category.source === 'Accessories') {
    const match = stem.match(/^Accessory_\d+_(.+)_(\d+)$/);
    if (!match) return null;
    return { word: match[1], family: match[1].toLowerCase().replace(/_/g, '-'), variant: match[2] };
  }
  const match = stem.match(/^[A-Za-z]+_(\d+)(?:_(\d+))?$/);
  if (!match) return null;
  // Corpo e olhos não têm modelo: a numeração já é a própria variante.
  return match[2]
    ? { family: `${category.id}-${match[1]}`, model: match[1], variant: match[2] }
    : { family: category.id, variant: match[1] };
}

function optionId(category, parsed) {
  return category.source === 'Accessories' || parsed.model
    ? `${parsed.family}-${parsed.variant}`.replace(/^(body|eyes)-/, `${category.id}-`)
    : `${category.id}-${parsed.variant}`;
}

const HAIR_FAMILIES = new Set(['mustache', 'beard']);

function variantName(category, parsed, accent) {
  if (category.id === 'body') return `Tom ${Number(parsed.variant)}`;
  if (category.id === 'eyes') return EYE_NAMES[Number(parsed.variant) - 1] || colorName(accent.rgb);
  if (category.id === 'hairstyle' || HAIR_FAMILIES.has(parsed.family)) return hairColorName(accent.rgb);
  return colorName(accent.rgb);
}

function familyName(category, parsed) {
  if (category.source === 'Accessories') return ACCESSORY_NAMES[parsed.word] || parsed.word;
  if (parsed.model) return `Modelo ${parsed.model}`;
  return category.name;
}

async function buildCategory(category, { write }) {
  const sourceDir = resolve(packRoot, category.source, '16x16');
  const files = (await readdir(sourceDir)).filter((file) => file.endsWith('.png')).sort();
  const options = [];
  for (const file of files) {
    const parsed = parseName(category, file);
    if (!parsed) continue;
    if (category.group && !ACCESSORY_GROUPS[category.group].includes(parsed.word)) continue;
    const sheet = buildSheet(decodePng(await readFile(resolve(sourceDir, file))));
    const target = `assets/character/${category.dir}/${file.toLowerCase().replace(/^accessory_\d+_/, '')}`;
    if (write) await writeFile(resolve(clientRoot, target), encodePng(sheet));
    const accent = accentColor(sheet);
    options.push({
      id: optionId(category, parsed),
      name: variantName(category, parsed, accent),
      family: parsed.family,
      familyName: familyName(category, parsed),
      path: target,
      accent: accent.hex,
    });
  }
  // Os nomes de cor só são únicos dentro da família — "Azul" pode aparecer em dois
  // modelos de cabelo sem confundir ninguém, mas não duas vezes no mesmo.
  const byFamily = new Map();
  for (const option of options) {
    if (!byFamily.has(option.family)) byFamily.set(option.family, []);
    byFamily.get(option.family).push(option);
  }
  const named = [...byFamily.values()].flatMap((group) => uniqueNames(group));
  return {
    id: category.id,
    name: category.name,
    required: Boolean(category.required),
    options: category.required ? named : [
      { id: 'none', name: 'Nenhum', family: 'none', familyName: 'Nenhum', path: null, accent: '#73545a' },
      ...named,
    ],
  };
}

// ---------------------------------------------------------------- conferência

/**
 * Compara o que este gerador produz com as folhas 896×656 da primeira leva.
 *
 * É o que garante que os `sit` gerados aqui são os MESMOS de antes — sem isso, um
 * avatar já existente mudaria de pose ao sentar só porque o gerador foi reescrito.
 */
async function check(legacyDir) {
  let compared = 0;
  let failed = 0;
  for (const category of CATEGORIES) {
    const sourceDir = resolve(packRoot, category.source, '16x16');
    for (const file of await readdir(sourceDir)) {
      if (!file.endsWith('.png')) continue;
      const legacyName = file.toLowerCase().replace(/^accessory_\d+_/, '');
      const legacyPath = resolve(legacyDir, category.dir, legacyName);
      let legacy;
      try {
        legacy = decodePng(await readFile(legacyPath));
      } catch {
        continue; // peça que a primeira leva não usava
      }
      if (legacy.height !== 656) continue;
      const sheet = buildSheet(decodePng(await readFile(resolve(sourceDir, file))));
      compared += 1;
      const bad = [];
      // Pixel transparente é transparente: o pack guarda RGB embaixo do alfa zero e
      // o `blit` não copia isso. Comparar o RGB invisível acusaria diferença em
      // metade da folha sem nenhuma consequência na tela.
      const visible = (rgba) => (rgba[3] ? [...rgba].join(',') : 'vazio');
      SHEET_ROWS.forEach((pose, index) => {
        for (let y = 0; y < FRAME_H; y += 1) {
          for (let x = 0; x < sheet.width; x += 1) {
            const mine = visible(pixel(sheet, x, index * FRAME_H + y));
            const theirs = visible(pixel(legacy, x, SOURCE_ROWS[pose] + y));
            if (mine !== theirs) bad.push(`${pose} x=${x} y=${y} (${mine} ≠ ${theirs})`);
          }
        }
      });
      if (bad.length) {
        failed += 1;
        console.log(`✗ ${category.dir}/${legacyName}: ${bad.length} pixels diferentes (ex.: ${bad[0]})`);
      }
    }
  }
  console.log(`\n${compared - failed}/${compared} folhas antigas reproduzidas pixel a pixel.`);
  return failed === 0;
}

// ---------------------------------------------------------------- entrada

const checkIndex = process.argv.indexOf('--check');
if (checkIndex >= 0) {
  const dir = resolve(process.cwd(), process.argv[checkIndex + 1] || 'client-web/assets/character');
  process.exitCode = (await check(dir)) ? 0 : 1;
} else {
  for (const dir of new Set(CATEGORIES.map((category) => category.dir))) {
    await mkdir(resolve(outRoot, dir), { recursive: true });
  }
  const categories = [];
  for (const category of CATEGORIES) categories.push(await buildCategory(category, { write: true }));
  const catalog = {
    _leia: 'Gerado por client-web/tools/generate-character-parts.mjs — não edite à mão.',
    storageKey: 'office-quest-character-v2',
    frame: {
      width: FRAME_W,
      height: FRAME_H,
      poses: Object.fromEntries(SHEET_ROWS.map((pose, index) => [pose, {
        y: index * FRAME_H,
        frames: FRAMES,
        frameRate: pose === 'walk' ? 10 : 5,
      }])),
    },
    defaultSelection: {
      body: 'body-03',
      eyes: 'eyes-03',
      outfit: 'outfit-01-03',
      hairstyle: 'hairstyle-01-03',
      back: 'none',
      face: 'none',
      head: 'none',
    },
    categories,
  };
  await writeFile(resolve(outRoot, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  const total = categories.reduce((sum, category) => sum + category.options.length, 0);
  console.log(`${total} opções em ${categories.length} camadas:`);
  for (const category of categories) {
    const families = new Set(category.options.map((option) => option.family)).size;
    console.log(`  ${category.id.padEnd(10)} ${String(category.options.length).padStart(4)} opções · ${families} famílias`);
  }
}
