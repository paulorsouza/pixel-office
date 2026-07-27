// Página do backlog: casca fina em volta da UI compartilhada de `shared/backlog.js`.
import { App } from "./main.js";
import { workClient, workSurface } from "./work-bridge.js";
import { mountBacklog } from "../shared/backlog.js";

let instance = null;

export async function renderBacklog(view, { actions }) {
  instance?.destroy();
  const { host, feedback } = workSurface(view);
  actions.replaceChildren();

  instance = mountBacklog(host, {
    client: workClient(),
    feedback,
    onActiveTaskChange: () => App.refreshMe(),
    onTimerChange: () => App.refreshMe(),
  });
  App.onBoardChanged = () => instance?.refresh();
}
