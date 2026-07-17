# client-web — cliente do jogo (Office Quest / Tooq)

Cliente oficial em **Phaser 3**, acessível por link e sem etapa de build.

A navegação é composta por **várias cenas independentes**. O jogador explora um mundo aberto que
funciona como hub e escolhe os locais em que quer entrar. Cada local é outro mapa JSON; não existe
conceito de múltiplos andares na arquitetura atual.

> Para editar visualmente no Tiled, veja [`tiled/README.md`](tiled/README.md). Para entender o
> schema e também editar manualmente, veja [`GUIA-EDICAO.md`](GUIA-EDICAO.md). Para padrões de Phaser e debug, veja
> [`TUTORIAL.md`](TUTORIAL.md). Para medidas e IDs de assets já conferidos, veja
> [`../ASSETS.md`](../ASSETS.md).

## Rodar

```bash
node server.js          # http://localhost:8123
```

Phaser 3.80.1 está vendorizado e o servidor estático usa apenas Node.

**Controles:** `WASD`/setas para andar · `E` para entrar/sair · `scroll` para zoom.

## O corte vertical atual

```text
Quintal Tooq (hub compacto e cercado)
        │ porta + E
        ▼
Escritório Tooq (térreo + quintal privado)
        │ portão + E
        └──────────────► Mundo Tooq
```

- `maps/scenes.json` registra as cenas e define a inicial.
- `maps/world.json` descreve o pequeno pátio central, a fachada e o portal de entrada.
- `maps/tooq-office.json` descreve o interior, a mobília, o quintal privado e o portão de saída.
- `tiled/maps/*.tmj` são as fontes visuais editáveis; o conversor gera os dois JSONs acima.
- `src/main.js` mantém um único runtime Phaser e reinicia a cena com o mapa e o spawn de destino.
- `src/MapRenderer.js` renderiza mundos e interiores a partir dos dados.

## Estrutura relevante

```text
client-web/
├── index.html
├── server.js
├── phaser.min.js
├── src/
│   ├── main.js                 runtime, movimento, câmera, HUD e transições
│   ├── MapRenderer.js          renderer dos tipos world e interior
│   └── Editor.js               editor antigo; ainda não ligado ao novo runtime
├── maps/
│   ├── scenes.json             manifesto de cenas
│   ├── world.json              runtime gerado do hub
│   └── tooq-office.json        runtime gerado do escritório
├── tiled/
│   ├── office-quest.tiled-project
│   ├── maps/                    fontes .tmj editáveis no Tiled
│   └── tilesets/                paletas de pisos, paredes, mundo e móveis
├── tools/
│   └── tiled-converter.mjs      conversão, validação e atualização das prévias
└── assets/
    ├── chars/
    ├── tiles/
    ├── floors/
    ├── furniture/office/
    └── world/
```

## Fluxo de edição no Tiled

Abra `tiled/office-quest.tiled-project`, edite e salve o `.tmj`. Depois, na raiz do repositório:

```powershell
node client-web/tools/tiled-converter.mjs validate all
node client-web/tools/tiled-converter.mjs from-tiled all
node client-web/server.js
```

O runtime continua simples e sem etapa obrigatória de build para o usuário final. A conversão só
acontece durante o desenvolvimento, quando o mapa visual é alterado. O comando
`to-tiled all --force` faz o caminho inverso e sobrescreve os TMJs; use apenas para reiniciar a
fonte visual a partir dos JSONs.

## Manifesto de cenas

`maps/scenes.json` é o ponto de entrada. Para cadastrar um novo local:

```jsonc
{
  "startScene": "world",
  "scenes": [
    { "id": "world", "file": "world.json" },
    { "id": "tooq-office", "file": "tooq-office.json" },
    { "id": "arcade", "file": "arcade.json" }
  ]
}
```

Os IDs usados em `portals[].targetScene` precisam existir nesse manifesto.

## Contrato comum de um mapa

Coordenadas são expressas em tiles; hoje um tile visual tem 16 px.

```jsonc
{
  "id": "tooq-office",
  "name": "Escritório Tooq",
  "subtitle": "Térreo · espaço de trabalho e quintal privado",
  "kind": "interior",             // "world" ou "interior"
  "tile": 16,
  "w": 56,
  "h": 52,
  "camera": {
    "zoom": 2.1,
    "minZoom": 1.2,
    "bounds": { "x": 1, "y": 1, "w": 54, "h": 51 }
  },

  "spawns": {
    "default": { "x": 28, "y": 31 },
    "entrance": { "x": 28, "y": 31 },
    "yard-gate": { "x": 28, "y": 49 }
  },

  "portals": [
    {
      "id": "yard-exit",
      "x": 26, "y": 49, "w": 4, "h": 3,
      "targetScene": "world",
      "targetSpawn": "from-office",
      "label": "Sair pelo portão"
    }
  ]
}
```

O portal é um retângulo sensível ao pé do avatar. Dentro dele, o HUD mostra a ação; `E` faz fade,
carrega `targetScene` e posiciona o jogador em `targetSpawn`.

`camera.bounds` também usa tiles. Nos mapas cercados, o limite inferior coincide com o portão. O
runtime calcula um zoom mínimo adicional conforme a janela, impedindo que a câmera revele área vazia
fora desses limites.

### Campos de interior

| Campo | Uso |
|---|---|
| `building` | Piso base, perímetro e portas do interior. |
| `yard` | Retângulo de terreno externo que pertence à mesma cena do interior. |
| `zones[]` | Áreas abertas marcadas por outro piso, como lounge, café ou time. |
| `rooms[]` | Salas fechadas, com paredes e portas próprias. |
| `furniture[]` | Móveis `{ id, x, y }`; `solid: true` adiciona colisão no footprint. |
| `assets[]` | IDs carregados apenas para aquela cena. |

Portas usam `{ side, at, len }`, onde `side` é `N`, `S`, `E` ou `W`; `at` é o deslocamento a partir
do canto e `len` é a largura do vão. Para uma porta visível, use também
`{ "texture": "office_door", "frame": 8 }`: o renderer encaixa o frame aberto no vão.

Pisos existentes: `wood`, `gray`, `light`, `terra` e `water`.

### Campos de mundo

| Campo | Uso |
|---|---|
| `ground` | Textura repetida do terreno. |
| `paths[]` | Retângulos de caminho usando a mesma paleta de pisos. |
| `details[]` | Detalhes pequenos do terreno. |
| `hedges[]` | Cercas visuais que também colidem. |
| `props[]` | Fachadas, árvores, bancos, flores e outros sprites. Aceita um footprint `collision`. |
| `collisions[]` | Retângulos de colisão desacoplados do visual. |

Os campos externos (`paths`, `details`, `hedges`, `props` e `collisions`) também podem ser usados em
um mapa `interior` que possua `yard`. Um prop sólido mantém visual e física próximos no JSON:

```jsonc
{
  "texture": "bench",
  "x": 9,
  "y": 47,
  "originX": 0.5,
  "originY": 1,
  "collision": { "x": -1.5, "y": -0.55, "w": 3, "h": 0.55 }
}
```

Flores e detalhes de grama não têm colisão de propósito. Elementos volumosos devem declarar
`collision` (props) ou `solid: true` (móveis).

## Criar uma nova cena

1. Crie `maps/<id>.json` com um `spawns.default` e dimensões válidas.
2. Cadastre o arquivo em `maps/scenes.json`.
3. Adicione um portal de ida na cena de origem e um portal de volta na nova cena.
4. Coloque os assets em `assets/world/` ou `assets/furniture/office/` e regenere os tilesets.
5. Teste os dois sentidos no navegador e confira colisões, spawn e prompt de interação.

Para abrir uma cena perto de um ponto durante debug:

```text
http://localhost:8123/?scene=tooq-office&spawn=entrance
```

Para conferir todos os corpos físicos:

```text
http://localhost:8123/?scene=world&debug=collisions
http://localhost:8123/?scene=tooq-office&spawn=yard-gate&debug=collisions
```

## Estado e próximos passos

Esta versão prova o fluxo completo entre cenas e traz uma composição inicial do mundo e do
escritório. Ainda faltam:

1. Conectar SignalR e isolar presença por `sceneId`; dois avatares na mesma cena é o próximo marco.
2. Refinar a integração do Tiled com propriedades tipadas e atualização de prévia dentro do editor.
3. Persistir mapas customizados sem acoplar o cliente a um único escritório.
4. Adicionar novas cenas de destino ao hub.
5. Conectar A/V por proximidade com LiveKit depois da presença em rede.

O arquivo `Editor.js` foi preservado como referência, mas não participa do runtime. A edição visual
é feita no Tiled; os JSONs continuam disponíveis para inspeção e ajustes manuais pontuais.
