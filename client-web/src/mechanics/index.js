// Ponto único de registro. Importe novos módulos de mecânica aqui.
import './ChessMechanic.js'; // registra a mecânica 'chess' (efeito colateral)
import './VerticalAccessMechanic.js?v=2'; // elevador/escadas preparados para mapas de outros andares

export {
  MechanicsRegistry,
  createMechanicsRuntime,
  mapMechanicEntities,
  mechanicsRegistry,
  preloadMechanics,
  registerMechanic,
} from './MechanicsRegistry.js';
