// Folha "Como jogar" — o que antes era a tira fixa de teclas no rodapé.
//
// A tira ocupava espaço permanente para dizer sempre a mesma coisa, e no celular
// era escondida por CSS (não serve para toque). Aqui o conteúdo se adapta: quem
// está no toque vê gestos, quem está no teclado vê teclas.

import { createSheet } from './Sheet.js';
import { isTouchDevice } from '../TouchControls.js';

const KEYBOARD = [
  ['Mundo', [
    [['W', 'A', 'S', 'D'], 'andar (ou as setas)'],
    [['clique'], 'andar até o ponto'],
    [['Shift'], 'usar o veículo equipado'],
    [['E'], 'entrar, sair, sentar e usar móvel'],
    [['F'], 'pegar e soltar o fone da reunião'],
    [['scroll'], 'aproximar e afastar a câmera'],
  ]],
  ['Menus', [
    [['Tab'], 'equipamentos e personagem'],
    [['1', '2', '3', '4'], 'trocar de veículo com o menu aberto'],
    [['0'], 'guardar o veículo'],
    [['Esc'], 'fechar o que estiver aberto'],
  ]],
  ['Reunião', [
    [['Ctrl', 'D'], 'ligar e desligar o microfone'],
    [['Ctrl', 'E'], 'ligar e desligar a câmera'],
    [['Alt', '1'], 'só o jogo'],
    [['Alt', '2'], 'reunião ao lado do jogo'],
    [['Alt', '3'], 'foco na reunião'],
  ]],
];

const TOUCH = [
  ['Mundo', [
    [['toque'], 'andar até o ponto'],
    [['✋'], 'o botão da direita confirma: entrar, sentar, usar'],
    [['🎧'], 'aparece quando dá para pegar o fone da reunião'],
    [['pinça'], 'aproximar e afastar a câmera'],
  ]],
  ['Menus', [
    [['☰'], 'abre este menu com tudo o que dá para fazer'],
    [['×'], 'fecha a folha aberta'],
  ]],
];

export function createHelpSheet(shell) {
  const sheet = createSheet(shell, {
    id: 'hud-help-sheet',
    title: 'Como jogar',
    subtitle: '',
    onOpen: (body) => {
      const touch = isTouchDevice();
      sheet.setHeader(
        'Como jogar',
        touch ? 'Gestos e botões deste aparelho' : 'Teclas e atalhos',
      );
      const root = document.createElement('div');
      root.className = 'hud-keys';
      for (const [title, rows] of (touch ? TOUCH : KEYBOARD)) {
        const section = document.createElement('section');
        const heading = document.createElement('h3');
        heading.textContent = title;
        const definitions = document.createElement('dl');
        for (const [keys, description] of rows) {
          const term = document.createElement('dt');
          for (const key of keys) {
            const kbd = document.createElement('kbd');
            kbd.textContent = key;
            term.append(kbd);
          }
          const detail = document.createElement('dd');
          detail.textContent = description;
          definitions.append(term, detail);
        }
        section.append(heading, definitions);
        root.append(section);
      }
      body.replaceChildren(root);
    },
  });
  return sheet;
}
