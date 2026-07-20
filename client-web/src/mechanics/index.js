// Ponto único de registro. Importe novos módulos de mecânica aqui.
import './ChessMechanic.js'; // registra a mecânica 'chess' (efeito colateral)

export {
  MechanicsRegistry,
  createMechanicsRuntime,
  mapMechanicEntities,
  mechanicsRegistry,
  preloadMechanics,
  registerMechanic,
} from './MechanicsRegistry.js';
