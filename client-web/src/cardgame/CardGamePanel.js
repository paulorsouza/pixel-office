import { createWorkPanel } from '../WorkPanel.js';
import { auth } from '../auth.js';
import { albumCatalog, collectionProgress } from './CardCollection.js';

const TYPES = {
  normal: 'Normal', fire: 'Fogo', water: 'Água', electric: 'Elétrico', grass: 'Planta',
  ice: 'Gelo', fighting: 'Lutador', poison: 'Veneno', ground: 'Terra', flying: 'Voador',
  psychic: 'Psíquico', bug: 'Inseto', rock: 'Pedra', ghost: 'Fantasma', dragon: 'Dragão',
  dark: 'Sombrio', steel: 'Aço', fairy: 'Fada',
};

const MENU_ITEMS = [
  ['home', '⌂', 'Visão geral'],
  ['album', '▦', 'Álbum'],
  ['boosters', '✦', 'Boosters'],
  ['deck', '♠', 'Baralho'],
  ['hours', '◷', 'Horas'],
  ['goals', '◎', 'Objetivos'],
  ['board', '▤', 'Quadro'],
  ['backlog', '≡', 'Backlog'],
];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
})[character]);

function injectStyles() {
  if (document.getElementById('cardgame-styles')) return;
  const style = document.createElement('style');
  style.id = 'cardgame-styles';
  style.textContent = `
    :root{--cg-bg:#0d1225;--cg-panel:#19203d;--cg-ink:#f8f4e8;--cg-muted:#9da9ca;
      --cg-accent:#7868ff;--cg-gold:#f4c960;--cg-p1:#56b7ff;--cg-p2:#ff5f8f}
    .cg-hidden{display:none!important}.cg-btn{border:1px solid #ffffff25;border-radius:9px;padding:8px 12px;
      color:#fff;background:#2c355f;cursor:pointer;font:700 12px Inter,system-ui,sans-serif;box-shadow:inset 0 -2px #0004}
    .cg-btn:hover:not(:disabled){filter:brightness(1.16)}.cg-btn:disabled{cursor:not-allowed;opacity:.45}
    .cg-btn.primary{background:#6857ee}.cg-btn.danger{background:#8f3854}
    #cardgame-player-menu{position:fixed;z-index:130;min-width:220px;padding:10px;border:1px solid #ffffff2d;
      border-radius:14px;color:#fff;background:#151a2ef5;box-shadow:0 18px 55px #000a;font-family:Inter,system-ui,sans-serif;
      backdrop-filter:blur(12px)}.cg-player-head{display:flex;align-items:center;gap:9px;margin-bottom:9px}
    .cg-player-avatar{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;
      background:linear-gradient(135deg,#7b68ff,#43b9d0);font-weight:900}
    .cg-player-head strong{display:block;font-size:13px}.cg-player-head small{color:#aeb9d8;font-size:10px}
    .cg-player-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}
    #cardgame-invite{position:fixed;left:50%;top:18px;z-index:145;width:min(390px,calc(100vw - 28px));
      transform:translateX(-50%);padding:14px;border:2px solid #8e7dff;border-radius:15px;color:#fff;
      background:#171d38f5;box-shadow:0 20px 60px #000b;font-family:Inter,system-ui,sans-serif}
    #cardgame-invite strong{display:block;margin-bottom:3px;font-size:14px}#cardgame-invite p{margin:0 0 11px;color:#b9c3df;font-size:11px}
    .cg-invite-actions{display:flex;justify-content:flex-end;gap:7px}
    .cg-overlay{position:fixed;inset:0;z-index:140;display:flex;align-items:center;justify-content:center;padding:12px;
      background:#080b17dc;backdrop-filter:blur(7px);font-family:Inter,system-ui,sans-serif}
    .cg-window{position:relative;width:min(1180px,100%);height:min(800px,calc(100dvh - 24px));overflow:hidden;
      border:2px solid #ffffff24;border-radius:20px;color:var(--cg-ink);
      background:linear-gradient(145deg,#20294d,#11162b 65%);box-shadow:0 28px 100px #000d}
    .cg-hub{display:grid;grid-template-columns:210px 1fr;height:100%}.cg-hub-side{display:flex;flex-direction:column;
      padding:16px 11px;border-right:1px solid #ffffff17;background:#0b1021cc}.cg-brand{padding:4px 9px 18px}
    .cg-brand strong{display:block;color:#fff;font-size:17px}.cg-brand small{color:#8895bb;font-size:9px;letter-spacing:.11em}
    .cg-nav{display:grid;gap:5px}.cg-nav button{display:flex;align-items:center;gap:10px;border:0;border-radius:10px;
      padding:10px;color:#aeb8d7;background:transparent;cursor:pointer;text-align:left;font:700 11px Inter,sans-serif}
    .cg-nav button:hover,.cg-nav button.on{color:#fff;background:#6c5df033}.cg-nav i{width:20px;color:#b8adff;font-style:normal;font-size:16px}
    .cg-hub-side .cg-close{margin-top:auto}.cg-hub-main{display:flex;min-width:0;flex-direction:column}
    .cg-hub-head{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #ffffff16}
    .cg-hub-head h2{margin:0;font-size:18px}.cg-hub-head p{flex:1;margin:0;color:#9da9ca;font-size:10px}
    .cg-hub-content{min-height:0;flex:1;overflow:auto;padding:17px}.cg-hero{display:grid;grid-template-columns:1.5fr 1fr;
      gap:14px;margin-bottom:15px}.cg-hero-card{min-height:145px;padding:20px;border:1px solid #ffffff18;border-radius:17px;
      background:radial-gradient(circle at 85% 20%,#8c6cff55,transparent 35%),linear-gradient(135deg,#252e59,#171d38)}
    .cg-hero-card h3{margin:0 0 7px;font-size:21px}.cg-hero-card p{max-width:520px;margin:0;color:#aeb8d7;font-size:11px;line-height:1.6}
    .cg-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.cg-stat{padding:14px;border:1px solid #ffffff16;
      border-radius:14px;background:#151c36}.cg-stat b{display:block;color:#fff;font-size:21px}.cg-stat span{color:#8f9cbd;font-size:9px}
    .cg-shortcuts{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}.cg-shortcut{padding:14px;
      border:1px solid #ffffff16;border-radius:13px;color:#fff;background:#171f3b;cursor:pointer;text-align:left}
    .cg-shortcut b{display:block;margin-bottom:4px;font-size:12px}.cg-shortcut small{color:#929fbe;font-size:9px}
    .cg-section-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}.cg-section-head h3{margin:0;font-size:15px}
    .cg-section-head span{color:#98a5c5;font-size:10px}.cg-section-head .spacer{flex:1}
    .cg-filters{display:flex;gap:7px;margin-bottom:10px}.cg-filters input,.cg-filters select{min-width:0;
      border:1px solid #ffffff20;border-radius:8px;padding:8px;color:#fff;background:#11172c}.cg-filters input{flex:1}
    .cg-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(126px,1fr));gap:10px}
    .cg-card{position:relative;display:grid;grid-template-rows:auto 1fr auto;min-width:0;aspect-ratio:3/4;overflow:hidden;
      border:3px solid #536184;border-radius:12px;color:#fff;background:radial-gradient(circle at 50% 38%,#ffffff18,transparent 42%),
      linear-gradient(160deg,#28345d,#12182d);box-shadow:inset 0 0 0 1px #ffffff1c,0 7px 15px #0006;user-select:none}
    button.cg-card{width:100%;padding:0;cursor:pointer;text-align:initial}.cg-card.selected{outline:3px solid #7dffbf;transform:translateY(-2px)}
    .cg-card.disabled{cursor:not-allowed;filter:grayscale(.55) brightness(.68)}.cg-card.locked{filter:grayscale(1) brightness(.3)}
    .cg-card.locked img{opacity:.35}.cg-card.shiny:after{position:absolute;inset:0;content:"";pointer-events:none;
      background:linear-gradient(115deg,transparent 25%,#fff8 43%,transparent 58%);animation:cg-shine 2.4s infinite}
    .cg-card[data-rarity="Uncommon"]{border-color:#57bc83}.cg-card[data-rarity="Rare"]{border-color:#4ca8ed}
    .cg-card[data-rarity="Epic"]{border-color:#b96af1}.cg-card[data-rarity="Legendary"]{border-color:#f4c54f}
    .cg-card[data-rarity="Special"]{border-color:#ff77d7;box-shadow:0 0 18px #ff54c777,inset 0 0 20px #55dfff22}
    .cg-card-head{display:flex;align-items:center;gap:4px;padding:6px 7px 3px}.cg-card-head strong{min-width:0;overflow:hidden;
      flex:1;font-size:9px;text-overflow:ellipsis;white-space:nowrap}.cg-card-head small{color:#c7d0e6;font-size:7px}
    .cg-card-art{position:relative;display:grid;place-items:center;min-height:0;margin:0 8px;border:1px solid #ffffff1b;border-radius:8px;
      background:radial-gradient(circle,#dbeaff22,#0b1022 70%)}.cg-card-art img{width:min(84%,96px);height:min(84%,96px);
      z-index:1;object-fit:contain;image-rendering:pixelated;filter:drop-shadow(0 5px 4px #0008)}
    .cg-extra-spoon{position:absolute;z-index:2;width:4px;height:24px;border:1px solid #344056;border-radius:2px;
      background:linear-gradient(90deg,#778397,#f5fbff 48%,#8793a8);box-shadow:0 0 5px #8be8ff;
      transform:rotate(var(--spoon-angle));transform-origin:50% 75%}.cg-extra-spoon:before{position:absolute;
      left:50%;top:-7px;width:10px;height:12px;border:1px solid #344056;border-radius:50%;content:"";
      background:radial-gradient(ellipse at 42% 35%,#fff,#a8b5c8 58%,#596579);transform:translateX(-50%)}
    .cg-extra-spoon.spoon-1{left:8%;top:23%;--spoon-angle:-38deg}.cg-extra-spoon.spoon-2{right:8%;top:23%;
      --spoon-angle:38deg}.cg-extra-spoon.spoon-3{left:calc(50% - 2px);top:5%;--spoon-angle:0deg}
    .cg-card.locked .cg-extra-spoon{opacity:.35}
    .cg-card-types{display:flex;gap:3px;padding:4px 6px 6px}.cg-type{padding:2px 4px;border-radius:5px;color:#fff;
      background:#5b6688;font-size:6px;text-transform:uppercase}.cg-owned{position:absolute;right:5px;bottom:5px;z-index:3;
      border-radius:7px;padding:3px 5px;background:#080b17dd;font-size:7px}.cg-shiny-label{color:#fff19b}
    .cg-edge{position:absolute;z-index:2;display:grid;place-items:center;width:24px;height:24px;border:2px solid #0a0d18;
      border-radius:8px;color:#fff;background:#2f3a65;box-shadow:inset 0 0 0 1px #ffffff30;font:900 11px monospace}
    .cg-edge.top{left:50%;top:25px;transform:translateX(-50%)}.cg-edge.right{right:3px;top:50%;transform:translateY(-50%)}
    .cg-edge.bottom{left:50%;bottom:20px;transform:translateX(-50%)}.cg-edge.left{left:3px;top:50%;transform:translateY(-50%)}
    .cg-deck-body{display:grid;grid-template-columns:250px 1fr;gap:14px}.cg-deck-slots{padding:12px;border:1px solid #ffffff16;
      border-radius:14px;background:#0c1122aa}.cg-deck-slot{display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:6px;
      border:1px solid #ffffff18;border-radius:9px;background:#202947}.cg-deck-slot img{width:38px;height:38px;image-rendering:pixelated}
    .cg-deck-slot strong{flex:1;font-size:10px}.cg-deck-slot button{border:0;color:#ffb4c7;background:transparent;cursor:pointer}
    .cg-booster-stage{display:grid;place-items:center;min-height:min(500px,calc(100dvh - 200px));text-align:center}.cg-pack{position:relative;width:220px;height:320px;
      border:3px solid #d6b65e;border-radius:18px;color:#fff;background:radial-gradient(circle at 50% 38%,#8a7aff,#372a82 42%,#121735 75%);
      box-shadow:0 24px 70px #000a,inset 0 0 30px #fff2;cursor:pointer;animation:cg-float 2.2s ease-in-out infinite}
    .cg-pack:before,.cg-pack:after{position:absolute;left:10px;right:10px;height:13px;content:"";background:repeating-linear-gradient(90deg,#e5c76b 0 8px,#7458ce 8px 16px)}
    .cg-pack:before{top:9px}.cg-pack:after{bottom:9px}.cg-pack b{display:block;margin-top:115px;font-size:24px}.cg-pack small{font-size:10px}
    .cg-reveal{display:grid;grid-template-columns:repeat(5,minmax(120px,160px));gap:12px;align-items:center}
    .cg-reveal .cg-card{opacity:0;animation:cg-reveal .55s forwards}.cg-reveal .cg-card:nth-child(2){animation-delay:.18s}
    .cg-reveal .cg-card:nth-child(3){animation-delay:.36s}.cg-reveal .cg-card:nth-child(4){animation-delay:.54s}
    .cg-reveal .cg-card:nth-child(5){animation-delay:.72s}@keyframes cg-float{50%{transform:translateY(-9px) rotate(1deg)}}
    @keyframes cg-reveal{from{opacity:0;transform:translateY(80px) rotateY(90deg)}to{opacity:1;transform:none}}
    @keyframes cg-shine{from{transform:translateX(-140%)}to{transform:translateX(140%)}}
    /* min-height relativo: 620px fixo estourava a tela do celular deitado (~390px de altura). */
    .cg-work-host{min-height:min(620px,calc(100dvh - 200px))}
    .cg-match-window{width:min(1180px,100%);height:min(760px,calc(100dvh - 24px));overflow:auto}
    .cg-match{display:grid;grid-template-rows:auto 1fr;height:100%}.cg-match-top{display:flex;align-items:center;gap:10px;padding:10px 15px;
      border-bottom:1px solid #ffffff18}.cg-score{display:flex;gap:7px;font-weight:900}.cg-score b{padding:5px 9px;border-radius:8px;background:#ffffff12}
    .cg-score .p1{color:var(--cg-p1)}.cg-score .p2{color:var(--cg-p2)}.cg-turn{flex:1;text-align:center;color:#f8d977;
      font-size:12px;font-weight:900;text-transform:uppercase}.cg-arena{display:grid;grid-template-columns:minmax(370px,480px) minmax(280px,1fr);
      gap:16px;align-items:center;min-height:0;padding:14px}.cg-board{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;
      width:min(68vh,100%);aspect-ratio:1;margin:auto;padding:9px;border:2px solid #7783ad;border-radius:18px;
      background:linear-gradient(45deg,#ffffff06 25%,transparent 25% 75%,#ffffff06 75%) 0 0/24px 24px,#090e20}
    .cg-cell{position:relative;display:grid;place-items:center;overflow:hidden;border:1px solid #ffffff1b;border-radius:12px;
      background:#20294a;cursor:pointer}.cg-cell .cg-card{width:90%;height:90%;aspect-ratio:auto;animation:cg-reveal .25s}
    .cg-cell.controller-0{box-shadow:inset 0 0 0 3px var(--cg-p1)}.cg-cell.controller-1{box-shadow:inset 0 0 0 3px var(--cg-p2)}
    .cg-hand-zone{min-width:0}.cg-opponent{margin-bottom:18px;padding:10px;border:1px solid #ffffff18;border-radius:12px;background:#10162aaa}
    .cg-opponent small{color:#aeb8d5}.cg-card-backs{display:flex;margin-top:8px}.cg-back{width:34px;height:48px;margin-right:-13px;
      border:2px solid #7567da;border-radius:6px;background:radial-gradient(circle,#8e80ff 0 18%,#262e5d 19% 35%,#11162c 36%)}
    .cg-hand-title{display:flex;justify-content:space-between;margin-bottom:8px;color:#dfe5f6;font-size:11px}
    .cg-hand{display:grid;grid-template-columns:repeat(6,minmax(76px,1fr));gap:7px}.cg-hand .cg-card-types{display:none}
    .cg-hand .cg-edge{width:20px;height:20px;border-radius:6px;font-size:9px}.cg-result{padding:9px;text-align:center;border-radius:10px;background:#ffffff10;font-weight:900}
    @media(max-width:760px){.cg-hub{grid-template-columns:64px 1fr}.cg-brand strong,.cg-brand small,.cg-nav span{display:none}
      .cg-nav button{justify-content:center}.cg-hero{grid-template-columns:1fr}.cg-shortcuts{grid-template-columns:1fr 1fr}
      .cg-stats{grid-template-columns:1fr}.cg-deck-body{grid-template-columns:1fr}.cg-reveal{grid-template-columns:repeat(3,1fr)}
      .cg-arena{grid-template-columns:1fr}.cg-board{width:min(46vh,100%)}.cg-hand{grid-template-columns:repeat(3,1fr)}
      .cg-card-grid{grid-template-columns:repeat(3,minmax(92px,1fr))}}

    /* ---------------------------------------------------------------- celular
       O jogo abre por link, e link se abre no telefone. Regra do projeto: painel
       vira FOLHA DE TELA CHEIA em tela pequena, não caixa centralizada. */
    @media(max-width:760px){
      /* Sem moldura nem respiro: em 390px de largura, 12px de padding + 20px de
         borda arredondada comem a área útil do álbum. */
      .cg-overlay{padding:0}
      .cg-window,.cg-match-window{width:100%;height:100dvh;max-height:100dvh;border:0;border-radius:0}
      /* Notch e barra de gestos do iPhone. */
      .cg-hub-head{padding-top:calc(16px + env(safe-area-inset-top))}
      .cg-hub-content{padding-bottom:calc(17px + env(safe-area-inset-bottom));-webkit-overflow-scrolling:touch}
      .cg-hub-side{padding-top:calc(16px + env(safe-area-inset-top));padding-bottom:calc(16px + env(safe-area-inset-bottom))}
      #cardgame-invite{top:calc(12px + env(safe-area-inset-top))}
      /* O menu do jogador nasce na posição do toque e vazava pela borda. */
      #cardgame-player-menu{left:50%!important;right:auto;transform:translateX(-50%);
        width:min(320px,calc(100vw - 24px));bottom:calc(16px + env(safe-area-inset-bottom));top:auto!important}
      .cg-hub-head h2{font-size:15px}.cg-hub-head p{display:none}
      .cg-hero-card{min-height:0;padding:15px}.cg-hero-card h3{font-size:17px}
    }

    /* Celular em pé, tela estreita: o que ainda estourava em 360-390px. */
    @media(max-width:480px){
      .cg-shortcuts{grid-template-columns:1fr}
      .cg-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      .cg-reveal{grid-template-columns:repeat(2,minmax(0,1fr))}
      .cg-hand{grid-template-columns:repeat(3,minmax(0,1fr))}
      .cg-filters{flex-wrap:wrap}.cg-filters input{flex:1 0 100%}
      .cg-player-actions{grid-template-columns:1fr}
      .cg-pack{width:min(190px,64vw);height:min(276px,46dvh)}.cg-pack b{margin-top:22%}
      .cg-section-head{flex-wrap:wrap}
    }

    /* Celular deitado: sobra ~390px de ALTURA. O tabuleiro manda no espaço. */
    @media(max-height:520px) and (orientation:landscape){
      /* Deitado o notch fica na LATERAL: a folha precisa respeitar left/right. */
      .cg-overlay{padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right))
        max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left))}
      .cg-hub-head{padding:9px 14px}.cg-hub-content{padding:11px}
      .cg-booster-stage,.cg-work-host{min-height:0}
      .cg-arena{grid-template-columns:minmax(0,1fr) minmax(0,1fr);padding:8px}
      .cg-board{width:min(72dvh,100%)}
      .cg-opponent{margin-bottom:9px}
    }

    /* Afordância de toque — por TIPO DE PONTEIRO, não por largura: notebook com
       janela estreita continua com botão de mouse. */
    /* Gatilho duplo: (pointer:coarse) para o aparelho real, [data-touch="on"]
       para o override ?touch=1 -- sem ele nao da para testar isto no desktop. */
    @media(pointer:coarse){
      .cg-btn{min-height:44px;padding:10px 16px}
      .cg-nav button{min-height:44px}
      .cg-shortcut,.cg-stat{min-height:44px}
      .cg-deck-slot button{min-width:44px;min-height:44px}
      .cg-cell{min-height:44px}
    }
    html[data-touch="on"] .cg-btn{min-height:44px;padding:10px 16px}
    html[data-touch="on"] .cg-nav button,
    html[data-touch="on"] .cg-shortcut,
    html[data-touch="on"] .cg-stat,
    html[data-touch="on"] .cg-cell{min-height:44px}
    html[data-touch="on"] .cg-deck-slot button{min-width:44px;min-height:44px}
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
  const { button = false, selected = false, disabled = false, locked = false, shiny = false, quantity = 0 } = options;
  const tag = button ? 'button type="button"' : 'div';
  const close = button ? 'button' : 'div';
  return `<${tag} class="cg-card${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}${locked ? ' locked' : ''}${shiny ? ' shiny' : ''}"
    data-card-id="${card.id}" data-rarity="${card.rarity}">
    <div class="cg-card-head"><strong>${escapeHtml(card.name)}</strong><small>#${String(card.dex).padStart(3, '0')}</small></div>
    <span class="cg-edge top">${card.edges.top}</span><span class="cg-edge right">${card.edges.right}</span>
    <span class="cg-edge bottom">${card.edges.bottom}</span><span class="cg-edge left">${card.edges.left}</span>
    <div class="cg-card-art" data-spoons="${card.spoonCount || 0}"><img src="${card.art}" alt="${escapeHtml(card.name)}"
      draggable="false">${extraSpoonsMarkup(card)}</div>
    <div class="cg-card-types">${card.types.map((type) => `<span class="cg-type">${TYPES[type] || type}</span>`).join('')}</div>
    ${quantity ? `<span class="cg-owned">${shiny ? '<b class="cg-shiny-label">✦ SHINY</b> · ' : ''}×${quantity}</span>` : ''}
  </${close}>`;
}

export function createCardGamePanel({ presence, catalog, gameItems, onToast = () => {} }) {
  createRoots();
  const cards = catalog.cards || [];
  const byId = new Map(cards.map((card) => [card.id, card]));
  const menu = document.getElementById('cardgame-player-menu');
  const invite = document.getElementById('cardgame-invite');
  const hubOverlay = document.getElementById('player-hub-overlay');
  const matchOverlay = document.getElementById('cardgame-match-overlay');
  let profile = { boosters: 0, deck: [], collection: [], uniqueCards: 0, shinyCards: 0, baseTotal: 151 };
  let deck = [];
  let deckDraft = [];
  let activeTab = 'home';
  let matchState = null;
  let selectedCardId = null;
  let pendingMove = false;
  let opening = false;
  let activeTaskId = null;

  const workPanel = createWorkPanel({
    apiBase: gameItems.apiBase,
    token: () => auth.token(),
    userId: gameItems.userId,
    activeTaskId: () => activeTaskId,
    onActiveTaskChange: (item) => { activeTaskId = item?.id ?? null; },
    onTimerChange: () => {},
    onReward: (reward) => {
      if (reward?.xp || reward?.gold) onToast(`+${reward.xp ?? 0} XP · +${reward.gold ?? 0} 🪙`);
    },
  });
  gameItems.activeTaskId().then((id) => { activeTaskId = id; }).catch(() => {});

  const collectionMap = () => {
    const result = new Map();
    for (const item of profile.collection || []) {
      const current = result.get(item.cardId) || { normal: 0, shiny: 0 };
      current[item.isShiny ? 'shiny' : 'normal'] += item.quantity;
      result.set(item.cardId, current);
    }
    return result;
  };
  const ownedIds = () => new Set((profile.collection || []).map((item) => item.cardId));
  const validDeck = (candidate) => Array.isArray(candidate) && candidate.length === 9
    && new Set(candidate).size === 9 && candidate.every((id) => ownedIds().has(id));

  async function refreshProfile() {
    profile = await gameItems.cardGameProfile();
    deck = validDeck(profile.deck) ? [...profile.deck] : [];
    deckDraft = [...deck];
    return profile;
  }

  function shell(title, subtitle, body) {
    hubOverlay.innerHTML = `<section class="cg-window"><div class="cg-hub">
      <aside class="cg-hub-side"><div class="cg-brand"><strong>Office Quest</strong><small>PLAYER CENTER</small></div>
        <nav class="cg-nav">${MENU_ITEMS.map(([id, icon, label]) => `<button data-tab="${id}" class="${activeTab === id ? 'on' : ''}">
          <i>${icon}</i><span>${label}</span></button>`).join('')}</nav>
        <button class="cg-btn cg-close" data-action="close">Fechar menu</button>
      </aside><main class="cg-hub-main"><header class="cg-hub-head"><h2>${title}</h2><p>${subtitle}</p>
        <button class="cg-btn" data-action="close">×</button></header><div class="cg-hub-content">${body}</div></main>
    </div></section>`;
    hubOverlay.querySelectorAll('[data-action="close"]').forEach((button) => { button.onclick = closeHub; });
    hubOverlay.querySelectorAll('[data-tab]').forEach((button) => { button.onclick = () => openHub(button.dataset.tab); });
  }

  function renderHome() {
    const progress = collectionProgress(cards, profile.collection);
    const specialCopy = progress.specialOwned ? ` · ${progress.specialOwned} especiais` : '';
    shell('Central do jogador', 'Seu progresso, trabalho e coleção em um só lugar', `
      <div class="cg-hero"><section class="cg-hero-card"><h3>Bem-vindo ao seu espaço</h3>
        <p>Abra seus primeiros boosters, complete o álbum e monte um baralho de 9 cartas antes de desafiar alguém no escritório.</p>
        <button class="cg-btn primary" data-go="boosters" style="margin-top:15px">Abrir boosters (${profile.boosters})</button></section>
        <div class="cg-stats"><div class="cg-stat"><b>${profile.uniqueCards}</b><span>cartas únicas</span></div>
          <div class="cg-stat"><b>${profile.shinyCards}</b><span>shiny</span></div><div class="cg-stat"><b>${deck.length}/9</b><span>baralho</span></div></div></div>
      <div class="cg-shortcuts">${[
        ['album', 'Álbum Pokémon', `${progress.baseOwned}/151 descobertos${specialCopy}`],
        ['deck', 'Montar baralho', deck.length === 9 ? 'Pronto para jogar' : 'Escolha 9 cartas'],
        ['hours', 'Relatório de horas', 'Veja e lance sua jornada'],
        ['goals', 'Objetivos', 'Metas diárias e semanais'],
      ].map(([id, label, sub]) => `<button class="cg-shortcut" data-go="${id}"><b>${label}</b><small>${sub}</small></button>`).join('')}</div>`);
    hubOverlay.querySelectorAll('[data-go]').forEach((button) => { button.onclick = () => openHub(button.dataset.go); });
  }

  function renderAlbum(filter = '', type = '') {
    const owned = collectionMap();
    const progress = collectionProgress(cards, profile.collection);
    const normalized = filter.trim().toLowerCase();
    const visible = albumCatalog(cards, profile.collection).filter((card) => (!normalized
      || card.name.toLowerCase().includes(normalized)
      || String(card.dex).includes(normalized)) && (!type || card.types.includes(type)));
    const specialCopy = progress.specialOwned ? ` · ${progress.specialOwned} especiais` : '';
    shell('Álbum Pokémon', `${progress.baseOwned} de 151 descobertos${specialCopy} · ${profile.shinyCards} shiny`, `
      <div class="cg-filters"><input id="cg-search" placeholder="Buscar nome ou número" value="${escapeHtml(filter)}">
        <select id="cg-type"><option value="">Todos os tipos</option>${Object.entries(TYPES).map(([key, label]) =>
          `<option value="${key}"${key === type ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
      <div class="cg-card-grid">${visible.map((card) => {
        const count = owned.get(card.id);
        return cardMarkup(card, { locked: !count, shiny: Boolean(count?.shiny), quantity: (count?.normal || 0) + (count?.shiny || 0) });
      }).join('')}</div>`);
    const search = hubOverlay.querySelector('#cg-search');
    const typeSelect = hubOverlay.querySelector('#cg-type');
    search.oninput = () => renderAlbum(search.value, typeSelect.value);
    typeSelect.onchange = () => renderAlbum(search.value, typeSelect.value);
  }

  function renderDeck(filter = '') {
    const owned = collectionMap();
    const normalized = filter.trim().toLowerCase();
    const visible = cards.filter((card) => owned.has(card.id)
      && (!normalized || card.name.toLowerCase().includes(normalized) || String(card.dex).includes(normalized)));
    shell('Baralho de batalha', 'Escolha 9 cartas únicas do seu álbum', `<div class="cg-deck-body">
      <aside class="cg-deck-slots"><div class="cg-section-head"><h3>Baralho ativo</h3><span>${deckDraft.length}/9</span></div>
        ${deckDraft.length ? deckDraft.map((id, index) => { const card = byId.get(id); return `<div class="cg-deck-slot">
          <img src="${card.art}" alt=""><strong>${index + 1}. ${escapeHtml(card.name)}</strong><button data-remove="${id}">✕</button></div>`; }).join('')
          : '<p style="color:#94a0bf;font-size:11px;line-height:1.6">Seu baralho está vazio. Abra boosters e escolha nove cartas.</p>'}
        <button class="cg-btn primary" data-action="save" ${deckDraft.length === 9 ? '' : 'disabled'} style="width:100%;margin-top:8px">Salvar baralho</button>
      </aside><main><div class="cg-filters"><input id="cg-search" placeholder="Buscar no álbum" value="${escapeHtml(filter)}"></div>
        <div class="cg-card-grid">${visible.map((card) => cardMarkup(card, { button: true, selected: deckDraft.includes(card.id),
          disabled: deckDraft.length >= 9 && !deckDraft.includes(card.id), shiny: Boolean(owned.get(card.id)?.shiny),
          quantity: (owned.get(card.id)?.normal || 0) + (owned.get(card.id)?.shiny || 0) })).join('')}</div></main></div>`);
    hubOverlay.querySelector('[data-action="save"]').onclick = async () => {
      try {
        profile = await gameItems.saveCardGameDeck(deckDraft);
        deck = [...deckDraft];
        onToast('Baralho de 9 cartas salvo');
        renderDeck(filter);
      } catch (error) { onToast(error.message); }
    };
    hubOverlay.querySelectorAll('[data-remove]').forEach((button) => {
      button.onclick = () => { deckDraft = deckDraft.filter((id) => id !== button.dataset.remove); renderDeck(filter); };
    });
    hubOverlay.querySelectorAll('.cg-card[data-card-id]').forEach((button) => {
      button.onclick = () => {
        const id = button.dataset.cardId;
        if (deckDraft.includes(id)) deckDraft = deckDraft.filter((entry) => entry !== id);
        else if (deckDraft.length < 9) deckDraft.push(id);
        renderDeck(filter);
      };
    });
    hubOverlay.querySelector('#cg-search').oninput = (event) => renderDeck(event.target.value);
  }

  function renderBoosters(revealed = null) {
    shell('Abrir boosters', `${profile.boosters} pacote${profile.boosters === 1 ? '' : 's'} disponível${profile.boosters === 1 ? '' : 'is'}`, `
      <div class="cg-booster-stage">${revealed ? `<div><div class="cg-reveal">${revealed.map((item) =>
        cardMarkup(byId.get(item.cardId), { shiny: item.isShiny, quantity: 1 })).join('')}</div>
        <button class="cg-btn primary" data-action="continue" style="margin-top:24px">${profile.boosters ? 'Abrir próximo' : 'Ver álbum'}</button></div>`
      : profile.boosters ? `<div><button class="cg-pack" data-action="open"><b>TOOQ TRIAD</b><small>5 CARTAS</small></button>
        <p style="color:#9ca8c7;font-size:10px">Clique no pacote para rasgar e revelar</p></div>`
      : `<div><div style="font-size:60px">◇</div><h3>Todos os boosters foram abertos</h3>
        <p style="color:#9ca8c7;font-size:11px">Suas cartas já estão guardadas no álbum.</p>
        <button class="cg-btn primary" data-go="album">Ir para o álbum</button></div>`}</div>`);
    hubOverlay.querySelector('[data-action="open"]')?.addEventListener('click', async (event) => {
      if (opening) return;
      opening = true;
      event.currentTarget.style.animation = 'none';
      event.currentTarget.style.transform = 'scale(1.12) rotate(4deg)';
      try {
        const result = await gameItems.openCardGameBooster();
        profile = result.profile;
        setTimeout(() => { opening = false; renderBoosters(result.cards); }, 420);
      } catch (error) { opening = false; onToast(error.message); }
    });
    hubOverlay.querySelector('[data-action="continue"]')?.addEventListener('click', () => (
      profile.boosters ? renderBoosters() : openHub('album')
    ));
    hubOverlay.querySelector('[data-go="album"]')?.addEventListener('click', () => openHub('album'));
  }

  async function renderWork(tab) {
    const labels = { hours: ['Controle de horas', 'Relatório semanal e lançamento de jornada'],
      goals: ['Objetivos', 'Metas do dia e da semana'], board: ['Quadro', 'Atividades e planejamento'], backlog: ['Backlog', 'Todas as atividades'] };
    shell(labels[tab][0], labels[tab][1], '<div class="cg-work-host"></div>');
    const host = hubOverlay.querySelector('.cg-work-host');
    try { await workPanel.open(host, null, tab); }
    catch (error) { host.innerHTML = `<p>Não foi possível carregar: ${escapeHtml(error.message)}</p>`; }
  }

  async function openHub(tab = 'home') {
    closePlayerMenu();
    workPanel.close();
    activeTab = tab;
    hubOverlay.classList.remove('cg-hidden');
    if (['home', 'album', 'deck', 'boosters'].includes(tab)) {
      try { await refreshProfile(); }
      catch (error) { onToast(`Não foi possível atualizar a coleção: ${error.message}`); }
    }
    if (tab === 'home') renderHome();
    else if (tab === 'album') renderAlbum();
    else if (tab === 'deck') { deckDraft = [...deck]; renderDeck(); }
    else if (tab === 'boosters') renderBoosters();
    else await renderWork(tab);
  }
  function closeHub() { workPanel.close(); hubOverlay.classList.add('cg-hidden'); }

  function openPlayerMenu(peer, pointer) {
    menu.innerHTML = `<div class="cg-player-head"><span class="cg-player-avatar">${escapeHtml(peer.name.slice(0, 1).toUpperCase())}</span>
      <div><strong>${escapeHtml(peer.name)}</strong><small>Jogador próximo</small></div></div>
      <div class="cg-player-actions"><button class="cg-btn primary" data-action="challenge">⚔ Desafiar</button>
      <button class="cg-btn" data-action="menu">▦ Meu menu</button></div>`;
    menu.style.left = `${Math.min(pointer.x + 12, innerWidth - 230)}px`;
    menu.style.top = `${Math.min(pointer.y + 12, innerHeight - 120)}px`;
    menu.classList.remove('cg-hidden');
    menu.querySelector('[data-action="challenge"]').onclick = () => {
      if (!validDeck(deck)) { onToast('Abra boosters e monte um baralho de 9 cartas primeiro'); openHub('deck'); return; }
      presence.cardGameChallenge(peer.key, deck);
      onToast(`Desafio enviado para ${peer.name}`);
      closePlayerMenu();
    };
    menu.querySelector('[data-action="menu"]').onclick = () => openHub('home');
  }
  function closePlayerMenu() { menu.classList.add('cg-hidden'); }

  function showInvite(data) {
    invite.innerHTML = `<strong>⚔ ${escapeHtml(data.fromName)} desafiou você!</strong>
      <p>Cardgame 3×3 · baralho de 9 · mão de 6</p><div class="cg-invite-actions">
      <button class="cg-btn" data-action="decline">Agora não</button><button class="cg-btn primary" data-action="accept">Aceitar duelo</button></div>`;
    invite.classList.remove('cg-hidden');
    invite.querySelector('[data-action="decline"]').onclick = () => { presence.cardGameDecline(data.challengeId); invite.classList.add('cg-hidden'); };
    invite.querySelector('[data-action="accept"]').onclick = () => {
      if (!validDeck(deck)) { invite.classList.add('cg-hidden'); onToast('Monte um baralho de 9 cartas primeiro'); openHub('deck'); return; }
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
          ${cell || !myTurn || !selectedCardId || pendingMove ? 'disabled' : ''}>${cell ? cardMarkup(byId.get(cell.cardId)) : ''}</button>`).join('')}</div>
        <aside class="cg-hand-zone"><div class="cg-opponent"><strong>${escapeHtml(matchState.players[opponent].name)}</strong>
          <small> · ${matchState.players[opponent].handCount} na mão · ${matchState.players[opponent].drawPileCount} no monte</small>
          <div class="cg-card-backs">${Array.from({ length: matchState.players[opponent].handCount }, () => '<i class="cg-back"></i>').join('')}</div></div>
          <div class="cg-hand-title"><strong>Sua mão</strong><span>${matchState.players[mine].drawPileCount} no monte</span></div>
          <div class="cg-hand">${matchState.hand.map((id) => cardMarkup(byId.get(id), { button: true,
            selected: selectedCardId === id, disabled: !myTurn || pendingMove })).join('')}</div>
          ${result ? `<div class="cg-result">${result} · ${matchState.score[mine]} a ${matchState.score[opponent]}</div>` : ''}</aside>
      </div></div></section>`;
    matchOverlay.classList.remove('cg-hidden');
    matchOverlay.querySelector('[data-action="exit"]').onclick = () => {
      if (matchState.status === 'ongoing') presence.cardGameResign(matchState.matchId);
      else closeMatch();
    };
    matchOverlay.querySelectorAll('.cg-hand .cg-card').forEach((button) => {
      button.onclick = () => { if (myTurn && !pendingMove) { selectedCardId = button.dataset.cardId; renderMatch(); } };
    });
    matchOverlay.querySelectorAll('[data-cell]').forEach((cell) => {
      cell.onclick = () => {
        if (!selectedCardId || !myTurn || pendingMove) return;
        pendingMove = true;
        presence.cardGameMove(matchState.matchId, selectedCardId, Number(cell.dataset.cell), matchState.version);
        renderMatch();
      };
    });
  }
  function closeMatch() { matchState = null; selectedCardId = null; pendingMove = false; matchOverlay.classList.add('cg-hidden'); }

  presence.events.addEventListener('CardChallengeReceived', (event) => showInvite(event.detail));
  presence.events.addEventListener('CardChallengeDeclined', (event) => onToast(`${event.detail.targetName} recusou o desafio`));
  presence.events.addEventListener('CardChallengeCancelled', () => invite.classList.add('cg-hidden'));
  presence.events.addEventListener('CardGameError', (event) => {
    pendingMove = false; onToast(event.detail.message || 'Não foi possível concluir a ação'); if (matchState) renderMatch();
  });
  presence.events.addEventListener('CardMatchStarted', () => { invite.classList.add('cg-hidden'); closePlayerMenu(); closeHub(); });
  presence.events.addEventListener('CardMatchState', (event) => {
    matchState = event.detail; selectedCardId = null; pendingMove = false; renderMatch();
  });
  refreshProfile().catch((error) => onToast(`Álbum indisponível: ${error.message}`));

  return {
    handleWorldTap(pointer) {
      if (!matchOverlay.classList.contains('cg-hidden') || !hubOverlay.classList.contains('cg-hidden')) return true;
      const peer = presence.remoteAt(pointer.worldX, pointer.worldY, 22);
      if (!peer) { closePlayerMenu(); return false; }
      openPlayerMenu(peer, pointer);
      return true;
    },
    isBlocking: () => !hubOverlay.classList.contains('cg-hidden') || !matchOverlay.classList.contains('cg-hidden'),
    openDeck: () => openHub('deck'),
    openMenu: () => openHub('home'),
    /** `home | album | boosters | deck | hours | goals | board | backlog` */
    open: (tab) => openHub(tab),
    getDeck: () => [...deck],
    closePlayerMenu,
  };
}
