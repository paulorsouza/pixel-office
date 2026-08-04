import assert from 'node:assert/strict';
import test from 'node:test';

import {
  albumCatalog, collectionProgress, entryEdge, entryPower,
  filterCardEntries, sortCardEntries,
} from './CardCollection.js';

const cards = [
  { id: 'pokemon-001', name: 'Bulbasaur' },
  { id: 'pokemon-094', name: 'Gengar' },
  { id: 'special-slot-gengar', name: 'Gengar Glitch' },
  { id: 'special-casino-mewtwo', name: 'Mewtwo Rei do Cassino' },
];

test('álbum mostra as cartas-base e somente recompensas especiais já conquistadas', () => {
  const collection = [
    { cardId: 'pokemon-001', quantity: 1 },
    { cardId: 'special-slot-gengar', quantity: 1 },
  ];
  assert.deepEqual(
    albumCatalog(cards, collection).map((card) => card.id),
    ['pokemon-001', 'pokemon-094', 'special-slot-gengar'],
  );
});

test('progresso separa as 151 cartas-base dos prêmios especiais', () => {
  const collection = [
    { cardId: 'pokemon-001', quantity: 1 },
    { cardId: 'special-slot-gengar', quantity: 2 },
    { cardId: 'special-casino-mewtwo', quantity: 0 },
  ];
  assert.deepEqual(collectionProgress(cards, collection), { baseOwned: 1, specialOwned: 1 });
});

// ----------------------------------------------------------- filtro e ordem

const entry = (name, edges, { card = {}, ...extra } = {}) => ({
  card: { id: `pokemon-${name}`, dex: 1, name, edges, types: ['fire'], rarity: 'Common', ...card },
  isShiny: false,
  shinyBonusSide: '',
  quantity: 1,
  locked: false,
  ...extra,
});

const nomes = (entries) => entries.map((item) => item.card.name);

test('o +1 do shiny entra no lado bonificado e no poder total', () => {
  const normal = entry('Eevee', { top: 5, right: 4, bottom: 4, left: 7 });
  const shiny = entry('Eevee', { top: 5, right: 4, bottom: 4, left: 7 }, {
    isShiny: true, shinyBonusSide: 'right',
  });
  assert.equal(entryEdge(normal, 'right'), 4);
  assert.equal(entryEdge(shiny, 'right'), 5);
  assert.equal(entryPower(normal), 20);
  assert.equal(entryPower(shiny), 21);
});

test('ordem padrão devolve a Pokédex, sem remexer', () => {
  const entries = [
    entry('Bulbasaur', { top: 5, right: 4, bottom: 4, left: 7 }),
    entry('Mewtwo', { top: 14, right: 13, bottom: 14, left: 13 }),
    entry('Caterpie', { top: 2, right: 2, bottom: 3, left: 2 }),
  ];
  assert.deepEqual(nomes(sortCardEntries(entries, 'dex')), ['Bulbasaur', 'Mewtwo', 'Caterpie']);
  assert.deepEqual(nomes(sortCardEntries(entries)), ['Bulbasaur', 'Mewtwo', 'Caterpie']);
});

test('poder total ordena do mais forte para o mais fraco', () => {
  const entries = [
    entry('Caterpie', { top: 2, right: 2, bottom: 3, left: 2 }),
    entry('Mewtwo', { top: 14, right: 13, bottom: 14, left: 13 }),
    entry('Bulbasaur', { top: 5, right: 4, bottom: 4, left: 7 }),
  ];
  assert.deepEqual(nomes(sortCardEntries(entries, 'power')), ['Mewtwo', 'Bulbasaur', 'Caterpie']);
});

test('ordem por lado usa aquele lado e desempata pelo poder total', () => {
  const entries = [
    entry('Fraca', { top: 3, right: 3, bottom: 3, left: 3 }),
    entry('MuroDireito', { top: 1, right: 15, bottom: 1, left: 1 }),
    entry('Completa', { top: 12, right: 15, bottom: 12, left: 12 }),
  ];
  // Os dois 15 na direita empatam; a que é forte no resto vem primeiro.
  assert.deepEqual(nomes(sortCardEntries(entries, 'right')), ['Completa', 'MuroDireito', 'Fraca']);
  assert.deepEqual(nomes(sortCardEntries(entries, 'top')), ['Completa', 'Fraca', 'MuroDireito']);
});

test('shiny sobe na ordem do lado que ele bonifica', () => {
  const edges = { top: 9, right: 9, bottom: 9, left: 9 };
  const entries = [entry('Normal', edges), entry('Shiny', edges, { isShiny: true, shinyBonusSide: 'left' })];
  assert.deepEqual(nomes(sortCardEntries(entries, 'left')), ['Shiny', 'Normal']);
  assert.deepEqual(nomes(sortCardEntries(entries, 'top')), ['Shiny', 'Normal']);
});

test('raridade vai da mais rara para a mais comum', () => {
  const edges = { top: 1, right: 1, bottom: 1, left: 1 };
  const entries = [
    entry('Comum', edges, { card: { rarity: 'Common' } }),
    entry('Lendaria', edges, { card: { rarity: 'Legendary' } }),
    entry('Especial', edges, { card: { rarity: 'Special' } }),
    entry('Rara', edges, { card: { rarity: 'Rare' } }),
  ];
  assert.deepEqual(nomes(sortCardEntries(entries, 'rarity')), ['Especial', 'Lendaria', 'Rara', 'Comum']);
});

test('filtro de raridade aceita várias ao mesmo tempo', () => {
  const edges = { top: 1, right: 1, bottom: 1, left: 1 };
  const entries = [
    entry('Comum', edges, { card: { rarity: 'Common' } }),
    entry('Epica', edges, { card: { rarity: 'Epic' } }),
    entry('Lendaria', edges, { card: { rarity: 'Legendary' } }),
  ];
  assert.deepEqual(nomes(filterCardEntries(entries, { rarities: ['Epic', 'Legendary'] })), ['Epica', 'Lendaria']);
  // Lista vazia é "todas", não "nenhuma".
  assert.equal(filterCardEntries(entries, { rarities: [] }).length, 3);
});

test('filtro de coleção separa o que eu tenho do que ainda falta', () => {
  const edges = { top: 1, right: 1, bottom: 1, left: 1 };
  const entries = [
    entry('Tenho', edges),
    entry('Falta', edges, { quantity: 0, locked: true }),
  ];
  assert.deepEqual(nomes(filterCardEntries(entries, { owned: 'mine' })), ['Tenho']);
  assert.deepEqual(nomes(filterCardEntries(entries, { owned: 'missing' })), ['Falta']);
});

test('busca, tipo e acabamento se combinam num filtro só', () => {
  const edges = { top: 1, right: 1, bottom: 1, left: 1 };
  const entries = [
    entry('Charmander', edges, { card: { types: ['fire'], dex: 4 } }),
    entry('Charmander', edges, { card: { types: ['fire'], dex: 4 }, isShiny: true, shinyBonusSide: 'top' }),
    entry('Squirtle', edges, { card: { types: ['water'], dex: 7 } }),
  ];
  assert.equal(filterCardEntries(entries, { query: 'char' }).length, 2);
  assert.equal(filterCardEntries(entries, { query: 'char', finish: 'shiny' }).length, 1);
  assert.equal(filterCardEntries(entries, { type: 'water' }).length, 1);
  assert.equal(filterCardEntries(entries, { query: '7' }).length, 1);
  assert.equal(filterCardEntries(entries, { type: 'fire', finish: 'normal' }).length, 1);
});
