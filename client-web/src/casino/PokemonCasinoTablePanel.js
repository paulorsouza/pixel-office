const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
})[character]);

const SIDE_LABEL = { top: '↑', right: '→', bottom: '↓', left: '←' };
const tokenCardId = (token) => String(token || '').split('~', 1)[0];
const tokenSide = (token) => String(token || '').includes('~') ? String(token).split('~', 2)[1] : '';

function injectStyles() {
  if (document.getElementById('pokemon-casino-table-styles')) return;
  const style = document.createElement('style');
  style.id = 'pokemon-casino-table-styles';
  style.textContent = `
    #pokemon-casino-table-panel .casino-shell{width:min(1120px,calc(100vw - 24px))}
    .pct-layout{display:grid;grid-template-columns:minmax(0,1fr) 240px;gap:14px}
    .pct-arena{display:grid;grid-template-columns:minmax(300px,520px) minmax(170px,1fr);gap:14px;align-items:start}
    .pct-board{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;aspect-ratio:1;max-height:58dvh}
    .pct-cell{min-width:0;padding:3px;border:1px solid #ffffff24;border-radius:10px;background:#090e20;cursor:pointer}
    .pct-cell:disabled{cursor:default}.pct-cell:not(:disabled):hover{border-color:#ffe178;background:#292311}
    .pct-cell.house .pct-card{border-color:#ff647f}.pct-cell.player .pct-card{border-color:#65d9ff}
    .pct-side{display:grid;gap:8px}.pct-side-head{display:flex;justify-content:space-between;gap:8px;
      padding:9px;border-radius:10px;background:#ffffff0b}.pct-side-head span{color:#aebbd7;font-size:11px}
    .pct-hand{display:grid;grid-template-columns:repeat(2,minmax(76px,1fr));gap:6px;max-height:52dvh;overflow:auto}
    .pct-card{position:relative;display:grid;grid-template-rows:auto 1fr auto;min-width:0;aspect-ratio:3/4;
      overflow:hidden;padding:0;border:2px solid #536184;border-radius:9px;color:#fff;
      background:radial-gradient(circle at 50% 42%,#ffffff18,transparent 45%),linear-gradient(160deg,#28345d,#12182d)}
    button.pct-card{width:100%;cursor:pointer}.pct-card.selected{outline:3px solid #ffe45e;transform:translateY(-2px)}
    .pct-card strong{padding:4px 5px;overflow:hidden;font-size:8px;text-overflow:ellipsis;white-space:nowrap}
    .pct-card img{place-self:center;width:72%;height:72%;object-fit:contain;image-rendering:pixelated}
    .pct-edges{display:flex;justify-content:space-between;padding:3px 5px;font:800 8px monospace}
    .pct-edges .boosted{color:#261900;background:#ffd83d;border-radius:4px;padding:1px 2px}
    .pct-rewards{display:grid;gap:6px}.pct-reward{padding:9px;border:1px solid #ffffff17;border-radius:10px;background:#ffffff08}
    .pct-reward.active{border-color:#ffe16d;background:#4b3814}.pct-reward.done{border-color:#65e59a66;background:#153322}
    .pct-reward strong{display:block;font-size:11px}.pct-reward small{color:#bdc8e0;font-size:9px}
    .pct-result{margin-top:10px;padding:11px;border-radius:11px;text-align:center;background:#ffffff0a}
    .pct-result.won{color:#d9ffe8;background:#183d29}.pct-result.lost{color:#ffd4da;background:#431c27}
    .pct-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .pct-action{width:100%;min-height:44px;margin-top:9px}.pct-cashout{
      border-color:#ffe16d!important;background:#2b2410!important;color:#ffeaa0!important}
    @media(max-width:760px){
      #pokemon-casino-table-panel .casino-content{padding:12px}
      .pct-layout{grid-template-columns:1fr}.pct-rewards{grid-template-columns:repeat(3,1fr);order:-1}
      .pct-reward{padding:6px}.pct-arena{grid-template-columns:minmax(0,1fr)}
      .pct-board{width:min(100%,390px);max-height:none;margin:auto}.pct-hand{grid-template-columns:repeat(3,1fr);max-height:none}
      .pct-actions{grid-template-columns:1fr}
    }
    @media(pointer:coarse){.pct-cell,button.pct-card,.pct-action{min-height:44px}}
  `;
  document.head.append(style);
}

const rewardCopy = (reward) => [
  reward.normal ? `${reward.normal} Nacional` : '',
  reward.rare ? `${reward.rare} Raro` : '',
  reward.ultraRare ? `${reward.ultraRare} Ultrarraro` : '',
].filter(Boolean).join(' + ');
const winsCopy = (count) => `${count} ${count === 1 ? 'vitória' : 'vitórias'}`;

export function createPokemonCasinoTablePanel({
  gameItems,
  hud,
  catalog,
  onToast = () => {},
}) {
  injectStyles();
  const cards = new Map((catalog.cards || []).map((card) => [card.id, card]));
  const root = document.createElement('section');
  root.id = 'pokemon-casino-table-panel';
  root.className = 'casino-game-panel interactive';
  root.hidden = true;
  root.setAttribute('aria-label', 'Liga Pokémon da Casa');
  root.innerHTML = `<div class="casino-shell casino-generic-shell">
    <header class="casino-head"><div><span>CASINO NERD</span><h2>Liga Pokémon da Casa</h2></div>
      <button class="casino-close" type="button" aria-label="Fechar">×</button></header>
    <div class="casino-content"><div class="casino-topline">
      <div class="casino-balance"><span>Nível da casa</span><strong>1 / 6</strong></div>
      <div class="casino-step"><span>Entrada / saldo</span><strong>100 moedas</strong></div>
    </div><div class="pct-layout"><main></main><aside class="pct-rewards"></aside></div></div></div>`;
  document.body.append(root);

  const main = root.querySelector('main');
  const rewardsRoot = root.querySelector('.pct-rewards');
  const levelLabel = root.querySelector('.casino-balance strong');
  const balanceLabel = root.querySelector('.casino-step strong');
  let game = null;
  let round = null;
  let selected = '';
  let busy = false;
  let closeHook = null;

  const cardMarkup = (token, button = false) => {
    const card = cards.get(tokenCardId(token));
    if (!card) return '';
    const side = tokenSide(token);
    const tag = button ? 'button type="button"' : 'div';
    const close = button ? 'button' : 'div';
    const edge = (key) => card.edges[key] + (side === key ? 1 : 0);
    return `<${tag} class="pct-card${selected === token ? ' selected' : ''}" data-token="${escapeHtml(token)}">
      <strong>${escapeHtml(card.name)}${side ? ` ✦${SIDE_LABEL[side]}` : ''}</strong>
      <img src="${card.art}" alt="${escapeHtml(card.name)}"><div class="pct-edges">
        <span class="${side === 'top' ? 'boosted' : ''}">↑${edge('top')}</span>
        <span class="${side === 'right' ? 'boosted' : ''}">→${edge('right')}</span>
        <span class="${side === 'bottom' ? 'boosted' : ''}">↓${edge('bottom')}</span>
        <span class="${side === 'left' ? 'boosted' : ''}">←${edge('left')}</span>
      </div></${close}>`;
  };

  const renderRewards = () => {
    const current = round?.level || 1;
    const achieved = round?.rewardLevel
      || (round?.status === 'won' ? round.level : Math.max(0, current - 1));
    rewardsRoot.innerHTML = (game?.rewards || []).map((reward) => `<div class="pct-reward
      ${reward.level <= achieved ? 'done' : reward.level === current ? 'active' : ''}">
      <strong>Nível ${reward.level}</strong><small>${rewardCopy(reward)}</small></div>`).join('');
  };

  const resultCopy = () => {
    if (!round) return `Monte um baralho de 15 cartas. A sequência custa ${game?.entryCost || 100} moedas.`;
    if (round.status === 'won') return round.level === 6
      ? `Você venceu a Liga! Prêmio final: ${rewardCopy(round.reward)}.`
      : `Vitória ${round.level}! ${rewardCopy(game.rewards[round.level - 1])} está reservado. Continue ou saia para receber.`;
    if (round.status === 'lost') return round.rewardLevel > 0
      ? `A casa venceu. Você recebeu o prêmio de ${winsCopy(round.rewardLevel)}: ${rewardCopy(round.reward)}.`
      : 'A casa venceu antes da primeira vitória. A sequência terminou sem prêmio.';
    if (round.status === 'left') return round.rewardLevel > 0
      ? `Sequência encerrada. Prêmio de ${winsCopy(round.rewardLevel)}: ${rewardCopy(round.reward)}.`
      : 'Sequência encerrada sem vitórias e sem prêmio.';
    return round.currentPlayer === 0 ? 'Sua vez: escolha uma carta e uma casa.' : 'A casa está pensando…';
  };

  const render = () => {
    levelLabel.textContent = `${round?.level || 1} / 6`;
    balanceLabel.textContent = `${game?.entryCost || 100} moedas · saldo ${round?.coins ?? game?.coins ?? '—'}`;
    renderRewards();
    if (!round || round.status !== 'ongoing') {
      const status = round?.status || '';
      const button = !round ? 'INICIAR NÍVEL 1'
        : status === 'won' && round.level < 6 ? `ENFRENTAR NÍVEL ${round.nextLevel}`
          : 'INICIAR NOVA SEQUÊNCIA';
      const canCashOut = status === 'won' && round.level < 6;
      const startLabel = canCashOut
        ? button
        : `${button} · ${game?.entryCost || 100} MOEDAS`;
      main.innerHTML = `<div class="pct-result ${status}">${resultCopy()}</div>
        <div class="pct-actions"><button class="casino-play pct-action" type="button" ${busy ? 'disabled' : ''}>${startLabel}</button>
        ${canCashOut ? `<button class="casino-secondary pct-action pct-cashout" type="button" ${busy ? 'disabled' : ''}>
          SAIR E RECEBER ${escapeHtml(rewardCopy(game.rewards[round.level - 1]))}</button>` : ''}</div>`;
      main.querySelector('.pct-action').onclick = start;
      main.querySelector('.pct-cashout')?.addEventListener('click', () => cashOut(false));
      return;
    }
    main.innerHTML = `<div class="pct-arena"><section class="pct-board">${round.board.map((cell, index) =>
      `<button class="pct-cell${cell ? ` ${cell.controller === 0 ? 'player' : 'house'}` : ''}" data-cell="${index}"
        ${cell || !selected || busy ? 'disabled' : ''}>${cell ? cardMarkup(cell.cardId) : ''}</button>`).join('')}</section>
      <section class="pct-side"><div class="pct-side-head"><strong>CASA</strong>
        <span>${round.houseHandCount} na mão · ${round.houseDrawCount} no monte</span></div>
        <div class="pct-side-head"><strong>VOCÊ · ${round.score[0]}×${round.score[1]}</strong>
        <span>${round.playerDrawCount} no monte</span></div>
        <div class="pct-hand">${round.playerHand.map((token) => cardMarkup(token, true)).join('')}</div></section></div>
      <div class="pct-result">${resultCopy()}</div>
      <button class="casino-secondary pct-action pct-cashout" type="button" ${busy ? 'disabled' : ''}>
        ${round.level > 1
    ? `SAIR E RECEBER PRÊMIO DE ${winsCopy(round.level - 1).toUpperCase()}`
    : 'SAIR SEM PRÊMIO'}</button>`;
    main.querySelectorAll('button.pct-card').forEach((button) => {
      button.onclick = () => { selected = selected === button.dataset.token ? '' : button.dataset.token; render(); };
    });
    main.querySelectorAll('[data-cell]:not(:disabled)').forEach((button) => {
      button.onclick = () => move(Number(button.dataset.cell));
    });
    main.querySelector('.pct-cashout').onclick = () => cashOut(false);
  };

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
        onToast(`Vitória! Prêmio de ${winsCopy(round.level)} reservado.`);
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
      if (closeAfter) return;
    } finally {
      busy = false;
      if (closeAfter) finishClose();
      else render();
    }
  }

  function finishClose() {
    root.hidden = true;
    selected = '';
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

  root.querySelector('.casino-close').onclick = close;
  hud.register({ id: 'pokemon-casino-table', isOpen: () => !root.hidden, close });
  return { open, close, isOpen: () => !root.hidden };
}
