// Cola entre o app web e a UI compartilhada de `wwwroot/shared`.
// O app já resolveu autenticação em `api.js`; aqui só traduzimos isso para o
// contrato que os componentes compartilhados esperam.
import { API } from "./api.js";
import { createWorkClient, createFeedback } from "../shared/work-core.js";

export function workClient() {
  return createWorkClient({
    base: "",                       // mesma origem: o app web é servido pelo backend
    token: () => API.token,
    userId: API.uid ? Number(API.uid) : null,
  });
}

/**
 * Prepara o container da página: aplica o escopo `.wq` (sem ele nenhuma regra da
 * UI compartilhada pega) e cria a camada de toast/modal dentro dele.
 */
export function workSurface(view) {
  // Trocar de página descarta a camada anterior; sem isso elas se empilham no body.
  document.querySelectorAll("body > .wq-layer.fixed").forEach((el) => el.remove());
  view.classList.add("wq");
  view.replaceChildren();
  const host = document.createElement("div");
  host.style.display = "contents";
  view.append(host);
  // A área de conteúdo do app rola; a camada precisa ser presa à viewport, senão
  // o modal aparece ancorado no topo do scroll em vez de no meio da tela.
  return { host, feedback: createFeedback(view, { fixed: true }) };
}
