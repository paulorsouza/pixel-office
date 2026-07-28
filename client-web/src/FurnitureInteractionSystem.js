import { createWorkPanel } from './WorkPanel.js';
import { auth } from './auth.js';

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
    // O painel de trabalho tem timers e listeners próprios; fechar precisa desmontar.
    if (!value) {
      workPanel.close();
      panel.classList.remove('work');
    }
    if (value) {
      equipmentMenu.setOpen(false);
      scene.player.body.setVelocity(0, 0);
      scene.input.keyboard.resetKeys();
    }
    // O painel tem campos de texto (busca, título, comentário) e o Phaser captura
    // W/A/S/D e E/F: sem desligar o teclado da cena, digitar "casa" andava com o
    // avatar e sumia com as letras. O Escape continua funcionando porque é um
    // listener de window, não da cena.
    scene.input.keyboard.enabled = !value;
  };

  const status = (message, error = false) => {
    content.innerHTML = `<p class="interaction-message${error ? ' error' : ''}">${escapeHtml(message)}</p>`;
  };

  // Quadro, backlog, horas e objetivos são a MESMA UI do app web, servida pelo
  // backend (wwwroot/shared). O painel do jogo só a hospeda e escurece o tema.
  const workPanel = createWorkPanel({
    apiBase: gameItems.apiBase,
    token: () => auth.token(),
    userId: gameItems.userId,
    activeTaskId: () => activeTaskId,
    onActiveTaskChange: (item) => {
      activeTaskId = item?.id ?? null;
      options.onActiveTaskChange?.(item);
    },
    onTimerChange: () => options.onTimerChange?.(),
    onReward: (reward) => options.onReward?.(reward),
  });

  async function renderWork(tab) {
    // Limpa o handler herdado dos painéis em HTML puro (baú, loja, estação).
    content.onclick = null;
    // O quadro precisa de uma janela bem maior que o baú; a classe troca o tamanho.
    panel.classList.add('work');
    status('Carregando…');
    // A ★ da atividade ativa vem do backend; o jogo pode ainda não ter perguntado.
    if (activeTaskId === null) {
      activeTaskId = await gameItems.activeTaskId().catch(() => null);
    }
    try {
      await workPanel.open(content, { title, subtitle }, tab);
    } catch (error) {
      status(`Não deu para abrir o painel: ${error.message}`, true);
    }
  }

  async function renderChest(record) {
    title.textContent = 'Baú de itens';
    subtitle.textContent = 'Itens guardados deixam de aparecer no editor';
    status('Abrindo baú…');
    try {
      const [stored] = await Promise.all([gameItems.chest(record.item.placementId), gameItems.refreshInventory()]);
      const available = gameItems.inventory().filter((item) => item.location === 'inventory');
      const list = (items, action, empty) => items.length ? items.map((item) => `
        <button type="button" data-chest-action="${action}" data-item-id="${item.id}">
          <img src="${escapeHtml(item.definition.iconPath)}" alt=""><span><strong>${escapeHtml(item.definition.name)}</strong><small>${escapeHtml(item.instanceKey.slice(0, 8))}</small></span>
        </button>`).join('') : `<em>${empty}</em>`;
      content.innerHTML = `<div class="interaction-chest">
        <section><h3>Inventário</h3>${list(available, 'deposit', 'Nada disponível')}</section>
        <section><h3>Guardado</h3>${list(stored, 'withdraw', 'Baú vazio')}</section>
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
      content.innerHTML = `<div class="interaction-workstation">
        <div class="workstation-timer"><span>⏱</span><strong>Pronto para focar</strong><button type="button" data-stop-work>Encerrar contador</button></div>
        <div class="workstation-kinds">${activities.map((activity, index) => `
          <button type="button" data-kind="${escapeHtml(activity.key)}" class="${index === 0 ? 'selected' : ''}">${activity.icon} ${escapeHtml(activity.name)}</button>
        `).join('')}</div>
        <div class="workstation-tasks">${mine.map((item) => `
          <button type="button" data-start-work="${item.id}"><small>${escapeHtml(item.code)} · ${escapeHtml(item.status)}</small><strong>${escapeHtml(item.title)}</strong></button>
        `).join('') || '<em>Nenhuma atividade disponível</em>'}</div>
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

  async function renderStore() {
    title.textContent = 'Loja Tooq';
    subtitle.textContent = 'Móveis e meios de locomoção são instâncias únicas';
    status('Carregando catálogo…');
    try {
      const catalog = await gameItems.storeCatalog();
      const purchasable = (catalog.definitions || []).filter((item) => item.isPurchasable);
      content.innerHTML = `<div class="interaction-workstation">
        <div class="workstation-timer"><span>🪙</span><strong>${catalog.coins} moedas</strong></div>
        <div class="workstation-tasks">${purchasable.map((item) => `
          <button type="button" data-buy-item="${escapeHtml(item.catalogKey)}">
            <small>${escapeHtml(item.itemType)} · ${escapeHtml(item.rarity)}</small>
            <strong>${escapeHtml(item.name)} · ${item.price} 🪙</strong>
          </button>
        `).join('')}</div>
      </div>`;
      content.onclick = async (event) => {
        const button = event.target.closest('[data-buy-item]');
        if (!button) return;
        button.disabled = true;
        try {
          await gameItems.purchase(button.dataset.buyItem);
          await renderStore();
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
    kanban: () => renderWork('board'),
    chest: (record) => renderChest(record),
    workstation: (record) => renderWorkstation(record),
    timeclock: () => renderWork('hours'),
    whiteboard: (record) => renderWhiteboard(record),
    store: () => renderStore(),
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
      workPanel.refresh();
    },
    /** Objetivo concluído chegou pelo SignalR — mostra o toast se o painel estiver aberto. */
    celebrate(completions) {
      if (open) workPanel.celebrate(completions);
    },
    /**
     * Abre um painel a partir do menu, sem móvel por perto. Só vale para o que
     * não depende de uma instância no mapa: as abas de trabalho e a loja. Baú e
     * estação continuam exigindo o móvel — é ele que diz de QUAL baú se trata.
     * @param target `board | backlog | hours | goals | store`
     */
    openFromMenu(target) {
      if (open) return false;
      setOpen(true);
      if (target === 'store') renderStore();
      else renderWork(target);
      return true;
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
