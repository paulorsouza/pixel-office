const TYPES = {
  normal: 'Normal', fire: 'Fogo', water: 'Água', electric: 'Elétrico', grass: 'Planta',
  ice: 'Gelo', fighting: 'Lutador', poison: 'Veneno', ground: 'Terra', flying: 'Voador',
  psychic: 'Psíquico', bug: 'Inseto', rock: 'Pedra', ghost: 'Fantasma', dragon: 'Dragão',
  dark: 'Sombrio', steel: 'Aço', fairy: 'Fada',
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
})[character]);

const tokenCardId = (token) => String(token || '').split('~', 1)[0];
const tokenSide = (token) => String(token || '').includes('~') ? String(token).split('~', 2)[1] : '';

function injectStyles() {
  if (document.getElementById('pokemon-casino-table-styles')) return;
  const style = document.createElement('style');
  style.id = 'pokemon-casino-table-styles';
  style.textContent = `
    #pokemon-casino-table-panel{font-family:Inter,system-ui,sans-serif}
    #pokemon-casino-table-panel .pct-match-window{
      --cg-p1:#65d9ff;--cg-p2:#ff647f;width:min(1180px,100%);height:min(760px,calc(100dvh - 24px))}
    #pokemon-casino-table-panel .cg-match{grid-template-rows:auto auto 1fr}
    .pct-progress{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;padding:9px 14px;
      border-bottom:1px solid #ffffff18;background:#0b1021aa}
    .pct-step{display:flex;min-width:0;align-items:center;gap:7px;padding:6px 8px;border:1px solid #ffffff14;
      border-radius:9px;color:#8792b2;background:#ffffff05}
    .pct-step i{display:grid;flex:0 0 22px;width:22px;height:22px;place-items:center;border-radius:50%;
      background:#252d4b;font-size:10px;font-style:normal;font-weight:900}
    .pct-step small{display:flex;min-width:0;overflow:hidden;align-items:baseline;justify-content:space-between;
      gap:5px;font-size:8px;white-space:nowrap}
    .pct-step small b{flex:none;color:#f6d768;font-size:8px}
    /* --- salão: as quatro mesas --- */
    .pct-tables{padding:18px 16px;text-align:center}
    .pct-tables h3{margin:0 0 6px;font-size:18px}
    .pct-tables-copy{max-width:560px;margin:0 auto 16px;color:#aab4d0;font-size:11px;line-height:1.65}
    /* Como item de grid, esta lista nascia com largura mínima igual ao min-content
       (as três colunas somadas) e vazava a tela do celular pela ESQUERDA, com o
       primeiro cartão fora do viewport. Daí a mínima zerada e o teto de coluna
       que encolhe junto com o contêiner. */
    .pct-table-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(210px,100%),1fr));gap:10px;
      width:100%;min-width:0;max-width:900px;margin:0 auto;text-align:left}
    .pct-table{display:grid;gap:3px;padding:13px;border:1px solid #ffffff20;border-radius:13px;color:#fff;
      background:linear-gradient(145deg,#2b2560,#141a33);cursor:pointer;font-family:Inter,system-ui,sans-serif}
    .pct-table:hover:not(:disabled){border-color:#8e7dff;filter:brightness(1.12)}
    .pct-table:disabled{cursor:not-allowed;filter:grayscale(.8);opacity:.55}
    .pct-table strong{font-size:13px}
    .pct-table small{color:#aab4d0;font-size:10px}
    .pct-table-prize{margin-top:6px;color:#ffe079;font-size:10px;font-weight:700}
    .pct-table-cost{color:#8792b2;font-size:9px}
    .pct-table-blocked{margin-top:5px;color:#ffc9d8;font-size:9px;line-height:1.5}
    .pct-back{margin-top:14px}
    /* --- os três desafios de uma mesa --- */
    .pct-difficulties{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:10px;
      width:100%;min-width:0;max-width:780px;margin:4px auto 0;text-align:left}
    .pct-difficulty{display:grid;gap:5px;padding:13px;border:1px solid #ffffff20;border-radius:13px;
      color:#fff;background:#1a2140;cursor:pointer;font-family:Inter,system-ui,sans-serif}
    .pct-difficulty:hover:not(:disabled){filter:brightness(1.15)}
    .pct-difficulty:disabled{cursor:not-allowed;opacity:.5}
    .pct-difficulty.easy{border-color:#57bc8355}
    .pct-difficulty.normal{border-color:#4ca8ed66}
    .pct-difficulty.hard{border-color:#ff8aa8;background:linear-gradient(145deg,#3d1b2a,#1a1225)}
    .pct-difficulty-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
    .pct-difficulty-head strong{font-size:14px}
    .pct-difficulty-head b{color:#ffe079;font-size:11px}
    .pct-difficulty-prize{color:#bfffd8;font-size:11px;font-weight:700}
    .pct-difficulty-house{color:#9aa6c6;font-size:9px;line-height:1.55}
    .pct-step.done{border-color:#4bd68a55;color:#bfffd8;background:#143123}
    .pct-step.done i{background:#2ca567;color:#fff}
    .pct-step.active{border-color:#f6d76888;color:#fff1b0;background:#3b3012}
    .pct-step.active i{background:#e3b92f;color:#241a00}
    .pct-house-copy{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .pct-house-copy small{white-space:nowrap}
    .pct-stake{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
    .pct-stake span{padding:5px 7px;border-radius:7px;color:#cad4ee;background:#ffffff0b;font-size:9px}
    .pct-stake .protected{color:#bfffd8;background:#173a28}
    .pct-stake .danger{color:#ffd2dc;background:#421b29}
    #pokemon-casino-table-panel .cg-cell:not(:disabled):hover{border-color:#ffe178;background:#292311}
    #pokemon-casino-table-panel .cg-cell:disabled{cursor:default}
    #pokemon-casino-table-panel .cg-hand{max-height:53dvh;overflow:auto;padding:3px;
      overscroll-behavior:contain;scrollbar-width:thin}
    #pokemon-casino-table-panel button.cg-card{border:3px solid #536184;background:
      radial-gradient(circle at 50% 38%,#ffffff18,transparent 42%),linear-gradient(160deg,#28345d,#12182d)}
    #pokemon-casino-table-panel button.cg-card.selected{outline-color:#ffe45e}
    #pokemon-casino-table-panel button.cg-card:disabled{cursor:default;filter:brightness(.72)}
    .pct-exit{border-color:#f0c95e!important;color:#ffeaa0!important;background:#302710!important}
    .pct-lobby{display:grid;max-width:720px;min-height:100%;margin:auto;place-content:center;gap:13px;padding:24px;text-align:center}
    .pct-lobby-mark{font-size:42px}.pct-lobby h3{margin:0;font-size:22px}.pct-lobby p{max-width:620px;margin:0;
      color:#aeb9d5;font-size:11px;line-height:1.65}
    .pct-result{padding:13px;border-radius:12px;background:#ffffff0a;font-weight:800}
    .pct-result.won,.pct-result.left{color:#d9ffe8;background:#183d29}
    .pct-result.lost{color:#ffd4da;background:#431c27}
    .pct-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .pct-action{min-height:44px}.pct-actions .only{grid-column:1/-1}
    @media(max-width:760px){
      #pokemon-casino-table-panel .pct-match-window{height:100dvh;max-height:100dvh}
      .pct-progress{grid-template-columns:repeat(6,1fr);gap:3px;padding:6px}
      .pct-step{justify-content:center;padding:5px 2px}.pct-step i{width:24px;height:24px;flex-basis:24px}
      .pct-step small{display:none}
      #pokemon-casino-table-panel .cg-arena{align-items:start}
      #pokemon-casino-table-panel .cg-board{width:min(44vh,100%)}
      #pokemon-casino-table-panel .cg-opponent{margin-bottom:10px}
      #pokemon-casino-table-panel .cg-hand{max-height:none}
      .pct-actions{grid-template-columns:1fr}.pct-lobby{padding:18px 12px}
    }
    @media(pointer:coarse){
      #pokemon-casino-table-panel .cg-cell,#pokemon-casino-table-panel button.cg-card,
      .pct-action,.pct-exit{min-height:44px}
    }
  `;
  document.head.append(style);
}

const rewardCopy = (reward) => [
  reward?.normal ? `${reward.normal} Nacional` : '',
  reward?.rare ? `${reward.rare} Raro` : '',
  reward?.legendary ? `${reward.legendary} Lendário` : '',
  reward?.exoticChest ? 'Baú Exótico' : '',
].filter(Boolean).join(' + ');

const coins = (value) => Number(value || 0).toLocaleString('pt-BR');


export function createPokemonCasinoTablePanel({
  gameItems,
  hud,
  catalog,
  typeChart = {},
  onToast = () => {},
}) {
  injectStyles();
  const cards = new Map((catalog.cards || []).map((card) => [card.id, card]));
  const typeOverlay = document.getElementById('cardgame-type-overlay');
  const root = document.createElement('section');
  root.id = 'pokemon-casino-table-panel';
  root.className = 'casino-game-panel interactive';
  root.hidden = true;
  root.setAttribute('aria-label', 'Liga Pokémon da Casa');
  root.innerHTML = `<section class="cg-window cg-match-window pct-match-window">
    <div class="cg-match"><header class="cg-match-top">
      <strong>Você</strong><div class="cg-score"><b class="p1">0</b><span>×</span><b class="p2">0</b></div>
      <div class="cg-turn">Liga Pokémon da Casa</div>
      <button class="cg-btn pct-exit" type="button" data-action="exit">Sair</button>
    </header><div class="pct-progress"></div><div class="pct-content"></div></div></section>`;
  document.body.append(root);

  const content = root.querySelector('.pct-content');
  const progress = root.querySelector('.pct-progress');
  const turnLabel = root.querySelector('.cg-turn');
  const playerScore = root.querySelector('.cg-score .p1');
  const houseScore = root.querySelector('.cg-score .p2');
  // `tables` é o salão (as quatro mesas); `league` é a mesa em que estou sentado.
  // Com `league` nulo o painel mostra a escolha de mesa, não uma partida.
  let tables = [];
  let league = '';
  let game = null;
  let round = null;
  let selected = '';
  let busy = false;
  let closeHook = null;

  const cardMarkup = (token, { button = false, disabled = false, showInfo = false } = {}) => {
    const card = cards.get(tokenCardId(token));
    if (!card) return '';
    const side = tokenSide(token);
    const tag = button ? 'button type="button"' : 'div';
    const close = button ? 'button' : 'div';
    const edge = (key) => card.edges[key] + (side === key ? 1 : 0);
    return `<${tag} class="cg-card${selected === token ? ' selected' : ''}${side ? ' shiny' : ''}"
      data-card-id="${card.id}" data-card-token="${escapeHtml(token)}" data-rarity="${card.rarity}"
      ${button && disabled ? 'disabled' : ''}>
      <div class="cg-card-head"><strong>${escapeHtml(card.name)}</strong>
        <small>#${String(card.dex).padStart(3, '0')}</small></div>
      ${showInfo ? '<span class="cg-info" role="button" aria-label="Ver vantagens e desvantagens">i</span>' : ''}
      <span class="cg-edge top${side === 'top' ? ' boosted' : ''}">${edge('top')}</span>
      <span class="cg-edge right${side === 'right' ? ' boosted' : ''}">${edge('right')}</span>
      <span class="cg-edge bottom${side === 'bottom' ? ' boosted' : ''}">${edge('bottom')}</span>
      <span class="cg-edge left${side === 'left' ? ' boosted' : ''}">${edge('left')}</span>
      <div class="cg-card-art"><img src="${card.art}" alt="${escapeHtml(card.name)}" draggable="false"></div>
      <div class="cg-card-types">${card.types.map((type) =>
    `<span class="cg-type">${TYPES[type] || type}</span>`).join('')}</div>
    </${close}>`;
  };


  const difficultyAt = (id) => game?.difficulties?.find((entry) => entry.id === id);

  /**
   * Durante uma escada a trilha mostra as QUATRO partidas do modo, com a faixa de
   * prêmio de cada uma. Fora dela, os três modos.
   */
  function renderProgress() {
    if (round && round.status !== 'left') {
      const modo = difficultyAt(round.difficulty);
      progress.innerHTML = (modo?.levels || []).map((entry) => `<span class="pct-step
        ${entry.level <= round.matchesWon ? 'done' : entry.level === round.match ? 'active' : ''}"
        title="Partida ${entry.level} de ${round.matches} · vale ${escapeHtml(rewardCopy(entry.prize))}">
        <i>${entry.level <= round.matchesWon ? '✓' : entry.level}</i>
        <small>${escapeHtml(rewardCopy(entry.prize))}</small>
      </span>`).join('');
      return;
    }
    progress.innerHTML = (game?.difficulties || []).map((entry) => `<span class="pct-step"
      title="${escapeHtml(entry.houseCopy)}">
      <i>${entry.id === 'hard' ? '🔥' : entry.id === 'normal' ? '◆' : '○'}</i>
      <small>${escapeHtml(entry.name)}<b>${coins(entry.price)}⨮</b></small>
    </span>`).join('');
  }

  function showTypeOverlay(card) {
    if (!card || !typeOverlay) return;
    const strong = [...new Set(card.types.flatMap((type) => typeChart[type] || []))];
    const weak = Object.entries(typeChart)
      .filter(([, targets]) => card.types.some((type) => targets.includes(type)))
      .map(([type]) => type);
    const chips = (types) => types.length
      ? types.map((type) => `<span class="cg-type">${TYPES[type] || type}</span>`).join('')
      : '<span class="cg-type">Nenhum</span>';
    typeOverlay.innerHTML = `<section class="cg-type-dialog" role="dialog" aria-modal="true">
      <header><img src="${card.art}" alt=""><div><h3>${escapeHtml(card.name)}</h3>
        <div class="cg-type-chips">${chips(card.types)}</div></div>
        <button data-close aria-label="Fechar">✕</button></header>
      <p>Durante um confronto, vantagem de tipo acrescenta <b>+1 TIPO</b> ao valor comparado.</p>
      <div class="cg-type-groups"><div class="cg-type-group"><strong>Vantagem contra</strong>
        <div class="cg-type-chips">${chips(strong)}</div></div>
        <div class="cg-type-group"><strong>Desvantagem contra</strong>
        <div class="cg-type-chips">${chips(weak)}</div></div></div></section>`;
    typeOverlay.classList.remove('cg-hidden');
    typeOverlay.querySelector('[data-close]').onclick = () => typeOverlay.classList.add('cg-hidden');
    typeOverlay.onclick = (event) => {
      if (event.target === typeOverlay) typeOverlay.classList.add('cg-hidden');
    };
  }

  function bindCardInfo() {
    content.querySelectorAll('.cg-info').forEach((info) => {
      info.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        showTypeOverlay(cards.get(info.closest('.cg-card').dataset.cardId));
      };
    });
  }

  /** O salão: quatro mesas, cada uma pedindo o baralho da sua liga. */
  function renderTables() {
    content.innerHTML = `<section class="pct-tables">
      <h3>Escolha a mesa</h3>
      <p class="pct-tables-copy">Cada mesa joga na sua liga, com o seu baralho daquela liga. As três
        dificuldades custam o mesmo em qualquer mesa — <strong>50 · 100 · 200</strong> — e o que muda
        de mesa para mesa é o prêmio. Os melhores estão na Master.</p>
      <div class="pct-table-list">${tables.map((table) => {
        const hard = table.difficulties[table.difficulties.length - 1];
        return `<button class="pct-table" type="button" data-table="${table.leagueId}"
          ${table.deckReady ? '' : 'disabled'}>
          <strong>${escapeHtml(table.name)}</strong>
          <small>${table.maxPower == null ? 'sem teto de poder' : `até ${table.maxPower} de poder`}</small>
          <span class="pct-table-prize">Topo do Hard: ${escapeHtml(rewardCopy(hard.levels[hard.levels.length - 1].prize))}</span>
          <span class="pct-table-cost">${table.difficulties.map((entry) =>
            `${entry.name} ${coins(entry.price)}`).join(' · ')}</span>
          ${table.deckReady ? '' : `<span class="pct-table-blocked">${escapeHtml(table.deckError)}</span>`}
        </button>`;
      }).join('')}</div>
    </section>`;
    content.querySelectorAll('[data-table]').forEach((button) => {
      button.onclick = () => enterTable(button.dataset.table);
    });
  }

  /** A escada continua? (venceu, ainda tem partida e o prêmio não foi pago) */
  const canContinue = () => Boolean(round && round.status === 'won'
    && round.match < round.matches && !round.prizeTaken);

  const lockedCopy = () => (round?.lockedPrize ? rewardCopy(round.lockedPrize) : 'nenhum');

  const resultCopy = () => {
    if (!round) return 'Escolha o modo. Você paga uma vez e enfrenta quatro partidas, cada uma valendo mais.';
    const modo = difficultyAt(round.difficulty)?.name || '';
    if (round.status === 'won') {
      return round.match === round.matches
        ? `Escada do ${modo} fechada! ${rewardCopy(round.prize)} recebido.`
        : `Vitória ${round.match} de ${round.matches}. ${rewardCopy(round.prize)} travado — a próxima vale mais.`;
    }
    if (round.status === 'lost') {
      return round.matchesWon > 0
        ? `A casa venceu a partida ${round.match}. Você leva o que já tinha travado: ${lockedCopy()}.`
        : `A casa venceu a primeira. As ${coins(round.price)} moedas do ${modo} ficaram com ela.`;
    }
    if (round.status === 'left') {
      return round.matchesWon > 0 ? `Você sacou ${lockedCopy()}.` : 'Você saiu sem travar faixa nenhuma.';
    }
    return '';
  };

  function renderLobby() {
    const status = round?.status || '';
    const seguir = canContinue();
    content.innerHTML = `<section class="pct-lobby">
      <div class="pct-lobby-mark">${status === 'won' ? '🏆' : status === 'lost' ? '♠' : '⚔'}</div>
      <h3>${escapeHtml(game?.name || 'Liga Pokémon da Casa')}</h3>
      <div class="pct-result ${status}">${resultCopy()}</div>
      ${seguir ? `<div class="pct-actions">
          <button class="cg-btn primary pct-action" type="button" data-action="next" ${busy ? 'disabled' : ''}>
            PARTIDA ${round.match + 1} DE ${round.matches} (de graça)</button>
          <button class="cg-btn pct-exit pct-action" type="button" data-action="cashout" ${busy ? 'disabled' : ''}>
            SACAR ${escapeHtml(lockedCopy())}</button>
        </div>`
      : `<p>Você paga o modo <strong>uma vez</strong> e enfrenta quatro partidas seguidas. Cada vitória
        trava uma faixa melhor; perder entrega a faixa já travada. Seu baralho respeita o teto da liga
        nos três modos — quem passa dele é a casa, no Hard.</p>
      <div class="pct-difficulties">${(game?.difficulties || []).map((entry) => `
        <button class="pct-difficulty ${entry.id}" type="button" data-difficulty="${entry.id}"
          title="${escapeHtml(entry.houseCopy)}" ${busy ? 'disabled' : ''}>
          <span class="pct-difficulty-head"><strong>${escapeHtml(entry.name)}</strong>
            <b>${coins(entry.price)} moedas</b></span>
          <span class="pct-difficulty-prize">${entry.levels.map((nivel) =>
            escapeHtml(rewardCopy(nivel.prize))).join(' → ')}</span>
        </button>`).join('')}</div>`}
      ${game?.fromSalon ? '<button class="cg-btn pct-back" type="button" data-action="tables">↩ Ver as quatro mesas</button>' : ''}
    </section>`;
    content.querySelectorAll('[data-difficulty]').forEach((button) => {
      button.onclick = () => start(button.dataset.difficulty);
    });
    content.querySelector('[data-action="next"]')?.addEventListener('click', () => start(round.difficulty));
    content.querySelector('[data-action="cashout"]')?.addEventListener('click', () => cashOut(false));
    content.querySelector('[data-action="tables"]')?.addEventListener('click', () => {
      league = ''; game = null; round = null; render();
    });
  }

  function renderBattle() {
    const myTurn = round.currentPlayer === 0 && !busy;
    content.innerHTML = `<div class="cg-arena"><div class="cg-board">${round.board.map((cell, index) =>
      `<button class="cg-cell${cell ? ` controller-${cell.controller}` : ''}" data-cell="${index}"
        ${cell || !myTurn || !selected ? 'disabled' : ''}>${cell ? cardMarkup(cell.cardId) : ''}</button>`).join('')}</div>
      <aside class="cg-hand-zone"><div class="cg-opponent">
        <div class="pct-house-copy"><strong>Casa</strong>
          <small>${round.houseHandCount} na mão · ${round.houseDrawCount} no monte</small></div>
        <div class="cg-card-backs">${Array.from({ length: round.houseHandCount }, () => '<i class="cg-back"></i>').join('')}</div>
        <div class="pct-stake" title="${escapeHtml(round.houseCopy)}">
          <span class="protected">Travado: ${escapeHtml(lockedCopy())}</span>
          <span>Ao vencer: ${escapeHtml(rewardCopy(round.prize))}</span>
          <span>${escapeHtml(round.difficultyName)} ${round.match}/${round.matches}</span>
          ${round.housePowerUps ? `<span>⚡ ${round.housePowerUps} ${round.housePowerUps === 1
    ? 'carta energizada' : 'cartas energizadas'}</span>` : ''}
          ${game?.maxPower != null && round.houseMaxPower !== game.maxPower
    ? `<span class="danger">⚠ Casa até ${round.houseMaxPower ?? '∞'} — você segue preso a ${game.maxPower}</span>` : ''}
          ${round.houseBoss ? `<span class="danger">♛ ${escapeHtml(round.houseBoss.name)} garantido</span>` : ''}
        </div></div>
        <div class="cg-hand-title"><strong>Sua mão</strong><span>${round.playerDrawCount} no monte</span></div>
        <div class="cg-hand">${round.playerHand.map((token) => cardMarkup(token, {
    button: true, disabled: !myTurn, showInfo: true,
  })).join('')}</div>
        <button class="cg-btn pct-exit pct-action" type="button" data-action="cashout" ${busy ? 'disabled' : ''}>
          ${round.matchesWon > 0 ? `SAIR COM ${escapeHtml(lockedCopy())}` : 'DESISTIR (sem prêmio)'}</button>
      </aside></div>`;
    content.querySelectorAll('.cg-hand > .cg-card').forEach((button) => {
      button.onclick = () => {
        if (!myTurn) return;
        selected = selected === button.dataset.cardToken ? '' : button.dataset.cardToken;
        render();
      };
    });
    content.querySelectorAll('[data-cell]:not(:disabled)').forEach((cell) => {
      cell.onclick = () => move(Number(cell.dataset.cell));
    });
    content.querySelector('[data-action="cashout"]').onclick = () => cashOut(false);
    bindCardInfo();
  }

  function render() {
    const score = round?.score || [0, 0];
    playerScore.textContent = score[0];
    houseScore.textContent = score[1];
    turnLabel.textContent = round?.status === 'ongoing'
      ? busy || round.currentPlayer === 1 ? 'Vez da casa' : 'Sua vez'
      : game?.name || 'Liga Pokémon da Casa';
    progress.hidden = !league;
    if (league) renderProgress();
    if (!league) renderTables();
    else if (!round || round.status !== 'ongoing') renderLobby();
    else renderBattle();
  }

  async function enterTable(leagueId) {
    if (busy) return;
    busy = true;
    render();
    try {
      game = { ...await gameItems.pokemonCasinoTable(leagueId), fromSalon: tables.length > 0 };
      league = leagueId;
      round = game.round;
      selected = '';
    } catch (error) {
      onToast(error.message);
    } finally {
      busy = false;
      render();
    }
  }

  async function start(difficulty) {
    if (busy) return;
    busy = true;
    render();
    try {
      round = await gameItems.startPokemonCasinoBattle(league, difficulty);
      selected = '';
    } catch (error) {
      onToast(error.message);
    } finally {
      busy = false;
      render();
    }
  }

  async function move(cellIndex) {
    if (busy || !selected || round?.status !== 'ongoing') return;
    busy = true;
    render();
    try {
      round = await gameItems.playPokemonCasinoCard(league, round.roundId, selected, cellIndex);
      selected = '';
      if (round.status === 'won') {
        onToast(round.match === round.matches
          ? `Escada fechada! ${rewardCopy(round.prize)} recebido.`
          : `Vitória ${round.match}/${round.matches}. ${rewardCopy(round.prize)} travado.`);
      } else if (round.status === 'lost') {
        onToast(round.matchesWon > 0
          ? `A casa venceu. Você leva ${rewardCopy(round.lockedPrize)}.`
          : 'A casa venceu a primeira. Sem prêmio desta vez.');
      }
    } catch (error) {
      onToast(error.message);
    } finally {
      busy = false;
      render();
    }
  }

  async function cashOut(closeAfter) {
    if (busy || !round || !['ongoing', 'won'].includes(round.status) || round.prizeTaken) {
      if (closeAfter) finishClose();
      return;
    }
    busy = true;
    render();
    try {
      round = await gameItems.leavePokemonCasinoTable(league, round.roundId);
      onToast(round.matchesWon > 0
        ? `${rewardCopy(round.lockedPrize)} recebido.`
        : 'Você saiu sem travar faixa nenhuma.');
    } catch (error) {
      onToast(error.message);
    } finally {
      busy = false;
      if (closeAfter) finishClose();
      else render();
    }
  }

  function finishClose() {
    root.hidden = true;
    selected = '';
    typeOverlay?.classList.add('cg-hidden');
    closeHook?.();
    closeHook = null;
  }

  function close() {
    void cashOut(true);
  }

  async function open(_gameId, options = {}) {
    hud.closeSheets();
    closeHook = options.onClose || null;
    selected = '';
    league = '';
    game = null;
    round = null;
    // A mesa física manda: cada uma das quatro é uma liga, então o painel abre
    // direto nela. O salão só aparece se alguém abrir o painel sem mesa (o menu
    // do jogo, um atalho antigo), e aí serve de índice.
    if (options.leagueId) await enterTable(options.leagueId);
    else {
      const salon = await gameItems.pokemonCasinoTables();
      tables = salon.tables || [];
      render();
    }
    root.hidden = false;
  }

  root.querySelector('[data-action="exit"]').onclick = close;
  hud.register({ id: 'pokemon-casino-table', isOpen: () => !root.hidden, close });
  return { open, close, isOpen: () => !root.hidden };
}
