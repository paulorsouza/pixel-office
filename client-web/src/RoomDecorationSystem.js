import {
  createFurnitureObject,
  destroyFurnitureObject,
  furnitureCollision,
  updateFurnitureObject,
} from './MapRenderer.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // O editor continua funcional durante a sessão sem storage.
  }
}

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
 * Zona de voz que contém o ponto. Área aberta não tem parede, então o canal vem de uma
 * zona marcada com `voice` no mapa — é o que dá call próprio à sala grande. Metades com o
 * mesmo `id` (uma sala em "L") continuam sendo um canal só.
 */
export function voiceZoneAtPoint(map, x, y) {
  return (map.zones || []).find((zone) => (
    zone.voice
      && x >= zone.x && x <= zone.x + zone.w
      && y >= zone.y && y <= zone.y + zone.h
  )) || null;
}

export function roomFurniture(map, room) {
  return (map.furniture || []).filter((item) => furnitureBelongsToRoom(item, room));
}

export function replaceRoomFurniture(map, room, furniture) {
  const outside = (map.furniture || []).filter((item) => !furnitureBelongsToRoom(item, room));
  map.furniture = [...outside, ...clone(furniture)];
  return map;
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
  for (const key of ['placementId', 'inventoryItemId', 'ownerId', 'interactionType', 'instanceKey', 'owned']) {
    if (candidate?.[key] !== undefined) item[key] = candidate[key];
  }
  return item;
}

export function applyRoomDecorationState(baseMap, sceneState, catalog) {
  const map = clone(baseMap);
  for (const room of (map.rooms || [])) {
    const saved = sceneState?.[room.id];
    if (!Array.isArray(saved)) continue;
    const valid = saved
      .map((item) => normalizePlacedFurniture(catalog, item))
      .filter(Boolean);
    replaceRoomFurniture(map, room, valid);
  }
  return map;
}

export function createRoomDecorationStore(baseMaps, catalog, options = {}) {
  const storageKey = catalog.storageKey || 'office-quest-room-decoration-v1';
  let state = { version: 1, scenes: {} };
  const raw = storageGet(storageKey);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.version === 1 && parsed.scenes && typeof parsed.scenes === 'object') state = parsed;
    } catch {
      // Storage antigo ou corrompido volta ao estado vazio.
    }
  }

  const persist = () => storageSet(storageKey, JSON.stringify(state));
  const sceneState = (sceneId) => state.scenes[sceneId] || {};

  return {
    mapForScene(sceneId) {
      const baseMap = baseMaps[sceneId];
      return baseMap ? applyRoomDecorationState(baseMap, sceneState(sceneId), catalog) : null;
    },
    baseRoomFurniture(sceneId, roomId) {
      const map = baseMaps[sceneId];
      const room = map?.rooms?.find((candidate) => candidate.id === roomId);
      return room ? clone(roomFurniture(map, room)) : [];
    },
    saveRoom(sceneId, roomId, furniture) {
      const normalized = furniture
        .map((item) => normalizePlacedFurniture(catalog, item))
        .filter(Boolean);
      state.scenes[sceneId] ||= {};
      state.scenes[sceneId][roomId] = normalized;
      persist();
      options.onSave?.({ sceneId, roomId, furniture: clone(normalized) });
      return clone(normalized);
    },
    resetRoom(sceneId, roomId) {
      if (state.scenes[sceneId]) {
        delete state.scenes[sceneId][roomId];
        if (Object.keys(state.scenes[sceneId]).length === 0) delete state.scenes[sceneId];
      }
      persist();
      const furniture = this.baseRoomFurniture(sceneId, roomId);
      options.onSave?.({ sceneId, roomId, furniture: clone(furniture), reset: true });
      return furniture;
    },
    snapshot: () => clone(state),
  };
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

export function createRoomDecorationEditor(scene, map, catalog, store, equipmentMenu, gameItems = null) {
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

  const recordsInRoom = () => (scene.furnitureObjects || []).filter((record) => (
    activeRoom && record.item.owned && record.item.ownerId === gameItems?.userId
      && furnitureBelongsToRoom(record.item, activeRoom)
  ));
  const captureRoom = () => clone(recordsInRoom().map((record) => record.item));

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
    catalogGrid.innerHTML = items.map((item) => {
      const count = gameItems?.count(item.id) || 0;
      return `
      <button class="room-decoration-item${item.id === brushId ? ' active' : ''}" type="button"
        data-decoration-item="${item.id}" aria-pressed="${item.id === brushId}"
        title="${item.name}" ${count ? '' : 'disabled'}>
        <span><img src="${item.path}" alt=""></span>
        <strong>${item.name}</strong><small>${count} no inventário</small>
      </button>
    `;
    }).join('');
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

  const rebuildRoom = (items) => {
    for (const record of [...recordsInRoom()]) destroyFurnitureObject(record);
    map.furniture = (map.furniture || []).filter((item) => !furnitureBelongsToRoom(item, activeRoom));
    for (const source of items) {
      const item = normalizePlacedFurniture(catalog, source);
      if (!item) continue;
      map.furniture.push(item);
      createFurnitureObject(scene, item, map.tile || 16, scene.solids);
    }
    selectRecord(null);
  };

  const commitBefore = (before) => {
    history.push(clone(before));
    if (history.length > 50) history.shift();
    future = [];
  };

  const undo = () => {
    if (!history.length) return;
    future.push(captureRoom());
    rebuildRoom(history.pop());
    save('Alteração desfeita');
  };

  const redo = () => {
    if (!future.length) return;
    history.push(captureRoom());
    rebuildRoom(future.pop());
    save('Alteração refeita');
  };

  const removeSelected = async () => {
    if (!selected) return;
    if (!selected.item.placementId || !gameItems) return;
    const record = selected;
    const item = selected.item;
    try {
      await gameItems.remove(item.placementId);
    } catch (error) {
      setStatus(error.message, 'error');
      return;
    }
    destroyFurnitureObject(record);
    map.furniture = (map.furniture || []).filter((candidate) => candidate !== item);
    selected = null;
    renderCatalog();
    save('Móvel recolhido para o inventário');
  };

  const flipSelected = async () => {
    if (!selected) return;
    const previous = Boolean(selected.item.flipX);
    selected.item.flipX = !selected.item.flipX;
    if (!selected.item.flipX) delete selected.item.flipX;
    updateFurnitureObject(selected, true);
    try {
      await gameItems.move(selected.item.placementId, selected.item.x, selected.item.y, Boolean(selected.item.flipX));
      save('Móvel espelhado');
    } catch (error) {
      selected.item.flipX = previous;
      if (!previous) delete selected.item.flipX;
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

  const closeEditor = () => {
    if (!open) return;
    open = false;
    panel.hidden = true;
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
    history = [];
    future = [];
    panel.hidden = false;
    roomName.textContent = room.name || room.id;
    setStatus(gameItems?.isOnline() ? 'Alterações são salvas no servidor' : 'Servidor indisponível', gameItems?.isOnline() ? 'normal' : 'error');
    search.value = '';
    renderCatalog();
    drawGrid();
    loadServerRoom(room.id);
    scene.player.body.setVelocity(0, 0);
    scene.input.keyboard.resetKeys();
    scene.cameras.main.stopFollow();
    const panelWidth = panel.getBoundingClientRect().width;
    scene.cameras.main.centerOn(
      (room.x + room.w / 2) * (map.tile || 16)
        + panelWidth / (2 * scene.cameras.main.zoom),
      (room.y + room.h / 2) * (map.tile || 16),
    );
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
      const validation = validateFurniturePlacement(activeRoom, item, captureRoom());
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
      const synchronized = (scene.furnitureObjects || [])
        .find((candidate) => candidate.item.placementId === item.placementId);
      if (synchronized) {
        selectRecord(synchronized);
        renderCatalog();
        save(`${spec.name} adicionado`);
        return;
      }
      map.furniture.push(item);
      const record = createFurnitureObject(scene, item, map.tile || 16, scene.solids);
      selectRecord(record);
      renderCatalog();
      save(`${spec.name} adicionado`);
      return;
    }

    const record = recordAtPointer(pointer);
    selectRecord(record);
    if (!record) return;
    dragging = {
      record,
      before: captureRoom(),
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
    const others = recordsInRoom()
      .filter((record) => record !== dragging.record)
      .map((record) => record.item);
    const validation = validateFurniturePlacement(activeRoom, candidate, others);
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
    dragging.record.display.setTint(0xffd37a);
    if (dragging.changed) {
      updateFurnitureObject(dragging.record, true);
      try {
        await gameItems.move(
          dragging.record.item.placementId,
          dragging.record.item.x,
          dragging.record.item.y,
          Boolean(dragging.record.item.flipX),
        );
        save('Posição atualizada');
      } catch (error) {
        const previous = dragging.before.find((item) => item.placementId === dragging.record.item.placementId);
        if (previous) Object.assign(dragging.record.item, previous);
        updateFurnitureObject(dragging.record, true);
        setStatus(error.message, 'error');
      }
    }
    dragging = null;
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
    resetButton.disabled = true;
    try {
      await Promise.all(records.map((record) => gameItems.remove(record.item.placementId)));
      for (const record of records) {
        map.furniture = map.furniture.filter((item) => item !== record.item);
        destroyFurnitureObject(record);
      }
      selectRecord(null);
      renderCatalog();
      save('Todos os seus móveis foram recolhidos');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
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
