// Loader direto Tiled -> contrato do MapRenderer.
// Não escreve arquivos intermediários: TMJ, TSJ e templates são resolvidos no navegador.

const HORIZONTAL_FLIP = 0x80000000;
const VERTICAL_FLIP = 0x40000000;
const DIAGONAL_FLIP = 0x20000000;
const GID_MASK = 0x0fffffff;
const PREVIEW_ROLES = new Set(['previewFloors', 'previewHedges', 'previewWalls']);
const BUILTIN_TYPES = new Set([
  'building', 'yard', 'zone', 'room', 'door', 'path', 'hedge', 'collision',
  'detail', 'prop', 'furniture', 'spawn', 'portal', 'camera',
]);
const LAYER_TYPE = {
  details: 'detail',
  props: 'prop',
  furniture: 'furniture',
  collisions: 'collision',
  navigation: 'portal',
};

const cleanNumber = (value) => {
  const rounded = Math.round(Number(value) * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
};

function propertyMap(value) {
  return Object.fromEntries((value?.properties || []).map((property) => (
    [property.name, property.value]
  )));
}

function parseExtra(properties) {
  if (!properties.extraJson) return {};
  try {
    return JSON.parse(properties.extraJson);
  } catch (error) {
    throw new Error(`extraJson inválido: ${error.message}`);
  }
}

function optional(target, key, value, source) {
  if (Object.hasOwn(source, key)) target[key] = value;
}

function appendUnique(values, value) {
  if (value && !values.includes(value)) values.push(value);
}

function mergeProperties(base = [], overrides = []) {
  const merged = new Map(base.map((property) => [property.name, property]));
  for (const property of overrides) merged.set(property.name, property);
  return [...merged.values()];
}

function slug(value) {
  return value
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function resolveUrl(reference, baseUrl) {
  return new URL(reference, baseUrl).href;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Não foi possível carregar ${url}`);
  return response.json();
}

function textureKey(catalog, tile) {
  const properties = propertyMap(tile);
  if (properties.assetId) return properties.assetId;
  return `tiled-${slug(new URL(catalog.url).pathname.split('/').at(-1))}-${tile.id}`;
}

function objectOrigins(alignment) {
  const value = alignment || 'unspecified';
  const originX = value.includes('left') || value === 'unspecified' ? 0
    : value.includes('right') ? 1 : 0.5;
  const originY = value.includes('top') ? 0
    : value.includes('bottom') || value === 'unspecified' ? 1 : 0.5;
  return { originX, originY };
}

async function loadTilesets(tiled, mapUrl, readJson) {
  const catalogs = [];
  for (const reference of tiled.tilesets || []) {
    const url = reference.source ? resolveUrl(reference.source, mapUrl) : mapUrl;
    const data = reference.source ? await readJson(url) : reference;
    const byId = new Map((data.tiles || []).map((tile) => [tile.id, tile]));
    const name = data.name || reference.name || new URL(url).pathname.split('/').at(-1);
    const catalog = {
      firstgid: reference.firstgid || 1,
      url,
      data,
      byId,
      name,
      objectAlignment: data.objectalignment,
    };
    if (data.image) {
      const imageUrl = resolveUrl(data.image, url);
      const isRoomBuilder = /room_builder\.png$/i.test(new URL(imageUrl).pathname);
      catalog.sheet = {
        key: isRoomBuilder ? 'tiles' : `tiled-sheet-${slug(name)}`,
        url: imageUrl,
        type: 'spritesheet',
        frameWidth: data.tilewidth,
        frameHeight: data.tileheight,
        margin: data.margin || 0,
        spacing: data.spacing || 0,
      };
    }
    catalogs.push(catalog);
  }
  return catalogs.sort((a, b) => a.firstgid - b.firstgid);
}

function resolveGid(catalogs, rawGid) {
  const unsigned = rawGid >>> 0;
  const gid = unsigned & GID_MASK;
  const catalog = [...catalogs].reverse().find((candidate) => gid >= candidate.firstgid);
  if (!catalog) throw new Error(`GID desconhecido: ${rawGid}`);
  const localId = gid - catalog.firstgid;
  const tile = catalog.byId.get(localId);
  const properties = propertyMap(tile);
  let texture;
  let frame;
  let descriptor;
  if (catalog.sheet) {
    texture = catalog.sheet.key;
    frame = localId;
    descriptor = catalog.sheet;
  } else {
    if (!tile?.image) throw new Error(`Tile ${localId} não existe no tileset ${catalog.name}`);
    texture = textureKey(catalog, tile);
    descriptor = {
      key: texture,
      url: resolveUrl(tile.image, catalog.url),
      type: 'image',
    };
  }
  return {
    texture,
    frame,
    descriptor,
    assetId: properties.assetId || texture,
    category: properties.category || tile?.type || tile?.class || '',
    width: tile?.imagewidth || catalog.data.tilewidth,
    height: tile?.imageheight || catalog.data.tileheight,
    ...objectOrigins(catalog.objectAlignment),
    flipX: Boolean(unsigned & HORIZONTAL_FLIP),
    flipY: Boolean(unsigned & VERTICAL_FLIP),
    diagonal: Boolean(unsigned & DIAGONAL_FLIP),
  };
}

function allTileLayers(tiled) {
  const result = [];
  let order = 0;
  const visit = (layers) => {
    for (const layer of layers || []) {
      if (layer.type === 'tilelayer') result.push({ layer, order: order++ });
      if (layer.type === 'group') visit(layer.layers);
    }
  };
  visit(tiled.layers);
  return result;
}

async function resolveTemplateObject(object, mapUrl, readJson) {
  if (!object.template) return object;
  const url = resolveUrl(object.template, mapUrl);
  const template = await readJson(url);
  if (template.type !== 'template' || !template.object) {
    throw new Error(`Template Tiled inválido: ${url}`);
  }
  return {
    ...template.object,
    ...object,
    properties: mergeProperties(template.object.properties, object.properties),
  };
}

async function allObjectRecords(tiled, mapUrl, readJson) {
  const result = [];
  const visit = async (layers) => {
    for (const layer of layers || []) {
      if (layer.type === 'objectgroup') {
        const role = propertyMap(layer).oqRole || layer.name;
        for (const source of layer.objects || []) {
          result.push({ object: await resolveTemplateObject(source, mapUrl, readJson), layer: role });
        }
      }
      if (layer.type === 'group') await visit(layer.layers);
    }
  };
  await visit(tiled.layers);
  return result;
}

export function tiledContentCameraBounds(tiled, objectAssets = [], paddingTiles = 2) {
  const tile = tiled.tilewidth || 16;
  const baseRight = (tiled.width || 0) * tile;
  const baseBottom = (tiled.height || 0) * (tiled.tileheight || tile);
  let minX = 0;
  let minY = 0;
  let maxX = baseRight;
  let maxY = baseBottom;

  const include = (left, top, right, bottom) => {
    if (![left, top, right, bottom].every(Number.isFinite)) return;
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
  };

  for (const entry of objectAssets) {
    const object = entry.object || entry;
    const asset = entry.asset;
    if (!object || object.visible === false) continue;
    if (asset) {
      const width = asset.width || object.width || tile;
      const height = asset.height || object.height || tile;
      const originX = asset.originX ?? 0.5;
      const originY = asset.originY ?? 1;
      include(
        object.x - width * originX,
        object.y - height * originY,
        object.x + width * (1 - originX),
        object.y + height * (1 - originY),
      );
      continue;
    }
    const width = object.width || 0;
    const height = object.height || 0;
    include(object.x, object.y, object.x + width, object.y + height);
  }

  const padding = Math.max(0, Number(paddingTiles) || 0) * tile;
  if (minX < 0) minX -= padding;
  if (minY < 0) minY -= padding;
  if (maxX > baseRight) maxX += padding;
  if (maxY > baseBottom) maxY += padding;
  return {
    x: cleanNumber(minX / tile),
    y: cleanNumber(minY / tile),
    w: cleanNumber((maxX - minX) / tile),
    h: cleanNumber((maxY - minY) / tile),
  };
}

function visualLayersFromTiled(tiled, catalogs, usedTextures) {
  return allTileLayers(tiled)
    .filter(({ layer }) => !PREVIEW_ROLES.has(propertyMap(layer).oqRole))
    .map(({ layer, order }) => {
      const properties = propertyMap(layer);
      const tiles = [];
      const readData = (data, width, startX = 0, startY = 0) => {
        for (let index = 0; index < (data || []).length; index += 1) {
          const rawGid = data[index];
          if (!rawGid) continue;
          const resolved = resolveGid(catalogs, rawGid);
          if (resolved.diagonal) {
            throw new Error(`A camada ${layer.name} usa rotação diagonal ainda não suportada`);
          }
          usedTextures.set(resolved.descriptor.key, resolved.descriptor);
          tiles.push({
            x: startX + (index % width),
            y: startY + Math.floor(index / width),
            texture: resolved.texture,
            ...(resolved.frame !== undefined ? { frame: resolved.frame } : {}),
            ...(resolved.flipX ? { flipX: true } : {}),
            ...(resolved.flipY ? { flipY: true } : {}),
            category: resolved.category,
          });
        }
      };
      if (layer.chunks) {
        for (const chunk of layer.chunks) readData(chunk.data, chunk.width, chunk.x, chunk.y);
      } else {
        readData(layer.data, layer.width || tiled.width);
      }
      if (properties.editorOnly && tiles.length === 0) return null;
      const custom = Object.fromEntries(Object.entries(properties).filter(([key]) => (
        !['oqRole', 'id', 'depth', 'editorOnly'].includes(key)
      )));
      const result = {
        id: properties.id || layer.name,
        name: layer.name,
        width: layer.width || tiled.width,
        height: layer.height || tiled.height,
        depth: properties.depth ?? (-85 + order / 1000),
        tiles: tiles.map(({ category, ...cell }) => cell),
      };
      if (layer.x) result.x = layer.x;
      if (layer.y) result.y = layer.y;
      if (layer.offsetx) result.offsetX = layer.offsetx;
      if (layer.offsety) result.offsetY = layer.offsety;
      if (layer.opacity !== undefined && layer.opacity !== 1) result.opacity = layer.opacity;
      if (layer.visible === false) result.visible = false;
      if (Object.keys(custom).length) result.properties = custom;
      return result;
    })
    .filter(Boolean);
}

const objectType = (object) => object.type || object.class || '';
const rectFromObject = (object, tile) => ({
  x: cleanNumber(object.x / tile),
  y: cleanNumber(object.y / tile),
  w: cleanNumber(object.width / tile),
  h: cleanNumber(object.height / tile),
});

function resolvedObjectAsset(object, properties, catalogs, usedTextures) {
  if (!object.gid) return null;
  const resolved = resolveGid(catalogs, object.gid);
  usedTextures.set(resolved.descriptor.key, resolved.descriptor);
  return {
    ...resolved,
    texture: properties.assetId || resolved.assetId || resolved.texture,
  };
}

function doorFromObject(object, parent, tile) {
  const properties = propertyMap(object);
  if (!parent) throw new Error(`Porta ${object.name || object.id} aponta para parent inexistente`);
  const side = properties.side;
  const horizontal = side === 'N' || side === 'S';
  if (!['N', 'S', 'E', 'W'].includes(side)) throw new Error(`Porta com side inválido: ${side}`);
  const result = {
    ...parseExtra(properties),
    side,
    at: cleanNumber(horizontal ? object.x / tile - parent.x : object.y / tile - parent.y),
    len: cleanNumber(horizontal ? object.width / tile : object.height / tile),
  };
  for (const key of ['texture', 'frame', 'flipX', 'depth']) optional(result, key, properties[key], properties);
  return result;
}

export async function loadTiledMap(mapReference, options = {}) {
  const readJson = options.fetchJson || fetchJson;
  const baseUrl = options.baseUrl || globalThis.document?.baseURI || globalThis.location?.href;
  if (!baseUrl && !/^[a-z]+:/i.test(mapReference)) throw new Error('baseUrl ausente para o mapa Tiled');
  const mapUrl = new URL(mapReference, baseUrl).href;
  const tiled = await readJson(mapUrl);
  if (tiled.type !== 'map') throw new Error(`Arquivo não é um mapa Tiled: ${mapUrl}`);
  const mapProperties = propertyMap(tiled);
  const tile = tiled.tilewidth || 16;
  const catalogs = await loadTilesets(tiled, mapUrl, readJson);
  const usedTextures = new Map();
  const records = await allObjectRecords(tiled, mapUrl, readJson);
  const resolvedByObject = new Map(records.map(({ object }) => (
    [object, resolvedObjectAsset(object, propertyMap(object), catalogs, usedTextures)]
  )));
  const effectiveType = (record) => {
    const explicit = objectType(record.object);
    if (explicit) return explicit;
    return resolvedByObject.get(record.object)?.category || LAYER_TYPE[record.layer] || '';
  };
  const byType = (type) => records.filter((record) => effectiveType(record) === type);
  const visualLayers = visualLayersFromTiled(tiled, catalogs, usedTextures);

  const structureFrom = (record, kind) => {
    if (!record) return undefined;
    const properties = propertyMap(record.object);
    const result = { ...parseExtra(properties), ...rectFromObject(record.object, tile) };
    if (kind === 'building') optional(result, 'floor', properties.floor, properties);
    if (kind === 'yard') optional(result, 'ground', properties.ground, properties);
    return result;
  };
  const building = structureFrom(byType('building')[0], 'building');
  const yard = structureFrom(byType('yard')[0], 'yard');
  const areaFrom = (record) => {
    const properties = propertyMap(record.object);
    const result = {
      ...parseExtra(properties),
      id: properties.id || record.object.name,
      name: record.object.name || properties.id,
      ...rectFromObject(record.object, tile),
    };
    optional(result, 'floor', properties.floor, properties);
    return result;
  };
  const zones = byType('zone').map(areaFrom);
  const rooms = byType('room').map(areaFrom);
  for (const record of byType('door')) {
    const properties = propertyMap(record.object);
    const parent = properties.parent === 'building'
      ? building
      : rooms.find((room) => room.id === properties.parent);
    const door = doorFromObject(record.object, parent, tile);
    parent.doors ||= [];
    parent.doors.push(door);
  }

  const rectList = (type) => byType(type).map((record) => ({
    ...parseExtra(propertyMap(record.object)),
    ...rectFromObject(record.object, tile),
  }));
  const paths = byType('path').map((record) => {
    const properties = propertyMap(record.object);
    const result = { ...parseExtra(properties), ...rectFromObject(record.object, tile) };
    optional(result, 'floor', properties.floor, properties);
    return result;
  });
  const hedges = rectList('hedge');
  const collisions = rectList('collision');

  const details = byType('detail').map((record) => {
    const object = record.object;
    const properties = propertyMap(object);
    const asset = resolvedByObject.get(object);
    if (!asset) throw new Error(`Detalhe ${object.name || object.id} não possui imagem`);
    const result = {
      ...parseExtra(properties),
      x: cleanNumber(object.x / tile - 0.5),
      y: cleanNumber(object.y / tile - 1),
    };
    if (asset.texture !== 'grass_detail') result.texture = asset.texture;
    if (asset.frame !== undefined) result.frame = asset.frame;
    if (asset.flipX) result.flipX = true;
    if (asset.flipY) result.flipY = true;
    optional(result, 'alpha', properties.alpha, properties);
    return result;
  });

  const props = byType('prop').map((record) => {
    const object = record.object;
    const properties = propertyMap(object);
    const asset = resolvedByObject.get(object);
    if (!asset) throw new Error(`Prop ${object.name || object.id} não possui imagem`);
    const offsetX = properties.offsetX || 0;
    const offsetY = properties.offsetY || 0;
    const result = {
      ...parseExtra(properties),
      texture: asset.texture,
      x: cleanNumber((object.x - offsetX) / tile),
      y: cleanNumber((object.y - offsetY) / tile),
    };
    if (asset.frame !== undefined) result.frame = asset.frame;
    for (const key of ['originX', 'originY', 'offsetX', 'offsetY', 'depth']) {
      optional(result, key, properties[key], properties);
    }
    if (!Object.hasOwn(properties, 'originX') && asset.originX !== 0.5) result.originX = asset.originX;
    if (!Object.hasOwn(properties, 'originY') && asset.originY !== 1) result.originY = asset.originY;
    if (asset.flipX || Object.hasOwn(properties, 'flipX')) {
      result.flipX = Object.hasOwn(properties, 'flipX') ? Boolean(properties.flipX) : asset.flipX;
    }
    if (asset.flipY || Object.hasOwn(properties, 'flipY')) {
      result.flipY = Object.hasOwn(properties, 'flipY') ? Boolean(properties.flipY) : asset.flipY;
    }
    if (Object.hasOwn(properties, 'collisionW') && Object.hasOwn(properties, 'collisionH')) {
      result.collision = {
        x: properties.collisionX || 0,
        y: properties.collisionY || 0,
        w: properties.collisionW,
        h: properties.collisionH,
      };
    }
    return result;
  });

  const furniture = byType('furniture').map((record) => {
    const object = record.object;
    const properties = propertyMap(object);
    const asset = resolvedByObject.get(object);
    if (!asset) throw new Error(`Móvel ${object.name || object.id} não possui imagem`);
    const offsetX = properties.offsetX || 0;
    const offsetY = properties.offsetY || 0;
    const result = {
      ...parseExtra(properties),
      id: asset.texture,
      x: cleanNumber((object.x - offsetX) / tile - 0.5),
      y: cleanNumber((object.y - offsetY) / tile - 1),
    };
    if (asset.frame !== undefined) result.frame = asset.frame;
    // `interactionType` deixa um móvel do cenário interagir sem existir no inventário;
    // `seatX/seatY/seatDir` dizem onde e para que lado o avatar senta nele
    for (const key of [
      'offsetX', 'offsetY', 'originX', 'originY', 'depth', 'solid',
      'interactionType', 'interactionKey', 'seatX', 'seatY', 'seatDir', 'seatPose', 'seatCover',
    ]) {
      optional(result, key, properties[key], properties);
    }
    if (!Object.hasOwn(properties, 'originX') && asset.originX !== 0.5) result.originX = asset.originX;
    if (!Object.hasOwn(properties, 'originY') && asset.originY !== 1) result.originY = asset.originY;
    if (asset.flipX || Object.hasOwn(properties, 'flipX')) {
      result.flipX = Object.hasOwn(properties, 'flipX') ? Boolean(properties.flipX) : asset.flipX;
    }
    if (asset.flipY || Object.hasOwn(properties, 'flipY')) {
      result.flipY = Object.hasOwn(properties, 'flipY') ? Boolean(properties.flipY) : asset.flipY;
    }
    if (Object.hasOwn(properties, 'collisionW') && Object.hasOwn(properties, 'collisionH')) {
      result.collision = {
        x: properties.collisionX || 0,
        y: properties.collisionY || 0,
        w: properties.collisionW,
        h: properties.collisionH,
      };
    }
    return result;
  });

  const spawns = Object.fromEntries(byType('spawn').map((record) => {
    const properties = propertyMap(record.object);
    const id = properties.id || record.object.name;
    return [id, {
      ...parseExtra(properties),
      x: cleanNumber(record.object.x / tile - 0.5),
      y: cleanNumber(record.object.y / tile),
    }];
  }));
  const portals = byType('portal').map((record) => {
    const properties = propertyMap(record.object);
    const result = {
      ...parseExtra(properties),
      id: properties.id || record.object.name,
      ...rectFromObject(record.object, tile),
      targetScene: properties.targetScene,
    };
    optional(result, 'targetSpawn', properties.targetSpawn, properties);
    optional(result, 'label', properties.label, properties);
    return result;
  });

  const camera = {};
  for (const [property, key] of [
    ['cameraZoom', 'zoom'], ['cameraMinZoom', 'minZoom'], ['cameraMaxZoom', 'maxZoom'],
  ]) {
    if (Object.hasOwn(mapProperties, property)) camera[key] = mapProperties[property];
  }
  const cameraRecord = byType('camera')[0];
  if (cameraRecord) camera.bounds = rectFromObject(cameraRecord.object, tile);
  else if (mapProperties.kind === 'world' && mapProperties.cameraAutoBounds !== false) {
    camera.bounds = tiledContentCameraBounds(
      tiled,
      records.map(({ object }) => ({ object, asset: resolvedByObject.get(object) })),
      mapProperties.cameraPadding ?? 2,
    );
  }

  const entities = records
    .filter((record) => {
      const type = effectiveType(record);
      return type && !BUILTIN_TYPES.has(type);
    })
    .map((record) => {
      const object = record.object;
      const properties = propertyMap(object);
      const type = effectiveType(record);
      const asset = resolvedByObject.get(object);
      const custom = {
        ...parseExtra(properties),
        ...Object.fromEntries(Object.entries(properties).filter(([key]) => (
          !['id', 'assetId', 'extraJson', 'oqSourceLayer'].includes(key)
        ))),
      };
      const result = {
        id: properties.id || object.name || `${type}-${object.id}`,
        type,
        x: cleanNumber(object.x / tile),
        y: cleanNumber(object.y / tile),
        layer: properties.oqSourceLayer || record.layer,
      };
      if (object.name && object.name !== result.id) result.name = object.name;
      if (asset) {
        result.x = cleanNumber(object.x / tile - 0.5);
        result.y = cleanNumber(object.y / tile - 1);
        result.w = cleanNumber(object.width / tile);
        result.h = cleanNumber(object.height / tile);
        result.shape = 'tile';
        result.assetId = asset.texture;
        if (asset.frame !== undefined) result.frame = asset.frame;
        if (asset.flipX) result.flipX = true;
      } else if (object.point) result.shape = 'point';
      else {
        result.w = cleanNumber(object.width / tile);
        result.h = cleanNumber(object.height / tile);
        if (object.ellipse) result.shape = 'ellipse';
        if (object.polygon) {
          result.shape = 'polygon';
          result.points = object.polygon.map((point) => ({
            x: cleanNumber(point.x / tile),
            y: cleanNumber(point.y / tile),
          }));
        }
      }
      if (object.rotation) result.rotation = object.rotation;
      if (object.visible === false) result.visible = false;
      if (Object.keys(custom).length) result.properties = custom;
      return result;
    });

  let previousAssets = [];
  try {
    previousAssets = JSON.parse(mapProperties.assetsJson || '[]');
  } catch (error) {
    throw new Error(`assetsJson inválido: ${error.message}`);
  }
  const requiredAssets = [];
  for (const detail of details) appendUnique(requiredAssets, detail.texture || 'grass_detail');
  for (const prop of props) appendUnique(requiredAssets, prop.texture);
  for (const item of furniture) appendUnique(requiredAssets, item.id);
  for (const layer of visualLayers) {
    for (const cell of layer.tiles) {
      if (cell.texture !== 'tiles' && !['grass', 'wood', 'carpet', 'cream', 'sage', 'water'].includes(cell.texture)) {
        appendUnique(requiredAssets, cell.texture);
      }
    }
  }
  for (const door of [building, ...rooms].flatMap((parent) => parent?.doors || [])) {
    appendUnique(requiredAssets, door.texture);
  }
  for (const entity of entities) appendUnique(requiredAssets, entity.assetId);
  const requiredSet = new Set(requiredAssets);
  const assets = previousAssets.filter((asset) => requiredSet.has(asset));
  for (const asset of requiredAssets) appendUnique(assets, asset);

  const result = {
    ...parseExtra(mapProperties),
    id: mapProperties.id,
    name: mapProperties.name,
    subtitle: mapProperties.subtitle,
    kind: mapProperties.kind,
    tile,
    w: tiled.width,
    h: tiled.height,
    tiledSource: mapUrl,
    tiledTextures: [...usedTextures.values()],
  };
  if (Object.keys(camera).length) result.camera = camera;
  for (const key of ['background', 'visualMode']) optional(result, key, mapProperties[key], mapProperties);
  if (mapProperties.kind === 'world') result.ground = mapProperties.ground || 'grass';
  if (yard) result.yard = yard;
  if (assets.length) result.assets = assets;
  if (building) result.building = building;
  if (Object.keys(spawns).length) result.spawns = spawns;
  if (zones.length) result.zones = zones;
  if (rooms.length) result.rooms = rooms;
  if (furniture.length) result.furniture = furniture;
  if (details.length) result.details = details;
  if (paths.length) result.paths = paths;
  if (hedges.length) result.hedges = hedges;
  if (props.length) result.props = props;
  if (collisions.length) result.collisions = collisions;
  if (portals.length) result.portals = portals;
  if (entities.length) result.entities = entities;
  if (visualLayers.length) result.visualLayers = visualLayers;
  return result;
}

export function validateSceneMaps(sceneMaps) {
  for (const [sceneId, map] of Object.entries(sceneMaps)) {
    if (!map.id || !map.kind || !map.w || !map.h) throw new Error(`Mapa incompleto: ${sceneId}`);
    if (map.id !== sceneId) {
      throw new Error(`ID do mapa (${map.id}) difere do manifesto (${sceneId})`);
    }
    if (!map.spawns?.default) throw new Error(`Cena ${sceneId} não possui spawn default`);
    for (const portal of map.portals || []) {
      const targetSceneId = String(portal.targetScene || '').split('@', 1)[0];
      const target = sceneMaps[targetSceneId];
      if (!target) throw new Error(`Portal ${portal.id} aponta para cena inexistente: ${portal.targetScene}`);
      if (portal.targetSpawn && !target.spawns?.[portal.targetSpawn]) {
        throw new Error(`Portal ${portal.id} aponta para spawn inexistente: ${portal.targetScene}.${portal.targetSpawn}`);
      }
    }
  }
  return sceneMaps;
}

export async function loadTiledSceneMaps(manifest, options = {}) {
  if (!Array.isArray(manifest?.scenes) || manifest.scenes.length === 0) {
    throw new Error('Manifesto não possui cenas');
  }
  const sceneIds = new Set();
  for (const scene of manifest.scenes || []) {
    if (!scene.id || !scene.file) throw new Error('Cena sem id ou arquivo no manifesto');
    if (sceneIds.has(scene.id)) throw new Error(`Cena duplicada no manifesto: ${scene.id}`);
    sceneIds.add(scene.id);
  }
  const maps = Object.fromEntries(await Promise.all(manifest.scenes.map(async (scene) => (
    [scene.id, await loadTiledMap(scene.file, options)]
  ))));
  if (!maps[manifest.startScene]) {
    throw new Error(`Cena inicial inexistente no manifesto: ${manifest.startScene}`);
  }
  return validateSceneMaps(maps);
}
