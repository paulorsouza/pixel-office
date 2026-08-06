import assert from 'node:assert/strict';
import test from 'node:test';
import { isPlaceChannel, trimBubbleText } from './ChatBubbles.js';

test('mensagem curta vai inteira para o balão', () => {
  assert.equal(trimBubbleText('bom dia'), 'bom dia');
});

test('mensagem longa é cortada e marcada com reticências', () => {
  const longa = 'a'.repeat(200);
  const balao = trimBubbleText(longa);
  assert.ok(balao.length < longa.length, 'precisa encurtar');
  assert.ok(balao.endsWith('…'), `esperava reticências, veio ${JSON.stringify(balao.slice(-3))}`);
});

test('o corte respeita a palavra quando ela não engole o balão', () => {
  const frase = 'alguem viu o bug do deploy que quebrou a build de ontem no pipeline inteiro';
  const balao = trimBubbleText(frase, 40);
  assert.ok(balao.endsWith('…'));
  // Sem palavra partida no meio: o que sobrou tem de ser prefixo de palavra inteira.
  const semReticencias = balao.slice(0, -1);
  assert.ok(frase.startsWith(semReticencias), 'o balão tem de ser um prefixo da frase');
  assert.ok(!semReticencias.endsWith(' '), 'não sobra espaço antes das reticências');
});

test('palavra unica gigante e cortada mesmo assim', () => {
  // Respeitar a palavra aqui deixaria o balão vazio — cortar no meio é melhor.
  const balao = trimBubbleText(`${'x'.repeat(80)} fim`, 30);
  assert.equal(balao.length, 31);
  assert.ok(balao.endsWith('…'));
});

test('espaços repetidos viram um só', () => {
  assert.equal(trimBubbleText('  oi    gente \n bom dia '), 'oi gente bom dia');
});

test('canal de lugar vira balão; PM não', () => {
  // Um balão de PM sobre a cabeça de alguém ensinaria a coisa errada sobre o
  // que é privado — mesmo desenhado só na minha tela.
  assert.equal(isPlaceChannel('global'), true);
  assert.equal(isPlaceChannel('building:tooq-campus'), true);
  assert.equal(isPlaceChannel('room:personal-wing@1|sala-de-paulo'), true);
  assert.equal(isPlaceChannel('dm:1:2'), false);
  assert.equal(isPlaceChannel(''), false);
  assert.equal(isPlaceChannel(undefined), false);
});
