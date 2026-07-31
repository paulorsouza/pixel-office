import {
  createFurnitureObject,
  destroyFurnitureObject,
  furnitureCollision,
  updateFurnitureObject,
} from './MapRenderer.js';

// A decoração do jogador é INSTÂNCIA no backend, não preferência local: o que
// existia aqui de `localStorage` (a store, o estado por cena, o `applyRoomDecorationState`)
// não participava mais do runtime desde que a mobília virou item com dono, e
// continuava construído e passado ao editor sem ninguém ler.
const clone = (value) => JSON.parse(JSON.stringify(value));

export function furnitureCatalogItem(catalog, itemId) {
  return (catalog.items || []).find((item) => item.id === itemId) || null;
}

export function furnitureBelongsToRoom(item, room) {
  const right = room.x + room.w - 1;
  const bottom = room.y + room.h - 1;
  return item.x > room.x
    && item.x < right
    && item.y > room.y + 1
    && item.y < bottom;
}

export function roomAtPoint(map, x, y) {
  return (map.rooms || []).find((room) => furnitureBelongsToRoom({ x, y }, room)) || null;
}

/**
 * Área de voz que contém o ponto. Pode ser uma zona aberta ou o prédio inteiro marcado
 * com `voice`; assim uma cena como o cassino compartilha um só call sem desenhar uma
 * "sala de reunião" artificial. Metades com o mesmo `id` continuam no mesmo canal.
 */
export function voiceZoneAtPoint(map, x, y) {
  const areas = [...(map.zones || []), ...(map.building ? [map.building] : [])];
  return areas.find((area) => (
    area.voice
      && x >= area.x && x <= area.x + area.w
      && y >= area.y && y <= area.y + area.h
  )) || null;
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

export function normalizePlacedFurniture(catalog, candidate) {
  const spec = furnitureCatalogItem(catalog, candidate?.id);
  const x = cleanNumber(candidate?.x);
  const y = cleanNumber(candidate?.y);
  if (!spec || x === null || y === null) return null;
  const item = { id: spec.id, x, y };
  if (candidate.flipX) item.flipX = true;
  if (spec.collision) item.collision = clone(spec.collision);
  // Encaixe do assento vem do CATÁLOGO, não do que o servidor devolveu: é
  // propriedade da peça, e o espelhamento é resolvido na hora de sentar
  // (`furnitureSeat`), então girar a cadeira no editor gira o assento junto.
  if (spec.seat) item.seat = clone(spec.seat);
  for (const key of ['placementId', 'inventoryItemId', 'ownerId', 'interactionType', 'instanceKey', 'owned']) {
    if (candidate?.[key] !== undefined) item[key] = candidate[key];
  }
  return item;
}

export function preloadRoomDecorationAssets(scene, catalog) {
  for (const item of (catalog.items || [])) {
    if (!scene.textures.exists(item.id)) scene.load.image(item.id, item.path);
  }
}

function rectForItem(item) {
  const collision = furnitureCollision(item);
  if (collision) {
    return {
      x: item.x + (collision.x || 0),
      y: item.y + (collision.y || 0),
      w: collision.w,
      h: collision.h,
    };
  }
  return { x: item.x + 0.15, y: item.y + 0.15, w: 0.7, h: 0.7 };
}

function overlaps(a, b) {
  const epsilon = 0.001;
  return a.x < b.x + b.w - epsilon
    && a.x + a.w > b.x + epsilon
    && a.y < b.y + b.h - epsilon
    && a.y + a.h > b.y + epsilon;
}

function doorClearances(room) {
  const right = room.x + room.w - 1;
  const bottom = room.y + room.h - 1;
  return (room.doors || []).map((door) => {
    const length = door.len || 2;
    if (door.side === 'N') {
      return { x: room.x + door.at - 0.5, y: room.y + 1, w: length + 1, h: 2.25 };
    }
    if (door.side === 'S') {
      return { x: room.x + door.at - 0.5, y: bottom - 2.25, w: length + 1, h: 2.25 };
    }
    if (door.side === 'W') {
      return { x: room.x + 1, y: room.y + door.at - 0.5, w: 2.25, h: length + 1 };
    }
    return { x: right - 2.25, y: room.y + door.at - 0.5, w: 2.25, h: length + 1 };
  });
}

export function validateFurniturePlacement(room, item, otherItems = []) {
  const rect = rectForItem(item);
  const interior = {
    x: room.x + 1,
    y: room.y + 2,
    w: room.w - 2,
    h: room.h - (room.southWall3d ? 4 : 3),
  };
  const inside = rect.x >= interior.x
    && rect.y >= interior.y
    && rect.x + rect.w <= interior.x + interior.w
    && rect.y + rect.h <= interior.y + interior.h;
  if (!inside) return { valid: false, reason: 'Fora da área útil da sala' };
  if (doorClearances(room).some((clearance) => overlaps(rect, clearance))) {
    return { valid: false, reason: 'Deixe a passagem da porta livre' };
  }
  if (furnitureCollision(item) && otherItems.some((other) => {
    const otherCollision = furnitureCollision(other);
    return otherCollision && overlaps(rect, rectForItem(other));
  })) {
    return { valid: false, reason: 'Este espaço já está ocupado' };
  }
  return { valid: true, reason: '' };
}

function snapped(value, step) {
  return Math.round(value / step) * step;
}

export function createRoomDecorationEditor(scene, map, catalog, equipmentMenu, gameItems = null) {
  const panel = document.querySelector('#room-decoration-panel');
  const close = document.querySelector('#room-decoration-close');
  const roomName = document.querySelector('#room-decoration-room');
  const status = document.querySelector('#room-decoration-status');
  const search = document.querySelector('#room-decoration-search');
  const categories = document.querySelector('#room-decoration-categories');
  const catalogGrid = document.querySelector('#room-decoration-catalog');
  const selectTool = document.querySelector('#room-decoration-select');
  const undoButton = document.querySelector('#room-decoration-undo');
  const redoButton = document.querySelector('#room-decoration-redo');
  const flipButton = document.querySelector('#room-decoration-flip');
  const deleteButton = document.querySelector('#room-decoration-delete');
  const resetButton = document.querySelector('#room-decoration-reset');
  const selectionCopy = document.querySelector('#room-decoration-selection');
  const countCopy = document.querySelector('#room-decoration-count');
  const gridStep = catalog.gridStep || 0.5;
  let open = false;
  let availableRoom = null;
  let activeRoom = null;
  let brushId = null;
  let selected = null;
  let dragging = null;
  let activeCategory = 'all';
  let history = [];
  let future = [];
  let gridGraphics = null;
  let boundaryGraphics = null;
  let subscribedRoomId = null;
  let loadingRoomId = null;

  const setStatus = (message, tone = 'normal') => {
    status.textContent = message;
    status.dataset.tone = tone;
  };

  // O que EU posso pegar e mover nesta sala.
  const recordsInRoom = () => (scene.furnitureObjects || []).filter((record) => (
    activeRoom && record.item.owned && record.item.ownerId === gameItems?.userId
      && furnitureBelongsToRoom(record.item, activeRoom)
  ));
  // O que OCUPA esta sala — inclui o cenário do Tiled e o móvel de quem divide o
  // espaço. Espaço ocupado é espaço ocupado, não importa de quem: validar só
  // contra os meus deixava empilhar cadeira em cima de mesa do cenário.
  const occupantsInRoom = () => (scene.furnitureObjects || []).filter((record) => (
    activeRoom && furnitureBelongsToRoom(record.item, activeRoom)
  ));
  const occupantsExcept = (record = null) => occupantsInRoom()
    .filter((candidate) => candidate !== record)
    .map((candidate) => candidate.item);

  const updateActions = () => {
    flipButton.disabled = !selected;
    deleteButton.disabled = !selected;
    undoButton.disabled = history.length === 0;
    redoButton.disabled = future.length === 0;
    const spec = selected ? furnitureCatalogItem(catalog, selected.item.id) : null;
    selectionCopy.textContent = spec
      ? `${spec.name} · (${selected.item.x}, ${selected.item.y})`
      : (brushId ? 'Clique na sala para posicionar' : 'Selecione ou arraste um móvel');
    countCopy.textContent = `${recordsInRoom().length} móveis`;
  };

  const selectRecord = (record) => {
    if (selected?.display?.active) selected.display.clearTint();
    selected = record || null;
    if (selected?.display?.active) selected.display.setTint(0xffd37a);
    updateActions();
  };

  const setBrush = (itemId) => {
    brushId = itemId;
    selectRecord(null);
    selectTool.classList.toggle('active', !brushId);
    for (const button of catalogGrid.querySelectorAll('[data-decoration-item]')) {
      button.classList.toggle('active', button.dataset.decorationItem === brushId);
      button.setAttribute('aria-pressed', String(button.dataset.decorationItem === brushId));
    }
    updateActions();
  };

  const renderCatalog = () => {
    const term = search.value.trim().toLocaleLowerCase('pt-BR');
    const items = (catalog.items || []).filter((item) => (
      (activeCategory === 'all' || item.category === activeCategory)
      && (!term || `${item.name} ${item.id}`.toLocaleLowerCase('pt-BR').includes(term))
    ));
    // Peça que você tem vem primeiro: o catálogo inteiro cinza, em ordem fixa,
    // fazia o editor parecer quebrado — 37 quadradinhos apagados e nenhuma pista
    // de que o que falta é ESTOQUE, não a feature.
    const stock = (item) => gameItems?.count(item.id) || 0;
    const ordered = [...items].sort((a, b) => Math.sign(stock(b)) - Math.sign(stock(a)));
    const owned = ordered.filter((item) => stock(item) > 0).length;
    catalogGrid.innerHTML = `
      ${owned ? '' : `<p class="room-decoration-empty">Seu inventário de móveis está vazio.
        Compre na <strong>Loja de móveis</strong>, na Galeria Tooq — o que você comprar
        aparece aqui na hora.</p>`}
      ${ordered.map((item) => {
    const count = stock(item);
    return `
      <button class="room-decoration-item${item.id === brushId ? ' active' : ''}" type="button"
        data-decoration-item="${item.id}" aria-pressed="${item.id === brushId}"
        title="${item.name}" ${count ? '' : 'disabled'}>
        <span><img src="${item.path}" alt=""></span>
        <strong>${item.name}</strong>
        <small>${count ? `${count} no inventário` : 'na loja'}</small>
      </button>`;
  }).join('')}`;
  };

  categories.innerHTML = [
    { id: 'all', name: 'Todos' },
    ...(catalog.categories || []),
  ].map((category) => `
    <button type="button" data-decoration-category="${category.id}"
      class="${category.id === activeCategory ? 'active' : ''}">${category.name}</button>
  `).join('');
  renderCatalog();

  const save = (message = 'Decoração salva no servidor') => {
    setStatus(message, 'saved');
    updateActions();
  };

  // ------------------------------------------------------------------ desfazer
  //
  // Desfazer é uma pilha de OPERAÇÕES INVERSAS que passam pela MESMA API, não uma
  // foto do estado. A foto tinha dois defeitos: ninguém chamava o `commitBefore`
  // que a empilhava (os dois botões viviam desabilitados, sempre), e restaurá-la
  // recriava sprites sem falar com o servidor — desfazer uma remoção devolvia à
  // sala um móvel com `placementId` que já não existia em banco, e o próximo
  // arrasto morria em 404.
  //
  // Cada operação, ao rodar, devolve a operação que desfaz o que ela acabou de
  // fazer. Então ida e volta usam exatamente o mesmo caminho de rede, e o
  // servidor continua sendo a única fonte da verdade.
  const HISTORY_LIMIT = 30;

  // Recolocar um móvel cria um placement NOVO, com id novo. As operações já
  // empilhadas apontariam para o id morto, então elas não guardam o id: guardam
  // esta alça, que é reapontada junto.
  const handles = new Map();
  const handleFor = (placementId) => {
    if (!handles.has(placementId)) handles.set(placementId, { id: placementId });
    return handles.get(placementId);
  };
  const rekey = (handle, nextId) => {
    handles.delete(handle.id);
    handle.id = nextId;
    handles.set(nextId, handle);
  };

  const undoPlace = (handle, item, name) => ({
    label: `${name} devolvido ao inventário`,
    async run() {
      await gameItems.remove(handle.id);
      removeServerPlacement({ id: handle.id });
      renderCatalog();
      return undoRemove(handle, item, name);
    },
  });

  const undoRemove = (handle, item, name) => ({
    label: `${name} de volta na sala`,
    async run() {
      const placed = await gameItems.place(
        item.id, scene.currentSceneId, activeRoom.id, item.x, item.y, Boolean(item.flipX),
      );
      rekey(handle, placed.id);
      addServerPlacement(placed);
      renderCatalog();
      return undoPlace(handle, item, name);
    },
  });

  const undoMove = (handle, before, name) => ({
    label: `${name} de volta ao lugar`,
    async run() {
      const record = findPlacement(handle.id);
      const current = {
        x: record?.item.x ?? before.x,
        y: record?.item.y ?? before.y,
        flipX: Boolean(record?.item.flipX),
      };
      await gameItems.move(handle.id, before.x, before.y, Boolean(before.flipX));
      moveServerPlacement({ id: handle.id, ...before });
      return undoMove(handle, current, name);
    },
  });

  /** "Recolher seus móveis" é uma operação só; desfazer devolve a sala inteira. */
  const undoBatch = (entries, label) => ({
    label,
    async run() {
      const inverses = [];
      for (const entry of entries) inverses.push(await entry.run());
      return undoBatch(inverses, label);
    },
  });

  const pushHistory = (entry) => {
    history.push(entry);
    if (history.length > HISTORY_LIMIT) history.shift();
    future = [];
    updateActions();
  };

  /** Roda uma ponta da pilha e joga a inversa na outra. Falha não consome nada. */
  const rewind = async (from, to) => {
    const entry = from.pop();
    if (!entry) return;
    undoButton.disabled = true;
    redoButton.disabled = true;
    try {
      to.push(await entry.run());
      setStatus(entry.label, 'saved');
    } catch (error) {
      from.push(entry);
      setStatus(error.message, 'error');
    }
    selectRecord(null);
    updateActions();
  };

  const undo = () => rewind(history, future);
  const redo = () => rewind(future, history);

  const removeSelected = async () => {
    if (!selected?.item.placementId || !gameItems) return;
    const record = selected;
    const item = clone(record.item);
    const name = furnitureCatalogItem(catalog, item.id)?.name || 'Móvel';
    const handle = handleFor(item.placementId);
    try {
      await gameItems.remove(handle.id);
    } catch (error) {
      setStatus(error.message, 'error');
      return;
    }
    destroyFurnitureObject(record);
    map.furniture = (map.furniture || []).filter((candidate) => candidate !== record.item);
    selected = null;
    renderCatalog();
    pushHistory(undoRemove(handle, item, name));
    save('Móvel recolhido para o inventário');
  };

  const flipSelected = async () => {
    if (!selected) return;
    const item = selected.item;
    const before = { x: item.x, y: item.y, flipX: Boolean(item.flipX) };
    const name = furnitureCatalogItem(catalog, item.id)?.name || 'Móvel';
    const handle = handleFor(item.placementId);
    item.flipX = !before.flipX;
    if (!item.flipX) delete item.flipX;
    updateFurnitureObject(selected, true);
    try {
      await gameItems.move(handle.id, item.x, item.y, Boolean(item.flipX));
      pushHistory(undoMove(handle, before, name));
      save('Móvel espelhado');
    } catch (error) {
      if (before.flipX) item.flipX = true; else delete item.flipX;
      updateFurnitureObject(selected, true);
      setStatus(error.message, 'error');
    }
  };

  const drawGrid = () => {
    gridGraphics?.destroy();
    boundaryGraphics?.destroy();
    const tile = map.tile || 16;
    const left = (activeRoom.x + 1) * tile;
    const top = (activeRoom.y + 2) * tile;
    const right = (activeRoom.x + activeRoom.w - 1) * tile;
    const bottom = (activeRoom.y + activeRoom.h - (activeRoom.southWall3d ? 2 : 1)) * tile;
    gridGraphics = scene.add.graphics().setDepth(-80);
    gridGraphics.fillStyle(0xf0bd68, 0.06).fillRect(left, top, right - left, bottom - top);
    gridGraphics.lineStyle(1, 0xffffff, 0.12);
    for (let x = left; x <= right; x += tile) gridGraphics.lineBetween(x, top, x, bottom);
    for (let y = top; y <= bottom; y += tile) gridGraphics.lineBetween(left, y, right, y);
    boundaryGraphics = scene.add.graphics().setDepth(999999);
    boundaryGraphics.lineStyle(1, 0xf6c66d, 0.9).strokeRect(left, top, right - left, bottom - top);
  };

  /**
   * Põe a sala no meio do que SOBRA da tela depois do painel.
   *
   * A conta antiga era fixa no eixo X ("o painel é a coluna da direita"), e no
   * celular o painel é uma gaveta que ocupa a largura inteira embaixo: deslocar
   * meia tela na horizontal jogava a sala para fora da vista, e quem abria o
   * editor no telefone via o corredor. Aqui o lado é MEDIDO, então a mesma conta
   * serve coluna à direita, coluna à esquerda e gaveta.
   */
  const centerOnRoom = (room) => {
    const tile = map.tile || 16;
    const camera = scene.cameras.main;
    const rect = panel.getBoundingClientRect();

    // Em cada eixo, a maior faixa livre ao lado do painel. Sobrando pouco dos dois
    // lados, o painel ATRAVESSA o eixo e não há para onde deslocar — é o caso da
    // coluna do desktop na vertical (ela tem quase a altura da janela) e o da
    // gaveta do celular na horizontal.
    const shift = (before, after, viewport) => {
      const free = Math.max(before, after);
      if (free < viewport * 0.25) return 0;
      const middleOfFree = after > before ? viewport - free / 2 : free / 2;
      return (viewport / 2 - middleOfFree) / camera.zoom;
    };
    camera.centerOn(
      (room.x + room.w / 2) * tile
        + shift(rect.left, window.innerWidth - rect.right, window.innerWidth),
      (room.y + room.h / 2) * tile
        + shift(rect.top, window.innerHeight - rect.bottom, window.innerHeight),
    );
  };

  const closeEditor = () => {
    if (!open) return;
    open = false;
    panel.hidden = true;
    delete document.documentElement.dataset.decorating;
    gridGraphics?.destroy();
    boundaryGraphics?.destroy();
    gridGraphics = null;
    boundaryGraphics = null;
    selectRecord(null);
    setBrush(null);
    dragging = null;
    scene.input.keyboard.resetKeys();
    scene.cameras.main.startFollow(scene.player, true, 0.12, 0.12);
  };

  const openEditor = (roomId = availableRoom?.id) => {
    const room = (map.rooms || []).find((candidate) => candidate.id === roomId);
    if (!room) return false;
    equipmentMenu.setOpen(false);
    activeRoom = room;
    open = true;
    // O histórico é da SESSÃO de edição desta sala: desfazer não atravessa portas.
    history = [];
    future = [];
    handles.clear();
    panel.hidden = false;
    // O dock mora no canto de baixo, e no celular o painel é uma gaveta que sobe
    // exatamente por cima dele. Enquanto se decora, a porta de saída é o × do
    // painel — não um botão flutuando sobre ele.
    document.documentElement.dataset.decorating = 'on';
    roomName.textContent = room.name || room.id;
    setStatus(gameItems?.isOnline() ? 'Alterações são salvas no servidor' : 'Servidor indisponível', gameItems?.isOnline() ? 'normal' : 'error');
    search.value = '';
    renderCatalog();
    drawGrid();
    loadServerRoom(room.id);
    scene.player.body.setVelocity(0, 0);
    scene.input.keyboard.resetKeys();
    scene.cameras.main.stopFollow();
    centerOnRoom(room);
    updateActions();
    return true;
  };

  const pointToPlacement = (pointer, offsetX = 0, offsetY = 0) => {
    const tile = map.tile || 16;
    return {
      x: snapped((pointer.worldX - offsetX - tile / 2) / tile, gridStep),
      y: snapped((pointer.worldY - offsetY - tile) / tile, gridStep),
    };
  };

  const recordAtPointer = (pointer) => recordsInRoom()
    .filter((record) => Phaser.Geom.Rectangle.Contains(
      record.display.getBounds(),
      pointer.worldX,
      pointer.worldY,
    ))
    .sort((a, b) => a.display.depth - b.display.depth)
    .at(-1) || null;

  const pointerDown = async (pointer) => {
    if (!open) return;
    if (brushId) {
      const spec = furnitureCatalogItem(catalog, brushId);
      const position = pointToPlacement(pointer);
      const item = normalizePlacedFurniture(catalog, { id: spec.id, ...position });
      const validation = validateFurniturePlacement(activeRoom, item, occupantsExcept());
      if (!validation.valid) {
        setStatus(validation.reason, 'error');
        return;
      }
      try {
        const placed = await gameItems.place(spec.id, scene.currentSceneId, activeRoom.id, item.x, item.y, false);
        Object.assign(item, {
          placementId: placed.id,
          inventoryItemId: placed.itemInstanceId,
          ownerId: placed.userId,
          interactionType: placed.definition.interactionType || '',
          instanceKey: placed.instanceKey,
          owned: true,
        });
      } catch (error) {
        setStatus(error.message, 'error');
        renderCatalog();
        return;
      }
      // O hub devolve o `FurniturePlaced` para quem colocou também: se o eco
      // chegou antes do `await`, o sprite já existe e não se cria um segundo.
      const synchronized = (scene.furnitureObjects || [])
        .find((candidate) => candidate.item.placementId === item.placementId);
      if (synchronized) selectRecord(synchronized);
      else {
        map.furniture.push(item);
        selectRecord(createFurnitureObject(scene, item, map.tile || 16, scene.solids));
      }
      renderCatalog();
      pushHistory(undoPlace(handleFor(item.placementId), clone(item), spec.name));
      save(`${spec.name} adicionado`);
      return;
    }

    const record = recordAtPointer(pointer);
    selectRecord(record);
    if (!record) return;
    dragging = {
      record,
      before: { x: record.item.x, y: record.item.y, flipX: Boolean(record.item.flipX) },
      offsetX: pointer.worldX - record.display.x,
      offsetY: pointer.worldY - record.display.y,
      changed: false,
    };
  };

  const pointerMove = (pointer) => {
    if (!open || !dragging) return;
    const position = pointToPlacement(pointer, dragging.offsetX, dragging.offsetY);
    if (position.x === dragging.record.item.x && position.y === dragging.record.item.y) return;
    const candidate = { ...dragging.record.item, ...position };
    const validation = validateFurniturePlacement(
      activeRoom,
      candidate,
      occupantsExcept(dragging.record),
    );
    if (!validation.valid) {
      dragging.record.display.setTint(0xff6b6b);
      setStatus(validation.reason, 'error');
      return;
    }
    dragging.record.item.x = position.x;
    dragging.record.item.y = position.y;
    dragging.record.display.setTint(0xffd37a);
    updateFurnitureObject(dragging.record, false);
    dragging.changed = true;
    setStatus('Solte para salvar a nova posição');
    updateActions();
  };

  const pointerUp = async () => {
    if (!dragging) return;
    const { record, before, changed } = dragging;
    dragging = null;
    record.display.setTint(0xffd37a);
    if (!changed) return;
    updateFurnitureObject(record, true);
    const handle = handleFor(record.item.placementId);
    try {
      await gameItems.move(handle.id, record.item.x, record.item.y, Boolean(record.item.flipX));
      pushHistory(undoMove(handle, before, furnitureCatalogItem(catalog, record.item.id)?.name || 'Móvel'));
      save('Posição atualizada');
    } catch (error) {
      Object.assign(record.item, { x: before.x, y: before.y });
      if (before.flipX) record.item.flipX = true; else delete record.item.flipX;
      updateFurnitureObject(record, true);
      setStatus(error.message, 'error');
    }
  };

  const categoryClick = (event) => {
    const button = event.target.closest('[data-decoration-category]');
    if (!button) return;
    activeCategory = button.dataset.decorationCategory;
    for (const candidate of categories.querySelectorAll('button')) {
      candidate.classList.toggle('active', candidate === button);
    }
    renderCatalog();
  };

  const catalogClick = (event) => {
    const button = event.target.closest('[data-decoration-item]');
    if (button) setBrush(button.dataset.decorationItem);
  };

  const keyDown = (event) => {
    if (!open) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      closeEditor();
      return;
    }
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (typing) return;
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    } else if ((event.ctrlKey || event.metaKey) && event.code === 'KeyY') {
      event.preventDefault();
      redo();
    } else if (event.code === 'Delete' || event.code === 'Backspace') {
      event.preventDefault();
      removeSelected();
    }
  };

  const chooseSelectTool = () => setBrush(null);
  const resetRoom = async () => {
    const records = [...recordsInRoom()];
    if (!records.length) return;
    // Esvaziar a sala com um toque é o botão mais destrutivo do editor e ficava
    // colado no rodapé, sem pergunta nenhuma.
    if (!window.confirm(
      `Recolher ${records.length} ${records.length === 1 ? 'móvel' : 'móveis'} desta sala `
      + 'para o inventário? Dá para desfazer no botão Desfazer.',
    )) return;
    resetButton.disabled = true;
    const undone = [];
    try {
      for (const record of records) {
        const item = clone(record.item);
        const name = furnitureCatalogItem(catalog, item.id)?.name || 'Móvel';
        const handle = handleFor(item.placementId);
        await gameItems.remove(handle.id);
        map.furniture = map.furniture.filter((candidate) => candidate !== record.item);
        destroyFurnitureObject(record);
        undone.push(undoRemove(handle, item, name));
      }
      selectRecord(null);
      renderCatalog();
      save('Todos os seus móveis foram recolhidos');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      // O que já saiu continua desfazível, mesmo se o meio do caminho falhou.
      if (undone.length) pushHistory(undoBatch(undone, 'Sala restaurada'));
      resetButton.disabled = false;
    }
  };

  close.onclick = closeEditor;
  selectTool.onclick = chooseSelectTool;
  undoButton.onclick = undo;
  redoButton.onclick = redo;
  flipButton.onclick = flipSelected;
  deleteButton.onclick = removeSelected;
  resetButton.onclick = resetRoom;
  categories.onclick = categoryClick;
  catalogGrid.onclick = catalogClick;
  search.oninput = renderCatalog;
  // Girar o celular troca a gaveta de tamanho e a coluna de lado: sem reenquadrar,
  // a sala fica meio escondida atrás do painel até fechar e abrir de novo.
  const onResize = () => { if (open && activeRoom) centerOnRoom(activeRoom); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  window.addEventListener('keydown', keyDown);
  scene.input.on('pointerdown', pointerDown);
  scene.input.on('pointermove', pointerMove);
  scene.input.on('pointerup', pointerUp);

  const findPlacement = (id) => (scene.furnitureObjects || [])
    .find((record) => record.item.placementId === id);
  const addServerPlacement = (placement) => {
    if (findPlacement(placement.id)) return;
    const item = normalizePlacedFurniture(catalog, {
      id: placement.definition.catalogKey,
      x: placement.x,
      y: placement.y,
      flipX: placement.flipX,
      placementId: placement.id,
      inventoryItemId: placement.itemInstanceId,
      ownerId: placement.userId,
      interactionType: placement.definition.interactionType || '',
      instanceKey: placement.instanceKey,
      owned: true,
    });
    if (!item) return;
    map.furniture.push(item);
    createFurnitureObject(scene, item, map.tile || 16, scene.solids);
    updateActions();
  };
  const moveServerPlacement = (placement) => {
    const record = findPlacement(placement.id);
    if (!record || record === dragging?.record) return;
    record.item.x = placement.x;
    record.item.y = placement.y;
    record.item.flipX = Boolean(placement.flipX);
    if (!record.item.flipX) delete record.item.flipX;
    updateFurnitureObject(record, true);
  };
  const removeServerPlacement = ({ id }) => {
    const record = findPlacement(id);
    if (!record) return;
    map.furniture = map.furniture.filter((item) => item !== record.item);
    if (selected === record) selected = null;
    destroyFurnitureObject(record);
    updateActions();
  };
  const onInventory = () => renderCatalog();
  const onPlaced = (event) => addServerPlacement(event.detail);
  const onMoved = (event) => moveServerPlacement(event.detail);
  const onRemoved = (event) => removeServerPlacement(event.detail);
  gameItems?.events.addEventListener('inventory', onInventory);
  gameItems?.events.addEventListener('FurniturePlaced', onPlaced);
  gameItems?.events.addEventListener('FurnitureMoved', onMoved);
  gameItems?.events.addEventListener('FurnitureRemoved', onRemoved);
  // Salas pessoais são parte visível da ala: do corredor, todos devem enxergar a
  // decoração já persistida. A assinatura SignalR detalhada continua seguindo a sala ativa.
  gameItems?.sceneFurniture(scene.currentSceneId)
    .then((placements) => {
      placements.forEach(addServerPlacement);
      updateActions();
    })
    .catch((error) => setStatus(error.message, 'error'));

  const loadServerRoom = (roomId) => {
    if (!gameItems || roomId === loadingRoomId) return;
    loadingRoomId = roomId;
    gameItems.joinRoom(scene.currentSceneId, roomId)
      .then((placements) => {
        subscribedRoomId = roomId;
        placements.forEach(addServerPlacement);
        updateActions();
      })
      .catch((error) => setStatus(error.message, 'error'))
      .finally(() => { if (loadingRoomId === roomId) loadingRoomId = null; });
  };

  const destroy = () => {
    closeEditor();
    close.onclick = null;
    selectTool.onclick = null;
    undoButton.onclick = null;
    redoButton.onclick = null;
    flipButton.onclick = null;
    deleteButton.onclick = null;
    resetButton.onclick = null;
    categories.onclick = null;
    catalogGrid.onclick = null;
    search.oninput = null;
    window.removeEventListener('keydown', keyDown);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    scene.input.off('pointerdown', pointerDown);
    scene.input.off('pointermove', pointerMove);
    scene.input.off('pointerup', pointerUp);
    gameItems?.events.removeEventListener('inventory', onInventory);
    gameItems?.events.removeEventListener('FurniturePlaced', onPlaced);
    gameItems?.events.removeEventListener('FurnitureMoved', onMoved);
    gameItems?.events.removeEventListener('FurnitureRemoved', onRemoved);
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);

  return {
    isOpen: () => open,
    getActiveRoom: () => activeRoom,
    open: openEditor,
    close: closeEditor,
    /**
     * Onde o avatar está, dá para decorar? Devolve a sala (ou null) — quem
     * mostra a entrada é o dock da HUD, que some sozinho quando isto é null.
     */
    updateAvailability(player, blocked = false) {
      if (open) return activeRoom;
      const tile = map.tile || 16;
      const room = roomAtPoint(map, player.body.center.x / tile, player.body.center.y / tile);
      availableRoom = room
        && room.decoratable !== false
        && (!room.ownerId || room.ownerId === gameItems?.userId)
        ? room
        : null;
      if (gameItems && availableRoom && availableRoom.id !== subscribedRoomId && availableRoom.id !== loadingRoomId) {
        loadServerRoom(availableRoom.id);
      }
      return blocked ? null : availableRoom;
    },
    destroy,
  };
}
