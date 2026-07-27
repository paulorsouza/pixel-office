// Página de horas: casca fina em volta da UI compartilhada de `shared/timesheet.js`.
import { App } from "./main.js";
import { workClient, workSurface } from "./work-bridge.js";
import { mountTimesheet } from "../shared/timesheet.js";

let instance = null;

export async function renderHours(view, { actions }) {
  instance?.destroy();
  const { host, feedback } = workSurface(view);
  actions.replaceChildren();

  instance = mountTimesheet(host, {
    client: workClient(),
    feedback,
    onReward: () => App.refreshMe(),
  });
  App.onTimeChanged = () => instance?.refresh();
}
