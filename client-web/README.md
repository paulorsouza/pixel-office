# client-web — cliente do jogo (Office Quest / Tooq)

Cliente oficial em **Phaser 3**, acessível por link e sem etapa de build.

A navegação é composta por **várias cenas independentes**. O jogador explora a cidade e escolhe os
locais em que quer entrar. Andares também são cenas: elevador e escadas usam portais orientados a
dados para ligar o Tooq Office às alas pessoais.

> Para editar visualmente no Tiled, veja [`tiled/README.md`](tiled/README.md). Para entender o
> schema e também editar manualmente, veja [`GUIA-EDICAO.md`](GUIA-EDICAO.md). Para padrões de Phaser e debug, veja
> [`TUTORIAL.md`](TUTORIAL.md). Para medidas e IDs de assets já conferidos, veja
> [`../ASSETS.md`](../ASSETS.md).

## Rodar

```bash
node server.js          # http://localhost:8123
```

Phaser 3.80.1 está vendorizado e o servidor estático usa apenas Node.

**Controles:** `WASD`/setas para andar · `E` para interagir ou entrar/sair · `Tab` para equipamentos · segure
`Shift` para usar o equipamento selecionado · `scroll` para zoom. A lista completa fica na folha
**Como jogar**, no dock — não há mais tira fixa de teclas no rodapé.

**Dock:** a barra de ícones no canto inferior esquerdo é a porta de entrada dos menus — Trabalho,
Personagem, Itens, Loja, Cartas, Decorar (só onde a sala é sua) e Como jogar. Em tela até 760px ela
vira um botão `☰` que abre a mesma lista como folha de tela cheia. O chassi está em
`src/hud/` e todo painel novo se registra nele (`HudShell.register`), senão clique e pinça vazam
para o mundo atrás.

**Central do jogador:** `Cartas`, no dock, abre Álbum, Boosters,
Baralho, Horas, Objetivos, Quadro e Backlog. Cada jogador começa com o álbum vazio e três boosters
de cinco cartas; depois de montar e salvar um baralho de 9 cartas, aproxime-se de outro jogador,
clique no avatar dele e escolha `Desafiar`.

Arquitetura, chances, persistência e roteiro completo de teste:
[`../docs/CARDGAME.md`](../docs/CARDGAME.md).

**Edição manual do mundo:** [`GUIA-MUNDO-ABERTO.md`](GUIA-MUNDO-ABERTO.md) ensina a ampliar o mapa
no Tiled, criar ruas, posicionar fachadas, configurar colisões e conectar novos interiores.

## O corte vertical atual

```text
Cidade Tooq (hub cercado 220×150)
  ├── Tooq Office ── elevador/escadas ── alas pessoais públicas
  ├── Coworking
  ├── Dark Company
  ├── Casino Nerd ── Arrange Dice · Nerd Slots · Blackjack
  └── Vila dos Jogadores ── 12 portais ── interiores vazios dinâmicos
```

- `maps/scenes.json` registra as cenas e define a inicial.
- `tiled/maps/world.tmj` descreve a cidade cercada, estradas, três empresas e o vilarejo de 12 casas.
- `tiled/maps/tooq-office.tmj` é o Coworking, com interior, mobília, quintal e portão de saída.
- `tiled/maps/tooq-office-1.tmj` é a Dark Company, o escritório grande afastado do spawn.
- `tiled/maps/tooq-campus.tmj` é o Tooq Office central e contém suas áreas comuns.
- `tiled/maps/casino-nerd.tmj` é o salão de jogos: três mesas de Arrange Dice, duas máquinas de
  Nerd Slots e uma mesa de Blackjack. Cada instância declara `gameId` e `tableId` no mapa.
- `tiled/maps/personal-wing.tmj` é o andar público de 6 salas pessoais (o prédio começa com dois).
- `tiled/maps/player-home-shell.tmj` é o interior vazio compartilhado pelas futuras casas compráveis.
- `src/TiledRuntimeLoader.js` lê mapas, tilesets externos e templates diretamente no navegador.
- Ao salvar no Tiled, o servidor valida o projeto e recarrega o jogo; nenhum runtime é gerado.
- `src/main.js` mantém um único runtime Phaser e reinicia a cena com o mapa e o spawn de destino.
- `src/MapRenderer.js` renderiza mundos e interiores a partir dos dados.

## Estrutura relevante

```text
client-web/
├── index.html
├── server.js
├── phaser.min.js
├── lib/signalr.min.js          cliente SignalR oficial vendorizado
├── src/
│   ├── main.js                 runtime, movimento, câmera, HUD e transições
│   ├── CharacterSystem.js      avatar modular, editor, frames e persistência
│   ├── EquipmentSystem.js      loadout, inventário, velocidades e visuais
│   ├── RoomDecorationSystem.js editor de móveis por sala e persistência
│   ├── GameItemsSystem.js       REST, cache de inventário e SignalR
│   ├── FurnitureInteractionSystem.js kanban, baú, cadeira, estação e café
│   ├── CoffeeLifecycle.js       duração da xícara e consumo sentado
│   ├── DevMapSync.js           feedback e recarga após salvar no Tiled
│   ├── TiledRuntimeLoader.js   carregamento direto de TMJ, TSJ e templates
│   ├── mechanics/              registro e handlers reutilizáveis de gameplay
│   ├── MapRenderer.js          renderer dos tipos world e interior
│   └── Editor.js               editor antigo; ainda não ligado ao novo runtime
├── maps/
│   ├── scenes.json             manifesto de cenas
│   ├── world.json              snapshot legado para migração/testes
│   └── *.json                  snapshots legados para migração/testes
├── tiled/
│   ├── office-quest.tiled-project
│   ├── maps/                    fontes .tmj editáveis no Tiled
│   └── tilesets/                paletas de pisos, paredes, mundo e móveis
├── tools/
│   └── tiled-converter.mjs      migração e diagnóstico; não participa do runtime
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

Na raiz do repositório, inicie uma vez:

```powershell
node client-web/server.js
```

Abra `tiled/office-quest.tiled-project`, edite e salve. O servidor valida todos os arquivos usados e
o navegador recarrega quando necessário. Erros aparecem sobre o jogo. O Phaser consome `.tmj`,
`.tsj` e `.tj` diretamente, sem build e sem conversão. Os comandos `to-tiled` e `from-tiled`
continuam apenas para migração de snapshots antigos e podem sobrescrever trabalho visual.

## Manifesto de cenas

`maps/scenes.json` é o ponto de entrada. Para cadastrar um novo local:

```jsonc
{
  "startScene": "world",
  "scenes": [
    { "id": "world", "file": "tiled/maps/world.tmj" },
    { "id": "tooq-office", "file": "tiled/maps/tooq-office.tmj" },
    { "id": "tooq-campus", "file": "tiled/maps/tooq-campus.tmj" },
    { "id": "personal-wing", "file": "tiled/maps/personal-wing.tmj" },
    { "id": "player-home-shell", "file": "tiled/maps/player-home-shell.tmj" }
  ]
}
```

Os IDs usados em `portals[].targetScene` precisam existir nesse manifesto.

## Contrato comum de um mapa

Coordenadas são expressas em tiles; hoje um tile visual tem 16 px.

```jsonc
{
  "id": "tooq-office",
  "name": "Coworking",
  "subtitle": "Área-piloto · recepção, escritórios e quintal privado",
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

`camera.bounds` também usa tiles e continua disponível para cenas fechadas. Quando ele não existe,
como no `world`, a câmera usa `w` e `h` como base e amplia o limite automaticamente para incluir
objetos visíveis posicionados além das bordas. Redimensionar o mapa no Tiled continua sendo o modo
correto de criar chão editável; mover somente objetos para fora do canvas cria uma extensão com a cor
de fundo. O runtime combina `minZoom` com o zoom necessário para caber esses limites na janela.

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
| `entities[]` | Mecânicas extensíveis vindas de classes de objeto do Tiled. |
| `visualLayers[]` | Tile layers livres, renderizadas com profundidade, visibilidade e opacidade. |

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
`Mover` para selecionar e arrastar. Também é possível espelhar ou recolher o item.

O editor trabalha em uma grade de meio tile e rejeita móveis fora do piso útil, sobre outro móvel
ou na área de circulação das portas. Colisões são criadas, movidas e removidas junto com a peça,
sem recarregar a cena. Cada unidade é persistida no backend com identidade própria, dono,
`sceneId` e `roomId`. Colocar consome uma unidade disponível; `Recolher seus móveis` devolve as
instâncias à mochila. Não existe mais catálogo infinito nem persistência de decoração no navegador.

Este recurso edita **apenas móveis**. Paredes, portas, pisos, ruas, portais, câmera e dimensões
continuam sendo level design no Tiled. Assim, o `.tmj` permanece a fonte estrutural e a decoração do
usuário é uma camada sobre os dados carregados do Tiled. A API é a fonte de verdade e eventos
SignalR atualizam colocações, movimentos e remoções nas outras sessões da mesma sala.

### Mobílias interativas

O catálogo associa comportamentos por `InteractionType`, sem colocar IDs no loop principal:

- `kanban`: abre o quadro e permite escolher a atividade ativa;
- `chest`: mostra itens guardados e transfere unidades entre baú e inventário;
- `workstation`: abre a seleção de atividade em estações genéricas do inventário;
- `seat`: senta no próprio móvel; estações completas com `interactionKey` iniciam as horas da
  atividade atual ao sentar;
- `coffee`: tira um café da bancada; a xícara é consumida sentado ou guardada quando esfria.

O backend expõe `/api/game/inventory`, `/api/game/furniture`, rotas de baú e rotas de estação.
O cliente usa a identidade autenticada. Em desenvolvimento, `?userId=1` ativa o bypass configurado
por `Auth:DevBypass`.

Cada item do backend possui `InstanceKey`, dono e `Location`. Uma colocação referencia exatamente
uma instância; portanto, ter duas cadeiras gera dois registros independentes. As operações de
colocar e recolher são transacionais e a API rejeita reutilização da mesma unidade.

SignalR assina os grupos `game:user:<id>` e `game:room:<scene>:<room>`. Os eventos de inclusão,
movimento, remoção, inventário, baú e sessão de trabalho atualizam outras abas sem reload. Presença,
aparência e claims de assento/porta/sala usam o hub de presença por cena.

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

Os valores ficam em `assets/equipment/catalog.json`, sem hardcode no loop de movimento. A loja e o
inventário do backend determinam quais itens podem ser equipados; uma conta nova possui somente o
skate básico. Cada base visual possui ao menos dois modelos compráveis:

| Equipamento | Velocidade atual | Pose do avatar |
|---|---:|---|
| Skate | 150 px/s | equilíbrio estável |
| Patins | 166 px/s | deslize com pés fixos |
| Patinete elétrico | 188 px/s | em pé |
| Moto | 232 px/s | sentado |

Detalhes do campus, das alas públicas e da economia: [`../docs/PLANO_CAMPUS_V2.md`](../docs/PLANO_CAMPUS_V2.md).

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
escritório, além do primeiro ciclo persistente de propriedade e interação de móveis. Ainda faltam:

1. Isolar presença/movimento de avatares por `sceneId`; o SignalR de mobília já está conectado.
2. Refinar a integração do Tiled com propriedades tipadas e atualização de prévia dentro do editor.
3. Adicionar compra/drop de móveis e permissões compartilhadas de decoração por sala.
4. Adicionar novas cenas de destino ao hub.
5. Conectar A/V por proximidade com LiveKit depois da presença em rede.

O arquivo `Editor.js` foi preservado como referência, mas não participa do runtime. O Tiled cuida
da estrutura das cenas; `RoomDecorationSystem.js` cuida exclusivamente dos móveis que o usuário
personaliza durante o jogo.
