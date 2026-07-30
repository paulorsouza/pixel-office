import assert from 'node:assert/strict';
import test from 'node:test';
import { storeCatalogHtml, storeKindOf } from './FurnitureInteractionSystem.js';

const booster = (overrides = {}) => ({
  catalogKey: 'cardgame:booster-generation-1',
  name: 'Edição Kanto',
  itemType: 'booster',
  rarity: 'rare',
  price: 400,
  isPurchasable: true,
  weeklyLimit: 1,
  weeklyRemaining: 1,
  ...overrides,
});

const catalog = (items, coins = 5000) => ({ coins, definitions: items });

test('o balcão mostra o teto semanal e quanto ainda resta', () => {
  const html = storeCatalogHtml(catalog([booster()]), 'cards');
  assert.match(html, /1\/semana · resta 1/);
  assert.match(html, /400 🪙/);
  assert.doesNotMatch(html, /disabled/, 'com saldo e cota, o botão precisa continuar clicável');
});

test('cota gasta esgota o item mesmo com moeda sobrando', () => {
  const html = storeCatalogHtml(catalog([booster({ weeklyRemaining: 0 })], 99_999), 'cards');
  assert.match(html, /data-soldout/);
  assert.match(html, /disabled/);
  assert.match(html, /Esgotado/);
  // Esgotado não é problema de preço: mostrar 400 🪙 aqui manda o jogador
  // juntar moeda para uma compra que não existe até segunda.
  assert.doesNotMatch(html, /400 🪙/);
  assert.match(html, /volta segunda/);
});

test('sem moeda o preço continua à vista, porque juntar moeda resolve', () => {
  const html = storeCatalogHtml(catalog([booster()], 10), 'cards');
  assert.match(html, /disabled/);
  assert.doesNotMatch(html, /data-soldout/);
  assert.match(html, /400 🪙/);
});

test('plural de "restam" acompanha a cota', () => {
  const html = storeCatalogHtml(catalog([booster({ weeklyLimit: 3, weeklyRemaining: 2 })]), 'cards');
  assert.match(html, /3\/semana · restam 2/);
});

test('item sem teto não ganha texto de semana — é o caso de todo móvel', () => {
  const mesa = {
    catalogKey: 'of_258',
    name: 'Mesa reta madeira',
    itemType: 'furniture',
    rarity: 'common',
    price: 120,
    isPurchasable: true,
    weeklyLimit: 0,
    weeklyRemaining: null,
  };
  const html = storeCatalogHtml(catalog([mesa]), 'furniture');
  assert.doesNotMatch(html, /\/semana/);
  assert.doesNotMatch(html, /data-soldout/);
  assert.match(html, /120 🪙/);
});

// Em `three` a coluna do texto fica com ~70px e a linha do teto quebra em três.
test('balcão com teto usa a grade larga; sem teto mantém a estreita', () => {
  assert.match(storeCatalogHtml(catalog([booster()]), 'cards'), /hud-item-list two/);
  const mesa = { catalogKey: 'of_258', name: 'Mesa', itemType: 'furniture', rarity: 'common', price: 120, isPurchasable: true, weeklyLimit: 0 };
  assert.match(storeCatalogHtml(catalog([mesa]), 'furniture'), /hud-item-list three/);
});

test('item fora de venda não aparece no balcão', () => {
  const html = storeCatalogHtml(catalog([
    booster({ catalogKey: 'cardgame:booster', name: 'Booster Nacional', isPurchasable: false, weeklyLimit: 0 }),
  ]), 'cards');
  assert.doesNotMatch(html, /Booster Nacional/);
  assert.match(html, /sem estoque/);
});

test('só a banca de cartas explica de onde vêm os boosters não vendidos', () => {
  assert.match(storeCatalogHtml(catalog([booster()]), 'cards'), /vêm do cassino/);
  assert.doesNotMatch(storeCatalogHtml(catalog([booster()]), 'furniture'), /vêm do cassino/);
});

test('o balcão de cartas é reconhecido pela interactionKey do móvel', () => {
  assert.equal(storeKindOf({ item: { interactionKey: 'store:cards' } }), 'cards');
  assert.equal(storeKindOf({ item: { interactionKey: 'store:furniture' } }), 'furniture');
  // Chave desconhecida cai na loja geral em vez de quebrar com STORES[undefined].
  assert.equal(storeKindOf({ item: { interactionKey: 'store:pokebola' } }), '');
  assert.equal(storeKindOf({ item: {} }), '');
});
