import { itemThumbHtml } from './hud/ItemThumb.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
})[character]);

const labels = {
  kanban: 'Abrir quadro de atividades',
  chest: 'Abrir baú',
  workstation: 'Usar computador',
  seat: 'Sentar',
  coffee: 'Fazer um café',
  timeclock: 'Lançar horas e ver objetivos',
  whiteboard: 'Abrir quadro branco',
  store: 'Abrir loja',
};

// interações que funcionam sem um GameItemInstance por trás
const SCENERY_INTERACTIONS = new Set([
  'seat', 'coffee', 'kanban', 'workstation', 'timeclock', 'whiteboard', 'store',
]);

// Cada balcão atende um tipo. O tipo vem do próprio móvel, na `interactionKey`
// ("store:cards"); balcão sem tipo declarado continua sendo a loja geral.
const STORES = {
  furniture: ['Loja de móveis', 'Mesas, cadeiras, estações e decoração'],
  equipment: ['Loja de equipamentos', 'Periféricos, acessórios e meios de locomoção'],
  cards: ['Banca de cartas', 'Boosters do Tooq Triad — abra pelo menu de Cartas'],
  '': ['Loja Tooq', 'Todo o estoque disponível'],
};

// Rodapé que explica o que o balcão NÃO vende, para a ausência não parecer defeito.
const STORE_NOTES = {
  cards: 'O Nacional e o Especial não são vendidos: o Nacional vem do cassino e das '
    + 'recompensas, e o Especial sai de dez cópias iguais no álbum.',
};

export const storeKindOf = (record) => {
  const key = String(record?.item?.interactionKey || '');
  const kind = key.startsWith('store:') ? key.slice(6) : '';
  return Object.hasOwn(STORES, kind) ? kind : '';
};

/**
 * "rare · 1/semana · resta 1". Vazio para item sem teto (todo móvel).
 * Curto de propósito: a linha divide uma coluna estreita com o nome do item.
 */
function weeklyLabel(item) {
  if (!item.weeklyLimit) return '';
  const rate = ` · ${item.weeklyLimit}/semana`;
  if (!item.weeklyRemaining) return `${rate} · volta segunda`;
  return `${rate} · resta${item.weeklyRemaining > 1 ? 'm' : ''} ${item.weeklyRemaining}`;
}

/**
 * Por que o item não pode ser comprado. Vazio quando pode.
 *
 * As três recusas são diferentes e não podem virar um "indisponível" só: já ter o
 * item é bom, faltar carteira é um objetivo, e esgotado é questão de esperar.
 */
function blockedLabel(item) {
  if (item.alreadyOwned) return 'Você já tem';
  if (item.walletLocked) return 'Exige Carteira Black';
  return '';
}

function storeRowHtml(item, coins) {
  // Duas formas de não poder comprar, e elas não se confundem: sem moeda o preço
  // continua à vista, porque juntar moeda é o que resolve; esgotado, o que importa
  // é quando volta, então o preço sai da frente.
  const soldOut = item.weeklyLimit > 0 && !item.weeklyRemaining;
  const blocked = blockedLabel(item);
  const disabled = soldOut || Boolean(blocked) || coins < item.price;
  // Desconto de carteira: o preço cheio riscado ao lado do novo é o que faz o
  // jogador VER o item que ele equipou trabalhando. Só um número menor não conta
  // essa história — ninguém decora a tabela de preços.
  const discounted = item.basePrice > item.price;
  const price = discounted
    ? `<s>${item.basePrice}</s> ${item.price} 🪙`
    : `${item.price} 🪙`;
  // Odds do baú entram na linha de baixo: comprar caixa sem ver a chance é apostar
  // no escuro, e a chance é o produto.
  const odds = (item.odds || []).map((row) => `${row.percent}% ${row.name.toLowerCase()}`).join(' · ');
  const subtitle = odds || (item.rarity + weeklyLabel(item));
  return `<button class="hud-item-row" type="button" data-buy-item="${escapeHtml(item.catalogKey)}"
    data-rarity="${escapeHtml(item.rarity)}"${disabled ? ' disabled' : ''}${soldOut ? ' data-soldout' : ''}>
    ${itemThumbHtml(item)}
    <span class="hud-item-copy"><b>${escapeHtml(item.name)}</b>
      <small>${escapeHtml(odds ? `${subtitle}${weeklyLabel(item)}` : subtitle)}</small></span>
    <span class="hud-item-action${discounted ? ' discounted' : ''}">${
      soldOut ? 'Esgotado' : blocked || price}</span>
  </button>`;
}

/**
 * Marcação do balcão. Pura de propósito: é o único jeito de conferir estoque
 * esgotado e teto semanal sem subir Phaser (ver docs/CARDGAME.md).
 * @param catalog  resposta de `GET /api/game/catalog?kind=`
 */
export function storeCatalogHtml(catalog, kind = '') {
  const coins = catalog?.coins ?? 0;
  const items = (catalog?.definitions || []).filter((item) => item.isPurchasable);
  // Item com teto carrega uma linha a mais embaixo do nome. Em três colunas essa
  // linha sobra em 70px e quebra em três; a grade larga é o que a faz caber.
  const columns = items.some((item) => item.weeklyLimit > 0) ? 'two' : 'three';
  const rows = items.map((item) => storeRowHtml(item, coins)).join('');
  const note = STORE_NOTES[kind];
  // O que a carteira equipada está fazendo, em uma linha. Sem isso o desconto é um
  // preço diferente sem explicação — e preço que muda sozinho parece bug.
  const wallet = catalog?.wallet || {};
  const perks = [
    wallet.discountPercent > 0 ? `−${wallet.discountPercent}% no preço` : '',
    wallet.weeklyBonus > 0 ? `+${wallet.weeklyBonus} no limite semanal` : '',
  ].filter(Boolean).join(' · ');
  return `<div class="hud-stack">
    <div class="hud-banner"><span class="hud-banner-icon">🪙</span>
      <b>${coins} moedas</b><small>${perks ? `carteira: ${escapeHtml(perks)}` : 'saldo da carteira'}</small></div>
    <div class="hud-item-list ${columns}">${rows || '<p class="hud-empty">Este balcão está sem estoque</p>'}</div>
    ${note ? `<p class="hud-note">${escapeHtml(note)}</p>` : ''}
  </div>`;
}

function distanceToPlayer(record, player, tile) {
  return Phaser.Math.Distance.Between(
    record.display.x,
    record.display.y,
    player.body.center.x,
    player.body.center.y,
  ) / tile;
}

export function createFurnitureInteractionSystem(scene, map, gameItems, equipmentMenu, options = {}) {
  const panel = document.querySelector('#furniture-interaction-panel');
  const title = document.querySelector('#furniture-interaction-title');
  const subtitle = document.querySelector('#furniture-interaction-subtitle');
  const content = document.querySelector('#furniture-interaction-content');
  const closeButton = document.querySelector('#furniture-interaction-close');
  let open = false;
  let nearby = null;
  let workingTarget = null;
  let activeTaskId = options.activeTaskId ?? null;

  // Móvel do inventário: tem placement no backend, então serve para qualquer interação.
  const ownedInteractive = () => (scene.furnitureObjects || []).filter((record) => (
    record.item.owned && record.item.ownerId === gameItems.userId && record.item.interactionType
  ));
  // Móvel do cenário (vem do Tiled): não tem placement, então só valem as interações
  // que não dependem de um item do inventário — sentar e tirar café.
  const sceneryInteractive = () => (scene.furnitureObjects || []).filter((record) => (
    !record.item.owned && SCENERY_INTERACTIONS.has(record.item.interactionType)
  ));
  const interactive = () => [...ownedInteractive(), ...sceneryInteractive()];

  const setOpen = (value) => {
    open = value;
    panel.hidden = !value;
    if (value) {
      equipmentMenu.setOpen(false);
      scene.player.body.setVelocity(0, 0);
    }
    // Quem liga/desliga o teclado da cena é o KeyboardGuard (`hud/KeyboardGuard.js`),
    // dono único desse estado: aqui só avisamos que a situação mudou. Fazer isso
    // localmente era o que fazia W/A/S/D/E sumirem dos campos de texto — desligar
    // o plugin não desarma o `preventDefault` do manager do Phaser.
    options.onBlockingChange?.();
  };

  const status = (message, error = false) => {
    content.innerHTML = `<p class="interaction-message${error ? ' error' : ''}">${escapeHtml(message)}</p>`;
  };

  // Quadro e relógio de ponto não desenham nada aqui: abrem a seção do MENU,
  // que já hospeda a UI compartilhada do backend. Este módulo tinha uma segunda
  // instância daquele painel — dois conjuntos de timers e listeners para a
  // mesma tela, e duas chances de divergir.

  async function renderChest(record) {
    title.textContent = 'Baú de itens';
    subtitle.textContent = 'Itens guardados deixam de aparecer no editor';
    status('Abrindo baú…');
    try {
      const [stored] = await Promise.all([gameItems.chest(record.item.placementId), gameItems.refreshInventory()]);
      const available = gameItems.inventory().filter((item) => item.location === 'inventory');
      const list = (items, action, empty) => (items.length ? items.map((item) => `
        <button class="hud-item-row" type="button" data-chest-action="${action}" data-item-id="${item.id}">
          ${itemThumbHtml(item.definition)}
          <span class="hud-item-copy"><b>${escapeHtml(item.definition.name)}</b>
            <small>${escapeHtml(item.definition.category || item.definition.itemType)}</small></span>
          <span class="hud-item-action">${action === 'deposit' ? 'Guardar' : 'Pegar'}</span>
        </button>`).join('') : `<p class="hud-empty">${empty}</p>`);
      content.innerHTML = `<div class="hud-two-columns">
        <section class="hud-column"><header>Inventário</header><div class="hud-item-list">${list(available, 'deposit', 'Nada disponível')}</div></section>
        <section class="hud-column"><header>Guardado no baú</header><div class="hud-item-list">${list(stored, 'withdraw', 'Baú vazio')}</div></section>
      </div>`;
      content.onclick = async (event) => {
        const button = event.target.closest('[data-chest-action]');
        if (!button) return;
        button.disabled = true;
        try {
          await gameItems.transferChest(record.item.placementId, Number(button.dataset.itemId), button.dataset.chestAction);
          await renderChest(record);
        } catch (error) {
          subtitle.textContent = error.message;
          button.disabled = false;
        }
      };
    } catch (error) {
      status(error.message, true);
    }
  }

  async function renderWorkstation(record) {
    workingTarget = record.item.placementId || record.item.interactionKey;
    title.textContent = 'Estação de trabalho';
    subtitle.textContent = 'O tempo será registrado na atividade escolhida';
    status('Carregando atividades…');
    try {
      const [items, activities] = await Promise.all([
        gameItems.workItems(),
        gameItems.activityTypes(),
      ]);
      const mine = items.filter((item) => (
        item.status !== 'Done' && (!item.assigneeId || item.assigneeId === gameItems.userId)
      ));
      // O contador da estação também aceita pair e code review, não só desenvolvimento.
      content.innerHTML = `<div class="hud-stack">
        <div class="hud-banner"><span class="hud-banner-icon">⏱</span>
          <b>Pronto para focar</b>
          <button class="cg-btn" type="button" data-stop-work>Encerrar contador</button></div>
        <div class="hud-chips">${activities.map((activity, index) => `
          <button class="hud-chip${index === 0 ? ' on' : ''}" type="button" data-kind="${escapeHtml(activity.key)}">${activity.icon} ${escapeHtml(activity.name)}</button>
        `).join('')}</div>
        <div class="hud-item-list two">${mine.map((item) => `
          <button class="hud-item-row" type="button" data-start-work="${item.id}">
            <span class="hud-item-copy"><b>${escapeHtml(item.title)}</b>
              <small>${escapeHtml(item.code)} · ${escapeHtml(item.status)}</small></span>
            <span class="hud-item-action">Focar</span>
          </button>
        `).join('') || '<p class="hud-empty">Nenhuma atividade disponível</p>'}</div>
      </div>`;
      let activityKey = activities[0]?.key ?? 'task';
      content.onclick = async (event) => {
        const kind = event.target.closest('[data-kind]');
        if (kind) {
          activityKey = kind.dataset.kind;
          for (const button of content.querySelectorAll('[data-kind]')) {
            button.classList.toggle('selected', button === kind);
          }
          return;
        }
        const start = event.target.closest('[data-start-work]');
        const stop = event.target.closest('[data-stop-work]');
        if (!start && !stop) return;
        try {
          if (stop) {
            const result = await gameItems.stopWork();
            options.onWorkStopped?.();
            options.onReward?.(result);
            subtitle.textContent = result?.minutes
              ? `${result.minutes}min registrados · +${result.xp} XP · +${result.gold} 🪙`
              : 'Contador encerrado e horas registradas';
          } else {
            const session = await gameItems.startWork(workingTarget, Number(start.dataset.startWork), activityKey);
            options.onWorkStarted?.(session);
            options.onActiveTaskChange?.({ id: session.workItemId });
            subtitle.textContent = `Contando tempo em ${session.code}`;
          }
        } catch (error) {
          subtitle.textContent = error.message;
        }
      };
    } catch (error) {
      status(error.message, true);
    }
  }


  function renderWhiteboard(record) {
    const boardKey = record.item.interactionKey || `${scene.currentSceneId}:whiteboard`;
    title.textContent = 'Quadro branco';
    subtitle.textContent = 'Abra o diagrams.net para desenhar diagramas';
    content.innerHTML = `<p class="interaction-message">O quadro usa uma chave estável desta sala: <strong>${escapeHtml(boardKey)}</strong>.</p>
      <p><a class="interaction-primary" href="https://app.diagrams.net/?ui=kennedy&spin=1"
        target="_blank" rel="noopener noreferrer">Abrir no draw.io</a></p>`;
  }

  async function renderStore(record) {
    const kind = storeKindOf(record);
    const [storeName, storeCopy] = STORES[kind];
    title.textContent = storeName;
    subtitle.textContent = storeCopy;
    status('Carregando catálogo…');
    try {
      const catalog = await gameItems.storeCatalog(kind);
      content.innerHTML = storeCatalogHtml(catalog, kind);
      content.onclick = async (event) => {
        const button = event.target.closest('[data-buy-item]');
        if (!button) return;
        button.disabled = true;
        try {
          const bought = await gameItems.purchase(button.dataset.buyItem);
          // Booster não entra no inventário: o retorno traz o saldo do perfil.
          if (typeof bought?.boosters === 'number') {
            options.onWorkStatus?.(`${bought.definition?.name || 'Booster'} comprado — você tem ${bought.boosters}`);
          }
          await renderStore(record);
        } catch (error) {
          subtitle.textContent = error.message;
          button.disabled = false;
        }
      };
    } catch (error) {
      status(error.message, true);
    }
  }

  const handlers = {
    kanban: () => { options.openMenu?.('board'); return false; },
    chest: (record) => renderChest(record),
    workstation: (record) => renderWorkstation(record),
    timeclock: () => { options.openMenu?.('hours'); return false; },
    whiteboard: (record) => renderWhiteboard(record),
    store: (record) => renderStore(record),
    async seat(record) {
      // sentar de fato é estado com dono (a cadeira fica ocupada para todos)
      if ((await options.onSeat?.(record)) === false) return false;
      if (record.item.interactionKey) {
        try {
          const session = await gameItems.startWork(record.item.interactionKey, null);
          options.onWorkStarted?.(session);
          options.onWorkStatus?.(`Contando tempo em ${session.code}`);
        } catch (error) {
          options.onWorkStatus?.(error.message);
        }
      }
      return false;
    },
    coffee(record) {
      // sem painel: tira um café da bancada e sai carregando
      options.onCoffee?.(record);
      return false;
    },
  };

  async function interact() {
    if (!nearby || open) return false;
    setOpen(true);
    // handler pode devolver false quando não há painel a mostrar (ex.: só sentar)
    const rendered = await handlers[nearby.item.interactionType]?.(nearby);
    if (rendered === false) setOpen(false);
    return true;
  }

  closeButton.onclick = () => setOpen(false);
  const keydown = (event) => {
    if (!open || event.code !== 'Escape') return;
    event.preventDefault();
    // Escape fecha o de dentro para fora: primeiro o diálogo do card, depois o painel.
    // O diálogo vive na camada presa à viewport, fora do painel.
    const dialog = document.querySelector('body > .wq-layer.fixed .wq-backdrop');
    if (dialog) dialog.remove();
    else setOpen(false);
  };
  window.addEventListener('keydown', keydown);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    closeButton.onclick = null;
    content.onclick = null;
    window.removeEventListener('keydown', keydown);
    setOpen(false);
  });

  return {
    isOpen: () => open,
    close: () => setOpen(false),
    interact,
    /** A estação/mesa mudou a atividade ativa: o quadro precisa mover a ★. */
    setActiveTask(id) {
      activeTaskId = id ?? null;
      options.onActiveTaskChange?.({ id });
    },
    openForType(type) {
      const record = interactive().find((candidate) => candidate.item.interactionType === type);
      if (!record) return false;
      setOpen(true);
      const rendered = handlers[type]?.(record);
      if (rendered === false) setOpen(false);
      return true;
    },
    update(player, blocked = false) {
      nearby = blocked || open ? null : interactive()
        .map((record) => ({ record, distance: distanceToPlayer(record, player, map.tile || 16) }))
        .filter((entry) => entry.distance <= 2.2)
        .sort((a, b) => a.distance - b.distance)[0]?.record || null;
      if (!nearby) return null;
      const label = nearby.item.interactionType === 'seat' && nearby.item.interactionKey
        ? 'Sentar e trabalhar'
        : (labels[nearby.item.interactionType] || 'Interagir');
      return { label };
    },
  };
}
