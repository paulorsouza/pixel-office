import assert from 'node:assert/strict';
import test from 'node:test';
import { buildingOf } from './FloorNavigation.js';

test('cada cena é o seu próprio prédio', () => {
  assert.equal(buildingOf('tooq-office'), 'tooq-office');
  assert.equal(buildingOf('casino-nerd'), 'casino-nerd');
  assert.equal(buildingOf('world'), 'world');
});

test('os andares de salas pessoais são o MESMO prédio do campus', () => {
  // Sem isto, subir de escada tiraria a pessoa da conversa do prédio em que ela
  // continua estando — e cada andar viraria um canal separado.
  assert.equal(buildingOf('personal-wing@0'), 'tooq-campus');
  assert.equal(buildingOf('personal-wing@3'), 'tooq-campus');
  assert.equal(buildingOf('tooq-campus'), 'tooq-campus');
});

test('casa comprada continua sendo o prédio das casas, não uma por número', () => {
  assert.equal(buildingOf('player-home-shell@house-02'), 'player-home-shell');
});

test('sem cena não há prédio', () => {
  assert.equal(buildingOf(''), '');
  assert.equal(buildingOf(null), '');
  assert.equal(buildingOf(undefined), '');
});
