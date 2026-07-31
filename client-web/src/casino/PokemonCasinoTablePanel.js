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
    .pct-step small{min-width:0;overflow:hidden;font-size:8px;text-overflow:ellipsis;white-space:nowrap}
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
].filter(Boolean).join(' + ');

const winsCopy = (count) => `${count} ${count === 1 ? 'vitória' : 'vitórias'}`;

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

  const achievedLevel = () => round?.rewardLevel
    || (round?.status === 'won' ? round.level : Math.max(0, (round?.level || 1) - 1));

  const protectedReward = () => {
    const achieved = achievedLevel();
    return achieved > 0 ? rewardCopy(game?.rewards?.[achieved - 1]) : 'nenhum';
  };

  const threatCopy = (level) => {
    if (level === 4) return 'A casa terá 1 carta energizada com +1.';
    if (level === 5) return 'A casa terá 3 cartas energizadas com +1.';
    if (level === 6) return 'Mewtwo Rei 15/15/15/15 e 5 cartas energizadas estarão na mão inicial.';
    return '';
  };

  function renderProgress() {
    const current = round?.level || 1;
    const achieved = achievedLevel();
    progress.innerHTML = (game?.rewards || []).map((reward) => `<span class="pct-step
      ${reward.level <= achieved ? 'done' : reward.level === current ? 'active' : ''}">
      <i>${reward.level <= achieved ? '✓' : reward.level}</i><small>${escapeHtml(rewardCopy(reward))}</small>
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

  const resultCopy = () => {
    if (!round) return `A entrada custa ${game?.entryCost || 100} moedas. Vença, avance e decida quando sacar.`;
    if (round.status === 'won') return round.level === 6
      ? `Liga vencida! ${rewardCopy(round.reward)} recebido.`
      : `Vitória! ${rewardCopy(game.rewards[round.level - 1])} agora está protegido. ${
        threatCopy(round.nextLevel)}`;
    if (round.status === 'lost') return round.rewardLevel > 0
      ? `A casa venceu. Prêmio de ${winsCopy(round.rewardLevel)} recebido: ${rewardCopy(round.reward)}.`
      : 'A casa venceu antes da primeira vitória. A sequência terminou sem prêmio.';
    if (round.status === 'left') return round.rewardLevel > 0
      ? `Você saiu com o prêmio de ${winsCopy(round.rewardLevel)}: ${rewardCopy(round.reward)}.`
      : 'Você saiu sem vitórias e sem prêmio.';
    return '';
  };

  function renderLobby() {
    const status = round?.status || '';
    const canContinue = status === 'won' && round.level < 6;
    const primary = !round ? `COMEÇAR · ${game?.entryCost || 100} MOEDAS`
      : canContinue ? 'CONTINUAR A SEQUÊNCIA'
        : `NOVA SEQUÊNCIA · ${game?.entryCost || 100} MOEDAS`;
    content.innerHTML = `<section class="pct-lobby">
      <div class="pct-lobby-mark">${status === 'won' ? '🏆' : status === 'lost' ? '♠' : '⚔'}</div>
      <h3>${status === 'won' ? 'Vitória contra a casa' : status === 'lost' ? 'Sequência encerrada' : 'Liga Pokémon da Casa'}</h3>
      <div class="pct-result ${status}">${resultCopy()}</div>
      <p>Você paga somente ao iniciar uma sequência. Cada vitória melhora o prêmio protegido;
        perder ou sair encerra a tentativa e entrega apenas o maior prêmio alcançado.</p>
      <div class="pct-actions"><button class="cg-btn primary pct-action${canContinue ? '' : ' only'}"
        type="button" data-action="start" ${busy ? 'disabled' : ''}>${primary}</button>
        ${canContinue ? `<button class="cg-btn pct-exit pct-action" type="button" data-action="cashout"
          ${busy ? 'disabled' : ''}>SAIR COM ${escapeHtml(protectedReward())}</button>` : ''}</div>
    </section>`;
    content.querySelector('[data-action="start"]').onclick = start;
    content.querySelector('[data-action="cashout"]')?.addEventListener('click', () => cashOut(false));
  }

  function renderBattle() {
    const myTurn = round.currentPlayer === 0 && !busy;
    const nextReward = game?.rewards?.[round.level - 1];
    content.innerHTML = `<div class="cg-arena"><div class="cg-board">${round.board.map((cell, index) =>
      `<button class="cg-cell${cell ? ` controller-${cell.controller}` : ''}" data-cell="${index}"
        ${cell || !myTurn || !selected ? 'disabled' : ''}>${cell ? cardMarkup(cell.cardId) : ''}</button>`).join('')}</div>
      <aside class="cg-hand-zone"><div class="cg-opponent">
        <div class="pct-house-copy"><strong>Casa</strong>
          <small>${round.houseHandCount} na mão · ${round.houseDrawCount} no monte</small></div>
        <div class="cg-card-backs">${Array.from({ length: round.houseHandCount }, () => '<i class="cg-back"></i>').join('')}</div>
        <div class="pct-stake"><span class="protected">Protegido: ${escapeHtml(protectedReward())}</span>
          <span>Ao vencer: ${escapeHtml(rewardCopy(nextReward))}</span>
          ${round.housePowerUps ? `<span>⚡ ${round.housePowerUps} ${round.housePowerUps === 1
    ? 'carta energizada' : 'cartas energizadas'}</span>` : ''}
          ${round.houseBoss ? `<span class="danger">♛ ${escapeHtml(round.houseBoss.name)} garantido</span>` : ''}
        </div></div>
        <div class="cg-hand-title"><strong>Sua mão</strong><span>${round.playerDrawCount} no monte</span></div>
        <div class="cg-hand">${round.playerHand.map((token) => cardMarkup(token, {
    button: true, disabled: !myTurn, showInfo: true,
  })).join('')}</div>
        <button class="cg-btn pct-exit pct-action" type="button" data-action="cashout" ${busy ? 'disabled' : ''}>
          ${round.level > 1 ? `SAIR COM ${escapeHtml(protectedReward())}` : 'SAIR SEM PRÊMIO'}</button>
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
      : 'Liga Pokémon da Casa';
    renderProgress();
    if (!round || round.status !== 'ongoing') renderLobby();
    else renderBattle();
  }

  async function start() {
    if (busy) return;
    busy = true;
    render();
    try {
      round = await gameItems.startPokemonCasinoBattle();
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
      round = await gameItems.playPokemonCasinoCard(round.roundId, selected, cellIndex);
      selected = '';
      if (round.status === 'won' && round.level < 6)
        onToast(`Vitória! ${rewardCopy(game.rewards[round.level - 1])} protegido.`);
      else if (round.status === 'won')
        onToast(`Liga vencida! ${rewardCopy(round.reward)} recebido.`);
      else if (round.status === 'lost')
        onToast(round.rewardLevel > 0
          ? `${rewardCopy(round.reward)} recebido. A sequência terminou.`
          : 'A casa venceu. A sequência terminou sem prêmio.');
    } catch (error) {
      onToast(error.message);
    } finally {
      busy = false;
      render();
    }
  }

  async function cashOut(closeAfter) {
    if (busy || !round || !['ongoing', 'won'].includes(round.status)) {
      if (closeAfter) finishClose();
      return;
    }
    busy = true;
    render();
    try {
      round = await gameItems.leavePokemonCasinoTable(round.roundId);
      if (round.rewardLevel > 0) onToast(`${rewardCopy(round.reward)} recebido.`);
      else onToast('Sequência encerrada sem prêmio.');
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
    game = await gameItems.pokemonCasinoTable();
    round = game.round;
    closeHook = options.onClose || null;
    selected = '';
    render();
    root.hidden = false;
  }

  root.querySelector('[data-action="exit"]').onclick = close;
  hud.register({ id: 'pokemon-casino-table', isOpen: () => !root.hidden, close });
  return { open, close, isOpen: () => !root.hidden };
}
