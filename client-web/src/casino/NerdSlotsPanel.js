const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SYMBOLS = {
  bug: { icon: '👾', name: 'Bug pixel' },
  coffee: { icon: '☕', name: 'Café' },
  code: { icon: '</>', name: 'Código' },
  d20: { icon: '◈', name: 'D20' },
  rocket: { icon: '🚀', name: 'Foguete' },
};
const SYMBOL_KEYS = Object.keys(SYMBOLS);

export function createNerdSlotsPanel({ gameItems, hud, onToast = () => {} }) {
  const root = document.createElement('section');
  root.id = 'casino-nerd-slots-panel';
  root.className = 'casino-game-panel interactive';
  root.hidden = true;
  root.setAttribute('aria-label', 'Nerd Slots');
  root.innerHTML = `
    <div class="casino-shell casino-generic-shell">
      <header class="casino-head">
        <div><span>CASINO NERD</span><h2>Nerd Slots</h2></div>
        <button class="casino-close" type="button" aria-label="Fechar">×</button>
      </header>
      <div class="casino-content">
        <div class="casino-topline">
          <div class="casino-balance"><span>Saldo</span><strong>—</strong></div>
          <div class="casino-step"><span>Jackpot</span><strong>🚀 🚀 🚀 paga ×25</strong></div>
        </div>
        <section class="nerd-slot-stage" aria-label="Três rolos da máquina">
          <div class="nerd-slot-marquee"><i>👾</i><b>INSERT COIN · SHIP IT</b><i>🚀</i></div>
          <div class="nerd-slot-reels">
            <div class="nerd-slot-reel"><span>?</span></div>
            <div class="nerd-slot-reel"><span>?</span></div>
            <div class="nerd-slot-reel"><span>?</span></div>
          </div>
          <div class="nerd-slot-lights" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        </section>
        <div class="casino-result" role="status">Escolha a aposta e gire os rolos.</div>
        <div class="casino-controls">
          <label>Aposta<select aria-label="Valor da aposta"></select></label>
          <button class="casino-play nerd-slot-spin" type="button">GIRAR</button>
        </div>
        <section class="nerd-slot-paytable" aria-label="Tabela de prêmios"></section>
      </div>
    </div>`;
  document.body.append(root);

  const balance = root.querySelector('.casino-balance strong');
  const betSelect = root.querySelector('select');
  const spinButton = root.querySelector('.nerd-slot-spin');
  const reels = [...root.querySelectorAll('.nerd-slot-reel')];
  const result = root.querySelector('.casino-result');
  const paytable = root.querySelector('.nerd-slot-paytable');
  let game = null;
  let busy = false;
  let closeHook = null;

  const renderSymbol = (reel, key) => {
    const symbol = SYMBOLS[key];
    reel.dataset.symbol = key;
    reel.innerHTML = `<span aria-label="${symbol.name}">${symbol.icon}</span><small>${symbol.name}</small>`;
  };

  const randomSymbol = () => SYMBOL_KEYS[Math.floor(Math.random() * SYMBOL_KEYS.length)];

  const close = () => {
    if (busy) {
      onToast('Espere os rolos pararem antes de sair.');
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
    paytable.innerHTML = [...game.symbols].reverse().map((key) => `
      <span><i>${SYMBOLS[key].icon}</i><b>${SYMBOLS[key].name}</b><em>×${game.triplePayouts[key]}</em></span>`).join('')
      + '<span><i>◫</i><b>Qualquer par</b><em>×2</em></span>'
      + '<span><i>🎴</i><b>Qualquer trinca</b><em>+1 booster</em></span>'
      + '<span><i>⭐</i><b>Trinca D20 ou Foguete</b><em>+ Porygon Jackpot 8/8/8/8</em></span>';
    reels.forEach((reel) => renderSymbol(reel, randomSymbol()));
    root.classList.remove('won', 'spinning');
    result.textContent = 'Escolha a aposta e gire os rolos.';
    root.hidden = false;
  }

  const animate = async (symbols) => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.classList.add('spinning');
    if (!reduced) {
      for (let frame = 0; frame < 18; frame++) {
        reels.forEach((reel, index) => renderSymbol(
          reel,
          frame >= 10 + index * 3 ? symbols[index] : randomSymbol(),
        ));
        await wait(62);
      }
    }
    reels.forEach((reel, index) => renderSymbol(reel, symbols[index]));
    root.classList.remove('spinning');
  };

  spinButton.addEventListener('click', async () => {
    if (busy || !game) return;
    busy = true;
    root.classList.remove('won');
    spinButton.disabled = true;
    betSelect.disabled = true;
    spinButton.textContent = 'GIRANDO…';
    result.textContent = 'Compilando a sorte…';
    try {
      const round = await gameItems.playNerdSlots(game.id, Number(betSelect.value));
      await animate(round.symbols);
      balance.textContent = `${round.coins} 🪙`;
      root.classList.toggle('won', round.payout > 0);
      result.textContent = round.multiplier > 0
        ? `${round.multiplier === 2 ? 'Par encontrado' : 'Trinca nerd'} · prêmio ×${round.multiplier}: ${round.payout} moedas!`
        : 'Build sem prêmio. Tente outro commit.';
      const rewardParts = [
        round.rewards?.boosters ? `+${round.rewards.boosters} booster` : '',
        ...(round.rewards?.cards || []).map((card) => `carta ${card.name}`),
      ].filter(Boolean);
      if (rewardParts.length) {
        result.textContent += ` Prêmio especial: ${rewardParts.join(' + ')}.`;
        onToast(`Nerd Slots: ${rewardParts.join(' + ')}!`);
      }
      if (round.payout > round.bet) onToast(`Nerd Slots: +${round.payout - round.bet} 🪙`);
    } catch (error) {
      result.textContent = error.message;
      onToast(error.message);
    } finally {
      busy = false;
      spinButton.disabled = false;
      betSelect.disabled = false;
      spinButton.textContent = 'GIRAR NOVAMENTE';
    }
  });

  hud.register({ id: 'nerd-slots', isOpen: () => !root.hidden, close });
  return { open, close, isOpen: () => !root.hidden };
}
