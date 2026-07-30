import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  BOARD_CELLS,
  DECK_SIZE,
  OPENING_HAND_SIZE,
  compareCards,
  createMatch,
  playCard,
  printedEdge,
  projectMatchState,
  validateDeck,
} from './engine.js';
import { albumEntries } from './CardCollection.js';

const readJson = (relativeUrl) => JSON.parse(readFileSync(new URL(relativeUrl, import.meta.url), 'utf8'));
const typeChart = readJson('../../assets/cardgame/type-chart.json');
const prototypeCatalog = readJson('../../assets/cardgame/prototype-catalog.json');
const fullCatalog = readJson('../../assets/cardgame/catalog.json');
const backendCatalog = readJson('../../../backend/VirtualOffice.Api/Data/cardgame-catalog.json');

function makeCard(id, overrides = {}) {
  return {
    id,
    definitionId: overrides.definitionId || id,
    name: overrides.name || id,
    types: overrides.types || ['normal'],
    edges: overrides.edges || { top: 4, right: 4, bottom: 4, left: 4 },
    ...(overrides.shinyBonusSide ? { shinyBonusSide: overrides.shinyBonusSide } : {}),
  };
}

function makeDeck(player, overrides = {}) {
  return Array.from({ length: DECK_SIZE }, (_, index) => makeCard(`${player}-${index + 1}`, overrides));
}

function playFirstCard(state, cellIndex, chart = typeChart) {
  const playerIndex = state.currentPlayer;
  const cardId = state.players[playerIndex].hand[0].id;
  return playCard(state, { playerIndex, cardId, cellIndex }, chart);
}

test('baralho exige quinze instâncias únicas', () => {
  assert.equal(validateDeck(makeDeck('a')), true);
  assert.throws(() => validateDeck(makeDeck('a').slice(0, 14)), /exatamente 15/);

  const duplicate = makeDeck('a');
  duplicate[14] = duplicate[0];
  assert.throws(() => validateDeck(duplicate), /repetir a mesma instância/);
});

test('partida começa com mão de seis e monte de nove sem alterar o baralho recebido', () => {
  const decks = [makeDeck('a'), makeDeck('b')];
  const original = structuredClone(decks);
  const state = createMatch({ decks, startingPlayer: 1 });

  assert.equal(state.currentPlayer, 1);
  assert.equal(state.board.length, BOARD_CELLS);
  assert.deepEqual(state.players.map((player) => player.hand.length), [OPENING_HAND_SIZE, OPENING_HAND_SIZE]);
  assert.deepEqual(state.players.map((player) => player.drawPile.length), [9, 9]);
  assert.deepEqual(decks, original);
});

test('jogar remove da mão, compra do monte e alterna o turno', () => {
  const state = createMatch({ decks: [makeDeck('a'), makeDeck('b')] });
  const originalCardId = state.players[0].hand[0].id;
  const expectedDrawId = state.players[0].drawPile[0].id;
  const result = playCard(state, { playerIndex: 0, cardId: originalCardId, cellIndex: 4 }, typeChart);

  assert.equal(result.drawnCardId, expectedDrawId);
  assert.equal(result.state.board[4].card.id, originalCardId);
  assert.equal(result.state.players[0].hand.length, OPENING_HAND_SIZE);
  assert.equal(result.state.players[0].drawPile.length, 8);
  assert.equal(result.state.currentPlayer, 1);
  assert.equal(state.board[4], null, 'o estado anterior deve permanecer imutável');
});

test('baralho de quinze mantém seis cartas ocultas após três compras de cada jogador', () => {
  let state = createMatch({ decks: [makeDeck('a'), makeDeck('b')] });
  const seen = state.players.map((player) => new Set(player.hand.map((card) => card.id)));

  for (let cellIndex = 0; cellIndex < 6; cellIndex += 1) {
    const playerIndex = state.currentPlayer;
    const result = playFirstCard(state, cellIndex);
    if (result.drawnCardId) seen[playerIndex].add(result.drawnCardId);
    state = result.state;
  }

  assert.deepEqual(state.players.map((player) => player.drawPile.length), [6, 6]);
  assert.deepEqual(seen.map((cards) => cards.size), [9, 9]);
  assert.equal(state.turn, 6);
});

test('vantagem de tipo acrescenta somente um ponto e permite captura', () => {
  const fire = makeCard('fire', {
    types: ['fire'],
    edges: { top: 5, right: 5, bottom: 5, left: 5 },
  });
  const grass = makeCard('grass', {
    types: ['grass'],
    edges: { top: 5, right: 5, bottom: 5, left: 5 },
  });
  const comparison = compareCards(fire, 'right', grass, typeChart);

  assert.equal(comparison.attackTypeBonus, 1);
  assert.equal(comparison.defenseTypeBonus, 0);
  assert.equal(comparison.attackTotal, 6);
  assert.equal(comparison.defenseTotal, 5);
  assert.equal(comparison.captured, true);
});

test('cartas de dois tipos ainda recebem no máximo +1 e podem ter bônus bilateral', () => {
  const electric = makeCard('electric', { types: ['electric', 'flying'] });
  const waterGround = makeCard('water-ground', { types: ['water', 'ground'] });
  const comparison = compareCards(electric, 'top', waterGround, typeChart);

  assert.equal(comparison.attackTypeBonus, 1, 'electric é forte contra water');
  assert.equal(comparison.defenseTypeBonus, 1, 'ground é forte contra electric');
  assert.equal(comparison.attackTotal, 5);
  assert.equal(comparison.defenseTotal, 5);
  assert.equal(comparison.captured, false, 'empate não captura');
});

test('bônus shiny aumenta somente a borda marcada', () => {
  const shiny = makeCard('shiny', {
    edges: { top: 15, right: 4, bottom: 4, left: 4 },
    shinyBonusSide: 'top',
  });

  assert.equal(printedEdge(shiny, 'top'), 16);
  assert.equal(printedEdge(shiny, 'right'), 4);

  assert.equal(validateDeck(makeDeck('shiny-valid', {
    edges: { top: 15, right: 4, bottom: 4, left: 4 },
    shinyBonusSide: 'top',
  })), true);
  const invalid = makeDeck('invalid-edge');
  invalid[0] = makeCard('invalid-edge-1', { edges: { top: 16, right: 4, bottom: 4, left: 4 } });
  assert.throws(() => validateDeck(invalid), /entre 1 e 15/);
});

test('álbum separa a carta normal de cada variante shiny por atributo', () => {
  const card = fullCatalog.cards.find((entry) => entry.id === 'pokemon-006');
  const entries = albumEntries([card], [
    { cardId: card.id, quantity: 5, isShiny: false, cardToken: card.id },
    { cardId: card.id, quantity: 2, isShiny: true, shinyBonusSide: 'top', cardToken: `${card.id}~top` },
    { cardId: card.id, quantity: 1, isShiny: true, shinyBonusSide: 'left', cardToken: `${card.id}~left` },
  ]);

  assert.equal(entries.length, 3);
  assert.deepEqual(entries.map(({ isShiny, shinyBonusSide, quantity }) => (
    [isShiny, shinyBonusSide, quantity]
  )), [
    [false, '', 5],
    [true, 'top', 2],
    [true, 'left', 1],
  ]);
  assert.equal(entries[0].locked, false);
  assert.deepEqual(entries.slice(1).map((entry) => entry.cardToken), [
    `${card.id}~top`,
    `${card.id}~left`,
  ]);
});

test('uma colocação compara e captura vários vizinhos sem combo', () => {
  const weak = { types: ['grass'], edges: { top: 2, right: 2, bottom: 2, left: 2 } };
  const strong = { types: ['fire'], edges: { top: 7, right: 7, bottom: 7, left: 7 } };
  const deckA = makeDeck('a', strong);
  const deckB = makeDeck('b', weak);
  let state = createMatch({ decks: [deckA, deckB], startingPlayer: 1 });

  state = playFirstCard(state, 1).state; // B acima
  state = playFirstCard(state, 8).state; // A longe
  state = playFirstCard(state, 3).state; // B à esquerda
  state = playFirstCard(state, 4).state; // A no centro

  assert.equal(state.board[1].controller, 0);
  assert.equal(state.board[3].controller, 0);
  assert.deepEqual(state.score, [4, 0]);
});

test('snapshot do oponente nunca revela mão nem ordem do monte', () => {
  const state = createMatch({ decks: [makeDeck('a'), makeDeck('b')] });
  const snapshot = projectMatchState(state, 0);

  assert.equal(snapshot.players[0].hand.length, OPENING_HAND_SIZE);
  assert.equal(snapshot.players[0].drawPile, undefined);
  assert.equal(snapshot.players[1].hand, undefined);
  assert.equal(snapshot.players[1].handCount, OPENING_HAND_SIZE);
  assert.equal(snapshot.players[1].drawPileCount, 9);
});

test('nove jogadas encerram a partida com vencedor calculado pelo tabuleiro', () => {
  let state = createMatch({ decks: [makeDeck('a'), makeDeck('b')] });
  for (let cellIndex = 0; cellIndex < BOARD_CELLS; cellIndex += 1) {
    state = playFirstCard(state, cellIndex, {}).state;
  }

  assert.equal(state.status, 'finished');
  assert.deepEqual(state.score, [5, 4]);
  assert.equal(state.winner, 0);
  assert.throws(
    () => playCard(state, { playerIndex: 1, cardId: state.players[1].hand[0].id, cellIndex: 0 }, {}),
    /já terminou/,
  );
});

test('catálogo-protótipo possui vinte Pokémon válidos e matriz cobre os 18 tipos', () => {
  assert.equal(prototypeCatalog.cards.length, 20);
  assert.equal(new Set(prototypeCatalog.cards.map((card) => card.dex)).size, 20);
  assert.equal(Object.keys(typeChart).length, 18);

  for (const definition of prototypeCatalog.cards) {
    validateDeck(Array.from({ length: DECK_SIZE }, (_, index) => makeCard(
      `${definition.id}-${index}`,
      definition,
    )));
  }
});

test('catálogo completo possui os 1025 Pokémon, gerações, variantes e sprites locais', () => {
  const base = fullCatalog.cards.filter((card) => !card.variant);
  assert.equal(fullCatalog.baseCount, 1025);
  assert.equal(base.length, 1025);
  assert.deepEqual(base.map((card) => card.dex), Array.from({ length: 1025 }, (_, index) => index + 1));
  assert.deepEqual([...new Set(base.map((card) => card.generation))], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(fullCatalog.cards.find((card) => card.id === 'pokemon-001').evolvesTo, ['pokemon-002']);
  assert.deepEqual(new Set(fullCatalog.cards.find((card) => card.id === 'pokemon-133').evolvesTo), new Set([
    'pokemon-134', 'pokemon-135', 'pokemon-136', 'pokemon-196',
    'pokemon-197', 'pokemon-470', 'pokemon-471', 'pokemon-700',
  ]));
  assert.equal(new Set(fullCatalog.cards.map((card) => card.id)).size, fullCatalog.cards.length);
  assert.ok(fullCatalog.cards.some((card) => card.id === 'special-ash-pikachu'));
  assert.ok(fullCatalog.cards.some((card) => card.id === 'special-mailman-dragonite'));
  assert.deepEqual(fullCatalog.cards.find((card) => card.id === 'special-casino-pikachu').edges,
    { top: 13, right: 13, bottom: 13, left: 13 });
  assert.deepEqual(fullCatalog.cards.find((card) => card.id === 'special-casino-mewtwo').edges,
    { top: 15, right: 15, bottom: 15, left: 15 });
  const quadra = fullCatalog.cards.find((card) => card.id === 'special-casino-quadra');
  const quina = fullCatalog.cards.find((card) => card.id === 'special-casino-quina');
  assert.deepEqual(quadra.edges, { top: 11, right: 11, bottom: 11, left: 11 });
  assert.deepEqual(quina.edges, { top: 14, right: 14, bottom: 14, left: 14 });
  assert.deepEqual(
    [quadra.dex, quadra.name, quadra.spoonCount, quadra.art],
    [65, 'Alakazam Quadra', 4, 'assets/cardgame/pokemon/065.png'],
  );
  assert.deepEqual(
    [quina.dex, quina.name, quina.spoonCount, quina.art],
    [65, 'Alakazam Quina', 5, 'assets/cardgame/pokemon/065.png'],
  );
  assert.ok(fullCatalog.cards.some((card) => card.id === 'special-slot-gengar'));
  assert.ok(fullCatalog.cards.some((card) => card.id === 'special-slot-charizard'));
  assert.ok(fullCatalog.cards.some((card) => card.id === 'special-slot-porygon'));
  assert.ok(fullCatalog.cards.some((card) => card.id === 'special-blackjack-meowth'));

  for (const card of fullCatalog.cards) {
    assert.equal(card.powerRating, Object.values(card.edges).reduce((sum, value) => sum + value, 0));
    assert.ok(card.types.every((type) => Object.hasOwn(typeChart, type)), `${card.name} tem tipo conhecido`);
    assert.ok((card.evolvesTo || []).every((id) => fullCatalog.cards.some((target) => target.id === id)),
      `${card.name} só aponta para evoluções conhecidas`);
    assert.ok(existsSync(new URL(`../../${card.art}`, import.meta.url)), `sprite existe: ${card.art}`);
  }
  assert.deepEqual(backendCatalog, fullCatalog, 'backend e cliente usam exatamente o mesmo catálogo');
});
