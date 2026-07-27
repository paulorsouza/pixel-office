import { auth, resolveApiBase } from './auth.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

export function placementToFurniture(placement) {
  return {
    id: placement.definition.catalogKey,
    x: placement.x,
    y: placement.y,
    ...(placement.flipX ? { flipX: true } : {}),
    placementId: placement.id,
    inventoryItemId: placement.itemInstanceId,
    ownerId: placement.userId,
    interactionType: placement.definition.interactionType || '',
    instanceKey: placement.instanceKey,
    owned: true,
  };
}

export function createGameItemsClient(options = {}) {
  const query = new URLSearchParams(location.search);
  const apiBase = options.apiBase ? String(options.apiBase).replace(/\/$/, '') : resolveApiBase();
  // Com token, a identidade vem do JWT; sem token (dev), do ?userId= ou default 1.
  const userId = Number(options.userId || auth.userId() || query.get('userId') || query.get('user') || 1);
  const events = new EventTarget();
  let inventory = [];
  let connection = null;
  let room = null;
  let online = false;
  let personalDirectory = null;

  async function request(path, init = {}) {
    const token = await auth.token();
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        // Bearer quando autenticado; X-User-Id continua como fallback de dev.
        ...(token ? { Authorization: `Bearer ${token}` } : { 'X-User-Id': String(userId) }),
        ...(init.headers || {}),
      },
    });
    if (!response.ok) {
      let message = `Erro ${response.status}`;
      try {
        const body = await response.json();
        message = body.error || message;
      } catch { /* resposta sem JSON */ }
      throw new Error(message);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  function emit(type, detail = {}) {
    events.dispatchEvent(new CustomEvent(type, { detail }));
  }

  async function refreshInventory() {
    inventory = await request('/api/game/inventory');
    online = true;
    emit('inventory', { inventory: clone(inventory) });
    return clone(inventory);
  }

  async function connectRealtime() {
    if (!window.signalR || connection) return;
    connection = new window.signalR.HubConnectionBuilder()
      .withUrl(`${apiBase}/hub/office`, {
        withCredentials: false,
        accessTokenFactory: () => auth.token(),
      })
      .withAutomaticReconnect()
      .build();
    for (const eventName of ['FurniturePlaced', 'FurnitureMoved', 'FurnitureRemoved']) {
      connection.on(eventName, (payload) => emit(eventName, payload));
    }
    connection.on('InventoryChanged', () => refreshInventory().catch(() => {}));
    connection.on('ChestChanged', (payload) => emit('ChestChanged', payload));
    connection.on('WorkSessionChanged', (payload) => emit('WorkSessionChanged', payload));
    connection.onreconnected(() => {
      if (room) connection.invoke('JoinGame', userId, room.sceneId, room.roomId).catch(() => {});
      refreshInventory().catch(() => {});
    });
    try {
      await connection.start();
    } catch (error) {
      console.warn('SignalR de itens indisponível; a API continua funcional.', error);
      connection = null;
    }
  }

  return {
    apiBase,
    userId,
    events,
    isOnline: () => online,
    async initialize() {
      try {
        personalDirectory = await request('/api/game/personal-rooms');
        await refreshInventory();
        await connectRealtime();
      } catch (error) {
        online = false;
        emit('offline', { error });
        console.warn('Inventário persistente indisponível.', error);
      }
    },
    inventory: () => clone(inventory),
    personalRooms: () => clone(personalDirectory),
    currentPersonalRoom: () => clone(personalDirectory?.current || null),
    ownedEquipmentIds() {
      return [...new Set(inventory
        .filter((item) => item.definition.itemType === 'vehicle' || item.definition.itemType === 'equipment')
        .map((item) => item.definition.catalogKey.replace(/^equipment:/, '')))];
    },
    ownsEquipment(equipmentId) {
      return this.ownedEquipmentIds().includes(equipmentId);
    },
    available(catalogKey) {
      return inventory.filter((item) => (
        item.location === 'inventory' && item.definition.catalogKey === catalogKey
      ));
    },
    count(catalogKey) {
      return this.available(catalogKey).length;
    },
    async refreshInventory() {
      return refreshInventory();
    },
    async refreshPersonalRooms() {
      personalDirectory = await request('/api/game/personal-rooms');
      return clone(personalDirectory);
    },
    async purchase(catalogKey) {
      const result = await request(`/api/game/catalog/${encodeURIComponent(catalogKey)}/purchase`, {
        method: 'POST', body: '{}',
      });
      await refreshInventory();
      return result;
    },
    async storeCatalog() {
      return request('/api/game/catalog');
    },
    async joinRoom(sceneId, roomId) {
      if (connection && room) {
        await connection.invoke('LeaveGameRoom', room.sceneId, room.roomId).catch(() => {});
      }
      room = { sceneId, roomId };
      if (connection) await connection.invoke('JoinGame', userId, sceneId, roomId).catch(() => {});
      return request(`/api/game/rooms/${encodeURIComponent(sceneId)}/${encodeURIComponent(roomId)}/furniture`);
    },
    async sceneFurniture(sceneId) {
      return request(`/api/game/scenes/${encodeURIComponent(sceneId)}/furniture`);
    },
    async place(catalogKey, sceneId, roomId, x, y, flipX = false) {
      const instance = this.available(catalogKey)[0];
      if (!instance) throw new Error('Você não possui outra unidade deste móvel');
      const placement = await request('/api/game/furniture', {
        method: 'POST',
        body: JSON.stringify({ inventoryItemId: instance.id, sceneId, roomId, x, y, flipX }),
      });
      await refreshInventory();
      return placement;
    },
    async move(placementId, x, y, flipX = false) {
      return request(`/api/game/furniture/${placementId}`, {
        method: 'PATCH', body: JSON.stringify({ x, y, flipX }),
      });
    },
    async remove(placementId) {
      await request(`/api/game/furniture/${placementId}`, { method: 'DELETE' });
      await refreshInventory();
    },
    async chest(placementId) {
      return request(`/api/game/chests/${placementId}`);
    },
    async transferChest(placementId, inventoryItemId, action) {
      await request(`/api/game/chests/${placementId}/${action}`, {
        method: 'POST', body: JSON.stringify({ inventoryItemId }),
      });
      await refreshInventory();
    },
    async workItems() {
      return request('/api/workitems');
    },
    async setActiveTask(workItemId) {
      return request('/api/me/active-task', {
        method: 'POST', body: JSON.stringify({ workItemId }),
      });
    },
    async startWork(target, workItemId) {
      const path = Number.isInteger(Number(target))
        ? `/api/game/workstations/${target}/start`
        : `/api/game/workstations/scenery/${encodeURIComponent(target)}/start`;
      return request(path, {
        method: 'POST', body: JSON.stringify({ workItemId }),
      });
    },
    async stopWork() {
      return request('/api/game/workstations/stop', { method: 'POST', body: '{}' });
    },
    async hoursSummary(days = 14) {
      return request(`/api/reports/summary?days=${Math.max(1, Math.min(90, Number(days) || 14))}`);
    },
  };
}
