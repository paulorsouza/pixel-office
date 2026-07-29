// Personagem e Itens como seções do menu.
//
// A marcação das duas telas continua no `index.html` e continua sendo operada
// pelo `EquipmentSystem`/`CharacterSystem` — o que este módulo faz é MOVER esses
// nós para dentro da janela do menu quando a seção abre, e devolvê-los ao
// esconderijo quando fecha. Mover em vez de recriar não é economia de linhas: é
// o que preserva todos os listeners que aqueles módulos já registraram nos
// próprios elementos.

const SECTIONS = [
  {
    id: 'character',
    icon: '🙂',
    label: 'Personagem',
    title: 'Personagem',
    subtitle: 'Aparência do avatar — a mudança aparece no mundo na hora',
    view: '#character-panel-view',
    tab: 'character',
  },
  {
    id: 'items',
    icon: '🎒',
    label: 'Itens',
    title: 'Equipamentos e baú',
    subtitle: 'Monte seu conjunto · 1-4 troca de veículo, 0 guarda',
    view: '#equipment-panel-view',
    tab: 'equipment',
  },
];

export function createGearSections({ menu, equipmentMenu, characterCustomizer }) {
  // Onde os nós moram quando o menu está fechado. Já existe no index.html e
  // segue escondido; serve de estacionamento, não de janela.
  const parking = document.querySelector('#equipment-menu');

  for (const section of SECTIONS) {
    menu.register({
      id: section.id,
      group: 'player',
      icon: section.icon,
      label: section.label,
      title: section.title,
      subtitle: section.subtitle,
      render(host) {
        const view = document.querySelector(section.view);
        // Rede de segurança: se alguém esvaziar a janela sem passar pelo
        // `onClose`, o nó fica solto e a seção abriria vazia — melhor falhar
        // alto do que mostrar uma tela em branco sem explicação.
        if (!view) {
          host.textContent = 'Não foi possível montar esta seção.';
          console.warn(`[menu] a view ${section.view} sumiu do documento`);
          return;
        }
        // `hidden` era como as duas abas se alternavam dentro da janela antiga;
        // no menu cada uma é uma seção, então a que está na tela nunca é hidden.
        characterCustomizer.setTab(section.tab);
        view.hidden = false;
        host.replaceChildren(view);
        equipmentMenu.setOpen(true);
      },
      onClose() {
        const view = document.querySelector(section.view);
        if (view && parking) parking.append(view);
        equipmentMenu.setOpen(false);
      },
    });
  }
}
