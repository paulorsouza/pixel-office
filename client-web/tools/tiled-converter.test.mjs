import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

import {
  CLIENT_ROOT,
  FIRST_GID,
  generateTilesets,
  runtimeToTiled,
  tiledToRuntime,
} from './tiled-converter.mjs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const manifest = readJson(resolve(CLIENT_ROOT, 'maps/scenes.json'));

test('todos os PNGs referenciados pelos tilesets existem', () => {
  generateTilesets();
  const tilesetPaths = [
    'surfaces.tsj',
    'room-builder.tsj',
    'world-assets.tsj',
    'office-furniture.tsj',
  ].map((file) => resolve(CLIENT_ROOT, 'tiled/tilesets', file));
  for (const tilesetPath of tilesetPaths) {
    const tileset = readJson(tilesetPath);
    if (tileset.image) assert.ok(existsSync(resolve(dirname(tilesetPath), tileset.image)));
    for (const tile of tileset.tiles || []) {
      assert.ok(existsSync(resolve(dirname(tilesetPath), tile.image)), tile.image);
    }
  }
});

for (const scene of manifest.scenes) {
  test(`round-trip preserva ${scene.id}`, () => {
    const catalogs = generateTilesets();
    const original = readJson(resolve(CLIENT_ROOT, 'maps', scene.file));
    const tiled = runtimeToTiled(original, catalogs, scene.file);
    const restored = tiledToRuntime(tiled, catalogs);
    assert.deepEqual(restored, original);
  });
}

test('objeto novo herdado da paleta vira móvel e preserva flip', () => {
  const catalogs = generateTilesets();
  const original = readJson(resolve(CLIENT_ROOT, 'maps/world.json'));
  const tiled = runtimeToTiled(original, catalogs, 'world.json');
  const asset = catalogs.furniture.byAsset.get('of_1');
  const layer = tiled.layers.find((candidate) => (
    candidate.properties?.some((item) => item.name === 'oqRole' && item.value === 'furniture')
  ));
  layer.objects.push({
    gid: ((FIRST_GID.furniture + asset.localId) | 0x80000000) >>> 0,
    height: asset.height,
    id: tiled.nextobjectid++,
    name: '',
    opacity: 1,
    rotation: 0,
    type: '',
    visible: true,
    width: asset.width,
    x: 8 * 16 + 8,
    y: 8 * 16 + 16,
  });
  const restored = tiledToRuntime(tiled, catalogs);
  assert.deepEqual(restored.furniture.at(-1), { id: 'of_1', x: 8, y: 8, flipX: true });
  assert.ok(restored.assets.includes('of_1'));
});
