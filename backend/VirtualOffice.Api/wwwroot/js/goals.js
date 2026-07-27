// Página de objetivos: mesma UI que o jogo mostra no quadro de planejamento.
import { App } from "./main.js";
import { workClient, workSurface } from "./work-bridge.js";
import { mountObjectives } from "../shared/objectives.js";

let instance = null;

export async function renderGoals(view, { actions }) {
  instance?.destroy();
  const { host, feedback } = workSurface(view);
  actions.replaceChildren();

  instance = mountObjectives(host, { client: workClient(), feedback });
  App.onObjectiveCompleted = (completions) => instance?.celebrate(completions);
  App.onTimeChanged = () => instance?.refresh();
}
