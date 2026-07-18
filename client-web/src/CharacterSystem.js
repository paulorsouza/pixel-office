const DIRECTION_STARTS = { right: 0, up: 6, left: 12, down: 18 };

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
    // A customização continua disponível durante a sessão sem storage.
  }
}

export function characterOption(catalog, categoryId, optionId) {
  const category = (catalog.categories || []).find((entry) => entry.id === categoryId);
  return category?.options?.find((option) => option.id === optionId) || null;
}

export function normalizeCharacterSelection(catalog, candidate = {}) {
  return Object.fromEntries((catalog.categories || []).map((category) => {
    const requested = characterOption(catalog, category.id, candidate?.[category.id]);
    const fallback = characterOption(catalog, category.id, catalog.defaultSelection?.[category.id])
      || category.options?.[0]
      || null;
    return [category.id, (requested || fallback)?.id || null];
  }));
}

function initialSelection(catalog) {
  const raw = storageGet(catalog.storageKey || 'office-quest-character-v1');
  if (raw) {
    try {
      return normalizeCharacterSelection(catalog, JSON.parse(raw));
    } catch {
      // Um valor antigo ou corrompido volta ao conjunto padrão.
    }
  }
  return normalizeCharacterSelection(catalog, catalog.defaultSelection);
}

export function characterTextureKey(categoryId, optionId) {
  return `character-${categoryId}-${optionId}`;
}

export function characterFrameSpec(catalog, pose, direction, time, moving = true) {
  let resolvedPose = pose;
  let start = DIRECTION_STARTS[direction] ?? DIRECTION_STARTS.down;
  if (resolvedPose === 'sit' && direction !== 'left' && direction !== 'right') {
    resolvedPose = 'idle';
  }
  if (resolvedPose === 'sit') start = direction === 'left' ? 6 : 0;
  const poseSpec = catalog.frame?.poses?.[resolvedPose] || catalog.frame?.poses?.idle;
  const framesPerDirection = 6;
  const phase = moving
    ? Math.floor(time / (1000 / (poseSpec?.frameRate || 5))) % framesPerDirection
    : 0;
  return {
    pose: resolvedPose,
    frame: start + phase,
    name: `${resolvedPose}-${start + phase}`,
  };
}

function previewFrameStyle(catalog, option, direction = 'down', pose = 'idle') {
  if (!option?.path) return '';
  const poseSpec = catalog.frame.poses[pose] || catalog.frame.poses.idle;
  const frame = pose === 'sit'
    ? (direction === 'left' ? 6 : 0)
    : (DIRECTION_STARTS[direction] ?? DIRECTION_STARTS.down);
  const x = frame * catalog.frame.width;
  return `background-image:url('${option.path}');background-position:-${x}px -${poseSpec.y}px`;
}

function characterStackHtml(catalog, selection, direction, className = '') {
  const layers = (catalog.categories || []).map((category) => {
    const option = characterOption(catalog, category.id, selection[category.id]);
    if (!option?.path) return '';
    return `<i class="character-pixel-layer" style="${previewFrameStyle(catalog, option, direction)}"></i>`;
  }).join('');
  return `<span class="character-pixel-stack ${className}" aria-hidden="true">${layers}</span>`;
}

export function createCharacterCustomizer(catalog, options = {}) {
  const controls = document.querySelector('#character-controls');
  const equipmentTab = document.querySelector('#menu-tab-equipment');
  const characterTab = document.querySelector('#menu-tab-character');
  const equipmentView = document.querySelector('#equipment-panel-view');
  const characterView = document.querySelector('#character-panel-view');
  const equipmentFooter = document.querySelector('#equipment-footer-copy');
  const characterFooter = document.querySelector('#character-footer-copy');
  const clearEquipment = document.querySelector('#equipment-clear');
  const menuTitle = document.querySelector('#menu-title');
  const menuSubtitle = document.querySelector('#menu-subtitle');
  const reset = document.querySelector('#character-reset');
  const randomize = document.querySelector('#character-randomize');
  const directionControls = document.querySelector('#character-directions');
  let selection = initialSelection(catalog);
  let previewDirection = 'down';
  let activeTab = 'equipment';

  const renderPreview = () => {
    for (const target of document.querySelectorAll('[data-character-preview]')) {
      target.innerHTML = characterStackHtml(
        catalog,
        selection,
        target.dataset.characterDirection || previewDirection,
        target.dataset.characterPreview,
      );
    }
    for (const button of directionControls.querySelectorAll('[data-character-direction]')) {
      const active = button.dataset.characterDirection === previewDirection;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  };

  const renderControls = () => {
    controls.innerHTML = (catalog.categories || []).map((category) => `
      <section class="character-category" aria-labelledby="character-category-${category.id}">
        <header><strong id="character-category-${category.id}">${category.name}</strong><small>${category.options.length} opções</small></header>
        <div class="character-options">
          ${category.options.map((option) => {
            const optionSelection = { ...selection, [category.id]: option.id };
            const selected = selection[category.id] === option.id;
            return `
              <button class="character-option${selected ? ' selected' : ''}" type="button"
                data-character-category="${category.id}" data-character-option="${option.id}"
                style="--character-accent:${option.accent || '#d19a69'}"
                aria-pressed="${selected}" aria-label="${category.name}: ${option.name}">
                ${option.path
                  ? characterStackHtml(catalog, optionSelection, 'down', 'character-option-stack')
                  : '<span class="character-none-mark" aria-hidden="true">×</span>'}
                <span>${option.name}</span>
              </button>
            `;
          }).join('')}
        </div>
      </section>
    `).join('');
  };

  const sync = () => {
    renderPreview();
    renderControls();
    storageSet(catalog.storageKey || 'office-quest-character-v1', JSON.stringify(selection));
    options.onChange?.({ ...selection });
  };

  const select = (categoryId, optionId) => {
    const option = characterOption(catalog, categoryId, optionId);
    if (!option) return false;
    selection = normalizeCharacterSelection(catalog, { ...selection, [categoryId]: option.id });
    sync();
    return true;
  };

  const setTab = (tab) => {
    activeTab = tab === 'character' ? 'character' : 'equipment';
    const characterActive = activeTab === 'character';
    equipmentView.hidden = characterActive;
    characterView.hidden = !characterActive;
    equipmentFooter.hidden = characterActive;
    characterFooter.hidden = !characterActive;
    clearEquipment.hidden = characterActive;
    equipmentTab.classList.toggle('active', !characterActive);
    characterTab.classList.toggle('active', characterActive);
    equipmentTab.setAttribute('aria-selected', String(!characterActive));
    characterTab.setAttribute('aria-selected', String(characterActive));
    menuTitle.textContent = characterActive ? 'Personagem' : 'Equipamentos';
    menuSubtitle.textContent = characterActive
      ? 'Combine as camadas e crie um avatar só seu.'
      : 'Monte seu conjunto e escolha no baú o que vai usar.';
    const focusTarget = characterActive
      ? controls.querySelector('.character-option.selected, .character-option')
      : equipmentView.querySelector('.inventory-item.equipped, .inventory-item');
    focusTarget?.focus();
  };

  equipmentTab.addEventListener('click', () => setTab('equipment'));
  characterTab.addEventListener('click', () => setTab('character'));
  controls.addEventListener('click', (event) => {
    const button = event.target.closest('.character-option');
    if (!button) return;
    select(button.dataset.characterCategory, button.dataset.characterOption);
  });
  directionControls.addEventListener('click', (event) => {
    const button = event.target.closest('[data-character-direction]');
    if (!button) return;
    previewDirection = button.dataset.characterDirection;
    renderPreview();
  });
  reset.addEventListener('click', () => {
    selection = normalizeCharacterSelection(catalog, catalog.defaultSelection);
    sync();
  });
  randomize.addEventListener('click', () => {
    selection = Object.fromEntries(catalog.categories.map((category) => {
      const option = category.options[Math.floor(Math.random() * category.options.length)];
      return [category.id, option.id];
    }));
    sync();
  });

  sync();

  return {
    getSelection: () => ({ ...selection }),
    getActiveTab: () => activeTab,
    select,
    setTab,
    reset() {
      selection = normalizeCharacterSelection(catalog, catalog.defaultSelection);
      sync();
    },
    randomize() {
      randomize.click();
    },
  };
}

export function preloadCharacterAssets(scene, catalog) {
  for (const category of (catalog.categories || [])) {
    for (const option of (category.options || [])) {
      if (!option.path) continue;
      const key = characterTextureKey(category.id, option.id);
      if (!scene.textures.exists(key)) scene.load.image(key, option.path);
    }
  }
}

export function registerCharacterFrames(scene, catalog) {
  const frameWidth = catalog.frame.width;
  const frameHeight = catalog.frame.height;
  for (const category of (catalog.categories || [])) {
    for (const option of (category.options || [])) {
      if (!option.path) continue;
      const texture = scene.textures.get(characterTextureKey(category.id, option.id));
      for (const [pose, poseSpec] of Object.entries(catalog.frame.poses || {})) {
        for (let frame = 0; frame < poseSpec.frames; frame += 1) {
          const name = `${pose}-${frame}`;
          if (!texture.has(name)) {
            texture.add(name, 0, frame * frameWidth, poseSpec.y, frameWidth, frameHeight);
          }
        }
      }
    }
  }
}

export function createCharacterVisual(scene, catalog, customizer, player) {
  registerCharacterFrames(scene, catalog);
  const layers = (catalog.categories || []).map((category, index) => ({
    category,
    index,
    selectedId: null,
    renderable: false,
    sprite: scene.add.sprite(player.x, player.y, '__DEFAULT').setVisible(false),
  }));
  player.setVisible(false);

  const syncTextures = () => {
    const selection = customizer.getSelection();
    for (const layer of layers) {
      const nextOption = characterOption(catalog, layer.category.id, selection[layer.category.id]);
      if (layer.selectedId === nextOption?.id) continue;
      layer.selectedId = nextOption?.id || null;
      const textureKey = nextOption?.path
        ? characterTextureKey(layer.category.id, nextOption.id)
        : null;
      layer.renderable = Boolean(textureKey && scene.textures.exists(textureKey));
      if (!layer.renderable) {
        layer.sprite.setVisible(false);
        continue;
      }
      layer.sprite.setTexture(textureKey);
      layer.sprite.setVisible(true);
    }
  };

  return {
    update(direction, pose, moving, time) {
      syncTextures();
      const frame = characterFrameSpec(catalog, pose, direction, time, moving);
      const x = Math.round(player.x);
      const y = Math.round(player.y);
      for (const layer of layers) {
        if (!layer.renderable || layer.sprite.texture.key === '__DEFAULT') continue;
        layer.sprite
          .setFrame(frame.name)
          .setPosition(x, y)
          .setDepth(player.body.bottom + layer.index * 0.01);
      }
    },
    destroy() {
      for (const layer of layers) layer.sprite.destroy();
      player.setVisible(true);
    },
  };
}
