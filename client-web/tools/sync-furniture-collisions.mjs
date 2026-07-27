import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mapsDir = path.join(clientRoot, 'tiled/maps');
const catalog = JSON.parse(
  fs.readFileSync(path.join(clientRoot, 'assets/furniture/catalog.json'), 'utf8'),
);
const collisionByAsset = new Map(catalog.items.map((item) => [item.id, item.collision || null]));
for (const id of ['station_white_dual', 'station_white_pc', 'station_dark_dual']) {
  collisionByAsset.set(id, { x: -0.5, y: 0.1, w: 2, h: 0.8 });
}

const collisionNames = new Set(['collisionX', 'collisionY', 'collisionW', 'collisionH']);
const propertyMap = (object) => new Map(
  (object.properties || []).map((property) => [property.name, property.value]),
);
const property = (name, value) => ({
  name,
  type: Number.isInteger(value) ? 'int' : 'float',
  value,
});

let changedMaps = 0;
let changedObjects = 0;
for (const entry of fs.readdirSync(mapsDir, { withFileTypes: true })) {
  if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.tmj') continue;
  const file = path.join(mapsDir, entry.name);
  const map = JSON.parse(fs.readFileSync(file, 'utf8'));
  let mapChanged = false;

  for (const layer of map.layers || []) {
    if (layer.type !== 'objectgroup') continue;
    for (const object of layer.objects || []) {
      const values = propertyMap(object);
      const assetId = values.get('assetId');
      if (!collisionByAsset.has(assetId)) continue;
      const collision = collisionByAsset.get(assetId);
      const before = JSON.stringify((object.properties || [])
        .filter((item) => collisionNames.has(item.name)));
      object.properties = (object.properties || [])
        .filter((item) => !collisionNames.has(item.name));
      if (collision) {
        object.properties.push(
          property('collisionX', collision.x),
          property('collisionY', collision.y),
          property('collisionW', collision.w),
          property('collisionH', collision.h),
        );
      }
      const after = JSON.stringify(object.properties.filter((item) => collisionNames.has(item.name)));
      if (before !== after) {
        mapChanged = true;
        changedObjects += 1;
      }
    }
  }

  if (mapChanged) {
    fs.writeFileSync(file, `${JSON.stringify(map, null, 2)}\n`);
    changedMaps += 1;
  }
}

console.log(JSON.stringify({ changedMaps, changedObjects }, null, 2));
