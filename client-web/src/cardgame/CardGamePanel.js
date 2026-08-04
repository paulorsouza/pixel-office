import {
  albumEntries, collectionProgress, filterCardEntries, sortCardEntries,
  CARD_SORTS, RARITY_LABEL, RARITY_ORDER,
} from './CardCollection.js';
import {
  LEAGUES, MASTER_LEAGUE, illegalForLeague, leagueAllows, leagueById, leagueOf, leaguePower,
} from './Leagues.js';

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
    .cg-player-actions{display:grid;grid-template-columns:1fr;gap:7px}
    .cg-player-hint{margin:0 0 7px;color:#aeb9d8;font-size:10px}
    .cg-league-picker{display:grid;gap:5px;margin-bottom:9px}
    .cg-league-pick{display:flex;align-items:baseline;justify-content:space-between;gap:8px;
      padding:8px 10px;font-size:11px;text-align:left}
    .cg-league-pick small{color:#ffffffb0;font-size:9px;font-weight:400}
    .cg-invite-missing{margin:0 0 9px;color:#ffc9d8;font-size:10px}
    .cg-match-league{padding:4px 8px;border-radius:7px;
      background:#ffffff12;color:#c3b9ff;font-size:10px;font-weight:700}
    #cardgame-invite{position:fixed;left:50%;top:18px;z-index:145;width:min(390px,calc(100vw - 28px));
      transform:translateX(-50%);padding:14px;border:2px solid #8e7dff;border-radius:15px;color:#fff;
      background:#171d38f5;box-shadow:0 20px 60px #000b;font-family:Inter,system-ui,sans-serif}
    #cardgame-invite strong{display:block;margin-bottom:3px;font-size:14px}
    #cardgame-invite p{margin:0 0 11px;color:#b9c3df;font-size:11px}
    .cg-invite-actions{display:flex;justify-content:flex-end;gap:7px}
    .cg-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(126px,1fr));gap:10px}
    /* Cinco controles não cabem numa linha só nem no desktop; deixar quebrar é
       mais honesto do que espremer cada seletor até o rótulo virar reticências. */
    .cg-filters{flex-wrap:wrap}
    .cg-filters select{flex:1 1 150px}
    .cg-rarity-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:10px}
    .cg-rarity{--cg-rarity:#8f9bbd;border:1px solid var(--cg-rarity);border-radius:999px;padding:5px 12px;
      color:var(--cg-rarity);background:transparent;cursor:pointer;font:700 11px Inter,system-ui,sans-serif}
    .cg-rarity[aria-pressed="true"]{color:#0b1022;background:var(--cg-rarity)}
    .cg-rarity[data-rarity="Uncommon"]{--cg-rarity:#57bc83}
    .cg-rarity[data-rarity="Rare"]{--cg-rarity:#4ca8ed}
    .cg-rarity[data-rarity="Epic"]{--cg-rarity:#b96af1}
    .cg-rarity[data-rarity="Legendary"]{--cg-rarity:#f4c54f}
    .cg-rarity[data-rarity="Special"]{--cg-rarity:#ff77d7}
    /* Quem espreme é o resumo (que tem reticências), não a contagem: o número de
       cartas é o retorno de todo filtro e some por último. */
    .cg-filter-count{margin-left:auto;flex:none;color:#9aa6c6;font-size:11px;font-weight:400;white-space:nowrap}
    .cg-filter-drawer{margin-bottom:10px}
    .cg-filter-drawer>summary{display:flex;flex-wrap:nowrap;align-items:center;gap:7px;
      border:1px solid #ffffff20;border-radius:8px;padding:8px 10px;color:#dfe5f6;background:#11172c;
      cursor:pointer;list-style:none;font:700 12px Inter,system-ui,sans-serif}
    .cg-filter-drawer>summary::-webkit-details-marker{display:none}
    .cg-filter-drawer>summary:before{content:"▸";color:#8b97b8}
    .cg-filter-drawer[open]>summary{margin-bottom:10px}
    .cg-filter-drawer[open]>summary:before{content:"▾"}
    .cg-filter-drawer>summary em{min-width:0;overflow:hidden;flex:1;
      color:#9aa6c6;font-style:normal;font-weight:400;text-overflow:ellipsis;white-space:nowrap}
    .cg-empty-filter{margin:0 0 12px;color:#94a0bf;font-size:12px;line-height:1.6}
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
    /* Empilhado, não lado a lado: o construtor deixou de ter UM filho quando as
       abas de liga entraram. Na direção padrão do flex elas viravam uma coluna
       lateral esticada até o infinito, com o baralho jogado ao lado. */
    .cg-hub-content.cg-deck-host{display:flex;flex-direction:column;overflow:hidden}
    .cg-deck-body{display:grid;flex:1;grid-template-columns:250px minmax(0,1fr);gap:14px;width:100%;min-height:0}
    .cg-deck-slots,.cg-deck-choices{min-height:0;overflow-y:auto;overscroll-behavior:contain;
      scrollbar-width:thin;-webkit-overflow-scrolling:touch}
    .cg-deck-slots{padding:12px;border:1px solid #ffffff16;
      border-radius:14px;background:#0c1122aa}
    .cg-deck-choices{padding-right:4px}.cg-deck-choices .cg-filters{position:sticky;z-index:6;top:0;
      padding-bottom:8px;background:#141a31}
    /* As quatro ligas ficam SEMPRE visíveis no topo do construtor: é a única
       pista de que existem quatro baralhos e não um. */
    .cg-league-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-bottom:10px}
    .cg-league-tab{min-width:0;padding:7px 9px;border:1px solid #ffffff20;border-radius:10px;
      color:#c7d0e6;background:#11172c;cursor:pointer;text-align:left;font-family:Inter,system-ui,sans-serif}
    .cg-league-tab strong{display:block;overflow:hidden;font-size:11px;text-overflow:ellipsis;white-space:nowrap}
    .cg-league-tab small{display:block;margin-top:2px;color:#8b97b8;font-size:9px}
    .cg-league-tab.active{border-color:#8e7dff;color:#fff;background:#2b2560}
    .cg-league-tab.active small{color:#c3b9ff}
    .cg-deck-warning{margin:0 0 8px;padding:8px;border:1px solid #ff9db855;border-radius:9px;
      color:#ffd7e1;background:#3a1a26;font-size:10px;line-height:1.55}
    .cg-deck-pool{margin:0 0 8px;color:#8b97b8;font-size:10px}
    .cg-deck-slot.over{border-color:#ff9db8;background:#3a1a26}
    .cg-deck-slot strong small{color:#8b97b8;font-size:9px;font-weight:400}
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
.cg-deck-body{grid-template-columns:1fr;grid-template-rows:minmax(150px,.8fr) minmax(220px,1.2fr)}
/* Duas colunas de ~170px não seguram "Common League" numa linha; deixar quebrar
   é melhor do que entregar quatro abas com reticências no mesmo lugar. */
.cg-league-tabs{grid-template-columns:repeat(2,minmax(0,1fr))}
.cg-league-tab strong{white-space:normal}
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
    html[data-touch="on"] .cg-league-tab{min-height:44px}
    html[data-touch="on"] .cg-rarity{min-height:44px;padding:5px 15px}
    html[data-touch="on"] .cg-filters select{min-height:44px}
    html[data-touch="on"] .cg-filter-drawer>summary{min-height:44px}
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
 * Raridade é seleção MÚLTIPLA: "Épica + Lendária" é uma pergunta comum e um
 * `<select>` só responderia uma de cada vez. Lista vazia = "Todas", então o chip
 * "Todas" não é um valor, é o botão que limpa.
 */
function rarityChipsMarkup(selected = []) {
  const chip = (value, label, on) => `<button class="cg-rarity" type="button" id="cg-rarity-${value}"
    data-rarity-filter="${value}" data-rarity="${value}" aria-pressed="${on}">${label}</button>`;
  return chip('all', 'Todas', selected.length === 0)
    + RARITY_ORDER.map((rarity) => chip(rarity, RARITY_LABEL[rarity], selected.includes(rarity))).join('');
}

const toggleRarity = (selected, rarity) => (selected.includes(rarity)
  ? selected.filter((entry) => entry !== rarity)
  : [...selected, rarity]);

/**
 * O que a gaveta de filtros esconde quando está fechada. Uma gaveta fechada sem
 * resumo é uma caixa-preta: a lista aparece cortada e não dá para saber por quê.
 */
function albumSummary({ type = '', finish = '', owned = '', league = '', rarities = [], sort = 'dex' } = {}) {
  const parts = [];
  if (league) parts.push(leagueById(league)?.name || league);
  if (type) parts.push(TYPES[type] || type);
  if (finish) parts.push(finish === 'shiny' ? 'só shinies' : 'só normais');
  if (owned) parts.push(owned === 'mine' ? 'que eu tenho' : 'que faltam');
  if (rarities.length) parts.push(rarities.map((rarity) => RARITY_LABEL[rarity]).join(' + '));
  if (sort !== 'dex') parts.push(`por ${CARD_SORTS.find((option) => option.id === sort)?.label}`);
  return parts.length ? `· ${parts.join(' · ')}` : '· tudo, na ordem da Pokédex';
}

/** Seletor de ordenação — o mesmo no Álbum e no Baralho. */
const sortSelectMarkup = (id, active) => `<select id="${id}" aria-label="Ordenar por">${CARD_SORTS
  .map(({ id: value, label }) => `<option value="${value}"${value === active ? ' selected' : ''}>${label}</option>`)
  .join('')}</select>`;

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
  const emptyDecks = () => Object.fromEntries(LEAGUES.map((league) => [league.id, []]));
  let profile = {
    boosters: 0, boosterInventory: [], boosterDefinitions: [], decks: emptyDecks(), collection: [],
    uniqueCards: 0, shinyCards: 0, baseTotal: catalog.baseCount || 1025,
    specialExchangeCost: 10, evolutionExchangeCost: 5,
  };
  // Um baralho por liga: `decks` é o que está salvo no servidor e `deckDrafts` é
  // o que está sendo mexido na tela. `deckLeague` é a aba aberta.
  let decks = emptyDecks();
  let deckDrafts = emptyDecks();
  let deckLeague = MASTER_LEAGUE;
  let activeTab = 'home';
  let matchState = null;
  let selectedCardId = null;
  let pendingMove = false;
  let opening = false;
  let albumLimit = 120;
  // Como a pessoa está olhando a coleção. Fica fora do render porque o painel é
  // redesenhado inteiro a cada tecla: passar isso por parâmetro fazia a lista de
  // argumentos crescer a cada filtro novo, e voltar do Baralho para o Álbum
  // zerava o que a pessoa tinha escolhido.
  const albumView = { query: '', type: '', finish: '', owned: '', league: '', sort: 'dex', rarities: [] };
  const deckView = { query: '', sort: 'dex' };
  // No celular a barra inteira come 250px ANTES da primeira carta — mais do que
  // a área visível do menu. Lá ela nasce fechada (a busca fica sempre à mão); no
  // desktop, onde sobra largura, nasce aberta.
  let filtersOpen = !window.matchMedia('(max-width:760px)').matches;

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
  const deckCards = (tokens = []) => tokens.map((token) => byId.get(tokenCardId(token))).filter(Boolean);
  /** Quinze espécies distintas, todas no álbum e todas dentro do teto da liga. */
  const validDeck = (candidate, leagueId = MASTER_LEAGUE) => Array.isArray(candidate)
    && candidate.length === 15
    && new Set(candidate.map(tokenCardId)).size === 15
    && candidate.every((token) => ownedTokens().has(token))
    && illegalForLeague(leagueId, deckCards(candidate)).length === 0;

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
      <p><b>${escapeHtml(leagueOf(card).name)}</b> · poder impresso ${leaguePower(card)}
        — é a liga mais baixa em que esta carta pode jogar. O +1 do shiny não muda isso.</p>
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
    decks = emptyDecks();
    deckDrafts = emptyDecks();
    for (const league of LEAGUES) {
      const stored = profile.decks?.[league.id] || [];
      // Um baralho pode ficar inválido por fora: a carta saiu do álbum numa troca.
      // Nesse caso ele não vale para duelar, mas continua no rascunho para a
      // pessoa consertar em vez de recomeçar do zero.
      decks[league.id] = validDeck(stored, league.id) ? [...stored] : [];
      deckDrafts[league.id] = [...stored];
    }
    return profile;
  }

  /** Desenha uma seção do cardgame na janela do menu. */
  function shell(title, subtitle, body, { deckLayout = false } = {}) {
    menuApi.setHeader(title, subtitle);
    // O construtor de baralho é a única seção com duas colunas que rolam sozinhas;
    // era comparação de título e quebrava calado quando o título mudava.
    host.classList.toggle('cg-deck-host', deckLayout);
    // O campo de busca mora DENTRO do que é redesenhado: trocar o innerHTML
    // destrói justamente o nó em que a pessoa está digitando, e o foco (mais o
    // cursor) ia embora a cada letra. Guarda quem estava focado aqui e devolve
    // para o campo de mesmo id no desenho novo.
    const active = document.activeElement;
    const focusedId = active && active.id && host.contains(active) ? active.id : null;
    const start = focusedId ? active.selectionStart : null;
    const end = focusedId ? active.selectionEnd : null;
    host.innerHTML = body;
    if (!focusedId) return;
    const restored = host.querySelector(`#${CSS.escape(focusedId)}`);
    if (!restored) return;
    restored.focus();
    // `select` não tem seleção de texto; só input/textarea entram aqui.
    if (start != null) restored.setSelectionRange(start, end);
  }

  function renderAlbum() {
    const owned = collectionMap();
    const specialCost = Number(profile.specialExchangeCost) || 10;
    const evolutionCost = Number(profile.evolutionExchangeCost) || 5;
    const progress = collectionProgress(cards, profile.collection);
    const entries = albumEntries(cards, profile.collection);
    const filtered = sortCardEntries(filterCardEntries(entries, albumView), albumView.sort);
    const visible = filtered.slice(0, albumLimit);
    const specialCopy = progress.specialOwned ? ` · ${progress.specialOwned} especiais` : '';
    shell('Álbum Pokémon', `${progress.baseOwned} de ${profile.baseTotal} descobertos${specialCopy} · ${profile.shinyCards} shiny`, `
      <div class="cg-filters"><input id="cg-search" placeholder="Buscar nome ou número" value="${escapeHtml(albumView.query)}"></div>
      <details class="cg-filter-drawer" id="cg-filter-drawer"${filtersOpen ? ' open' : ''}>
        <summary>Filtros e ordem <em>${escapeHtml(albumSummary(albumView))}</em>
          <span class="cg-filter-count">${filtered.length} ${filtered.length === 1 ? 'carta' : 'cartas'}</span></summary>
        <div class="cg-filters">
          <select id="cg-type" aria-label="Tipo"><option value="">Todos os tipos</option>${Object.entries(TYPES).map(([key, label]) =>
            `<option value="${key}"${key === albumView.type ? ' selected' : ''}>${label}</option>`).join('')}</select>
          <select id="cg-finish" aria-label="Acabamento"><option value="">Normais e shinies</option>
            <option value="normal"${albumView.finish === 'normal' ? ' selected' : ''}>Somente normais</option>
            <option value="shiny"${albumView.finish === 'shiny' ? ' selected' : ''}>Somente shinies</option>
          </select>
          <select id="cg-owned" aria-label="Coleção"><option value="">Todo o álbum</option>
            <option value="mine"${albumView.owned === 'mine' ? ' selected' : ''}>Só as que eu tenho</option>
            <option value="missing"${albumView.owned === 'missing' ? ' selected' : ''}>Só as que faltam</option>
          </select>
          <select id="cg-league" aria-label="Liga"><option value="">Todas as ligas</option>${LEAGUES.map((league) =>
            `<option value="${league.id}"${league.id === albumView.league ? ' selected' : ''}>${league.name}${
              league.maxPower == null ? '' : ` (até ${league.maxPower})`}</option>`).join('')}</select>
          ${sortSelectMarkup('cg-sort', albumView.sort)}</div>
        <div class="cg-rarity-row" id="cg-rarities">${rarityChipsMarkup(albumView.rarities)}</div>
      </details>
      ${filtered.length ? '' : `<p class="cg-empty-filter">Nenhuma carta com esses filtros.
        Toque em <strong>Todas</strong> nas raridades ou limpe a busca.</p>`}
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
    // Mexeu em qualquer filtro, a lista volta para o começo: manter 600 cartas
    // carregadas depois de escolher "Lendária" só faz o desenho demorar.
    const applyFilter = (change) => {
      Object.assign(albumView, change);
      albumLimit = 120;
      renderAlbum();
    };
    const bind = (id, field, event = 'onchange') => {
      const element = host.querySelector(id);
      element[event] = () => applyFilter({ [field]: element.value });
    };
    const drawer = host.querySelector('#cg-filter-drawer');
    drawer.ontoggle = () => { filtersOpen = drawer.open; };
    bind('#cg-search', 'query', 'oninput');
    bind('#cg-type', 'type');
    bind('#cg-finish', 'finish');
    bind('#cg-owned', 'owned');
    bind('#cg-league', 'league');
    bind('#cg-sort', 'sort');
    host.querySelector('#cg-rarities').onclick = (event) => {
      const chip = event.target.closest('[data-rarity-filter]');
      if (!chip) return;
      const picked = chip.dataset.rarityFilter;
      applyFilter({ rarities: picked === 'all' ? [] : toggleRarity(albumView.rarities, picked) });
    };
    host.querySelector('[data-more]')?.addEventListener('click', () => {
      albumLimit += 120;
      renderAlbum();
    });
    host.querySelectorAll('[data-exchange]').forEach((button) => {
      button.onclick = async () => {
        try {
          const result = await gameItems.exchangeCardGameDuplicates(button.dataset.exchange);
          profile = result.profile;
          onToast(result.message);
          renderAlbum();
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
          renderAlbum();
        } catch (error) { onToast(error.message); }
      };
    });
    bindCardInfo(host);
  }

  function renderDeck() {
    // As mesmas entradas do álbum, no formato que `filterCardEntries`/`sortCardEntries`
    // esperam — é aqui que "maior poder à direita" vale mais, porque é escolhendo
    // as 15 que a pessoa compara borda por borda.
    const owned = (profile.collection || []).map((item) => {
      const token = item.cardToken || (item.isShiny ? `${item.cardId}~${item.shinyBonusSide}` : item.cardId);
      return {
        card: byId.get(item.cardId),
        token,
        item,
        isShiny: Boolean(item.isShiny),
        shinyBonusSide: item.isShiny ? (item.shinyBonusSide || tokenSide(token)) : '',
        quantity: item.quantity,
      };
    });
    const league = leagueById(deckLeague);
    const draft = deckDrafts[deckLeague];
    // As cartas fora do teto NÃO aparecem na escolha: com mil cartas no álbum,
    // uma grade cheia de opções proibidas é ruído. Quem explica a regra é o
    // cabeçalho da liga e o aviso das cartas que já estavam no rascunho.
    const choices = sortCardEntries(
      filterCardEntries(owned, { query: deckView.query, league: deckLeague }),
      deckView.sort,
    );
    const eligible = owned.filter((entry) => leagueAllows(deckLeague, entry.card)).length;
    const over = illegalForLeague(deckLeague, deckCards(draft));
    const complete = draft.length === 15;
    const saved = decks[deckLeague];
    const unchanged = saved.length === draft.length && saved.every((token, index) => token === draft[index]);
    shell('Baralhos por liga', `${league.name} · ${league.maxPower == null
      ? 'sem teto de poder' : `até ${league.maxPower} de poder impresso`} · ${league.hint}`, `
      <div class="cg-league-tabs" id="cg-league-tabs">${LEAGUES.map((entry) => {
        const count = deckDrafts[entry.id].length;
        // "15/15" sozinho mentia quando o baralho estava cheio mas ilegal — o que
        // a aba precisa dizer é se dá para DUELAR com ele, não se tem quinze.
        const state = decks[entry.id].length === 15 ? 'pronto'
          : count === 15 ? 'revisar' : `${count}/15`;
        return `<button class="cg-league-tab${entry.id === deckLeague ? ' active' : ''}" type="button"
          id="cg-league-tab-${entry.id}" data-league="${entry.id}" aria-pressed="${entry.id === deckLeague}">
          <strong>${entry.name}</strong>
          <small>${entry.maxPower == null ? 'sem teto' : `até ${entry.maxPower}`} · ${state}</small></button>`;
      }).join('')}</div>
      <div class="cg-deck-body">
      <aside class="cg-deck-slots"><div class="cg-section-head"><h3>${escapeHtml(league.name)}</h3><span>${draft.length}/15</span></div>
        ${over.length ? `<p class="cg-deck-warning">${over.length === 1 ? 'Uma carta estoura' : `${over.length} cartas estouram`}
          o teto de ${league.maxPower}: ${over.slice(0, 3).map((card) =>
            `${escapeHtml(card.name)} (${leaguePower(card)})`).join(', ')}${over.length > 3 ? '…' : ''}.
          Tire ${over.length === 1 ? 'ela' : 'elas'} para salvar nesta liga.</p>` : ''}
        ${draft.length ? draft.map((token, index) => {
          const card = byId.get(tokenCardId(token));
          const fits = leagueAllows(deckLeague, card);
          return `<div class="cg-deck-slot${fits ? '' : ' over'}"><img src="${card.art}" alt=""><strong>${index + 1}. ${escapeHtml(card.name)}
            ${tokenSide(token) ? ` <span class="cg-shiny-label">✦ ${tokenSide(token)}</span>` : ''}
            <small>${leaguePower(card)}</small></strong>
            <button data-remove="${escapeHtml(token)}">✕</button></div>`;
        }).join('')
          : '<p style="color:#94a0bf;font-size:11px;line-height:1.6">Este baralho está vazio. Escolha quinze espécies que caibam no teto da liga.</p>'}
        <button class="cg-btn primary" data-action="save" ${complete && !over.length && !unchanged ? '' : 'disabled'}
          style="width:100%;margin-top:8px">${unchanged && complete ? 'Baralho salvo' : `Salvar ${escapeHtml(league.name)}`}</button>
      </aside><main class="cg-deck-choices"><div class="cg-filters">
          <input id="cg-search" placeholder="Buscar no álbum" value="${escapeHtml(deckView.query)}">
          ${sortSelectMarkup('cg-sort', deckView.sort)}</div>
        <p class="cg-deck-pool">${eligible} ${eligible === 1 ? 'carta elegível' : 'cartas elegíveis'} nesta liga${
          league.maxPower == null ? '' : ' — as acima do teto ficam de fora da lista'}.</p>
        <div class="cg-card-grid">${choices.map(({ card, token, item }) => cardMarkup(card, {
          button: true,
          selected: draft.includes(token),
          disabled: draft.length >= 15 && !draft.some((entry) => tokenCardId(entry) === card.id),
          shiny: item.isShiny,
          shinyBonusSide: item.shinyBonusSide,
          cardToken: token,
          quantity: item.quantity,
          showInfo: true,
        })).join('')}</div></main></div>`, { deckLayout: true });
    host.querySelector('#cg-league-tabs').onclick = (event) => {
      const tab = event.target.closest('[data-league]');
      if (!tab || tab.dataset.league === deckLeague) return;
      deckLeague = tab.dataset.league;
      renderDeck();
    };
    host.querySelector('[data-action="save"]').onclick = async () => {
      try {
        profile = await gameItems.saveCardGameDeck(deckLeague, deckDrafts[deckLeague]);
        decks[deckLeague] = [...deckDrafts[deckLeague]];
        onToast(`${league.name}: baralho de 15 cartas salvo`);
        renderDeck();
      } catch (error) { onToast(error.message); }
    };
    host.querySelectorAll('[data-remove]').forEach((button) => {
      button.onclick = () => {
        deckDrafts[deckLeague] = draft.filter((id) => id !== button.dataset.remove);
        renderDeck();
      };
    });
    host.querySelectorAll('button.cg-card[data-card-token]').forEach((button) => {
      button.onclick = () => {
        const token = button.dataset.cardToken;
        const cardId = tokenCardId(token);
        if (draft.includes(token)) deckDrafts[deckLeague] = draft.filter((entry) => entry !== token);
        else if (draft.some((entry) => tokenCardId(entry) === cardId)) {
          deckDrafts[deckLeague] = draft.map((entry) => tokenCardId(entry) === cardId ? token : entry);
        } else if (draft.length < 15) deckDrafts[deckLeague] = [...draft, token];
        renderDeck();
      };
    });
    const deckSearch = host.querySelector('#cg-search');
    const deckSort = host.querySelector('#cg-sort');
    deckSearch.oninput = () => { deckView.query = deckSearch.value; renderDeck(); };
    deckSort.onchange = () => { deckView.sort = deckSort.value; renderDeck(); };
    bindCardInfo(host);
  }

  function renderBoosters(revealed = null, revealSummary = '') {
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
    const rareMinRareCards = Number(profile.rareExchangeMinRareCards) || 10;
    const rareMinTypes = Number(profile.rareExchangeMinTypes) || 10;
    const rareSpareCards = Number(profile.rareExchangeSpareCards) || 0;
    const rareCards = Number(profile.rareExchangeRareCards) || 0;
    const rareTypes = Number(profile.rareExchangeTypes) || 0;
    const canExchangeRare = rareSpareCards >= rareCost
      && rareCards >= rareMinRareCards && rareTypes >= rareMinTypes;
    shell('Abrir boosters', `${profile.boosters} pacote${profile.boosters === 1 ? '' : 's'} ${profile.boosters === 1 ? 'disponível' : 'disponíveis'}`, `
      <div class="cg-booster-stage">${revealed ? `<div>${revealSummary
    ? `<p class="cg-result">${escapeHtml(revealSummary)}</p>` : ''}<div class="cg-reveal">${revealed.map((item) =>
        cardMarkup(byId.get(item.cardId), {
          shiny: item.isShiny, shinyBonusSide: item.shinyBonusSide, cardToken: item.cardToken, quantity: 1, showInfo: true,
        })).join('')}</div>
        <button class="cg-btn primary" data-action="continue" style="margin-top:24px">${profile.boosters ? 'Abrir próximo' : 'Ver álbum'}</button></div>`
      : `<div style="width:100%"><div class="cg-rare-exchange"><strong>✦ Ritual do Booster Raro</strong>
          <small>Entregue ${rareCost} cartas normais excedentes, incluindo pelo menos ${rareMinRareCards} Rare+
          e ${rareMinTypes} tipos. Progresso: ${Math.min(rareSpareCards, rareCost)}/${rareCost} cartas ·
          ${Math.min(rareCards, rareMinRareCards)}/${rareMinRareCards} Rare+ ·
          ${Math.min(rareTypes, rareMinTypes)}/${rareMinTypes} tipos.</small>
          <button class="cg-btn primary" data-exchange-rare ${canExchangeRare ? '' : 'disabled'}>
            Entregar ${rareCost} cartas → Booster Raro</button></div>
        ${profile.boosters > 0 ? `<button class="cg-btn primary" data-open-all style="width:100%;min-height:44px;margin-bottom:12px">
          ABRIR TODOS OS ${profile.boosters} BOOSTERS</button>` : ''}
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
    host.querySelector('[data-open-all]')?.addEventListener('click', async (event) => {
      if (opening) return;
      opening = true;
      event.currentTarget.disabled = true;
      try {
        const result = await gameItems.openAllCardGameBoosters();
        profile = result.profile;
        opening = false;
        renderBoosters(result.cards, `${result.openedBoosters} boosters abertos · ${result.cards.length} cartas recebidas`);
      } catch (error) {
        opening = false;
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
    else if (tab === 'deck') renderDeck();
    else renderBoosters();
  }

  /** Ligas em que este jogador tem baralho pronto para duelar. */
  const readyLeagues = () => LEAGUES.filter((league) => validDeck(decks[league.id], league.id));

  function openPlayerMenu(peer, pointer) {
    // A liga é escolhida AQUI, no ato do desafio: é a única decisão que o
    // convite carrega, e quem aceita joga com o baralho da mesma liga.
    const ready = readyLeagues();
    menu.innerHTML = `<div class="cg-player-head"><span class="cg-player-avatar">${escapeHtml(peer.name.slice(0, 1).toUpperCase())}</span>
      <div><strong>${escapeHtml(peer.name)}</strong><small>Jogador próximo</small></div></div>
      ${ready.length ? `<p class="cg-player-hint">Desafiar em qual liga?</p>
        <div class="cg-league-picker">${LEAGUES.map((league) => {
          const can = ready.includes(league);
          return `<button class="cg-btn cg-league-pick${can ? ' primary' : ''}" data-challenge="${league.id}"
            ${can ? '' : 'disabled'} title="${can ? '' : 'Monte o baralho desta liga primeiro'}">
            ${escapeHtml(league.name)}<small>${league.maxPower == null ? 'sem teto' : `até ${league.maxPower}`}${
              can ? '' : ' · sem baralho'}</small></button>`;
        }).join('')}</div>`
        : `<p class="cg-player-hint">Você ainda não tem baralho pronto em nenhuma liga.</p>`}
      <div class="cg-player-actions"><button class="cg-btn" data-action="menu">▦ Meus baralhos</button></div>`;
    // Posiciona MEDINDO: a altura do menu depende de quantas ligas existem e de
    // quanto texto cabe na largura da tela. A constante que havia aqui era um
    // chute do tamanho antigo, e o menu passou a ser bem mais alto.
    menu.style.left = '0px';
    menu.style.top = '0px';
    menu.classList.remove('cg-hidden');
    const size = menu.getBoundingClientRect();
    const margin = 8;
    menu.style.left = `${Math.max(margin, Math.min(pointer.x + 12, innerWidth - size.width - margin))}px`;
    menu.style.top = `${Math.max(margin, Math.min(pointer.y + 12, innerHeight - size.height - margin))}px`;
    menu.querySelectorAll('[data-challenge]').forEach((button) => {
      button.onclick = () => {
        const leagueId = button.dataset.challenge;
        presence.cardGameChallenge(peer.key, leagueId);
        onToast(`Desafio enviado para ${peer.name} · ${leagueById(leagueId).name}`);
        closePlayerMenu();
      };
    });
    menu.querySelector('[data-action="menu"]').onclick = () => openMenu('deck');
  }
  function closePlayerMenu() { menu.classList.add('cg-hidden'); }

  function showInvite(data) {
    // Quem desafia escolhe a liga; quem aceita joga com o baralho DAQUELA liga.
    // Por isso o convite diz qual é, e o botão só aceita se esse baralho existir.
    const leagueId = data.leagueId || MASTER_LEAGUE;
    const league = leagueById(leagueId);
    const ready = validDeck(decks[leagueId], leagueId);
    invite.innerHTML = `<strong>⚔ ${escapeHtml(data.fromName)} desafiou você!</strong>
      <p>${escapeHtml(data.leagueName || league?.name || 'Duelo')} · ${league?.maxPower == null
        ? 'sem teto de poder' : `até ${league.maxPower} de poder`} · baralho de 15 · mão de 6</p>
      ${ready ? '' : `<p class="cg-invite-missing">Você ainda não tem baralho pronto nesta liga.</p>`}
      <div class="cg-invite-actions">
      <button class="cg-btn" data-action="decline">Agora não</button>
      <button class="cg-btn primary" data-action="accept">${ready ? 'Aceitar duelo' : 'Montar baralho'}</button></div>`;
    invite.classList.remove('cg-hidden');
    invite.querySelector('[data-action="decline"]').onclick = () => { presence.cardGameDecline(data.challengeId); invite.classList.add('cg-hidden'); };
    invite.querySelector('[data-action="accept"]').onclick = () => {
      invite.classList.add('cg-hidden');
      if (!ready) {
        deckLeague = leagueId;
        onToast(`Monte o baralho da ${league?.name || 'liga'} para aceitar`);
        openMenu('deck');
        return;
      }
      presence.cardGameAccept(data.challengeId);
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
        ${matchState.leagueName ? `<span class="cg-match-league">${escapeHtml(matchState.leagueName)}</span>` : ''}
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
    closePlayerMenu,
  };
}
