// Quadro, backlog, horas e objetivos como seções do menu.
//
// Continua valendo a regra do projeto: essa UI existe UMA VEZ, em
// `backend/.../wwwroot/shared`, e o jogo só a hospeda. O que muda é que agora
// existe UMA instância do painel — antes o cardgame tinha a dele e o painel de
// móvel tinha outro, cada um com seus timers e listeners.

import { createWorkPanel } from '../WorkPanel.js';
import { auth } from '../auth.js';

const SECTIONS = [
  { id: 'board', icon: '▤', label: 'Quadro', title: 'Quadro', subtitle: 'Atividades e planejamento' },
  { id: 'backlog', icon: '≡', label: 'Backlog', title: 'Backlog', subtitle: 'Todas as atividades' },
  { id: 'hours', icon: '◷', label: 'Horas', title: 'Controle de horas', subtitle: 'Relatório semanal e lançamento de jornada' },
  { id: 'goals', icon: '◎', label: 'Objetivos', title: 'Objetivos', subtitle: 'Metas do dia e da semana' },
];

export function createWorkSections({ menu, gameItems, onToast = () => {} }) {
  let activeTaskId = null;

  const panel = createWorkPanel({
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

  for (const section of SECTIONS) {
    menu.register({
      ...section,
      group: 'work',
      async render(host) {
        // A UI compartilhada mede a própria altura: precisa de um hospedeiro
        // que ocupe a área de conteúdo inteira, senão o quadro nasce achatado.
        const área = document.createElement('div');
        área.className = 'cg-work-host';
        host.replaceChildren(área);
        try {
          await panel.open(área, null, section.id);
        } catch (error) {
          área.textContent = `Não foi possível carregar: ${error.message}`;
        }
      },
      // Fechar precisa desmontar: o contador ao vivo tem `setInterval` próprio.
      onClose: () => panel.close(),
    });
  }

  return {
    /** Objetivo concluído chegou pelo hub e o menu pode estar aberto. */
    celebrate: (completions) => panel.celebrate(completions),
    setActiveTask(id) { activeTaskId = id ?? null; panel.refresh(); },
    close: () => panel.close(),
  };
}
