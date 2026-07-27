export const COFFEE_SIP_MS = 2600;
export const COFFEE_MAX_SIPS = 5;
export const COFFEE_MAX_LIFETIME_MS = 20000;

export function createCoffeeLifecycle(now) {
  return {
    goles: 0,
    proximoGoleEm: 0,
    expiraEm: now + COFFEE_MAX_LIFETIME_MS,
  };
}

export function updateCoffeeLifecycle(cafe, now, seated) {
  if (now >= cafe.expiraEm) return cafe.goles ? 'finished' : 'expired';
  if (!seated) {
    cafe.proximoGoleEm = 0;
    return null;
  }
  if (!cafe.proximoGoleEm) {
    cafe.proximoGoleEm = now + COFFEE_SIP_MS;
    return null;
  }
  if (now < cafe.proximoGoleEm) return null;
  cafe.goles += 1;
  cafe.proximoGoleEm = now + COFFEE_SIP_MS;
  return cafe.goles >= COFFEE_MAX_SIPS ? 'finished' : null;
}
