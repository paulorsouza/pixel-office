const ownedCardIds = (collection = []) =>
  new Set(collection.filter((item) => item.quantity > 0).map((item) => item.cardId));

export function albumCatalog(cards = [], collection = []) {
  const owned = ownedCardIds(collection);
  return cards.filter((card) => card.id.startsWith('pokemon-') || owned.has(card.id));
}

export function collectionProgress(cards = [], collection = []) {
  const owned = ownedCardIds(collection);
  const baseOwned = cards.filter((card) => card.id.startsWith('pokemon-') && owned.has(card.id)).length;
  const specialOwned = cards.filter((card) => !card.id.startsWith('pokemon-') && owned.has(card.id)).length;
  return { baseOwned, specialOwned };
}
