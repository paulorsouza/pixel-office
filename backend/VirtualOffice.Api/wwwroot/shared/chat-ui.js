// A tela do chat — a mesma no app web e dentro do jogo.
//
// O chassi (barra de canais + conversa + campo) é montado UMA vez; o que
// redesenha a cada mudança é a lista de canais e o log. Isso não é economia: o
// campo de texto mora no chassi, e recriá-lo a cada mensagem que chega tirava a
// palavra da boca de quem estava digitando.
//
// Estreito vira uma coluna só (lista → conversa, com botão de voltar). A
// decisão é por LARGURA DO CONTAINER, não da janela: no jogo esta tela vive
// numa folha de 420px dentro de um desktop.

import { h, createFeedback } from "./work-core.js";

const NARROW = 560;

const timeOf = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const dayLabel = (iso) => {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Hoje";
  const yesterday = new Date(today.getTime() - 864e5);
  if (sameDay(date, yesterday)) return "Ontem";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const initials = (name) => {
  const parts = String(name ?? "?").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
};

/**
 * @param host            container; a tela ocupa 100% da altura dele
 * @param ctx.store       `createChatStore`
 * @param ctx.client      `createWorkClient` (usuários para PM e diretório de canais)
 * @param ctx.currentUserId
 * @param ctx.canPickPlace  true no app web: sem avatar, o prédio/sala é escolhido
 *                          numa lista. No jogo é o avatar que decide, e um
 *                          seletor aqui contradiria onde a pessoa está.
 * @param ctx.theme       "dark" no jogo
 */
export function mountChat(host, ctx) {
  const { store, client, currentUserId, canPickPlace = false, theme = null } = ctx;

  const root = h("div", { class: "wq wq-chat" });
  if (theme) root.dataset.theme = theme;

  const side = h("aside", { class: "wq-chat-side" });
  const headerTitle = h("b", {});
  const headerSub = h("small", {});
  const backButton = h("button", {
    class: "wq-chat-back", type: "button", "aria-label": "Voltar aos canais",
    onclick: () => setView("list"),
  }, "‹");
  const log = h("div", { class: "wq-chat-log", tabindex: "-1" });
  const input = h("textarea", {
    class: "wq-chat-input", rows: "1", placeholder: "Escreva uma mensagem…",
    "aria-label": "Mensagem",
    oninput: () => autoGrow(),
    onkeydown: (event) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      submit();
    },
  });
  const sendButton = h("button", { class: "wq-btn primary wq-chat-send", type: "button", onclick: () => submit() }, "Enviar");
  const composer = h("div", { class: "wq-chat-composer" }, input, sendButton);

  const main = h("section", { class: "wq-chat-main" },
    h("header", { class: "wq-chat-head" }, backButton, h("div", { class: "wq-chat-head-text" }, headerTitle, headerSub)),
    log,
    composer);

  root.append(side, main);
  host.replaceChildren(root);
  const feedback = ctx.feedback ?? createFeedback(root);

  // Largura do CONTAINER: a mesma tela é folha estreita no jogo e painel largo
  // no navegador, e `matchMedia` não sabe a diferença.
  //
  // A medida é feita também a cada desenho, e não só pelo observador: o
  // ResizeObserver entrega as observações junto com o quadro, então numa aba
  // que ainda não pintou (ou está no fundo) o layout nasceria no padrão largo.
  const measure = () => {
    const narrow = (root.clientWidth || host.clientWidth) < NARROW ? "on" : "off";
    if (root.dataset.narrow !== narrow) root.dataset.narrow = narrow;
  };
  const observer = new ResizeObserver(measure);
  observer.observe(root);
  const setView = (view) => { root.dataset.view = view; if (view === "thread") input.focus(); };
  setView("list");

  function autoGrow() {
    input.style.height = "auto";
    input.style.height = `${Math.min(120, input.scrollHeight)}px`;
  }

  async function submit() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    autoGrow();
    if (!(await store.send(text))) {
      input.value = text;
      autoGrow();
      feedback.toast("Não deu para enviar aqui — você saiu deste canal?", "err");
    }
  }

  // ---------- lista de canais ----------
  function renderSide() {
    const entries = store.channels();
    const selected = store.selected();
    const places = entries.filter((entry) => entry.kind !== "dm");
    const conversations = entries.filter((entry) => entry.kind === "dm");

    // O nome acessível vai no próprio botão: o rótulo visível está aninhado em
    // spans, e leitor de tela (e teste automatizado) chegava num botão anônimo.
    const item = (entry) => h("button", {
      class: `wq-chat-item${entry.id === selected ? " on" : ""}`,
      type: "button",
      title: entry.label,
      "aria-label": entry.unread ? `${entry.label} — ${entry.unread} não lidas` : entry.label,
      "aria-current": entry.id === selected ? "true" : null,
      onclick: () => { store.select(entry.id); setView("thread"); },
    },
      entry.kind === "dm"
        ? h("span", { class: "wq-avatar", style: { background: entry.color || "#7c5cff" } }, initials(entry.label))
        : h("span", { class: "wq-chat-icon" }, entry.icon),
      h("span", { class: "wq-chat-item-text" },
        h("b", {}, entry.label),
        h("small", {}, entry.sub)),
      entry.unread > 0 && h("span", { class: "wq-chat-badge" }, entry.unread > 99 ? "99+" : String(entry.unread)));

    // `replaceChildren` NÃO ignora `false` como o `h` faz: ele vira o texto
    // "false" na tela. Filtrar aqui é o que permite os itens condicionais.
    side.replaceChildren(...[
      h("div", { class: "wq-chat-group" }, "Canais"),
      ...places.map(item),
      canPickPlace && h("button", {
        class: "wq-chat-ghost", type: "button", onclick: () => openPlacePicker(),
      }, "⌖ Escolher prédio / sala"),
      h("div", { class: "wq-chat-group" }, "Conversas"),
      ...(conversations.length ? conversations.map(item) : [h("p", { class: "wq-chat-empty" }, "Nenhuma conversa ainda.")]),
      h("button", { class: "wq-chat-ghost", type: "button", onclick: () => openPeoplePicker() }, "✉️ Nova conversa"),
    ].filter(Boolean));
  }

  // ---------- conversa ----------
  function renderThread() {
    const selected = store.selected();
    const entry = store.channels().find((candidate) => candidate.id === selected);
    headerTitle.textContent = entry?.label ?? "Chat";
    headerSub.textContent = entry?.kind === "dm" ? "conversa privada" : (entry?.sub ?? "");
    composer.hidden = !entry;

    const state = store.thread(selected);
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;

    if (!state.loaded && state.loading) {
      log.replaceChildren(h("p", { class: "wq-chat-empty" }, "Carregando…"));
      return;
    }
    if (state.error) {
      log.replaceChildren(h("p", { class: "wq-chat-empty" }, `Não foi possível carregar: ${state.error}`));
      return;
    }
    if (!state.messages.length) {
      log.replaceChildren(h("p", { class: "wq-chat-empty" },
        entry?.kind === "dm" ? "Diga oi." : "Ninguém falou nada por aqui ainda."));
      return;
    }

    const nodes = [];
    if (state.hasMore) {
      nodes.push(h("button", {
        class: "wq-chat-more", type: "button", disabled: state.loading,
        onclick: () => store.loadOlder(),
      }, state.loading ? "Carregando…" : "Ver mensagens anteriores"));
    }
    let lastDay = "";
    let lastAuthor = null;
    for (const message of state.messages) {
      const day = dayLabel(message.sentUtc);
      if (day !== lastDay) {
        nodes.push(h("div", { class: "wq-chat-day" }, day));
        lastDay = day;
        lastAuthor = null;
      }
      const mine = message.userId === currentUserId;
      // Sequência do mesmo autor perde o cabeçalho: com nome e avatar em toda
      // linha, três frases seguidas viravam três blocos e a leitura quebrava.
      const grouped = lastAuthor === message.userId;
      lastAuthor = message.userId;
      nodes.push(h("div", { class: `wq-chat-msg${mine ? " mine" : ""}${grouped ? " grouped" : ""}` },
        !grouped && h("span", { class: "wq-avatar sm", style: { background: message.color || "#7c5cff" } },
          initials(message.name)),
        h("div", { class: "wq-chat-bubble" },
          !grouped && h("span", { class: "wq-chat-author" },
            h("b", {}, mine ? "Você" : message.name),
            h("time", {}, timeOf(message.sentUtc))),
          h("p", {}, message.text))));
    }
    log.replaceChildren(...nodes);
    if (nearBottom) log.scrollTop = log.scrollHeight;
  }

  // ---------- escolher com quem falar ----------
  async function openPeoplePicker() {
    const list = h("div", { class: "wq-chat-picker" }, h("p", { class: "wq-chat-empty" }, "Carregando…"));
    const dialog = feedback.modal({ title: "Nova conversa", body: list });
    try {
      const users = (await client.get("/api/users")).filter((user) => user.id !== currentUserId);
      list.replaceChildren(...(users.length
        ? users.map((user) => h("button", {
          class: "wq-chat-item", type: "button", "aria-label": user.name, title: user.name,
          onclick: () => { dialog.close(); store.openDirect(user); setView("thread"); },
        },
          h("span", { class: "wq-avatar", style: { background: user.color || "#7c5cff" } }, initials(user.name)),
          h("span", { class: "wq-chat-item-text" }, h("b", {}, user.name), h("small", {}, user.role || ""))))
        : [h("p", { class: "wq-chat-empty" }, "Ninguém mais por aqui.")]));
    } catch (error) {
      list.replaceChildren(h("p", { class: "wq-chat-empty" }, error.message));
    }
  }

  // `room:<cena>|<sala>` — desmontar aqui evita um segundo formato de payload só
  // para o servidor devolver o que ele já codificou no id do canal.
  const sceneOf = (channel) => channel.slice("room:".length).split("|")[0];
  const roomOf = (channel) => channel.slice("room:".length).split("|").slice(1).join("|");

  // ---------- escolher prédio/sala (só onde não há avatar mandando) ----------
  async function openPlacePicker() {
    const list = h("div", { class: "wq-chat-picker" }, h("p", { class: "wq-chat-empty" }, "Carregando…"));
    const dialog = feedback.modal({ title: "Onde você quer falar", body: list });
    try {
      const directory = await store.directory();
      const buildings = directory?.buildings ?? [];
      const rooms = directory?.rooms ?? [];
      const pick = async (location) => {
        dialog.close();
        await store.setLocation(location);
      };
      const row = (icon, label, sub, location) => h("button", {
        class: "wq-chat-item", type: "button", "aria-label": label, title: label,
        onclick: () => pick(location),
      },
        h("span", { class: "wq-chat-icon" }, icon),
        h("span", { class: "wq-chat-item-text" }, h("b", {}, label), h("small", {}, sub)));

      const people = (n) => `${n} ${n === 1 ? "pessoa" : "pessoas"}`;
      list.replaceChildren(...[
        h("div", { class: "wq-chat-group" }, "Prédios com gente agora"),
        ...(buildings.length
          ? buildings.map((building) => row("🏢", building.name || building.id, people(building.people), {
            buildingId: building.id, buildingName: building.name,
          }))
          : [h("p", { class: "wq-chat-empty" }, "Ninguém no mundo agora.")]),
        h("div", { class: "wq-chat-group" }, "Salas"),
        ...(rooms.length
          ? rooms.map((room) => row("🚪", room.name || "Sala", `${room.buildingName || ""} · ${people(room.people)}`, {
            buildingId: room.buildingId,
            buildingName: room.buildingName,
            sceneId: sceneOf(room.channel),
            roomId: roomOf(room.channel),
            roomName: room.name,
          }))
          : [h("p", { class: "wq-chat-empty" }, "Nenhuma sala ocupada.")]),
        h("button", {
          class: "wq-chat-ghost", type: "button", onclick: () => pick(null),
        }, "Sair do prédio e da sala"),
      ].filter(Boolean));
    } catch (error) {
      list.replaceChildren(h("p", { class: "wq-chat-empty" }, error.message));
    }
  }

  // Redesenho coalescido. `setTimeout`, e não `requestAnimationFrame`: em aba de
  // fundo o rAF simplesmente NÃO roda, e a conversa ficava congelada no que
  // estava quando a aba saiu de foco — as mensagens só apareciam ao voltar.
  let pending = null;
  const render = () => {
    pending = null;
    measure();
    renderSide();
    renderThread();
  };
  const schedule = () => { pending ??= setTimeout(render, 0); };

  const unsubscribe = store.subscribe(schedule);
  render();

  return {
    element: root,
    /** Abre a PM com alguém (o jogo usa ao tocar num avatar). */
    async openDirect(user) { await store.openDirect(user); setView("thread"); },
    focus() { input.focus(); },
    refresh: schedule,
    destroy() {
      unsubscribe();
      observer.disconnect();
      if (pending) clearTimeout(pending);
      host.replaceChildren();
    },
  };
}
