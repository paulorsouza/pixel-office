// Painel de andares do elevador. Escada anda um andar por vez; elevador escolhe o destino,
// que é o que se espera de um prédio com vários andares.
//
// Segue as regras de painel do projeto: folha de tela cheia no celular, `env(safe-area-inset-*)`
// no que é `position: fixed`, alvo de toque ≥ 44px sob `pointer: coarse` e entrada no
// `uiIsBlocking()` de `main.js` — senão clique e pinça vazam para o mundo atrás.

const STYLE_ID = 'floor-picker-styles';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#floor-picker{position:fixed;inset:0;display:none;align-items:center;justify-content:center;
  background:#0b0d14cc;z-index:60;padding:calc(16px + env(safe-area-inset-top)) 16px
  calc(16px + env(safe-area-inset-bottom));backdrop-filter:blur(2px)}
#floor-picker.on{display:flex}
#floor-picker .fp-panel{background:#171a24;color:#e8ebf2;border:1px solid #2b3040;
  border-radius:14px;box-shadow:0 24px 60px #000a;width:min(360px,100%);max-height:100%;
  display:flex;flex-direction:column;overflow:hidden}
#floor-picker .fp-head{display:flex;align-items:center;gap:10px;padding:14px 16px;
  border-bottom:1px solid #252a38}
#floor-picker .fp-title{font:600 15px system-ui,sans-serif;flex:1}
#floor-picker .fp-close{background:#232838;color:#e8ebf2;border:0;border-radius:9px;
  min-width:34px;min-height:34px;font-size:16px;cursor:pointer}
#floor-picker .fp-list{overflow:auto;padding:8px;display:flex;flex-direction:column;gap:6px}
#floor-picker .fp-floor{display:flex;align-items:center;gap:12px;width:100%;
  background:#1e2331;color:#e8ebf2;border:1px solid #2b3040;border-radius:10px;
  padding:12px 14px;min-height:44px;font:500 14px system-ui,sans-serif;cursor:pointer;
  text-align:left}
#floor-picker .fp-floor:hover{background:#273047}
#floor-picker .fp-floor[aria-current="true"]{border-color:#7c5cff;background:#232a45}
#floor-picker .fp-badge{display:inline-flex;align-items:center;justify-content:center;
  min-width:30px;height:30px;border-radius:8px;background:#2c3450;color:#cdd6ff;
  font:600 13px system-ui,sans-serif}
#floor-picker .fp-hint{color:#98a0b6;font:400 12px system-ui,sans-serif}
@media (max-width:560px){
  #floor-picker{padding:0}
  #floor-picker .fp-panel{width:100%;height:100%;max-height:none;border-radius:0;border:0}
}
@media (pointer:coarse){
  #floor-picker .fp-floor{min-height:52px}
  #floor-picker .fp-close{min-width:44px;min-height:44px}
}`;
  document.head.append(style);
}

/**
 * @param {() => number} floorCount andares de salas pessoais existentes (o térreo é à parte)
 */
export function createFloorPicker(floorCount) {
  injectStyles();
  const root = document.createElement('div');
  root.id = 'floor-picker';
  root.innerHTML = `
    <div class="fp-panel" role="dialog" aria-modal="true" aria-label="Escolher andar">
      <div class="fp-head">
        <span class="fp-title">Elevador</span>
        <button class="fp-close" type="button" aria-label="Fechar">×</button>
      </div>
      <div class="fp-list"></div>
    </div>`;
  document.body.append(root);

  const list = root.querySelector('.fp-list');
  const closeButton = root.querySelector('.fp-close');
  let resolveChoice = null;

  function close(choice = null) {
    root.classList.remove('on');
    list.innerHTML = '';
    const resolve = resolveChoice;
    resolveChoice = null;
    resolve?.(choice);
  }

  closeButton.addEventListener('click', () => close());
  root.addEventListener('click', (event) => { if (event.target === root) close(); });
  window.addEventListener('keydown', (event) => {
    if (!root.classList.contains('on')) return;
    // O painel come as teclas enquanto está aberto: `E` aqui não pode reabrir o elevador.
    if (event.key === 'Escape') close();
    event.stopPropagation();
  }, true);

  /**
   * Abre o painel e resolve com `{ floor }` — `null` é o térreo — ou `null` se cancelar.
   * @param {number|null} currentFloor andar atual (`null` no térreo)
   */
  function open(currentFloor) {
    const floors = [
      { floor: null, label: 'Térreo', badge: 'T', hint: 'Recepção, reunião e sala grande' },
      ...Array.from({ length: Math.max(1, floorCount()) }, (unused, index) => ({
        floor: index,
        badge: `${index + 1}`,
        label: `${index + 1}º andar`,
        hint: 'Salas pessoais',
      })),
    ];
    list.innerHTML = '';
    for (const entry of floors) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fp-floor';
      const here = entry.floor === currentFloor;
      if (here) button.setAttribute('aria-current', 'true');
      button.innerHTML = `<span class="fp-badge">${entry.badge}</span>
        <span><span>${entry.label}</span><br><span class="fp-hint">${here ? 'você está aqui' : entry.hint}</span></span>`;
      button.disabled = here;
      button.addEventListener('click', () => close(entry));
      list.append(button);
    }
    root.classList.add('on');
    list.querySelector('.fp-floor:not([disabled])')?.focus();
    return new Promise((resolve) => { resolveChoice = resolve; });
  }

  return {
    open,
    isOpen: () => root.classList.contains('on'),
    close: () => close(),
  };
}
