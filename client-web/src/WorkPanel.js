// Painel de trabalho do jogo: kanban, horas e objetivos.
//
// Nada de UI é reimplementado aqui. Os componentes são carregados do backend
// (`wwwroot/shared/*`), os mesmos que o app web usa — é o que garante que o
// quadro dentro do jogo e o quadro do navegador nunca divirjam. O que este
// módulo faz é: carregar o CSS/JS da origem certa, montar as abas e aplicar o
// tema escuro para a UI casar com a janela pixel do jogo.

let modulesPromise = null;

async function loadModules(apiBase) {
  modulesPromise ??= (async () => {
    const base = String(apiBase || "").replace(/\/$/, "");
    const [core, board, backlog, timesheet, objectives] = await Promise.all([
      import(`${base}/shared/work-core.js`),
      import(`${base}/shared/board.js`),
      import(`${base}/shared/backlog.js`),
      import(`${base}/shared/timesheet.js`),
      import(`${base}/shared/objectives.js`),
    ]);
    core.ensureWorkStyles(base);
    return { core, board, backlog, timesheet, objectives };
  })();
  return modulesPromise;
}

const TABS = [
  { id: "board", label: "Quadro", title: "Quadro de atividades", subtitle: "Arraste os cards; a atividade com ★ é a que a estação conta" },
  { id: "backlog", label: "Backlog", title: "Backlog", subtitle: "Todas as atividades em lista" },
  { id: "hours", label: "Horas", title: "Controle de horas", subtitle: "Lance a jornada e ganhe XP e moedas" },
  { id: "goals", label: "Objetivos", title: "Objetivos", subtitle: "Metas do dia e da semana" },
];

/**
 * @param options.apiBase     origem do backend (o jogo pode estar em outra porta)
 * @param options.token       função que devolve o JWT atual (ou null em dev)
 * @param options.userId      identidade de fallback quando não há token
 */
export function createWorkPanel(options) {
  const { apiBase, token, userId } = options;
  let mounted = null;      // instância do componente da aba atual
  let modules = null;
  let feedback = null;
  let client = null;
  let currentTab = "board";
  let surface = null;

  /** Prepara o container: escopo `.wq` e tema escuro para casar com a janela pixel. */
  function ensureSurface(content) {
    if (surface?.isConnected && surface.parentElement === content) return surface;
    content.replaceChildren();
    surface = document.createElement("div");
    surface.className = "wq";
    surface.dataset.theme = "dark";
    surface.style.display = "flex";
    surface.style.flexDirection = "column";
    surface.style.gap = "12px";
    surface.style.minHeight = "100%";
    content.append(surface);
    return surface;
  }

  /**
   * A camada de toast/modal é presa à viewport, não ao conteúdo: o painel rola, e
   * ancorada no conteúdo a janela de um card abria fora da área visível.
   */
  function resetFeedback() {
    document.querySelectorAll("body > .wq-layer.fixed").forEach((el) => el.remove());
    feedback = modules.core.createFeedback(document.body, { fixed: true, theme: "dark" });
  }

  function tabBar(onSelect) {
    const bar = document.createElement("div");
    bar.className = "wq-seg";
    bar.style.alignSelf = "flex-start";
    for (const tab of TABS) {
      const button = document.createElement("button");
      button.textContent = tab.label;
      button.className = tab.id === currentTab ? "on" : "";
      button.onclick = () => onSelect(tab.id);
      bar.append(button);
    }
    return bar;
  }

  return {
    /**
     * Monta o painel dentro de `content`.
     * @param header  { title, subtitle } — elementos de texto do cabeçalho da janela
     */
    async open(content, header, tab = "board") {
      currentTab = tab;
      modules = await loadModules(apiBase);
      client ??= modules.core.createWorkClient({ base: apiBase, token, userId });

      const root = ensureSurface(content);
      mounted?.destroy?.();
      mounted = null;

      const meta = TABS.find((t) => t.id === currentTab) ?? TABS[0];
      if (header?.title) header.title.textContent = meta.title;
      if (header?.subtitle) header.subtitle.textContent = meta.subtitle;

      const host = document.createElement("div");
      host.style.flex = "1";
      host.style.minHeight = "0";
      root.replaceChildren(tabBar((next) => this.open(content, header, next)), host);
      resetFeedback();

      const ctx = {
        client,
        feedback,
        currentUserId: userId,
        activeTaskId: options.activeTaskId?.() ?? null,
        onActiveTaskChange: (w) => options.onActiveTaskChange?.(w),
        onTimerChange: () => options.onTimerChange?.(),
        onReward: (reward) => options.onReward?.(reward),
      };

      if (currentTab === "board") mounted = modules.board.mountBoard(host, ctx);
      else if (currentTab === "backlog") mounted = modules.backlog.mountBacklog(host, ctx);
      else if (currentTab === "hours") mounted = modules.timesheet.mountTimesheet(host, ctx);
      else mounted = modules.objectives.mountObjectives(host, ctx);
      return mounted;
    },

    /** Repassa objetivos concluídos vindos do SignalR para o toast do painel aberto. */
    celebrate(completions) {
      mounted?.celebrate?.(completions);
      if (!mounted?.celebrate && feedback) {
        for (const c of completions ?? []) {
          feedback.toast(`${c.icon} ${c.name} · +${c.xp} XP · +${c.gold} 🪙`, "ok");
        }
      }
    },

    refresh() { mounted?.refresh?.(); },

    close() {
      mounted?.destroy?.();
      mounted = null;
      surface = null;
      feedback = null;
      document.querySelectorAll("body > .wq-layer.fixed").forEach((el) => el.remove());
    },
  };
}
