import assert from 'node:assert/strict';
import test from 'node:test';

import { dueToIso, parseQuickTask } from './quick-parse.js';

// Meta de mentira, no mesmo formato que `loadBoardMeta` devolve.
const meta = {
  currentUserId: 1,
  users: [{ id: 1, name: 'Paulo Souza' }, { id: 2, name: 'Ana Lúcia' }, { id: 3, name: 'Bruno' }],
  labels: [{ id: 10, name: 'frontend' }, { id: 11, name: 'débito técnico' }, { id: 12, name: 'ux' }],
  epics: [{ id: 20, name: 'Cassino' }, { id: 21, name: 'Onboarding' }],
};

// Terça-feira, 04/08/2026 — todas as datas relativas saem daqui.
const today = new Date(2026, 7, 4, 15, 30);
const parse = (text) => parseQuickTask(text, meta, { today });

test('sem token nenhum, a linha inteira é o título', () => {
  const out = parse('arrumar o login do app');
  assert.equal(out.title, 'arrumar o login do app');
  assert.deepEqual(out.chips, []);
  assert.equal(out.type, undefined);
  assert.equal(out.priority, undefined);
  assert.deepEqual(out.labelIds, []);
});

test('tipo, prioridade, responsável, etiqueta, estimativa e prazo numa linha só', () => {
  const out = parse('corrigir o carrinho /bug !alta @ana #frontend ~2h 12/09');
  assert.equal(out.title, 'corrigir o carrinho');
  assert.equal(out.type, 'Bug');
  assert.equal(out.priority, 'High');
  assert.equal(out.assigneeId, 2);
  assert.deepEqual(out.labelIds, [10]);
  assert.equal(out.estimateHours, 2);
  assert.equal(out.due, '2026-09-12');
});

test('o token pode vir no meio da frase e some do título', () => {
  const out = parse('subir !! o hotfix de pagamento');
  assert.equal(out.title, 'subir o hotfix de pagamento');
  assert.equal(out.priority, 'Urgent');
});

test('o que não casa com nada continua no título', () => {
  const out = parse('mandar email para joao@empresa.com #inexistente /qualquer ~xis');
  assert.equal(out.title, 'mandar email para joao@empresa.com #inexistente /qualquer ~xis');
  assert.deepEqual(out.chips, []);
});

test('@eu resolve para o usuário atual', () => {
  assert.equal(parse('revisar o PR @eu').assigneeId, 1);
  assert.equal(parseQuickTask('revisar @eu', { users: meta.users }, { today }).assigneeId, undefined,
    'sem currentUserId não há para quem apontar');
});

test('o responsável casa por prefixo, com ou sem acento, no nome ou no sobrenome', () => {
  assert.equal(parse('x @paulo').assigneeId, 1);
  assert.equal(parse('x @souza').assigneeId, 1);
  assert.equal(parse('x @lucia').assigneeId, 2);
  assert.equal(parse('x @br').assigneeId, 3);
  assert.equal(parse('x @ninguem').assigneeId, undefined);
});

test('etiqueta ganha do épico, e _ vale por espaço', () => {
  assert.deepEqual(parse('x #debito_tecnico').labelIds, [11]);
  assert.equal(parse('x #cassino').epicId, 20);
  assert.equal(parse('x #cassino').labelIds.length, 0);
});

test('várias etiquetas na mesma linha, sem repetir', () => {
  const out = parse('x #ux #frontend #ux');
  assert.deepEqual(out.labelIds, [12, 10]);
});

test('estimativa aceita hora, minuto e vírgula', () => {
  assert.equal(parse('x ~3').estimateHours, 3);
  assert.equal(parse('x ~2h').estimateHours, 2);
  assert.equal(parse('x ~90m').estimateHours, 1.5);
  assert.equal(parse('x ~1,5h').estimateHours, 1.5);
  assert.equal(parse('x ~0h').estimateHours, undefined);
});

test('prazo: hoje, amanhã, dia da semana e data', () => {
  assert.equal(parse('x hoje').due, '2026-08-04');
  assert.equal(parse('x amanhã').due, '2026-08-05');
  assert.equal(parse('x sex').due, '2026-08-07', 'a próxima sexta');
  assert.equal(parse('x ter').due, '2026-08-04', 'o mesmo dia da semana é hoje');
  assert.equal(parse('x seg').due, '2026-08-10', 'segunda que vem');
  assert.equal(parse('x 1/12').due, '2026-12-01');
  assert.equal(parse('x 01/12/2027').due, '2027-12-01');
  assert.equal(parse('x 3/1/27').due, '2027-01-03');
});

// O risco real de comer palavra do título é aqui: por isso só a abreviação de
// três letras vira data, e "sexta"/"segunda" por extenso continuam texto.
test('dia da semana por extenso NÃO é prazo', () => {
  const out = parse('reunião de sexta com o cliente');
  assert.equal(out.title, 'reunião de sexta com o cliente');
  assert.equal(out.due, undefined);
});

test('data impossível fica no título', () => {
  assert.equal(parse('x 32/13').title, 'x 32/13');
  assert.equal(parse('x 30/02').title, 'x 30/02');
});

test('os chips descrevem, na ordem, o que foi entendido', () => {
  const out = parse('x /atd !u @ana #ux ~30m hoje');
  assert.deepEqual(out.chips, [
    { field: 'type', label: 'Atend.' },
    { field: 'priority', label: 'Urgente' },
    { field: 'assignee', label: 'Ana Lúcia' },
    { field: 'label', label: 'ux' },
    { field: 'estimate', label: '30min' },
    { field: 'due', label: 'hoje' },
  ]);
});

test('o último token do mesmo campo vence', () => {
  const out = parse('x /bug /atd !baixa !!');
  assert.equal(out.type, 'Atendimento');
  assert.equal(out.priority, 'Urgent');
});

// Meio-dia UTC é a mesma âncora que o formulário completo usa; sem isso o prazo
// escorrega um dia no fuso de Brasília.
test('dueToIso ancora ao meio-dia UTC', () => {
  assert.equal(dueToIso('2026-08-04'), '2026-08-04T12:00:00.000Z');
  assert.equal(dueToIso(null), null);
});
