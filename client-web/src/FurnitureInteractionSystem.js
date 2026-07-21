const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
})[character]);

const labels = {
  kanban: 'Abrir quadro de atividades',
  chest: 'Abrir baú',
  workstation: 'Usar computador',
  seat: 'Sentar e trabalhar',
};

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
  let workingPlacementId = null;

  const ownedInteractive = () => (scene.furnitureObjects || []).filter((record) => (
    record.item.owned && record.item.ownerId === gameItems.userId && record.item.interactionType
  ));

  const setOpen = (value) => {
    open = value;
    panel.hidden = !value;
    if (value) {
      equipmentMenu.setOpen(false);
      scene.player.body.setVelocity(0, 0);
      scene.input.keyboard.resetKeys();
    }
  };

  const status = (message, error = false) => {
    content.innerHTML = `<p class="interaction-message${error ? ' error' : ''}">${escapeHtml(message)}</p>`;
  };

  async function renderKanban() {
    title.textContent = 'Quadro de atividades';
    subtitle.textContent = 'Escolha a atividade que será contada na estação';
    status('Carregando quadro…');
    try {
      const items = await gameItems.workItems();
      const columns = ['Backlog', 'Todo', 'InProgress', 'Review', 'Done'];
      content.innerHTML = `<div class="interaction-kanban">${columns.map((column) => `
        <section><h3>${column}</h3>${items.filter((item) => item.status === column).map((item) => `
          <button type="button" data-work-item="${item.id}" ${item.status === 'Done' ? 'disabled' : ''}>
            <small>${escapeHtml(item.code)}</small><strong>${escapeHtml(item.title)}</strong>
          </button>`).join('') || '<em>Vazio</em>'}</section>
      `).join('')}</div>`;
      content.onclick = async (event) => {
        const button = event.target.closest('[data-work-item]');
        if (!button) return;
        try {
          await gameItems.setActiveTask(Number(button.dataset.workItem));
          for (const candidate of content.querySelectorAll('[data-work-item]')) candidate.classList.toggle('selected', candidate === button);
          subtitle.textContent = 'Atividade ativa atualizada';
        } catch (error) {
          subtitle.textContent = error.message;
        }
      };
    } catch (error) {
      status(error.message, true);
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
    workingPlacementId = record.item.placementId;
    title.textContent = 'Estação de trabalho';
    subtitle.textContent = 'O tempo será registrado na atividade escolhida';
    status('Carregando atividades…');
    try {
      const items = (await gameItems.workItems()).filter((item) => (
        item.status !== 'Done' && (!item.assigneeId || item.assigneeId === gameItems.userId)
      ));
      content.innerHTML = `<div class="interaction-workstation">
        <div class="workstation-timer"><span>⏱</span><strong>Pronto para focar</strong><button type="button" data-stop-work>Encerrar contador</button></div>
        <div class="workstation-tasks">${items.map((item) => `
          <button type="button" data-start-work="${item.id}"><small>${escapeHtml(item.code)} · ${escapeHtml(item.status)}</small><strong>${escapeHtml(item.title)}</strong></button>
        `).join('') || '<em>Nenhuma atividade disponível</em>'}</div>
      </div>`;
      content.onclick = async (event) => {
        const start = event.target.closest('[data-start-work]');
        const stop = event.target.closest('[data-stop-work]');
        if (!start && !stop) return;
        try {
          if (stop) {
            await gameItems.stopWork();
            subtitle.textContent = 'Contador encerrado e horas registradas';
          } else {
            const session = await gameItems.startWork(workingPlacementId, Number(start.dataset.startWork));
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

  const handlers = {
    kanban: (record) => renderKanban(record),
    chest: (record) => renderChest(record),
    workstation: (record) => renderWorkstation(record),
    seat(record) {
      // sentar de fato é estado com dono (a cadeira fica ocupada para todos)
      options.onSeat?.(record);
      const tile = map.tile || 16;
      const workstation = ownedInteractive()
        .filter((candidate) => candidate.item.interactionType === 'workstation')
        .map((candidate) => ({ candidate, distance: Phaser.Math.Distance.Between(
          record.display.x, record.display.y, candidate.display.x, candidate.display.y,
        ) / tile }))
        .filter((entry) => entry.distance <= 2.75)
        .sort((a, b) => a.distance - b.distance)[0]?.candidate;
      if (workstation) return renderWorkstation(workstation);
      // sem estação por perto não há painel: o jogador só senta
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
    if (open && event.code === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
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
    openForType(type) {
      const record = ownedInteractive().find((candidate) => candidate.item.interactionType === type);
      if (!record) return false;
      setOpen(true);
      handlers[type]?.(record);
      return true;
    },
    update(player, blocked = false) {
      nearby = blocked || open ? null : ownedInteractive()
        .map((record) => ({ record, distance: distanceToPlayer(record, player, map.tile || 16) }))
        .filter((entry) => entry.distance <= 2.2)
        .sort((a, b) => a.distance - b.distance)[0]?.record || null;
      return nearby ? { label: labels[nearby.item.interactionType] || 'Interagir' } : null;
    },
  };
}
