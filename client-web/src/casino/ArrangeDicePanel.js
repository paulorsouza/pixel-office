const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DIE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const DEFAULT_ARRANGEMENT = [3, 5, 6, 7, 8, 9, 11];
const TUTORIAL_STORAGE_KEY = 'officeQuest.arrangeDiceTutorial.v2';
const CARD_NAMES = {
  3: 'Bússola alada', 4: 'Aeronave escarlate', 5: 'Ovo de mana',
  6: 'Espada dos ventos', 7: 'Dragão solar', 8: 'Ruínas celestes',
  9: 'Altar lunar', 10: 'Árvore dos ventos', 11: 'Brasão guardião',
};
const TUTORIAL_STEPS = [
  {
    eyebrow: 'PASSO 1 · MONTE A ROTA', title: 'Escolha e ordene 7 cartas',
    text: 'Cada carta representa uma soma de 3 a 11. Você ganha ao levantar três ou mais cartas vizinhas na ordem que montou.',
    demo: '<div class="tutorial-cards"><i>3</i><i>4</i><i>5</i><i>6</i><i>7</i><i>8</i><i>9</i></div>',
  },
  {
    eyebrow: 'PASSO 2 · LANCE UM A UM', title: 'Você começa com 5 lançamentos',
    text: 'Cada clique lança um par de dados. Se a soma estiver no seu arranjo, a carta correspondente se levanta.',
    demo: '<div class="tutorial-dice"><i>⚂</i><i>⚃</i><b>= 7</b></div>',
  },
  {
    eyebrow: 'PASSO 3 · DADOS ESPECIAIS', title: '2 acelera, 12 vira coringa',
    text: 'A soma 2 repete o lançamento e ainda dá uma rodada extra. A soma 12 remove uma rodada futura, mas deixa você levantar qualquer carta.',
    demo: '<div class="tutorial-special"><span>⚀ ⚀ <b>+2 jogadas</b></span><span>⚅ ⚅ <b>CORINGA</b></span></div>',
  },
  {
    eyebrow: 'PASSO 4 · PRÊMIOS', title: 'Complete a sequência',
    text: 'Cinco cartas vizinhas dão um Booster Raro. Seis também dão Pikachu Jogador 13/13/13/13; sete dão Mewtwo Rei 15/15/15/15. Repetições ainda multiplicam o prêmio.',
    demo: '<div class="tutorial-run"><i>7</i><i>7</i><i>7</i><b>×20</b></div>',
  },
];

const cardArt = (card) => `assets/casino/grandia3/cards/card-${card}.webp`;

export function createArrangeDicePanel({ gameItems, hud, onToast = () => {} }) {
  const root = document.createElement('section');
  root.id = 'casino-arrange-dice-panel';
  root.className = 'interactive';
  root.hidden = true;
  root.setAttribute('aria-label', 'Grandia III Arrange Dice');
  root.innerHTML = `
    <div class="casino-shell">
      <header class="casino-head">
        <div><span>CASINO NERD</span><h2>Grandia III · Arrange Dice</h2></div>
        <nav class="casino-head-actions"><button class="casino-help" type="button" aria-label="Abrir tutorial">?</button>
          <button class="casino-close" type="button" aria-label="Fechar">×</button></nav>
      </header>
      <div class="casino-content">
        <div class="casino-topline">
          <div class="casino-balance"><span>Saldo</span><strong>—</strong></div>
          <div class="casino-step"><span>Jogadas</span><strong>—</strong></div>
        </div>
        <section class="arrange-board">
          <div class="arrange-dice-stage" aria-live="polite"><div class="arrange-dice-pair"><i>⚀</i><i>⚀</i></div><span>Dados prontos</span></div>
          <div class="arrange-rolls" aria-label="Histórico de lançamentos"></div>
          <div class="arrange-sequence" aria-label="Sequência escolhida"></div>
        </section>
        <div class="casino-result" role="status">Escolha sete cartas e coloque-as na ordem desejada.</div>
        <section class="arrange-picker"><div><strong>Cartas</strong><span>selecione 7 de 9</span></div><div class="arrange-card-pool"></div></section>
        <div class="casino-controls">
          <label>Aposta<select aria-label="Valor da aposta"></select></label>
          <button class="casino-play" type="button">INICIAR RODADA</button>
        </div>
        <details class="casino-paytable">
          <summary>Regras e prêmios</summary>
          <div>
            <span><b>3 / 4 vizinhas</b><em>×4 / ×12</em></span>
            <span><b>5 vizinhas</b><em>×40 + Booster Raro</em></span>
            <span><b>6 vizinhas</b><em>×80 + Booster Raro + Pikachu Jogador 13/13/13/13</em></span>
            <span><b>Todas as 7</b><em>×200 + Booster Raro + Mewtwo Rei 15/15/15/15</em></span>
            <span><b>Carta da sequência 2× / 3×</b><em>prêmio ×3 / ×20</em></span>
            <span><b>Mesma soma 4×</b><em>Alakazam Quadra · 4 colheres · 7/7/7/7</em></span>
            <span><b>Mesma soma 5×</b><em>Alakazam Quina · 5 colheres · 9/9/9/9</em></span>
            <span><b>Soma 2</b><em>repete + dá uma rodada extra</em></span>
            <span><b>Soma 12</b><em>−1 rodada futura + carta coringa</em></span>
          </div>
        </details>
      </div>
    </div>
    <div class="arrange-tutorial" role="dialog" aria-modal="true" aria-labelledby="arrange-tutorial-title" hidden>
      <div class="arrange-tutorial-card"><button class="arrange-tutorial-close" type="button" aria-label="Fechar tutorial">×</button>
        <div class="arrange-tutorial-copy"></div><div class="arrange-tutorial-progress"></div>
        <div class="arrange-tutorial-actions"><button class="arrange-tutorial-prev" type="button">VOLTAR</button>
          <button class="arrange-tutorial-next" type="button">PRÓXIMO</button></div>
      </div>
    </div>`;
  document.body.append(root);

  const balance = root.querySelector('.casino-balance strong');
  const turns = root.querySelector('.casino-step strong');
  const diceStage = root.querySelector('.arrange-dice-stage');
  const rollsRoot = root.querySelector('.arrange-rolls');
  const sequenceRoot = root.querySelector('.arrange-sequence');
  const poolRoot = root.querySelector('.arrange-card-pool');
  const result = root.querySelector('.casino-result');
  const betSelect = root.querySelector('select');
  const playButton = root.querySelector('.casino-play');
  const tutorial = root.querySelector('.arrange-tutorial');
  const tutorialCopy = root.querySelector('.arrange-tutorial-copy');
  const tutorialProgress = root.querySelector('.arrange-tutorial-progress');
  const tutorialPrev = root.querySelector('.arrange-tutorial-prev');
  const tutorialNext = root.querySelector('.arrange-tutorial-next');
  const helpButton = root.querySelector('.casino-help');
  let game = null;
  let round = null;
  let arrangement = [...DEFAULT_ARRANGEMENT];
  let busy = false;
  let closeHook = null;
  let tutorialStep = 0;

  const active = () => round && round.status !== 'complete';
  const renderDice = (roll = null, label = 'Dados prontos') => {
    diceStage.querySelector('.arrange-dice-pair').innerHTML =
      `<i>${DIE[(roll?.die1 || 1) - 1]}</i><i>${DIE[(roll?.die2 || 1) - 1]}</i>`;
    diceStage.querySelector('span').textContent = label;
  };
  const renderRolls = () => {
    const rolls = round?.rolls || [];
    rollsRoot.innerHTML = rolls.map((roll) => {
      const special = roll.sum === 12 ? ' boxcars' : roll.sum === 2 ? ' deuce' : '';
      return `<span class="arrange-roll${special}"><i>${DIE[roll.die1 - 1]} ${DIE[roll.die2 - 1]}</i><b>${roll.sum}</b></span>`;
    }).join('') + (active() ? '<span class="arrange-roll pending"><i>?</i><b>—</b></span>' : '');
  };
  const renderSequence = () => {
    const lifted = new Set(round?.liftedCards || []);
    const winners = new Set(round?.winningRun?.cards || []);
    const wildcard = Boolean(round?.wildcardPending);
    sequenceRoot.innerHTML = arrangement.map((card, index) => {
      const isLifted = lifted.has(card);
      const locked = busy || active();
      return `<article class="arrange-card${isLifted ? ' lifted' : ''}${winners.has(card) ? ' winner' : ''}${wildcard && !isLifted ? ' wildcard-choice' : ''}" data-index="${index}">
        <button class="arrange-move left" type="button" ${index === 0 || locked ? 'disabled' : ''}>‹</button>
        <button class="arrange-number" type="button" data-wildcard-card="${card}" aria-label="${wildcard && !isLifted ? `Levantar ${card} com o coringa` : CARD_NAMES[card]}"
          ${locked && !(wildcard && !isLifted && !busy) ? 'disabled' : ''}><img src="${cardArt(card)}" alt=""><span>${card}</span></button>
        <button class="arrange-move right" type="button" ${index === arrangement.length - 1 || locked ? 'disabled' : ''}>›</button>
      </article>`;
    }).join('');
  };
  const renderPool = () => {
    poolRoot.innerHTML = (game?.cards || []).map((card) => `<button type="button" data-card="${card}"
      class="${arrangement.includes(card) ? 'selected' : ''}" aria-pressed="${arrangement.includes(card)}"
      ${busy || active() ? 'disabled' : ''}><img src="${cardArt(card)}" alt=""><span>${card}</span></button>`).join('');
  };
  const render = () => {
    renderRolls();
    renderSequence();
    renderPool();
    const wildcard = Boolean(round?.wildcardPending);
    // O amuleto muda quantos lançamentos a rodada tem. O número precisa vir do
    // servidor: fixar "5 iniciais" aqui faria a mesa mentir para quem equipou o item.
    const initial = game?.initialRolls ?? 5;
    const bonus = initial - (game?.baseInitialRolls ?? 5);
    turns.textContent = active()
      ? `${round.rollsRemaining} restantes${wildcard ? ' · CORINGA' : ''}`
      : `${initial} iniciais${bonus > 0 ? ` (+${bonus} amuleto)` : ''}`;
    betSelect.disabled = busy || active();
    playButton.disabled = busy || wildcard || (!active() && arrangement.length !== 7);
    if (busy) playButton.textContent = 'LANÇANDO…';
    else if (active()) playButton.textContent = `LANÇAR DADOS · ${round.rollsRemaining}`;
    else playButton.textContent = round ? 'NOVA RODADA' : 'INICIAR RODADA';
  };

  const rewardText = (rewards) => {
    const parts = [];
    if (rewards?.boosters) parts.push(`+${rewards.boosters} ${rewards.boosterId === 'rare' ? 'Booster Raro' : 'booster'}`);
    for (const card of rewards?.cards || []) parts.push(`carta ${card.name}`);
    return parts.length ? ` · ${parts.join(' + ')}` : '';
  };
  const finish = () => {
    balance.textContent = `${round.coins} 🪙`;
    root.classList.toggle('won', round.payout > 0);
    // Os multiplicadores viraram fracionários (a sequência de 3 paga 0,5×), então
    // formatar é obrigatório: `×0.5` cru vira "×0.5000000001" em ponto flutuante.
    const mult = (value) => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    const repeatCopy = round.repeatMultiplier > 1
      ? ` · carta ${round.sequenceRepeatCard} repetida ${round.sequenceRepeatCount}×: bônus ×${mult(round.repeatMultiplier)}`
      : '';
    result.textContent = round.payout > 0
      ? `${round.winningRun.length} cartas vizinhas${repeatCopy} · prêmio total ×${mult(round.multiplier)}: ${round.payout} moedas${rewardText(round.rewards)}!`
      : round.rewards?.cards?.length
        ? `Sem sequência de moedas, mas você ganhou ${round.rewards.cards.map((card) => card.name).join(' + ')}!`
        : 'Nenhuma sequência de três cartas vizinhas.';
    if (round.rewards?.boosters)
      onToast(`Sequência especial: +${round.rewards.boosters} Booster Raro!`);
    else if (round.rewards?.cards?.length)
      onToast(`Prêmio especial: ${round.rewards.cards.map((card) => card.name).join(', ')}!`);
    else if (round.payout > round.bet) onToast(`Arrange Dice: +${round.payout - round.bet} 🪙`);
  };
  const animateRoll = async (roll) => {
    root.classList.add('rolling');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (let frame = 0; frame < 8; frame++) {
        renderDice({ die1: 1 + Math.floor(Math.random() * 6), die2: 1 + Math.floor(Math.random() * 6) }, 'Dados no ar…');
        await wait(65);
      }
    }
    renderDice(roll, `Soma ${roll.sum}`);
    root.classList.remove('rolling');
  };

  poolRoot.addEventListener('click', (event) => {
    const button = event.target.closest('[data-card]');
    if (!button || busy || active()) return;
    const card = Number(button.dataset.card);
    arrangement = arrangement.includes(card)
      ? arrangement.filter((value) => value !== card)
      : arrangement.length < 7 ? [...arrangement, card] : arrangement;
    round = null;
    result.textContent = arrangement.length === 7 ? 'Sequência pronta.' : `Escolha mais ${7 - arrangement.length} carta(s).`;
    render();
  });
  sequenceRoot.addEventListener('click', async (event) => {
    const article = event.target.closest('[data-index]');
    if (!article || busy) return;
    const index = Number(article.dataset.index);
    if (round?.wildcardPending) {
      const card = Number(event.target.closest('[data-wildcard-card]')?.dataset.wildcardCard);
      if (!card || round.liftedCards.includes(card)) return;
      busy = true; render();
      try {
        round = await gameItems.actArrangeDice(game.id, round.roundId, 'wildcard', card);
        result.textContent = `Coringa: a carta ${card} foi levantada.`;
        if (round.status === 'complete') finish();
      } catch (error) { result.textContent = error.message; onToast(error.message); }
      finally { busy = false; render(); }
      return;
    }
    if (active()) return;
    if (event.target.closest('.arrange-number')) arrangement.splice(index, 1);
    else {
      const offset = event.target.closest('.left') ? -1 : event.target.closest('.right') ? 1 : 0;
      if (offset && arrangement[index + offset] !== undefined)
        [arrangement[index], arrangement[index + offset]] = [arrangement[index + offset], arrangement[index]];
    }
    round = null; render();
  });

  playButton.addEventListener('click', async () => {
    if (busy || !game) return;
    busy = true; root.classList.remove('won'); render();
    try {
      if (!active()) {
        round = await gameItems.playArrangeDice(game.id, Number(betSelect.value), arrangement);
        arrangement = [...round.cards];
        balance.textContent = `${round.coins} 🪙`;
        result.textContent = 'Rodada aberta. Lance o primeiro par.';
        renderDice();
      } else {
        const previousCount = round.rolls.length;
        round = await gameItems.actArrangeDice(game.id, round.roundId, 'roll');
        const roll = round.rolls[previousCount];
        await animateRoll(roll);
        if (roll.sum === 2) result.textContent = 'Snake eyes! Este lançamento se repete e você ganhou mais uma rodada.';
        else if (roll.sum === 12) result.textContent = 'Boxcars! Uma rodada futura foi removida. Escolha qualquer carta para levantar.';
        else result.textContent = `Soma ${roll.sum}${round.liftedCards.includes(roll.sum) ? ' · carta levantada!' : '.'}`;
        if (round.status === 'complete') finish();
      }
    } catch (error) { result.textContent = error.message; onToast(error.message); }
    finally { busy = false; render(); }
  });

  const renderTutorial = () => {
    const step = TUTORIAL_STEPS[tutorialStep];
    tutorialCopy.innerHTML = `<span>${step.eyebrow}</span><h3 id="arrange-tutorial-title">${step.title}</h3><p>${step.text}</p>${step.demo}`;
    tutorialProgress.innerHTML = TUTORIAL_STEPS.map((_, index) => `<i class="${index === tutorialStep ? 'active' : ''}"></i>`).join('');
    tutorialPrev.disabled = tutorialStep === 0;
    tutorialNext.textContent = tutorialStep === TUTORIAL_STEPS.length - 1 ? 'ENTENDI' : 'PRÓXIMO';
  };
  const openTutorial = () => { tutorialStep = 0; renderTutorial(); tutorial.hidden = false; };
  const closeTutorial = (remember = false) => {
    tutorial.hidden = true;
    if (remember) try { localStorage.setItem(TUTORIAL_STORAGE_KEY, 'done'); } catch {}
  };
  helpButton.addEventListener('click', openTutorial);
  root.querySelector('.arrange-tutorial-close').addEventListener('click', () => closeTutorial());
  tutorialPrev.addEventListener('click', () => { tutorialStep--; renderTutorial(); });
  tutorialNext.addEventListener('click', () => {
    if (tutorialStep < TUTORIAL_STEPS.length - 1) { tutorialStep++; renderTutorial(); }
    else closeTutorial(true);
  });
  const close = () => {
    if (busy || active()) { onToast('Conclua a rodada antes de sair da mesa.'); return; }
    if (!root.hidden) { root.hidden = true; tutorial.hidden = true; closeHook?.(); }
    closeHook = null;
  };
  root.querySelector('.casino-close').addEventListener('click', close);
  root.addEventListener('pointerdown', (event) => event.stopPropagation());

  async function open(gameId, options = {}) {
    hud.closeSheets();
    game = await gameItems.casinoGame(gameId);
    closeHook?.(); closeHook = options.onClose || null;
    round = game.activeRound || null;
    arrangement = round?.cards || DEFAULT_ARRANGEMENT.filter((card) => game.cards.includes(card));
    if (arrangement.length !== 7) arrangement = game.cards.slice(0, 7);
    balance.textContent = `${round?.coins ?? game.coins} 🪙`;
    betSelect.innerHTML = game.bets.map((bet) => `<option value="${bet}">${bet} moedas</option>`).join('');
    busy = false; root.classList.remove('won');
    renderDice(round?.rolls?.at(-1), round ? 'Rodada recuperada' : 'Dados prontos');
    result.textContent = round ? (round.wildcardPending ? 'Escolha uma carta para o coringa.' : 'Rodada recuperada. Continue lançando.') : 'Escolha sete cartas e ordene sua rota.';
    render(); root.hidden = false;
    try { if (!localStorage.getItem(TUTORIAL_STORAGE_KEY)) openTutorial(); } catch {}
  }

  hud.register({ id: 'arrange-dice', isOpen: () => !root.hidden, close });
  return { open, close, isOpen: () => !root.hidden };
}
