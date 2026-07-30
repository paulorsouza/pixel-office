import { albumEntries, collectionProgress } from './CardCollection.js';

const TYPES = {
  normal: 'Normal', fire: 'Fogo', water: 'Água', electric: 'Elétrico', grass: 'Planta',
  ice: 'Gelo', fighting: 'Lutador', poison: 'Veneno', ground: 'Terra', flying: 'Voador',
  psychic: 'Psíquico', bug: 'Inseto', rock: 'Pedra', ghost: 'Fantasma', dragon: 'Dragão',
  dark: 'Sombrio', steel: 'Aço', fairy: 'Fada',
};

const SHINY_SIDES = {
  top: 'CIMA', right: 'DIREITA', bottom: 'BAIXO', left: 'ESQUERDA',
};

/** Seções que este módulo publica no menu do jogo. */
export const CARD_SECTIONS = [
  { id: 'album', icon: '▦', label: 'Álbum', title: 'Álbum Pokémon' },
  { id: 'boosters', icon: '✦', label: 'Boosters', title: 'Abrir boosters' },
  { id: 'deck', icon: '♠', label: 'Baralho', title: 'Baralho de batalha' },
];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
})[character]);

function injectStyles() {
  if (document.getElementById('cardgame-styles')) return;
  const style = document.createElement('style');
  style.id = 'cardgame-styles';
  style.textContent = `
    #cardgame-player-menu{position:fixed;z-index:130;min-width:220px;padding:10px;border:1px solid #ffffff2d;
      border-radius:14px;color:#fff;background:#151a2ef5;box-shadow:0 18px 55px #000a;font-family:Inter,system-ui,sans-serif;
      backdrop-filter:blur(12px)}
    .cg-player-head{display:flex;align-items:center;gap:9px;margin-bottom:9px}
    .cg-player-avatar{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;
      background:linear-gradient(135deg,#7b68ff,#43b9d0);font-weight:900}
    .cg-player-head strong{display:block;font-size:13px}
    .cg-player-head small{color:#aeb9d8;font-size:10px}
    .cg-player-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}
    #cardgame-invite{position:fixed;left:50%;top:18px;z-index:145;width:min(390px,calc(100vw - 28px));
      transform:translateX(-50%);padding:14px;border:2px solid #8e7dff;border-radius:15px;color:#fff;
      background:#171d38f5;box-shadow:0 20px 60px #000b;font-family:Inter,system-ui,sans-serif}
    #cardgame-invite strong{display:block;margin-bottom:3px;font-size:14px}
    #cardgame-invite p{margin:0 0 11px;color:#b9c3df;font-size:11px}
    .cg-invite-actions{display:flex;justify-content:flex-end;gap:7px}
    .cg-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(126px,1fr));gap:10px}
    .cg-card{position:relative;display:grid;grid-template-rows:auto 1fr auto;min-width:0;aspect-ratio:3/4;overflow:hidden;
      border:3px solid #536184;border-radius:12px;color:#fff;background:radial-gradient(circle at 50% 38%,#ffffff18,transparent 42%),
      linear-gradient(160deg,#28345d,#12182d);box-shadow:inset 0 0 0 1px #ffffff1c,0 7px 15px #0006;user-select:none}
    button.cg-card{width:100%;padding:0;cursor:pointer;text-align:initial}
    .cg-card.selected{outline:3px solid #7dffbf;transform:translateY(-2px)}
    .cg-card.disabled{cursor:not-allowed;filter:grayscale(.55) brightness(.68)}
    .cg-card.locked{filter:grayscale(1) brightness(.3)}
    .cg-card.locked img{opacity:.35}
    .cg-card.shiny:after{position:absolute;inset:0;content:"";pointer-events:none;
      background:linear-gradient(115deg,transparent 25%,#fff8 43%,transparent 58%);animation:cg-shine 2.4s infinite}
    .cg-card .cg-edge.boosted{z-index:4;border-color:#fff3a0;color:#1a1300;
      background:linear-gradient(145deg,#fff7a8,#ffc928 62%,#f0a900);
      box-shadow:0 0 0 2px #ffdc4d55,0 0 13px #ffd83dcc,inset 0 1px 0 #fffbd6;
      animation:cg-bonus-pulse 1.8s ease-in-out infinite}
    .cg-card .cg-edge.boosted:after{position:absolute;right:-14px;top:-9px;display:grid;place-items:center;
      min-width:18px;height:12px;padding:0 2px;border:1px solid #fff6b0;border-radius:5px;
      content:"+1";color:#281b00;background:#ffd83d;box-shadow:0 2px 5px #0008;font:900 7px/1 monospace}
    .cg-card .cg-edge.right.boosted:after{right:auto;left:-14px}
    .cg-card .cg-edge.left.boosted:after{right:-14px}
    .cg-info{position:absolute;z-index:5;right:2px;top:21px;display:grid;place-items:center;width:24px;height:24px;
      border:0;background:transparent;font-size:0;cursor:pointer}
    .cg-info:before{display:grid;place-items:center;width:24px;height:24px;content:"i";border:1px solid #ffffff45;
      border-radius:50%;color:#fff;background:#080c1dcc;font:900 11px system-ui}
    .cg-card-entry{display:grid;gap:6px;min-width:0}
    .cg-exchange-btn{min-height:38px;border:1px solid #f2bf5755;border-radius:9px;color:#ffe3a0;background:#3a2b15;cursor:pointer}
    .cg-evolution-btn{min-height:38px;border:1px solid #72d99a55;border-radius:9px;color:#c8ffda;background:#173624;cursor:pointer}
    .cg-card[data-rarity="Uncommon"]{border-color:#57bc83}
    .cg-card[data-rarity="Rare"]{border-color:#4ca8ed}
    .cg-card[data-rarity="Epic"]{border-color:#b96af1}
    .cg-card[data-rarity="Legendary"]{border-color:#f4c54f}
    .cg-card[data-rarity="Special"]{border-color:#ff77d7;box-shadow:0 0 18px #ff54c777,inset 0 0 20px #55dfff22}
    .cg-card-head{display:flex;align-items:center;gap:4px;padding:6px 7px 3px}
    .cg-card-head strong{min-width:0;overflow:hidden;
      flex:1;font-size:9px;text-overflow:ellipsis;white-space:nowrap}
    .cg-card-head small{color:#c7d0e6;font-size:7px}
    .cg-card-art{position:relative;display:grid;place-items:center;min-height:0;margin:0 8px;border:1px solid #ffffff1b;border-radius:8px;
      background:radial-gradient(circle,#dbeaff22,#0b1022 70%)}
    .cg-card-art img{width:min(84%,96px);height:min(84%,96px);
      z-index:1;object-fit:contain;image-rendering:pixelated;filter:drop-shadow(0 5px 4px #0008)}
    .cg-card.locked .cg-extra-spoon{opacity:.35}
    .cg-card-types{display:flex;gap:3px;padding:4px 6px 6px}
    .cg-type{padding:2px 4px;border-radius:5px;color:#fff;
      background:#5b6688;font-size:6px;text-transform:uppercase}
    .cg-owned{position:absolute;right:5px;bottom:5px;z-index:3;
      border-radius:7px;padding:3px 5px;background:#080b17dd;font-size:7px}
    .cg-shiny-label{color:#fff19b}
    .cg-edge{position:absolute;z-index:2;display:grid;place-items:center;width:24px;height:24px;border:2px solid #0a0d18;
      border-radius:8px;color:#fff;background:#2f3a65;box-shadow:inset 0 0 0 1px #ffffff30;font:900 11px monospace}
    .cg-edge.top{left:50%;top:25px;transform:translateX(-50%)}
    .cg-edge.right{right:3px;top:50%;transform:translateY(-50%)}
    .cg-edge.bottom{left:50%;bottom:20px;transform:translateX(-50%)}
    .cg-edge.left{left:3px;top:50%;transform:translateY(-50%)}
    .cg-deck-body{display:grid;grid-template-columns:250px 1fr;gap:14px}
    .cg-deck-slots{padding:12px;border:1px solid #ffffff16;
      border-radius:14px;background:#0c1122aa}
    .cg-deck-slot{display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:6px;
      border:1px solid #ffffff18;border-radius:9px;background:#202947}
    .cg-deck-slot img{width:38px;height:38px;image-rendering:pixelated}
    .cg-deck-slot strong{flex:1;font-size:10px}
    .cg-deck-slot button{border:0;color:#ffb4c7;background:transparent;cursor:pointer}
    .cg-booster-stage{display:grid;place-items:center;min-height:min(500px,calc(100dvh - 200px));text-align:center}
    .cg-booster-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;width:100%;text-align:left}
    .cg-booster-option{min-height:96px;padding:13px;border:1px solid #ffffff22;border-radius:13px;color:#fff;
      background:linear-gradient(145deg,#34296f,#171d39);cursor:pointer}
    .cg-booster-option:disabled{cursor:not-allowed;filter:grayscale(1);opacity:.45}
    .cg-booster-option strong,.cg-booster-option small{display:block}.cg-booster-option small{margin-top:5px;color:#b9c4df}
    .cg-booster-option b{float:right;color:#ffe079}
    .cg-rare-exchange{margin-bottom:12px;padding:13px;border:1px solid #f5c75f66;border-radius:13px;
      text-align:left;background:linear-gradient(145deg,#493311,#21180d)}
    .cg-rare-exchange strong,.cg-rare-exchange small{display:block}.cg-rare-exchange small{margin:5px 0 10px;color:#d8c9a7}
    .cg-pack{position:relative;width:220px;height:320px;
      border:3px solid #d6b65e;border-radius:18px;color:#fff;background:radial-gradient(circle at 50% 38%,#8a7aff,#372a82 42%,#121735 75%);
      box-shadow:0 24px 70px #000a,inset 0 0 30px #fff2;cursor:pointer;animation:cg-float 2.2s ease-in-out infinite}
    .cg-pack:before,.cg-pack:after{position:absolute;left:10px;right:10px;height:13px;content:"";background:repeating-linear-gradient(90deg,#e5c76b 0 8px,#7458ce 8px 16px)}
    .cg-pack:before{top:9px}
    .cg-pack:after{bottom:9px}
    .cg-pack b{display:block;margin-top:115px;font-size:24px}
    .cg-pack small{font-size:10px}
    .cg-reveal{display:grid;grid-template-columns:repeat(5,minmax(120px,160px));gap:12px;align-items:center}
    .cg-reveal .cg-card{opacity:0;animation:cg-reveal .55s forwards}
    .cg-reveal .cg-card:nth-child(2){animation-delay:.18s}
    .cg-reveal .cg-card:nth-child(3){animation-delay:.36s}
    .cg-reveal .cg-card:nth-child(4){animation-delay:.54s}
    .cg-reveal .cg-card:nth-child(5){animation-delay:.72s}
    @keyframes cg-float{50%{transform:translateY(-9px) rotate(1deg)}}
    @keyframes cg-reveal{from{opacity:0;transform:translateY(80px) rotateY(90deg)}to{opacity:1;transform:none}}
    @keyframes cg-shine{from{transform:translateX(-140%)}to{transform:translateX(140%)}}
    @keyframes cg-bonus-pulse{50%{filter:brightness(1.16);box-shadow:0 0 0 3px #ffdc4d66,0 0 17px #ffd83dee,inset 0 1px 0 #fffbd6}}
    @media (prefers-reduced-motion:reduce){.cg-card .cg-edge.boosted{animation:none}}
    .cg-match-window{width:min(1180px,100%);height:min(760px,calc(100dvh - 24px));overflow:auto}
    .cg-match{display:grid;grid-template-rows:auto 1fr;height:100%}
    .cg-match-top{display:flex;align-items:center;gap:10px;padding:10px 15px;
      border-bottom:1px solid #ffffff18}
    .cg-score{display:flex;gap:7px;font-weight:900}
    .cg-score b{padding:5px 9px;border-radius:8px;background:#ffffff12}
    .cg-score .p1{color:var(--cg-p1)}
    .cg-score .p2{color:var(--cg-p2)}
    .cg-turn{flex:1;text-align:center;color:#f8d977;
      font-size:12px;font-weight:900;text-transform:uppercase}
    .cg-arena{display:grid;grid-template-columns:minmax(370px,480px) minmax(280px,1fr);
      gap:16px;align-items:center;min-height:0;padding:14px}
    .cg-board{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;
      width:min(68vh,100%);aspect-ratio:1;margin:auto;padding:9px;border:2px solid #7783ad;border-radius:18px;
      background:linear-gradient(45deg,#ffffff06 25%,transparent 25% 75%,#ffffff06 75%) 0 0/24px 24px,#090e20}
    .cg-cell{position:relative;display:grid;place-items:center;overflow:hidden;border:1px solid #ffffff1b;border-radius:12px;
      background:#20294a;cursor:pointer}
    .cg-cell .cg-card{width:90%;height:90%;aspect-ratio:auto;animation:cg-reveal .25s}
    .cg-cell.controller-0{box-shadow:inset 0 0 0 3px var(--cg-p1)}
    .cg-cell.controller-1{box-shadow:inset 0 0 0 3px var(--cg-p2)}
    .cg-hand-zone{min-width:0}
    .cg-opponent{margin-bottom:18px;padding:10px;border:1px solid #ffffff18;border-radius:12px;background:#10162aaa}
    .cg-opponent small{color:#aeb8d5}
    .cg-card-backs{display:flex;margin-top:8px}
    .cg-back{width:34px;height:48px;margin-right:-13px;
      border:2px solid #7567da;border-radius:6px;background:radial-gradient(circle,#8e80ff 0 18%,#262e5d 19% 35%,#11162c 36%)}
    .cg-hand-title{display:flex;justify-content:space-between;margin-bottom:8px;color:#dfe5f6;font-size:11px}
    .cg-hand{display:grid;grid-template-columns:repeat(6,minmax(76px,1fr));gap:7px}
    .cg-hand .cg-card-types{display:none}
    .cg-hand .cg-edge{width:20px;height:20px;border-radius:6px;font-size:9px}
    .cg-result{padding:9px;text-align:center;border-radius:10px;background:#ffffff10;font-weight:900}
    @media(max-width:760px){
.cg-deck-body{grid-template-columns:1fr}
.cg-reveal{grid-template-columns:repeat(3,1fr)}
.cg-arena{grid-template-columns:1fr}
.cg-board{width:min(46vh,100%)}
.cg-hand{grid-template-columns:repeat(3,1fr)}
.cg-card-grid{grid-template-columns:repeat(3,minmax(80px,1fr))}
}
    html[data-touch="on"] .cg-nav button,
    html[data-touch="on"] .cg-shortcut,
    html[data-touch="on"] .cg-stat,
    html[data-touch="on"] .cg-cell{min-height:44px}
    html[data-touch="on"] .cg-deck-slot button{min-width:44px;min-height:44px}
    html[data-touch="on"] .cg-info,html[data-touch="on"] .cg-exchange-btn,
    html[data-touch="on"] .cg-evolution-btn{min-width:44px;min-height:44px}
    .cg-type-dialog{width:min(480px,calc(100vw - 24px));padding:18px;border:1px solid #ffffff30;border-radius:16px;
      color:#fff;background:#151b34;box-shadow:0 24px 80px #000c;font-family:Inter,system-ui,sans-serif}
    #cardgame-type-overlay{z-index:155}
    .cg-type-dialog header{display:flex;align-items:center;gap:10px}.cg-type-dialog header img{width:58px;height:58px;image-rendering:pixelated}
    .cg-type-dialog header div{flex:1}.cg-type-dialog h3{margin:0 0 4px}.cg-type-dialog p{color:#c0cae2;font-size:12px;line-height:1.55}
    .cg-type-groups{display:grid;grid-template-columns:1fr 1fr;gap:10px}.cg-type-group{padding:10px;border-radius:11px;background:#ffffff09}
    .cg-type-group strong{display:block;margin-bottom:7px;font-size:11px}.cg-type-chips{display:flex;flex-wrap:wrap;gap:5px}
    .cg-type-dialog [data-close]{min-width:44px;min-height:44px;border:0;border-radius:9px;color:#fff;background:#ffffff12;cursor:pointer}
  `;
  document.head.append(style);
}

function createRoots() {
  injectStyles();
  const wrapper = document.createElement('div');
  // A entrada do hub é o dock da HUD (`src/hud/Dock.js`); aqui só existem as
  // camadas do próprio cardgame.
  wrapper.innerHTML = `
    <div id="cardgame-player-menu" class="cg-hidden"></div>
    <div id="cardgame-invite" class="cg-hidden"></div>
    <div id="player-hub-overlay" class="cg-overlay cg-hidden"></div>
    <div id="cardgame-type-overlay" class="cg-overlay cg-hidden"></div>
    <div id="cardgame-match-overlay" class="cg-overlay cg-hidden"></div>`;
  document.body.append(...wrapper.children);
}

function extraSpoonsMarkup(card) {
  const extras = Math.max(0, Math.min(3, Number(card.spoonCount || 0) - 2));
  return Array.from({ length: extras }, (_, index) => (
    `<i class="cg-extra-spoon spoon-${index + 1}" aria-hidden="true"></i>`
  )).join('');
}

function cardMarkup(card, options = {}) {
  const {
    button = false, selected = false, disabled = false, locked = false, shiny = false,
    shinyBonusSide = '', quantity = 0, cardToken = card.id, showInfo = false,
    showShinySide = false,
  } = options;
  const tag = button ? 'button type="button"' : 'div';
  const close = button ? 'button' : 'div';
  return `<${tag} class="cg-card${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}${locked ? ' locked' : ''}${shiny ? ' shiny' : ''}"
    data-card-id="${card.id}" data-card-token="${escapeHtml(cardToken)}" data-rarity="${card.rarity}">
    <div class="cg-card-head"><strong>${escapeHtml(card.name)}</strong><small>#${String(card.dex).padStart(3, '0')}</small></div>
    ${showInfo ? '<span class="cg-info" role="button" aria-label="Ver vantagens e desvantagens">i</span>' : ''}
    <span class="cg-edge top${shinyBonusSide === 'top' ? ' boosted' : ''}">${card.edges.top + (shinyBonusSide === 'top' ? 1 : 0)}</span>
    <span class="cg-edge right${shinyBonusSide === 'right' ? ' boosted' : ''}">${card.edges.right + (shinyBonusSide === 'right' ? 1 : 0)}</span>
    <span class="cg-edge bottom${shinyBonusSide === 'bottom' ? ' boosted' : ''}">${card.edges.bottom + (shinyBonusSide === 'bottom' ? 1 : 0)}</span>
    <span class="cg-edge left${shinyBonusSide === 'left' ? ' boosted' : ''}">${card.edges.left + (shinyBonusSide === 'left' ? 1 : 0)}</span>
    <div class="cg-card-art" data-spoons="${card.spoonCount || 0}"><img src="${card.art}" alt="${escapeHtml(card.name)}"
      draggable="false">${extraSpoonsMarkup(card)}</div>
    <div class="cg-card-types">${card.types.map((type) => `<span class="cg-type">${TYPES[type] || type}</span>`).join('')}</div>
    ${quantity ? `<span class="cg-owned">${shiny ? `<b class="cg-shiny-label">✦ SHINY${showShinySide && shinyBonusSide ? ` +1 ${SHINY_SIDES[shinyBonusSide] || shinyBonusSide.toUpperCase()}` : ''}</b> · ` : ''}×${quantity}</span>` : ''}
  </${close}>`;
}

/**
 * @param options.openMenu    abre uma seção do menu do jogo (o duelo precisa
 *                            mandar a pessoa para o Baralho quando faltam cartas)
 * @param options.closeMenu   fecha o menu (a partida começou; a tela é dela)
 * @param options.isMenuOpen  o menu está na frente? (toque no mundo não vale)
 */
export function createCardGamePanel({
  presence, catalog, typeChart = {}, gameItems, onToast = () => {},
  openMenu = () => {}, closeMenu = () => {}, isMenuOpen = () => false,
}) {
  createRoots();
  const cards = catalog.cards || [];
  const byId = new Map(cards.map((card) => [card.id, card]));
  const menu = document.getElementById('cardgame-player-menu');
  const invite = document.getElementById('cardgame-invite');
  const typeOverlay = document.getElementById('cardgame-type-overlay');
  const matchOverlay = document.getElementById('cardgame-match-overlay');
  // A janela é do menu (`hud/MainMenu.js`); este módulo só desenha dentro dela.
  // `host` é a área de conteúdo emprestada e `menuApi` é como se troca o
  // cabeçalho e se navega entre seções.
  let host = document.createElement('div');
  let menuApi = { setHeader: () => {}, open: () => {}, close: () => {} };
  let profile = {
    boosters: 0, boosterInventory: [], boosterDefinitions: [], deck: [], collection: [],
    uniqueCards: 0, shinyCards: 0, baseTotal: catalog.baseCount || 1025,
    specialExchangeCost: 10, evolutionExchangeCost: 5,
  };
  let deck = [];
  let deckDraft = [];
  let activeTab = 'home';
  let matchState = null;
  let selectedCardId = null;
  let pendingMove = false;
  let opening = false;
  let albumLimit = 120;

  const collectionMap = () => {
    const result = new Map();
    for (const item of profile.collection || []) {
      const current = result.get(item.cardId) || { normal: 0, shiny: 0, variants: [] };
      current[item.isShiny ? 'shiny' : 'normal'] += item.quantity;
      current.variants.push(item);
      result.set(item.cardId, current);
    }
    return result;
  };
  const tokenCardId = (token) => String(token || '').split('~', 1)[0];
  const tokenSide = (token) => String(token || '').includes('~') ? String(token).split('~', 2)[1] : '';
  const ownedTokens = () => new Set((profile.collection || []).map((item) => (
    item.cardToken || (item.isShiny ? `${item.cardId}~${item.shinyBonusSide}` : item.cardId)
  )));
  const validDeck = (candidate) => Array.isArray(candidate) && candidate.length === 15
    && new Set(candidate.map(tokenCardId)).size === 15 && candidate.every((token) => ownedTokens().has(token));

  function bindCardInfo(container) {
    container.querySelectorAll('.cg-info').forEach((info) => {
      const open = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const cardElement = info.closest('.cg-card');
        showTypeOverlay(byId.get(cardElement.dataset.cardId));
      };
      info.addEventListener('pointerup', open);
      info.addEventListener('click', open);
    });
  }

  function showTypeOverlay(card) {
    if (!card) return;
    const strong = [...new Set(card.types.flatMap((type) => typeChart[type] || []))];
    const weak = Object.entries(typeChart)
      .filter(([, targets]) => card.types.some((type) => targets.includes(type)))
      .map(([type]) => type);
    const chips = (types) => types.length
      ? types.map((type) => `<span class="cg-type">${TYPES[type] || type}</span>`).join('')
      : '<span class="cg-type">Nenhum</span>';
    typeOverlay.innerHTML = `<section class="cg-type-dialog" role="dialog" aria-modal="true">
      <header><img src="${card.art}" alt=""><div><h3>${escapeHtml(card.name)}</h3>
        <div class="cg-type-chips">${chips(card.types)}</div></div><button data-close aria-label="Fechar">✕</button></header>
      <p>Durante um confronto, vantagem de tipo acrescenta <b>+1 TIPO</b> ao valor comparado.</p>
      <div class="cg-type-groups"><div class="cg-type-group"><strong>Vantagem contra</strong>
        <div class="cg-type-chips">${chips(strong)}</div></div><div class="cg-type-group"><strong>Desvantagem contra</strong>
        <div class="cg-type-chips">${chips(weak)}</div></div></div></section>`;
    typeOverlay.classList.remove('cg-hidden');
    typeOverlay.querySelector('[data-close]').onclick = () => typeOverlay.classList.add('cg-hidden');
    typeOverlay.onclick = (event) => {
      if (event.target === typeOverlay) typeOverlay.classList.add('cg-hidden');
    };
  }

  async function refreshProfile() {
    profile = await gameItems.cardGameProfile();
    deck = validDeck(profile.deck) ? [...profile.deck] : [];
    deckDraft = [...deck];
    return profile;
  }

  /** Desenha uma seção do cardgame na janela do menu. */
  function shell(title, subtitle, body) {
    menuApi.setHeader(title, subtitle);
    host.innerHTML = body;
  }

  function renderAlbum(filter = '', type = '', finish = '') {
    const owned = collectionMap();
    const specialCost = Number(profile.specialExchangeCost) || 10;
    const evolutionCost = Number(profile.evolutionExchangeCost) || 5;
    const progress = collectionProgress(cards, profile.collection);
    const normalized = filter.trim().toLowerCase();
    const filtered = albumEntries(cards, profile.collection).filter(({ card, isShiny }) => (!normalized
      || card.name.toLowerCase().includes(normalized)
      || String(card.dex).includes(normalized)) && (!type || card.types.includes(type))
      && (!finish || (finish === 'shiny') === isShiny));
    const visible = filtered.slice(0, albumLimit);
    const specialCopy = progress.specialOwned ? ` · ${progress.specialOwned} especiais` : '';
    shell('Álbum Pokémon', `${progress.baseOwned} de ${profile.baseTotal} descobertos${specialCopy} · ${profile.shinyCards} shiny`, `
      <div class="cg-filters"><input id="cg-search" placeholder="Buscar nome ou número" value="${escapeHtml(filter)}">
        <select id="cg-type"><option value="">Todos os tipos</option>${Object.entries(TYPES).map(([key, label]) =>
          `<option value="${key}"${key === type ? ' selected' : ''}>${label}</option>`).join('')}</select>
        <select id="cg-finish"><option value="">Normais e shinies</option>
          <option value="normal"${finish === 'normal' ? ' selected' : ''}>Somente normais</option>
          <option value="shiny"${finish === 'shiny' ? ' selected' : ''}>Somente shinies</option>
        </select></div>
      <div class="cg-card-grid">${visible.map((entry) => {
        const { card } = entry;
        const count = owned.get(card.id);
        const canExchange = !entry.isShiny && (count?.normal || 0) >= specialCost && !card.variant;
        const evolutionTargets = !entry.isShiny && (count?.normal || 0) >= evolutionCost
          ? (card.evolvesTo || []).map((id) => byId.get(id)).filter(Boolean)
          : [];
        return `<div class="cg-card-entry">${cardMarkup(card, {
          locked: entry.locked,
          shiny: entry.isShiny,
          shinyBonusSide: entry.shinyBonusSide,
          quantity: entry.quantity,
          cardToken: entry.cardToken,
          showInfo: true,
          showShinySide: true,
        })}${evolutionTargets.map((evolution) => `<button class="cg-evolution-btn"
          data-evolve-from="${card.id}" data-evolve-to="${evolution.id}">
          Evoluir ${evolutionCost} → ${escapeHtml(evolution.name)}</button>`).join('')}
          ${canExchange ? `<button class="cg-exchange-btn" data-exchange="${card.id}">
          Entregar ${specialCost} → Booster Especial</button>` : ''}</div>`;
      }).join('')}</div>
      ${filtered.length > visible.length ? `<button class="cg-btn" data-more style="width:100%;margin-top:12px">
        Mostrar mais (${visible.length}/${filtered.length})</button>` : ''}`);
    const search = host.querySelector('#cg-search');
    const typeSelect = host.querySelector('#cg-type');
    const finishSelect = host.querySelector('#cg-finish');
    const rerenderFiltered = () => {
      albumLimit = 120;
      renderAlbum(search.value, typeSelect.value, finishSelect.value);
    };
    search.oninput = rerenderFiltered;
    typeSelect.onchange = rerenderFiltered;
    finishSelect.onchange = rerenderFiltered;
    host.querySelector('[data-more]')?.addEventListener('click', () => {
      albumLimit += 120;
      renderAlbum(filter, type, finish);
    });
    host.querySelectorAll('[data-exchange]').forEach((button) => {
      button.onclick = async () => {
        try {
          const result = await gameItems.exchangeCardGameDuplicates(button.dataset.exchange);
          profile = result.profile;
          onToast(result.message);
          renderAlbum(filter, type, finish);
        } catch (error) { onToast(error.message); }
      };
    });
    host.querySelectorAll('[data-evolve-from]').forEach((button) => {
      button.onclick = async () => {
        try {
          const result = await gameItems.exchangeCardGameEvolution(
            button.dataset.evolveFrom,
            button.dataset.evolveTo,
          );
          profile = result.profile;
          onToast(result.message);
          renderAlbum(filter, type, finish);
        } catch (error) { onToast(error.message); }
      };
    });
    bindCardInfo(host);
  }

  function renderDeck(filter = '') {
    const normalized = filter.trim().toLowerCase();
    const choices = (profile.collection || []).map((item) => {
      const card = byId.get(item.cardId);
      const token = item.cardToken || (item.isShiny ? `${item.cardId}~${item.shinyBonusSide}` : item.cardId);
      return { card, token, item };
    }).filter(({ card }) => card && (!normalized
      || card.name.toLowerCase().includes(normalized) || String(card.dex).includes(normalized)));
    shell('Baralho de batalha', 'Escolha 15 espécies únicas; shinies usam o atributo bonificado', `<div class="cg-deck-body">
      <aside class="cg-deck-slots"><div class="cg-section-head"><h3>Baralho ativo</h3><span>${deckDraft.length}/15</span></div>
        ${deckDraft.length ? deckDraft.map((token, index) => {
          const card = byId.get(tokenCardId(token));
          return `<div class="cg-deck-slot"><img src="${card.art}" alt=""><strong>${index + 1}. ${escapeHtml(card.name)}
            ${tokenSide(token) ? ` <span class="cg-shiny-label">✦ ${tokenSide(token)}</span>` : ''}</strong>
            <button data-remove="${escapeHtml(token)}">✕</button></div>`;
        }).join('')
          : '<p style="color:#94a0bf;font-size:11px;line-height:1.6">Seu baralho está vazio. Abra boosters e escolha quinze cartas.</p>'}
        <button class="cg-btn primary" data-action="save" ${deckDraft.length === 15 ? '' : 'disabled'} style="width:100%;margin-top:8px">Salvar baralho</button>
      </aside><main><div class="cg-filters"><input id="cg-search" placeholder="Buscar no álbum" value="${escapeHtml(filter)}"></div>
        <div class="cg-card-grid">${choices.map(({ card, token, item }) => cardMarkup(card, {
          button: true,
          selected: deckDraft.includes(token),
          disabled: deckDraft.length >= 15 && !deckDraft.some((entry) => tokenCardId(entry) === card.id),
          shiny: item.isShiny,
          shinyBonusSide: item.shinyBonusSide,
          cardToken: token,
          quantity: item.quantity,
          showInfo: true,
        })).join('')}</div></main></div>`);
    host.querySelector('[data-action="save"]').onclick = async () => {
      try {
        profile = await gameItems.saveCardGameDeck(deckDraft);
        deck = [...deckDraft];
        onToast('Baralho de 15 cartas salvo');
        renderDeck(filter);
      } catch (error) { onToast(error.message); }
    };
    host.querySelectorAll('[data-remove]').forEach((button) => {
      button.onclick = () => { deckDraft = deckDraft.filter((id) => id !== button.dataset.remove); renderDeck(filter); };
    });
    host.querySelectorAll('button.cg-card[data-card-token]').forEach((button) => {
      button.onclick = () => {
        const token = button.dataset.cardToken;
        const cardId = tokenCardId(token);
        if (deckDraft.includes(token)) deckDraft = deckDraft.filter((entry) => entry !== token);
        else if (deckDraft.some((entry) => tokenCardId(entry) === cardId)) {
          deckDraft = deckDraft.map((entry) => tokenCardId(entry) === cardId ? token : entry);
        } else if (deckDraft.length < 15) deckDraft.push(token);
        renderDeck(filter);
      };
    });
    host.querySelector('#cg-search').oninput = (event) => renderDeck(event.target.value);
    bindCardInfo(host);
  }

  function renderBoosters(revealed = null) {
    const definitions = new Map((profile.boosterDefinitions || []).map((item) => [item.id, item]));
    const balances = profile.boosterInventory || [];
    const regularEntries = [...definitions.values()].filter((definition) => !definition.isSpecial).map((definition) => ({
      definition,
      targetCardId: '',
      quantity: balances.find((item) => item.boosterId === definition.id && !item.targetCardId)?.quantity || 0,
    }));
    const specialDefinition = definitions.get('special');
    const specialEntries = balances.filter((item) => item.boosterId === 'special').map((item) => ({
      definition: specialDefinition,
      targetCardId: item.targetCardId,
      quantity: item.quantity,
    }));
    const entries = [...regularEntries, ...specialEntries];
    const rareCost = Number(profile.rareExchangeCost) || 50;
    const rareMinSpecies = Number(profile.rareExchangeMinSpecies) || 10;
    const rareSpareCards = Number(profile.rareExchangeSpareCards) || 0;
    const rareSpecies = Number(profile.rareExchangeSpecies) || 0;
    const canExchangeRare = rareSpareCards >= rareCost && rareSpecies >= rareMinSpecies;
    shell('Abrir boosters', `${profile.boosters} pacote${profile.boosters === 1 ? '' : 's'} ${profile.boosters === 1 ? 'disponível' : 'disponíveis'}`, `
      <div class="cg-booster-stage">${revealed ? `<div><div class="cg-reveal">${revealed.map((item) =>
        cardMarkup(byId.get(item.cardId), {
          shiny: item.isShiny, shinyBonusSide: item.shinyBonusSide, cardToken: item.cardToken, quantity: 1, showInfo: true,
        })).join('')}</div>
        <button class="cg-btn primary" data-action="continue" style="margin-top:24px">${profile.boosters ? 'Abrir próximo' : 'Ver álbum'}</button></div>`
      : `<div style="width:100%"><div class="cg-rare-exchange"><strong>✦ Ritual do Booster Raro</strong>
          <small>Entregue ${rareCost} cópias normais Rare+ excedentes de pelo menos ${rareMinSpecies} espécies.
          Progresso: ${Math.min(rareSpareCards, rareCost)}/${rareCost} cartas · ${Math.min(rareSpecies, rareMinSpecies)}/${rareMinSpecies} espécies.</small>
          <button class="cg-btn primary" data-exchange-rare ${canExchangeRare ? '' : 'disabled'}>
            Entregar ${rareCost} cartas → Booster Raro</button></div>
        <div class="cg-booster-list">${entries.map(({ definition, targetCardId, quantity }) => {
        const target = targetCardId ? byId.get(targetCardId) : null;
        const title = target ? `${definition?.name || 'Booster Especial'} · ${target.name}` : definition.name;
        return `<button class="cg-booster-option" data-booster="${definition.id}" data-target="${targetCardId}"
          ${quantity > 0 ? '' : 'disabled'}><b>×${quantity}</b><strong>${escapeHtml(title)}</strong>
          <small>${escapeHtml(definition.description)}</small></button>`;
      }).join('')}</div>
        ${profile.boosters ? '<p style="color:#9ca8c7;font-size:10px">Escolha uma edição para abrir cinco cartas.</p>' : ''}
      </div>`}</div>`);
    host.querySelectorAll('[data-booster]:not(:disabled)').forEach((button) => {
      button.addEventListener('click', async () => {
        if (opening) return;
        opening = true;
        try {
          const result = await gameItems.openCardGameBooster(button.dataset.booster, button.dataset.target);
          profile = result.profile;
          setTimeout(() => { opening = false; renderBoosters(result.cards); }, 260);
        } catch (error) { opening = false; onToast(error.message); }
      });
    });
    host.querySelector('[data-exchange-rare]:not(:disabled)')?.addEventListener('click', async (event) => {
      event.currentTarget.disabled = true;
      try {
        const result = await gameItems.exchangeCardGameRareBooster();
        profile = result.profile;
        onToast(result.message);
        renderBoosters();
      } catch (error) {
        onToast(error.message);
        renderBoosters();
      }
    });
    host.querySelector('[data-action="continue"]')?.addEventListener('click', () => (
      profile.boosters ? renderBoosters() : menuApi.open('album')
    ));
    host.querySelector('[data-go="album"]')?.addEventListener('click', () => menuApi.open('album'));
    bindCardInfo(host);
  }

  /**
   * Ponto de entrada das seções do cardgame dentro do menu. Quadro, backlog,
   * horas e objetivos NÃO estão mais aqui: são seções próprias
   * (`hud/WorkSections.js`), com uma instância só do painel compartilhado.
   */
  async function renderSection(tab, contentHost, api) {
    closePlayerMenu();
    host = contentHost;
    menuApi = api;
    activeTab = tab;
    try { await refreshProfile(); }
    catch (error) { onToast(`Não foi possível atualizar a coleção: ${error.message}`); }
    if (tab === 'album') renderAlbum();
    else if (tab === 'deck') { deckDraft = [...deck]; renderDeck(); }
    else renderBoosters();
  }

  function openPlayerMenu(peer, pointer) {
    menu.innerHTML = `<div class="cg-player-head"><span class="cg-player-avatar">${escapeHtml(peer.name.slice(0, 1).toUpperCase())}</span>
      <div><strong>${escapeHtml(peer.name)}</strong><small>Jogador próximo</small></div></div>
      <div class="cg-player-actions"><button class="cg-btn primary" data-action="challenge">⚔ Desafiar</button>
      <button class="cg-btn" data-action="menu">▦ Meu menu</button></div>`;
    menu.style.left = `${Math.min(pointer.x + 12, innerWidth - 230)}px`;
    menu.style.top = `${Math.min(pointer.y + 12, innerHeight - 120)}px`;
    menu.classList.remove('cg-hidden');
    menu.querySelector('[data-action="challenge"]').onclick = () => {
      if (!validDeck(deck)) { onToast('Abra boosters e monte um baralho de 15 cartas primeiro'); openMenu('deck'); return; }
      presence.cardGameChallenge(peer.key, deck);
      onToast(`Desafio enviado para ${peer.name}`);
      closePlayerMenu();
    };
    menu.querySelector('[data-action="menu"]').onclick = () => openMenu('album');
  }
  function closePlayerMenu() { menu.classList.add('cg-hidden'); }

  function showInvite(data) {
    invite.innerHTML = `<strong>⚔ ${escapeHtml(data.fromName)} desafiou você!</strong>
      <p>Cardgame 3×3 · baralho de 15 · mão de 6</p><div class="cg-invite-actions">
      <button class="cg-btn" data-action="decline">Agora não</button><button class="cg-btn primary" data-action="accept">Aceitar duelo</button></div>`;
    invite.classList.remove('cg-hidden');
    invite.querySelector('[data-action="decline"]').onclick = () => { presence.cardGameDecline(data.challengeId); invite.classList.add('cg-hidden'); };
    invite.querySelector('[data-action="accept"]').onclick = () => {
      if (!validDeck(deck)) { invite.classList.add('cg-hidden'); onToast('Monte um baralho de 15 cartas primeiro'); openMenu('deck'); return; }
      presence.cardGameAccept(data.challengeId, deck); invite.classList.add('cg-hidden');
    };
    setTimeout(() => invite.classList.add('cg-hidden'), 45000);
  }

  function renderMatch() {
    if (!matchState) return;
    const mine = matchState.playerIndex;
    const opponent = mine === 0 ? 1 : 0;
    const myTurn = matchState.status === 'ongoing' && matchState.currentPlayer === mine;
    const result = matchState.status === 'finished' ? (matchState.winner === mine ? '🏆 Vitória!' : 'Fim de jogo') : null;
    matchOverlay.innerHTML = `<section class="cg-window cg-match-window"><div class="cg-match">
      <header class="cg-match-top"><strong>${escapeHtml(matchState.players[mine].name)}</strong>
        <div class="cg-score"><b class="p1">${matchState.score[mine]}</b><span>×</span><b class="p2">${matchState.score[opponent]}</b></div>
        <div class="cg-turn">${result || (myTurn ? 'Sua vez' : `Vez de ${escapeHtml(matchState.players[opponent].name)}`)}</div>
        <button class="cg-btn ${matchState.status === 'ongoing' ? 'danger' : ''}" data-action="exit">${matchState.status === 'ongoing' ? 'Desistir' : 'Fechar'}</button>
      </header><div class="cg-arena"><div class="cg-board">${matchState.board.map((cell, index) =>
        `<button class="cg-cell${cell ? ` controller-${cell.controller}` : ''}" data-cell="${index}"
          ${cell || !myTurn || !selectedCardId || pendingMove ? 'disabled' : ''}>${cell ? cardMarkup(byId.get(tokenCardId(cell.cardId)), {
            shiny: Boolean(tokenSide(cell.cardId)), shinyBonusSide: tokenSide(cell.cardId), cardToken: cell.cardId,
          }) : ''}</button>`).join('')}</div>
        <aside class="cg-hand-zone"><div class="cg-opponent"><strong>${escapeHtml(matchState.players[opponent].name)}</strong>
          <small> · ${matchState.players[opponent].handCount} na mão · ${matchState.players[opponent].drawPileCount} no monte</small>
          <div class="cg-card-backs">${Array.from({ length: matchState.players[opponent].handCount }, () => '<i class="cg-back"></i>').join('')}</div></div>
          <div class="cg-hand-title"><strong>Sua mão</strong><span>${matchState.players[mine].drawPileCount} no monte</span></div>
          <div class="cg-hand">${matchState.hand.map((id) => cardMarkup(byId.get(tokenCardId(id)), { button: true,
            selected: selectedCardId === id, disabled: !myTurn || pendingMove, shiny: Boolean(tokenSide(id)),
            shinyBonusSide: tokenSide(id), cardToken: id, showInfo: true })).join('')}</div>
          ${result ? `<div class="cg-result">${result} · ${matchState.score[mine]} a ${matchState.score[opponent]}</div>` : ''}</aside>
      </div></div></section>`;
    matchOverlay.classList.remove('cg-hidden');
    matchOverlay.querySelector('[data-action="exit"]').onclick = () => {
      if (matchState.status === 'ongoing') presence.cardGameResign(matchState.matchId);
      else closeMatch();
    };
    matchOverlay.querySelectorAll('.cg-hand .cg-card').forEach((button) => {
      button.onclick = () => { if (myTurn && !pendingMove) { selectedCardId = button.dataset.cardToken; renderMatch(); } };
    });
    matchOverlay.querySelectorAll('[data-cell]').forEach((cell) => {
      cell.onclick = () => {
        if (!selectedCardId || !myTurn || pendingMove) return;
        pendingMove = true;
        presence.cardGameMove(matchState.matchId, selectedCardId, Number(cell.dataset.cell), matchState.version);
        renderMatch();
      };
    });
    bindCardInfo(matchOverlay);
  }
  function closeMatch() { matchState = null; selectedCardId = null; pendingMove = false; matchOverlay.classList.add('cg-hidden'); }

  presence.events.addEventListener('CardChallengeReceived', (event) => showInvite(event.detail));
  presence.events.addEventListener('CardChallengeDeclined', (event) => onToast(`${event.detail.targetName} recusou o desafio`));
  presence.events.addEventListener('CardChallengeCancelled', () => invite.classList.add('cg-hidden'));
  presence.events.addEventListener('CardGameError', (event) => {
    pendingMove = false; onToast(event.detail.message || 'Não foi possível concluir a ação'); if (matchState) renderMatch();
  });
  presence.events.addEventListener('CardMatchStarted', () => { invite.classList.add('cg-hidden'); closePlayerMenu(); closeMenu(); });
  presence.events.addEventListener('CardMatchState', (event) => {
    matchState = event.detail; selectedCardId = null; pendingMove = false; renderMatch();
  });
  refreshProfile().catch((error) => onToast(`Álbum indisponível: ${error.message}`));

  return {
    handleWorldTap(pointer) {
      if (!matchOverlay.classList.contains('cg-hidden') || isMenuOpen()) return true;
      const peer = presence.remoteAt(pointer.worldX, pointer.worldY, 22);
      if (!peer) { closePlayerMenu(); return false; }
      openPlayerMenu(peer, pointer);
      return true;
    },
    // O menu tem registro próprio no chassi da HUD; aqui sobra a partida.
    isBlocking: () => !matchOverlay.classList.contains('cg-hidden'),
    openDeck: () => openMenu('deck'),
    /** `home | album | boosters | deck | hours | goals | board | backlog` */
    renderSection,
    getDeck: () => [...deck],
    closePlayerMenu,
  };
}
