import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COFFEE_MAX_LIFETIME_MS,
  COFFEE_MAX_SIPS,
  COFFEE_SIP_MS,
  createCoffeeLifecycle,
  updateCoffeeLifecycle,
} from '../src/CoffeeLifecycle.js';

test('café termina depois dos goles enquanto o avatar está sentado', () => {
  const coffee = createCoffeeLifecycle(100);
  assert.equal(updateCoffeeLifecycle(coffee, 100, true), null);
  for (let sip = 1; sip <= COFFEE_MAX_SIPS; sip += 1) {
    const result = updateCoffeeLifecycle(coffee, 100 + sip * COFFEE_SIP_MS, true);
    assert.equal(result, sip === COFFEE_MAX_SIPS ? 'finished' : null);
  }
});

test('xícara expira mesmo quando o avatar nunca senta', () => {
  const coffee = createCoffeeLifecycle(500);
  assert.equal(updateCoffeeLifecycle(coffee, 500, false), null);
  assert.equal(
    updateCoffeeLifecycle(coffee, 500 + COFFEE_MAX_LIFETIME_MS, false),
    'expired',
  );
});
