const DIRECTION_STARTS = { right: 0, up: 6, left: 12, down: 18 };
// A linha `sit` tem ordem propria: direita e esquerda vieram do pack, cima e
// baixo foram desenhadas depois e entraram nos frames livres seguintes.
const SIT_STARTS = { right: 0, left: 6, up: 12, down: 18 };

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

/**
 * Preenche o que falta e descarta o que não existe mais.
 *
 * O segundo `find` é o que faz uma seleção antiga sobreviver a uma mudança de
 * catálogo: quando os acessórios viraram três camadas (costas/rosto/cabeça), quem
 * tinha `accessory: "glasses-03"` guardado continuaria de cara limpa se a busca
 * fosse só pela chave. Procurar o id em qualquer valor recebido custa uma linha e
 * evita uma migração de dados.
 */
export function normalizeCharacterSelection(catalog, candidate = {}) {
  const values = Object.values(candidate || {}).filter((value) => typeof value === 'string');
  return Object.fromEntries((catalog.categories || []).map((category) => {
    const requested = characterOption(catalog, category.id, candidate?.[category.id])
      || values.map((value) => characterOption(catalog, category.id, value)).find(Boolean);
    const fallback = characterOption(catalog, category.id, catalog.defaultSelection?.[category.id])
      || category.options?.[0]
      || null;
    return [category.id, (requested || fallback)?.id || null];
  }));
}

function initialSelection(catalog) {
  const raw = storageGet(catalog.storageKey || 'office-quest-character-v2');
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
  if (resolvedPose === 'sit') start = SIT_STARTS[direction] ?? SIT_STARTS.down;
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

/** Opções de uma camada agrupadas por modelo, na ordem do catálogo. */
function familiesOf(category) {
  const families = new Map();
  for (const option of category.options || []) {
    if (!families.has(option.family)) {
      families.set(option.family, { id: option.family, name: option.familyName, variants: [] });
    }
    families.get(option.family).variants.push(option);
  }
  return [...families.values()];
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

/**
 * Tela de aparência do avatar.
 *
 * Mudou de forma na v3 e o motivo é aritmética: as camadas passaram de 23 opções
 * para 435, e a lista única de antes viraria uma parede de duzentas miniaturas de
 * cabelo. O pack organiza as peças em MODELO × COR (mesma silhueta, paletas
 * diferentes), então a tela faz o mesmo: uma aba por camada, uma grade de modelos e
 * a cartela de cores do modelo escolhido. A pergunta "que cabelo eu quero?" e a
 * pergunta "de que cor?" deixaram de ser a mesma rolagem.
 *
 * A seleção é gravada no SERVIDOR (`options.save`). O `localStorage` continua, mas
 * como cache: é ele que desenha o avatar certo no primeiro frame, antes de a API
 * responder — e é o que sobra quando ela não responde.
 */
export function createCharacterCustomizer(catalog, options = {}) {
  const controls = document.querySelector('#character-controls');
  const layerTabs = document.querySelector('#character-layers');
  // As três telas da janela, cada uma com a sua aba, o seu rodapé e a sua view.
  // Tabela em vez de três pares de variáveis: acrescentar "Baús" com `if` teria
  // dobrado cada linha do `setTab`, e a quarta dobraria de novo.
  const TABS = [
    { id: 'equipment', view: '#equipment-panel-view', tab: '#menu-tab-equipment', footer: '#equipment-footer-copy', title: 'Equipamentos', subtitle: 'Monte seu conjunto e escolha no baú o que vai usar.' },
    { id: 'chests', view: '#chest-panel-view', tab: '#menu-tab-chests', footer: '#chest-footer-copy', title: 'Baús', subtitle: 'O que ainda está fechado — e o que pode sair de dentro.' },
    { id: 'character', view: '#character-panel-view', tab: '#menu-tab-character', footer: '#character-footer-copy', title: 'Personagem', subtitle: 'Combine as camadas e crie um avatar só seu.' },
  ].map((entry) => ({
    ...entry,
    viewEl: document.querySelector(entry.view),
    tabEl: document.querySelector(entry.tab),
    footerEl: document.querySelector(entry.footer),
  }));
  const clearEquipment = document.querySelector('#equipment-clear');
  const menuTitle = document.querySelector('#menu-title');
  const menuSubtitle = document.querySelector('#menu-subtitle');
  const saveState = document.querySelector('#character-save-state');
  const reset = document.querySelector('#character-reset');
  const randomize = document.querySelector('#character-randomize');
  const directionControls = document.querySelector('#character-directions');
  const categories = catalog.categories || [];
  let selection = initialSelection(catalog);
  let previewDirection = 'down';
  let activeTab = 'equipment';
  let activeLayer = categories[0]?.id || null;
  // Modelo aberto na cartela, por camada. Começa no modelo da peça vestida.
  const openFamily = new Map();

  const categoryOf = (categoryId) => categories.find((category) => category.id === categoryId);
  const selectedOption = (categoryId) => characterOption(catalog, categoryId, selection[categoryId]);
  const familyOf = (categoryId) => openFamily.get(categoryId)
    || selectedOption(categoryId)?.family
    || familiesOf(categoryOf(categoryId) || { options: [] })[0]?.id
    || null;

  // ---------------------------------------------------------------- salvar

  let saveTimer = 0;
  let saveGeneration = 0;
  const setSaveState = (text, tone = '') => {
    if (!saveState) return;
    saveState.textContent = text;
    saveState.dataset.tone = tone;
  };
  /**
   * Grava com atraso porque clicar em cinco cabelos seguidos são cinco escolhas e
   * uma decisão — mandar as cinco à API só faz o servidor desfazer o trabalho dele
   * mesmo. O contador de geração descarta a resposta de uma gravação que já foi
   * substituída por outra mais nova.
   */
  const scheduleSave = () => {
    if (!options.save) return;
    clearTimeout(saveTimer);
    setSaveState('Salvando…', 'pending');
    const generation = (saveGeneration += 1);
    saveTimer = setTimeout(async () => {
      try {
        await options.save({ ...selection });
        if (generation === saveGeneration) setSaveState('Salvo na sua conta', 'ok');
      } catch (error) {
        if (generation === saveGeneration) {
          setSaveState('Sem conexão — salvo só neste navegador', 'warn');
        }
        console.warn('[personagem] não foi possível salvar no servidor', error);
      }
    }, 600);
  };

  // ---------------------------------------------------------------- desenho

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

  const renderLayerTabs = () => {
    if (!layerTabs) return;
    layerTabs.innerHTML = categories.map((category) => {
      const option = selectedOption(category.id);
      const active = category.id === activeLayer;
      return `
        <button class="character-layer${active ? ' active' : ''}" type="button" role="tab"
          data-character-layer="${category.id}" aria-selected="${active}"
          style="--character-accent:${option?.accent || '#73545a'}">
          <b>${escapeHtml(category.name)}</b>
          <small>${escapeHtml(!option?.path ? 'Nenhum'
    // Camada de um modelo só (pele, olhos) repetiria o nome da aba: lá o que
    // identifica a escolha é a variante.
    : option.familyName === category.name ? option.name : option.familyName)}</small>
        </button>`;
    }).join('');
  };

  /** Miniatura do avatar inteiro com UMA peça trocada — é assim que se escolhe roupa. */
  const optionCardHtml = (categoryId, option, { selected, label, sub }) => `
    <button class="character-option${selected ? ' selected' : ''}" type="button"
      data-character-category="${categoryId}" data-character-option="${option.id}"
      style="--character-accent:${option.accent || '#d19a69'}"
      aria-pressed="${selected}" aria-label="${escapeHtml(`${label}${sub ? `, ${sub}` : ''}`)}">
      ${option.path
    ? characterStackHtml(catalog, { ...selection, [categoryId]: option.id }, 'down', 'character-option-stack')
    : '<span class="character-none-mark" aria-hidden="true">×</span>'}
      <span>${escapeHtml(label)}</span>
    </button>`;

  const renderControls = () => {
    const category = categoryOf(activeLayer);
    if (!category) return;
    const families = familiesOf(category);
    const currentFamily = familyOf(category.id);
    const selectedId = selection[category.id];
    // Camada de um modelo só (pele, olhos) não tem o que agrupar: a "cor" é a peça.
    const single = families.length === 1;
    const family = families.find((entry) => entry.id === currentFamily) || families[0];

    const modelGrid = single ? '' : `
      <div class="character-options" role="group" aria-label="Modelos de ${escapeHtml(category.name)}">
        ${families.map((entry) => {
    // O modelo aparece na cor que a pessoa está usando quando ela existe: trocar de
    // corte não é motivo para voltar ao ruivo do primeiro arquivo do pack.
    const current = selectedOption(category.id);
    const variant = entry.variants.find((option) => option.name === current?.name)
            || entry.variants[0];
    return `<span class="character-family${entry.id === family?.id ? ' open' : ''}"
              data-character-family="${entry.id}">
              ${optionCardHtml(category.id, variant, {
    selected: entry.variants.some((option) => option.id === selectedId),
    label: entry.name,
    sub: `${entry.variants.length} cores`,
  })}
            </span>`;
  }).join('')}
      </div>`;

    const swatches = single
      ? `<div class="character-options" role="group" aria-label="${escapeHtml(category.name)}">
          ${family.variants.map((option) => optionCardHtml(category.id, option, {
    selected: option.id === selectedId, label: option.name,
  })).join('')}
        </div>`
      : `<div class="character-swatches" role="group" aria-label="Cores de ${escapeHtml(family?.name || '')}">
          ${(family?.variants || []).map((option) => `
            <button class="character-swatch${option.id === selectedId ? ' selected' : ''}" type="button"
              data-character-category="${category.id}" data-character-option="${option.id}"
              style="--character-accent:${option.accent || '#d19a69'}"
              aria-pressed="${option.id === selectedId}"
              title="${escapeHtml(option.name)}" aria-label="${escapeHtml(option.name)}">
              ${option.path ? '' : '<i aria-hidden="true">×</i>'}
            </button>`).join('')}
        </div>`;

    controls.innerHTML = `
      <section class="character-category" aria-labelledby="character-category-${category.id}">
        <header>
          <strong id="character-category-${category.id}">${escapeHtml(category.name)}</strong>
          <small>${escapeHtml(selectedOption(category.id)?.name || 'Nenhum')}${
  single ? '' : ` · ${families.length} modelos`}</small>
        </header>
        ${modelGrid}
        ${swatches}
      </section>`;
  };

  const render = () => {
    renderPreview();
    renderLayerTabs();
    renderControls();
  };

  const sync = ({ persist = true } = {}) => {
    render();
    storageSet(catalog.storageKey || 'office-quest-character-v2', JSON.stringify(selection));
    if (persist) scheduleSave();
    options.onChange?.({ ...selection });
  };

  const select = (categoryId, optionId) => {
    const option = characterOption(catalog, categoryId, optionId);
    if (!option) return false;
    selection = normalizeCharacterSelection(catalog, { ...selection, [categoryId]: option.id });
    openFamily.set(categoryId, option.family);
    sync();
    return true;
  };

  const setLayer = (categoryId) => {
    if (!categoryOf(categoryId)) return;
    activeLayer = categoryId;
    renderLayerTabs();
    renderControls();
    controls.querySelector('.character-option.selected, .character-option')?.focus();
  };

  const setTab = (tab) => {
    const active = TABS.find((entry) => entry.id === tab) || TABS[0];
    activeTab = active.id;
    for (const entry of TABS) {
      const on = entry === active;
      if (entry.viewEl) entry.viewEl.hidden = !on;
      if (entry.footerEl) entry.footerEl.hidden = !on;
      entry.tabEl?.classList.toggle('active', on);
      entry.tabEl?.setAttribute('aria-selected', String(on));
    }
    // "Guardar tudo" é ação do tabuleiro de encaixes: fora dele, é um botão que
    // promete mexer no que está à vista e mexe em outra tela.
    clearEquipment.hidden = activeTab !== 'equipment';
    menuTitle.textContent = active.title;
    menuSubtitle.textContent = active.subtitle;
    const focusTarget = activeTab === 'character'
      ? controls.querySelector('.character-option.selected, .character-option')
      : active.viewEl?.querySelector('.inventory-item.equipped, .inventory-item, .lootbox-card');
    focusTarget?.focus();
  };

  // ---------------------------------------------------------------- eventos

  for (const entry of TABS) entry.tabEl?.addEventListener('click', () => setTab(entry.id));
  layerTabs?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-character-layer]');
    if (button) setLayer(button.dataset.characterLayer);
  });
  controls.addEventListener('click', (event) => {
    const button = event.target.closest('[data-character-option]');
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
    openFamily.clear();
    sync();
  });
  randomize.addEventListener('click', () => {
    selection = Object.fromEntries(categories.map((category) => {
      const option = category.options[Math.floor(Math.random() * category.options.length)];
      return [category.id, option.id];
    }));
    openFamily.clear();
    sync();
  });

  sync({ persist: false });

  // A conta é a fonte da verdade; o cache local só serviu para o primeiro frame.
  // Se a API não responder, o avatar continua sendo o que o navegador lembrava.
  if (options.load) {
    options.load().then((stored) => {
      if (!stored || !Object.keys(stored).length) {
        setSaveState('', '');
        return;
      }
      selection = normalizeCharacterSelection(catalog, stored);
      sync({ persist: false });
      setSaveState('', '');
    }).catch((error) => {
      setSaveState('Sem conexão — salvo só neste navegador', 'warn');
      console.warn('[personagem] aparência do servidor indisponível', error);
    });
  }

  return {
    getSelection: () => ({ ...selection }),
    getActiveTab: () => activeTab,
    getActiveLayer: () => activeLayer,
    select,
    setLayer,
    setTab,
    /** Aparência trocada em outra aba: adota sem regravar (senão as duas abas brigam). */
    adopt(stored) {
      selection = normalizeCharacterSelection(catalog, stored);
      sync({ persist: false });
    },
    reset() {
      reset.click();
    },
    randomize() {
      randomize.click();
    },
  };
}

// ---------------------------------------------------------------- Phaser

/**
 * Registra os frames nomeados de UMA folha.
 *
 * O cliente carrega a imagem inteira e nomeia retângulos dentro dela em vez de
 * gerar centenas de recortes — é isso que mantém as camadas alinhadas de graça.
 */
function registerSheetFrames(scene, catalog, textureKey) {
  const texture = scene.textures.get(textureKey);
  if (!texture || texture.key === '__MISSING') return;
  for (const [pose, poseSpec] of Object.entries(catalog.frame.poses || {})) {
    for (let frame = 0; frame < poseSpec.frames; frame += 1) {
      const name = `${pose}-${frame}`;
      if (!texture.has(name)) {
        texture.add(
          name, 0,
          frame * catalog.frame.width, poseSpec.y,
          catalog.frame.width, catalog.frame.height,
        );
      }
    }
  }
}

// Uma folha pedida é uma folha pedida para o jogo inteiro: o `TextureManager` do
// Phaser é global e as cenas vão e voltam. O Set evita empilhar o mesmo download
// quando dois avatares usam o mesmo cabelo.
const requestedSheets = new Set();

/**
 * Garante a textura de uma peça, carregando sob demanda.
 *
 * Antes o boot carregava TODAS as opções. Com 23 isso passava despercebido; com 435
 * seriam 435 imagens antes do primeiro frame, para vestir sete. Agora o avatar pede
 * o que veste — e quem estiver a caminho aparece assim que chega, porque o `update`
 * volta a perguntar a cada frame.
 *
 * A imagem é carregada FORA do loader do Phaser de propósito. O loader é feito para
 * a fase de `preload`: pedir duas folhas no mesmo frame com a cena já rodando põe a
 * segunda numa fila que só é reexaminada no `start()` seguinte — e a peça ficava
 * invisível para sempre (visto no harness: o cabelo entrava, o boné não). Um
 * `Image` mais `textures.addImage` não tem estado de máquina nenhum.
 */
export function ensureCharacterTexture(scene, catalog, categoryId, optionId) {
  const option = characterOption(catalog, categoryId, optionId);
  if (!option?.path) return null;
  const key = characterTextureKey(categoryId, optionId);
  if (scene.textures.exists(key)) {
    registerSheetFrames(scene, catalog, key);
    return key;
  }
  if (requestedSheets.has(key)) return null;
  requestedSheets.add(key);
  const image = new Image();
  image.addEventListener('load', () => {
    // Duas cenas podem pedir a mesma folha antes de ela chegar; `exists` evita o
    // aviso de textura duplicada do Phaser.
    if (!scene.textures.exists(key)) scene.textures.addImage(key, image);
    registerSheetFrames(scene, catalog, key);
  });
  image.addEventListener('error', () => {
    requestedSheets.delete(key);   // deixa uma próxima tentativa acontecer
    console.warn(`[personagem] não foi possível carregar ${option.path}`);
  });
  image.src = option.path;
  return null;
}

/** Adianta o que o avatar local já vai vestir, para ele não nascer invisível. */
export function preloadCharacterSelection(scene, catalog, selection) {
  for (const category of (catalog.categories || [])) {
    const option = characterOption(catalog, category.id, selection?.[category.id]);
    if (option?.path) scene.load.image(characterTextureKey(category.id, option.id), option.path);
  }
}

export function createCharacterVisual(scene, catalog, customizer, player) {
  const layers = (catalog.categories || []).map((category, index) => ({
    category,
    index,
    selectedId: null,
    textureKey: null,
    sprite: scene.add.sprite(player.x, player.y, '__DEFAULT').setVisible(false),
  }));
  player.setVisible(false);

  const syncTextures = () => {
    const selection = customizer.getSelection();
    for (const layer of layers) {
      const nextOption = characterOption(catalog, layer.category.id, selection[layer.category.id]);
      const nextId = nextOption?.id || null;
      // Perguntar ANTES de comparar é o que faz a peça aparecer sozinha quando o
      // download termina: enquanto ela não chegou a chave é `null`, e o frame
      // seguinte pergunta de novo até virar textura.
      const key = nextOption?.path
        ? ensureCharacterTexture(scene, catalog, layer.category.id, nextId)
        : null;
      if (layer.selectedId === nextId && layer.textureKey === key) continue;
      layer.selectedId = nextId;
      layer.textureKey = key;
      if (!key) {
        layer.sprite.setVisible(false);
        continue;
      }
      layer.sprite.setTexture(key);
      layer.sprite.setVisible(true);
    }
  };

  return {
    // `depthBase` sobrepõe a profundidade quando o avatar precisa ficar acima do
    // móvel em que senta — senão o tampo e o monitor da estação o escondem.
    update(direction, pose, moving, time, depthBase) {
      syncTextures();
      const frame = characterFrameSpec(catalog, pose, direction, time, moving);
      const x = Math.round(player.x);
      const y = Math.round(player.y);
      const base = depthBase ?? player.body.bottom;
      for (const layer of layers) {
        if (!layer.textureKey) continue;
        layer.sprite
          .setFrame(frame.name)
          .setPosition(x, y)
          .setDepth(base + layer.index * 0.01);
      }
    },
    destroy() {
      for (const layer of layers) layer.sprite.destroy();
      player.setVisible(true);
    },
  };
}
