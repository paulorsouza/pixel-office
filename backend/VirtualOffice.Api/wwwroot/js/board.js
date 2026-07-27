// Página do kanban: casca fina em volta da UI compartilhada de `shared/board.js`.
// A mesma UI roda dentro do jogo, então a lógica do quadro não mora aqui.
import { App } from "./main.js";
import { workClient, workSurface } from "./work-bridge.js";
import { mountBoard } from "../shared/board.js";

let instance = null;

export async function renderBoard(view, { actions }) {
  instance?.destroy();
  const { host, feedback } = workSurface(view);
  actions.replaceChildren();

  instance = mountBoard(host, {
    client: workClient(),
    feedback,
    currentUserId: App.me?.user?.id,
    activeTaskId: App.me?.activeTask?.id ?? null,
    onActiveTaskChange: () => App.refreshMe(),
    onTimerChange: () => App.refreshMe(),
    onReward: () => App.refreshMe(),
  });
  App.onBoardChanged = () => instance?.refresh();
}
