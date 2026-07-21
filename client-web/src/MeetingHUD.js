// HUD profissional da reunião por proximidade (estilo Google Meet).
// UI pura: barra de controles, grade de participantes, palco de apresentação,
// modos de layout (jogo | dividido | foco), fullscreen, painel de pessoas,
// menu de dispositivos e toasts. A lógica LiveKit vive em ProximityVoice.js,
// que alimenta este módulo por chamadas explícitas (roster, tracks, volumes).

const MODES = ['game', 'split', 'focus'];

const SVG = (path, extra = '') =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">${path}${extra}</svg>`;

const ICONS = {
  mic: SVG('<path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/>'),
  micOff: SVG('<path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3 3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.42-2.31.42-2.83 0-5.5-2.17-5.5-5H4.1c0 3.22 2.45 5.86 5.6 6.32V21h2.6v-3.68c.87-.13 1.7-.44 2.44-.87L19.73 21 21 19.73 4.27 3z"/>'),
  cam: SVG('<path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>'),
  camOff: SVG('<path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2 2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.55-.18L19.73 21 21 19.73 3.27 2z"/>'),
  screen: SVG('<path d="M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H4V5h16v14zM12 8l-4 4h3v4h2v-4h3l-4-4z"/>'),
  leave: SVG('<path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.29-.71.29s-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7s.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71s-.11.53-.29.7l-2.48 2.49c-.18.18-.43.29-.71.29s-.53-.11-.71-.29c-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>'),
  fullscreen: SVG('<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>'),
  fullscreenExit: SVG('<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>'),
  people: SVG('<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>'),
  headset: SVG('<path d="M12 1a9 9 0 0 0-9 9v7a3 3 0 0 0 3 3h1a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1H5v-2a7 7 0 0 1 14 0v2h-2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1a3 3 0 0 0 3-3v-7a9 9 0 0 0-9-9z"/>'),
  lock: SVG('<path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM9 6a3 3 0 0 1 6 0v2H9V6zm3 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>'),
  unlock: SVG('<path d="M18 8h-1V6a5 5 0 0 0-9.9-1h2.06A3 3 0 0 1 15 6v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-6 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>'),
  reserve: SVG('<path d="M17 3h-1V1h-2v2H10V1H8v2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 18H7V9h10v12zM9 11h6v2H9v-2zm0 4h6v2H9v-2z"/>'),
  chevron: SVG('<path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/>'),
  close: SVG('<path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>'),
  modeGame: SVG('<path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v10h14V7H5z"/><circle cx="9.5" cy="12" r="2.2"/>'),
  modeSplit: SVG('<rect x="3" y="5" width="11" height="14" rx="1"/><rect x="16" y="5" width="5" height="14" rx="1"/>'),
  modeFocus: SVG('<path fill-rule="evenodd" d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9.5 8.5H19V17h-5.5v-3.5z"/>'),
};

const AVATAR_HUES = [258, 210, 160, 20, 330, 45, 190, 285];

function hueFor(identity) {
  let h = 0;
  for (const c of String(identity)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function fmtElapsed(startedAt) {
  const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

export function createMeetingHUD(callbacks = {}) {
  const cb = callbacks;
  let root = null;
  let els = {};
  let mode = 'game';
  let session = { status: 'off', micOn: false, camOn: false, screenOn: false, startedAt: 0 };
  let sceneName = '';
  let channel = { kind: 'open', name: 'Área aberta', pinned: false };
  const tiles = new Map();      // identity -> { el, media, name, isLocal, micOn, volume }
  const stageTracks = [];       // [{ identity, el }] — o último é o exibido
  let roster = [];
  let bystanders = [];
  let peopleOpen = false;
  let timerId = 0;
  let idleTimer = 0;
  let barSignature = '';

  // ---------- bootstrap ----------

  function ensure() {
    if (root) return;
    injectStyles();
    document.documentElement.dataset.mh = '1';
    root = document.createElement('div');
    root.id = 'mh-root';
    root.dataset.mode = mode;
    root.innerHTML = `
      <section id="mh-panel" aria-label="Reunião por proximidade">
        <header id="mh-head">
          <div id="mh-head-left">
            <strong>Reunião por proximidade</strong>
            <span id="mh-scene" class="mh-chip"></span>
            <span id="mh-channel" class="mh-chip"></span>
            <span id="mh-timer" class="mh-chip mh-chip-dim"></span>
            <span id="mh-count" class="mh-chip mh-chip-dim"></span>
          </div>
          <button id="mh-panel-close" class="mh-icon-btn" type="button" title="Voltar ao jogo">${ICONS.close}</button>
        </header>
        <div id="mh-body">
          <div id="mh-stage" hidden>
            <div id="mh-stage-media"></div>
            <span id="mh-stage-label" class="mh-chip"></span>
          </div>
          <div id="mh-grid"></div>
          <div id="mh-empty" hidden>
            <div class="mh-empty-art">🛋️</div>
            <strong>Ninguém por perto ainda</strong>
            <span>Aproxime seu avatar de alguém para conversar — o volume acompanha a distância.</span>
          </div>
        </div>
      </section>
      <button id="mh-pipcover" type="button" title="Voltar ao jogo"><span>Voltar ao jogo</span></button>
      <aside id="mh-people" aria-label="Pessoas" hidden>
        <header><strong>Pessoas</strong><span id="mh-people-count" class="mh-chip mh-chip-dim"></span>
          <button id="mh-people-close" class="mh-icon-btn" type="button" title="Fechar">${ICONS.close}</button>
        </header>
        <div id="mh-people-list"></div>
      </aside>
      <nav id="mh-bar" aria-label="Controles da reunião">
        <div id="mh-bar-left"><span id="mh-status-dot"></span><span id="mh-bar-clock"></span><span id="mh-bar-scene"></span></div>
        <div id="mh-bar-center"></div>
        <div id="mh-bar-right"></div>
      </nav>
      <div id="mh-menu" hidden></div>
      <div id="mh-toasts"></div>`;
    document.body.append(root);

    els = {
      panel: root.querySelector('#mh-panel'),
      scene: root.querySelector('#mh-scene'),
      channel: root.querySelector('#mh-channel'),
      timer: root.querySelector('#mh-timer'),
      count: root.querySelector('#mh-count'),
      stage: root.querySelector('#mh-stage'),
      stageMedia: root.querySelector('#mh-stage-media'),
      stageLabel: root.querySelector('#mh-stage-label'),
      grid: root.querySelector('#mh-grid'),
      empty: root.querySelector('#mh-empty'),
      people: root.querySelector('#mh-people'),
      peopleCount: root.querySelector('#mh-people-count'),
      peopleList: root.querySelector('#mh-people-list'),
      bar: root.querySelector('#mh-bar'),
      barLeft: root.querySelector('#mh-bar-left'),
      barCenter: root.querySelector('#mh-bar-center'),
      barRight: root.querySelector('#mh-bar-right'),
      statusDot: root.querySelector('#mh-status-dot'),
      clock: root.querySelector('#mh-bar-clock'),
      barScene: root.querySelector('#mh-bar-scene'),
      menu: root.querySelector('#mh-menu'),
      toasts: root.querySelector('#mh-toasts'),
    };

    root.querySelector('#mh-panel-close').onclick = () => setMode('game');
    root.querySelector('#mh-pipcover').onclick = () => setMode('game');
    root.querySelector('#mh-people-close').onclick = () => togglePeople(false);

    document.addEventListener('fullscreenchange', renderBar);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onGlobalPointerDown, true);
    root.addEventListener('pointermove', pokeIdle);
    document.addEventListener('pointermove', pokeIdle);

    timerId = setInterval(() => {
      const on = session.status === 'connected' && session.startedAt;
      const text = on ? fmtElapsed(session.startedAt) : '';
      els.timer.textContent = text;
      els.timer.hidden = !on;
      els.clock.textContent = on ? text : new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }, 1000);
    renderBar();
  }

  // ---------- modos de layout ----------

  function setMode(next) {
    if (!MODES.includes(next) || next === mode) return;
    if (next !== 'game' && session.status !== 'connected' && session.status !== 'connecting') return;
    mode = next;
    root.dataset.mode = mode;
    document.documentElement.dataset.mhMode = mode === 'game' ? '' : mode;
    if (mode === 'game') delete document.documentElement.dataset.mhMode;
    closeMenu();
    pokeIdle();
    renderBar();
    // O Phaser (Scale.RESIZE) mede o parent no resize da janela; o contêiner
    // muda por CSS com transição, então re-medimos algumas vezes.
    for (const t of [0, 150, 320]) setTimeout(() => window.dispatchEvent(new Event('resize')), t);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => toast('O navegador bloqueou o fullscreen'));
  }

  function pokeIdle() {
    if (!root) return;
    delete root.dataset.idle;
    clearTimeout(idleTimer);
    if (mode === 'focus') idleTimer = setTimeout(() => { root.dataset.idle = '1'; }, 3500);
  }

  // ---------- barra de controles ----------

  function barButton({ icon, label, on, danger, accent, onClick, id }) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mh-btn' + (danger ? ' danger' : '') + (accent ? ' accent' : '') + (on ? ' on' : '');
    b.title = label;
    b.setAttribute('aria-label', label);
    if (id) b.id = id;
    b.innerHTML = icon;
    b.onclick = onClick;
    return b;
  }

  function renderBar() {
    if (!root) return;
    const { status } = session;
    // assinatura evita reconstruir o DOM da barra sem necessidade (fecha menus etc.)
    const sig = [status, session.micOn, session.camOn, session.screenOn, mode,
      Boolean(document.fullscreenElement), peopleOpen, roster.length,
      channel.kind, channel.pinned, channel.name,
      channel.locked?.key || '', channel.reserved?.key || ''].join('|');
    if (sig === barSignature) return;
    barSignature = sig;

    els.statusDot.dataset.tone = status;
    els.statusDot.title = {
      connected: 'Voz conectada', connecting: 'Conectando…',
      failed: 'Voz indisponível', off: 'Voz desligada',
    }[status] || '';
    els.barScene.textContent = sceneName;

    const center = els.barCenter;
    const right = els.barRight;
    center.innerHTML = '';
    right.innerHTML = '';

    if (status === 'connected') {
      // mic + seletor de dispositivos
      center.append(splitButton({
        icon: session.micOn ? ICONS.mic : ICONS.micOff,
        label: session.micOn ? 'Desativar microfone (Ctrl+D)' : 'Ativar microfone (Ctrl+D)',
        off: !session.micOn,
        onClick: () => cb.onToggleMic?.(),
        onMenu: (anchor) => openDeviceMenu(anchor, [
          { kind: 'audioinput', title: 'Microfone' },
          { kind: 'audiooutput', title: 'Saída de som' },
        ]),
      }));
      center.append(splitButton({
        icon: session.camOn ? ICONS.cam : ICONS.camOff,
        label: session.camOn ? 'Desativar câmera (Ctrl+E)' : 'Ativar câmera (Ctrl+E)',
        off: !session.camOn,
        onClick: () => cb.onToggleCamera?.(),
        onMenu: (anchor) => openDeviceMenu(anchor, [{ kind: 'videoinput', title: 'Câmera' }]),
      }));
      center.append(barButton({
        icon: ICONS.screen,
        label: session.screenOn ? 'Parar de apresentar' : 'Apresentar a tela',
        accent: session.screenOn,
        onClick: () => cb.onToggleScreen?.(),
      }));
      center.append(divider());
    }

    if (status === 'connected' || status === 'connecting') {
      const seg = document.createElement('div');
      seg.className = 'mh-seg';
      seg.setAttribute('role', 'tablist');
      seg.setAttribute('aria-label', 'Layout');
      for (const [m, icon, label] of [
        ['game', ICONS.modeGame, 'Só o jogo (Alt+1)'],
        ['split', ICONS.modeSplit, 'Reunião + jogo (Alt+2)'],
        ['focus', ICONS.modeFocus, 'Foco na reunião (Alt+3)'],
      ]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mh-seg-btn' + (mode === m ? ' active' : '');
        b.title = label;
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(mode === m));
        b.innerHTML = icon;
        b.onclick = () => setMode(m);
        seg.append(b);
      }
      center.append(seg);
    }

    center.append(barButton({
      icon: document.fullscreenElement ? ICONS.fullscreenExit : ICONS.fullscreen,
      label: document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia',
      onClick: toggleFullscreen,
    }));

    if (status === 'connected') {
      const ppl = barButton({
        icon: ICONS.people, label: 'Pessoas', on: peopleOpen, onClick: () => togglePeople(),
      });
      if (roster.length > 1) {
        const badge = document.createElement('span');
        badge.className = 'mh-badge';
        badge.textContent = roster.length;
        ppl.append(badge);
      }
      center.append(ppl);
      // controles da sala em que o avatar está: trancar a porta e reservar
      if (channel.kind === 'room') {
        const locked = channel.locked || null;
        const reserved = channel.reserved || null;
        center.append(divider());
        center.append(barButton({
          icon: locked ? ICONS.lock : ICONS.unlock,
          label: locked
            ? (locked.mine ? 'Destrancar a porta' : `Trancada por ${locked.name}`)
            : 'Trancar a porta da sala',
          accent: Boolean(locked),
          onClick: () => {
            if (locked && !locked.mine) return toast(`A porta foi trancada por ${locked.name}`);
            cb.onToggleLock?.();
          },
        }));
        center.append(barButton({
          icon: ICONS.reserve,
          label: reserved
            ? (reserved.mine ? 'Liberar a sala' : `Reservada por ${reserved.name}`)
            : 'Reservar a sala',
          accent: Boolean(reserved),
          onClick: () => {
            if (reserved && !reserved.mine) return toast(`A sala está reservada por ${reserved.name}`);
            cb.onToggleReserve?.();
          },
        }));
      }
      // fone da reunião: enquanto está "vestido", o call é fixo naquela sala
      if (channel.pinned) {
        const pin = document.createElement('button');
        pin.type = 'button';
        pin.className = 'mh-pill mh-pill-headset';
        pin.innerHTML = `${ICONS.headset}<span>Soltar o fone</span>`;
        pin.title = `Você está preso na reunião "${channel.name}" pelo fone — clique para soltar`;
        pin.onclick = () => cb.onReleaseHeadset?.();
        right.append(pin);
      }
      right.append(barButton({
        icon: ICONS.leave, label: 'Sair da voz', danger: true, onClick: () => cb.onLeave?.(),
      }));
    } else if (status === 'connecting') {
      const pill = document.createElement('span');
      pill.className = 'mh-pill mh-pill-wait';
      pill.innerHTML = '<i class="mh-spin"></i> Conectando…';
      right.append(pill);
    } else if (status === 'failed') {
      const info = document.createElement('span');
      info.className = 'mh-pill mh-pill-warn';
      info.textContent = 'Voz indisponível';
      info.title = 'O LiveKit não está acessível deste endereço (ex.: via túnel https). Abrindo local em http://localhost:8080 funciona.';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'mh-pill mh-pill-join';
      retry.textContent = 'Tentar de novo';
      retry.onclick = () => cb.onJoin?.();
      right.append(info, retry);
    } else {
      const join = document.createElement('button');
      join.type = 'button';
      join.className = 'mh-pill mh-pill-join';
      join.innerHTML = `${ICONS.mic} Entrar na voz`;
      join.onclick = () => cb.onJoin?.();
      right.append(join);
    }
  }

  function splitButton({ icon, label, off, onClick, onMenu }) {
    const wrap = document.createElement('div');
    wrap.className = 'mh-split' + (off ? ' off' : '');
    const main = barButton({ icon, label, danger: off, onClick });
    const chev = document.createElement('button');
    chev.type = 'button';
    chev.className = 'mh-chev';
    chev.title = 'Escolher dispositivo';
    chev.setAttribute('aria-label', 'Escolher dispositivo');
    chev.innerHTML = ICONS.chevron;
    chev.onclick = (e) => { e.stopPropagation(); onMenu(wrap); };
    wrap.append(main, chev);
    return wrap;
  }

  function divider() {
    const d = document.createElement('i');
    d.className = 'mh-divider';
    return d;
  }

  // ---------- menu de dispositivos ----------

  async function openDeviceMenu(anchor, sections) {
    const menu = els.menu;
    if (!menu.hidden) { closeMenu(); return; }
    menu.innerHTML = '<div class="mh-menu-loading"><i class="mh-spin"></i> Procurando dispositivos…</div>';
    menu.hidden = false;
    positionMenu(anchor);
    const parts = [];
    for (const { kind, title } of sections) {
      let devices = [];
      try { devices = (await cb.listDevices?.(kind)) || []; } catch { devices = []; }
      const active = cb.activeDevice?.(kind) || '';
      parts.push({ kind, title, devices, active });
    }
    if (menu.hidden) return; // fechado enquanto carregava
    menu.innerHTML = '';
    for (const { kind, title, devices, active } of parts) {
      const h = document.createElement('header');
      h.textContent = title;
      menu.append(h);
      if (!devices.length) {
        const none = document.createElement('span');
        none.className = 'mh-menu-none';
        none.textContent = 'Nenhum dispositivo encontrado';
        menu.append(none);
        continue;
      }
      devices.forEach((d, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        const isActive = active ? d.deviceId === active : i === 0;
        b.className = 'mh-menu-item' + (isActive ? ' active' : '');
        b.textContent = d.label || `${title} ${i + 1}`;
        b.onclick = async () => { closeMenu(); await cb.switchDevice?.(kind, d.deviceId); };
        menu.append(b);
      });
    }
    positionMenu(anchor);
  }

  function positionMenu(anchor) {
    const menu = els.menu;
    const r = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(12, Math.min(window.innerWidth - menu.offsetWidth - 12, r.left + r.width / 2 - menu.offsetWidth / 2))}px`;
    menu.style.bottom = `${window.innerHeight - r.top + 10}px`;
  }

  function closeMenu() {
    if (els.menu && !els.menu.hidden) { els.menu.hidden = true; els.menu.innerHTML = ''; }
  }

  function onGlobalPointerDown(e) {
    if (!els.menu || els.menu.hidden) return;
    if (!els.menu.contains(e.target) && !e.target.closest?.('.mh-chev')) closeMenu();
  }

  // ---------- atalhos ----------

  function onKeyDown(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.code === 'KeyD') { e.preventDefault(); cb.onToggleMic?.(); return; }
    if (mod && e.code === 'KeyE') { e.preventDefault(); cb.onToggleCamera?.(); return; }
    if (e.altKey && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
      e.preventDefault();
      setMode(MODES[Number(e.code.slice(-1)) - 1]);
      return;
    }
    if (e.code === 'Escape') {
      if (!els.menu.hidden) { closeMenu(); return; }
      if (peopleOpen) togglePeople(false);
    }
  }

  // ---------- participantes ----------

  function makeTile(identity) {
    const el = document.createElement('div');
    el.className = 'mh-tile';
    el.dataset.id = identity;
    el.style.setProperty('--tile-hue', hueFor(identity));
    el.innerHTML = `
      <div class="mh-tile-media"></div>
      <div class="mh-tile-avatar"><span></span></div>
      <div class="mh-tile-foot">
        <span class="mh-tile-speaking" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="mh-tile-mute">${ICONS.micOff}</span>
        <span class="mh-tile-name"></span>
        <span class="mh-tile-prox" title=""><i></i><i></i><i></i></span>
      </div>`;
    el.onclick = () => { if (mode === 'game') setMode('split'); };
    const rec = {
      el,
      media: el.querySelector('.mh-tile-media'),
      avatar: el.querySelector('.mh-tile-avatar span'),
      nameEl: el.querySelector('.mh-tile-name'),
      prox: el.querySelector('.mh-tile-prox'),
      name: '', isLocal: false, micOn: false, volume: 1, proxBucket: -1,
    };
    tiles.set(identity, rec);
    return rec;
  }

  function syncParticipants(list, others = []) {
    ensure();
    roster = list;
    bystanders = others;
    const seen = new Set(list.map((p) => p.identity));
    for (const [identity, rec] of tiles) {
      if (!seen.has(identity)) { rec.el.remove(); tiles.delete(identity); }
    }
    const ordered = [...list].sort((a, b) => (b.isLocal ? 1 : 0) - (a.isLocal ? 1 : 0) || a.name.localeCompare(b.name));
    for (const p of ordered) {
      const rec = tiles.get(p.identity) || makeTile(p.identity);
      rec.name = p.name;
      rec.isLocal = p.isLocal;
      rec.micOn = p.micOn;
      rec.nameEl.textContent = p.isLocal ? `${p.name} (você)` : p.name;
      rec.avatar.textContent = initialsOf(p.name);
      rec.el.dataset.local = p.isLocal ? '1' : '';
      rec.el.dataset.muted = p.micOn ? '' : '1';
      els.grid.append(rec.el); // append reordena sem recriar (preserva <video>)
    }
    els.count.textContent = list.length ? `${list.length} na voz` : '';
    els.count.hidden = !list.length;
    updateEmpty();
    renderBar();
    if (peopleOpen) renderPeople();
  }

  function updateEmpty() {
    const alone = session.status === 'connected' && roster.length <= 1 && !stageTracks.length;
    els.empty.hidden = !alone;
    els.grid.dataset.solo = roster.length === 1 ? '1' : '';
  }

  function setSpeaking(identities) {
    for (const [identity, rec] of tiles) {
      rec.el.dataset.speaking = identities.has(identity) ? '1' : '';
    }
  }

  function setProximity(identity, volume) {
    const rec = tiles.get(identity);
    if (!rec) return;
    rec.volume = volume;
    const bucket = volume <= 0.02 ? 0 : volume < 0.45 ? 1 : volume < 0.85 ? 2 : 3;
    if (bucket === rec.proxBucket) return;
    rec.proxBucket = bucket;
    rec.prox.dataset.level = bucket;
    rec.prox.title = bucket === 0 ? 'Longe demais para ouvir'
      : `Volume pela distância: ${Math.round(volume * 100)}%`;
  }

  // ---------- tracks de vídeo ----------

  function addTrack(identity, source, el) {
    ensure();
    if (source === 'screen') {
      el.className = 'mh-stage-video';
      stageTracks.push({ identity, el });
      showStage();
      return;
    }
    const rec = tiles.get(identity) || makeTile(identity);
    el.className = 'mh-tile-video' + (rec.isLocal ? ' mh-mirror' : '');
    rec.media.append(el);
    rec.el.dataset.hasVideo = '1';
  }

  function removeTrack(identity, source, el) {
    if (source === 'screen') {
      const i = stageTracks.findIndex((s) => s.el === el || (identity && s.identity === identity && !el));
      if (i >= 0) stageTracks.splice(i, 1);
      el?.remove();
      showStage();
      return;
    }
    const rec = tiles.get(identity);
    el?.remove();
    if (rec && !rec.media.childElementCount) delete rec.el.dataset.hasVideo;
  }

  function showStage() {
    const top = stageTracks[stageTracks.length - 1];
    els.stageMedia.innerHTML = '';
    if (top) {
      els.stageMedia.append(top.el);
      const who = tiles.get(top.identity);
      els.stageLabel.textContent = `Apresentação de ${who?.isLocal ? 'você' : who?.name || 'colega'}`;
    }
    els.stage.hidden = !top;
    els.panel.dataset.stage = top ? 'on' : '';
    updateEmpty();
  }

  function clearMedia() {
    stageTracks.length = 0;
    showStage();
    for (const rec of tiles.values()) { rec.media.innerHTML = ''; delete rec.el.dataset.hasVideo; }
  }

  // ---------- painel de pessoas ----------

  function togglePeople(force) {
    peopleOpen = force ?? !peopleOpen;
    els.people.hidden = !peopleOpen;
    if (peopleOpen) renderPeople();
    renderBar();
  }

  function renderPeople() {
    const listEl = els.peopleList;
    listEl.innerHTML = '';
    const total = roster.length + bystanders.length;
    els.peopleCount.textContent = String(total || '');
    const row = (name, sub, { hue = 258, micOn = null, dim = false } = {}) => {
      const r = document.createElement('div');
      r.className = 'mh-person' + (dim ? ' dim' : '');
      r.innerHTML = `
        <span class="mh-person-avatar" style="--tile-hue:${hue}">${initialsOf(name)}</span>
        <span class="mh-person-copy"><strong></strong><small></small></span>
        <span class="mh-person-mic"></span>`;
      r.querySelector('strong').textContent = name;
      r.querySelector('small').textContent = sub;
      if (micOn !== null) {
        r.querySelector('.mh-person-mic').innerHTML = micOn ? ICONS.mic : ICONS.micOff;
        r.querySelector('.mh-person-mic').dataset.on = micOn ? '1' : '';
      }
      listEl.append(r);
    };
    for (const p of roster) {
      const rec = tiles.get(p.identity);
      const vol = p.isLocal ? null : rec?.volume;
      const sub = p.isLocal ? 'Você'
        : vol == null ? 'Na voz'
        : vol <= 0.02 ? 'Na voz · longe' : `Na voz · volume ${Math.round(vol * 100)}%`;
      row(p.name, sub, { hue: hueFor(p.identity), micOn: p.micOn });
    }
    for (const b of bystanders) {
      row(b.name || `Colega ${b.userId}`, 'No escritório, fora da voz', { hue: hueFor(String(b.userId)), dim: true });
    }
    if (!total) {
      const none = document.createElement('span');
      none.className = 'mh-menu-none';
      none.textContent = 'Ninguém por aqui ainda';
      listEl.append(none);
    }
  }

  // ---------- estado da sessão ----------

  function setSession(next) {
    ensure();
    const wasStatus = session.status;
    session = { ...session, ...next };
    if (typeof next.sceneName === 'string') {
      sceneName = next.sceneName;
      els.scene.textContent = sceneName;
      els.scene.hidden = !sceneName;
      els.barScene.textContent = sceneName;
    }
    if (session.status !== 'connected' && session.status !== 'connecting' && mode !== 'game') setMode('game');
    if (session.status !== wasStatus) barSignature = '';
    updateEmpty();
    renderBar();
  }

  // canal de voz atual: área aberta (proximidade) ou uma sala fechada (call isolado).
  // `pinned` = o jogador está preso nesse call pelo fone da reunião.
  function setChannel(next = {}) {
    ensure();
    channel = { ...channel, ...next };
    root.dataset.channel = channel.kind;
    const marks = `${channel.pinned ? '🎧 ' : ''}${channel.locked ? '🔒 ' : ''}${channel.reserved ? '📌 ' : ''}`;
    els.channel.textContent = channel.kind === 'room'
      ? `${marks}${channel.name}`
      : 'Área aberta · proximidade';
    els.channel.dataset.pinned = channel.pinned ? '1' : '';
    els.channel.title = channel.kind === 'room'
      ? (channel.pinned
        ? 'O fone te mantém nesta reunião mesmo saindo da sala'
        : 'Call isolado desta sala — quem está fora não ouve')
      : 'Voz por proximidade: o volume cai com a distância';
    renderBar();
  }

  // ---------- toasts ----------

  function toast(message, { tone = 'info', actionLabel, onAction, duration = 4500 } = {}) {
    ensure();
    const t = document.createElement('div');
    t.className = `mh-toast mh-toast-${tone}`;
    const span = document.createElement('span');
    span.textContent = message;
    t.append(span);
    if (actionLabel && onAction) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = actionLabel;
      b.onclick = () => { t.remove(); onAction(); };
      t.append(b);
    }
    els.toasts.append(t);
    while (els.toasts.childElementCount > 3) els.toasts.firstElementChild.remove();
    setTimeout(() => { t.classList.add('bye'); setTimeout(() => t.remove(), 250); }, duration);
  }

  // ---------- estilos ----------

  function injectStyles() {
    if (document.getElementById('mh-styles')) return;
    const s = document.createElement('style');
    s.id = 'mh-styles';
    s.textContent = `
:root{--mh-panel:#171822f2;--mh-tile:#232633;--mh-line:#ffffff16;--mh-text:#eceef6;--mh-dim:#9aa0b6;
  --mh-accent:#7c5cff;--mh-danger:#e5484d;--mh-ok:#3dd68c;--mh-warn:#e8a33d;--mh-btn:#2b2e3d;--mh-btn-hover:#383c4f}

/* ---- integração com o HUD do jogo ---- */
html[data-mh] #portal-prompt{bottom:104px}
/* sem transition no #game: o canvas do Phaser esticaria pixelado durante a animação */
html[data-mh-mode] #scene-card,html[data-mh-mode] #controls{display:none}
html[data-mh-mode="focus"] #room-decoration-entry{display:none}
html[data-mh-mode="split"] #game{left:calc(100vw - min(38vw,620px) - 12px);top:12px;
  width:min(38vw,620px);height:calc(100vh - 100px);
  border-radius:16px;overflow:hidden;border:1px solid var(--mh-line);box-shadow:0 18px 50px #0008}
html[data-mh-mode="focus"] #game{left:calc(100vw - 316px);top:calc(100vh - 290px);width:300px;height:190px;
  border-radius:12px;overflow:hidden;border:1px solid var(--mh-line);box-shadow:0 14px 40px #000a;z-index:62}
@media(max-width:760px){
  html[data-mh-mode="split"] #game{left:calc(58vw - 12px);top:calc(100vh - 27vw - 96px);width:42vw;height:27vw;z-index:62}
}

#mh-root{font-family:Inter,system-ui,sans-serif;color:var(--mh-text)}
#mh-root .mh-chip{padding:3px 9px;border-radius:99px;background:#ffffff12;font-size:11px;font-weight:600;white-space:nowrap}
#mh-root .mh-chip-dim{color:var(--mh-dim)}
#mh-root .mh-chip:empty{display:none}

/* ---- painel da reunião ---- */
#mh-panel{position:fixed;z-index:60;display:none;flex-direction:column;overflow:hidden;
  background:var(--mh-panel);border:1px solid var(--mh-line);border-radius:16px;
  box-shadow:0 24px 70px #000a;backdrop-filter:blur(14px)}
#mh-root[data-mode="split"] #mh-panel{display:flex;left:12px;top:12px;bottom:88px;right:calc(min(38vw,620px) + 24px)}
#mh-root[data-mode="focus"] #mh-panel{display:flex;inset:12px 12px 88px 12px}
@media(max-width:760px){#mh-root[data-mode="split"] #mh-panel{right:12px}}
#mh-head{display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:12px 14px;border-bottom:1px solid var(--mh-line)}
#mh-head-left{display:flex;align-items:center;gap:9px;min-width:0;flex-wrap:wrap}
#mh-head-left strong{font-size:14px;letter-spacing:.01em;white-space:nowrap}
#mh-body{position:relative;display:flex;flex-direction:column;flex:1;min-height:0;padding:14px;gap:12px}
#mh-stage{position:relative;flex:1;min-height:0;display:grid;place-items:center;border-radius:12px;
  background:#0d0e14;overflow:hidden}
#mh-stage[hidden]{display:none}
.mh-stage-video{max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain}
#mh-stage-label{position:absolute;left:10px;bottom:10px;background:#000a}
#mh-grid{display:grid;flex:1;min-height:0;gap:12px;align-content:center;justify-content:center;
  grid-template-columns:repeat(auto-fit,minmax(230px,1fr));overflow:auto;scrollbar-width:thin}
#mh-grid[data-solo="1"]{grid-template-columns:minmax(240px,720px)}
#mh-panel[data-stage="on"] #mh-grid{flex:0 0 128px;grid-template-columns:none;grid-auto-flow:column;
  grid-auto-columns:210px;align-content:stretch;justify-content:start;overflow-x:auto;overflow-y:hidden}
#mh-empty{display:grid;place-content:center;justify-items:center;gap:8px;flex:0 0 auto;
  text-align:center;color:var(--mh-dim);padding:6px 20px 16px}
#mh-empty[hidden]{display:none}
#mh-empty .mh-empty-art{font-size:38px}
#mh-empty strong{color:var(--mh-text);font-size:15px}
#mh-empty span{max-width:340px;font-size:12px;line-height:1.5}

/* ---- tiles ---- */
.mh-tile{position:relative;border-radius:12px;overflow:hidden;background:var(--mh-tile);
  aspect-ratio:16/9;min-height:110px;box-shadow:inset 0 0 0 1px var(--mh-line)}
.mh-tile[data-speaking="1"]{box-shadow:inset 0 0 0 2px var(--mh-ok),0 0 0 1px var(--mh-ok)}
.mh-tile-media{position:absolute;inset:0}
.mh-tile-video{width:100%;height:100%;object-fit:cover;display:block}
.mh-mirror{transform:scaleX(-1)}
.mh-tile-avatar{position:absolute;inset:0;display:grid;place-items:center}
.mh-tile[data-has-video="1"] .mh-tile-avatar{display:none}
.mh-tile-avatar span{display:grid;place-items:center;width:64px;height:64px;border-radius:50%;
  font-size:22px;font-weight:700;color:#fff;
  background:linear-gradient(135deg,hsl(var(--tile-hue) 62% 52%),hsl(var(--tile-hue) 55% 38%));
  box-shadow:0 6px 18px #0006}
.mh-tile-foot{position:absolute;left:8px;right:8px;bottom:8px;display:flex;align-items:center;gap:6px}
.mh-tile-name{overflow:hidden;padding:3px 8px;border-radius:8px;background:#000a;color:#fff;
  font-size:11px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
.mh-tile-mute{display:none;place-items:center;width:22px;height:22px;border-radius:7px;
  background:var(--mh-danger);color:#fff}
.mh-tile-mute svg{width:13px;height:13px}
.mh-tile[data-muted="1"] .mh-tile-mute{display:grid}
.mh-tile-speaking{display:none;align-items:flex-end;gap:2px;height:16px;padding:3px 5px;border-radius:7px;background:#000a}
.mh-tile[data-speaking="1"] .mh-tile-speaking{display:flex}
.mh-tile-speaking i{width:3px;background:var(--mh-ok);border-radius:2px;animation:mh-eq .9s ease-in-out infinite}
.mh-tile-speaking i:nth-child(1){height:5px;animation-delay:0s}
.mh-tile-speaking i:nth-child(2){height:9px;animation-delay:.25s}
.mh-tile-speaking i:nth-child(3){height:6px;animation-delay:.5s}
@keyframes mh-eq{0%,100%{transform:scaleY(.5)}50%{transform:scaleY(1.15)}}
.mh-tile-prox{display:flex;align-items:flex-end;gap:2px;height:16px;margin-left:auto;
  padding:3px 5px;border-radius:7px;background:#0009}
.mh-tile[data-local="1"] .mh-tile-prox{display:none}
.mh-tile-prox i{width:3px;border-radius:2px;background:#5a5f75}
.mh-tile-prox i:nth-child(1){height:4px}.mh-tile-prox i:nth-child(2){height:7px}.mh-tile-prox i:nth-child(3){height:10px}
.mh-tile-prox[data-level="1"] i:nth-child(1){background:var(--mh-warn)}
.mh-tile-prox[data-level="2"] i:nth-child(-n+2){background:var(--mh-ok)}
.mh-tile-prox[data-level="3"] i{background:var(--mh-ok)}
/* num call de sala todos se ouvem por completo: medidor de distância não se aplica */
#mh-root[data-channel="room"] .mh-tile-prox{display:none}
#mh-channel[data-pinned="1"]{background:color-mix(in srgb,var(--mh-accent) 34%,transparent);color:#fff}

/* ---- modo jogo: strip flutuante ---- */
#mh-root[data-mode="game"] #mh-panel{display:flex;left:auto;top:12px;right:12px;bottom:auto;width:236px;
  background:transparent;border:0;box-shadow:none;backdrop-filter:none;pointer-events:none;overflow:visible}
#mh-root[data-mode="game"] #mh-head,#mh-root[data-mode="game"] #mh-empty{display:none}
#mh-root[data-mode="game"] #mh-body{padding:0;gap:8px}
#mh-root[data-mode="game"] #mh-grid{display:flex;flex-direction:column;gap:8px;align-content:start;overflow:visible}
#mh-root[data-mode="game"] .mh-tile{display:none;pointer-events:auto;cursor:pointer;width:100%;flex:0 0 auto;
  box-shadow:0 10px 30px #0007,inset 0 0 0 1px var(--mh-line)}
#mh-root[data-mode="game"] .mh-tile[data-has-video="1"]{display:block}
#mh-root[data-mode="game"] #mh-stage{position:static;flex:0 0 132px;pointer-events:auto;cursor:pointer;border-radius:12px}
#mh-root[data-mode="game"] #mh-panel[data-stage="on"] #mh-grid{flex-direction:column}

/* ---- PiP do jogo no modo foco ---- */
#mh-pipcover{display:none;position:fixed;right:16px;bottom:100px;width:300px;height:190px;z-index:63;
  border:0;border-radius:12px;background:transparent;cursor:pointer;padding:0}
#mh-root[data-mode="focus"] #mh-pipcover{display:block}
#mh-pipcover span{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);padding:5px 10px;
  border-radius:8px;background:#000c;color:#fff;font:600 11px Inter,system-ui,sans-serif;opacity:0;transition:opacity .15s}
#mh-pipcover:hover span{opacity:1}

/* ---- barra de controles ---- */
#mh-bar{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:64;display:flex;align-items:center;
  gap:14px;max-width:calc(100vw - 24px);padding:9px 14px;border-radius:99px;background:var(--mh-panel);
  border:1px solid var(--mh-line);box-shadow:0 14px 44px #000a;backdrop-filter:blur(14px);
  transition:opacity .25s ease,transform .25s ease}
#mh-root[data-idle="1"] #mh-bar{opacity:0;transform:translate(-50%,10px);pointer-events:none}
#mh-bar-left{display:flex;align-items:center;gap:8px;color:var(--mh-dim);font-size:12px;font-weight:600;white-space:nowrap}
#mh-bar-scene{max-width:150px;overflow:hidden;text-overflow:ellipsis}
#mh-status-dot{width:8px;height:8px;border-radius:50%;background:#5a5f75;flex:0 0 8px}
#mh-status-dot[data-tone="connected"]{background:var(--mh-ok);box-shadow:0 0 8px var(--mh-ok)}
#mh-status-dot[data-tone="connecting"]{background:var(--mh-warn);animation:mh-blink 1s infinite}
#mh-status-dot[data-tone="failed"]{background:var(--mh-danger)}
@keyframes mh-blink{50%{opacity:.35}}
#mh-bar-center,#mh-bar-right{display:flex;align-items:center;gap:8px}
.mh-btn{position:relative;display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:50%;
  background:var(--mh-btn);color:var(--mh-text);cursor:pointer;transition:background .15s,transform .1s}
.mh-btn:hover{background:var(--mh-btn-hover)}
.mh-btn:active{transform:scale(.94)}
.mh-btn.danger{background:var(--mh-danger);color:#fff}
.mh-btn.danger:hover{filter:brightness(1.12)}
.mh-btn.accent{background:var(--mh-accent);color:#fff}
.mh-btn.on{box-shadow:inset 0 0 0 2px var(--mh-accent)}
.mh-badge{position:absolute;right:-2px;top:-2px;display:grid;place-items:center;min-width:18px;height:18px;
  padding:0 4px;border-radius:99px;background:var(--mh-accent);color:#fff;font-size:10px;font-weight:700}
.mh-split{display:flex;align-items:center;border-radius:99px;background:var(--mh-btn)}
.mh-split.off{background:color-mix(in srgb,var(--mh-danger) 28%,var(--mh-btn))}
.mh-split .mh-btn{background:transparent}
.mh-split .mh-btn.danger{background:var(--mh-danger)}
.mh-chev{display:grid;place-items:center;width:24px;height:44px;border:0;border-radius:0 99px 99px 0;
  background:transparent;color:var(--mh-dim);cursor:pointer}
.mh-chev:hover{color:#fff}
.mh-chev svg{width:16px;height:16px}
.mh-divider{width:1px;height:26px;background:var(--mh-line)}
.mh-seg{display:flex;padding:3px;gap:2px;border-radius:99px;background:#00000042}
.mh-seg-btn{display:grid;place-items:center;width:40px;height:36px;border:0;border-radius:99px;
  background:transparent;color:var(--mh-dim);cursor:pointer;transition:background .15s,color .15s}
.mh-seg-btn:hover{color:#fff}
.mh-seg-btn.active{background:var(--mh-accent);color:#fff}
.mh-pill{display:inline-flex;align-items:center;gap:8px;padding:11px 18px;border:0;border-radius:99px;
  font:600 13px Inter,system-ui,sans-serif;white-space:nowrap}
.mh-pill svg{width:16px;height:16px}
.mh-pill-join{background:var(--mh-ok);color:#0b3524;cursor:pointer}
.mh-pill-join:hover{filter:brightness(1.07)}
.mh-pill-wait{background:var(--mh-btn);color:var(--mh-dim)}
.mh-pill-headset{background:color-mix(in srgb,var(--mh-accent) 30%,var(--mh-btn));color:#e7e0ff;cursor:pointer}
.mh-pill-headset:hover{background:color-mix(in srgb,var(--mh-accent) 46%,var(--mh-btn));color:#fff}
@media(max-width:860px){.mh-pill-headset span{display:none}.mh-pill-headset{padding:11px 13px}}
.mh-pill-warn{background:color-mix(in srgb,var(--mh-warn) 22%,var(--mh-btn));color:#f4cf9a}
.mh-spin{width:13px;height:13px;border-radius:50%;border:2px solid #ffffff35;border-top-color:#fff;
  display:inline-block;animation:mh-rot .8s linear infinite}
@keyframes mh-rot{to{transform:rotate(360deg)}}
.mh-icon-btn{display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:9px;
  background:transparent;color:var(--mh-dim);cursor:pointer}
.mh-icon-btn:hover{background:#ffffff14;color:#fff}

/* ---- painel de pessoas ---- */
#mh-people{position:fixed;right:12px;top:12px;bottom:88px;z-index:66;display:flex;flex-direction:column;
  width:min(310px,calc(100vw - 24px));border-radius:16px;background:var(--mh-panel);border:1px solid var(--mh-line);
  box-shadow:0 24px 70px #000a;backdrop-filter:blur(14px)}
#mh-people[hidden]{display:none}
#mh-people header{display:flex;align-items:center;gap:9px;padding:13px 14px;border-bottom:1px solid var(--mh-line)}
#mh-people header strong{font-size:14px}
#mh-people header .mh-icon-btn{margin-left:auto}
#mh-people-list{flex:1;overflow:auto;padding:8px;scrollbar-width:thin}
.mh-person{display:flex;align-items:center;gap:10px;padding:8px 9px;border-radius:10px}
.mh-person:hover{background:#ffffff0a}
.mh-person.dim{opacity:.62}
.mh-person-avatar{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;flex:0 0 36px;
  color:#fff;font-size:13px;font-weight:700;
  background:linear-gradient(135deg,hsl(var(--tile-hue) 62% 52%),hsl(var(--tile-hue) 55% 38%))}
.mh-person-copy{display:flex;flex-direction:column;min-width:0;gap:1px}
.mh-person-copy strong{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mh-person-copy small{color:var(--mh-dim);font-size:11px}
.mh-person-mic{margin-left:auto;color:var(--mh-danger);display:grid;place-items:center}
.mh-person-mic[data-on="1"]{color:var(--mh-ok)}
.mh-person-mic svg{width:16px;height:16px}
.mh-person-mic:empty{display:none}

/* ---- menu de dispositivos ---- */
#mh-menu{position:fixed;z-index:70;display:flex;flex-direction:column;min-width:250px;max-width:330px;
  max-height:50vh;overflow:auto;padding:7px;border-radius:14px;background:#1d1f2bfa;border:1px solid var(--mh-line);
  box-shadow:0 20px 60px #000c;scrollbar-width:thin}
#mh-menu[hidden]{display:none}
#mh-menu header{padding:8px 10px 4px;color:var(--mh-dim);font-size:10px;font-weight:800;
  text-transform:uppercase;letter-spacing:.08em}
.mh-menu-item{padding:9px 11px;border:0;border-radius:9px;background:transparent;color:var(--mh-text);
  cursor:pointer;font:500 12.5px Inter,system-ui,sans-serif;text-align:left;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.mh-menu-item:hover{background:#ffffff10}
.mh-menu-item.active{background:color-mix(in srgb,var(--mh-accent) 26%,transparent);font-weight:700}
.mh-menu-none,.mh-menu-loading{padding:9px 11px;color:var(--mh-dim);font-size:12px}
.mh-menu-loading{display:flex;align-items:center;gap:8px}

/* ---- toasts ---- */
#mh-toasts{position:fixed;left:50%;bottom:86px;transform:translateX(-50%);z-index:72;display:flex;
  flex-direction:column;align-items:center;gap:8px;pointer-events:none}
.mh-toast{display:flex;align-items:center;gap:12px;max-width:min(480px,calc(100vw - 32px));padding:11px 16px;
  border-radius:12px;background:#22242ff5;border:1px solid var(--mh-line);color:var(--mh-text);
  box-shadow:0 14px 40px #000a;font-size:13px;pointer-events:auto;animation:mh-toast-in .22s ease}
.mh-toast.bye{opacity:0;transform:translateY(6px);transition:all .25s}
.mh-toast-error{border-color:color-mix(in srgb,var(--mh-danger) 55%,transparent)}
.mh-toast button{flex:0 0 auto;padding:6px 12px;border:0;border-radius:8px;background:var(--mh-accent);
  color:#fff;cursor:pointer;font:700 12px Inter,system-ui,sans-serif}
@keyframes mh-toast-in{from{opacity:0;transform:translateY(8px)}}

@media(max-width:860px){#mh-bar-left{display:none}}
@media(max-width:560px){
  #mh-bar{gap:8px;padding:7px 10px}
  .mh-btn{width:40px;height:40px}
  .mh-chev{display:none}
  .mh-divider{display:none}
  #mh-root[data-mode="focus"] #mh-pipcover{width:36vw;height:23vw}
  html[data-mh-mode="focus"] #game{left:calc(64vw - 16px);top:calc(100vh - 23vw - 100px);width:36vw;height:23vw}
}`;
    document.head.append(s);
  }

  // ---------- API ----------

  return {
    initialize() { ensure(); },
    setSession,
    setChannel,
    syncParticipants,
    setSpeaking,
    setProximity,
    addTrack,
    removeTrack,
    clearMedia,
    toast,
    setMode,
    getMode: () => mode,
    destroy() {
      clearInterval(timerId);
      clearTimeout(idleTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onGlobalPointerDown, true);
      root?.remove();
      root = null;
    },
  };
}
