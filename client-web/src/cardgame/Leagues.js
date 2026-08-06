// As quatro ligas do cardgame.
//
// O teto de cada liga é o PODER IMPRESSO da espécie — `powerRating`, a soma das
// quatro bordas. O +1 do shiny NÃO conta: shiny é acabamento, não uma carta mais
// forte, e senão a mesma espécie mudaria de liga só por ter brilhado no booster.
// Por isso a conta aqui olha a CARTA (`card`), nunca a instância da coleção.
//
// Onde os cortes caem, no catálogo de 1025 cartas-base:
//
//   Common ≤24   324 cartas (32%)  — termina exatamente onde terminam as Comuns
//   Great  ≤34   513 cartas (50%)
//   Ultra  ≤44   898 cartas (88%)  — termina onde terminam as Raras
//   Master  —   1035 cartas        — inclui as especiais do cassino (44 a 60)
//
// Espelhado em `backend/VirtualOffice.Api/CardGameLeagues.cs`, que é a autoridade:
// o cliente ajuda a montar, o servidor é quem recusa baralho ilegal. Mexeu num
// teto aqui, mexa lá — os dois lados têm teste pinando os mesmos números.

import { SIDES } from './engine.js';

export const LEAGUES = [
  { id: 'common', name: 'Common League', maxPower: 24, hint: 'Básicos e pré-evoluções' },
  { id: 'great', name: 'Great League', maxPower: 34, hint: 'Evoluções intermediárias' },
  { id: 'ultra', name: 'Ultra League', maxPower: 44, hint: 'Evoluções finais' },
  { id: 'master', name: 'Master League', maxPower: null, hint: 'Sem teto — vale tudo' },
];

export const MASTER_LEAGUE = 'master';

const BY_ID = new Map(LEAGUES.map((league) => [league.id, league]));

export const leagueById = (id) => BY_ID.get(id) || null;

/**
 * O poder que a liga enxerga. Prefere o `powerRating` do catálogo (é o número que
 * o backend também usa) e cai na soma das bordas se a carta vier sem ele.
 */
export const leaguePower = (card) => Number(card?.powerRating)
  || SIDES.reduce((total, side) => total + (card?.edges?.[side] ?? 0), 0);

export function leagueAllows(leagueId, card) {
  const league = BY_ID.get(leagueId);
  if (!league) return false;
  return league.maxPower == null || leaguePower(card) <= league.maxPower;
}

/** A liga mais baixa em que a carta cabe — o selo que ela carrega no álbum. */
export const leagueOf = (card) =>
  LEAGUES.find((league) => leagueAllows(league.id, card)) || BY_ID.get(MASTER_LEAGUE);

/**
 * As cartas do baralho que estouram o teto da liga, da mais forte para a mais
 * fraca. Array vazio = baralho legal. Recebe cartas do catálogo, já resolvidas.
 */
export function illegalForLeague(leagueId, cards = []) {
  const league = BY_ID.get(leagueId);
  if (!league || league.maxPower == null) return [];
  return cards
    .filter((card) => card && leaguePower(card) > league.maxPower)
    .sort((a, b) => leaguePower(b) - leaguePower(a));
}
