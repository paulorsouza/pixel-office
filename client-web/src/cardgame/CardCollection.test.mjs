import assert from 'node:assert/strict';
import test from 'node:test';

import { albumCatalog, collectionProgress } from './CardCollection.js';

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
