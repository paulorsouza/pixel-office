// Editor de móveis (MVP) — paleta HTML + colocar/mover/apagar no canvas + salvar no mapa.
// Modo edição liga/desliga com a tecla E. A paleta mostra thumbnails (escolha vendo a peça).

const CSS = `
#ed-panel{position:fixed;top:0;right:0;width:250px;height:100vh;z-index:50;display:none;
  background:#1b1d27ee;backdrop-filter:blur(4px);border-left:2px solid #3a3f52;
  font-family:system-ui,sans-serif;color:#e6e8f2;flex-direction:column}
#ed-panel.on{display:flex}
#ed-panel h3{margin:0;padding:10px 12px;font-size:14px;border-bottom:1px solid #3a3f52}
#ed-tools{display:flex;gap:6px;flex-wrap:wrap;padding:8px 10px;border-bottom:1px solid #3a3f52}
#ed-tools button{background:#2b2f42;color:#e6e8f2;border:1px solid #454b63;border-radius:6px;
  padding:6px 9px;font-size:12px;cursor:pointer}
#ed-tools button:hover{background:#39405a}
#ed-tools button.act{background:#6c5cff;border-color:#6c5cff}
#ed-grid{flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:8px}
#ed-grid img{width:100%;height:52px;object-fit:contain;background:#2b2f42;border:2px solid transparent;
  border-radius:5px;cursor:pointer;image-rendering:pixelated}
#ed-grid img.sel{border-color:#6c5cff;background:#39405a}
#ed-status{position:fixed;top:8px;left:8px;z-index:50;background:#6c5cffcc;color:#fff;
  padding:5px 10px;border-radius:8px;font:12px system-ui;display:none}
#ed-status.on{display:block}`;

export class Editor {
  constructor(scene, map, catalog, file) {
    this.scene = scene; this.map = map; this.file = file;
    this.active = false; this.brush = null; this.selected = null; this.dragging = false;
    this.sprites = [];
    map.furniture = map.furniture || [];

    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this._buildPanel(catalog);

    for (const f of map.furniture) this._addSprite(f);

    scene.input.on('pointerdown', p => this._down(p));
    scene.input.on('pointermove', p => this._move(p));
    scene.input.on('pointerup', () => { this.dragging = false; });
    scene.input.keyboard.on('keydown-E', () => this.toggle());
    scene.input.keyboard.on('keydown-DELETE', () => this._del());
    scene.input.keyboard.on('keydown-BACKSPACE', () => this._del());
  }

  _buildPanel(catalog) {
    const panel = document.createElement('div');
    panel.id = 'ed-panel';
    panel.innerHTML = `<h3>🛋️ Editor de móveis</h3>
      <div id="ed-tools">
        <button id="ed-sel" class="act">Selecionar</button>
        <button id="ed-save">💾 Salvar</button>
        <button id="ed-close">Sair (E)</button>
      </div>
      <div id="ed-grid"></div>`;
    document.body.appendChild(panel);
    const status = document.createElement('div'); status.id = 'ed-status';
    status.textContent = 'MODO EDIÇÃO — clique numa peça e clique no mapa · WASD move a câmera';
    document.body.appendChild(status);
    this.panel = panel; this.status = status;

    const grid = panel.querySelector('#ed-grid');
    for (const it of (catalog.office || [])) {
      const img = document.createElement('img');
      img.src = 'assets/furniture/office/' + it.id + '.png';
      img.title = it.id;
      img.onclick = () => {
        this.brush = it.id;
        grid.querySelectorAll('img').forEach(e => e.classList.remove('sel'));
        img.classList.add('sel');
        panel.querySelector('#ed-sel').classList.remove('act');
        this._select(null);
      };
      grid.appendChild(img);
    }
    panel.querySelector('#ed-sel').onclick = () => {
      this.brush = null;
      grid.querySelectorAll('img').forEach(e => e.classList.remove('sel'));
      panel.querySelector('#ed-sel').classList.add('act');
    };
    panel.querySelector('#ed-save').onclick = () => this.save();
    panel.querySelector('#ed-close').onclick = () => this.toggle();
  }

  toggle() {
    this.active = !this.active;
    this.panel.classList.toggle('on', this.active);
    this.status.classList.toggle('on', this.active);
    const cam = this.scene.cameras.main;
    if (this.active) cam.stopFollow();
    else { cam.startFollow(this.scene.player, true, 0.1, 0.1); this._select(null); }
  }

  _addSprite(f) {
    const T = this.map.tile;
    const spr = this.scene.add.image(f.x * T + T / 2, f.y * T + T, f.id).setOrigin(0.5, 1);
    spr.setDepth(f.y * T + T);
    spr.setData('f', f);
    this.sprites.push(spr);
    return spr;
  }

  _tile(p) { const T = this.map.tile; return { x: Math.floor(p.worldX / T), y: Math.floor(p.worldY / T) }; }

  _down(p) {
    if (!this.active) return;
    if (this.brush) {                       // colocar
      const t = this._tile(p);
      const f = { id: this.brush, x: t.x, y: t.y };
      this.map.furniture.push(f);
      this._select(this._addSprite(f));
    } else {                                // selecionar p/ mover/apagar
      let hit = null;
      for (const s of this.sprites)
        if (Phaser.Geom.Rectangle.Contains(s.getBounds(), p.worldX, p.worldY)) hit = s; // topo = último
      this._select(hit);
      this.dragging = !!hit;
    }
  }

  _move(p) {
    if (!this.active || !this.dragging || !this.selected) return;
    const T = this.map.tile, t = this._tile(p), f = this.selected.getData('f');
    f.x = t.x; f.y = t.y;
    this.selected.setPosition(f.x * T + T / 2, f.y * T + T).setDepth(f.y * T + T);
  }

  _select(spr) {
    if (this.selected) this.selected.clearTint();
    this.selected = spr;
    if (spr) spr.setTint(0x9fd0ff);
  }

  _del() {
    if (!this.active || !this.selected) return;
    const f = this.selected.getData('f');
    this.map.furniture = this.map.furniture.filter(x => x !== f);
    this.sprites = this.sprites.filter(s => s !== this.selected);
    this.selected.destroy(); this.selected = null;
  }

  async save() {
    try {
      const r = await fetch('/api/map/' + this.file, { method: 'POST', body: JSON.stringify(this.map, null, 2) });
      this.status.textContent = r.ok ? '✅ salvo em maps/' + this.file : '❌ erro ao salvar';
    } catch (e) { this.status.textContent = '❌ erro: ' + e.message; }
    setTimeout(() => { this.status.textContent = 'MODO EDIÇÃO — clique numa peça e clique no mapa · WASD move a câmera'; }, 2500);
  }
}
