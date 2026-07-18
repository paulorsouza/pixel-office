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

### Avatar modular e editor de aparência

`CharacterSystem.js` substitui apenas o desenho do jogador: o sprite físico original continua
invisível e mantém colisão, velocidade e câmera. Cada opção é uma folha completa do Character
Generator; o runtime registra frames de 16×32 nas linhas descritas por
`assets/character/catalog.json` e cria um sprite por categoria, nesta ordem:

```text
body → eyes → outfit → hairstyle → accessory
```

O mesmo catálogo abastece a aba `Personagem` do menu de `Tab` e as prévias CSS. Não crie offsets
por cabelo ou roupa: assets do Character Generator já são alinhados e devem permanecer na mesma
posição. Para depurar sem tocar no storage, leia `window.__character.getSelection()`. Também estão
expostos `select(categoryId, optionId)`, `setTab('character')`, `randomize()` e `reset()`.

Ao adicionar outra pose, primeiro declare sua linha, quantidade de frames e FPS em `frame.poses`;
depois ensine `characterFrameSpec()` quando ela deve ser usada. A moto usa `sit` somente de lado,
pois essa pose não possui frente/costas; na vertical o fallback é `idle`.

### Editor de móveis durante o jogo

`RoomDecorationSystem.js` mantém a personalização do usuário fora do mapa-base. Na abertura da
cena, `createRoomDecorationStore().mapForScene(sceneId)` clona o JSON convertido e substitui apenas
os móveis das salas que possuem estado salvo. Durante a edição, os records expostos por
`MapRenderer.js` permitem mover visual e collider juntos sem reconstruir a cena inteira.

O catálogo fica em `assets/furniture/catalog.json`; inclua nele somente peças autorizadas para o
usuário. Cada item pode declarar seu footprint `collision`. A validação impede sair da sala,
bloquear portas e sobrepor móveis. Não estenda esse editor para paredes ou portais: mudanças
estruturais pertencem ao Tiled e ao conversor.

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

Em cenas cercadas, configure `camera.bounds` no JSON até o portão. O runtime combina o `minZoom`
configurado com o zoom necessário para mostrar esses limites inteiros. No extremo do scroll, a cena
vira uma visão geral; margens recebem a cor de fundo quando a proporção da janela não coincide com a
do mapa, e o runtime expande os limites virtuais para manter a cena centralizada.

### Loadout RPG e veículo temporário com Shift

O menu, os seis slots, a persistência e o desenho dos veículos vivem em `EquipmentSystem.js`. O
catálogo separado em `assets/equipment/catalog.json` possui `slots[]` e `items[]`; cada item declara
seu `slot`. O loop consulta apenas o item equipado em `loadout.vehicle` a cada frame:

```js
const profile = movementProfile(catalog, menu.getEquippedId(), shiftKey.isDown);
const speed = profile.speed; // caminhada ou velocidade do equipamento
```

`profile.active` só é verdadeiro quando existe um item do slot `vehicle` equipado **e** Shift está
pressionado. Correntes, brincos e periféricos nunca chegam ao perfil de movimento. Esse
mesmo estado governa velocidade, spritesheet do piloto, veículo e rastro; não espalhe verificações
independentes de Shift pelo runtime. O menu abre e fecha com `Tab` e não mantém um indicador fixo de
veículo no HUD. Ao acrescentar um item, cadastre seus
dados e o slot no JSON. Só veículos precisam de `speed`, pose e desenho em `drawEquipment`.
Quando o equipamento precisa cobrir parte do personagem, como as botas dos patins, use
`renderLayer: "front"`; skate e os veículos maiores continuam atrás do piloto. Para veículos que
deslizam, prefira `riderSheet: "adam_idle"` a reutilizar a corrida, evitando passadas sem contato
com a prancha ou com as rodas.

Para conferir o estado durante debug, `window.__equipment` expõe `getEquipment()`, `getLoadout()`,
`select(id)`, `unequip(slotId)`, `clearAll()` e `isOpen()`. A cena continua disponível em
`window.__scene`.

Para inspecionar um visual continuamente, sem precisar manter Shift pressionado durante uma captura,
use `?equipmentPreview=<id>`; por exemplo:

```text
http://localhost:8123/?scene=tooq-office&equipmentPreview=motorcycle
```

Esse parâmetro só força a ativação para debug e não altera o item salvo pelo jogador.
Acrescente `&equipmentDirection=up`, `down`, `left` ou `right` para fixar a orientação sem usar o
teclado durante uma captura.

⚠️ `Adam_sit.png` é a exceção à grade normal: são **12 frames de 32×32**, seis olhando para a
direita e seis para a esquerda; não há frente/costas. Fatiar em 16×32 alterna as duas metades do
piloto e faz a moto piscar. O catálogo usa `riderDirections` para manter `Adam_sit` nas laterais e
substituí-lo pelos frames `up/down` de `Adam_idle_anim.png` na vertical.

### Colisão como parte dos dados

Props externos declaram o footprint relativo ao ponto de origem:

```jsonc
{
  "texture": "tree1",
  "x": 47,
  "y": 43.5,
  "originX": 0.5,
  "originY": 1,
  "collision": { "x": -1.2, "y": -0.8, "w": 2.4, "h": 0.8 }
}
```

Para móveis internos, `solid: true` cria o footprint padrão nos pés. Use colisão explícita para
fachadas ou formas com vãos, como a porta do prédio. A rota `?debug=collisions` desenha os corpos
físicos para conferência visual.

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

O mapa interno também reutiliza o frame `8` como porta de vidro estática nos vãos de
`building.doors` e `rooms[].doors`. O renderer centraliza automaticamente a imagem de 48×32 em um
vão de três tiles, mantendo a passagem física aberta.

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

O cliente é **multi-cena e orientado a dados**: os mapas são JSON, não classes Phaser separadas.

```
src/main.js             runtime, player, câmera, HUD e transições
src/CharacterSystem.js  avatar modular, editor, frames nomeados e persistência
src/EquipmentSystem.js  loadout, baú, persistência, velocidade e desenho dos veículos
src/MapRenderer.js      desenha mapas world/interior a partir do JSON
src/Editor.js           editor antigo, preservado mas fora do runtime atual
maps/scenes.json        manifesto e cena inicial
maps/world.json         hub caminhável
maps/tooq-office.json   escritório térreo
tiled/maps/*.tmj        fontes visuais editáveis
tools/tiled-converter.mjs  gera e valida os JSONs do runtime
```

**Onde mexer:**
- Cadastro de cenas → `maps/scenes.json`.
- Mundo, salas, móveis, colisões e portais → `tiled/maps/*.tmj`, seguido do conversor.
- JSONs gerados → `maps/world.json` e `maps/tooq-office.json`, úteis para inspeção.
- Player/câmera/anims/controles → `main.js`.
- Aparência, catálogo e composição do avatar → `assets/character/catalog.json` + `CharacterSystem.js`.
- Slots, itens, menu e visuais de locomoção → `assets/equipment/catalog.json` + `EquipmentSystem.js`.
- Regras de desenho e colisões → `MapRenderer.js`.

**Portal** liga um retângulo da cena atual a `targetScene` + `targetSpawn`. `E` é reservado à
interação de entrar/sair. **Móvel = `{ id, x, y }`**, onde `id` é `of_N`; use `solid: true` quando a
peça precisar bloquear o avatar.

**Rede (ainda não plugada):** o backend expõe SignalR e o contrato de mapa (`OfficeLayout.cs`,
**28 server units por tile**). A presença precisa carregar `sceneId` para só renderizar avatares que
estejam no mesmo mapa. Usar o cliente **SignalR JS oficial** (não reimplementar à mão).

---

## 7. As regras que mais importam

1. **Verifique no navegador antes de dar como pronto.** "Compilou" não é verificar; olhar é.
2. **O interior mobiliado é o produto** — fachada/telhado/jardim (em `assets/world/`) são enfeite.
3. **Mapa é dado.** Prefira editar o JSON a hardcodar geometria em JS.
4. **Rede cedo.** Dois avatares andando juntos vale mais que qualquer cenário externo.
5. **Anote toda medida de asset nova no `../ASSETS.md`.** É o conhecimento caro de recuperar.
