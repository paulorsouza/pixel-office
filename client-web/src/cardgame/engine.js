// Motor puro do Tooq Triad.
//
// Não conhece DOM, Phaser, REST nem SignalR. O backend continuará sendo a autoridade
// da partida; este módulo permite validar as regras e renderizar snapshots no cliente.

export const BOARD_WIDTH = 3;
export const BOARD_CELLS = BOARD_WIDTH * BOARD_WIDTH;
export const DECK_SIZE = 9;
export const OPENING_HAND_SIZE = 6;

export const SIDES = Object.freeze(['top', 'right', 'bottom', 'left']);

const SIDE_RULES = Object.freeze({
  top: { row: -1, col: 0, opposite: 'bottom' },
  right: { row: 0, col: 1, opposite: 'left' },
  bottom: { row: 1, col: 0, opposite: 'top' },
  left: { row: 0, col: -1, opposite: 'right' },
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function cloneCard(card) {
  return {
    ...card,
    types: [...card.types],
    edges: { ...card.edges },
  };
}

function validateCard(card) {
  invariant(card && typeof card === 'object', 'Carta inválida.');
  invariant(typeof card.id === 'string' && card.id.trim(), 'Carta precisa de um id.');
  invariant(Array.isArray(card.types) && card.types.length >= 1 && card.types.length <= 2,
    `Carta ${card.id} precisa ter um ou dois tipos.`);
  invariant(card.types.every((type) => typeof type === 'string' && type.trim()),
    `Carta ${card.id} possui tipo inválido.`);
  invariant(card.edges && typeof card.edges === 'object', `Carta ${card.id} precisa das quatro bordas.`);

  for (const side of SIDES) {
    const value = card.edges[side];
    invariant(Number.isInteger(value) && value >= 1 && value <= 10,
      `Borda ${side} da carta ${card.id} precisa estar entre 1 e 10.`);
  }

  if (card.shinyBonusSide != null) {
    invariant(SIDES.includes(card.shinyBonusSide), `Bônus shiny inválido na carta ${card.id}.`);
    invariant(card.edges[card.shinyBonusSide] < 10,
      `Bônus shiny da carta ${card.id} não pode aumentar uma borda 10.`);
  }
}

export function validateDeck(deck) {
  invariant(Array.isArray(deck), 'Baralho inválido.');
  invariant(deck.length === DECK_SIZE, `O baralho precisa ter exatamente ${DECK_SIZE} cartas.`);
  deck.forEach(validateCard);
  invariant(new Set(deck.map((card) => card.id)).size === deck.length,
    'O baralho não pode repetir a mesma instância.');
  return true;
}

function validateMatchDecks(decks) {
  invariant(Array.isArray(decks) && decks.length === 2, 'A partida precisa de dois baralhos.');
  decks.forEach(validateDeck);
  const allIds = decks.flat().map((card) => card.id);
  invariant(new Set(allIds).size === allIds.length,
    'A mesma instância não pode pertencer aos dois jogadores.');
}

export function printedEdge(card, side) {
  invariant(SIDES.includes(side), `Lado inválido: ${side}.`);
  return card.edges[side] + (card.shinyBonusSide === side ? 1 : 0);
}

export function hasTypeAdvantage(attackerTypes, defenderTypes, typeChart) {
  return attackerTypes.some((attackerType) => {
    const strongAgainst = typeChart[attackerType] || [];
    return defenderTypes.some((defenderType) => strongAgainst.includes(defenderType));
  });
}

export function compareCards(attacker, attackSide, defender, typeChart) {
  const defenseSide = SIDE_RULES[attackSide].opposite;
  const attackBase = printedEdge(attacker, attackSide);
  const defenseBase = printedEdge(defender, defenseSide);
  const attackTypeBonus = hasTypeAdvantage(attacker.types, defender.types, typeChart) ? 1 : 0;
  const defenseTypeBonus = hasTypeAdvantage(defender.types, attacker.types, typeChart) ? 1 : 0;
  const attackTotal = attackBase + attackTypeBonus;
  const defenseTotal = defenseBase + defenseTypeBonus;

  return {
    attackSide,
    defenseSide,
    attackBase,
    defenseBase,
    attackTypeBonus,
    defenseTypeBonus,
    attackTotal,
    defenseTotal,
    captured: attackTotal > defenseTotal,
  };
}

export function createMatch({ decks, startingPlayer = 0 }) {
  validateMatchDecks(decks);
  invariant(startingPlayer === 0 || startingPlayer === 1, 'Jogador inicial inválido.');

  const players = decks.map((deck) => {
    const cards = deck.map(cloneCard);
    return {
      hand: cards.slice(0, OPENING_HAND_SIZE),
      drawPile: cards.slice(OPENING_HAND_SIZE),
    };
  });

  return {
    board: new Array(BOARD_CELLS).fill(null),
    players,
    startingPlayer,
    currentPlayer: startingPlayer,
    turn: 0,
    status: 'ongoing',
    winner: null,
    score: [0, 0],
  };
}

function cloneState(state) {
  return {
    ...state,
    board: state.board.map((cell) => (cell ? { ...cell, card: cloneCard(cell.card) } : null)),
    players: state.players.map((player) => ({
      hand: player.hand.map(cloneCard),
      drawPile: player.drawPile.map(cloneCard),
    })),
    score: [...state.score],
  };
}

function neighborIndex(cellIndex, side) {
  const row = Math.floor(cellIndex / BOARD_WIDTH);
  const col = cellIndex % BOARD_WIDTH;
  const rule = SIDE_RULES[side];
  const neighborRow = row + rule.row;
  const neighborCol = col + rule.col;
  if (neighborRow < 0 || neighborRow >= BOARD_WIDTH || neighborCol < 0 || neighborCol >= BOARD_WIDTH) {
    return null;
  }
  return neighborRow * BOARD_WIDTH + neighborCol;
}

export function scoreBoard(board) {
  return board.reduce((score, cell) => {
    if (cell) score[cell.controller] += 1;
    return score;
  }, [0, 0]);
}

export function playCard(state, { playerIndex, cardId, cellIndex }, typeChart) {
  invariant(state.status === 'ongoing', 'A partida já terminou.');
  invariant(playerIndex === state.currentPlayer, 'Não é a vez deste jogador.');
  invariant(Number.isInteger(cellIndex) && cellIndex >= 0 && cellIndex < BOARD_CELLS,
    'Casa inválida.');
  invariant(state.board[cellIndex] == null, 'A casa já está ocupada.');

  const next = cloneState(state);
  const player = next.players[playerIndex];
  const handIndex = player.hand.findIndex((card) => card.id === cardId);
  invariant(handIndex >= 0, 'A carta não está na mão do jogador.');
  const [card] = player.hand.splice(handIndex, 1);
  next.board[cellIndex] = { card, controller: playerIndex };

  const comparisons = [];
  for (const side of SIDES) {
    const adjacentIndex = neighborIndex(cellIndex, side);
    if (adjacentIndex == null) continue;
    const adjacent = next.board[adjacentIndex];
    if (!adjacent || adjacent.controller === playerIndex) continue;

    const comparison = compareCards(card, side, adjacent.card, typeChart);
    comparisons.push({ ...comparison, adjacentIndex });
    if (comparison.captured) adjacent.controller = playerIndex;
  }

  let drawnCard = null;
  if (player.drawPile.length > 0) {
    drawnCard = player.drawPile.shift();
    player.hand.push(drawnCard);
  }

  next.turn += 1;
  next.score = scoreBoard(next.board);
  if (next.turn === BOARD_CELLS) {
    next.status = 'finished';
    next.winner = next.score[0] > next.score[1] ? 0 : 1;
  } else {
    next.currentPlayer = playerIndex === 0 ? 1 : 0;
  }

  return {
    state: next,
    comparisons,
    drawnCardId: drawnCard?.id || null,
  };
}

export function projectMatchState(state, viewerIndex) {
  invariant(viewerIndex === 0 || viewerIndex === 1, 'Visualizador inválido.');

  return {
    board: state.board.map((cell) => (cell ? {
      card: cloneCard(cell.card),
      controller: cell.controller,
    } : null)),
    players: state.players.map((player, playerIndex) => {
      if (playerIndex === viewerIndex) {
        return {
          hand: player.hand.map(cloneCard),
          handCount: player.hand.length,
          drawPileCount: player.drawPile.length,
        };
      }
      return {
        handCount: player.hand.length,
        drawPileCount: player.drawPile.length,
      };
    }),
    startingPlayer: state.startingPlayer,
    currentPlayer: state.currentPlayer,
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    score: [...state.score],
  };
}
