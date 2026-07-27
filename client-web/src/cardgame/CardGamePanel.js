const DECK_STORAGE_KEY = 'office-quest-cardgame-deck-v1';
const DEFAULT_DECK = [
  'pokemon-001',
  'pokemon-004',
  'pokemon-007',
  'pokemon-025',
  'pokemon-035',
  'pokemon-092',
  'pokemon-095',
  'pokemon-131',
  'pokemon-143',
];

const RARITY_LABELS = {
  Common: 'Comum',
  Uncommon: 'Incomum',
  Rare: 'Rara',
  Epic: 'Épica',
  Legendary: 'Lendária',
  Special: 'Especial',
};

const TYPE_LABELS = {
  normal: 'Normal', fire: 'Fogo', water: 'Água', electric: 'Elétrico',
  grass: 'Planta', ice: 'Gelo', fighting: 'Lutador', poison: 'Veneno',
  ground: 'Terra', flying: 'Voador', psychic: 'Psíquico', bug: 'Inseto',
  rock: 'Pedra', ghost: 'Fantasma', dragon: 'Dragão', dark: 'Sombrio',
  steel: 'Aço', fairy: 'Fada',
};

function injectStyles() {
  if (document.getElementById('cardgame-styles')) return;
  const style = document.createElement('style');
  style.id = 'cardgame-styles';
  style.textContent = `
    :root{--cg-bg:#101528;--cg-panel:#1a2140;--cg-ink:#f8f4e8;--cg-muted:#aab4d2;
      --cg-accent:#7868ff;--cg-gold:#f4c960;--cg-p1:#56b7ff;--cg-p2:#ff5f8f}
    .cg-hidden{display:none!important}
    .cg-btn{border:1px solid #ffffff25;border-radius:9px;padding:8px 12px;color:#fff;background:#2c355f;
      cursor:pointer;font:700 12px Inter,system-ui,sans-serif;box-shadow:inset 0 -2px #0004}
    .cg-btn:hover{filter:brightness(1.15)}.cg-btn.primary{background:#6857ee}.cg-btn.danger{background:#8f3854}
    #cardgame-deck-button{position:fixed;right:16px;top:16px;z-index:35;display:flex;align-items:center;gap:7px;
      border:1px solid #ffffff2b;border-radius:12px;padding:9px 12px;color:#fff;background:#171923e8;
      box-shadow:0 9px 25px #0005;cursor:pointer;font:800 12px Inter,system-ui,sans-serif}
    #cardgame-player-menu{position:fixed;z-index:130;min-width:210px;padding:10px;border:1px solid #ffffff2d;
      border-radius:14px;color:#fff;background:#151a2ef5;box-shadow:0 18px 55px #000a;
      font-family:Inter,system-ui,sans-serif;backdrop-filter:blur(12px)}
    .cg-player-head{display:flex;align-items:center;gap:9px;margin-bottom:9px}
    .cg-player-avatar{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;
      background:linear-gradient(135deg,#7b68ff,#43b9d0);font-weight:900}
    .cg-player-head strong{display:block;font-size:13px}.cg-player-head small{color:#aeb9d8;font-size:10px}
    .cg-player-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}
    #cardgame-invite{position:fixed;left:50%;top:18px;z-index:145;width:min(390px,calc(100vw - 28px));
      transform:translateX(-50%);padding:14px;border:2px solid #8e7dff;border-radius:15px;color:#fff;
      background:#171d38f5;box-shadow:0 20px 60px #000b;font-family:Inter,system-ui,sans-serif}
    #cardgame-invite strong{display:block;margin-bottom:3px;font-size:14px}
    #cardgame-invite p{margin:0 0 11px;color:#b9c3df;font-size:11px}
    .cg-invite-actions{display:flex;justify-content:flex-end;gap:7px}
    .cg-overlay{position:fixed;inset:0;z-index:140;display:flex;align-items:center;justify-content:center;
      padding:16px;background:#080b17dc;backdrop-filter:blur(7px);font-family:Inter,system-ui,sans-serif}
    .cg-window{position:relative;width:min(1120px,100%);max-height:calc(100dvh - 32px);overflow:hidden;
      border:2px solid #ffffff24;border-radius:20px;color:var(--cg-ink);
      background:linear-gradient(145deg,#20294d,#11162b 65%);box-shadow:0 28px 100px #000d}
    .cg-window-head{display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid #ffffff1c;
      background:#ffffff07}.cg-window-head h2{margin:0;font-size:17px}.cg-window-head span{color:#aeb8d7;font-size:11px}
    .cg-window-head .spacer{flex:1}
    .cg-deck-body{display:grid;grid-template-columns:250px 1fr;min-height:540px;max-height:calc(100dvh - 95px)}
    .cg-deck-slots{overflow:auto;padding:12px;border-right:1px solid #ffffff1b;background:#0c1122aa}
    .cg-deck-slots h3,.cg-collection h3{margin:0 0 9px;font-size:12px;text-transform:uppercase;letter-spacing:.08em}
    .cg-deck-slot{display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:6px;border:1px solid #ffffff18;
      border-radius:9px;background:#202947}.cg-deck-slot img{width:38px;height:38px;image-rendering:pixelated}
    .cg-deck-slot strong{flex:1;font-size:10px}.cg-deck-slot button{border:0;color:#ffb4c7;background:transparent;cursor:pointer}
    .cg-deck-count{margin-bottom:10px;color:#c7d0eb;font-size:11px}.cg-deck-count.valid{color:#73e1a0}
    .cg-collection{min-width:0;overflow:auto;padding:12px}
    .cg-filters{display:flex;gap:7px;margin-bottom:10px}.cg-filters input,.cg-filters select{min-width:0;
      border:1px solid #ffffff20;border-radius:8px;padding:8px;color:#fff;background:#11172c}
    .cg-filters input{flex:1}
    .cg-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(126px,1fr));gap:10px}
    .cg-card{position:relative;display:grid;grid-template-rows:auto 1fr auto;min-width:0;aspect-ratio:3/4;
      overflow:hidden;border:3px solid #536184;border-radius:12px;color:#fff;background:
      radial-gradient(circle at 50% 38%,#ffffff18,transparent 42%),linear-gradient(160deg,#28345d,#12182d);
      box-shadow:inset 0 0 0 1px #ffffff1c,0 7px 15px #0006;user-select:none}
    button.cg-card{width:100%;padding:0;cursor:pointer;text-align:initial}
    .cg-card.selected{outline:3px solid #7dffbf;transform:translateY(-2px)}
    .cg-card[data-rarity="Uncommon"]{border-color:#57bc83}.cg-card[data-rarity="Rare"]{border-color:#4ca8ed}
    .cg-card[data-rarity="Epic"]{border-color:#b96af1}.cg-card[data-rarity="Legendary"]{border-color:#f4c54f}
    .cg-card[data-rarity="Special"]{border-color:#ff77d7;box-shadow:0 0 18px #ff54c777,inset 0 0 20px #55dfff22}
    .cg-card-head{display:flex;align-items:center;gap:4px;padding:6px 7px 3px}
    .cg-card-head strong{min-width:0;overflow:hidden;flex:1;font-size:9px;text-overflow:ellipsis;white-space:nowrap}
    .cg-card-head small{color:#c7d0e6;font-size:7px}
    .cg-card-art{display:grid;place-items:center;min-height:0;margin:0 8px;border:1px solid #ffffff1b;
      border-radius:8px;background:radial-gradient(circle,#dbeaff22,#0b1022 70%)}
    .cg-card-art img{width:min(84%,96px);height:min(84%,96px);object-fit:contain;image-rendering:pixelated;
      filter:drop-shadow(0 5px 4px #0008)}
    .cg-card-types{display:flex;gap:3px;padding:4px 6px 6px}.cg-type{padding:2px 4px;border-radius:5px;
      color:#fff;background:#5b6688;font-size:6px;text-transform:uppercase}
    .cg-edge{position:absolute;z-index:2;display:grid;place-items:center;width:24px;height:24px;border:2px solid #0a0d18;
      border-radius:8px;color:#fff;background:#2f3a65;box-shadow:inset 0 0 0 1px #ffffff30;font:900 11px monospace}
    .cg-edge.top{left:50%;top:25px;transform:translateX(-50%)}.cg-edge.right{right:3px;top:50%;transform:translateY(-50%)}
    .cg-edge.bottom{left:50%;bottom:20px;transform:translateX(-50%)}.cg-edge.left{left:3px;top:50%;transform:translateY(-50%)}
    .cg-match-window{width:min(1180px,100%);height:min(760px,calc(100dvh - 24px));overflow:auto}
    .cg-match{display:grid;grid-template-rows:auto 1fr auto;height:100%}
    .cg-match-top{display:flex;align-items:center;gap:10px;padding:10px 15px;border-bottom:1px solid #ffffff18}
    .cg-score{display:flex;gap:7px;font-weight:900}.cg-score b{padding:5px 9px;border-radius:8px;background:#ffffff12}
    .cg-score .p1{color:var(--cg-p1)}.cg-score .p2{color:var(--cg-p2)}
    .cg-turn{flex:1;text-align:center;color:#f8d977;font-size:12px;font-weight:900;text-transform:uppercase}
    .cg-arena{display:grid;grid-template-columns:minmax(370px,480px) minmax(280px,1fr);gap:16px;align-items:center;
      min-height:0;padding:14px}
    .cg-board{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;width:min(68vh,100%);aspect-ratio:1;margin:auto;
      padding:9px;border:2px solid #7783ad;border-radius:18px;background:
      linear-gradient(45deg,#ffffff06 25%,transparent 25% 75%,#ffffff06 75%) 0 0/24px 24px,#090e20}
    .cg-cell{position:relative;display:grid;place-items:center;overflow:hidden;border:1px solid #ffffff1b;
      border-radius:12px;background:#20294a;cursor:pointer}.cg-cell:hover{background:#2a3560}
    .cg-cell .cg-card{width:90%;height:90%;aspect-ratio:auto;animation:cg-place .25s ease-out}
    .cg-cell.controller-0{box-shadow:inset 0 0 0 3px var(--cg-p1)}.cg-cell.controller-1{box-shadow:inset 0 0 0 3px var(--cg-p2)}
    @keyframes cg-place{from{transform:scale(.65) rotate(-4deg);opacity:.2}to{transform:scale(1);opacity:1}}
    .cg-hand-zone{min-width:0}.cg-opponent{margin-bottom:18px;padding:10px;border:1px solid #ffffff18;
      border-radius:12px;background:#10162aaa}.cg-opponent strong{font-size:13px}.cg-opponent small{color:#aeb8d5}
    .cg-card-backs{display:flex;margin-top:8px}.cg-back{width:34px;height:48px;margin-right:-13px;border:2px solid #7567da;
      border-radius:6px;background:radial-gradient(circle,#8e80ff 0 18%,#262e5d 19% 35%,#11162c 36%)}
    .cg-hand-title{display:flex;justify-content:space-between;margin-bottom:8px;color:#dfe5f6;font-size:11px}
    .cg-hand{display:grid;grid-template-columns:repeat(6,minmax(76px,1fr));gap:7px}
    .cg-hand .cg-card{aspect-ratio:3/4}.cg-hand .cg-card.disabled{cursor:not-allowed;filter:grayscale(.45) brightness(.7)}
    .cg-hand .cg-edge{width:20px;height:20px;border-radius:6px;font-size:9px}
    .cg-hand .cg-card-head strong{font-size:7px}.cg-hand .cg-card-head small{font-size:6px}
    .cg-hand .cg-card-types{display:none}
    .cg-result{padding:9px;text-align:center;border-radius:10px;background:#ffffff10;font-size:15px;font-weight:900}
    @media(max-width:760px){.cg-deck-body{grid-template-columns:1fr}.cg-deck-slots{max-height:190px;border-right:0;border-bottom:1px solid #ffffff1b}
      .cg-arena{grid-template-columns:1fr}.cg-board{width:min(46vh,100%)}.cg-hand{grid-template-columns:repeat(3,1fr)}
      .cg-match-window{height:calc(100dvh - 12px)}.cg-card-grid{grid-template-columns:repeat(3,minmax(95px,1fr))}}
  `;
  document.head.append(style);
}

function createRoots() {
  injectStyles();
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <button id="cardgame-deck-button" type="button">🃏 Cartas</button>
    <div id="cardgame-player-menu" class="cg-hidden"></div>
    <div id="cardgame-invite" class="cg-hidden"></div>
    <div id="cardgame-deck-overlay" class="cg-overlay cg-hidden"></div>
    <div id="cardgame-match-overlay" class="cg-overlay cg-hidden"></div>`;
  document.body.append(...wrapper.children);
}

function cardMarkup(card, { button = false, selected = false, disabled = false } = {}) {
  const tag = button ? 'button type="button"' : 'div';
  const closeTag = button ? 'button' : 'div';
  return `<${tag} class="cg-card${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}" data-card-id="${card.id}" data-rarity="${card.rarity}">
    <div class="cg-card-head"><strong>${card.name}</strong><small>#${String(card.dex).padStart(3, '0')}</small></div>
    <span class="cg-edge top">${card.edges.top}</span><span class="cg-edge right">${card.edges.right}</span>
    <span class="cg-edge bottom">${card.edges.bottom}</span><span class="cg-edge left">${card.edges.left}</span>
    <div class="cg-card-art"><img src="${card.art}" alt="${card.name}" draggable="false"></div>
    <div class="cg-card-types">${card.types.map((type) => `<span class="cg-type">${TYPE_LABELS[type] || type}</span>`).join('')}</div>
  </${closeTag}>`;
}

export function createCardGamePanel({ presence, catalog, onToast = () => {} }) {
  createRoots();
  const cards = catalog.cards || [];
  const byId = new Map(cards.map((card) => [card.id, card]));
  const menu = document.getElementById('cardgame-player-menu');
  const invite = document.getElementById('cardgame-invite');
  const deckOverlay = document.getElementById('cardgame-deck-overlay');
  const matchOverlay = document.getElementById('cardgame-match-overlay');
  let deck = loadDeck();
  let deckDraft = [...deck];
  let matchState = null;
  let selectedCardId = null;
  let pendingMove = false;

  function validDeck(candidate) {
    return Array.isArray(candidate) && candidate.length === 9
      && new Set(candidate).size === 9 && candidate.every((id) => byId.has(id));
  }

  function loadDeck() {
    try {
      const stored = JSON.parse(localStorage.getItem(DECK_STORAGE_KEY));
      if (validDeck(stored)) return stored;
    } catch {
      // Usa o inicial.
    }
    return [...DEFAULT_DECK];
  }

  function saveDeck() {
    if (!validDeck(deckDraft)) return;
    deck = [...deckDraft];
    localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(deck));
    onToast('Baralho de 9 cartas salvo');
    closeDeck();
  }

  function openDeck() {
    closePlayerMenu();
    deckDraft = [...deck];
    renderDeck();
    deckOverlay.classList.remove('cg-hidden');
  }

  function closeDeck() {
    deckOverlay.classList.add('cg-hidden');
  }

  function renderDeck(filter = '', type = '') {
    const normalized = filter.trim().toLowerCase();
    const visible = cards.filter((card) => (
      (!normalized || card.name.toLowerCase().includes(normalized) || String(card.dex).includes(normalized))
      && (!type || card.types.includes(type))
    ));
    deckOverlay.innerHTML = `
      <section class="cg-window">
        <header class="cg-window-head"><h2>Seu baralho</h2><span>Escolha 9 cartas</span><i class="spacer"></i>
          <button class="cg-btn" data-action="close">Fechar</button>
          <button class="cg-btn primary" data-action="save"${deckDraft.length === 9 ? '' : ' disabled'}>Salvar</button>
        </header>
        <div class="cg-deck-body">
          <aside class="cg-deck-slots"><h3>Baralho ativo</h3>
            <div class="cg-deck-count${deckDraft.length === 9 ? ' valid' : ''}">${deckDraft.length}/9 cartas</div>
            ${deckDraft.map((id, index) => {
              const card = byId.get(id);
              return `<div class="cg-deck-slot"><img src="${card.art}" alt=""><strong>${index + 1}. ${card.name}</strong>
                <button type="button" data-remove="${id}" aria-label="Remover ${card.name}">✕</button></div>`;
            }).join('')}
          </aside>
          <main class="cg-collection"><h3>151 Pokémon + variantes</h3>
            <div class="cg-filters"><input id="cg-card-search" placeholder="Buscar nome ou número" value="${filter}">
              <select id="cg-type-filter"><option value="">Todos os tipos</option>${Object.entries(TYPE_LABELS)
                .map(([key, label]) => `<option value="${key}"${key === type ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
            <div class="cg-card-grid">${visible.map((card) => cardMarkup(card, {
              button: true,
              selected: deckDraft.includes(card.id),
              disabled: deckDraft.length >= 9 && !deckDraft.includes(card.id),
            })).join('')}</div>
          </main>
        </div>
      </section>`;
    deckOverlay.querySelector('[data-action="close"]').onclick = closeDeck;
    deckOverlay.querySelector('[data-action="save"]').onclick = saveDeck;
    deckOverlay.querySelectorAll('[data-remove]').forEach((button) => {
      button.onclick = () => {
        deckDraft = deckDraft.filter((id) => id !== button.dataset.remove);
        renderDeck(
          deckOverlay.querySelector('#cg-card-search')?.value || '',
          deckOverlay.querySelector('#cg-type-filter')?.value || '',
        );
      };
    });
    deckOverlay.querySelectorAll('.cg-card[data-card-id]').forEach((button) => {
      button.onclick = () => {
        const id = button.dataset.cardId;
        if (deckDraft.includes(id)) deckDraft = deckDraft.filter((entry) => entry !== id);
        else if (deckDraft.length < 9) deckDraft.push(id);
        renderDeck(
          deckOverlay.querySelector('#cg-card-search')?.value || '',
          deckOverlay.querySelector('#cg-type-filter')?.value || '',
        );
      };
    });
    const search = deckOverlay.querySelector('#cg-card-search');
    const typeFilter = deckOverlay.querySelector('#cg-type-filter');
    search.oninput = () => renderDeck(search.value, typeFilter.value);
    typeFilter.onchange = () => renderDeck(search.value, typeFilter.value);
  }

  function openPlayerMenu(peer, pointer) {
    menu.innerHTML = `<div class="cg-player-head"><span class="cg-player-avatar">${peer.name.slice(0, 1).toUpperCase()}</span>
      <div><strong>${peer.name}</strong><small>Jogador próximo</small></div></div>
      <div class="cg-player-actions"><button class="cg-btn primary" data-action="challenge">⚔ Desafiar</button>
      <button class="cg-btn" data-action="deck">🃏 Baralho</button></div>`;
    menu.style.left = `${Math.min(pointer.x + 12, innerWidth - 230)}px`;
    menu.style.top = `${Math.min(pointer.y + 12, innerHeight - 120)}px`;
    menu.classList.remove('cg-hidden');
    menu.querySelector('[data-action="challenge"]').onclick = () => {
      presence.cardGameChallenge(peer.key, deck);
      onToast(`Desafio enviado para ${peer.name}`);
      closePlayerMenu();
    };
    menu.querySelector('[data-action="deck"]').onclick = openDeck;
  }

  function closePlayerMenu() {
    menu.classList.add('cg-hidden');
  }

  function showInvite(data) {
    invite.innerHTML = `<strong>⚔ ${data.fromName} desafiou você!</strong>
      <p>Cardgame 3×3 · baralho de 9 · mão de 6</p>
      <div class="cg-invite-actions"><button class="cg-btn" data-action="decline">Agora não</button>
      <button class="cg-btn primary" data-action="accept">Aceitar duelo</button></div>`;
    invite.classList.remove('cg-hidden');
    invite.querySelector('[data-action="decline"]').onclick = () => {
      presence.cardGameDecline(data.challengeId);
      invite.classList.add('cg-hidden');
    };
    invite.querySelector('[data-action="accept"]').onclick = () => {
      presence.cardGameAccept(data.challengeId, deck);
      invite.classList.add('cg-hidden');
    };
    setTimeout(() => invite.classList.add('cg-hidden'), 45000);
  }

  function renderMatch() {
    if (!matchState) return;
    const mine = matchState.playerIndex;
    const opponent = mine === 0 ? 1 : 0;
    const myTurn = matchState.status === 'ongoing' && matchState.currentPlayer === mine;
    const result = matchState.status === 'finished'
      ? matchState.winner === mine ? '🏆 Vitória!' : 'Fim de jogo'
      : null;
    matchOverlay.innerHTML = `<section class="cg-window cg-match-window">
      <div class="cg-match">
        <header class="cg-match-top"><strong>${matchState.players[mine].name}</strong>
          <div class="cg-score"><b class="p1">${matchState.score[mine]}</b><span>×</span><b class="p2">${matchState.score[opponent]}</b></div>
          <div class="cg-turn">${result || (myTurn ? 'Sua vez' : `Vez de ${matchState.players[opponent].name}`)}</div>
          <button class="cg-btn ${matchState.status === 'ongoing' ? 'danger' : ''}" data-action="exit">
            ${matchState.status === 'ongoing' ? 'Desistir' : 'Fechar'}</button>
        </header>
        <div class="cg-arena">
          <div class="cg-board">${matchState.board.map((cell, index) => `<button type="button" class="cg-cell${cell ? ` controller-${cell.controller}` : ''}"
            data-cell="${index}"${cell || !myTurn || !selectedCardId || pendingMove ? ' disabled' : ''}>
            ${cell ? cardMarkup(byId.get(cell.cardId)) : ''}</button>`).join('')}</div>
          <aside class="cg-hand-zone">
            <div class="cg-opponent"><strong>${matchState.players[opponent].name}</strong>
              <small> · ${matchState.players[opponent].handCount} na mão · ${matchState.players[opponent].drawPileCount} no monte</small>
              <div class="cg-card-backs">${Array.from({ length: matchState.players[opponent].handCount }, () => '<i class="cg-back"></i>').join('')}</div>
            </div>
            <div class="cg-hand-title"><strong>Sua mão</strong><span>${matchState.players[mine].drawPileCount} no monte</span></div>
            <div class="cg-hand">${matchState.hand.map((id) => {
              const card = byId.get(id);
              return cardMarkup(card, { button: true, selected: selectedCardId === id, disabled: !myTurn || pendingMove });
            }).join('')}</div>
            ${result ? `<div class="cg-result">${result} · ${matchState.score[mine]} a ${matchState.score[opponent]}</div>` : ''}
          </aside>
        </div>
      </div>
    </section>`;
    matchOverlay.classList.remove('cg-hidden');
    matchOverlay.querySelector('[data-action="exit"]').onclick = () => {
      if (matchState.status === 'ongoing') presence.cardGameResign(matchState.matchId);
      else closeMatch();
    };
    matchOverlay.querySelectorAll('.cg-hand .cg-card').forEach((button) => {
      button.onclick = () => {
        if (!myTurn || pendingMove) return;
        selectedCardId = button.dataset.cardId;
        renderMatch();
      };
    });
    matchOverlay.querySelectorAll('[data-cell]').forEach((cell) => {
      cell.onclick = () => {
        if (!selectedCardId || !myTurn || pendingMove) return;
        pendingMove = true;
        presence.cardGameMove(matchState.matchId, selectedCardId, Number(cell.dataset.cell), matchState.version);
        renderMatch();
      };
    });
  }

  function closeMatch() {
    matchState = null;
    selectedCardId = null;
    pendingMove = false;
    matchOverlay.classList.add('cg-hidden');
  }

  document.getElementById('cardgame-deck-button').onclick = openDeck;
  presence.events.addEventListener('CardChallengeReceived', (event) => showInvite(event.detail));
  presence.events.addEventListener('CardChallengeDeclined', (event) => onToast(`${event.detail.targetName} recusou o desafio`));
  presence.events.addEventListener('CardChallengeCancelled', () => invite.classList.add('cg-hidden'));
  presence.events.addEventListener('CardGameError', (event) => {
    pendingMove = false;
    onToast(event.detail.message || 'Não foi possível concluir a ação');
    if (matchState) renderMatch();
  });
  presence.events.addEventListener('CardMatchStarted', () => {
    invite.classList.add('cg-hidden');
    closePlayerMenu();
  });
  presence.events.addEventListener('CardMatchState', (event) => {
    matchState = event.detail;
    selectedCardId = null;
    pendingMove = false;
    renderMatch();
  });

  return {
    handleWorldTap(pointer) {
      if (!matchOverlay.classList.contains('cg-hidden') || !deckOverlay.classList.contains('cg-hidden')) return true;
      const peer = presence.remoteAt(pointer.worldX, pointer.worldY, 22);
      if (!peer) { closePlayerMenu(); return false; }
      openPlayerMenu(peer, pointer);
      return true;
    },
    isBlocking() {
      return !deckOverlay.classList.contains('cg-hidden') || !matchOverlay.classList.contains('cg-hidden');
    },
    openDeck,
    getDeck: () => [...deck],
    closePlayerMenu,
  };
}
