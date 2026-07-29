// Miniatura de item — uma só, para loja, baú e inventário.
//
// Antes cada tela desenhava do seu jeito: o baú com `<img>` cru, a loja com
// nada (o `IconPath` de equipamento e veículo é vazio no banco, então saía um
// quadrado quebrado) e o catálogo de decoração com `transform:scale(1.8)` fixo
// para qualquer sprite — o que deixa o item de 16px minúsculo e estoura o de
// 96px. Aqui a arte é encaixada na caixa (`object-fit:contain`), e quem não tem
// arte ganha um símbolo pelo tipo em vez de um ícone quebrado.

const FALLBACK = {
  furniture: '🪑',
  equipment: '⌨️',
  vehicle: '🛹',
  booster: '🃏',
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
})[character]);

/**
 * @param item.iconPath  caminho da arte (pode vir vazio do backend)
 * @param item.itemType  furniture | equipment | vehicle | booster
 */
export function itemThumbHtml(item, { size = 'md' } = {}) {
  const classe = `hud-thumb hud-thumb-${size}`;
  if (item?.iconPath) {
    return `<span class="${classe}"><img src="${escapeHtml(item.iconPath)}" alt=""
      loading="lazy" draggable="false"></span>`;
  }
  return `<span class="${classe}" data-fallback="1">${FALLBACK[item?.itemType] || '📦'}</span>`;
}
