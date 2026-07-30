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

export function collectionProgress(cards = [], collection = []) {
  const owned = ownedCardIds(collection);
  const baseOwned = cards.filter((card) => card.id.startsWith('pokemon-') && owned.has(card.id)).length;
  const specialOwned = cards.filter((card) => !card.id.startsWith('pokemon-') && owned.has(card.id)).length;
  return { baseOwned, specialOwned };
}
