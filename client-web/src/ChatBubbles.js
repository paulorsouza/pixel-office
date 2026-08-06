// Balão de fala sobre a cabeça de quem escreveu.
//
// O chat é uma folha no canto; o balão é o que faz a conversa acontecer NO
// MUNDO — dá para ver quem falou sem abrir nada, e é o que transforma uma lista
// de mensagens em gente conversando no escritório.
//
// Só canal de LUGAR (global, prédio, sala). PM não vira balão: ela é privada, e
// desenhá-la sobre a cabeça de alguém — mesmo que só na minha tela — ensinaria
// exatamente a coisa errada sobre o que é privado aqui.
//
// O texto é aparado: um parágrafo inteiro sobre a cabeça tapa o cenário e some
// antes de ser lido. Quem quer o resto abre o chat, que é onde ele está inteiro.

/** Além disto o balão vira parede: corta e marca com reticências. */
const MAX_CHARS = 90;

/** Quanto tempo o balão fica na tela. Curto o bastante para não virar cenário. */
const LIFETIME_MS = 6500;

/** Balões simultâneos por pessoa. O mais novo empurra o mais velho. */
const MAX_PER_USER = 1;

const STYLE = {
  fontSize: '8px',
  fontFamily: 'monospace',
  color: '#1b1622',
  backgroundColor: '#f6e9dd',
  padding: { x: 4, y: 3 },
  align: 'center',
  wordWrap: { width: 132, useAdvancedWrap: true },
};

/** Corta no limite e marca com reticências — sem partir palavra no meio se der. */
export function trimBubbleText(text, max = MAX_CHARS) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  // Só respeita a palavra se ela não engolir metade do balão: "a…" é pior que
  // cortar no meio de uma palavra longa.
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

/** Canal de lugar vira balão; PM, não. */
export const isPlaceChannel = (channel) =>
  channel === 'global'
  || String(channel).startsWith('building:')
  || String(channel).startsWith('room:');

/**
 * @param options.presence   `createPresence` — dá a âncora dos avatares remotos
 * @param options.getScene   cena Phaser atual (ela reinicia a cada mapa)
 * @param options.selfUserId quem sou eu (o meu balão sai do meu próprio sprite)
 */
export function createChatBubbles({ presence, getScene, selfUserId }) {
  // { userId, sprite, until }
  let live = [];

  const destroy = (bubble) => { bubble.sprite?.destroy(); };

  /** Onde fica a cabeça deste usuário nesta cena, ou null se ele não está nela. */
  function anchorOf(userId) {
    const scene = getScene();
    if (!scene) return null;
    if (userId === selfUserId) {
      const player = scene.player;
      if (!player) return null;
      // O avatar local é desenhado pelo próprio sprite; sentado, ele já foi
      // reposicionado na cadeira, então a posição serve nos dois casos.
      return { x: player.x, y: player.y };
    }
    return presence.avatarAnchor(userId);
  }

  return {
    /** Uma mensagem chegou. Fora de canal de lugar (ou fora da cena), ignora. */
    show(message) {
      const scene = getScene();
      if (!scene || !message?.text || !isPlaceChannel(message.channel)) return;
      const userId = Number(message.userId);
      if (!anchorOf(userId)) return;   // quem falou não está nesta cena

      // O mais novo substitui o anterior da mesma pessoa: dois balões
      // empilhados sobre uma cabeça só ficam ilegíveis.
      let mine = live.filter((bubble) => bubble.userId === userId);
      while (mine.length >= MAX_PER_USER) {
        const oldest = mine.shift();
        live = live.filter((bubble) => bubble !== oldest);
        destroy(oldest);
      }

      const sprite = scene.add.text(0, 0, trimBubbleText(message.text), STYLE)
        .setOrigin(0.5, 1)
        // Acima de tudo, junto com os rótulos de nome (que usam 1e6).
        .setDepth(1e6 + 1);
      live.push({ userId, sprite, until: scene.time.now + LIFETIME_MS });
    },

    /**
     * Chamado a cada quadro: reancora os balões e recolhe os vencidos.
     *
     * Reposicionar todo quadro (em vez de prender o balão ao sprite) é o que
     * mantém o balão colado em quem ANDA — e o que faz ele sumir sozinho quando
     * a pessoa troca de cena, porque a âncora simplesmente deixa de existir.
     */
    update() {
      const scene = getScene();
      if (!scene || !live.length) return;
      const now = scene.time.now;
      const survivors = [];
      for (const bubble of live) {
        const anchor = anchorOf(bubble.userId);
        if (!anchor || now >= bubble.until) { destroy(bubble); continue; }
        // Acima do rótulo com o nome. O rótulo tem origem embaixo em y-22 e uns
        // 13px de altura, ou seja ocupa até y-35: a -34 o balão encostava nele.
        bubble.sprite.setPosition(Math.round(anchor.x), Math.round(anchor.y) - 40);
        survivors.push(bubble);
      }
      live = survivors;
    },

    /** A cena reiniciou: os objetos dela já foram destruídos junto. */
    reset() { live = []; },

    /** Quantos balões estão vivos agora (QA). */
    count: () => live.length,

    destroy() {
      for (const bubble of live) destroy(bubble);
      live = [];
    },
  };
}
