import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  LEAGUES, illegalForLeague, leagueAllows, leagueById, leagueOf, leaguePower,
} from './Leagues.js';

const catalog = JSON.parse(await readFile(
  fileURLToPath(new URL('../../assets/cardgame/catalog.json', import.meta.url)),
  'utf8',
));
const byId = new Map(catalog.cards.map((card) => [card.id, card]));
const card = (id) => byId.get(id);

// Os tetos são contrato com o backend (`CardGameLeagues.cs`) e com a economia da
// mesa do cassino. Se este teste falhar, o número mudou de propósito — mude lá
// também, no mesmo commit.
test('os quatro tetos são 24 / 34 / 44 / sem teto', () => {
  assert.deepEqual(
    LEAGUES.map((league) => [league.id, league.name, league.maxPower]),
    [
      ['common', 'Common League', 24],
      ['great', 'Great League', 34],
      ['ultra', 'Ultra League', 44],
      ['master', 'Master League', null],
    ],
  );
});

test('o teto olha o poder impresso, e o +1 do shiny não conta', () => {
  // Uma carta EXATAMENTE no teto da Common continua na Common sendo shiny: o
  // bônus vive na instância, e a liga só enxerga a espécie.
  const noTeto = catalog.cards.find((entry) => entry.powerRating === 24);
  assert.ok(noTeto, 'o catálogo precisa ter alguma carta de poder 24');
  assert.equal(leaguePower(noTeto), 24);
  assert.equal(leagueAllows('common', noTeto), true);
  assert.equal(leagueOf(noTeto).id, 'common');
  // O shiny é outro objeto (a instância); a carta passada para a liga é a mesma.
  const instanciaShiny = { card: noTeto, isShiny: true, shinyBonusSide: 'top' };
  assert.equal(leagueAllows('common', instanciaShiny.card), true);
});

test('poder acima do teto sobe de liga', () => {
  const bulbasaur = card('pokemon-001');          // 20
  const venusaur = card('pokemon-003');           // 43
  const mewtwo = card('special-casino-mewtwo');   // 60
  assert.equal(leaguePower(bulbasaur), 20);
  assert.equal(leagueOf(bulbasaur).id, 'common');
  assert.equal(leagueOf(venusaur).id, 'ultra');
  assert.equal(leagueOf(mewtwo).id, 'master');
  assert.equal(leagueAllows('great', venusaur), false);
  assert.equal(leagueAllows('master', mewtwo), true);
});

test('Master aceita qualquer carta do catálogo', () => {
  assert.equal(catalog.cards.every((entry) => leagueAllows('master', entry)), true);
  assert.deepEqual(illegalForLeague('master', catalog.cards), []);
});

test('liga desconhecida não aceita nada', () => {
  assert.equal(leagueAllows('elite-four', card('pokemon-001')), false);
  assert.equal(leagueById('elite-four'), null);
  assert.deepEqual(illegalForLeague('elite-four', catalog.cards), []);
});

test('cada liga tem pool de sobra para os 15 do baralho', () => {
  const pools = LEAGUES.map((league) => ({
    id: league.id,
    n: catalog.cards.filter((entry) => leagueAllows(league.id, entry)).length,
  }));
  assert.deepEqual(pools, [
    { id: 'common', n: 324 },
    { id: 'great', n: 513 },
    { id: 'ultra', n: 899 },
    { id: 'master', n: 1035 },
  ]);
  // O pool cresce a cada liga: uma carta legal na Common é legal em todas.
  for (const entry of catalog.cards) {
    const first = LEAGUES.findIndex((league) => leagueAllows(league.id, entry));
    for (const league of LEAGUES.slice(first)) {
      assert.equal(leagueAllows(league.id, entry), true, `${entry.name} em ${league.id}`);
    }
  }
});

test('baralho ilegal aponta as cartas que estouraram, da mais forte para a mais fraca', () => {
  const deck = [card('pokemon-001'), card('special-casino-mewtwo'), card('pokemon-003')];
  assert.deepEqual(
    illegalForLeague('common', deck).map((entry) => entry.name),
    ['Mewtwo Rei do Cassino', 'Venusaur'],
  );
  assert.deepEqual(illegalForLeague('ultra', deck).map((entry) => entry.name), ['Mewtwo Rei do Cassino']);
  assert.deepEqual(illegalForLeague('master', deck), []);
});
