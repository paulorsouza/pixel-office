// O menu do jogo — um só.
//
// Antes eram três janelas com três identidades: o baú/personagem em moldura RPG
// marrom, o painel de móvel em pixel art, e a central do jogador (cartas +
// trabalho) em azul moderno. Cada uma abria por um botão diferente no canto da
// tela. Agora existe UMA janela, com a identidade que já estava boa (a do
// cardgame, `.cg-*`), e todo o resto entra nela como SEÇÃO.
//
// Quem tem conteúdo se registra; o menu não conhece cardgame, trabalho nem
// inventário. É o mesmo princípio do `HudShell`: acrescentar uma área nova não
// deve exigir editar este arquivo.
//
// A loja NÃO entra aqui de propósito: comprar é uma coisa que se faz indo ao
// balcão na Galeria Tooq, não um item de menu.

const GROUPS = [
  ['player', 'Jogador'],
  ['work', 'Trabalho'],
  ['cards', 'Cartas'],
  ['world', 'Mundo'],
];

export function createMainMenu(shell) {
  const sections = new Map();   // id -> { id, group, icon, label, title, subtitle, render, visible }
  let current = null;
  let root = null;
  let els = {};

  function build() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'hud-main-menu';
    root.className = 'cg-overlay cg-hidden';
    root.innerHTML = `
      <section class="cg-window"><div class="cg-hub">
        <aside class="cg-hub-side">
          <div class="cg-brand"><strong>Office Quest</strong><small>MENU</small></div>
          <nav class="cg-nav" aria-label="Seções do menu"></nav>
          <button class="cg-btn cg-close" type="button" data-action="close">Fechar menu</button>
        </aside>
        <main class="cg-hub-main">
          <header class="cg-hub-head">
            <h2></h2><p></p>
            <button class="cg-btn" type="button" data-action="close" aria-label="Fechar">×</button>
          </header>
          <div class="cg-hub-content"></div>
        </main>
      </div></section>`;
    document.body.append(root);
    els = {
      nav: root.querySelector('.cg-nav'),
      title: root.querySelector('.cg-hub-head h2'),
      subtitle: root.querySelector('.cg-hub-head p'),
      content: root.querySelector('.cg-hub-content'),
    };
    for (const button of root.querySelectorAll('[data-action="close"]')) {
      button.onclick = () => menu.close();
    }
    // Clique no fundo fecha; dentro da janela, não.
    root.addEventListener('pointerdown', (event) => {
      if (event.target === root) menu.close();
    });
  }

  const visibleSections = () => [...sections.values()].filter((s) => s.visible?.() !== false);

  function renderNav() {
    els.nav.replaceChildren();
    const lista = visibleSections();
    for (const [groupId, groupLabel] of GROUPS) {
      const doGrupo = lista.filter((s) => s.group === groupId);
      if (!doGrupo.length) continue;
      const titulo = document.createElement('small');
      titulo.className = 'cg-nav-group';
      titulo.textContent = groupLabel;
      els.nav.append(titulo);
      for (const section of doGrupo) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = section.id === current ? 'on' : '';
        button.innerHTML = '<i></i><span></span>';
        button.querySelector('i').textContent = section.icon;
        button.querySelector('span').textContent = section.label;
        button.onclick = () => menu.open(section.id);
        els.nav.append(button);
      }
    }
  }

  const menu = {
    id: 'main-menu',
    isSheet: false,

    /**
     * @param section.render  (host, api) => void — desenha o conteúdo da seção.
     *   `api.setHeader(titulo, subtitulo)` e `api.open(id)` para navegar.
     * @param section.visible seção contextual sai da lista quando devolve false
     */
    register(section) {
      sections.set(section.id, { group: 'player', icon: '•', ...section });
      if (menu.isOpen()) renderNav();
      return () => sections.delete(section.id);
    },

    isOpen: () => Boolean(root) && !root.classList.contains('cg-hidden'),

    async open(sectionId) {
      build();
      const section = sections.get(sectionId)
        ?? visibleSections()[0];
      if (!section) return;
      // Sempre fecha a seção que estava na tela ANTES de esvaziar o conteúdo —
      // inclusive quando é a mesma (clicar de novo no item já aberto). As seções
      // que emprestam nós do documento (Personagem, Itens) precisam devolvê-los
      // ao esconderijo primeiro; sem isso o `replaceChildren` abaixo os deixava
      // soltos fora do documento e o `querySelector` seguinte não achava nada.
      if (current) sections.get(current)?.onClose?.();
      current = section.id;
      shell.closeSheets();
      root.classList.remove('cg-hidden');
      renderNav();
      els.title.textContent = section.title ?? section.label;
      els.subtitle.textContent = section.subtitle ?? '';
      els.content.replaceChildren();
      els.content.scrollTop = 0;
      await section.render(els.content, {
        setHeader: (title, subtitle = '') => {
          els.title.textContent = title;
          els.subtitle.textContent = subtitle;
        },
        open: (id) => menu.open(id),
        close: () => menu.close(),
      });
    },

    toggle(sectionId) {
      if (menu.isOpen()) menu.close();
      else menu.open(sectionId);
    },

    close() {
      if (!menu.isOpen()) return;
      const section = sections.get(current);
      section?.onClose?.();
      // Devolver os nós emprestados (inventário e personagem vivem no index.html
      // e são MOVIDOS para cá) antes de esvaziar, senão eles são destruídos e os
      // listeners que os módulos já registraram vão junto.
      els.content.replaceChildren();
      root.classList.add('cg-hidden');
      current = null;
    },

    /** Seção contextual apareceu/sumiu (ex.: "Decorar" só onde dá). */
    refresh() { if (menu.isOpen()) renderNav(); },
  };

  shell.register({ id: 'main-menu', isOpen: menu.isOpen });
  return menu;
}
