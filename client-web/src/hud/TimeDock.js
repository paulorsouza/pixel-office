// Card fixo de horas, no canto superior esquerdo.
//
// O problema que ele resolve: até aqui, só dava para saber se havia contador
// rodando abrindo o menu → Horas. A estação de trabalho começava a contar e o
// único aviso era um toast que passava. O card fica SEMPRE visível e responde a:
//   - tem contador rodando? qual atividade, e há quanto tempo (relógio ao vivo);
//   - quanto de trabalho já foi lançado hoje contra a meta;
//   - qual missão está mais perto de fechar.
//
// Fonte de verdade é o servidor (as MESMAS rotas do painel de Horas). Sem
// polling: recarrega por evento do hub. O relógio é só formatação local a partir
// do `startUtc` — não conta nada por conta própria.

// O card fala com as MESMAS rotas do painel de Horas, mas não pode importar o
// módulo compartilhado: ele é servido pelo backend (outra origem em dev) e um
// `import` estático cross-origin não resolve. `hm` é formatação trivial e
// estável; um cliente fetch de 3 linhas idem. Isso não reimplementa a UI de
// horas — essa continua sendo a compartilhada, aberta pela seção Horas.
const hm = (minutes) => {
  const total = Math.round(minutes || 0);
  const abs = Math.abs(total);
  const hrs = Math.floor(abs / 60);
  const min = abs % 60;
  return hrs > 0 ? `${hrs}h${String(min).padStart(2, '0')}` : `${min}min`;
};

function createWorkClient({ base = '', token = null, userId = null }) {
  const root = String(base || '').replace(/\/$/, '');
  const resolveToken = typeof token === 'function' ? token : () => token;
  const req = async (method, path, body) => {
    const bearer = (await resolveToken()) || null;
    const res = await fetch(`${root}${path}`, {
      method,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : { 'X-User-Id': String(userId ?? '') }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let message = `Erro ${res.status}`;
      try { message = (await res.json())?.error ?? message; } catch { /* sem corpo */ }
      throw new Error(message);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
  return { get: (p) => req('GET', p), post: (p, b) => req('POST', p, b ?? {}) };
}

/** Segunda-feira (local) da semana atual, em ISO — a semana que o timesheet usa. */
function weekBounds() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return { from: from.toISOString(), to: to.toISOString() };
}

const dayKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const pad = (n) => String(n).padStart(2, '0');

/**
 * @param options.apiBase   origem do backend
 * @param options.token     função que devolve o JWT (ou null em dev)
 * @param options.userId    identidade de fallback (dev)
 * @param options.events    EventTarget do hub (gameItems.events)
 * @param options.onOpenHours    abrir a seção Horas do menu
 * @param options.onOpenGoals    abrir a seção Objetivos do menu
 * @param options.onToast        toast da HUD
 */
export function createTimeDock(options) {
  const client = createWorkClient({
    base: options.apiBase, token: options.token, userId: options.userId,
  });

  const root = document.createElement('div');
  root.id = 'time-dock';
  root.className = 'hud interactive';
  root.hidden = true;
  root.innerHTML = `
    <button class="td-main" type="button" aria-label="Abrir controle de horas">
      <div class="td-today">
        <span class="td-today-line"><b class="td-today-val">—</b><small class="td-goal"></small></span>
        <span class="td-bar"><i></i></span>
      </div>
      <div class="td-run">
        <span class="td-run-dot"></span>
        <span class="td-run-label">Carregando…</span>
        <span class="td-clock"></span>
      </div>
    </button>
    <div class="td-actions">
      <button class="td-start" type="button" hidden>▶ Focar</button>
      <button class="td-stop" type="button" hidden>■ Parar</button>
    </div>
    <button class="td-mission" type="button" hidden>
      <span class="td-mission-ico"></span>
      <span class="td-mission-body">
        <b class="td-mission-name"></b>
        <span class="td-mission-bar"><i></i></span>
      </span>
    </button>`;
  document.body.append(root);

  const els = {
    todayVal: root.querySelector('.td-today-val'),
    goal: root.querySelector('.td-goal'),
    bar: root.querySelector('.td-bar > i'),
    runDot: root.querySelector('.td-run-dot'),
    runLabel: root.querySelector('.td-run-label'),
    clock: root.querySelector('.td-clock'),
    start: root.querySelector('.td-start'),
    stop: root.querySelector('.td-stop'),
    mission: root.querySelector('.td-mission'),
    missionIco: root.querySelector('.td-mission-ico'),
    missionName: root.querySelector('.td-mission-name'),
    missionBar: root.querySelector('.td-mission-bar > i'),
  };

  let running = null;      // { startUtc, label } ou null
  let ticker = 0;
  let busy = false;        // trava os botões durante start/stop

  // Cliques nos botões não podem "vazar" para o td-main (que abre o painel).
  const stop = (event) => event.stopPropagation();
  for (const b of [els.start, els.stop]) b.addEventListener('pointerdown', stop);

  els.start.onclick = async (event) => {
    event.stopPropagation();
    if (busy) return;
    busy = true;
    try {
      // Sem categoria: o backend conta como foco e vincula a atividade ativa se
      // houver. É o "começar a focar agora" — bater o ponto sem abrir menu.
      await client.post('/api/timer/start', {});
      await refresh();
    } catch (error) {
      options.onToast?.(error.message);
    } finally { busy = false; }
  };

  els.stop.onclick = async (event) => {
    event.stopPropagation();
    if (busy) return;
    busy = true;
    try {
      const result = await client.post('/api/timer/stop');
      if (result?.minutes) {
        options.onToast?.(`${hm(result.minutes)} registrados · +${result.xp ?? 0} XP · +${result.gold ?? 0} 🪙`);
      }
      await refresh();
    } catch (error) {
      options.onToast?.(error.message);
    } finally { busy = false; }
  };

  els.mission.onclick = () => options.onOpenGoals?.();
  root.querySelector('.td-main').onclick = () => options.onOpenHours?.();

  function drawClock() {
    if (!running) return;
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(running.startUtc)) / 1000));
    els.clock.textContent = `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
  }

  function drawTimer(sheet) {
    running = sheet?.running
      ? {
        startUtc: sheet.running.startUtc,
        label: sheet.running.workItem
          ? `${sheet.running.workItem.code} · ${sheet.running.workItem.title}`
          : (sheet.running.note || 'Contando tempo'),
      }
      : null;
    root.dataset.running = running ? '1' : '';
    els.runDot.dataset.on = running ? '1' : '';
    els.start.hidden = Boolean(running);
    els.stop.hidden = !running;
    clearInterval(ticker);
    if (running) {
      els.runLabel.textContent = running.label;
      drawClock();
      ticker = setInterval(drawClock, 1000);
    } else {
      els.runLabel.textContent = 'Sem contador';
      els.clock.textContent = '';
    }
  }

  function drawToday(sheet, goalMinutes) {
    const today = sheet?.dayTotals?.[dayKey(new Date())] ?? 0;
    const target = goalMinutes || 360;
    els.todayVal.textContent = hm(today);
    els.goal.textContent = `/ ${hm(target)}`;
    els.bar.style.width = `${Math.min(100, Math.round((today / target) * 100))}%`;
    els.bar.dataset.full = today >= target ? '1' : '';
  }

  function drawMission(objectives) {
    const list = objectives?.objectives ?? [];
    // A mais perto de fechar entre as não concluídas; diária ganha da semanal.
    const candidates = list
      .filter((o) => !o.done && o.target > 0)
      .map((o) => ({ o, ratio: Math.min(1, o.value / o.target), daily: o.scope === 'Daily' }))
      .sort((a, b) => (b.daily - a.daily) || (b.ratio - a.ratio));
    const pick = candidates[0]?.o;
    els.mission.hidden = !pick;
    if (!pick) return;
    els.missionIco.textContent = pick.icon;
    els.missionName.textContent = pick.name;
    els.missionBar.style.width = `${Math.round((candidates[0].ratio) * 100)}%`;
    const goalTarget = objectives.objectives.find((o) => o.key === 'daily-journey')?.target;
    return goalTarget;
  }

  async function refresh() {
    try {
      const bounds = weekBounds();
      const [sheet, objectives] = await Promise.all([
        client.get(`/api/timesheet?from=${bounds.from}&to=${bounds.to}`),
        client.get('/api/objectives').catch(() => null),
      ]);
      const goalMinutes = objectives
        ? objectives.objectives.find((o) => o.key === 'daily-journey')?.target
        : 360;
      drawTimer(sheet);
      drawToday(sheet, goalMinutes);
      if (objectives) drawMission(objectives);
      root.hidden = false;
    } catch {
      // Offline (dev sem backend): o card some em vez de mostrar erro cru.
      root.hidden = true;
    }
  }

  // Recarrega quando o backend avisa que algo mudou — nunca por polling.
  const onChange = () => refresh();
  for (const name of ['TimeChanged', 'WorkSessionChanged', 'RewardGranted', 'ObjectiveCompleted']) {
    options.events?.addEventListener(name, onChange);
  }

  refresh();

  return {
    refresh,
    destroy() {
      clearInterval(ticker);
      for (const name of ['TimeChanged', 'WorkSessionChanged', 'RewardGranted', 'ObjectiveCompleted']) {
        options.events?.removeEventListener(name, onChange);
      }
      root.remove();
    },
  };
}
