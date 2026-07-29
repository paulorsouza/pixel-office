import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(toolsDir, '..');
const repoRoot = resolve(clientRoot, '..');
const clientCatalogPath = resolve(clientRoot, 'assets/cardgame/catalog.json');
const backendCatalogPath = resolve(repoRoot, 'backend/VirtualOffice.Api/Data/cardgame-catalog.json');
const spriteDir = resolve(clientRoot, 'assets/cardgame/pokemon');
const cachePath = resolve(repoRoot, '.tmp/cardgame-pokeapi.json');

const capitalize = (value) => value
  .split('-')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'OfficeQuestCardCatalog/1.0' } });
  if (!response.ok) throw new Error(`${response.status} ao carregar ${url}`);
  return response.json();
}

async function loadPokemon() {
  try {
    return JSON.parse(await readFile(cachePath, 'utf8'));
  } catch {
    // Continua e monta o cache.
  }

  const ids = Array.from({ length: 151 }, (_, index) => index + 1);
  const result = new Array(ids.length);
  let cursor = 0;
  const workers = Array.from({ length: 12 }, async () => {
    while (cursor < ids.length) {
      const index = cursor;
      cursor += 1;
      const id = ids[index];
      const data = await fetchJson(`https://pokeapi.co/api/v2/pokemon/${id}`);
      result[index] = {
        id,
        name: data.name,
        types: data.types.sort((a, b) => a.slot - b.slot).map((entry) => entry.type.name),
        stats: Object.fromEntries(data.stats.map((entry) => [entry.stat.name, entry.base_stat])),
        sprite: data.sprites.front_default,
      };
      process.stdout.write(`\rMetadados Pokémon: ${result.filter(Boolean).length}/151`);
    }
  });
  await Promise.all(workers);
  process.stdout.write('\n');
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

function rankValues(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((value) => {
    const first = sorted.indexOf(value);
    const last = sorted.lastIndexOf(value);
    const percentile = ((first + last) / 2) / (sorted.length - 1);
    return 2 + Math.round(percentile * 7);
  });
}

function rarity(total, dex) {
  if (dex === 151) return 'Special';
  if (total >= 570) return 'Legendary';
  if (total >= 500) return 'Epic';
  if (total >= 420) return 'Rare';
  if (total >= 320) return 'Uncommon';
  return 'Common';
}

function buildCatalog(pokemon) {
  const raw = pokemon.map(({ stats }) => ({
    top: stats.defense * 0.65 + stats['special-defense'] * 0.35,
    right: stats.speed * 0.55 + stats.attack * 0.45,
    bottom: stats.hp * 0.55 + stats.defense * 0.45,
    left: stats['special-attack'] * 0.65 + stats.speed * 0.35,
  }));
  const ranked = Object.fromEntries(
    ['top', 'right', 'bottom', 'left'].map((side) => [side, rankValues(raw.map((row) => row[side]))]),
  );

  const cards = pokemon.map((entry, index) => {
    const total = Object.values(entry.stats).reduce((sum, value) => sum + value, 0);
    const edges = Object.fromEntries(
      ['top', 'right', 'bottom', 'left'].map((side) => [side, ranked[side][index]]),
    );
    if (total >= 570) {
      const strongest = Object.entries(edges).sort((a, b) => b[1] - a[1])[0][0];
      edges[strongest] = Math.min(10, edges[strongest] + 1);
    }
    const cardRarity = entry.id === 25 ? 'Rare' : rarity(total, entry.id);
    return {
      id: `pokemon-${String(entry.id).padStart(3, '0')}`,
      dex: entry.id,
      name: capitalize(entry.name),
      types: entry.types,
      edges,
      powerRating: Object.values(edges).reduce((sum, value) => sum + value, 0),
      rarity: cardRarity,
      art: `assets/cardgame/pokemon/${String(entry.id).padStart(3, '0')}.png`,
    };
  });

  const pikachu = cards.find((card) => card.dex === 25);
  const dragonite = cards.find((card) => card.dex === 149);
  const mewtwo = cards.find((card) => card.dex === 150);
  const gengar = cards.find((card) => card.dex === 94);
  const charizard = cards.find((card) => card.dex === 6);
  const porygon = cards.find((card) => card.dex === 137);
  const meowth = cards.find((card) => card.dex === 52);
  const alakazam = cards.find((card) => card.dex === 65);
  cards.push(
    {
      ...pikachu,
      id: 'special-ash-pikachu',
      name: 'Pikachu do Ash',
      variant: 'ash',
      edges: { top: 7, right: 9, bottom: 6, left: 9 },
      powerRating: 31,
      rarity: 'Special',
    },
    {
      ...dragonite,
      id: 'special-mailman-dragonite',
      name: 'Dragonite Carteiro',
      variant: 'mailman',
      edges: { top: 9, right: 8, bottom: 10, left: 8 },
      powerRating: 35,
      rarity: 'Special',
    },
    {
      ...pikachu,
      id: 'special-casino-pikachu',
      name: 'Pikachu Jogador',
      variant: 'casino-player',
      edges: { top: 8, right: 8, bottom: 8, left: 8 },
      powerRating: 32,
      rarity: 'Special',
    },
    {
      ...mewtwo,
      id: 'special-casino-mewtwo',
      name: 'Mewtwo Rei do Cassino',
      variant: 'casino-king',
      edges: { top: 11, right: 11, bottom: 11, left: 11 },
      powerRating: 44,
      rarity: 'Special',
    },
    {
      ...gengar,
      id: 'special-slot-gengar',
      name: 'Gengar Glitch',
      variant: 'slot-glitch',
      edges: { top: 8, right: 9, bottom: 8, left: 9 },
      powerRating: 34,
      rarity: 'Special',
    },
    {
      ...charizard,
      id: 'special-slot-charizard',
      name: 'Charizard Arcade',
      variant: 'slot-arcade',
      edges: { top: 9, right: 9, bottom: 9, left: 9 },
      powerRating: 36,
      rarity: 'Special',
    },
    {
      ...porygon,
      id: 'special-slot-porygon',
      name: 'Porygon Jackpot',
      variant: 'jackpot',
      edges: { top: 8, right: 8, bottom: 8, left: 8 },
      powerRating: 32,
      rarity: 'Special',
    },
    {
      ...meowth,
      id: 'special-blackjack-meowth',
      name: 'Meowth Dealer',
      variant: 'dealer',
      edges: { top: 8, right: 8, bottom: 8, left: 8 },
      powerRating: 32,
      rarity: 'Special',
    },
    {
      ...alakazam,
      id: 'special-casino-quadra',
      name: 'Alakazam Quadra',
      variant: 'casino-four-spoons',
      spoonCount: 4,
      edges: { top: 7, right: 7, bottom: 7, left: 7 },
      powerRating: 28,
      rarity: 'Special',
    },
    {
      ...alakazam,
      id: 'special-casino-quina',
      name: 'Alakazam Quina',
      variant: 'casino-five-spoons',
      spoonCount: 5,
      edges: { top: 9, right: 9, bottom: 9, left: 9 },
      powerRating: 36,
      rarity: 'Special',
    },
  );

  return {
    version: 1,
    generatedFrom: 'PokeAPI',
    baseCount: 151,
    cards,
  };
}

async function downloadSprites(pokemon) {
  await mkdir(spriteDir, { recursive: true });
  let cursor = 0;
  const workers = Array.from({ length: 12 }, async () => {
    while (cursor < pokemon.length) {
      const index = cursor;
      cursor += 1;
      const entry = pokemon[index];
      if (!entry.sprite) continue;
      const response = await fetch(entry.sprite, { headers: { 'User-Agent': 'OfficeQuestCardCatalog/1.0' } });
      if (!response.ok) throw new Error(`${response.status} ao carregar sprite #${entry.id}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(resolve(spriteDir, `${String(entry.id).padStart(3, '0')}.png`), buffer);
      process.stdout.write(`\rSprites Pokémon: ${index + 1}/151`);
    }
  });
  await Promise.all(workers);
  process.stdout.write('\n');
}

const pokemon = await loadPokemon();
const catalog = buildCatalog(pokemon);
await downloadSprites(pokemon);
await mkdir(dirname(clientCatalogPath), { recursive: true });
await mkdir(dirname(backendCatalogPath), { recursive: true });
const json = `${JSON.stringify(catalog, null, 2)}\n`;
await Promise.all([
  writeFile(clientCatalogPath, json),
  writeFile(backendCatalogPath, json),
]);
console.log(`Catálogo gerado: ${catalog.baseCount} base + ${catalog.cards.length - catalog.baseCount} variantes.`);
