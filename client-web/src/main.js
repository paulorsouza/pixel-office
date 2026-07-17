// Office Quest — cliente web (Phaser 3). Orientado a DADOS + editor de móveis.
import { renderMap } from './MapRenderer.js';
import { Editor } from './Editor.js';

const TILE = 16;
const DIR = { right: 0, up: 6, left: 12, down: 18 };
const MAP_FILE = 'tooq-office.json';

class OfficeScene extends Phaser.Scene {
  constructor() { super('office'); }

  preload() {
    this.load.spritesheet('tiles', 'assets/tiles/room_builder.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('adam_run', 'assets/chars/Adam_run.png', { frameWidth: 16, frameHeight: 32 });
    this.load.spritesheet('adam_idle', 'assets/chars/Adam_idle_anim.png', { frameWidth: 16, frameHeight: 32 });
    this.load.json('map', 'maps/' + MAP_FILE);
    this.load.json('catalog', 'data/furniture-catalog.json');
    for (const n of ['wood', 'carpet', 'cream', 'sage', 'water']) this.load.image('floor_' + n, 'assets/floors/floor_' + n + '.png');
    for (let i = 1; i <= 339; i++) this.load.image('of_' + i, 'assets/furniture/office/of_' + i + '.png');
  }

  create() {
    const map = this.cache.json.get('map');
    const catalog = this.cache.json.get('catalog');
    this.cameras.main.setBackgroundColor('#20222c');

    this.solids = this.physics.add.staticGroup();
    const { spawn } = renderMap(this, map, this.solids);

    this.player = this.physics.add.sprite(spawn.x, spawn.y, 'adam_idle', DIR.down);
    this.player.body.setSize(10, 8).setOffset(3, 22);
    this.physics.add.collider(this.player, this.solids);

    const mk = (key, sheet, start, fr) => this.anims.create({
      key, frames: this.anims.generateFrameNumbers(sheet, { start, end: start + 5 }), frameRate: fr, repeat: -1 });
    for (const [d, s] of Object.entries(DIR)) { mk('run-' + d, 'adam_run', s, 12); mk('idle-' + d, 'adam_idle', s, 5); }

    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.lastDir = 'down';

    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.w * TILE, map.h * TILE);
    cam.startFollow(this.player, true, 0.1, 0.1);
    this.zoom = 2.2; cam.setZoom(this.zoom); cam.roundPixels = true;
    this.input.on('wheel', (p, o, dx, dy) => {
      this.zoom = Phaser.Math.Clamp(this.zoom - dy * 0.0018, 0.4, 5); cam.setZoom(this.zoom);
    });

    this.editor = new Editor(this, map, catalog, MAP_FILE);
    window.__scene = this;
  }

  update() {
    const k = this.keys, cam = this.cameras.main;

    if (this.editor && this.editor.active) {   // modo edição: WASD move a câmera
      const pan = 8 / this.zoom;
      if (k.A.isDown || k.LEFT.isDown) cam.scrollX -= pan; else if (k.D.isDown || k.RIGHT.isDown) cam.scrollX += pan;
      if (k.W.isDown || k.UP.isDown) cam.scrollY -= pan; else if (k.S.isDown || k.DOWN.isDown) cam.scrollY += pan;
      this.player.anims.play('idle-' + this.lastDir, true);
      return;
    }

    const sp = 115;
    let vx = 0, vy = 0;
    if (k.A.isDown || k.LEFT.isDown) vx = -sp; else if (k.D.isDown || k.RIGHT.isDown) vx = sp;
    if (k.W.isDown || k.UP.isDown) vy = -sp; else if (k.S.isDown || k.DOWN.isDown) vy = sp;
    this.player.body.setVelocity(vx, vy);
    if (vx && vy) this.player.body.velocity.normalize().scale(sp);
    let dir = this.lastDir;
    if (vx < 0) dir = 'left'; else if (vx > 0) dir = 'right'; else if (vy < 0) dir = 'up'; else if (vy > 0) dir = 'down';
    this.player.anims.play(((vx || vy) ? 'run-' : 'idle-') + dir, true);
    this.lastDir = dir;
    this.player.setDepth(this.player.y);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  pixelArt: true,
  backgroundColor: '#20222c',
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [OfficeScene],
});
