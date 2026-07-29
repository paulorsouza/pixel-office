// Registro extensível de mecânicas declaradas nos mapas.
// O renderer conhece somente transformações visuais; comportamento vive em handlers.

const finite = (value) => Number.isFinite(Number(value));

function value(entity, key, fallback) {
  if (Object.hasOwn(entity, key)) return entity[key];
  if (Object.hasOwn(entity.properties || {}, key)) return entity.properties[key];
  return fallback;
}

function entityLabel(entity) {
  return entity.id || entity.name || `${entity.type || 'mecânica'} sem ID`;
}

export class MechanicsRegistry {
  constructor() {
    this.handlers = new Map();
  }

  register(type, handler) {
    if (!type || typeof type !== 'string') throw new Error('Mecânica precisa de um tipo textual');
    if (!handler || typeof handler.create !== 'function') {
      throw new Error(`Mecânica ${type} precisa implementar create()`);
    }
    if (this.handlers.has(type)) throw new Error(`Mecânica já registrada: ${type}`);
    this.handlers.set(type, handler);
    return this;
  }

  has(type) {
    return this.handlers.has(type);
  }

  get(type) {
    return this.handlers.get(type) || null;
  }

  types() {
    return [...this.handlers.keys()];
  }
}

export const mechanicsRegistry = new MechanicsRegistry();

export function registerMechanic(type, handler) {
  mechanicsRegistry.register(type, handler);
}

export function mapMechanicEntities(map) {
  const entities = [...(map.entities || [])];
  for (const [index, collision] of (map.collisions || []).entries()) {
    entities.push({
      ...collision,
      id: collision.id || `legacy-collision-${index + 1}`,
      type: 'collision',
      source: 'legacy',
    });
  }
  for (const portal of (map.portals || [])) {
    entities.push({ ...portal, type: 'portal', source: 'legacy' });
  }
  return entities;
}

export function preloadMechanics(scene, map, registry = mechanicsRegistry) {
  const seen = new Set();
  for (const entity of mapMechanicEntities(map)) {
    if (seen.has(entity.type)) continue;
    seen.add(entity.type);
    registry.get(entity.type)?.preload?.({ scene, entity, map });
  }
}

export function createMechanicsRuntime(scene, map, context = {}, registry = mechanicsRegistry) {
  const instances = [];
  const diagnostics = [];

  for (const entity of mapMechanicEntities(map)) {
    if (entity.visible === false || value(entity, 'enabled', true) === false) continue;
    const handler = registry.get(entity.type);
    if (!handler) {
      const message = `Mecânica não registrada: ${entity.type} (${entityLabel(entity)})`;
      diagnostics.push({ level: 'warning', entity, message });
      console.warn(message);
      continue;
    }

    try {
      handler.validate?.(entity, map);
      const created = handler.create({ scene, map, entity, context }) || {};
      instances.push({ type: entity.type, entity, handler, ...created });
    } catch (error) {
      const message = `${entityLabel(entity)}: ${error.message}`;
      diagnostics.push({ level: 'error', entity, message });
      console.error(`Erro ao criar mecânica ${entity.type}: ${message}`);
    }
  }

  const runtime = {
    instances,
    diagnostics,
    portals: instances.map((instance) => instance.portal).filter(Boolean),
    interactions: instances.map((instance) => instance.interaction).filter(Boolean),
    activeInteraction(player) {
      if (!player) return null;
      return this.interactions
        .map((interaction) => ({
          interaction,
          distance: Math.hypot(player.x - interaction.x, player.y - interaction.y),
        }))
        .filter((candidate) => candidate.distance <= candidate.interaction.radius)
        .sort((a, b) => (
          (b.interaction.priority || 0) - (a.interaction.priority || 0)
          || a.distance - b.distance
        ))[0]?.interaction || null;
    },
    async interact(player) {
      const active = this.activeInteraction(player);
      if (!active) return false;
      return (await active.interact?.()) !== false;
    },
    update(time, delta) {
      for (const instance of instances) instance.update?.(time, delta);
    },
    destroy() {
      for (const instance of [...instances].reverse()) instance.destroy?.();
      instances.length = 0;
    },
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => runtime.destroy());
  return runtime;
}

mechanicsRegistry.register('collision', {
  validate(entity) {
    for (const key of ['x', 'y', 'w', 'h']) {
      if (!finite(value(entity, key))) throw new Error(`propriedade ${key} inválida`);
    }
    if (Number(value(entity, 'w')) <= 0 || Number(value(entity, 'h')) <= 0) {
      throw new Error('a colisão precisa ter largura e altura maiores que zero');
    }
  },
  create({ scene, map, entity, context }) {
    const tile = map.tile || 16;
    const zone = scene.add.zone(
      Number(value(entity, 'x')) * tile,
      Number(value(entity, 'y')) * tile,
      Number(value(entity, 'w')) * tile,
      Number(value(entity, 'h')) * tile,
    ).setOrigin(0, 0);
    scene.physics.add.existing(zone, true);
    context.solids?.add(zone);
    return {
      body: zone,
      destroy: () => {
        if (zone.active) zone.destroy();
      },
    };
  },
});

mechanicsRegistry.register('portal', {
  validate(entity) {
    for (const key of ['x', 'y', 'w', 'h']) {
      if (!finite(value(entity, key))) throw new Error(`propriedade ${key} inválida`);
    }
    if (!value(entity, 'targetScene')) throw new Error('targetScene é obrigatório');
  },
  create({ entity }) {
    return {
      portal: {
        id: entity.id || entity.name,
        x: Number(value(entity, 'x')),
        y: Number(value(entity, 'y')),
        w: Number(value(entity, 'w')),
        h: Number(value(entity, 'h')),
        targetScene: value(entity, 'targetScene'),
        targetSpawn: value(entity, 'targetSpawn'),
        targetWing: Number(value(entity, 'targetWing', 0)),
        wingDelta: Number(value(entity, 'wingDelta', 0)),
        label: value(entity, 'label'),
      },
    };
  },
});
