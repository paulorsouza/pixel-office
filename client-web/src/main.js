// Office Quest — runtime de cenas Phaser orientado a dados.
import { renderScene, updateAutomaticDoors } from './MapRenderer.js';
import {
  createEquipmentMenu,
  createEquipmentVisual,
  movementProfile,
  riderAnimationSpec,
} from './EquipmentSystem.js';
import {
  createCharacterCustomizer,
  createCharacterVisual,
  preloadCharacterAssets,
} from './CharacterSystem.js';
import {
  createRoomDecorationEditor,
  createRoomDecorationStore,
  preloadRoomDecorationAssets,
} from './RoomDecorationSystem.js';
import { preloadMechanics } from './mechanics/index.js';
import { createDevMapSync } from './DevMapSync.js';
import { loadTiledSceneMaps } from './TiledRuntimeLoader.js';
import { createGameItemsClient } from './GameItemsSystem.js';
import { createFurnitureInteractionSystem } from './FurnitureInteractionSystem.js';

const DIR = { right: 0, up: 6, left: 12, down: 18 };

const worldAssetPath = (asset) => `assets/world/${asset}.png`;

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Não foi possível carregar ${path}`);
  return response.json();
}

function showBootstrapMapError(error) {
  const root = document.createElement('div');
  root.id = 'map-load-error';
  root.innerHTML = '<strong>Não foi possível abrir o mapa do Tiled</strong><span></span>';
  root.querySelector('span').textContent = error?.message || String(error);
  document.body.append(root);
}

const manifest = await fetchJson('maps/scenes.json');
const animatedAssets = await fetchJson('assets/animations/catalog.json');
const equipmentCatalog = await fetchJson('assets/equipment/catalog.json');
const characterCatalog = await fetchJson('assets/character/catalog.json');
const furnitureCatalog = await fetchJson('assets/furniture/catalog.json');
const gameItems = createGameItemsClient();
await gameItems.initialize();
const vehicleEquipment = equipmentCatalog.items.filter((item) => item.slot === 'vehicle');
let sceneMaps;
try {
  sceneMaps = await loadTiledSceneMaps(manifest);
} catch (error) {
  showBootstrapMapError(error);
  throw error;
}
let roomDecorationEditor = null;
const decorationStore = createRoomDecorationStore(sceneMaps, furnitureCatalog);
const equipmentMenu = createEquipmentMenu(equipmentCatalog, {
  isBlocked: () => roomDecorationEditor?.isOpen() || false,
});
const characterCustomizer = createCharacterCustomizer(characterCatalog);
const query = new URLSearchParams(location.search);
const requestedScene = query.get('scene') || location.hash.replace(/^#/, '');
const initialScene = sceneMaps[requestedScene] ? requestedScene : manifest.startScene;
const initialSpawn = query.get('spawn') || 'default';
const equipmentPreview = vehicleEquipment.find(
  (item) => item.id === query.get('equipmentPreview'),
) || null;
const requestedEquipmentDirection = query.get('equipmentDirection');
const interactionPreview = query.get('interactionPreview');
const equipmentPreviewDirection = Object.hasOwn(DIR, requestedEquipmentDirection)
  ? requestedEquipmentDirection
  : null;
createDevMapSync(() => window.__scene?.currentSceneId);

function loadImageOnce(scene, key, path) {
  if (!scene.textures.exists(key)) scene.load.image(key, path);
}

function updateSceneHud(map) {
  document.querySelector('#scene-name').textContent = map.name;
  document.querySelector('#scene-subtitle').textContent = map.subtitle || '';
}

function showPortalPrompt(portal) {
  const prompt = document.querySelector('#portal-prompt');
  prompt.classList.toggle('on', Boolean(portal));
  prompt.querySelector('span').textContent = portal?.label || '';
}

class MapScene extends Phaser.Scene {
  constructor() {
    super('map-runtime');
  }

  init(data = {}) {
    this.currentSceneId = data.sceneId || initialScene;
    this.spawnId = data.spawnId || initialSpawn;
    // O Tiled fornece a estrutura/base; móveis do jogador chegam separadamente pela API.
    this.map = JSON.parse(JSON.stringify(sceneMaps[this.currentSceneId]));
    if (!this.map) throw new Error(`Cena desconhecida: ${this.currentSceneId}`);
  }

  preload() {
    preloadCharacterAssets(this, characterCatalog);
    preloadRoomDecorationAssets(this, furnitureCatalog);
    preloadMechanics(this, this.map);
    if (!this.textures.exists('tiles')) {
      this.load.spritesheet('tiles', 'assets/tiles/room_builder.png', {
        frameWidth: 16,
        frameHeight: 16,
      });
    }
    if (!this.textures.exists('adam_run')) {
      this.load.spritesheet('adam_run', 'assets/chars/Adam_run.png', {
        frameWidth: 16,
        frameHeight: 32,
      });
    }
    if (!this.textures.exists('adam_idle')) {
      this.load.spritesheet('adam_idle', 'assets/chars/Adam_idle_anim.png', {
        frameWidth: 16,
        frameHeight: 32,
      });
    }
    if (!this.textures.exists('adam_sit')) {
      const seatedRider = vehicleEquipment.find((item) => item.riderSheet === 'adam_sit');
      this.load.spritesheet('adam_sit', 'assets/chars/Adam_sit.png', {
        frameWidth: seatedRider?.riderFrameWidth || 32,
        frameHeight: 32,
      });
    }

    for (const floor of ['wood', 'carpet', 'cream', 'sage', 'water']) {
      loadImageOnce(this, `floor_${floor}`, `assets/floors/floor_${floor}.png`);
    }
    loadImageOnce(this, 'grass', worldAssetPath('grass'));

    const directTiledKeys = new Set();
    for (const descriptor of (this.map.tiledTextures || [])) {
      if (
        descriptor.key === 'tiles'
        || descriptor.key === 'office_door'
        || animatedAssets[descriptor.key]
      ) continue;
      if (this.textures.exists(descriptor.key)) {
        directTiledKeys.add(descriptor.key);
        continue;
      }
      if (descriptor.type === 'spritesheet') {
        this.load.spritesheet(descriptor.key, descriptor.url, {
          frameWidth: descriptor.frameWidth,
          frameHeight: descriptor.frameHeight,
          margin: descriptor.margin || 0,
          spacing: descriptor.spacing || 0,
        });
      } else {
        this.load.image(descriptor.key, descriptor.url);
      }
      directTiledKeys.add(descriptor.key);
    }

    for (const asset of (this.map.assets || [])) {
      if (directTiledKeys.has(asset)) continue;
      const animated = animatedAssets[asset];
      if (animated) {
        if (!this.textures.exists(asset)) {
          this.load.spritesheet(asset, animated.path, {
            frameWidth: animated.frameWidth,
            frameHeight: animated.frameHeight,
          });
        }
        continue;
      }
      if (asset === 'office_door') {
        if (!this.textures.exists(asset)) {
          this.load.spritesheet(asset, worldAssetPath(asset), {
            frameWidth: 48,
            frameHeight: 32,
          });
        }
        continue;
      }
      const path = asset.startsWith('of_')
        ? `assets/furniture/office/${asset}.png`
        : worldAssetPath(asset);
      loadImageOnce(this, asset, path);
    }
  }

  create() {
    const tile = this.map.tile || 16;
    updateSceneHud(this.map);
    showPortalPrompt(null);
    history.replaceState(null, '', `${location.pathname}#${this.currentSceneId}`);

    const hasOutdoorArea = this.map.kind === 'world' || Boolean(this.map.yard);
    this.cameras.main.setBackgroundColor(
      this.map.background || (hasOutdoorArea ? '#5c8f3e' : '#20222c'),
    );
    this.solids = this.physics.add.staticGroup();
    this.animatedAssets = animatedAssets;
    for (const asset of (this.map.assets || [])) {
      const animated = animatedAssets[asset];
      if (!animated || this.anims.exists(animated.animation)) continue;
      this.anims.create({
        key: animated.animation,
        frames: this.anims.generateFrameNumbers(asset, {
          start: animated.start,
          end: animated.end,
        }),
        frameRate: animated.frameRate,
        repeat: animated.repeat,
      });
    }
    const { spawns, portals, mechanics } = renderScene(this, this.map, this.solids);
    this.portals = portals;
    this.mechanicsRuntime = mechanics;

    const spawn = spawns[this.spawnId] || spawns.default || Object.values(spawns)[0];
    this.player = this.physics.add.sprite(
      spawn.x * tile + tile / 2,
      spawn.y * tile,
      'adam_idle',
      DIR.down,
    );
    this.player.body.setSize(10, 8).setOffset(3, 22);
    this.playerBodyOffsetX = 3;
    this.setPlayerBodyFrameWidth = (frameWidth) => {
      const offsetX = Math.round((frameWidth - 10) / 2);
      if (offsetX === this.playerBodyOffsetX) return;
      this.player.body.setSize(10, 8).setOffset(offsetX, 22);
      this.playerBodyOffsetX = offsetX;
    };
    this.physics.add.collider(this.player, this.solids);
    this.characterVisual = createCharacterVisual(
      this,
      characterCatalog,
      characterCustomizer,
      this.player,
    );

    if (query.get('debug') === 'collisions') {
      this.physics.world.createDebugGraphic();
      this.physics.world.drawDebug = true;
    }

    const createAnimation = (key, sheet, start, end, frameRate) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(sheet, { start, end }),
        frameRate,
        repeat: -1,
      });
    };
    for (const [direction, start] of Object.entries(DIR)) {
      createAnimation(`run-${direction}`, 'adam_run', start, start + 5, 12);
      createAnimation(`idle-${direction}`, 'adam_idle', start, start + 5, 5);
      for (const equipment of vehicleEquipment) {
        const animationSpec = riderAnimationSpec(equipment, direction, start);
        createAnimation(
          `equipment-${equipment.id}-${direction}`,
          animationSpec.sheet,
          animationSpec.start,
          animationSpec.end,
          animationSpec.frameRate,
        );
      }
    }

    this.moveKeys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.interactKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.equipmentVisual = createEquipmentVisual(this);
    this.handleInteract = async () => {
      if (this.furnitureInteractions && await this.furnitureInteractions.interact()) return;
      if (
        this.activePortal
        && !this.transitioning
        && !this.roomDecorationEditor?.isOpen()
        && this.time.now >= this.interactionUnlockAt
      ) {
        this.changeScene(this.activePortal);
      }
    };
    this.interactKey.on('down', this.handleInteract);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.interactKey.off('down', this.handleInteract);
    });
    this.lastDirection = equipmentPreviewDirection || 'down';
    this.activePortal = null;
    this.transitioning = false;
    this.interactionUnlockAt = this.time.now + 450;

    const camera = this.cameras.main;
    const cameraBounds = this.map.camera?.bounds || {
      x: 0,
      y: 0,
      w: this.map.w,
      h: this.map.h,
    };
    const cameraBoundsPx = {
      x: cameraBounds.x * tile,
      y: cameraBounds.y * tile,
      w: cameraBounds.w * tile,
      h: cameraBounds.h * tile,
    };
    camera.setBounds(
      cameraBoundsPx.x,
      cameraBoundsPx.y,
      cameraBoundsPx.w,
      cameraBoundsPx.h,
    );
    camera.startFollow(this.player, true, 0.12, 0.12);
    this.zoom = this.map.camera?.zoom || 2.2;
    this.applyCameraZoom = (requestedZoom) => {
      const overviewZoom = Math.min(
        this.scale.gameSize.width / cameraBoundsPx.w,
        this.scale.gameSize.height / cameraBoundsPx.h,
      );
      const minZoom = Math.max(this.map.camera?.minZoom || 0.75, overviewZoom);
      const maxZoom = Math.max(this.map.camera?.maxZoom || 4, minZoom);
      this.zoom = Phaser.Math.Clamp(requestedZoom, minZoom, maxZoom);
      camera.setZoom(this.zoom);
      const visibleWidth = this.scale.gameSize.width / this.zoom;
      const visibleHeight = this.scale.gameSize.height / this.zoom;
      const horizontalMargin = Math.max(0, (visibleWidth - cameraBoundsPx.w) / 2);
      const verticalMargin = Math.max(0, (visibleHeight - cameraBoundsPx.h) / 2);
      camera.setBounds(
        cameraBoundsPx.x - horizontalMargin,
        cameraBoundsPx.y - verticalMargin,
        cameraBoundsPx.w + horizontalMargin * 2,
        cameraBoundsPx.h + verticalMargin * 2,
      );
    };
    this.applyCameraZoom(this.zoom);
    camera.roundPixels = true;
    camera.fadeIn(220, 20, 22, 30);

    this.input.on('wheel', (_pointer, _objects, _dx, dy) => {
      this.applyCameraZoom(this.zoom - dy * 0.0015);
    });

    this.handleResize = () => this.applyCameraZoom(this.zoom);
    this.scale.on('resize', this.handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize);
    });

    this.roomDecorationEditor = createRoomDecorationEditor(
      this,
      this.map,
      furnitureCatalog,
      decorationStore,
      equipmentMenu,
      gameItems,
    );
    roomDecorationEditor = this.roomDecorationEditor;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (roomDecorationEditor === this.roomDecorationEditor) roomDecorationEditor = null;
    });
    const debugRoom = query.get('decorateRoom');
    if (debugRoom) this.roomDecorationEditor.open(debugRoom);

    this.furnitureInteractions = createFurnitureInteractionSystem(
      this,
      this.map,
      gameItems,
      equipmentMenu,
    );
    this.interactionPreviewPending = interactionPreview;

    window.__scene = this;
    window.__equipment = equipmentMenu;
    window.__character = characterCustomizer;
    window.__decoration = this.roomDecorationEditor;
    window.__gameItems = gameItems;
    window.__furnitureInteractions = this.furnitureInteractions;
  }

  update(time, delta) {
    this.mechanicsRuntime.update(time, delta);
    this.roomDecorationEditor.updateAvailability(
      this.player,
      this.transitioning || equipmentMenu.isOpen() || this.furnitureInteractions.isOpen(),
    );
    this.activeFurniturePrompt = this.furnitureInteractions.update(
      this.player,
      this.transitioning || equipmentMenu.isOpen() || this.roomDecorationEditor.isOpen(),
    );
    if (this.interactionPreviewPending && this.furnitureInteractions.openForType(this.interactionPreviewPending)) {
      this.roomDecorationEditor.close();
      this.interactionPreviewPending = null;
    }
    if (this.transitioning || equipmentMenu.isOpen() || this.roomDecorationEditor.isOpen() || this.furnitureInteractions.isOpen()) {
      showPortalPrompt(null);
      this.player.body.setVelocity(0, 0);
      this.player.anims.play(`idle-${this.lastDirection}`, true);
      this.setPlayerBodyFrameWidth(16);
      this.characterVisual.update(this.lastDirection, 'idle', true, this.time.now);
      this.equipmentVisual.hide();
      return;
    }

    const keys = this.moveKeys;
    const profile = movementProfile(
      equipmentCatalog,
      equipmentPreview?.id || equipmentMenu.getEquippedId(),
      this.shiftKey.isDown || Boolean(equipmentPreview),
    );
    const speed = profile.speed;
    let vx = 0;
    let vy = 0;
    if (keys.A.isDown || keys.LEFT.isDown) vx = -speed;
    else if (keys.D.isDown || keys.RIGHT.isDown) vx = speed;
    if (keys.W.isDown || keys.UP.isDown) vy = -speed;
    else if (keys.S.isDown || keys.DOWN.isDown) vy = speed;

    this.player.body.setVelocity(vx, vy);
    if (vx && vy) this.player.body.velocity.normalize().scale(speed);

    let direction = this.lastDirection;
    if (vx < 0) direction = 'left';
    else if (vx > 0) direction = 'right';
    else if (vy < 0) direction = 'up';
    else if (vy > 0) direction = 'down';
    const moving = Boolean(vx || vy);
    const animation = profile.active
      ? `equipment-${profile.equipment.id}-${direction}`
      : `${moving ? 'run' : 'idle'}-${direction}`;
    this.player.anims.play(animation, true);
    const riderFrameWidth = profile.active
      ? riderAnimationSpec(profile.equipment, direction, DIR[direction]).frameWidth
      : 16;
    this.setPlayerBodyFrameWidth(riderFrameWidth);
    this.lastDirection = direction;
    this.player.setDepth(this.player.body.bottom);
    const characterPose = profile.active
      ? (profile.equipment.id === 'motorcycle' ? 'sit' : 'idle')
      : (moving ? 'walk' : 'idle');
    this.characterVisual.update(direction, characterPose, moving || profile.active, this.time.now);
    this.equipmentVisual.update(
      this.player,
      profile.equipment,
      direction,
      profile.active,
      moving,
      this.time.now,
    );
    updateAutomaticDoors(this, this.player);
    this.updatePortalInteraction();
    showPortalPrompt(this.activeFurniturePrompt || this.activePortal);
  }

  updatePortalInteraction() {
    const tile = this.map.tile || 16;
    const footX = this.player.body.center.x / tile;
    const footY = this.player.body.bottom / tile;
    const portal = this.portals.find((candidate) => (
      footX >= candidate.x
      && footX <= candidate.x + candidate.w
      && footY >= candidate.y
      && footY <= candidate.y + candidate.h
    )) || null;

    if (portal?.id !== this.activePortal?.id) {
      this.activePortal = portal;
    }

  }

  changeScene(portal) {
    if (this.transitioning || this.roomDecorationEditor?.isOpen() || !sceneMaps[portal.targetScene]) return;
    this.transitioning = true;
    showPortalPrompt(null);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.restart({
        sceneId: portal.targetScene,
        spawnId: portal.targetSpawn || 'default',
      });
    });
    this.cameras.main.fadeOut(220, 20, 22, 30);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  pixelArt: true,
  backgroundColor: '#20222c',
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [MapScene],
});
