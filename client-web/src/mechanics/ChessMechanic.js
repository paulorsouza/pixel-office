// Mecânica de xadrez em rede. Coloca uma mesa interativa (objeto type=chess no mapa);
// ao chegar perto e apertar E, abre um tabuleiro DOM. Os lances sincronizam pelos
// dois jogadores via SignalR (API de xadrez exposta em window.__presence).
import { registerMechanic } from './MechanicsRegistry.js';
import { initialState, legalMoves, applyMove, replay, status, idx, rc } from '../chess/engine.js';

const TABLE_TEXTURE = 'chess_table';
const GLYPH = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

function injectStyles() {
  if (document.getElementById('chess-styles')) return;
  const s = document.createElement('style');
  s.id = 'chess-styles';
  s.textContent = `
    #chess-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;
      background:rgba(10,12,18,.6);z-index:120;font:13px system-ui}
    #chess-overlay.on{display:flex}
    .chess-panel{background:#1b1e27;border-radius:14px;padding:14px;box-shadow:0 20px 60px #000a}
    .chess-head{display:flex;align-items:center;gap:10px;margin-bottom:10px;color:#e5e7eb}
    .chess-head .spacer{flex:1}
    .chess-status{color:#cbd5e1}
    .chess-btn{background:#2b2f3a;color:#e5e7eb;border:0;border-radius:8px;padding:6px 10px;cursor:pointer}
    .chess-board{display:grid;grid-template-columns:repeat(8,44px);grid-template-rows:repeat(8,44px)}
    .chess-cell{display:flex;align-items:center;justify-content:center;font-size:30px;cursor:pointer;user-select:none;line-height:1}
    .chess-cell.light{background:#e9d9b8}.chess-cell.dark{background:#a9825a}
    .chess-cell.sel{outline:3px solid #7c5cff;outline-offset:-3px}
    .chess-cell.tgt::after{content:'';width:14px;height:14px;border-radius:50%;background:#7c5cff88}
    .chess-piece-w{color:#fff;text-shadow:0 0 2px #000,0 1px 2px #0008}
    .chess-piece-b{color:#111;text-shadow:0 0 1px #fff6}`;
  document.head.append(s);
}

function buildOverlay() {
  let overlay = document.getElementById('chess-overlay');
  if (overlay) return overlay;
  injectStyles();
  overlay = document.createElement('div');
  overlay.id = 'chess-overlay';
  overlay.innerHTML = `
    <div class="chess-panel">
      <div class="chess-head">
        <b>♟ Xadrez</b>
        <span class="chess-status" id="chess-status"></span>
        <span class="spacer"></span>
        <button class="chess-btn" id="chess-reset">Reiniciar</button>
        <button class="chess-btn" id="chess-close">Fechar</button>
      </div>
      <div class="chess-board" id="chess-board"></div>
    </div>`;
  document.body.append(overlay);
  return overlay;
}

registerMechanic('chess', {
  preload({ scene }) {
    if (!scene.textures.exists(TABLE_TEXTURE)) {
      scene.load.image(TABLE_TEXTURE, 'assets/furniture/composites/chess_table.png');
    }
  },
  create({ scene, map, entity, context }) {
    const tile = map.tile || 16;
    const cx = (Number(entity.x) + Number(entity.w) / 2) * tile;
    const cy = (Number(entity.y) + Number(entity.h) / 2) * tile;
    const boardId = entity.properties?.boardId || entity.boardId || entity.id || 'chess';

    // mesa + colisão. Origem no centro-inferior e profundidade por Y, como a mobília:
    // assim o avatar passa por trás e é encoberto ao passar pela frente.
    const bottom = (Number(entity.y) + Number(entity.h)) * tile;
    const table = scene.add.image(cx, bottom, TABLE_TEXTURE)
      .setOrigin(0.5, 1).setDepth(bottom);
    const solid = scene.add.zone(
      (Number(entity.x)) * tile, (Number(entity.y)) * tile, Number(entity.w) * tile, Number(entity.h) * tile,
    ).setOrigin(0, 0);
    scene.physics.add.existing(solid, true);
    context.solids?.add(solid);

    // estado da partida (derivado dos lances)
    let moves = [];
    let myColor = null;
    let selected = null;
    let open = false;

    const presence = () => window.__presence;
    const overlay = buildOverlay();
    const boardEl = () => document.getElementById('chess-board');
    const statusEl = () => document.getElementById('chess-status');

    function currentState() { return replay(moves); }

    function render() {
      const st = currentState();
      const flip = myColor === 'b';
      const board = boardEl();
      if (!board) return;
      board.innerHTML = '';
      const legal = selected != null ? new Set(legalMoves(st, selected).map((m) => m.to)) : new Set();
      for (let vr = 0; vr < 8; vr++) {
        for (let vc = 0; vc < 8; vc++) {
          const i = flip ? idx(7 - vr, 7 - vc) : idx(vr, vc);
          const [r, c] = rc(i);
          const cell = document.createElement('div');
          cell.className = `chess-cell ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
          if (i === selected) cell.classList.add('sel');
          if (legal.has(i)) cell.classList.add('tgt');
          const piece = st.board[i];
          if (piece) {
            cell.textContent = GLYPH[piece];
            cell.classList.add(piece === piece.toUpperCase() ? 'chess-piece-w' : 'chess-piece-b');
          }
          cell.onclick = () => onCell(i);
          board.append(cell);
        }
      }
      const stt = status(st);
      const turnName = st.turn === 'w' ? 'Brancas' : 'Pretas';
      let msg = stt === 'checkmate' ? `Xeque-mate! ${st.turn === 'w' ? 'Pretas' : 'Brancas'} vencem`
        : stt === 'stalemate' ? 'Empate (afogamento)'
        : `Vez: ${turnName}`;
      const you = myColor ? ` · você é ${myColor === 'w' ? 'Brancas' : 'Pretas'}` : ' · espectador';
      if (statusEl()) statusEl().textContent = msg + you;
    }

    function onCell(i) {
      const st = currentState();
      if (status(st) !== 'ongoing') return;
      if (myColor !== st.turn) return;          // não é sua vez
      const piece = st.board[i];
      if (selected == null) {
        if (piece && (piece === piece.toUpperCase() ? 'w' : 'b') === myColor) { selected = i; render(); }
        return;
      }
      const move = legalMoves(st, selected).find((m) => m.to === i);
      if (move) {
        presence()?.chessMove(boardId, selected, i, move.promo || null); // aplica ao receber o echo
        selected = null;
      } else {
        selected = (piece && (piece === piece.toUpperCase() ? 'w' : 'b') === myColor) ? i : null;
        render();
      }
    }

    // eventos de rede
    const onState = (e) => { const d = e.detail; if (d.boardId !== boardId) return; myColor = d.color; moves = (d.moves || []).map((m) => ({ from: m.from, to: m.to, promo: m.promo })); selected = null; render(); };
    const onMoved = (e) => { const d = e.detail; if (d.boardId !== boardId) return; moves.push({ from: d.from, to: d.to, promo: d.promo }); selected = null; render(); };
    const onReset = (e) => { if (e.detail.boardId !== boardId) return; moves = []; selected = null; render(); };
    const onSeats = () => render();

    function bind() {
      const p = presence();
      if (!p) return;
      p.events.addEventListener('ChessState', onState);
      p.events.addEventListener('ChessMoved', onMoved);
      p.events.addEventListener('ChessSeats', onSeats);
      p.events.addEventListener('ChessReset', onReset);
    }
    function unbind() {
      const p = presence();
      if (!p) return;
      p.events.removeEventListener('ChessState', onState);
      p.events.removeEventListener('ChessMoved', onMoved);
      p.events.removeEventListener('ChessSeats', onSeats);
      p.events.removeEventListener('ChessReset', onReset);
    }

    function openBoard() {
      if (open) return;
      open = true;
      scene.chessOpen = true;
      overlay.classList.add('on');
      bind();
      presence()?.chessJoin(boardId);
      document.getElementById('chess-reset').onclick = () => presence()?.chessReset(boardId);
      document.getElementById('chess-close').onclick = closeBoard;
      render();
    }
    function closeBoard() {
      if (!open) return;
      open = false;
      scene.chessOpen = false;
      overlay.classList.remove('on');
      presence()?.chessLeave(boardId);
      unbind();
    }

    const onKey = (e) => {
      if (e.key.toLowerCase() !== 'e') return;
      if (open) return;
      const p = scene.player;
      if (!p) return;
      if (Math.hypot(p.x - cx, p.y - cy) <= tile * 2.2) openBoard();
    };
    window.addEventListener('keydown', onKey);

    let near = false;
    return {
      update() {
        const p = scene.player;
        if (!p) return;
        const isNear = Math.hypot(p.x - cx, p.y - cy) <= tile * 2.2;
        // Realce discreto por proximidade: a mesa não pode "crescer" no chão.
        if (isNear !== near) { near = isNear; table.setTint(near ? 0xfff0c0 : 0xffffff); }
      },
      destroy() {
        window.removeEventListener('keydown', onKey);
        closeBoard();
        table.destroy();
        if (solid.active) solid.destroy();
      },
    };
  },
});
