// Página de chat do app web.
//
// Nada de UI mora aqui: a tela é a de `shared/chat-*`, a MESMA que o jogo abre
// na folha do HUD. O que este arquivo faz é ligar as pontas do app web — a
// conexão do hub, o token e a origem — e escolher onde a pessoa fala quando ela
// não está com o avatar no mundo.

import { API, h } from "./api.js";
import { App } from "./main.js";
import { createWorkClient } from "../shared/work-core.js";
import { createChatStore, ensureChatStyles } from "../shared/chat-core.js";
import { mountChat } from "../shared/chat-ui.js";

let mounted = null;

export async function renderChat(view) {
  ensureChatStyles("");
  mounted?.destroy();
  mounted = null;

  if (!App.hub) {
    view.append(h("div", { class: "panel panel-pad" },
      h("div", { class: "faint" }, "Sem conexão com o servidor — recarregue a página.")));
    return;
  }

  const client = createWorkClient({
    base: "",
    token: () => API.token,
    userId: API.uid,
  });
  const currentUserId = App.me?.user?.id ?? (Number(API.uid) || 0);

  // A conexão do app web é única e as páginas vão e voltam. Cada handler é
  // desligado PELA REFERÊNCIA ao sair: um `off("ChatMessage")` seco derrubaria
  // junto o aviso global de PM, que vive em `main.js` e não é desta página.
  const bound = [];
  const transport = {
    on: (event, handler) => { bound.push([event, handler]); App.hub.on(event, handler); },
    invoke: (method, ...args) => App.hub.invoke(method, ...args),
  };

  const store = createChatStore({ client, transport, currentUserId });

  // Altura medida, não calculada com números mágicos: a barra de navegação vira
  // fileira no topo do celular e qualquer `calc(100vh - N)` erraria em um dos
  // dois layouts. Aqui o painel simplesmente vai até o fim da janela.
  const host = h("div", { style: { minHeight: "260px" } });
  const fit = () => {
    host.style.height = `${Math.max(260, window.innerHeight - host.getBoundingClientRect().top - 16)}px`;
  };
  view.replaceChildren(host);
  fit();
  window.addEventListener("resize", fit);

  const ui = mountChat(host, {
    store,
    client,
    currentUserId,
    // Sem avatar não há "onde eu estou": aqui o prédio e a sala se escolhem.
    canPickPlace: true,
  });

  // Onde começar: se o avatar desta conta está no mundo, o painel abre no mesmo
  // prédio/sala — é a mesma pessoa nas duas janelas, e ter de reescolher o
  // próprio lugar seria só burocracia.
  try {
    const directory = await store.directory();
    if (directory?.you?.building) {
      await store.setLocation({
        buildingId: directory.you.building.replace(/^building:/, ""),
        buildingName: directory.you.buildingName,
        sceneId: directory.you.room ? directory.you.room.slice(5).split("|")[0] : null,
        roomId: directory.you.room ? directory.you.room.slice(5).split("|").slice(1).join("|") : null,
        roomName: directory.you.roomName,
      });
    } else {
      await store.setLocation(null);
    }
  } catch {
    await store.setLocation(null);
  }

  await store.select("global");
  await store.refreshInbox();
  // Estando no chat, o aviso do menu não tem o que avisar.
  App.clearChatBadge();

  mounted = {
    destroy() {
      ui.destroy();
      store.dispose();
      window.removeEventListener("resize", fit);
      for (const [event, handler] of bound) App.hub.off(event, handler);
    },
  };
  // Sair da página desmonta: o store escuta o socket e conta não lidas, e dois
  // stores vivos contariam a mesma mensagem duas vezes.
  App.leaveView = () => { mounted?.destroy(); mounted = null; };
}
