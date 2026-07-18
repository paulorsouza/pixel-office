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

**Controles:** `WASD`/setas para andar · `E` para entrar/sair · `Tab` para equipamentos · segure
`Shift` para usar o equipamento selecionado · `scroll` para zoom. Dentro de uma sala decorável,
use o botão `Decorar sala` para abrir o editor de móveis.

**Edição manual do mundo:** [`GUIA-MUNDO-ABERTO.md`](GUIA-MUNDO-ABERTO.md) ensina a ampliar o mapa
no Tiled, criar ruas, posicionar fachadas, configurar colisões e conectar novos interiores.

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
│   ├── CharacterSystem.js      avatar modular, editor, frames e persistência
│   ├── EquipmentSystem.js      loadout, inventário, velocidades e visuais
│   ├── RoomDecorationSystem.js editor de móveis por sala e persistência
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
    ├── furniture/catalog.json  catálogo curado do editor de salas
    ├── character/catalog.json   opções e grade do avatar modular
    ├── equipment/catalog.json   slots e itens do loadout orientado a dados
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
    "minZoom": 0.8,
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
runtime combina `minZoom` com o zoom necessário para caber esses limites inteiros na janela. Isso
permite uma visão geral ampla pelo scroll; quando a proporção da janela é diferente da proporção do
mapa, o fundo da cena ocupa margens centralizadas.

### Campos de interior

| Campo | Uso |
|---|---|
| `building` | Piso base, perímetro e portas do interior. |
| `yard` | Retângulo de terreno externo que pertence à mesma cena do interior. |
| `zones[]` | Áreas abertas marcadas por outro piso, como lounge, café ou time. |
| `rooms[]` | Salas fechadas, com paredes e portas próprias. |
| `furniture[]` | Móveis `{ id, x, y }`; aceita `solid: true` ou um `collision` explícito para peças multi-tile. |
| `assets[]` | IDs carregados apenas para aquela cena. |

Portas usam `{ side, at, len }`, onde `side` é `N`, `S`, `E` ou `W`; `at` é o deslocamento a partir
do canto e `len` é a largura do vão. Para uma porta visível estática, use também
`{ "texture": "office_door", "frame": 8 }`. Uma sala com `southWall3d: true` ganha face sul de
dois tiles; nela, `{ "texture": "interior_sliding_door", "automatic": true }` anima a porta ao
aproximar e afastar, desabilitando a colisão enquanto o vão está aberto.

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
`collision`. Em móveis, o footprint é relativo a `{x,y}`; `solid: true` continua disponível como
atalho genérico para peças pequenas.

O mapa de escritório usa `anim_coffee` como primeiro móvel animado orientado a dados. A spritesheet,
prévia do Tiled e metadados ficam em `assets/animations/`.

## Decoração de salas durante o jogo

Quando os pés do avatar estão dentro de uma entrada de `rooms[]`, aparece `Decorar <sala>`. O modo
de decoração pausa o avatar, enquadra a sala e abre um catálogo curado de mesas, estações,
assentos, armazenamento e decoração. Clique num item e depois no chão para adicioná-lo; escolha
`Mover` para selecionar e arrastar. Também é possível espelhar, remover, desfazer e refazer.

O editor trabalha em uma grade de meio tile e rejeita móveis fora do piso útil, sobre outro móvel
ou na área de circulação das portas. Colisões são criadas, movidas e removidas junto com a peça,
sem recarregar a cena. As alterações são salvas automaticamente no `localStorage`, sob a chave
`office-quest-room-decoration-v1`, isoladas por `sceneId` e `roomId`. `Restaurar sala` apaga a
personalização daquela sala e reaplica a decoração do mapa-base.

Este recurso edita **apenas móveis**. Paredes, portas, pisos, ruas, portais, câmera e dimensões
continuam sendo level design no Tiled. Assim, o `.tmj` permanece a fonte estrutural e a decoração do
usuário é uma camada sobre o JSON convertido. `createRoomDecorationStore` já possui o callback
`onSave`; ele é o ponto previsto para trocar o armazenamento local por uma API/SignalR quando a
decoração precisar ser compartilhada entre usuários.

## Loadout e equipamentos

`Tab` abre e fecha uma ficha RPG com seis slots: veículo, corrente, brincos, pulseira, teclado e mouse. O baú
mostra os itens disponíveis; clicar em um item o equipa automaticamente no slot correspondente e
clicar em um slot preenchido devolve o item ao baú. `Guardar tudo` esvazia o conjunto. O loadout
inteiro fica salvo no navegador e escolhas antigas de veículo são migradas automaticamente.

No slot de veículo, `1` a `4` equipam rapidamente e `0` guarda o veículo. O avatar continua andando
normalmente até o jogador segurar `Shift`; nesse momento o veículo aparece, a animação correspondente
é usada e a velocidade muda. Abrir o menu interrompe o movimento para evitar teclas presas. Os cinco
slots de acessórios e periféricos já têm catálogo e persistência, mas ainda não modificam atributos
ou o sprite do personagem. Não existe indicador fixo de veículo no HUD; essa informação fica na
ficha para deixar a visão do mundo mais limpa.

Os valores ficam em `assets/equipment/catalog.json`, sem hardcode no loop de movimento:

| Equipamento | Velocidade atual | Pose do avatar |
|---|---:|---|
| Skate | 150 px/s | equilíbrio estável |
| Patins | 166 px/s | deslize com pés fixos |
| Patinete elétrico | 188 px/s | em pé |
| Moto | 232 px/s | sentado |

A caminhada base é 112 px/s. Para balancear, altere `walkSpeed` ou a `speed` dos itens cujo
`slot` é `vehicle` e
recarregue. `riderSheet` escolhe a spritesheet padrão; `riderDirections` pode substituir folha,
largura e intervalo de frames por direção. `frameRate`, `accent`, `secondary` e `trail` controlam
animação e aparência. Os veículos da primeira versão são pixel art procedural
desenhada por `EquipmentSystem.js`; assim o catálogo já funciona sem depender de um sprite de
veículo inexistente nos packs comprados. A pose sentada da moto usa o recorte LimeZu
`assets/chars/Adam_sit.png` nas laterais. Como essa folha não possui frente/costas, a moto reutiliza
`Adam_idle_anim.png` ao subir e descer. Skate e patins também usam a folha `adam_idle` para não
simular passadas enquanto deslizam; os patins declaram `renderLayer: "front"` para cobrir os sapatos
do personagem e manter as botas presas aos pés.

## Customização do personagem

Abra o menu com `Tab` e selecione a aba `Personagem`. A primeira versão combina cinco camadas
LimeZu — pele, olhos, roupa, cabelo e acessório — mostra uma prévia nas quatro direções e aplica cada
troca imediatamente no avatar do mundo. `Aleatorizar` cria uma combinação; `Restaurar` volta ao
conjunto padrão. A escolha fica no `localStorage` sob `office-quest-character-v1`.

As opções ficam em `assets/character/catalog.json`. Cada categoria possui `id`, nome e `options`;
cada opção visual declara `id`, `name`, `path` e uma cor `accent` usada pela UI. A opção `none` de
acessório não possui `path`. Para acrescentar um visual:

1. copie uma folha **modular completa e alinhada** para a subpasta adequada em `assets/character/`;
2. cadastre a opção na categoria correta do catálogo;
3. recarregue e confira frente, costas e laterais na prévia;
4. teste caminhada e os quatro veículos, principalmente a pose lateral da moto.

Não recorte a folha em imagens soltas. `CharacterSystem.js` registra frames de 16×32 diretamente
nas linhas `idle`, `walk` e `sit` informadas pelo catálogo e sobrepõe as camadas na ordem declarada.
O antigo sprite Adam permanece invisível como corpo físico, preservando câmera, colisão e portais.

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
3. Levar a decoração de salas do armazenamento local para backend/SignalR com permissão por dono.
4. Adicionar novas cenas de destino ao hub.
5. Conectar A/V por proximidade com LiveKit depois da presença em rede.

O arquivo `Editor.js` foi preservado como referência, mas não participa do runtime. O Tiled cuida
da estrutura das cenas; `RoomDecorationSystem.js` cuida exclusivamente dos móveis que o usuário
personaliza durante o jogo.
