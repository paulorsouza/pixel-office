// Office Quest — protótipo web (Phaser 3) v11.
// TERRENO DA TOOQ: sede + jardim cercado por muro-verde + PORTÃO pro mundo aberto.
// Camadas: interior do escritório → jardim da empresa → portão → mundo aberto.

const TILE = 16;
const OUT_W = 130, OUT_H = 96;          // mundo externo
const INT_X = 4, INT_Y = 108;           // região do interior (fora de vista)
const MAP_W = 140, MAP_H = 150;
const F = (col, row) => row * 16 + col;
const WALL = { TL: F(7, 1), TR: F(9, 1), BL: F(7, 3), BR: F(9, 3), L: F(7, 2), R: F(9, 2), BOT: F(8, 3) };
const DIR = { right: 0, up: 6, left: 12, down: 18 };
const DOOR_OPEN_FRAME = 8;

// Sede TOOQ BMS (sprite 304x288 = 19x18 tiles); porta local (80,256) 48x32
const HQ = { key: 'office_tooq', tx: 44, ty: 18, w: 304, h: 288, doorX: 80, doorY: 256, solidH: 0.42 };
// Terreno cercado da empresa
const LOT = { x: 30, y: 12, x2: 86, y2: 57 };
const GATE = { x: 49, y: 56, w: 4 };     // portão 64x32 (4 tiles) na cerca sul
// Interior do escritório
const INT = { x: INT_X, y: INT_Y, w: 44, h: 26, floor: F(13, 9), brick: [F(1, 9), F(1, 10)] };

function preload() {
  this.load.spritesheet('tiles', 'assets/room_builder.png', { frameWidth: 16, frameHeight: 16 });
  this.load.spritesheet('adam_run', 'assets/Adam_run.png', { frameWidth: 16, frameHeight: 32 });
  this.load.spritesheet('adam_idle', 'assets/Adam_idle_anim.png', { frameWidth: 16, frameHeight: 32 });
  this.load.spritesheet('office_door', 'assets/office_door.png', { frameWidth: 48, frameHeight: 32 });
  this.load.image('grass', 'assets/grass.png'); this.load.image('grass_detail', 'assets/grass_detail.png');
  this.load.image('office_tooq', 'assets/office_tooq.png');
  this.load.image('gate', 'assets/gate.png');
  this.load.image('hedge_top', 'assets/hedge_top.png'); this.load.image('hedge_fill', 'assets/hedge_fill.png');
  this.load.image('fountain', 'assets/fountain.png'); this.load.image('bench', 'assets/bench.png');
  this.load.image('flower1', 'assets/flower1.png'); this.load.image('flower2', 'assets/flower2.png');
  this.load.image('tree1', 'assets/tree1.png'); this.load.image('tree2', 'assets/tree2.png');
  this.load.image('bush1', 'assets/bush1.png'); this.load.image('bush2', 'assets/bush2.png');
}

const hqTiles = () => ({ x1: HQ.tx, y1: HQ.ty, x2: HQ.tx + Math.ceil(HQ.w / TILE) - 1, y2: HQ.ty + Math.ceil(HQ.h / TILE) - 1 });
const onHQ = (tx, ty) => { const h = hqTiles(); return tx >= h.x1 - 1 && tx <= h.x2 + 1 && ty >= h.y1 - 1 && ty <= h.y2 + 2; };
const inLot = (tx, ty) => tx >= LOT.x && tx <= LOT.x2 && ty >= LOT.y && ty <= LOT.y2;

function create() {
  this.add.tileSprite(0, 0, OUT_W * TILE, OUT_H * TILE, 'grass').setOrigin(0, 0).setDepth(-30);
  for (let i = 0; i < 1200; i++) {
    const tx = (Math.random() * OUT_W) | 0, ty = (Math.random() * OUT_H) | 0;
    if (onHQ(tx, ty)) continue;
    this.add.image(tx * TILE + 8, ty * TILE + 8, 'grass_detail').setDepth(-29).setAlpha(0.9);
  }

  this.solids = this.physics.add.staticGroup();
  this.zoneLock = false; this.busy = false;

  buildLot(this);        // muro-verde + portão
  buildHQ(this);         // fachada TOOQ BMS + porta animada
  buildGarden(this);     // fonte, bancos, flores dentro do terreno
  buildOutside(this);    // árvores/arbustos fora do terreno
  buildInterior(this);   // andar do escritório

  const open = this.anims.generateFrameNumbers('office_door', { start: 0, end: DOOR_OPEN_FRAME });
  this.anims.create({ key: 'door-open', frames: open, frameRate: 22, repeat: 0 });
  this.anims.create({ key: 'door-close', frames: open.slice().reverse(), frameRate: 22, repeat: 0 });

  this.player = this.physics.add.sprite(this.doorC.cx, HQ.ty * TILE + HQ.h + 50, 'adam_idle', DIR.down);
  this.player.body.setSize(10, 8).setOffset(3, 22);
  this.physics.add.collider(this.player, this.solids);

  const mk = (key, sheet, start, fr) => this.anims.create({
    key, frames: this.anims.generateFrameNumbers(sheet, { start, end: start + 5 }), frameRate: fr, repeat: -1 });
  for (const [d, s] of Object.entries(DIR)) { mk('run-' + d, 'adam_run', s, 12); mk('idle-' + d, 'adam_idle', s, 5); }

  this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
  this.lastDir = 'down';
  const cam = this.cameras.main;
  cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
  cam.startFollow(this.player, true, 0.1, 0.1);
  this.zoom = 2.2; cam.setZoom(this.zoom); cam.roundPixels = true;
  this.input.on('wheel', (p, o, dx, dy) => {
    this.zoom = Phaser.Math.Clamp(this.zoom - dy * 0.0018, 0.6, 5); cam.setZoom(this.zoom);
  });
  window.__scene = this;
}

// ---- muro-verde (2 tiles de espessura) + portão ----
function buildLot(scene) {
  const set = new Set();
  const add = (x, y) => set.add(x + ',' + y);
  for (let x = LOT.x; x <= LOT.x2; x++) { add(x, LOT.y); add(x, LOT.y + 1); add(x, LOT.y2 - 1); add(x, LOT.y2); }
  for (let y = LOT.y; y <= LOT.y2; y++) { add(LOT.x, y); add(LOT.x + 1, y); add(LOT.x2 - 1, y); add(LOT.x2, y); }
  // vão do portão
  for (let i = 0; i < GATE.w; i++) { set.delete((GATE.x + i) + ',' + GATE.y); set.delete((GATE.x + i) + ',' + (GATE.y + 1)); }

  scene.hedge = set;
  for (const k of set) {
    const [x, y] = k.split(',').map(Number);
    const top = !set.has(x + ',' + (y - 1));
    scene.add.image(x * TILE + 8, y * TILE + 8, top ? 'hedge_top' : 'hedge_fill').setDepth(y * TILE + 8);
    scene.solids.create(x * TILE + 8, y * TILE + 8, null).setVisible(false).body.setSize(TILE, TILE);
  }
  // portão (passável)
  scene.add.image(GATE.x * TILE, GATE.y * TILE, 'gate').setOrigin(0, 0).setDepth((GATE.y + 1) * TILE + 12);
}

function buildHQ(scene) {
  const px = HQ.tx * TILE, py = HQ.ty * TILE, baseY = py + HQ.h;
  scene.add.image(px, py, HQ.key).setOrigin(0, 0).setDepth(baseY);
  const solidTop = baseY - Math.floor(HQ.h * HQ.solidH), bh = baseY - solidTop;
  const dL = px + HQ.doorX, dR = dL + 48;
  addSolid(scene, px, solidTop, dL - px, bh);
  addSolid(scene, dR, solidTop, (px + HQ.w) - dR, bh);
  scene.door = scene.add.sprite(dL + 24, py + HQ.doorY + 16, 'office_door', 0).setDepth(baseY + 1);
  scene.doorC = { cx: dL + 24, cy: py + HQ.doorY + 16, open: false };
  scene.enterZone = new Phaser.Geom.Rectangle(dL + 10, baseY - 12, 28, 22);
}

function buildGarden(scene) {
  const h = hqTiles();
  const cx = (GATE.x + GATE.w / 2);
  // fonte no meio do jardim (entre a sede e o portão)
  const fy = Math.floor((h.y2 + GATE.y) / 2);
  scene.add.image(cx * TILE, fy * TILE, 'fountain').setOrigin(0.5, 1).setDepth(fy * TILE);
  scene.solids.create(cx * TILE, fy * TILE - 12, null).setVisible(false).body.setSize(30, 20);
  // bancos ladeando a fonte
  for (const bx of [cx - 6, cx + 6]) {
    scene.add.image(bx * TILE, fy * TILE, 'bench').setOrigin(0.5, 1).setDepth(fy * TILE);
    scene.solids.create(bx * TILE, fy * TILE - 6, null).setVisible(false).body.setSize(44, 10);
  }
  // flores e arbustos pelo jardim
  for (let i = 0; i < 60; i++) {
    const tx = Phaser.Math.Between(LOT.x + 3, LOT.x2 - 3), ty = Phaser.Math.Between(h.y2 + 2, LOT.y2 - 3);
    if (onHQ(tx, ty)) continue;
    const key = Phaser.Math.RND.pick(['flower1', 'flower2', 'bush1', 'bush2']);
    scene.add.image(tx * TILE + 8, ty * TILE + 16, key).setOrigin(0.5, 1).setDepth(ty * TILE + 16);
  }
  // árvores nas laterais do terreno
  for (const tx of [LOT.x + 4, LOT.x2 - 4]) {
    for (let ty = h.y1 + 4; ty < LOT.y2 - 4; ty += 9) {
      if (onHQ(tx, ty)) continue;
      const tr = scene.add.image(tx * TILE + 8, ty * TILE + 16, Phaser.Math.RND.pick(['tree1', 'tree2'])).setOrigin(0.5, 1);
      tr.setDepth(tr.y);
      scene.solids.create(tx * TILE + 8, ty * TILE + 12, null).setVisible(false).body.setSize(12, 6);
    }
  }
}

function buildOutside(scene) {
  for (let i = 0; i < 150; i++) {
    const tx = (Math.random() * OUT_W) | 0, ty = (Math.random() * OUT_H) | 0;
    if (inLot(tx, ty)) continue;
    const tr = scene.add.image(tx * TILE + 8, ty * TILE + 16, Phaser.Math.RND.pick(['tree1', 'tree2'])).setOrigin(0.5, 1);
    tr.setDepth(tr.y);
    scene.solids.create(tx * TILE + 8, ty * TILE + 12, null).setVisible(false).body.setSize(12, 6);
  }
  for (let i = 0; i < 120; i++) {
    const tx = (Math.random() * OUT_W) | 0, ty = (Math.random() * OUT_H) | 0;
    if (inLot(tx, ty)) continue;
    scene.add.image(tx * TILE + 8, ty * TILE + 8, Phaser.Math.RND.pick(['bush1', 'bush2'])).setDepth(ty * TILE + 8);
  }
}

function addSolid(scene, x, y, w, h) {
  if (w <= 0 || h <= 0) return;
  scene.solids.create(x + w / 2, y + h / 2, null).setVisible(false).body.setSize(w, h);
}

function buildInterior(scene) {
  const L = INT.x + INT.w - 1, B = INT.y + INT.h - 1, doorX = INT.x + Math.floor(INT.w / 2);
  scene.add.tileSprite(INT.x * TILE, INT.y * TILE, INT.w * TILE, INT.h * TILE, 'tiles', INT.floor).setOrigin(0, 0).setDepth(-10);
  for (let y = INT.y; y <= B; y++)
    for (let x = INT.x; x <= L; x++) {
      const left = x === INT.x, right = x === L, top = y === INT.y, bot = y === B;
      if (!left && !right && !top && !bot && y !== INT.y + 1) continue;
      let f = -1;
      if (top && left) f = WALL.TL; else if (top && right) f = WALL.TR;
      else if (bot && left) f = WALL.BL; else if (bot && right) f = WALL.BR;
      else if (top) f = INT.brick[0];
      else if (y === INT.y + 1 && !left && !right) f = INT.brick[1];
      else if (bot) f = WALL.BOT; else if (left) f = WALL.L; else if (right) f = WALL.R;
      if (bot && x >= doorX - 1 && x <= doorX + 1) f = -1;
      if (f < 0) continue;
      scene.add.image(x * TILE + 8, y * TILE + 8, 'tiles', f).setDepth(-9);
      scene.solids.create(x * TILE + 8, y * TILE + 8, null).setVisible(false).body.setSize(TILE, TILE);
    }
  INT.spawn = { x: doorX * TILE + 8, y: (B - 3) * TILE + 8 };
  INT.exitZone = new Phaser.Geom.Rectangle((doorX - 1) * TILE, B * TILE - 2, 48, 22);
}

function fadeTo(scene, x, y) {
  if (scene.busy || scene.zoneLock) return;
  scene.busy = true; scene.zoneLock = true;
  const cam = scene.cameras.main;
  cam.fadeOut(170, 0, 0, 0);
  cam.once('camerafadeoutcomplete', () => {
    scene.player.setPosition(x, y); scene.player.body.reset(x, y);
    cam.fadeIn(170, 0, 0, 0);
    scene.time.delayedCall(190, () => { scene.busy = false; });
  });
}

function update() {
  const k = this.keys, sp = 115;
  let vx = 0, vy = 0;
  if (!this.busy) {
    if (k.A.isDown || k.LEFT.isDown) vx = -sp; else if (k.D.isDown || k.RIGHT.isDown) vx = sp;
    if (k.W.isDown || k.UP.isDown) vy = -sp; else if (k.S.isDown || k.DOWN.isDown) vy = sp;
  }
  this.player.body.setVelocity(vx, vy);
  if (vx && vy) this.player.body.velocity.normalize().scale(sp);
  let dir = this.lastDir;
  if (vx < 0) dir = 'left'; else if (vx > 0) dir = 'right'; else if (vy < 0) dir = 'up'; else if (vy > 0) dir = 'down';
  this.player.anims.play(((vx || vy) ? 'run-' : 'idle-') + dir, true);
  this.lastDir = dir;
  this.player.setDepth(this.player.y);

  const px = this.player.x, py = this.player.y, d = this.doorC;
  const near = Phaser.Math.Distance.Between(px, py, d.cx, d.cy) < 56;
  if (near && !d.open) { d.open = true; this.door.play('door-open'); }
  else if (!near && d.open) { d.open = false; this.door.play('door-close'); }

  const inEnter = Phaser.Geom.Rectangle.Contains(this.enterZone, px, py);
  const inExit = Phaser.Geom.Rectangle.Contains(INT.exitZone, px, py);
  if (this.zoneLock && !inEnter && !inExit) this.zoneLock = false;
  if (this.busy || this.zoneLock) return;
  if (d.open && inEnter) { fadeTo(this, INT.spawn.x, INT.spawn.y); return; }
  if (inExit) { fadeTo(this, d.cx, HQ.ty * TILE + HQ.h + 30); return; }
}

new Phaser.Game({
  type: Phaser.AUTO, parent: 'game',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  pixelArt: true, backgroundColor: '#5c8f3e',
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: { preload, create, update },
});
