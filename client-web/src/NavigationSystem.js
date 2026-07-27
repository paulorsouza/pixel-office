// Movimentação por destino: clicar/tocar no chão manda o avatar até lá.
//
// Por que existe uma grade e um A*: sem busca de rota o avatar anda em linha reta
// e trava na primeira quina de parede — inviável num escritório cheio de sala e
// corredor. A grade é derivada dos MESMOS retângulos de colisão que a física usa
// (`scene.solids`), então nunca diverge do que o jogador vê.
//
// Escopo deliberado: isto SÓ move. Interagir (sentar, entrar, abrir quadro)
// continua exigindo confirmação explícita — E no teclado ou o botão de ação.

const SQRT2 = Math.SQRT2;

/** Fila de prioridade mínima — A* sem isto vira O(n²) e engasga no mapa grande. */
class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(node, priority) {
    const items = this.items;
    items.push({ node, priority });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].priority <= items[i].priority) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }
  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let small = i;
        if (l < items.length && items[l].priority < items[small].priority) small = l;
        if (r < items.length && items[r].priority < items[small].priority) small = r;
        if (small === i) break;
        [items[small], items[i]] = [items[i], items[small]];
        i = small;
      }
    }
    return top.node;
  }
}

export function createNavigationSystem(scene, map, options = {}) {
  const tile = map.tile || 16;
  const cols = Math.max(1, Math.ceil(map.w || 1));
  const rows = Math.max(1, Math.ceil(map.h || 1));
  const cellCount = cols * rows;

  // Meia-caixa do corpo do jogador (body 10x8 no pé, ver main.js). A célula só é
  // livre se o corpo INTEIRO couber nela — é isso que evita rota raspando parede.
  const halfW = (options.bodyWidth ?? 10) / 2;
  const halfH = (options.bodyHeight ?? 8) / 2;

  const blocked = new Uint8Array(cellCount);
  const gScore = new Float64Array(cellCount);
  const cameFrom = new Int32Array(cellCount);
  const visited = new Uint8Array(cellCount);

  const centerX = (cx) => cx * tile + tile / 2;
  const centerY = (cy) => cy * tile + tile / 2;
  const cellOf = (px, py) => [
    Math.floor(px / tile),
    Math.floor(py / tile),
  ];
  const inside = (cx, cy) => cx >= 0 && cy >= 0 && cx < cols && cy < rows;

  /**
   * Marca as células cujo corpo do jogador encostaria em algum sólido.
   * Reconstruímos a cada clique em vez de invalidar: móvel colocado, porta
   * trancada e cena recarregada mudam os sólidos, e invalidação esquecida vira
   * bug silencioso. Custa menos de 1 ms.
   */
  function rebuild() {
    blocked.fill(0);
    const doorBlockers = new Set((scene.automaticDoors || []).map((d) => d.blocker));

    for (const body of scene.solids.getChildren()) {
      // Portas abrem sozinhas por proximidade: se contassem como parede, nenhuma
      // rota entraria em sala nenhuma.
      if (doorBlockers.has(body)) continue;
      const rect = body.getBounds ? body.getBounds() : null;
      if (!rect) continue;

      const minX = Math.floor((rect.x - halfW - tile / 2) / tile) + 1;
      const maxX = Math.ceil((rect.right + halfW - tile / 2) / tile) - 1;
      const minY = Math.floor((rect.y - halfH - tile / 2) / tile) + 1;
      const maxY = Math.ceil((rect.bottom + halfH - tile / 2) / tile) - 1;

      for (let cy = Math.max(0, minY); cy <= Math.min(rows - 1, maxY); cy += 1) {
        for (let cx = Math.max(0, minX); cx <= Math.min(cols - 1, maxX); cx += 1) {
          blocked[cy * cols + cx] = 1;
        }
      }
    }
  }

  const isFreeCell = (cx, cy) => inside(cx, cy) && blocked[cy * cols + cx] === 0;

  /** Célula livre mais próxima — clicar em cima de uma parede não pode travar o comando. */
  function nearestFree(cx, cy, maxRadius = 12) {
    if (isFreeCell(cx, cy)) return [cx, cy];
    for (let r = 1; r <= maxRadius; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (isFreeCell(cx + dx, cy + dy)) return [cx + dx, cy + dy];
        }
      }
    }
    return null;
  }

  function findPath(startCell, goalCell) {
    const [sx, sy] = startCell;
    const [gx, gy] = goalCell;
    const startIdx = sy * cols + sx;
    const goalIdx = gy * cols + gx;
    if (startIdx === goalIdx) return [];

    visited.fill(0);
    cameFrom.fill(-1);
    gScore.fill(Infinity);
    gScore[startIdx] = 0;

    const open = new MinHeap();
    const octile = (ax, ay) => {
      const dx = Math.abs(ax - gx);
      const dy = Math.abs(ay - gy);
      return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy);
    };
    open.push(startIdx, octile(sx, sy));

    while (open.size > 0) {
      const current = open.pop();
      if (current === goalIdx) break;
      if (visited[current]) continue;
      visited[current] = 1;

      const cx = current % cols;
      const cy = (current - cx) / cols;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (!isFreeCell(nx, ny)) continue;
          // Sem cortar quina: passar na diagonal exige os dois ortogonais livres,
          // senão o avatar "atravessa" o canto da parede e encosta no collider.
          if (dx !== 0 && dy !== 0 && (!isFreeCell(cx + dx, cy) || !isFreeCell(cx, cy + dy))) continue;

          const neighbor = ny * cols + nx;
          if (visited[neighbor]) continue;
          const step = (dx !== 0 && dy !== 0) ? SQRT2 : 1;
          const tentative = gScore[current] + step;
          if (tentative >= gScore[neighbor]) continue;
          gScore[neighbor] = tentative;
          cameFrom[neighbor] = current;
          open.push(neighbor, tentative + octile(nx, ny));
        }
      }
    }

    if (cameFrom[goalIdx] === -1 && goalIdx !== startIdx) return null;

    const cells = [];
    for (let node = goalIdx; node !== -1 && node !== startIdx; node = cameFrom[node]) {
      const cx = node % cols;
      cells.push([cx, (node - cx) / cols]);
    }
    return cells.reverse();
  }

  /** O corpo do jogador cabe inteiro nesta posição em pixels? */
  function bodyFits(px, py) {
    const [cx0] = cellOf(px - halfW, py - halfH);
    const [cx1] = cellOf(px + halfW, py + halfH);
    const cy0 = Math.floor((py - halfH) / tile);
    const cy1 = Math.floor((py + halfH) / tile);
    for (let cy = cy0; cy <= cy1; cy += 1) {
      for (let cx = cx0; cx <= cx1; cx += 1) {
        if (!isFreeCell(cx, cy)) return false;
      }
    }
    return true;
  }

  function hasLineOfSight(ax, ay, bx, by) {
    const distance = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(2, Math.ceil(distance / (tile / 2)));
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (!bodyFits(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  }

  /**
   * Suavização (string pulling): A* em grade devolve caminho colado na quina, com
   * cara de robô. Aqui cortamos os pontos intermediários que dá para pular em
   * linha reta — o avatar anda na diagonal natural do corredor.
   */
  function smooth(points, fromX, fromY) {
    if (points.length <= 1) return points;
    const result = [];
    let anchorX = fromX;
    let anchorY = fromY;
    let i = 0;
    while (i < points.length) {
      let best = i;
      for (let j = points.length - 1; j > i; j -= 1) {
        if (hasLineOfSight(anchorX, anchorY, points[j].x, points[j].y)) { best = j; break; }
      }
      result.push(points[best]);
      anchorX = points[best].x;
      anchorY = points[best].y;
      i = best + 1;
    }
    return result;
  }

  // ---------------------------------------------------------------- estado

  let waypoints = [];
  let goal = null;
  let stalledSteps = 0;
  let lastDistance = Infinity;
  // Contamos QUADROS sem avanço, não milissegundos: o Phaser limita o `delta`,
  // então num engasgo do loop o relógio corre muito mais que o corpo anda e a
  // rota era cancelada sozinha, como se tivesse travado numa parede.
  const STALLED_STEPS_LIMIT = 90;

  const clear = () => { waypoints = []; goal = null; };

  return {
    isMoving: () => waypoints.length > 0,
    goal: () => (goal ? { ...goal } : null),
    cancel: clear,
    rebuild,

    /** Diagnóstico: por que um destino foi recusado. Usado no console, não no jogo. */
    debugAt(px, py) {
      rebuild();
      const [cx, cy] = cellOf(px, py);
      return {
        cell: [cx, cy],
        dentroDoMapa: inside(cx, cy),
        livre: isFreeCell(cx, cy),
        corpoCabe: bodyFits(px, py),
        celulaLivreMaisProxima: nearestFree(cx, cy),
      };
    },

    /**
     * Traça rota do corpo do jogador até o ponto de mundo.
     * @returns {boolean} false quando não há caminho (o chamador dá o feedback).
     */
    moveTo(worldX, worldY, body) {
      rebuild();
      const [gxRaw, gyRaw] = cellOf(worldX, worldY);
      const target = nearestFree(gxRaw, gyRaw);
      if (!target) { clear(); return false; }

      const [sxRaw, syRaw] = cellOf(body.center.x, body.center.y);
      // O jogador pode estar tecnicamente numa célula "bloqueada" (encostado na
      // parede); nesse caso partimos da célula livre mais próxima.
      const start = nearestFree(sxRaw, syRaw, 3);
      if (!start) { clear(); return false; }

      const cells = findPath(start, target);
      if (cells === null) { clear(); return false; }

      const points = cells.map(([cx, cy]) => ({ x: centerX(cx), y: centerY(cy) }));
      // O destino exato costuma ser melhor que o centro da célula, quando cabe.
      if (points.length > 0 && bodyFits(worldX, worldY)) {
        points[points.length - 1] = { x: worldX, y: worldY };
      }
      waypoints = smooth(points, body.center.x, body.center.y);
      goal = waypoints.length > 0 ? { ...waypoints[waypoints.length - 1] } : null;
      stalledSteps = 0;
      lastDistance = Infinity;
      return waypoints.length > 0;
    },

    /**
     * Velocidade para este frame. Devolve null quando não há rota ativa, para o
     * chamador seguir com o teclado sem ramificação extra.
     */
    step(body, speed) {
      const arrival = Math.max(2, speed * 0.02);
      let dx = 0;
      let dy = 0;
      let distance = 0;

      // Consome os waypoints já alcançados. Trocar de trecho REINICIA a medida de
      // progresso: sem isso a distância do trecho novo era comparada com a do
      // anterior (que acabou perto de zero), o detector de travamento nunca via
      // avanço e matava a rota depois do primeiro trecho.
      for (;;) {
        if (waypoints.length === 0) { clear(); return null; }
        const next = waypoints[0];
        dx = next.x - body.center.x;
        dy = next.y - body.center.y;
        distance = Math.hypot(dx, dy);
        if (distance > arrival) break;
        waypoints.shift();
        lastDistance = Infinity;
        stalledSteps = 0;
      }

      // Travou de verdade (porta trancada, móvel novo no caminho): desiste em vez
      // de ficar raspando a parede para sempre.
      if (distance < lastDistance - 0.5) {
        lastDistance = distance;
        stalledSteps = 0;
      } else if (++stalledSteps > STALLED_STEPS_LIMIT) {
        clear();
        return null;
      }

      return { vx: (dx / distance) * speed, vy: (dy / distance) * speed };
    },
  };
}
