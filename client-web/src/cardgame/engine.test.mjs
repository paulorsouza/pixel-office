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

test('baralho exige nove instâncias únicas', () => {
  assert.equal(validateDeck(makeDeck('a')), true);
  assert.throws(() => validateDeck(makeDeck('a').slice(0, 8)), /exatamente 9/);

  const duplicate = makeDeck('a');
  duplicate[8] = duplicate[0];
  assert.throws(() => validateDeck(duplicate), /repetir a mesma instância/);
});

test('partida começa com mão de seis e monte de três sem alterar o baralho recebido', () => {
  const decks = [makeDeck('a'), makeDeck('b')];
  const original = structuredClone(decks);
  const state = createMatch({ decks, startingPlayer: 1 });

  assert.equal(state.currentPlayer, 1);
  assert.equal(state.board.length, BOARD_CELLS);
  assert.deepEqual(state.players.map((player) => player.hand.length), [OPENING_HAND_SIZE, OPENING_HAND_SIZE]);
  assert.deepEqual(state.players.map((player) => player.drawPile.length), [3, 3]);
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
  assert.equal(result.state.players[0].drawPile.length, 2);
  assert.equal(result.state.currentPlayer, 1);
  assert.equal(state.board[4], null, 'o estado anterior deve permanecer imutável');
});

test('os dois jogadores veem as nove cartas antes da própria última escolha', () => {
  let state = createMatch({ decks: [makeDeck('a'), makeDeck('b')] });
  const seen = state.players.map((player) => new Set(player.hand.map((card) => card.id)));

  for (let cellIndex = 0; cellIndex < 6; cellIndex += 1) {
    const playerIndex = state.currentPlayer;
    const result = playFirstCard(state, cellIndex);
    if (result.drawnCardId) seen[playerIndex].add(result.drawnCardId);
    state = result.state;
  }

  assert.deepEqual(state.players.map((player) => player.drawPile.length), [0, 0]);
  assert.deepEqual(seen.map((cards) => cards.size), [DECK_SIZE, DECK_SIZE]);
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
    edges: { top: 9, right: 4, bottom: 4, left: 4 },
    shinyBonusSide: 'top',
  });

  assert.equal(printedEdge(shiny, 'top'), 10);
  assert.equal(printedEdge(shiny, 'right'), 4);

  const invalid = makeDeck('shiny-invalid');
  invalid[0] = makeCard('shiny-invalid-1', {
    edges: { top: 10, right: 4, bottom: 4, left: 4 },
    shinyBonusSide: 'top',
  });
  assert.throws(() => validateDeck(invalid), /não pode aumentar uma borda 10/);
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
  assert.equal(snapshot.players[1].drawPileCount, 3);
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

test('catálogo completo possui os 151 Pokémon, variantes e sprites locais', () => {
  const base = fullCatalog.cards.filter((card) => !card.variant);
  assert.equal(fullCatalog.baseCount, 151);
  assert.equal(base.length, 151);
  assert.deepEqual(base.map((card) => card.dex), Array.from({ length: 151 }, (_, index) => index + 1));
  assert.equal(new Set(fullCatalog.cards.map((card) => card.id)).size, fullCatalog.cards.length);
  assert.ok(fullCatalog.cards.some((card) => card.id === 'special-ash-pikachu'));
  assert.ok(fullCatalog.cards.some((card) => card.id === 'special-mailman-dragonite'));

  for (const card of fullCatalog.cards) {
    assert.equal(card.powerRating, Object.values(card.edges).reduce((sum, value) => sum + value, 0));
    assert.ok(card.types.every((type) => Object.hasOwn(typeChart, type)), `${card.name} tem tipo conhecido`);
    assert.ok(existsSync(new URL(`../../${card.art}`, import.meta.url)), `sprite existe: ${card.art}`);
  }
  assert.deepEqual(backendCatalog, fullCatalog, 'backend e cliente usam exatamente o mesmo catálogo');
});
