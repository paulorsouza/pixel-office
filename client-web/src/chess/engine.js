// Engine de xadrez pura (sem UI/rede) — testável isoladamente em Node.
// Casas indexadas 0..63: index = r*8 + c, com r=0 na 8ª fileira (topo) e c=0 no arquivo 'a'.
// Peças: brancas maiúsculas (PNBRQK), pretas minúsculas (pnbrqk), '' vazio.

export const WHITE = 'w';
export const BLACK = 'b';

const isWhite = (p) => p && p === p.toUpperCase();
const colorOf = (p) => (p ? (isWhite(p) ? WHITE : BLACK) : null);
export const rc = (i) => [Math.floor(i / 8), i % 8];
export const idx = (r, c) => r * 8 + c;
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

export function initialState() {
  const back = 'rnbqkbnr';
  const board = new Array(64).fill('');
  for (let c = 0; c < 8; c++) {
    board[idx(0, c)] = back[c];         // pretas em cima
    board[idx(1, c)] = 'p';
    board[idx(6, c)] = 'P';
    board[idx(7, c)] = back[c].toUpperCase();
  }
  return { board, turn: WHITE, castling: { K: true, Q: true, k: true, q: true }, ep: null };
}

const DIRS = {
  N: [[-1, 0], [1, 0], [0, -1], [0, 1]],
  B: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  Kn: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]],
};
DIRS.Q = [...DIRS.N, ...DIRS.B];

// Movimentos pseudo-legais (sem checar xeque) da peça em `from`.
function pseudoMoves(state, from) {
  const { board, ep } = state;
  const piece = board[from];
  if (!piece) return [];
  const color = colorOf(piece);
  const [r, c] = rc(from);
  const type = piece.toUpperCase();
  const moves = [];
  const add = (r2, c2, extra = {}) => moves.push({ from, to: idx(r2, c2), ...extra });
  const enemy = (r2, c2) => inside(r2, c2) && board[idx(r2, c2)] && colorOf(board[idx(r2, c2)]) !== color;
  const empty = (r2, c2) => inside(r2, c2) && !board[idx(r2, c2)];

  if (type === 'P') {
    const dir = color === WHITE ? -1 : 1;
    const start = color === WHITE ? 6 : 1;
    const promoRow = color === WHITE ? 0 : 7;
    if (empty(r + dir, c)) {
      if (r + dir === promoRow) add(r + dir, c, { promo: 'q' }); else add(r + dir, c);
      if (r === start && empty(r + 2 * dir, c)) add(r + 2 * dir, c, { double: true });
    }
    for (const dc of [-1, 1]) {
      const r2 = r + dir, c2 = c + dc;
      if (enemy(r2, c2)) {
        if (r2 === promoRow) add(r2, c2, { promo: 'q' }); else add(r2, c2);
      } else if (ep != null && idx(r2, c2) === ep && inside(r2, c2)) {
        add(r2, c2, { ep: true });
      }
    }
  } else if (type === 'N') {
    for (const [dr, dc] of DIRS.Kn) {
      const r2 = r + dr, c2 = c + dc;
      if (inside(r2, c2) && (empty(r2, c2) || enemy(r2, c2))) add(r2, c2);
    }
  } else if (type === 'K') {
    for (const [dr, dc] of DIRS.Q) {
      const r2 = r + dr, c2 = c + dc;
      if (inside(r2, c2) && (empty(r2, c2) || enemy(r2, c2))) add(r2, c2);
    }
    // roque (validação de passagem por xeque em legalMoves)
    const rights = state.castling;
    const homeRow = color === WHITE ? 7 : 0;
    if (r === homeRow && c === 4) {
      const kSide = color === WHITE ? rights.K : rights.k;
      const qSide = color === WHITE ? rights.Q : rights.q;
      if (kSide && empty(homeRow, 5) && empty(homeRow, 6) && board[idx(homeRow, 7)]?.toUpperCase() === 'R') add(homeRow, 6, { castle: 'K' });
      if (qSide && empty(homeRow, 3) && empty(homeRow, 2) && empty(homeRow, 1) && board[idx(homeRow, 0)]?.toUpperCase() === 'R') add(homeRow, 2, { castle: 'Q' });
    }
  } else {
    const dirs = type === 'R' ? DIRS.N : type === 'B' ? DIRS.B : DIRS.Q;
    for (const [dr, dc] of dirs) {
      let r2 = r + dr, c2 = c + dc;
      while (empty(r2, c2)) { add(r2, c2); r2 += dr; c2 += dc; }
      if (enemy(r2, c2)) add(r2, c2);
    }
  }
  return moves;
}

// A casa `sq` está atacada por `byColor`?
function attacked(board, sq, byColor) {
  const [r, c] = rc(sq);
  const pawnDir = byColor === WHITE ? -1 : 1; // peão que ataca vem da direção oposta
  for (const dc of [-1, 1]) {
    const r2 = r - pawnDir, c2 = c + dc;
    if (inside(r2, c2) && board[idx(r2, c2)] === (byColor === WHITE ? 'P' : 'p')) return true;
  }
  for (const [dr, dc] of DIRS.Kn) {
    const r2 = r + dr, c2 = c + dc;
    if (inside(r2, c2) && board[idx(r2, c2)]?.toUpperCase() === 'N' && colorOf(board[idx(r2, c2)]) === byColor) return true;
  }
  for (const [dr, dc] of DIRS.Q) {
    const r2 = r + dr, c2 = c + dc;
    if (inside(r2, c2) && board[idx(r2, c2)]?.toUpperCase() === 'K' && colorOf(board[idx(r2, c2)]) === byColor) return true;
  }
  const ray = (dirs, types) => {
    for (const [dr, dc] of dirs) {
      let r2 = r + dr, c2 = c + dc;
      while (inside(r2, c2)) {
        const p = board[idx(r2, c2)];
        if (p) { if (colorOf(p) === byColor && types.includes(p.toUpperCase())) return true; break; }
        r2 += dr; c2 += dc;
      }
    }
    return false;
  };
  if (ray(DIRS.N, ['R', 'Q'])) return true;
  if (ray(DIRS.B, ['B', 'Q'])) return true;
  return false;
}

function kingSquare(board, color) {
  const k = color === WHITE ? 'K' : 'k';
  return board.indexOf(k);
}

export function isInCheck(state, color) {
  return attacked(state.board, kingSquare(state.board, color), color === WHITE ? BLACK : WHITE);
}

// Aplica um movimento e devolve um novo estado (deriva roque/en-passant/promoção).
export function applyMove(state, move) {
  const board = state.board.slice();
  const castling = { ...state.castling };
  const piece = board[move.from];
  const color = colorOf(piece);
  const type = piece.toUpperCase();
  const [fr, fc] = rc(move.from);
  const [tr, tc] = rc(move.to);
  let ep = null;

  // en passant: captura o peão que passou
  if (type === 'P' && tc !== fc && !board[move.to]) board[idx(fr, tc)] = '';
  // peão dobrado gera alvo de en passant
  if (type === 'P' && Math.abs(tr - fr) === 2) ep = idx((fr + tr) / 2, fc);

  board[move.to] = piece;
  board[move.from] = '';

  // promoção
  if (type === 'P' && (tr === 0 || tr === 7)) {
    const promo = (move.promo || 'q');
    board[move.to] = color === WHITE ? promo.toUpperCase() : promo.toLowerCase();
  }
  // roque: move a torre
  if (type === 'K' && Math.abs(tc - fc) === 2) {
    const row = fr;
    if (tc === 6) { board[idx(row, 5)] = board[idx(row, 7)]; board[idx(row, 7)] = ''; }
    else { board[idx(row, 3)] = board[idx(row, 0)]; board[idx(row, 0)] = ''; }
  }
  // atualiza direitos de roque
  if (type === 'K') { if (color === WHITE) { castling.K = castling.Q = false; } else { castling.k = castling.q = false; } }
  const touchRook = (sq) => {
    if (sq === idx(7, 0)) castling.Q = false; if (sq === idx(7, 7)) castling.K = false;
    if (sq === idx(0, 0)) castling.q = false; if (sq === idx(0, 7)) castling.k = false;
  };
  touchRook(move.from); touchRook(move.to);

  return { board, turn: color === WHITE ? BLACK : WHITE, castling, ep };
}

// Movimentos legais (não deixam o próprio rei em xeque) da peça em `from`.
export function legalMoves(state, from) {
  const piece = state.board[from];
  if (!piece || colorOf(piece) !== state.turn) return [];
  const color = state.turn;
  const enemy = color === WHITE ? BLACK : WHITE;
  const result = [];
  for (const move of pseudoMoves(state, from)) {
    // roque não pode sair de/atravessar xeque
    if (move.castle) {
      const [row] = rc(from);
      if (isInCheck(state, color)) continue;
      const through = move.castle === 'K' ? [5, 6] : [3, 2];
      if (through.some((c) => attacked(state.board, idx(row, c), enemy))) continue;
    }
    const next = applyMove(state, move);
    if (!attacked(next.board, kingSquare(next.board, color), enemy)) result.push(move);
  }
  return result;
}

export function allLegalMoves(state) {
  const moves = [];
  for (let i = 0; i < 64; i++) if (colorOf(state.board[i]) === state.turn) moves.push(...legalMoves(state, i));
  return moves;
}

export function status(state) {
  if (allLegalMoves(state).length > 0) return 'ongoing';
  return isInCheck(state, state.turn) ? 'checkmate' : 'stalemate';
}

// Reaplica uma lista de lances {from,to,promo} sobre a posição inicial (para sync).
export function replay(moves) {
  let state = initialState();
  for (const m of moves) {
    const legal = legalMoves(state, m.from).find((x) => x.to === m.to);
    if (!legal) return state; // lance inválido interrompe (defensivo)
    state = applyMove(state, { ...legal, promo: m.promo || legal.promo });
  }
  return state;
}
