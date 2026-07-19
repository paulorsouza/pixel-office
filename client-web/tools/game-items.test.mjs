import assert from 'node:assert/strict';
import test from 'node:test';
import { placementToFurniture } from '../src/GameItemsSystem.js';

test('converte uma colocação persistida em móvel renderizável sem perder identidade', () => {
  assert.deepEqual(placementToFurniture({
    id: 42,
    itemInstanceId: 9,
    userId: 1,
    instanceKey: 'abc123',
    x: 7.5,
    y: 8,
    flipX: true,
    definition: { catalogKey: 'of_176', interactionType: 'chest' },
  }), {
    id: 'of_176',
    x: 7.5,
    y: 8,
    flipX: true,
    placementId: 42,
    inventoryItemId: 9,
    ownerId: 1,
    interactionType: 'chest',
    instanceKey: 'abc123',
    owned: true,
  });
});

test('não adiciona flipX falso ao objeto de mapa', () => {
  const furniture = placementToFurniture({
    id: 1,
    itemInstanceId: 2,
    userId: 3,
    instanceKey: 'instance',
    x: 4,
    y: 5,
    flipX: false,
    definition: { catalogKey: 'of_171', interactionType: 'kanban' },
  });
  assert.equal(Object.hasOwn(furniture, 'flipX'), false);
});
