// Renderer de cenas orientado a dados.
// Cada JSON descreve um mundo ou interior, seus spawns e portais.

const F = (c, r) => r * 16 + c;

const WALL = {
  TL: F(7, 1), TOP: F(8, 1), TR: F(9, 1),
  L: F(7, 2), R: F(9, 2),
  BL: F(7, 3), BOT: F(8, 3), BR: F(9, 3),
};

const wallFace = (row) => ({
  cap: F(1, row),
  face: F(1, row + 1),
});

const NORTH_WALL = {
  white: wallFace(11),
  stone: wallFace(7),
  brick: wallFace(9),
  lavender: wallFace(5),
};

export const FLOORS = {
  wood: 'floor_wood',
  gray: 'floor_carpet',
  carpet: 'floor_carpet',
  light: 'floor_cream',
  cream: 'floor_cream',
  terra: 'floor_sage',
  sage: 'floor_sage',
  water: 'floor_water',
};

function floorTexture(name) {
  return FLOORS[name] || FLOORS.light;
}

function addSolidRect(scene, solids, rect, tile) {
  const zone = scene.add.zone(
    rect.x * tile,
    rect.y * tile,
    rect.w * tile,
    rect.h * tile,
  ).setOrigin(0, 0);
  scene.physics.add.existing(zone, true);
  solids.add(zone);
  return zone;
}

function fillFloor(scene, rect, tile, depth) {
  return scene.add.tileSprite(
    rect.x * tile,
    rect.y * tile,
    rect.w * tile,
    rect.h * tile,
    floorTexture(rect.floor),
  ).setOrigin(0, 0).setDepth(depth);
}

function addLabel(scene, rect, tile, subtle = false) {
  if (!rect.name) return;
  const labelY = subtle ? rect.y + 0.45 : rect.y + 1.15;
  scene.add.text(
    (rect.x + rect.w / 2) * tile,
    labelY * tile,
    rect.name,
    {
      fontFamily: 'system-ui, sans-serif',
      fontStyle: 'bold',
      fontSize: '7px',
      color: subtle ? '#59617a' : '#252a3b',
      backgroundColor: subtle ? '#ffffff88' : '#ffffffe0',
      padding: { x: 3, y: 1 },
    },
  ).setOrigin(0.5, 0)
    .setDepth(subtle ? rect.y * tile + 4 : (rect.y + 2) * tile + 8)
    .setResolution(3);
}

function drawWalls(scene, rect, tile, solids) {
  const right = rect.x + rect.w - 1;
  const bottom = rect.y + rect.h - 1;
  const northWall = NORTH_WALL[rect.wallStyle] || NORTH_WALL.white;
  const doors = new Set();

  for (const door of (rect.doors || [])) {
    const length = door.len || 2;
    for (let i = 0; i < length; i++) {
      if (door.side === 'N') {
        doors.add(`${rect.x + door.at + i},${rect.y}`);
        doors.add(`${rect.x + door.at + i},${rect.y + 1}`);
      } else if (door.side === 'S') {
        doors.add(`${rect.x + door.at + i},${bottom}`);
        if (rect.southWall3d) doors.add(`${rect.x + door.at + i},${bottom - 1}`);
      } else if (door.side === 'W') {
        doors.add(`${rect.x},${rect.y + door.at + i}`);
      } else {
        doors.add(`${right},${rect.y + door.at + i}`);
      }
    }
  }

  const put = (x, y, frame) => {
    if (doors.has(`${x},${y}`)) return;

    scene.add.image(
      x * tile + tile / 2,
      y * tile + tile / 2,
      'tiles',
      frame,
    ).setDepth(y * tile + tile);
    addSolidRect(scene, solids, { x, y, w: 1, h: 1 }, tile);
  };

  const hasNorthFace = bottom > rect.y + 2;
  put(rect.x, rect.y, WALL.TL);
  put(right, rect.y, WALL.TR);
  if (!rect.southWall3d) {
    put(rect.x, bottom, WALL.BL);
    put(right, bottom, WALL.BR);
  }

  for (let x = rect.x + 1; x < right; x++) {
    put(x, rect.y, hasNorthFace ? northWall.cap : WALL.TOP);
    if (hasNorthFace) put(x, rect.y + 1, northWall.face);
    if (rect.southWall3d) {
      put(x, bottom - 1, northWall.cap);
      put(x, bottom, northWall.face);
    } else {
      put(x, bottom, WALL.BOT);
    }
  }
  const sideEnd = rect.southWall3d ? bottom + 1 : bottom;
  for (let y = rect.y + 1; y < sideEnd; y++) {
    put(rect.x, y, WALL.L);
    put(right, y, WALL.R);
  }
}

function doorCollision(rect, door) {
  const right = rect.x + rect.w - 1;
  const bottom = rect.y + rect.h - 1;
  const length = door.len || 2;

  if (door.side === 'S') {
    return { x: rect.x + door.at, y: bottom, w: length, h: 1 };
  }
  if (door.side === 'N') {
    return { x: rect.x + door.at, y: rect.y, w: length, h: 1 };
  }
  if (door.side === 'W') {
    return { x: rect.x, y: rect.y + door.at, w: 1, h: length };
  }
  return { x: right, y: rect.y + door.at, w: 1, h: length };
}

function drawDoorFixtures(scene, rect, tile, solids) {
  const right = rect.x + rect.w - 1;
  const bottom = rect.y + rect.h - 1;

  for (const door of (rect.doors || [])) {
    if (!door.texture || !scene.textures.exists(door.texture)) continue;

    const length = door.len || 3;
    let x;
    let y;
    let originX = 0.5;
    let originY = 1;

    if (door.side === 'S') {
      x = (rect.x + door.at + length / 2) * tile;
      y = (bottom + 1) * tile;
    } else if (door.side === 'N') {
      x = (rect.x + door.at + length / 2) * tile;
      y = (rect.y + 2) * tile;
      originY = 1;
    } else if (door.side === 'W') {
      x = (rect.x + 1) * tile;
      y = (rect.y + door.at + length / 2) * tile;
      originX = 0.5;
    } else {
      x = right * tile;
      y = (rect.y + door.at + length / 2) * tile;
      originX = 0.5;
    }

    const animated = door.automatic ? scene.animatedAssets?.[door.texture] : null;
    const fixture = animated
      ? scene.add.sprite(x, y, door.texture, animated.start ?? 0)
      : scene.add.image(x, y, door.texture, door.frame ?? 8);
    fixture
      .setOrigin(originX, originY)
      .setFlipX(Boolean(door.flipX))
      .setDepth(door.depth ?? y - 1);

    if (animated) {
      const collision = doorCollision(rect, door);
      const blocker = addSolidRect(scene, solids, collision, tile);
      scene.automaticDoors ||= [];
      scene.automaticDoors.push({
        sprite: fixture,
        blocker,
        animation: animated.animation,
        state: 'closed',
        sensorX: (collision.x + collision.w / 2) * tile,
        sensorY: (collision.y + collision.h / 2) * tile,
        openRadius: (door.openRadius ?? 3) * tile,
        closeRadius: (door.closeRadius ?? 4.25) * tile,
      });
    }
  }
}

export function updateAutomaticDoors(scene, player) {
  const playerX = player.body.center.x;
  const playerY = player.body.center.y;

  for (const door of (scene.automaticDoors || [])) {
    const distance = Phaser.Math.Distance.Between(
      playerX,
      playerY,
      door.sensorX,
      door.sensorY,
    );

    if (distance <= door.openRadius && (door.state === 'closed' || door.state === 'closing')) {
      door.state = 'opening';
      door.blocker.body.enable = false;
      door.sprite.play(door.animation);
      door.sprite.once('animationcomplete', () => {
        if (door.state === 'opening') door.state = 'open';
      });
    } else if (distance >= door.closeRadius && (door.state === 'open' || door.state === 'opening')) {
      door.state = 'closing';
      door.sprite.playReverse(door.animation);
      door.sprite.once('animationcomplete', () => {
        if (door.state !== 'closing') return;
        door.state = 'closed';
        door.blocker.body.enable = true;
      });
    }
  }
}

export function furnitureCollision(item) {
  return item.collision || (item.solid ? {
    x: -0.45,
    y: 0.15,
    w: 1.9,
    h: 0.7,
  } : null);
}

function removeFurnitureCollider(record) {
  if (!record.collider) return;
  record.solids.remove(record.collider, true, true);
  record.collider = null;
}

function createFurnitureCollider(record) {
  const collision = furnitureCollision(record.item);
  if (!collision) return null;
  return addSolidRect(record.scene, record.solids, {
    x: record.item.x + (collision.x || 0),
    y: record.item.y + (collision.y || 0),
    w: collision.w,
    h: collision.h,
  }, record.tile);
}

export function updateFurnitureObject(record, refreshCollision = false) {
  const { item, display, tile } = record;
  const x = item.x * tile + tile / 2 + (item.offsetX || 0);
  const y = item.y * tile + tile + (item.offsetY || 0);
  display
    .setPosition(x, y)
    .setOrigin(item.originX ?? 0.5, item.originY ?? 1)
    .setFlipX(Boolean(item.flipX))
    .setDepth(item.depth ?? y);
  if (refreshCollision) {
    removeFurnitureCollider(record);
    record.collider = createFurnitureCollider(record);
  }
  return record;
}

export function createFurnitureObject(scene, item, tile, solids) {
  const animated = scene.animatedAssets?.[item.id];
  const display = animated
    ? scene.add.sprite(0, 0, item.id)
    : scene.add.image(0, 0, item.id);
  const record = {
    scene,
    item,
    tile,
    solids,
    display,
    collider: null,
  };
  if (animated) display.play(animated.animation);
  updateFurnitureObject(record, true);
  scene.furnitureObjects ||= [];
  scene.furnitureObjects.push(record);
  return record;
}

export function destroyFurnitureObject(record) {
  removeFurnitureCollider(record);
  record.display.destroy();
  const objects = record.scene.furnitureObjects || [];
  record.scene.furnitureObjects = objects.filter((candidate) => candidate !== record);
}

function renderFurniture(scene, map, tile, solids) {
  scene.furnitureObjects = [];
  for (const item of (map.furniture || [])) createFurnitureObject(scene, item, tile, solids);
}

function drawHedge(scene, rect, tile) {
  const horizontal = rect.w >= rect.h;
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const texture = horizontal && y === 0 ? 'hedge_top' : 'hedge_fill';
      const py = (rect.y + y) * tile + tile / 2;
      scene.add.image(
        (rect.x + x) * tile + tile / 2,
        py,
        texture,
      ).setDepth(py);
    }
  }
}

function fillGround(scene, rect, tile, texture) {
  scene.add.tileSprite(
    rect.x * tile,
    rect.y * tile,
    rect.w * tile,
    rect.h * tile,
    texture,
  ).setOrigin(0, 0).setDepth(-100);
}

function renderLandscape(scene, map, solids, groundRect) {
  const tile = map.tile || 16;
  fillGround(scene, groundRect, tile, groundRect.ground || map.ground || 'grass');

  for (const detail of (map.details || [])) {
    scene.add.image(
      detail.x * tile + tile / 2,
      detail.y * tile + tile / 2,
      detail.texture || 'grass_detail',
    ).setDepth(-95).setAlpha(detail.alpha ?? 0.9);
  }

  for (const path of (map.paths || [])) fillFloor(scene, path, tile, -90);

  for (const hedge of (map.hedges || [])) {
    drawHedge(scene, hedge, tile);
    addSolidRect(scene, solids, hedge, tile);
  }

  for (const prop of (map.props || [])) {
    const x = prop.x * tile + (prop.offsetX || 0);
    const y = prop.y * tile + (prop.offsetY || 0);
    scene.add.image(x, y, prop.texture)
      .setOrigin(prop.originX ?? 0.5, prop.originY ?? 1)
      .setFlipX(Boolean(prop.flipX))
      .setDepth(prop.depth ?? y);

    if (prop.collision) {
      addSolidRect(scene, solids, {
        x: prop.x + (prop.collision.x || 0),
        y: prop.y + (prop.collision.y || 0),
        w: prop.collision.w,
        h: prop.collision.h,
      }, tile);
    }
  }

  for (const collision of (map.collisions || [])) {
    addSolidRect(scene, solids, collision, tile);
  }
}

function renderInterior(scene, map, solids) {
  const tile = map.tile || 16;

  if (map.yard) renderLandscape(scene, map, solids, map.yard);
  if (map.building) fillFloor(scene, map.building, tile, -100);

  for (const zone of (map.zones || [])) {
    fillFloor(scene, zone, tile, -90);
    scene.add.rectangle(
      zone.x * tile,
      zone.y * tile,
      zone.w * tile,
      zone.h * tile,
    ).setOrigin(0, 0).setStrokeStyle(1, 0xffffff, 0.2).setDepth(-89);
    addLabel(scene, zone, tile, true);
  }
  for (const room of (map.rooms || [])) {
    fillFloor(scene, room, tile, -90);
  }

  if (map.building) drawWalls(scene, map.building, tile, solids);
  for (const room of (map.rooms || [])) {
    drawWalls(scene, room, tile, solids);
    addLabel(scene, room, tile, false);
  }

  if (map.building) drawDoorFixtures(scene, map.building, tile, solids);
  for (const room of (map.rooms || [])) {
    drawDoorFixtures(scene, room, tile, solids);
  }

  renderFurniture(scene, map, tile, solids);
}

function renderWorld(scene, map, solids) {
  renderLandscape(scene, map, solids, {
    x: 0,
    y: 0,
    w: map.w,
    h: map.h,
    ground: map.ground,
  });

}

export function renderScene(scene, map, solids) {
  scene.automaticDoors = [];
  if (map.kind === 'world') renderWorld(scene, map, solids);
  else renderInterior(scene, map, solids);

  return {
    spawns: map.spawns || { default: map.spawn || { x: 10, y: 10 } },
    portals: map.portals || [],
  };
}
