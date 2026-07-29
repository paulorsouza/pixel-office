const SUITS = {
  hearts: { glyph: '♥', red: true },
  diamonds: { glyph: '♦', red: true },
  clubs: { glyph: '♣', red: false },
  spades: { glyph: '♠', red: false },
};

const OUTCOME_COPY = {
  'player-blackjack': 'Blackjack natural! Retorno ×5.',
  'dealer-blackjack': 'O dealer abriu blackjack.',
  'player-bust': 'Você estourou 21.',
  'dealer-bust': 'O dealer estourou. Você venceu!',
  'player-win': 'Sua mão venceu o dealer!',
  'dealer-win': 'O dealer venceu esta mão.',
  push: 'Empate: a aposta voltou para você.',
};

export function createBlackjackPanel({ gameItems, hud, onToast = () => {} }) {
  const root = document.createElement('section');
  root.id = 'casino-blackjack-panel';
  root.className = 'casino-game-panel interactive';
  root.hidden = true;
  root.setAttribute('aria-label', 'Blackjack');
  root.innerHTML = `
    <div class="casino-shell casino-generic-shell">
      <header class="casino-head">
        <div><span>CASINO NERD</span><h2>Blackjack · Mesa 21</h2></div>
        <button class="casino-close" type="button" aria-label="Fechar">×</button>
      </header>
      <div class="casino-content">
        <div class="casino-topline">
          <div class="casino-balance"><span>Saldo</span><strong>—</strong></div>
          <div class="casino-step"><span>Regra</span><strong>Vitória ×4 · Blackjack ×5</strong></div>
        </div>
        <section class="blackjack-felt" aria-label="Mesa de blackjack">
          <div class="blackjack-hand dealer">
            <header><span>DEALER</span><strong>—</strong></header>
            <div class="blackjack-cards"></div>
          </div>
          <div class="blackjack-mark"><span>BLACKJACK</span><small>RETORNO ×5</small></div>
          <div class="blackjack-hand player">
            <header><span>VOCÊ</span><strong>—</strong></header>
            <div class="blackjack-cards"></div>
          </div>
        </section>
        <div class="casino-result" role="status">Faça sua aposta para receber as cartas.</div>
        <div class="blackjack-deal-controls casino-controls">
          <label>Aposta<select aria-label="Valor da aposta"></select></label>
          <button class="casino-play blackjack-deal" type="button">DISTRIBUIR</button>
        </div>
        <div class="blackjack-actions" hidden>
          <button class="blackjack-hit" type="button">PEDIR CARTA</button>
          <button class="blackjack-stand" type="button">PARAR</button>
        </div>
        <details class="casino-paytable">
          <summary>Como jogar</summary>
          <div>
            <span><b>Objetivo</b><em>chegar mais perto de 21</em></span>
            <span><b>Ás</b><em>vale 1 ou 11</em></span>
            <span><b>J, Q e K</b><em>valem 10</em></span>
            <span><b>Empate</b><em>devolve a aposta</em></span>
            <span><b>Vitória / Blackjack</b><em>retorno ×4 / ×5</em></span>
            <span><b>Vitória com 21</b><em>+1 booster</em></span>
            <span><b>Blackjack natural</b><em>+ Meowth Dealer 8/8/8/8</em></span>
          </div>
        </details>
      </div>
    </div>`;
  document.body.append(root);

  const balance = root.querySelector('.casino-balance strong');
  const betSelect = root.querySelector('select');
  const dealButton = root.querySelector('.blackjack-deal');
  const dealControls = root.querySelector('.blackjack-deal-controls');
  const actions = root.querySelector('.blackjack-actions');
  const hitButton = root.querySelector('.blackjack-hit');
  const standButton = root.querySelector('.blackjack-stand');
  const result = root.querySelector('.casino-result');
  const dealerCards = root.querySelector('.blackjack-hand.dealer .blackjack-cards');
  const playerCards = root.querySelector('.blackjack-hand.player .blackjack-cards');
  const dealerScore = root.querySelector('.blackjack-hand.dealer header strong');
  const playerScore = root.querySelector('.blackjack-hand.player header strong');
  let game = null;
  let round = null;
  let busy = false;
  let closeHook = null;

  const renderCards = (container, cards) => {
    container.innerHTML = cards.map((card, index) => {
      if (card.hidden) return `<article class="playing-card hidden-card" style="--deal-index:${index}" aria-label="Carta fechada"><i></i></article>`;
      const suit = SUITS[card.suit];
      return `<article class="playing-card${suit.red ? ' red' : ''}" style="--deal-index:${index}" aria-label="${card.rank} de ${card.suit}">
        <b>${card.rank}</b><i>${suit.glyph}</i><small>${card.rank}</small>
      </article>`;
    }).join('');
  };

  const render = () => {
    const active = round?.status === 'player-turn';
    dealControls.hidden = active;
    actions.hidden = !active;
    betSelect.disabled = busy;
    dealButton.disabled = busy;
    hitButton.disabled = busy;
    standButton.disabled = busy;
    if (!busy) dealButton.textContent = round ? 'NOVA MÃO' : 'DISTRIBUIR';
    if (!round) {
      renderCards(dealerCards, []);
      renderCards(playerCards, []);
      dealerScore.textContent = '—';
      playerScore.textContent = '—';
      return;
    }
    renderCards(dealerCards, round.dealerCards);
    renderCards(playerCards, round.playerCards);
    dealerScore.textContent = round.dealerScore ?? '?';
    playerScore.textContent = round.playerScore;
    balance.textContent = `${round.coins} 🪙`;
    root.classList.toggle('won', round.status === 'complete' && round.payout > round.bet);
    if (active) result.textContent = 'Sua vez: peça outra carta ou pare.';
    else {
      result.textContent = OUTCOME_COPY[round.outcome] || 'Mão encerrada.';
      const rewardParts = [
        round.rewards?.boosters ? `+${round.rewards.boosters} booster` : '',
        ...(round.rewards?.cards || []).map((card) => `carta ${card.name}`),
      ].filter(Boolean);
      if (rewardParts.length) result.textContent += ` Prêmio especial: ${rewardParts.join(' + ')}.`;
    }
  };

  const toastRewards = () => {
    const rewardParts = [
      round?.rewards?.boosters ? `+${round.rewards.boosters} booster` : '',
      ...(round?.rewards?.cards || []).map((card) => `carta ${card.name}`),
    ].filter(Boolean);
    if (rewardParts.length) onToast(`Blackjack: ${rewardParts.join(' + ')}!`);
    else if (round?.status === 'complete' && round.payout > round.bet)
      onToast(`Blackjack: +${round.payout - round.bet} 🪙`);
  };

  const close = () => {
    if (busy || round?.status === 'player-turn') {
      onToast('Conclua a mão antes de sair da mesa.');
      return;
    }
    if (!root.hidden) {
      root.hidden = true;
      closeHook?.();
    }
    closeHook = null;
  };

  root.querySelector('.casino-close').addEventListener('click', close);
  root.addEventListener('pointerdown', (event) => event.stopPropagation());

  async function open(gameId, options = {}) {
    hud.closeSheets();
    game = await gameItems.casinoGame(gameId);
    closeHook?.();
    closeHook = options.onClose || null;
    balance.textContent = `${game.coins} 🪙`;
    betSelect.innerHTML = game.bets.map((bet) => `<option value="${bet}">${bet} moedas</option>`).join('');
    round = game.activeRound || null;
    busy = false;
    root.classList.remove('won');
    result.textContent = round ? 'Mão recuperada. Sua vez.' : 'Faça sua aposta para receber as cartas.';
    render();
    root.hidden = false;
  }

  dealButton.addEventListener('click', async () => {
    if (busy || !game) return;
    busy = true;
    dealButton.textContent = 'EMBARALHANDO…';
    render();
    try {
      round = await gameItems.startBlackjack(game.id, Number(betSelect.value));
      render();
      if (round.status === 'complete') toastRewards();
    } catch (error) {
      result.textContent = error.message;
      onToast(error.message);
    } finally {
      busy = false;
      dealButton.textContent = 'NOVA MÃO';
      render();
    }
  });

  const act = async (action) => {
    if (busy || round?.status !== 'player-turn') return;
    busy = true;
    render();
    result.textContent = action === 'hit' ? 'Puxando uma carta…' : 'O dealer revela a mão…';
    try {
      round = await gameItems.actBlackjack(game.id, round.roundId, action);
      render();
      if (round.status === 'complete') toastRewards();
    } catch (error) {
      result.textContent = error.message;
      onToast(error.message);
    } finally {
      busy = false;
      render();
    }
  };

  hitButton.addEventListener('click', () => act('hit'));
  standButton.addEventListener('click', () => act('stand'));

  hud.register({ id: 'blackjack', isOpen: () => !root.hidden, close });
  return { open, close, isOpen: () => !root.hidden };
}
