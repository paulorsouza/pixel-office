# TUTORIAL — padrões de Phaser e debug neste cliente

Guia prático de Phaser + o fluxo de trabalho que funciona aqui. Para o schema do mapa e como editar
o escritório, veja [`README.md`](README.md); este doc é sobre **codar** o cliente.

---

## 1. O ciclo de trabalho

```
edita src/*.js ou maps/*.json  →  recarrega o navegador  →  OLHA  →  corrige
```
Segundos, não minutos — é a razão da stack ser web e não Unity.

**Regra número 1: OLHE.** Não é figura de linguagem — sempre verifique no navegador antes de dar algo
como pronto. A maioria dos bugs desta base veio de *assumir* uma medida em vez de olhar (ex: a porta
animada é 48px por frame, não 32).

```bash
node server.js       # http://localhost:8123
```

---

## 2. "Tem MCP pra Phaser?" — Não, e você não precisa

Procurei no registry: **não existe MCP para Phaser** (nem pra game engines em geral).

**Mas o MCP do navegador já é o MCP da engine.** No Unity precisávamos de um MCP porque o editor é
uma caixa-preta. Aqui, o navegador **é** a superfície de inspeção — e ele dá tudo que um "MCP de
engine" daria:

| O que você quer | Ferramenta do navegador |
|---|---|
| Rodar o jogo | `preview_start { name: "client-web" }` |
| **Ver** | `computer { action: "screenshot" }` |
| Dirigir (clicar, teclar) | `computer { action: "left_click" / "type" / "key" }` |
| **Inspecionar o estado do jogo** | `javascript_tool` — lê/escreve qualquer coisa em runtime |
| Erros | `read_console_messages { onlyErrors: true }` |
| Assets carregando (404?) | `read_network_requests { urlPattern: "..." }` |
| Testar responsivo | `resize_window` |

**O truque que destrava tudo:** exponha a cena num global.

```js
function create() {
  // ...
  window.__scene = this;   // agora dá pra inspecionar TUDO de fora
}
```

Com isso:
```js
// ver posição do player
__scene.player.x, __scene.player.y

// teleportar pra testar uma área sem andar até lá
__scene.player.setPosition(x, y); __scene.player.body.reset(x, y);

// ver as caixas de colisão (mão na roda)
__scene.physics.world.createDebugGraphic(); __scene.physics.world.drawDebug = true;

// checar se uma textura carregou / quantos frames tem
__scene.textures.get('office_door').frameTotal
```

### ⚠️ Ao testar sozinho, DESLIGUE o teclado
```js
__scene.input.keyboard.enabled = false;
__scene.input.keyboard.resetKeys();
```
**Por quê:** numa sessão, o boneco "andava sozinho" e eu passei rodadas caçando um bug de "tecla
grudada"… **era o usuário jogando** enquanto eu testava. Se você move o player por script e ele
deriva, é entrada humana — não bug.

E lembre de **religar** quando terminar (`enabled = true`, `startFollow`) — eu deixei desligado uma
vez e o usuário achou que a câmera e o teclado tinham quebrado.

---

## 3. Padrões de Phaser que funcionam aqui

### Config obrigatória pra pixel art
```js
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },  // sem borda preta
  pixelArt: true,                 // ⚠️ sem isto a arte fica borrada
  backgroundColor: '#5c8f3e',
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: { preload, create, update },
});
```
`cam.roundPixels = true` também ajuda a não tremer.

### Personagem (as folhas LimeZu)
```js
this.load.spritesheet('adam_run', 'assets/chars/Adam_run.png', { frameWidth: 16, frameHeight: 32 });

// ⚠️ ORDEM REAL: right(0-5), up(6-11), left(12-17), down(18-23)
const DIR = { right: 0, up: 6, left: 12, down: 18 };
for (const [d, s] of Object.entries(DIR)) {
  this.anims.create({ key: 'run-' + d,
    frames: this.anims.generateFrameNumbers('adam_run', { start: s, end: s + 5 }),
    frameRate: 12, repeat: -1 });
}
```

### Corpo de colisão nos "pés" (top-down)
O sprite é 16×32, mas quem colide é só a base:
```js
player.body.setSize(10, 8).setOffset(3, 22);
```

### YSort (passar na frente/atrás)
```js
// no update:
this.player.setDepth(this.player.y);
// nos objetos (árvore, prédio), origem na base:
tree.setOrigin(0.5, 1); tree.setDepth(tree.y);
```
⚠️ Se você der `setDepth(1)` fixo no player, ele **some atrás dos prédios**. Aconteceu.

### Piso grande = `tileSprite`, não milhares de sprites
```js
// ❌ 10.000 imagens = trava
for (...) this.add.image(x, y, 'tiles', floorFrame);

// ✅ 1 objeto
this.add.tileSprite(x, y, w, h, 'tiles', floorFrame).setOrigin(0, 0);
```
Vale pra grama, pisos e telhados. Exige que o tile seja **seamless** (ver `../ASSETS.md`).

### Zoom com scroll (importante pra jogo online)
```js
this.zoom = 2.2;
this.input.on('wheel', (p, o, dx, dy) => {
  this.zoom = Phaser.Math.Clamp(this.zoom - dy * 0.0018, 0.6, 5);
  this.cameras.main.setZoom(this.zoom);
});
```

### Porta animada ⚠️ (o erro que mais custou)
```js
// A folha é 672x32. FRAMES SÃO 48x32 ⇒ 14 frames (NÃO 32x32/21!)
this.load.spritesheet('office_door', 'assets/world/office_door.png', { frameWidth: 48, frameHeight: 32 });

// A folha é um CICLO: 0=fechada, 8=ABERTA, 13=fechada de novo.
// Tocar 0→13 faz a porta abrir E fechar sozinha. O certo é parar em 8:
const open = this.anims.generateFrameNumbers('office_door', { start: 0, end: 8 });
this.anims.create({ key: 'door-open',  frames: open,                     frameRate: 22, repeat: 0 });
this.anims.create({ key: 'door-close', frames: open.slice().reverse(),   frameRate: 22, repeat: 0 });
```

### Zonas (entrar/sair) — sempre com trava
```js
// Sem a trava, a zona re-dispara todo frame e vira ping-pong.
const inZone = Phaser.Geom.Rectangle.Contains(zone, px, py);
if (this.zoneLock && !inZone) this.zoneLock = false;   // só libera ao SAIR da zona
if (this.zoneLock) return;
if (inZone) { this.zoneLock = true; /* ...faz a ação... */ }
```

---

## 4. Receita: adicionar um asset novo

1. **Ache pelo nome** (os singles têm nome descritivo — muito mais rápido que caçar em folha grande):
   ```bash
   ls "…/LimeZu/exteriores/singles/" | grep -i gate      # ou escritorio/singles, interiores/singles…
   ```
2. **Meça** antes de usar:
   ```bash
   file arquivo.png | grep -oE "[0-9]+ x [0-9]+"
   ```
3. **Renderize ampliado e OLHE** — nunca assuma a grade. Foi assim que descobrimos que a porta era
   48px. (Ver o script em `../ASSETS.md` seção 5.)
4. **Copie pra `assets/`** com nome curto e versione (`git add`).
5. **Anote a medida no `../ASSETS.md`** pra ninguém redescobrir.

**Regra de ouro:** use sempre a versão **16×16** dos packs. 32/48 são upscale.

---

## 5. Debug: os problemas que já aconteceram

| Sintoma | Causa real |
|---|---|
| Animação "escorregando"/piscando | `frameWidth` errado no spritesheet (era 48, usei 32) |
| Porta abre e fecha sozinha | Tocando o ciclo inteiro (0→13) em vez de 0→8 |
| Quadrado preto com borda verde | Textura usada sem `this.load.image()` no preload |
| Player some atrás do prédio | `setDepth` fixo em vez de YSort por `y` |
| Borda preta em volta do jogo | Canvas fixo menor que a janela → use `Scale.RESIZE` |
| Player "anda sozinho" | **O usuário estava jogando.** Não é bug |
| Zona dispara em loop | Falta a trava (`zoneLock`) |
| Tudo travando | Milhares de `add.image` → use `tileSprite` |

**Primeiro reflexo sempre:** `read_console_messages { onlyErrors: true }` e
`read_network_requests` (404 de asset é campeão).

---

## 6. Arquitetura atual

O cliente já é **orientado a dados**: o mapa é JSON, não código. Três arquivos em `src/`:

```
src/
├── main.js          OfficeScene: preload, player, câmera/zoom, anims, update. Instancia o Editor.
├── MapRenderer.js    renderMap(scene, map, solids): desenha building/zones/rooms/paredes a partir do JSON.
└── Editor.js        Editor de móveis in-game (paleta HTML + colocar/mover/apagar + salvar no mapa).
maps/tooq-office.json  ← o escritório é DADO (schema em README.md)
```

**Onde mexer:**
- Estrutura do escritório (salas, zonas, portas, pisos) → `maps/tooq-office.json` (schema no README) e,
  se for lógica de desenho, `MapRenderer.js`.
- Móveis → editor in-game (`E`) ou o array `furniture` do JSON.
- Player/câmera/anims/controles → `main.js`.
- Ferramentas do editor (snap, flip, ancoragem, paleta) → `Editor.js`.

**Móvel = `{ id, x, y }`** onde `id` é `of_N`. A ancoragem hoje é ingênua (`origin(0.5,1)` no tile) —
peças multi-tile desalinham; corrigir isso (usar `w`/`h` do `data/furniture-catalog.json` + snap) é a
melhoria nº 1 do editor. Ver "Limitações conhecidas" no README.

**Rede (ainda não plugada):** o backend expõe SignalR e o contrato de mapa (`OfficeLayout.cs`,
**28 server units por tile**). Usar o cliente **SignalR JS oficial** (não reimplementar à mão).

---

## 7. As regras que mais importam

1. **Verifique no navegador antes de dar como pronto.** "Compilou" não é verificar; olhar é.
2. **O interior mobiliado é o produto** — fachada/telhado/jardim (em `assets/world/`) são enfeite.
3. **Mapa é dado.** Prefira editar o JSON / usar o editor a hardcodar geometria em JS.
4. **Rede cedo.** Dois avatares andando juntos vale mais que qualquer cenário externo.
5. **Anote toda medida de asset nova no `../ASSETS.md`.** É o conhecimento caro de recuperar.
