import { SIDES } from './engine.js';
import { leagueAllows } from './Leagues.js';

const ownedCardIds = (collection = []) =>
  new Set(collection.filter((item) => item.quantity > 0).map((item) => item.cardId));

export function albumCatalog(cards = [], collection = []) {
  const owned = ownedCardIds(collection);
  return cards.filter((card) => card.id.startsWith('pokemon-') || owned.has(card.id));
}

const SHINY_SIDE_ORDER = new Map([
  ['top', 0],
  ['right', 1],
  ['bottom', 2],
  ['left', 3],
]);

export function albumEntries(cards = [], collection = []) {
  const stacksByCard = new Map();
  for (const item of collection) {
    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) continue;
    const stacks = stacksByCard.get(item.cardId) || [];
    stacks.push(item);
    stacksByCard.set(item.cardId, stacks);
  }

  return albumCatalog(cards, collection).flatMap((card) => {
    const stacks = stacksByCard.get(card.id) || [];
    const normalQuantity = stacks
      .filter((item) => !item.isShiny)
      .reduce((total, item) => total + (Number(item.quantity) || 0), 0);
    const shinyBySide = new Map();

    for (const item of stacks.filter((entry) => entry.isShiny)) {
      const side = item.shinyBonusSide || String(item.cardToken || '').split('~', 2)[1] || '';
      shinyBySide.set(side, (shinyBySide.get(side) || 0) + (Number(item.quantity) || 0));
    }

    const normal = {
      card,
      cardId: card.id,
      cardToken: card.id,
      isShiny: false,
      shinyBonusSide: '',
      quantity: normalQuantity,
      locked: normalQuantity === 0,
    };
    const shinies = [...shinyBySide.entries()]
      .sort(([left], [right]) => (
        (SHINY_SIDE_ORDER.get(left) ?? 99) - (SHINY_SIDE_ORDER.get(right) ?? 99)
        || left.localeCompare(right)
      ))
      .map(([shinyBonusSide, quantity]) => ({
        card,
        cardId: card.id,
        cardToken: `${card.id}~${shinyBonusSide}`,
        isShiny: true,
        shinyBonusSide,
        quantity,
        locked: false,
      }));

    return [normal, ...shinies];
  });
}

// ---------------------------------------------------------------- filtro e ordem
//
// Com 1035 cartas no álbum, rolar não é navegação. As funções abaixo são puras e
// trabalham sobre as entradas de `albumEntries` (ou qualquer objeto com o mesmo
// formato mínimo: `card`, `shinyBonusSide`, `quantity`, `locked`) — quem monta a
// UI é o `CardGamePanel`.

/** Da mais comum para a mais rara; a ordem é a mesma das cores da borda da carta. */
export const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Special'];

export const RARITY_LABEL = {
  Common: 'Comum',
  Uncommon: 'Incomum',
  Rare: 'Rara',
  Epic: 'Épica',
  Legendary: 'Lendária',
  Special: 'Especial',
};

/**
 * O valor que a carta REALMENTE mostra naquele lado. O shiny soma +1 no lado
 * bonificado, então ordenar por "maior poder à direita" precisa contar esse +1 —
 * senão a versão shiny aparece empatada com a normal, que é justamente o que a
 * pessoa está tentando comparar.
 */
export const entryEdge = (entry, side) =>
  (entry.card?.edges?.[side] ?? 0) + (entry.shinyBonusSide === side ? 1 : 0);

export const entryPower = (entry) =>
  SIDES.reduce((total, side) => total + entryEdge(entry, side), 0);

const rarityRank = (entry) => RARITY_ORDER.indexOf(entry.card?.rarity);

/** Ordenações oferecidas na UI, na ordem em que aparecem no seletor. */
export const CARD_SORTS = [
  { id: 'dex', label: 'Pokédex (padrão)' },
  { id: 'power', label: 'Poder total' },
  { id: 'top', label: 'Poder ↑ cima' },
  { id: 'right', label: 'Poder → direita' },
  { id: 'bottom', label: 'Poder ↓ baixo' },
  { id: 'left', label: 'Poder ← esquerda' },
  { id: 'rarity', label: 'Raridade' },
  { id: 'name', label: 'Nome (A–Z)' },
  { id: 'quantity', label: 'Mais repetidas' },
];

// Empate por lado cai no poder total: entre todos os 15 na direita, o mais forte
// no geral é o que interessa primeiro para montar baralho.
const bySide = (side) => (a, b) => entryEdge(b, side) - entryEdge(a, side) || entryPower(b) - entryPower(a);

const COMPARATORS = {
  power: (a, b) => entryPower(b) - entryPower(a),
  top: bySide('top'),
  right: bySide('right'),
  bottom: bySide('bottom'),
  left: bySide('left'),
  rarity: (a, b) => rarityRank(b) - rarityRank(a) || entryPower(b) - entryPower(a),
  name: (a, b) => String(a.card?.name).localeCompare(String(b.card?.name), 'pt-BR'),
  quantity: (a, b) => (b.quantity || 0) - (a.quantity || 0),
};

/**
 * `dex` (padrão) devolve a ordem em que as entradas chegaram, que já é a da
 * Pokédex. Nas demais o desempate é a ordem de entrada — `sort` é estável —,
 * então cartas iguais nunca dançam entre um desenho e outro.
 */
export function sortCardEntries(entries = [], sort = 'dex') {
  const compare = COMPARATORS[sort];
  return compare ? [...entries].sort(compare) : [...entries];
}

/**
 * @param filters.query     nome ou número da Pokédex
 * @param filters.type      um tipo do type-chart ("" = todos)
 * @param filters.finish    "normal" | "shiny" | "" (as duas)
 * @param filters.rarities  lista vazia = todas as raridades
 * @param filters.owned     "mine" (já tenho) | "missing" (ainda falta) | ""
 * @param filters.league    id de liga: só o que cabe no teto dela ("" = todas)
 */
export function filterCardEntries(entries = [], filters = {}) {
  const { query = '', type = '', finish = '', rarities = [], owned = '', league = '' } = filters;
  const term = query.trim().toLowerCase();
  const wanted = new Set(rarities);

  return entries.filter((entry) => {
    const card = entry.card;
    if (!card) return false;
    if (term && !card.name.toLowerCase().includes(term) && !String(card.dex).includes(term)) return false;
    if (type && !card.types.includes(type)) return false;
    if (finish && (finish === 'shiny') !== Boolean(entry.isShiny)) return false;
    if (wanted.size && !wanted.has(card.rarity)) return false;
    // A liga olha a espécie, não a instância: o +1 do shiny não muda de liga.
    if (league && !leagueAllows(league, card)) return false;
    // `locked` é a entrada normal com zero cópias; shiny só existe se foi obtido.
    if (owned === 'mine' && entry.locked) return false;
    if (owned === 'missing' && !entry.locked) return false;
    return true;
  });
}

export function collectionProgress(cards = [], collection = []) {
  const owned = ownedCardIds(collection);
  const baseOwned = cards.filter((card) => card.id.startsWith('pokemon-') && owned.has(card.id)).length;
  const specialOwned = cards.filter((card) => !card.id.startsWith('pokemon-') && owned.has(card.id)).length;
  return { baseOwned, specialOwned };
}
