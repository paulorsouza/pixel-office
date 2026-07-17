// Office Quest — runtime de cenas Phaser orientado a dados.
import { renderScene } from './MapRenderer.js';

const DIR = { right: 0, up: 6, left: 12, down: 18 };

const worldAssetPath = (asset) => `assets/world/${asset}.png`;

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Não foi possível carregar ${path}`);
  return response.json();
}

const manifest = await fetchJson('maps/scenes.json');
const sceneMaps = Object.fromEntries(await Promise.all(
  manifest.scenes.map(async ({ id, file }) => [id, await fetchJson(`maps/${file}`)]),
));
const query = new URLSearchParams(location.search);
const requestedScene = query.get('scene') || location.hash.replace(/^#/, '');
const initialScene = sceneMaps[requestedScene] ? requestedScene : manifest.startScene;
const initialSpawn = query.get('spawn') || 'default';

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
    this.map = sceneMaps[this.currentSceneId];
    if (!this.map) throw new Error(`Cena desconhecida: ${this.currentSceneId}`);
  }

  preload() {
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
      this.load.spritesheet('adam_idle', 'assets/chars/Adam_idle_anim.png', {
        frameWidth: 16,
        frameHeight: 32,
      });
    }

    for (const floor of ['wood', 'carpet', 'cream', 'sage', 'water']) {
      loadImageOnce(this, `floor_${floor}`, `assets/floors/floor_${floor}.png`);
    }
    loadImageOnce(this, 'grass', worldAssetPath('grass'));

    for (const asset of (this.map.assets || [])) {
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
    const { spawns, portals } = renderScene(this, this.map, this.solids);
    this.portals = portals;

    const spawn = spawns[this.spawnId] || spawns.default || Object.values(spawns)[0];
    this.player = this.physics.add.sprite(
      spawn.x * tile + tile / 2,
      spawn.y * tile,
      'adam_idle',
      DIR.down,
    );
    this.player.body.setSize(10, 8).setOffset(3, 22);
    this.physics.add.collider(this.player, this.solids);

    if (query.get('debug') === 'collisions') {
      this.physics.world.createDebugGraphic();
      this.physics.world.drawDebug = true;
    }

    const createAnimation = (key, sheet, start, frameRate) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(sheet, { start, end: start + 5 }),
        frameRate,
        repeat: -1,
      });
    };
    for (const [direction, start] of Object.entries(DIR)) {
      createAnimation(`run-${direction}`, 'adam_run', start, 12);
      createAnimation(`idle-${direction}`, 'adam_idle', start, 5);
    }

    this.moveKeys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.interactKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.handleInteract = () => {
      if (
        this.activePortal
        && !this.transitioning
        && this.time.now >= this.interactionUnlockAt
      ) {
        this.changeScene(this.activePortal);
      }
    };
    this.interactKey.on('down', this.handleInteract);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.interactKey.off('down', this.handleInteract);
    });
    this.lastDirection = 'down';
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
      const fitZoom = Math.max(
        this.scale.gameSize.width / cameraBoundsPx.w,
        this.scale.gameSize.height / cameraBoundsPx.h,
      );
      const minZoom = Math.max(this.map.camera?.minZoom || 0.75, fitZoom);
      const maxZoom = Math.max(this.map.camera?.maxZoom || 4, minZoom);
      this.zoom = Phaser.Math.Clamp(requestedZoom, minZoom, maxZoom);
      camera.setZoom(this.zoom);
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

    window.__scene = this;
  }

  update() {
    if (this.transitioning) {
      this.player.body.setVelocity(0, 0);
      return;
    }

    const keys = this.moveKeys;
    const speed = 112;
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
    this.player.anims.play(`${vx || vy ? 'run' : 'idle'}-${direction}`, true);
    this.lastDirection = direction;
    this.player.setDepth(this.player.body.bottom);

    this.updatePortalInteraction();
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
      showPortalPrompt(portal);
    }

  }

  changeScene(portal) {
    if (this.transitioning || !sceneMaps[portal.targetScene]) return;
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
