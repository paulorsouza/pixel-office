export const DEFAULT_WALK_SPEED = 112;

/// Presets de piloto viram `riderDirections` de verdade uma vez só, no carregamento.
/// Sem isso, o bloco de seis motos repetiria o mesmo mapa de animação seis vezes no
/// JSON — e `riderAnimationSpec` precisaria receber o catálogo inteiro só para
/// resolver a indireção.
export function prepareEquipmentCatalog(catalog) {
  for (const item of catalog.items || []) {
    if (item.riderDirections || !item.riderPreset) continue;
    const preset = catalog.riderPresets?.[item.riderPreset];
    if (preset) item.riderDirections = preset;
  }
  return catalog;
}

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

/**
 * Junta o item do servidor (nome, raridade, efeito) com o visual do `catalog.json`
 * (sprite, cor, velocidade). São duas metades do mesmo item, e cada lado é dono da
 * sua — ver docs/PLANO_EQUIPAMENTOS.md §7.
 */
export function mergeEquipmentItem(catalog, serverItem) {
  return { ...equipmentById(catalog, serverItem.id), ...serverItem };
}

/** Loadout no formato antigo (slot → id do item), para quem só quer saber o que está vestido. */
export function loadoutIds(snapshot) {
  const loadout = {};
  for (const slot of snapshot?.slots || []) {
    loadout[slot.id] = snapshot.loadout?.[slot.id]?.id ?? null;
  }
  return loadout;
}

/**
 * Arte do item.
 *
 * Era um desenho em CSS por SLOT — os cinco mouses eram o mesmo contorno pintado de
 * outra cor, o que fazia a raridade parecer etiqueta. Agora cada item tem o seu PNG
 * de 32×32 (`tools/generate-equipment-icons.mjs`), e a moldura continua sendo do
 * card, que é quem carrega a cor da raridade.
 */
function itemIcon(item, className = '') {
  if (!item?.id) {
    return `<span class="item-glyph ${className}" aria-hidden="true"><b>${item?.shortLabel || ''}</b></span>`;
  }
  return `<span class="item-glyph ${className}" aria-hidden="true">
    <img src="assets/equipment/items/${item.id}.png" alt="" draggable="false"></span>`;
}

// O item mais barato de cada slot serve de fantasma no encaixe vazio: dizer "MS" e
// "TC" numa caixa tracejada obrigava a decorar a sigla, e a silhueta do mouse não.
// São itens que todo mundo já viu na loja, então a arte já existe — nenhum asset novo.
const SLOT_GHOSTS = {
  mouse: 'mouse-office',
  keyboard: 'keyboard-membrane',
  amulet: 'amulet-clover',
  phone: 'phone-basic',
  wallet: 'wallet-canvas',
  vehicle: 'skate',
};

function emptySlotMark(slot) {
  const ghost = SLOT_GHOSTS[slot.id];
  return `<span class="empty-slot-mark">${ghost
    ? `<img src="assets/equipment/items/${ghost}.png" alt="" draggable="false">`
    : escapeHtml(slot.shortLabel || '')}</span>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

/**
 * A área "Itens" do menu do jogo.
 *
 * O loadout mora no SERVIDOR desde a v2: equipar mudou de "escolher um sprite" para
 * "mudar quanto o jogo paga", e efeito que o cliente guardasse sozinho seria efeito
 * que o cliente escolhe. Este módulo, então, não decide nada — ele mostra o que
 * `GET /api/game/equipment` devolveu e manda `PUT` quando o jogador clica.
 *
 * A bag também mudou de sentido: antes listava o catálogo inteiro com os itens não
 * comprados apagados, o que era uma vitrine. Agora lista o que é do jogador.
 */
export function createEquipmentMenu(catalog, options = {}) {
  // Lixo da v1: o loadout morava aqui. A chave já não é lida por ninguém, mas
  // deixá-la no navegador de quem jogou o beta rende confusão no próximo debug —
  // alguém acharia um loadout com slots que não existem mais e acreditaria nele.
  try { localStorage.removeItem('office-quest-equipment-v1'); } catch { /* storage bloqueado */ }
  const root = document.querySelector('#equipment-menu');
  const list = document.querySelector('#equipment-list');
  const slotsRoot = document.querySelector('#equipment-slots');
  const effectsRoot = document.querySelector('#equipment-effects');
  const chestsRoot = document.querySelector('#equipment-chests');
  const chestCount = document.querySelector('#chest-count');
  const chestEmpty = document.querySelector('#chest-empty');
  const compareRoot = document.querySelector('#equipment-compare');
  const revealRoot = document.querySelector('#equipment-reveal');
  const clear = document.querySelector('#equipment-clear');
  const close = document.querySelector('#equipment-close');
  const loadoutCount = document.querySelector('#equipment-loadout-count');
  const inventoryCount = document.querySelector('#equipment-inventory-count');

  // Fallback de slot para quando o servidor ainda não respondeu: sem ele, abrir o
  // menu offline mostraria um tabuleiro sem nenhum encaixe, o que parece defeito.
  const fallbackSlots = (catalog.slots || []).map((slot) => ({
    id: slot.id,
    name: slot.name || slot.id,
    shortLabel: slot.shortLabel || '',
    description: slot.description || '',
  }));

  let snapshot = null;
  let open = false;
  let pending = false;

  const slots = () => snapshot?.slots?.length ? snapshot.slots : fallbackSlots;
  const items = () => (snapshot?.items || []).map((item) => mergeEquipmentItem(catalog, item));
  const equippedOf = (slotId) => {
    const raw = snapshot?.loadout?.[slotId];
    return raw ? mergeEquipmentItem(catalog, raw) : null;
  };
  const vehicles = () => items().filter((item) => item.slot === 'vehicle');

  const renderSlots = () => {
    slotsRoot.innerHTML = slots().map((slot) => {
      const item = equippedOf(slot.id);
      const style = item
        ? `--item-accent:${item.accent};--item-secondary:${item.secondary}`
        : '';
      return `
        <button class="equipment-slot slot-${slot.id}${item ? ' filled' : ''}" type="button"
          data-slot-id="${slot.id}"${item ? ` data-rarity="${item.rarity}"` : ''} style="${style}"
          aria-label="${item ? `${slot.name}: ${escapeHtml(item.name)}. Clique para guardar.` : `${slot.name}: vazio`}">
          <span class="equipment-slot-label">${escapeHtml(slot.name)}</span>
          ${item ? itemIcon(item, 'slot-item-glyph') : emptySlotMark(slot)}
          <span class="equipment-slot-value">${escapeHtml(item?.name || 'Vazio')}</span>
          ${item ? '<span class="equipment-slot-remove" aria-hidden="true">×</span>' : ''}
        </button>
      `;
    }).join('');
  };

  /**
   * Relógio de baú do item.
   *
   * O contador é do ITEM, não do jogador: cada celular acumula o seu. Desequipar
   * pausa e não zera, então a barra some do lugar só quando o baú cai — e o rótulo
   * diz "pausado" em vez de simplesmente parar sem explicação.
   */
  const chestClockHtml = (chest) => {
    if (!chest) return '';
    const pct = Math.min(100, Math.round((chest.minutes / chest.intervalMinutes) * 100));
    const falta = Math.max(0, chest.intervalMinutes - chest.minutes);
    const horas = Math.floor(falta / 60);
    const restante = horas >= 1 ? `${horas} h` : `${falta} min`;
    return `
      <span class="chest-clock${chest.running ? '' : ' paused'}"
        title="${escapeHtml(`${chest.tierName} a cada ${chest.intervalMinutes / 60} h equipado`)}">
        <span class="chest-clock-bar"><i style="width:${pct}%"></i></span>
        <b>${chest.running ? `faltam ${restante}` : 'pausado'}</b>
      </span>`;
  };

  const itemCardHtml = (item) => `
    <button class="inventory-item${item.equipped ? ' equipped' : ''}" type="button"
      data-instance-id="${item.instanceId}" data-rarity="${item.rarity || 'common'}"
      data-slot="${item.slot}" aria-pressed="${item.equipped}"
      style="--item-accent:${item.accent};--item-secondary:${item.secondary}">
      <span class="inventory-equipped-mark" aria-hidden="true">Equipado</span>
      <span class="inventory-item-art">${itemIcon(item)}</span>
      <strong>${escapeHtml(item.name)}</strong>
      <span class="rarity-chip">${escapeHtml(item.rarityName || '')}</span>
      <small>${(item.effectLabels?.length
    ? item.effectLabels
    : [item.slot === 'vehicle' ? `${item.speed} px/s` : '—'])
    .map((label) => `<i>${escapeHtml(label)}</i>`).join('')}</small>
      ${chestClockHtml(item.chest)}
    </button>`;

  /**
   * A bag é agrupada por slot, não é uma grade solta.
   *
   * Com dezesseis itens misturados, escolher exige ler todos os cards para achar os
   * três que servem naquele encaixe. Agrupado, a pergunta que o jogador tem ("o que
   * posso pôr no mouse?") tem uma seção com a resposta.
   */
  const renderList = () => {
    const owned = items();
    if (!owned.length) {
      list.innerHTML = `<p class="inventory-empty">${snapshot
        ? 'Sua bag está vazia. Compre na loja ou abra um baú para começar.'
        : 'Carregando seus itens…'}</p>`;
      return;
    }
    list.innerHTML = slots().map((slot) => {
      const group = owned.filter((item) => item.slot === slot.id);
      if (!group.length) return '';
      const equipped = equippedOf(slot.id);
      return `
        <section class="inventory-group" aria-label="${escapeHtml(slot.name)}">
          <header class="inventory-group-title">
            <b>${escapeHtml(slot.name)}</b>
            <span>${equipped ? escapeHtml(equipped.name) : 'nada equipado'}</span>
          </header>
          <div class="inventory-group-grid">${group.map(itemCardHtml).join('')}</div>
        </section>`;
    }).join('');
  };

  /**
   * Comparação com o que já está no slot, mostrada enquanto o jogador aponta o item.
   *
   * Não calcula delta nenhum de propósito: as frases de efeito vêm formatadas do
   * servidor, e refazer a aritmética aqui criaria uma segunda régua para os mesmos
   * números. Mostrar os dois lados responde à pergunta ("vale a troca?") sem isso.
   */
  const renderCompare = (item) => {
    if (!compareRoot) return;
    if (!item) {
      compareRoot.hidden = true;
      compareRoot.innerHTML = '';
      return;
    }
    const current = equippedOf(item.slot);
    const side = (label, entry, extra = '') => `
      <div class="compare-side ${extra}" ${entry ? `data-rarity="${entry.rarity}"` : ''}>
        <span class="compare-role">${label}</span>
        <b>${entry ? escapeHtml(entry.name) : 'Slot vazio'}</b>
        <ul>${(entry?.effectLabels || []).map((line) => `<li>${escapeHtml(line)}</li>`).join('')
    || '<li class="compare-none">sem bônus</li>'}</ul>
      </div>`;
    compareRoot.hidden = false;
    compareRoot.innerHTML = current?.instanceId === item.instanceId
      ? `${side('Equipado agora', item, 'only')}
         <p class="compare-hint">Clique de novo para guardar.</p>`
      : `${side('Agora', current)}${side('Trocando por', item, 'next')}`;
  };

  const chests = () => snapshot?.chests || [];

  /**
   * A prateleira de baús — seção própria desde a v3.
   *
   * Era uma fileira de cards pequenos espremida no topo da bag, ao lado de vinte
   * itens que já são do jogador. Com espaço, o card passa a dizer o que o baú é: a
   * arte do TIPO (os cinco desenhavam a mesma caixa marrom), a descrição e a chance
   * de cada raridade.
   *
   * As chances viram BARRA além de pastilha: a fatia é desenhada no tamanho da
   * própria probabilidade, e é isso que mostra de relance que 5% de Lendária é uma
   * lasquinha — o número sozinho não faz ninguém sentir isso.
   */
  const renderChests = () => {
    if (!chestsRoot) return;
    const list = chests();
    const total = list.reduce((sum, chest) => sum + chest.count, 0);
    if (chestEmpty) chestEmpty.hidden = total > 0;
    if (chestCount) {
      chestCount.textContent = total === 1 ? '1 baú fechado' : `${total} baús fechados`;
    }
    chestsRoot.innerHTML = list.map((chest) => {
      const odds = chest.everything ? [] : (chest.odds || []);
      return `
      <button class="lootbox-card" type="button" data-chest-id="${chest.instanceIds[0]}"
        data-rarity="${chest.rarity || chest.odds?.at(-1)?.rarity || 'common'}"
        aria-label="${escapeHtml(`Abrir ${chest.name}. ${chest.description}`)}">
        <span class="lootbox-count">${chest.count}</span>
        <span class="lootbox-art" aria-hidden="true">
          <img src="assets/equipment/chests/${escapeHtml(chest.tier)}.png" alt="" draggable="false">
        </span>
        <strong>${escapeHtml(chest.name)}</strong>
        <span class="lootbox-note">${escapeHtml(chest.description || '')}</span>
        ${odds.length ? `<span class="lootbox-odds" aria-hidden="true">${odds
    .map((o) => `<i data-rarity="${o.rarity}" style="flex:${o.percent}"></i>`).join('')}</span>` : ''}
        <small>${chest.everything
          // A caixa do beta não sorteia: onde os outros mostram chances, ela diz o
          // que faz. Deixar o espaço vazio pareceria baú quebrado.
    ? '<i data-rarity="exotic">tudo</i>'
    : odds.map((o) => `<i data-rarity="${o.rarity}">${o.percent}%</i>`).join('')}</small>
        <span class="lootbox-open">Abrir</span>
      </button>`;
    }).join('');
  };

  /**
   * Revelação do prêmio. Um item novo aparecendo calado numa grade de vinte cards
   * passa despercebido — e o prêmio é o momento inteiro do baú.
   *
   * Fecha no clique ou sozinho; `prefers-reduced-motion` corta a animação no CSS,
   * não aqui, para o cartão continuar aparecendo para quem desligou movimento.
   */
  // Linhas do resumo da Caixa do Beta Tester. Ela não sorteia um prêmio: entrega
  // centenas de coisas, e anunciar "você ganhou um mouse" seria mentir sobre o que
  // acabou de acontecer. Zero não vira linha — quem abre a segunda caixa não precisa
  // ler quatro "0 itens".
  const betaLines = (beta) => [
    [beta.boosters, `${beta.boosters} boosters (${beta.boosterKinds} tipos)`],
    [beta.equipment, `${beta.equipment} equipamentos e veículos`],
    [beta.furniture, `${beta.furniture} móveis`],
    [beta.chests, `${beta.chests} baús`],
  ].filter(([count]) => count > 0).map(([, label]) => label);

  let revealTimer = 0;
  const showReveal = (prize) => {
    if (!revealRoot) return;
    clearTimeout(revealTimer);
    const rarity = prize.beta || prize.item ? prize.rarity : 'common';
    revealRoot.dataset.rarity = rarity;
    revealRoot.hidden = false;
    const beta = prize.beta
      ? betaLines(prize.beta)
      : null;
    revealRoot.innerHTML = `
      <div class="reveal-card" data-rarity="${rarity}">
        <span class="reveal-tier">${escapeHtml(prize.tierName)}</span>
        ${beta ? `
          <span class="reveal-art" aria-hidden="true">
            <img src="assets/equipment/chests/beta.png" alt="" draggable="false"></span>
          <strong>${beta.length ? 'Catálogo liberado' : 'Você já tinha tudo'}</strong>
          <span class="rarity-chip">Beta</span>
          <ul>${beta.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
        ` : prize.item ? `
          <span class="reveal-art" aria-hidden="true">${itemIcon(prize.item)}</span>
          <strong>${escapeHtml(prize.item.name)}</strong>
          <span class="rarity-chip">${escapeHtml(prize.rarityName)}</span>
          <ul>${(prize.item.effectLabels || []).map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
        ` : `
          <strong>+${prize.coins} moedas</strong>
          <span class="rarity-chip">${escapeHtml(prize.rarityName)}</span>
          <p class="reveal-note">Você já tinha todos os itens dessa raridade.</p>
        `}
      </div>`;
    // Reinicia a animação: sem o reflow, abrir dois baús seguidos deixaria o
    // segundo cartão parado no estado final do primeiro.
    revealRoot.classList.remove('on');
    void revealRoot.offsetWidth;
    revealRoot.classList.add('on');
    // A caixa do beta lista quatro linhas: 4,2s não dá para ler.
    revealTimer = setTimeout(() => { revealRoot.hidden = true; }, beta ? 8000 : 4200);
  };

  const renderEffects = () => {
    if (!effectsRoot) return;
    const labels = snapshot?.effectLabels || [];
    effectsRoot.innerHTML = labels.length
      ? labels.map((label) => `<li>${escapeHtml(label)}</li>`).join('')
      : '<li class="equipment-effects-empty">Nenhum bônus ativo — equipe algo.</li>';
  };

  const render = () => {
    renderSlots();
    renderList();
    renderChests();
    renderEffects();
    // A grade é reconstruída a cada render, então o card comparado deixou de existir.
    // Manter a tira mostraria um "agora / trocando por" que já não corresponde a nada.
    renderCompare(null);
    const equipped = slots().filter((slot) => equippedOf(slot.id)).length;
    loadoutCount.textContent = `${equipped}/${slots().length} equipados`;
    inventoryCount.textContent = `${items().length} ${items().length === 1 ? 'item' : 'itens'}`;
    clear.disabled = pending || equipped === 0;
    root?.classList.toggle('equipment-pending', pending);
    options.onChange?.(equippedOf('vehicle'), loadoutIds(snapshot));
  };

  /** Toda escrita passa por aqui: manda ao servidor e adota a resposta como verdade. */
  const apply = async (action) => {
    if (pending) return;
    pending = true;
    render();
    try {
      snapshot = await action();
    } catch (error) {
      options.onToast?.(error.message || 'Não foi possível trocar o equipamento.');
      console.warn('[equipamento] falha ao aplicar', error);
    } finally {
      pending = false;
      render();
    }
  };

  const refresh = async () => {
    if (!options.loadEquipment) return;
    try {
      snapshot = await options.loadEquipment();
    } catch (error) {
      console.warn('[equipamento] inventário indisponível', error);
    }
    render();
  };

  /**
   * A arte do item voa do card até o encaixe.
   *
   * Sem isso, equipar era o card mudar de cor e o slot mudar de conteúdo no mesmo
   * frame — duas coisas acontecendo longe uma da outra, e o jogador não via a
   * ligação entre elas. O voo dura 300ms e é o mesmo gesto que o RPG usa para dizer
   * "isto foi parar ali".
   *
   * `prefers-reduced-motion` cancela o voo, não a troca: quem desligou movimento
   * continua equipando, só sem a viagem.
   */
  const flyToSlot = (card, slotId) => {
    const source = card?.querySelector('.item-glyph');
    const slot = slotsRoot.querySelector(`.equipment-slot[data-slot-id="${slotId}"]`);
    if (!source || !slot || window.matchMedia?.('(prefers-reduced-motion:reduce)').matches) return;
    const from = source.getBoundingClientRect();
    const to = slot.getBoundingClientRect();
    const ghost = source.cloneNode(true);
    ghost.className = 'item-glyph equip-ghost';
    ghost.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px`;
    document.body.append(ghost);
    requestAnimationFrame(() => {
      const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
      const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
      ghost.style.transform = `translate(${dx}px,${dy}px) scale(.6)`;
      ghost.style.opacity = '.25';
    });
    setTimeout(() => {
      ghost.remove();
      // O painel foi redesenhado nesse meio tempo: o nó de antes já não está na
      // árvore, então a chegada é marcada no slot ATUAL, procurado de novo.
      const landed = slotsRoot.querySelector(`.equipment-slot[data-slot-id="${slotId}"]`);
      landed?.classList.add('slot-landed');
      setTimeout(() => landed?.classList.remove('slot-landed'), 420);
    }, 300);
  };

  const equip = (instanceId) => {
    const item = items().find((row) => String(row.instanceId) === String(instanceId));
    if (!item) return null;
    // Clicar no que já está equipado guarda: é o mesmo gesto de tirar, sem obrigar
    // o jogador a mirar no slot lá do outro lado do painel.
    if (!item.equipped) {
      flyToSlot(list.querySelector(`.inventory-item[data-instance-id="${item.instanceId}"]`), item.slot);
    }
    apply(() => options.setSlot(item.slot, item.equipped ? null : item.instanceId));
    return item;
  };

  const unequip = (slotId) => {
    if (!equippedOf(slotId)) return;
    apply(() => options.setSlot(slotId, null));
  };

  const clearAll = async () => {
    for (const slot of slots()) {
      if (equippedOf(slot.id)) await apply(() => options.setSlot(slot.id, null));
    }
  };

  /**
   * Abrir baú tem um passo a mais que equipar: além de atualizar a bag, precisa
   * ANUNCIAR o que saiu. Um item novo aparecendo calado no meio de uma grade de
   * vinte cards passa despercebido — e o prêmio é o momento inteiro do baú.
   */
  const openChest = async (instanceId) => {
    if (pending || !options.openLootbox) return null;
    pending = true;
    render();
    try {
      const result = await options.openLootbox(instanceId);
      snapshot = result.equipment;
      const prize = result.opened;
      showReveal(prize);
      options.onPrize?.(prize);
      return prize;
    } catch (error) {
      options.onToast?.(error.message || 'Não foi possível abrir o baú.');
      console.warn('[equipamento] falha ao abrir baú', error);
      return null;
    } finally {
      pending = false;
      render();
    }
  };

  // Quem mostra a tela é o menu do jogo (`hud/GearSections.js`): `open` só diz se a
  // área está à vista, para as teclas de veículo não agirem com o menu fechado.
  const setOpen = (nextOpen) => {
    if (nextOpen && options.isBlocked?.()) return false;
    open = Boolean(nextOpen);
    if (open) {
      refresh();
      document.querySelector(
        '#character-panel-view:not([hidden]) .character-option.selected, '
        + '#character-panel-view:not([hidden]) .character-option, '
        + '#equipment-panel-view:not([hidden]) .inventory-item.equipped, '
        + '#equipment-panel-view:not([hidden]) .inventory-item',
      )?.focus();
    }
    return open;
  };

  // ------------------------------------------------------- arrastar para ordenar
  //
  // A bag chega ordenada pelo servidor, e a ordem é do jogador (`BagOrder`). Aqui só
  // se move o card na tela e se manda a lista inteira — nunca "moveu de 3 para 7",
  // que divergiria se dois arrastes se atropelassem.
  //
  // O gesto tem dois gatilhos porque os dois aparelhos são diferentes: no mouse
  // arrasta-se depois de 8px, no toque só depois de segurar 350ms. Sem a espera no
  // toque, rolar a lista viraria arrastar card, e a bag ficaria impossível de ler.
  let drag = null;

  // O ponteiro pode ter sumido entre o `pointerdown` e a captura (dedo levantado,
  // evento sintético do harness): a captura é otimização de robustez, e falhar nela
  // não pode derrubar o arraste inteiro.
  const capture = (card, pointerId) => {
    try {
      card.setPointerCapture?.(pointerId);
    } catch { /* sem ponteiro ativo */ }
  };

  const cardUnder = (x, y, ignore) => [...list.querySelectorAll('.inventory-item')]
    .find((card) => {
      if (card === ignore || card.dataset.slot !== ignore.dataset.slot) return false;
      const box = card.getBoundingClientRect();
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    });

  // Instante do último arraste: o `click` que o navegador dispara ao soltar chegaria
  // no card e equiparia o que a pessoa acabou de mover de lugar.
  let lastDragEnd = 0;

  const endDrag = (commit) => {
    if (!drag) return;
    clearTimeout(drag.holdTimer);
    const { card, target, moved, x = 0 } = drag;
    drag = null;
    card.classList.remove('dragging');
    card.style.transform = '';
    for (const marked of list.querySelectorAll('.drop-target')) marked.classList.remove('drop-target');
    if (!moved) return;
    lastDragEnd = performance.now();
    if (!commit || !target) return;
    // Antes ou depois do alvo conforme o lado em que soltou: passar da metade do
    // card significa "entra depois dele".
    const box = target.getBoundingClientRect();
    target.parentNode.insertBefore(card, x > box.left + box.width / 2 ? target.nextSibling : target);
    const order = [...list.querySelectorAll('.inventory-item')]
      .map((entry) => Number(entry.dataset.instanceId));
    if (options.setBagOrder) apply(() => options.setBagOrder(order));
  };

  list.addEventListener('pointerdown', (event) => {
    const card = event.target.closest('.inventory-item');
    if (!card || event.button > 0 || pending) return;
    drag = { card, startX: event.clientX, startY: event.clientY, pointerId: event.pointerId, moved: false, target: null };
    if (event.pointerType !== 'mouse') {
      drag.holdTimer = setTimeout(() => {
        if (!drag) return;
        drag.moved = true;
        drag.card.classList.add('dragging');
        // Captura também no toque: sem ela, soltar o dedo fora do card não fecharia
        // o arraste e o item ficaria colado no ponteiro.
        capture(drag.card, drag.pointerId);
      }, 350);
    }
  });

  list.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved) {
      // Dedo que andou antes dos 350ms está rolando a lista, não arrastando card.
      if (event.pointerType !== 'mouse') {
        if (Math.hypot(dx, dy) > 8) { clearTimeout(drag.holdTimer); drag = null; }
        return;
      }
      if (Math.hypot(dx, dy) < 8) return;
      drag.moved = true;
      drag.card.classList.add('dragging');
      capture(drag.card, event.pointerId);
    }
    event.preventDefault();
    drag.x = event.clientX;
    drag.card.style.transform = `translate(${dx}px,${dy}px)`;
    const over = cardUnder(event.clientX, event.clientY, drag.card);
    if (over === drag.target) return;
    drag.target?.classList.remove('drop-target');
    drag.target = over || null;
    drag.target?.classList.add('drop-target');
  });

  for (const event of ['pointerup', 'pointercancel']) {
    list.addEventListener(event, (native) => endDrag(native.type === 'pointerup'));
  }

  close.addEventListener('click', () => setOpen(false));
  clear.addEventListener('click', () => clearAll());
  list.addEventListener('click', (event) => {
    const card = event.target.closest('.inventory-item');
    if (card && performance.now() - lastDragEnd > 150) equip(card.dataset.instanceId);
  });
  // A comparação segue o ponteiro no desktop e o foco no teclado. No toque não há
  // hover: lá o toque equipa direto e o resultado aparece no slot — um passo a menos,
  // não um a mais.
  const itemUnder = (target) => {
    const card = target?.closest?.('.inventory-item');
    return card
      ? items().find((row) => String(row.instanceId) === String(card.dataset.instanceId))
      : null;
  };
  list.addEventListener('pointerover', (event) => {
    const item = itemUnder(event.target);
    if (item) renderCompare(item);
  });
  list.addEventListener('focusin', (event) => renderCompare(itemUnder(event.target)));
  for (const leave of ['pointerleave', 'focusout']) {
    list.addEventListener(leave, () => renderCompare(null));
  }
  revealRoot?.addEventListener('click', () => { revealRoot.hidden = true; });
  slotsRoot.addEventListener('click', (event) => {
    const slot = event.target.closest('.equipment-slot');
    if (slot) unequip(slot.dataset.slotId);
  });
  chestsRoot?.addEventListener('click', (event) => {
    const chest = event.target.closest('.lootbox-card');
    if (chest) openChest(Number(chest.dataset.chestId));
  });

  // Tab e Esc são do menu do jogo, não deste módulo: com dois donos, uma tecla abria
  // a janela e fechava a outra ao mesmo tempo. Aqui ficam só os atalhos que dependem
  // de a área "Itens" estar à vista.
  window.addEventListener('keydown', (event) => {
    const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (editing || event.repeat || !open) return;
    const owned = vehicles();
    const index = Number.parseInt(event.key, 10) - 1;
    if (index >= 0 && index < owned.length) {
      event.preventDefault();
      apply(() => options.setSlot('vehicle', owned[index].instanceId));
    } else if (event.key === '0') {
      event.preventDefault();
      unequip('vehicle');
    }
  });

  render();
  refresh();

  return {
    getEquippedId: () => equippedOf('vehicle')?.id ?? null,
    getEquipment: () => equippedOf('vehicle'),
    getLoadout: () => loadoutIds(snapshot),
    getEffects: () => snapshot?.effects ?? null,
    getChests: () => chests(),
    isOpen: () => open,
    setOpen,
    equip,
    unequip,
    openChest,
    clearAll,
    refresh,
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
  const visual = equipment.visual || equipment.id;
  if (visual === 'skate') drawSkate(graphics, equipment, direction, phase);
  else if (visual === 'roller-skates') drawRollerSkates(graphics, equipment, direction, phase);
  else if (visual === 'electric-scooter') drawScooter(graphics, equipment, direction, phase);
  else if (visual === 'motorcycle') drawMotorcycle(graphics, equipment, direction, phase);
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
    // avatares remotos vêm e vão no meio da cena; sem isso os graphics ficariam pendurados
    destroy() {
      trail.destroy();
      equipmentGraphics.destroy();
      renderKey = '';
    },
  };
}
