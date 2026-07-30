// Ponto único de registro. Importe novos módulos de mecânica aqui.
import './ChessMechanic.js'; // registra a mecânica 'chess' (efeito colateral)
import './VerticalAccessMechanic.js?v=2'; // elevador/escadas preparados para mapas de outros andares
import './ArrangeDiceTableMechanic.js'; // mesa de cassino orientada a dados
import './CasinoGameMechanics.js'; // Nerd Slots, Blackjack e Liga Pokémon

export {
  MechanicsRegistry,
  createMechanicsRuntime,
  mapMechanicEntities,
  mechanicsRegistry,
  preloadMechanics,
  registerMechanic,
} from './MechanicsRegistry.js';
