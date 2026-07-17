// MapRenderer — desenha o escritório a partir de DADOS (JSON), estilo Gather:
//  building  = contorno do prédio (parede fina de perímetro + porta)
//  zones     = manchas de piso (tapetes) que marcam áreas no SALÃO ABERTO — SEM parede
//  rooms     = salas fechadas (parede fina + porta)
// Móveis (do editor) povoam tudo por cima.

const F = (c, r) => r * 16 + c;

// Conjunto de parede fina (cols 7-9) + parede NORTE 3D com face de tijolo (decorável) — ver ../ASSETS.md
const W = {
  TL: F(7, 1), TOP: F(8, 1), TR: F(9, 1),
  L:  F(7, 2), R:  F(9, 2),
  BL: F(7, 3), BOT: F(8, 3), BR: F(9, 3),
  N_CAP: F(1, 9), N_FACE: F(1, 10),   // parede norte: topo branco + face de tijolo (pendurar mobília aqui)
};

// Pisos = texturas próprias do Modern Interiors (lisas, não "dungeon"). Nome → chave de textura.
export const FLOORS = {
  wood:  'floor_wood',    // tábua de madeira quente (base do salão)
  gray:  'floor_carpet',  // carpete azul-cinza (zonas de time)
  light: 'floor_cream',   // tile creme claro (salas)
  terra: 'floor_sage',    // verde-acinzentado (lounge)
  water: 'floor_water',   // água (piscina)
};

function floorTex(name) { return FLOORS[name] || FLOORS.light; }

// desenha o contorno de um rect: parede NORTE 3D (topo+face de tijolo, 2 tiles) + laterais/sul
// finas. Pula as portas. A face de tijolo é onde se pendura mobília (quadro/TV/troféu).
function drawWalls(scene, rect, T, solids) {
  const L = rect.x + rect.w - 1, B = rect.y + rect.h - 1;
  const doors = new Set();
  for (const d of (rect.doors || [])) {
    const len = d.len || 2;
    for (let i = 0; i < len; i++) {
      if (d.side === 'N') { doors.add((rect.x + d.at + i) + ',' + rect.y); doors.add((rect.x + d.at + i) + ',' + (rect.y + 1)); }
      else if (d.side === 'S') doors.add((rect.x + d.at + i) + ',' + B);
      else if (d.side === 'W') doors.add(rect.x + ',' + (rect.y + d.at + i));
      else doors.add(L + ',' + (rect.y + d.at + i));
    }
  }
  const put = (x, y, f) => {
    if (doors.has(x + ',' + y)) return;
    scene.add.image(x * T + 8, y * T + 8, 'tiles', f).setDepth(-9);
    solids.create(x * T + 8, y * T + 8, null).setVisible(false).body.setSize(T, T);
  };
  const has3d = B > rect.y + 2;   // só faz face 3D se a sala for alta o bastante

  put(rect.x, rect.y, W.TL); put(L, rect.y, W.TR);
  put(rect.x, B, W.BL); put(L, B, W.BR);
  for (let x = rect.x + 1; x <= L - 1; x++) {
    put(x, rect.y, has3d ? W.N_CAP : W.TOP);           // topo da parede norte
    if (has3d) put(x, rect.y + 1, W.N_FACE);           // face de tijolo (decorável)
    put(x, B, W.BOT);                                  // parede sul fina
  }
  for (let y = rect.y + 1; y <= B - 1; y++) { put(rect.x, y, W.L); put(L, y, W.R); }
}

function fillFloor(scene, rect, T, depth) {
  scene.add.tileSprite(rect.x * T, rect.y * T, rect.w * T, rect.h * T, floorTex(rect.floor))
    .setOrigin(0, 0).setDepth(depth);
}

function label(scene, rect, T, subtle) {
  if (!rect.name) return;
  scene.add.text((rect.x + rect.w / 2) * T, (rect.y + 0.4) * T, rect.name,
    { fontFamily: 'monospace', fontSize: '7px', color: subtle ? '#5a607a' : '#2b2f42',
      backgroundColor: subtle ? '#ffffff66' : '#ffffffcc', padding: { x: 2, y: 1 } })
    .setOrigin(0.5, 0).setDepth(60).setResolution(3);
}

export function renderMap(scene, map, solids) {
  const T = map.tile || 16;
  const b = map.building;

  // 1. piso base do salão
  if (b) fillFloor(scene, b, T, -12);
  // 2. tapetes das zonas (áreas abertas, sem parede)
  for (const z of (map.zones || [])) { fillFloor(scene, z, T, -11); label(scene, z, T, true); }
  // 3. salas fechadas: piso + parede + rótulo
  for (const r of (map.rooms || [])) { fillFloor(scene, r, T, -11); }
  // 4. paredes: perímetro do prédio + salas fechadas
  if (b) drawWalls(scene, b, T, solids);
  for (const r of (map.rooms || [])) { drawWalls(scene, r, T, solids); label(scene, r, T, false); }

  const sp = map.spawn || { x: (b ? b.x + b.w / 2 : 10), y: (b ? b.y + b.h / 2 : 10) };
  return { spawn: { x: sp.x * T, y: sp.y * T } };
}
