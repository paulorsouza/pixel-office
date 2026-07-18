export const DEFAULT_WALK_SPEED = 112;

export function equipmentById(catalog, equipmentId) {
  return (catalog.items || []).find((item) => item.id === equipmentId) || null;
}

export function movementProfile(catalog, equipmentId, shiftDown) {
  const selected = equipmentById(catalog, equipmentId);
  const equipment = selected?.slot === 'vehicle' && Number.isFinite(selected.speed)
    ? selected
    : null;
  const active = Boolean(equipment && shiftDown);
  return {
    active,
    equipment,
    speed: active ? equipment.speed : (catalog.walkSpeed || DEFAULT_WALK_SPEED),
  };
}

export function riderAnimationSpec(equipment, direction, fallbackStart) {
  const directionSpec = equipment.riderDirections?.[direction] || {};
  const start = directionSpec.start
    ?? equipment.riderDirectionStarts?.[direction]
    ?? fallbackStart;
  const frameCount = directionSpec.frameCount || equipment.riderFramesPerDirection || 6;
  return {
    sheet: directionSpec.sheet || equipment.riderSheet,
    frameWidth: directionSpec.frameWidth || equipment.riderFrameWidth || 16,
    start,
    end: start + frameCount - 1,
    frameRate: directionSpec.frameRate || equipment.frameRate,
  };
}

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // O jogo continua funcional quando o navegador bloqueia storage.
  }
}

const RARITY_LABELS = {
  common: 'Comum',
  uncommon: 'Incomum',
  rare: 'Raro',
  epic: 'Épico',
};

function slotDefinitions(catalog) {
  if (catalog.slots?.length) return catalog.slots;
  return [{ id: 'vehicle', name: 'Veículo', shortLabel: 'VC', description: 'Segure Shift para usar' }];
}

function emptyLoadout(catalog) {
  return Object.fromEntries(slotDefinitions(catalog).map((slot) => [slot.id, null]));
}

export function normalizeLoadout(catalog, candidate = {}) {
  const loadout = emptyLoadout(catalog);
  for (const slot of slotDefinitions(catalog)) {
    const item = equipmentById(catalog, candidate?.[slot.id]);
    if (item?.slot === slot.id) loadout[slot.id] = item.id;
  }
  return loadout;
}

function initialLoadout(catalog, rawStored) {
  if (rawStored) {
    try {
      const parsed = JSON.parse(rawStored);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return normalizeLoadout(catalog, parsed);
      }
    } catch {
      const legacyVehicle = equipmentById(catalog, rawStored);
      if (legacyVehicle?.slot === 'vehicle') {
        return normalizeLoadout(catalog, { vehicle: legacyVehicle.id });
      }
    }
  }
  return normalizeLoadout(catalog, { vehicle: catalog.defaultEquipment });
}

function itemIcon(item, className = '') {
  const icon = item?.icon || item?.slot || 'empty';
  const label = item?.shortLabel || '';
  return `<span class="item-glyph icon-${icon} ${className}" aria-hidden="true"><b>${label}</b><i></i></span>`;
}

export function createEquipmentMenu(catalog, options = {}) {
  const storageKey = options.storageKey || 'office-quest-equipment-v1';
  const root = document.querySelector('#equipment-menu');
  const list = document.querySelector('#equipment-list');
  const slotsRoot = document.querySelector('#equipment-slots');
  const clear = document.querySelector('#equipment-clear');
  const close = document.querySelector('#equipment-close');
  const loadoutCount = document.querySelector('#equipment-loadout-count');
  const inventoryCount = document.querySelector('#equipment-inventory-count');
  const slots = slotDefinitions(catalog);
  const vehicles = (catalog.items || []).filter((item) => item.slot === 'vehicle');
  let loadout = initialLoadout(catalog, storageGet(storageKey));
  let open = false;

  list.innerHTML = (catalog.items || []).map((item, index) => `
    <button class="inventory-item rarity-${item.rarity || 'common'}" type="button"
      data-equipment-id="${item.id}" style="--item-accent:${item.accent};--item-secondary:${item.secondary}">
      <span class="inventory-item-art">
        ${itemIcon(item)}
        <span class="inventory-equipped-mark" aria-hidden="true">E</span>
      </span>
      <strong>${item.name}</strong>
      <span>${slots.find((slot) => slot.id === item.slot)?.name || 'Item'}</span>
      <small>${item.slot === 'vehicle' ? `${item.speed} px/s · ${vehicles.indexOf(item) + 1}` : RARITY_LABELS[item.rarity] || 'Comum'}</small>
    </button>
  `).join('');
  inventoryCount.textContent = `${catalog.items?.length || 0} itens`;

  const renderSlots = () => {
    slotsRoot.innerHTML = slots.map((slot) => {
      const item = equipmentById(catalog, loadout[slot.id]);
      const style = item
        ? `--item-accent:${item.accent};--item-secondary:${item.secondary}`
        : '';
      return `
        <button class="equipment-slot slot-${slot.id}${item ? ' filled' : ''}" type="button"
          data-slot-id="${slot.id}" style="${style}"
          aria-label="${item ? `${slot.name}: ${item.name}. Clique para guardar no baú.` : `${slot.name}: vazio`}">
          <span class="equipment-slot-label">${slot.name}</span>
          ${item ? itemIcon(item, 'slot-item-glyph') : `<span class="empty-slot-mark">${slot.shortLabel}</span>`}
          <span class="equipment-slot-value">${item?.name || 'Vazio'}</span>
          ${item ? '<span class="equipment-slot-remove" aria-hidden="true">×</span>' : ''}
        </button>
      `;
    }).join('');
  };

  const syncSelection = () => {
    const vehicle = equipmentById(catalog, loadout.vehicle);
    const equippedIds = new Set(Object.values(loadout).filter(Boolean));
    const equippedTotal = equippedIds.size;
    for (const card of list.querySelectorAll('.inventory-item')) {
      const equipped = equippedIds.has(card.dataset.equipmentId);
      card.classList.toggle('equipped', equipped);
      card.setAttribute('aria-pressed', String(equipped));
    }
    renderSlots();
    loadoutCount.textContent = `${equippedTotal}/${slots.length} equipados`;
    clear.disabled = equippedTotal === 0;
    storageSet(storageKey, JSON.stringify(loadout));
    options.onChange?.(vehicle, { ...loadout });
  };

  const setOpen = (nextOpen) => {
    if (nextOpen && options.isBlocked?.()) return false;
    open = Boolean(nextOpen);
    root.hidden = !open;
    if (open) {
      root.querySelector(
        '#character-panel-view:not([hidden]) .character-option.selected, '
        + '#character-panel-view:not([hidden]) .character-option, '
        + '#equipment-panel-view:not([hidden]) .inventory-item.equipped, '
        + '#equipment-panel-view:not([hidden]) .inventory-item',
      )?.focus();
    }
    else if (root.contains(document.activeElement)) document.activeElement.blur();
    return open;
  };

  const select = (equipmentId) => {
    if (!equipmentId) {
      loadout.vehicle = null;
      syncSelection();
      return null;
    }
    const item = equipmentById(catalog, equipmentId);
    if (!item?.slot || !Object.hasOwn(loadout, item.slot)) return null;
    loadout[item.slot] = item.id;
    syncSelection();
    return item;
  };

  const unequip = (slotId) => {
    if (!Object.hasOwn(loadout, slotId)) return;
    loadout[slotId] = null;
    syncSelection();
  };

  const clearAll = () => {
    loadout = emptyLoadout(catalog);
    syncSelection();
  };

  close.addEventListener('click', () => setOpen(false));
  clear.addEventListener('click', clearAll);
  list.addEventListener('click', (event) => {
    const card = event.target.closest('.inventory-item');
    if (!card) return;
    select(card.dataset.equipmentId);
  });
  slotsRoot.addEventListener('click', (event) => {
    const slot = event.target.closest('.equipment-slot');
    if (!slot || !loadout[slot.dataset.slotId]) return;
    unequip(slot.dataset.slotId);
  });

  window.addEventListener('keydown', (event) => {
    const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (editing || event.repeat) return;
    if (event.code === 'Tab') {
      event.preventDefault();
      if (options.isBlocked?.()) return;
      setOpen(!open);
      return;
    }
    if (event.code === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (!open) return;
    const index = Number.parseInt(event.key, 10) - 1;
    if (index >= 0 && index < vehicles.length) {
      event.preventDefault();
      select(vehicles[index].id);
    } else if (event.key === '0') {
      event.preventDefault();
      unequip('vehicle');
    }
  });

  syncSelection();

  return {
    getEquippedId: () => loadout.vehicle,
    getEquipment: () => equipmentById(catalog, loadout.vehicle),
    getLoadout: () => ({ ...loadout }),
    isOpen: () => open,
    setOpen,
    select,
    unequip,
    clearAll,
  };
}

const OUTLINE = 0x25263d;
const TIRE = 0x161722;
const METAL = 0xb9c5cf;

function colorNumber(value, fallback) {
  const parsed = Number.parseInt(String(value || '').replace('#', ''), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fill(graphics, color, x, y, width, height, alpha = 1) {
  graphics.fillStyle(color, alpha);
  graphics.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

function wheel(graphics, x, y, phase) {
  fill(graphics, TIRE, x, y, 4, 3);
  fill(graphics, phase ? METAL : 0x77828e, x + 1, y + 1, 2, 1);
}

function drawTrail(graphics, equipment, direction, phase) {
  const length = equipment.trail || 0;
  if (!length) return;
  const accent = colorNumber(equipment.secondary, 0xffffff);
  const signX = direction === 'right' ? -1 : direction === 'left' ? 1 : 0;
  const signY = direction === 'down' ? -1 : direction === 'up' ? 1 : 0;
  for (let index = 0; index < Math.min(length, 4); index += 1) {
    const distance = 9 + index * 4 + phase * 2;
    const x = signX ? signX * distance - 1 : -4 + index * 3;
    const y = signY ? 13 + signY * distance : 13 + index % 2;
    fill(graphics, accent, x, y, index === 3 ? 1 : 2, 1, 0.32 - index * 0.05);
  }
}

function drawSkate(graphics, equipment, direction, phase) {
  const accent = colorNumber(equipment.accent, 0xf4b942);
  const secondary = colorNumber(equipment.secondary, 0xe66b45);
  if (direction === 'up' || direction === 'down') {
    fill(graphics, OUTLINE, -4, 5, 8, 15);
    fill(graphics, accent, -3, 6, 6, 13);
    fill(graphics, secondary, -2, 8, 4, 3);
    fill(graphics, 0xffe09a, -2, 15, 4, 2);
    wheel(graphics, -2, 3, phase);
    wheel(graphics, -2, 19, 1 - phase);
    return;
  }
  fill(graphics, OUTLINE, -11, 12, 22, 5);
  fill(graphics, OUTLINE, -10, 11, 3, 2);
  fill(graphics, OUTLINE, 7, 11, 3, 2);
  fill(graphics, accent, -9, 12, 18, 2);
  fill(graphics, secondary, -3, 13, 6, 1);
  fill(graphics, 0xffe09a, direction === 'right' ? 4 : -7, 12, 3, 1);
  fill(graphics, METAL, -7, 15, 4, 1);
  fill(graphics, METAL, 3, 15, 4, 1);
  wheel(graphics, -9, 16, phase);
  wheel(graphics, 5, 16, 1 - phase);
}

function drawSideRollerBoot(graphics, accent, secondary, direction, x, y, phase) {
  const facingRight = direction === 'right';
  fill(graphics, OUTLINE, x, y, 7, 5);
  fill(graphics, accent, x + 1, y + 1, 5, 2);
  fill(graphics, OUTLINE, facingRight ? x : x + 3, y - 2, 4, 4);
  fill(graphics, secondary, facingRight ? x + 1 : x + 4, y - 1, 2, 3);
  fill(graphics, METAL, x + 1, y + 4, 5, 1);
  fill(graphics, TIRE, x + 1, y + 5, 2, 2);
  fill(graphics, TIRE, x + 4, y + 5, 2, 2);
  fill(graphics, phase ? METAL : 0x77828e, x + 1, y + 5, 1, 1);
  fill(graphics, phase ? 0x77828e : METAL, x + 5, y + 5, 1, 1);
}

function drawTopRollerBoot(graphics, accent, secondary, x, y, phase) {
  fill(graphics, OUTLINE, x, y, 5, 8);
  fill(graphics, accent, x + 1, y + 1, 3, 5);
  fill(graphics, secondary, x + 1, y + 1, 3, 2);
  fill(graphics, METAL, x, y + 6, 5, 1);
  fill(graphics, TIRE, x - 1, y + 2, 1, 2);
  fill(graphics, TIRE, x + 5, y + 2, 1, 2);
  fill(graphics, TIRE, x - 1, y + 5, 1, 2);
  fill(graphics, TIRE, x + 5, y + 5, 1, 2);
  fill(graphics, phase ? METAL : 0x77828e, x + 2, y + 6, 1, 1);
}

function drawRollerSkates(graphics, equipment, direction, phase) {
  const accent = colorNumber(equipment.accent, 0x65d6c4);
  const secondary = colorNumber(equipment.secondary, 0x5577d8);
  if (direction === 'up' || direction === 'down') {
    drawTopRollerBoot(graphics, accent, secondary, -6, 10 + phase, phase);
    drawTopRollerBoot(graphics, accent, secondary, 1, 11 - phase, 1 - phase);
    return;
  }

  const rearX = direction === 'right' ? -7 : 0;
  const frontX = direction === 'right' ? 0 : -7;
  drawSideRollerBoot(graphics, accent, secondary, direction, rearX, 10 + phase, phase);
  drawSideRollerBoot(graphics, accent, secondary, direction, frontX, 13 - phase, 1 - phase);
}

function drawScooter(graphics, equipment, direction, phase) {
  const accent = colorNumber(equipment.accent, 0x9b82ff);
  const secondary = colorNumber(equipment.secondary, 0x54c7ec);
  if (direction === 'up' || direction === 'down') {
    fill(graphics, OUTLINE, -4, 5, 8, 14);
    fill(graphics, accent, -2, 6, 4, 12);
    fill(graphics, secondary, -4, direction === 'up' ? 5 : 16, 8, 2);
    wheel(graphics, -2, 3, phase);
    wheel(graphics, -2, 18, 1 - phase);
    return;
  }
  const front = direction === 'right' ? 7 : -9;
  fill(graphics, OUTLINE, -10, 12, 20, 4);
  fill(graphics, accent, -8, 12, 16, 2);
  fill(graphics, OUTLINE, front, 2, 2, 12);
  fill(graphics, secondary, front + (direction === 'right' ? -3 : -1), 2, 6, 2);
  wheel(graphics, -9, 15, phase);
  wheel(graphics, 5, 15, 1 - phase);
}

function motorcycleWheel(graphics, x, y, phase) {
  fill(graphics, TIRE, x + 1, y, 3, 5);
  fill(graphics, TIRE, x, y + 1, 5, 3);
  fill(graphics, METAL, x + 1, y + 1, 3, 3);
  fill(graphics, phase ? 0x77828e : OUTLINE, x + 2, y + 2, 1, 1);
}

function drawMotorcycle(graphics, equipment, direction, phase) {
  const accent = colorNumber(equipment.accent, 0xed5d68);
  const secondary = colorNumber(equipment.secondary, 0xf0c35a);
  if (direction === 'up' || direction === 'down') {
    motorcycleWheel(graphics, -2, 0, phase);
    motorcycleWheel(graphics, -2, 18, 1 - phase);
    fill(graphics, OUTLINE, -5, 4, 10, 17);
    fill(graphics, accent, -4, 5, 8, 15);
    fill(graphics, OUTLINE, -3, 9, 6, 6);
    fill(graphics, METAL, -1, 6, 2, 12);
    const frontY = direction === 'up' ? 4 : 17;
    fill(graphics, OUTLINE, -7, frontY, 14, 2);
    fill(graphics, secondary, -2, direction === 'up' ? 5 : 16, 4, 3);
    return;
  }

  motorcycleWheel(graphics, -12, 10, phase);
  motorcycleWheel(graphics, 8, 10, 1 - phase);
  fill(graphics, METAL, -8, 11, 17, 2);
  fill(graphics, OUTLINE, -8, 7, 18, 8);
  fill(graphics, accent, -7, 9, 14, 5);
  fill(graphics, OUTLINE, -4, 5, 8, 4);
  fill(graphics, 0x363849, -3, 5, 7, 2);
  const facingRight = direction === 'right';
  const frontX = facingRight ? 8 : -10;
  fill(graphics, METAL, frontX, 5, 2, 8);
  fill(graphics, OUTLINE, facingRight ? 6 : -11, 4, 5, 2);
  fill(graphics, secondary, facingRight ? 4 : -7, 7, 5, 4);
  fill(graphics, secondary, facingRight ? 10 : -12, 7, 2, 3);
}

function drawEquipment(graphics, equipment, direction, phase) {
  if (equipment.id === 'skate') drawSkate(graphics, equipment, direction, phase);
  else if (equipment.id === 'roller-skates') drawRollerSkates(graphics, equipment, direction, phase);
  else if (equipment.id === 'electric-scooter') drawScooter(graphics, equipment, direction, phase);
  else if (equipment.id === 'motorcycle') drawMotorcycle(graphics, equipment, direction, phase);
}

export function createEquipmentVisual(scene) {
  const trail = scene.add.graphics().setVisible(false);
  const equipmentGraphics = scene.add.graphics().setVisible(false);
  let renderKey = '';

  return {
    update(player, equipment, direction, active, moving, time) {
      const visible = Boolean(equipment && active);
      trail.setVisible(visible && moving);
      equipmentGraphics.setVisible(visible);
      if (!visible) {
        renderKey = '';
        return;
      }

      const phase = Math.floor(time / 110) % 2;
      const nextRenderKey = `${equipment.id}:${direction}:${phase}:${moving}`;
      if (nextRenderKey !== renderKey) {
        renderKey = nextRenderKey;
        trail.clear();
        equipmentGraphics.clear();
        if (moving) drawTrail(trail, equipment, direction, phase);
        drawEquipment(equipmentGraphics, equipment, direction, phase);
      }

      const x = Math.round(player.x);
      const y = Math.round(player.y);
      trail.setPosition(x, y).setDepth(player.body.bottom - 2);
      const equipmentDepth = equipment.renderLayer === 'front'
        ? player.body.bottom + 1
        : player.body.bottom - 1;
      equipmentGraphics.setPosition(x, y).setDepth(equipmentDepth);
    },
    hide() {
      trail.setVisible(false);
      equipmentGraphics.setVisible(false);
      renderKey = '';
    },
  };
}
