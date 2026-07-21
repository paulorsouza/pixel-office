# Guia prático de edição dos mundos

O level design do **Office Quest / Tooq** acontece no **Tiled**. Os mapas `.tmj`, tilesets `.tsj`
e templates `.tj` são carregados diretamente pelo navegador: não existe conversão no fluxo diário.

Para expandir especificamente o hub com ruas, fachadas e novos prédios, use também
[`GUIA-MUNDO-ABERTO.md`](GUIA-MUNDO-ABERTO.md). A referência detalhada de camadas, classes e
propriedades fica em [`tiled/README.md`](tiled/README.md).

## 1. Ferramentas recomendadas

| Ferramenta | Melhor uso |
|---|---|
| **Tiled** | Desenhar chão, ruas e paredes; posicionar objetos; editar colisões, salas e portais. |
| **VS Code** | Código Phaser, manifesto de cenas, catálogos e inspeção de arquivos. Gratuito. |
| **WebStorm** | Alternativa completa ao VS Code para quem prefere JetBrains. |
| **DevTools do navegador** | Console, rede, erros de assets e depuração. |
| **Phaser Editor 2D** | Não participa do pipeline atual; exigiria outra integração. |

Instale o [Tiled](https://www.mapeditor.org/) e Node.js. Abra a pasta
`E:\workspace\pixel-office` inteira no VS Code ou WebStorm.

## 2. Rodar e editar

Na raiz do projeto:

```powershell
node client-web/server.js
```

Depois:

1. abra `client-web/tiled/office-quest.tiled-project` no Tiled;
2. abra `maps/world.tmj` ou `maps/tooq-office.tmj`;
3. abra `http://localhost:8123/#world` no navegador;
4. edite e pressione `Ctrl+S` no Tiled;
5. aguarde o aviso `Mapa atualizado`; a página recarrega sozinha.

O servidor valida mapas, tilesets e templates. Se algo estiver inválido, o aviso mostra a causa.
Corrija no Tiled e salve novamente.

## 3. Fonte da verdade

```text
maps/scenes.json                 manifesto das cenas
tiled/maps/*.tmj                mapas carregados pelo jogo
tiled/tilesets/*.tsj            tilesets externos carregados pelo jogo
tiled/templates/*.tj            objetos reutilizáveis carregados pelo jogo
src/TiledRuntimeLoader.js        normaliza o formato do Tiled para o renderer
src/MapRenderer.js               desenha os dados normalizados no Phaser
maps/world.json                  snapshot legado para migração/testes
maps/tooq-office.json            snapshot legado para migração/testes
```

Não edite `maps/world.json` ou `maps/tooq-office.json`: eles não são usados pelo jogo. O conversor
em `tools/tiled-converter.mjs` permanece apenas para migração e diagnóstico de mapas antigos.

## 4. O que editar em cada camada

Os nomes têm ícones e números para deixar o tipo de edição evidente:

| Camada | Ferramenta e resultado |
|---|---|
| `Pincel · Chão e ruas` | Pincel (`B`), preenchimento (`F`) e borracha para grama e pisos. |
| `Pincel · Paredes` | Pinte peças do room builder; os tiles também geram colisão. |
| `Pincel · Cercas` | Pinte/apague cercas; os tiles também geram colisão. |
| `Objetos · Props do mundo` | Selecione (`S`) e mova fachadas, árvores, bancos e portões. |
| `Objetos · Móveis` | Posicione mobília fixa do cenário-base; não concede itens ao jogador. |
| `Objetos · Portas` | Edite o vão e as propriedades da porta. |
| `Objetos · Colisões` | Retângulos físicos invisíveis. |
| `Objetos · Spawns e portais` | Pontos de entrada e retângulos de troca de cena. |
| `Objetos · Limite da câmera (travada)` | Somente cenas fechadas; o hub inclui mapa e objetos externos. |
| `Objetos · Mecânicas` | Objetos de gameplay identificados por classe. |
| `Pincel · Desenho livre` | Acabamentos visuais sem colisão automática. |

Tiles usam a grade de **16×16 px**. Objetos podem ficar fora da grade quando o alinhamento visual
pedir; o carregador preserva coordenadas fracionárias.

No mundo aberto, a câmera segue o avatar e expande seus limites para alcançar objetos colocados fora
do canvas. Isso não expande as tile layers: use **Map → Resize Map** antes de pintar chão ou cercas
em uma área externa, evitando grandes trechos que exibem apenas a cor verde de fundo.

No `world.tmj`, há três paletas dedicadas ao fechamento do terreno:

- `06 · Portões`: quatro entradas de jardim; `garden_gate_3` é a mais neutra sem cerca-viva;
- `07 · Portões externos e cancelas`: portão metálico grande, nos estados aberto e fechado, e
  quatro cancelas de veículos nas orientações horizontal e vertical;
- `08 · Cercas externas`: famílias modulares metal cinza e metal/madeira, com retas, laterais,
  cantos e uma peça de passagem.

Pinte cercas de 16×16 na camada `Pincel · Cercas` para ganhar colisão automática. Use os portões e
a peça larga `*_pass` como objetos em `Objetos · Props do mundo`; se precisarem bloquear o jogador, desenhe a
colisão física em `Objetos · Colisões`. O portal de troca de cena continua em `Objetos · Spawns e portais`.

## 5. Criar um tileset próprio

Este fluxo não exige código:

1. copie os PNGs que serão usados para uma pasta versionada em `client-web/assets/`;
2. no Tiled, escolha **File → New → New Tileset**;
3. use uma spritesheet ou marque **Collection of Images**;
4. salve como `client-web/tiled/tilesets/meu-tileset.tsj`;
5. no mapa, escolha **Map → Add External Tileset**;
6. selecione o novo `.tsj`, pinte/posicione os tiles e salve.

Para tile layers visuais, isso já basta. Para inserir o tile como objeto, defina uma classe:

- `prop` para fachadas, árvores e decoração do mundo;
- `furniture` para móveis;
- `detail` para detalhes de terreno;
- ou o nome de uma mecânica registrada em `src/mechanics/`.

Adicione a propriedade string `assetId` ao tile quando quiser um identificador legível e estável.
Sem ela, o carregador cria uma chave técnica a partir do nome do tileset e do ID do tile.

## 6. Mover objetos e configurar colisões

Use **Select Objects** (`S`) na camada correta e arraste o sprite pela base visual. Para objetos
grandes, a colisão pode ser declarada no próprio objeto, em tiles:

| Propriedade | Uso |
|---|---|
| `collisionX`, `collisionY` | Deslocamento da base física em relação à âncora. |
| `collisionW`, `collisionH` | Largura e altura da base física. |

Colida apenas com a base de árvores e fachadas para o avatar poder passar visualmente atrás delas.
Para formas irregulares, desenhe vários retângulos na camada `Objetos · Colisões`.

## 7. Spawns, portais e cenas novas

Todo mapa precisa de um ponto de classe `spawn` com `id = default`. Um portal é um retângulo de
classe `portal` com `id`, `targetScene`, `targetSpawn` e `label`.

Para criar outra cena:

1. duplique um `.tmj` parecido dentro de `client-web/tiled/maps/`;
2. altere `id`, `name`, `subtitle` e `kind` em **Map → Map Properties**;
3. mantenha ou crie o spawn `default`;
4. cadastre o arquivo em `client-web/maps/scenes.json`:

   ```json
   {
     "id": "arcade",
     "file": "tiled/maps/arcade.tmj"
   }
   ```

5. crie portais de ida e volta e salve.

Os valores de `targetScene` devem coincidir com o manifesto, e `targetSpawn` deve existir no mapa
de destino. O servidor valida essas ligações antes de recarregar.

## 8. Decoração feita pelo jogador

O editor dentro do jogo é separado do level design. Entre em uma sala e clique em `Decorar sala`
para adicionar, mover, espelhar e recolher apenas móveis que pertencem ao usuário. Cada cartão mostra
o estoque retornado pelo backend; colocar consome uma instância e recolher devolve a mesma unidade.
Posição, sala e espelhamento persistem no SQLite e são sincronizados por SignalR.

Paredes, pisos, portas, portais, ruas e estrutura de salas continuam exclusivos do Tiled.

Há duas categorias visuais que não devem ser confundidas:

- móvel em `Objetos · Móveis`: parte fixa do mapa, editável no Tiled e não selecionável pelo jogador;
- móvel colocado no jogo: instância com dono, carregada por cima do mapa e editável no modo decoração.

Para tornar um recorte disponível como item, não basta arrastá-lo no Tiled. Cadastre-o em
`assets/furniture/catalog.json` e em `backend/VirtualOffice.Api/GameInventorySeed.cs`. Se tiver
comportamento, configure também seu `InteractionType` (`kanban`, `chest`, `workstation` ou `seat`).

## 9. Testar

Abra uma cena diretamente:

```text
http://localhost:8123/?scene=world
http://localhost:8123/?scene=tooq-office
```

Mostre os corpos físicos:

```text
http://localhost:8123/?scene=world&debug=collisions
```

Antes de considerar uma edição pronta:

- salve `.tmj` e qualquer `.tsj` alterado;
- confirme `Mapa atualizado` sem erro;
- caminhe pelas bordas e portas;
- teste colisões com `debug=collisions`;
- teste cada portal nos dois sentidos;
- confirme que spawns não nascem dentro de paredes;
- teste zoom máximo e mínimo;
- registre recortes novos em `ASSETS.md`.

## 10. Quando alterar código

Você não precisa mudar o Phaser para criar camadas visuais, tilesets externos, props, móveis,
colisões, spawns, portais ou instâncias de mecânicas existentes. Código só é necessário para:

- criar um comportamento de gameplay novo em `src/mechanics/`;
- mudar regras genéricas de desenho/colisão no `MapRenderer.js`;
- criar UI ou controles;
- adicionar uma animação especial ao catálogo;
- criar um `InteractionType` novo;
- alterar contratos de inventário, rede ou persistência.

Assim, a maior parte do trabalho de mundo fica restrita ao Tiled e aparece no jogo ao salvar.
