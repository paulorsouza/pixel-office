# client-web — cliente do jogo (Office Quest / Tooq)

Escritório virtual 2D top-down em **Phaser 3**, estilo Gather.town. É o cliente oficial do projeto.

O mapa é **dado, não código**: o escritório inteiro está descrito em `maps/tooq-office.json` e
desenhado por `src/MapRenderer.js`. Você edita o escritório de duas formas — **na mão** (editando o
JSON) ou **dentro do jogo** (editor de móveis, tecla `E`). As duas gravam o mesmo arquivo.

> 📖 Para padrões de Phaser e o fluxo de debug no navegador, veja [`TUTORIAL.md`](TUTORIAL.md).
> Para medidas de assets já verificadas (não redescobrir), veja [`../ASSETS.md`](../ASSETS.md).

---

## Rodar

```bash
node server.js          # http://localhost:8123
```

Zero instalação: o Phaser está vendorizado (`phaser.min.js`, sem CDN) e o `server.js` usa só
`http`/`fs` do Node. Com um agente que suporte preview: `preview_start { name: "client-web" }`
(config em `.claude/launch.json`, porta 8123).

**Controles:** `WASD`/setas andar · `scroll` zoom · `E` liga/desliga o editor de móveis.

---

## Estrutura

```
client-web/
├── index.html                canvas fullscreen + hint de controles
├── server.js                 estático Node + POST /api/map/<nome> (salva o mapa)
├── phaser.min.js             Phaser 3.80.1 vendorizado
├── src/
│   ├── main.js               config do Phaser + OfficeScene (player, câmera, anims, update)
│   ├── MapRenderer.js         desenha o mapa a partir do JSON (pisos, zonas, paredes 3D, portas)
│   └── Editor.js             editor de móveis in-game (paleta HTML + colocar/mover/apagar/salvar)
├── maps/
│   └── tooq-office.json       ← O ESCRITÓRIO (dado). É isto que você edita.
├── data/
│   └── furniture-catalog.json lista dos 339 móveis {id,w,h} p/ a paleta do editor
└── assets/
    ├── chars/                 Adam (24 frames 16×32)
    ├── tiles/                 room_builder.png (paredes/estrutura do Office)
    ├── floors/                floor_wood/carpet/cream/sage/water.png (pisos lisos)
    ├── furniture/office/      of_1..of_339.png (móveis do Office Revamped)
    └── world/                 fachada TOOQ BMS, jardim, telhado — do mundo externo (não usado ainda)
```

---

## O mapa é dado — schema de `maps/tooq-office.json`

Coordenadas em **tiles** (1 tile = 16px). O renderer resolve `x*16` etc.

```jsonc
{
  "id": "tooq-office",
  "name": "Escritório Tooq — Térreo",
  "tile": 16,
  "w": 126, "h": 78,                 // tamanho do mundo em tiles

  "building": {                       // contorno do prédio: parede de perímetro + porta
    "x": 2, "y": 2, "w": 120, "h": 72,
    "floor": "wood",                  // piso base do salão inteiro
    "doors": [ { "side": "S", "at": 58, "len": 4 } ]
  },

  "spawn": { "x": 40, "y": 40 },      // onde o player nasce (em tiles)

  "zones": [                          // ÁREAS ABERTAS: só um tapete de piso, SEM parede
    { "name": "Cozinha", "x": 6, "y": 22, "w": 22, "h": 14, "floor": "sage" }
  ],

  "rooms": [                          // SALAS FECHADAS: piso + parede fina + porta
    { "id": "p1", "name": "Sala Pessoal 1", "x": 3, "y": 3, "w": 18, "h": 13,
      "floor": "light", "doors": [ { "side": "S", "at": 8, "len": 2 } ] }
  ],

  "furniture": [                      // móveis por cima de tudo (editados pelo editor ou à mão)
    { "id": "of_227", "x": 30, "y": 40 }
  ]
}
```

### Campos

| Campo | O que é |
|---|---|
| `building` | Contorno do prédio: piso base + parede de perímetro + porta(s). Um por mapa. |
| `zones[]` | **Área aberta** (cozinha, lounge, piscina, zona de time). Só pinta um tapete de piso e um rótulo. **Não tem parede** — é o estilo Gather de salão aberto. |
| `rooms[]` | **Sala fechada** (ex: sala pessoal de cada pessoa). Piso + parede fina + porta. `id` é a chave estável. |
| `furniture[]` | Cada móvel = `{ id, x, y }`. `id` = `of_N` (arquivo `assets/furniture/office/of_N.png`). |
| `doors[]` | `{ side, at, len }`. `side` = `N`/`S`/`E`/`W`. `at` = offset (em tiles) a partir do canto do rect. `len` = largura do vão. Buraco na parede naquele trecho. |
| `floor` | Nome lógico → textura (tabela abaixo). |

### Pisos disponíveis (`floor`)

| Nome | Textura | Uso típico |
|---|---|---|
| `wood` | madeira quente | piso base do salão |
| `gray` | carpete azul-cinza | zonas de time |
| `light` | tile creme claro | salas pessoais |
| `terra` | verde-acinzentado (sage) | lounge/cozinha |
| `water` | água | piscina |

Para adicionar um piso novo: recorte a textura para `assets/floors/floor_<nome>.png`, carregue no
`preload` de `main.js` e mapeie o nome em `FLOORS` no topo de `MapRenderer.js`.

### Paredes

Perímetro do prédio e salas usam parede fina (laterais/sul) + **parede norte 3D** de 2 tiles (topo +
face de tijolo). A face de tijolo é a superfície pensada para pendurar decoração (quadro/TV/troféu) —
ainda não há móveis de parede colocados. Detalhes das peças em [`../ASSETS.md`](../ASSETS.md) §3.2.

---

## Como editar o escritório

### A) Na mão (hardcode) — para estrutura

Melhor para prédio, zonas, salas e portas. Edite `maps/tooq-office.json` e recarregue o navegador.
É geometria simples em tiles; use o `spawn` para nascer perto do que está mexendo.

### B) No jogo (editor de móveis) — para mobília

1. Rode, aperte `E`. Abre a paleta à direita (thumbnails dos 339 móveis) e o modo edição.
2. **Colocar:** clique numa peça na paleta → clique no mapa. `WASD` move a câmera nesse modo.
3. **Mover/apagar:** botão **Selecionar** → clique numa peça → arraste, ou `Delete`/`Backspace`.
4. **Salvar:** botão **💾 Salvar** → grava em `maps/tooq-office.json` via `POST /api/map/...`.
5. `E` de novo sai do editor e devolve a câmera ao player.

O editor lê e grava o **mesmo** `maps/tooq-office.json`, então A e B são intercambiáveis.

---

## Referência rápida de móveis (`of_N`)

IDs já conferidos visualmente (arquivos `assets/furniture/office/of_N.png`). Os 339 estão na
paleta do editor com thumbnail — esta lista é só um atalho para os mais usados:

| Peça | ID | Obs |
|---|---|---|
| Monitor duplo | `of_227` | vista de cima |
| Monitor simples | `of_285` | |
| Cadeira (topo) | `of_286`, `of_287` | vista de cima |
| Cadeira (lado) | `of_277`, `of_278` | |
| Mesa em L | `of_260`, `of_265`, `of_291` | estações de trabalho |
| Vaso de planta | `of_98`, `of_99`, `of_100` | |

---

## Limitações conhecidas (bom saber antes de mobiliar)

- **Ancoragem dos móveis.** `Editor.js._addSprite` posiciona a peça com origem `(0.5, 1)` na base do
  tile clicado. Peças maiores que 1 tile (mesas, monitores em canvas 32×48) **não encaixam** na grade
  — o monitor "flutua" e a mesa desalinha. É a melhoria nº 1 do editor: ancorar pelo footprint real de
  cada peça (usar `w`/`h` do catálogo, snap ao tile). Enquanto não resolvido, compor cenas bonitas com
  peças multi-tile exige ajuste fino manual.
- **Sem rede.** O cliente é single-player hoje. Backend (SignalR, porta 5210) e LiveKit existem mas
  ainda não estão plugados. Contrato de mapa: **28 server units por tile** (`OfficeLayout.cs`).
- **Sem colisão de móveis.** Só paredes colidem; móveis são decorativos (dá pra andar por cima).
- **Editor sem flip/rotate nem categoria/busca** na paleta (339 thumbnails soltos).

---

## Próximos passos sugeridos

1. Corrigir a ancoragem dos móveis no editor (footprint + snap) — destrava mobiliar de verdade.
2. Mobiliar o interior (estações de trabalho, cozinha, lounge, salas pessoais).
3. Plugar rede (SignalR JS) — dois avatares no mesmo mapa.
4. Decoração de parede na face de tijolo (quadros/TV/troféu).
5. A/V por proximidade (LiveKit JS).
