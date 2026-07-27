# Editando o Office Quest no Tiled

O Tiled é o editor visual e a fonte dos mapas. Os arquivos editáveis ficam em [`maps/`](maps/).
Enquanto `node client-web/server.js` estiver rodando, salvar um `.tmj`, `.tsj` ou `.tj` valida o
projeto e recarrega o Phaser. O navegador consome esses arquivos diretamente.

Para um exercício completo de expansão do hub — redimensionar o mapa, criar ruas, adicionar
fachadas e ligar novos interiores — veja [`../GUIA-MUNDO-ABERTO.md`](../GUIA-MUNDO-ABERTO.md).

```text
tiled/maps/*.tmj + tilesets/*.tsj + templates/*.tj
                  └── salvar ──► validação automática ──► Phaser
```

## 1. Abrir o projeto

1. Instale o [Tiled](https://www.mapeditor.org/).
2. No Tiled, escolha **File → Open File or Project**.
3. Abra `client-web/tiled/office-quest.tiled-project`.
4. Abra um dos mapas:
   - `maps/world.tmj` — cidade cercada, estradas, três empresas e vilarejo;
   - `maps/tooq-campus.tmj` — Tooq Office;
   - `maps/personal-wing.tmj` — módulo público de 12 salas pessoais;
   - `maps/tooq-office.tmj` — Coworking e quintal privado;
   - `maps/tooq-office-1.tmj` — Dark Company, `225×153`; a planta está na §7.1;
   - `maps/player-home-shell.tmj` — interior vazio compartilhado pelas casas futuras.

Os tilesets completos continuam disponíveis, mas o mapa também carrega paletas menores numeradas:
`01 · Construção`, `02 · Escritório`, `03 · Decoração`, `04 · Exterior`, `05 · Animações`,
`06 · Portões`, `07 · Portões externos e cancelas` e `08 · Cercas externas`. Comece pelas paletas
numeradas; `Office Quest · Móveis` permanece como catálogo completo dos 339 recortes `of_*`.

### O que agora é editável diretamente

O visual existente foi convertido para camadas nativas do Tiled. Há dois modos de edição:

- **Chão e ruas:** selecione `Pincel · Chão e ruas`, escolha um piso e use **Stamp Brush** (`B`) ou
  a borracha. Você pode apagar e redesenhar os caminhos que já existem.
- **Paredes:** selecione `Pincel · Paredes` e pinte/apague qualquer peça do room builder.
- **Cercas:** selecione `Pincel · Cercas`, escolha uma peça em `08 · Cercas externas` e pinte/apague.
  Os conjuntos metal cinza e metal/madeira têm retas, laterais e quatro cantos.
- **Árvores, fachada, móveis e detalhes:** selecione a camada `Objetos · …` correspondente, use
  **Select Objects** (`S`) e arraste o próprio sprite. Props estão em `Objetos · Props do mundo` e móveis em `Objetos · Móveis`.
- **Desenho adicional:** `Pincel · Desenho livre` continua disponível para acabamentos separados.

As camadas `Pincel · Paredes` e `Pincel · Cercas` criam colisão automaticamente a partir dos tiles
pintados. Apagar um desses tiles também apaga sua colisão. A camada `Pincel · Desenho livre` é apenas
visual; use `Objetos · Colisões` quando um acabamento novo precisar bloquear o jogador.

Não tente desenhar na camada da câmera. Ela contém somente o retângulo que limita a visão e agora
fica bloqueada para evitar deformar o mapa acidentalmente.

## 2. Regra de fonte da verdade

Edite os `.tmj` e seus `.tsj`/`.tj` referenciados. Os arquivos `client-web/maps/*.json` são
snapshots legados mantidos para testes de migração; o jogo não os carrega.

O comando `to-tiled --force` reconstrói um `.tmj` a partir do JSON do runtime e **sobrescreve as
edições visuais**. Use-o apenas quando quiser descartar deliberadamente o trabalho feito no Tiled.

## 3. Camadas do mapa

As camadas numeradas mantêm o desenho e os dados organizados:

| Camada | O que editar |
|---|---|
| `Pincel · Chão e ruas · Chão e ruas` | Tiles reais de grama, pisos e caminhos; editar com `B`. |
| `Pincel · Paredes · Paredes` | Tiles reais das paredes; editar com `B`. |
| `Pincel · Cercas · Cercas` | Tiles reais das cercas; editar com `B`. |
| `01 · Prédio e quintal` | Retângulos `building` e `yard`. |
| `03 · Zonas abertas` | Café, lounge, recepção e áreas de time. |
| `04 · Salas` | Geometria e colisão das salas; o visual está em `Pincel · Chão e ruas` e `Pincel · Paredes`. |
| `08 · Detalhes` | Grama e decoração pequena sem colisão. |
| `Objetos · Props do mundo` | Árvores, bancos, fachadas, portões e outros PNGs. |
| `Objetos · Móveis` | Mobília fixa do cenário-base; não representa estoque do jogador. |
| `11 · Portas` | Vãos associados ao prédio ou a uma sala. |
| `Objetos · Colisões` | Retângulos físicos invisíveis no jogo. |
| `Objetos · Spawns e portais` | Entradas do jogador e troca de cenas. |
| `14 · Limite da câmera` | Existe apenas em cenas fechadas; o mundo aberto usa mapa + objetos externos. |
| `15 · Mecânicas` | Objetos de gameplay orientados por classe e propriedades. |
| `16 · Desenho livre` | Tile layer desbloqueada para pintar pisos, paredes e detalhes diretamente. |

No `world.tmj` não há camada de limite da câmera: ela acompanha automaticamente `Width`, `Height` e
qualquer objeto visível colocado além dessas bordas. As camadas `Pincel · …` e `Objetos · …`
estão desbloqueadas e são fontes do runtime.

### Mudar a estrutura inteira do mundo

O mundo atual tem `220×150` tiles, cercado nas quatro bordas. O Tooq Office fica perto do spawn,
Coworking e Dark Company ficam afastados, e o vilarejo ocupa a lateral leste. Para crescer além
disso:

1. use **Map → Resize Map**;
2. informe o novo `Width` e `Height` e escolha a âncora;
3. confirme — o Tiled redimensiona todas as tile layers e move os objetos conforme a âncora;
4. preencha a área nova na camada `Pincel · Chão e ruas`.

Não existe outro limite de câmera para atualizar. Objetos podem ser movidos livremente em pixels e a
câmera alcança coordenadas externas automaticamente. Para pintar chão, ruas, paredes ou cercas nessa
extensão, redimensione o mapa primeiro; tile layers finitas continuam limitadas ao canvas de 16×16.

### Paletas curadas

| Paleta | Conteúdo |
|---|---|
| `01 · Construção · Pisos/Paredes` | Pisos repetíveis e peças do room builder. |
| `02 · Escritório · Estações` | Mesas, monitores, cadeiras e estações completas. |
| `03 · Decoração · Escritório` | Plantas, telas, armários, café, lounge e recepção. |
| `04 · Exterior · Quintal` | Vegetação, fonte, banco, cercas e portão. |
| `05 · Animações · Decoração` | Objetos animados prontos para o runtime, começando pelo café com vapor. |
| `06 · Portões` | Quatro portões externos: três de 48×32 e um ornamentado de 64×32. |
| `07 · Portões externos e cancelas` | Portão metálico de 80×48 aberto/fechado e quatro cancelas para acesso de veículos. |
| `08 · Cercas externas` | Dois conjuntos modulares completos: metal cinza e metal/madeira. |

As paletas `01` a `05` vivem em `tiled/palettes.json`; o comando `assets` as recria preservando os
IDs usados pelo mapa. As paletas externas `06` a `08` são curadas manualmente e não são alteradas
por esse comando. Um objeto arrastado de uma paleta curada volta para o mesmo `assetId` do catálogo.

## 4. Fluxo diário

Na raiz do repositório:

```powershell
node client-web/server.js
```

Depois disso:

1. edite o mapa no Tiled;
2. pressione `Ctrl+S`;
3. o servidor espera o salvamento terminar e valida o projeto diretamente;
4. se a cena aberta foi alterada, o navegador recarrega sozinho;
5. se houver erro, o navegador mostra a causa para você corrigir no Tiled.

Não execute `validate` nem `from-tiled` no trabalho diário. Esses comandos continuam disponíveis
para CI e diagnóstico avançado.

Não use `refresh-preview` nesses mapas: pisos, paredes e cercas não são mais prévias geradas. Edite
diretamente as camadas `Pincel · Chão e ruas`, `Pincel · Paredes` e `Pincel · Cercas`.

## 5. Mover ou inserir um móvel

Esta seção trata da **mobília fixa do level design**. Objetos colocados aqui entram no mapa para
todos, não possuem `GameItemInstance` e não podem ser movidos pelo editor do jogador. Para mobília
comprada/encontrada e persistida, use o modo `Decorar sala` no jogo.

### Mover

1. Selecione a camada `Objetos · Móveis`.
2. Use a ferramenta de seleção de objetos.
3. Arraste o móvel. A grade é de 16 × 16 px.
4. Salve; o jogo atualiza automaticamente.

Objetos com pequenos ajustes podem ficar fora da grade. O carregador preserva coordenadas decimais.

## 5.1 Camadas visuais novas

Uma tile layer criada por você chega ao runtime sem precisar cadastrar seu nome. Pisos, peças do
room builder, móveis e props conhecidos são normalizados e renderizados
pelo motor. Ordem, visibilidade e opacidade são preservadas; propriedades úteis da camada:

| Propriedade | Uso |
|---|---|
| `depth` | Profundidade Phaser fixa. O padrão coloca a camada acima do piso e abaixo dos objetos. |
| `ySort` | Quando `true`, ordena cada tile pela base vertical. Útil para objetos altos. |

As três camadas `base-floors`, `base-walls` e `base-hedges` são renderizadas diretamente pelo jogo.
Salvar qualquer alteração nelas modifica o jogo sem cadastrar nomes no código.

## 5.2 Objetos de mecânica

Qualquer classe de objeto desconhecida pelo schema estrutural é preservada em `entities[]`, com
posição, formato, camada e propriedades tipadas. O comportamento vem de um handler registrado em
`src/mechanics/`; portanto, adicionar objetos de uma mecânica existente não altera o carregador.

Os templates prontos ficam em [`templates/`](templates/). Arraste `portal.tj` ou `collision.tj`
para a camada adequada, preencha as propriedades e salve. O carregador resolve a herança do template.

Para programar uma mecânica inédita:

1. crie `src/mechanics/<Nome>.js` e registre o tipo com `registerMechanic`;
2. importe o módulo em `src/mechanics/index.js`;
3. crie um template `.tj` cuja classe tenha exatamente o mesmo nome;
4. coloque instâncias no Tiled e salve.

Uma classe sem handler não é ignorada: o salvamento mostra `mecânica sem handler registrado` e
mantém o último mapa válido.

### Inserir

1. Abra o tileset `Office Quest · Móveis`.
2. Escolha visualmente o móvel `of_*`.
3. Selecione a camada `Objetos · Móveis`.
4. Use a ferramenta de inserir objeto de tile e clique no mapa.
5. Na visão **Properties**, altere a propriedade herdada `solid` para `true` se o avatar não puder
   atravessá-lo. Para móveis largos, prefira o footprint explícito descrito abaixo.

O tipo `furniture` e o `assetId` são herdados do tileset. Não é necessário digitar o ID novamente.

### Footprint de um móvel

Mesas, sofás e armários multi-tile podem definir a colisão relativa à âncora do objeto:

| Propriedade | Uso |
|---|---|
| `collisionX`, `collisionY` | Deslocamento do início da colisão, em tiles. |
| `collisionW`, `collisionH` | Largura e altura da base física, em tiles. |

Exemplo para uma mesa de três tiles: `collisionX=-1`, `collisionY=0.1`, `collisionW=3` e
`collisionH=0.8`. Se essas quatro propriedades existirem, elas vencem o footprint genérico de
`solid`. Cadeiras soltas normalmente não precisam de colisão.

⚠️ **Não invente footprint.** [`assets/furniture/catalog.json`](../assets/furniture/catalog.json) já
traz a colisão conferida de cada `of_*`; copie de lá. As 33 salas do `tooq-office-1` são geradas
assim. As estações compostas (`station_*`, 32×64) não estão no catálogo — a colisão delas foi medida
na arte: a mesa ocupa de −3 a −1,875 tiles acima da âncora, então `collisionX=-0.5`, `collisionY=-3`,
`collisionW=2`, `collisionH=1.15`. Quem é sólida é a **mesa**; a cadeira do mesmo quadro fica livre
porque é onde o avatar senta — se a colisão descer até lá, ele é expulso ao levantar.

### Móvel do cenário que interage

Um móvel colocado no Tiled não tem `GameItemInstance`, então normalmente é só cenário. A propriedade
`interactionType` liga as interações que **não dependem do inventário**:

| Valor | Efeito |
|---|---|
| `seat` | `E` senta o avatar no móvel; o assento vira claim de presença, então ninguém senta em cima de ninguém. |
| `coffee` | `E` tira um café da bancada; o jogador sai carregando a xícara e bebe sentado. |

Um `seat` ainda precisa dizer **onde**, **em que pose** e **para que lado** o avatar senta, porque a
âncora do móvel é o centro-inferior do quadro e o assento desenhado fica acima dela:

| Propriedade | Uso |
|---|---|
| `seatX`, `seatY` | Deslocamento do avatar em relação à âncora, **em tiles**. Sem eles vale o encaixe antigo (0, −2 px), que deixa o personagem um tile abaixo da cadeira. |
| `seatPose` | `sit` ou `idle`. Ver abaixo. Sem ela vale `sit`. |
| `seatDir` | `left`/`right` para `sit`; `up` para a estação. Sem ela o lado sai do `flipX`. |
| `seatCover` | Px da base do móvel redesenhados **na frente** do avatar. Só para o quadro composto (estação): a cadeira colada à mesa "abraça" quem senta, em vez de o avatar ficar por cima dela inteira. |

⚠️ **A pose `sit` só presta de lado.** A folha `sit` tem as quatro direções, mas só `left`/`right`
vieram sentadas do pack; `up`/`down` são o `idle` com a perna encurtada, sem joelho dobrado, e leem
como pessoa **em pé** (ver `ASSETS.md` §3.1). Por isso:

- **Cadeira solta** (`of_315`/`of_316`, poltronas): `seatPose: sit` + `seatDir` `left`/`right`,
  escolhido para o personagem olhar o miolo do grupo (numa mesa, metade esquerda olha `right`).
- **Estação** (`station_*`, mesa+cadeira num quadro só, a cadeira encara o monitor acima):
  `seatPose: idle` + `seatDir: up`. O avatar aparece **de costas no teclado**, como quem trabalha —
  uma pose de sentar de frente ficaria em pé.

⚠️ **O avatar sentado é desenhado ACIMA do móvel** (`main.js` usa `record.display.depth + 1`). Sem
isso o tampo e o monitor da estação, que têm profundidade maior, desenham por cima e escondem quem
senta — parece que a pessoa está atrás da mesa, não sentada nela.

⚠️ **Mas aí ele fica por cima da cadeira inteira** (parece em pé nela), porque a estação é mesa +
cadeira num sprite só. `seatCover` conserta: o motor redesenha os N px de baixo do móvel (a cadeira)
na frente do avatar (`showSeatCover`), então as pernas encaixam no assento. É a única forma de aninhar
o avatar num quadro composto sem fatiar a arte. A estação usa `seatCover: 20` (a cadeira ocupa os
20 px de baixo do sprite de 64). Cadeira solta não precisa — a arte já é só a cadeira.

Medidos na arte e usados no `tooq-office-1`:

| Peça | `seatX` | `seatY` | `seatPose` | `seatDir` |
|---|---:|---:|---|---|
| `station_*` (32×64) | 0 | −1,625 | `idle` | `up` |
| `of_315`/`of_316`, `of_196`–`of_199` (32×48) | −0,5 | −0,875 | `sit` | `left`/`right` conforme a posição no grupo |

⚠️ **Nas peças de 32 px a cadeira é desenhada meio tile à esquerda do centro do quadro**, mas a
colisão do catálogo começa na âncora. Duas cadeiras encostadas fazem o assento de uma cair dentro da
colisão da outra, e o Arcade expulsa quem levanta — deixe **dois tiles** entre cadeiras vizinhas. O
teste `o avatar sentado não cai dentro de colisão nenhuma` cobre isso.

`workstation`, `kanban` e `chest` **não** funcionam em móvel de mapa: eles precisam do `placementId`
que só existe em item comprado/colocado pelo jogador. Colocar esses valores aqui não faz nada.

No `tooq-office-1` levam `seat` as cadeiras `of_315`/`of_316`, as poltronas `of_196`–`of_199` e as
sete `station_*` (sentar na frente do computador); levam `coffee` as bancadas `of_320`–`of_322`.

## 6. Inserir um prop externo

1. Abra o tileset `Office Quest · Mundo`.
2. Selecione uma árvore, banco, fachada ou outro item.
3. Coloque-o na camada `Objetos · Props do mundo`.
4. Para adicionar colisão na base, crie estas propriedades numéricas no objeto:

| Propriedade | Significado |
|---|---|
| `collisionX` | Deslocamento horizontal em tiles. |
| `collisionY` | Deslocamento vertical em tiles. |
| `collisionW` | Largura da colisão em tiles. |
| `collisionH` | Altura da colisão em tiles. |

Exemplo para um banco de 3 tiles:

```text
collisionX = -1.5
collisionY = -0.55
collisionW = 3
collisionH = 0.55
```

Sem `collisionW` e `collisionH`, o prop é atravessável.

## 7. Criar ou redimensionar uma sala

O caminho mais seguro é duplicar uma sala existente:

1. selecione um objeto da camada `04 · Salas`;
2. duplique e redimensione o retângulo;
3. dê um `id` único;
4. altere o nome do objeto — ele vira o rótulo da sala;
5. escolha `floor`: `wood`, `gray`, `light`, `terra` ou `water`;
6. duplique uma porta e altere `parent` para o novo ID da sala.

O objeto precisa manter a classe `room`. As dimensões incluem a parede; deixe espaço interno para
móveis e circulação.

## 7.1 A planta da Dark Company (`tooq-office-1`)

A Dark Company não usa caixas de sala soltas como o Coworking (`tooq-office`): as salas são **recortadas da
própria casca**, encostadas nas paredes externas e **compartilhando a divisória** com a sala
vizinha. Não existe corredor nas costas de sala nenhuma — só as avenidas, que são a circulação.

| Elemento | Tiles | Observação |
|---|---|---|
| Casca do prédio | `x 14–210`, `y 14–138` | 8 aberturas já existiam na casca |
| Avenidas verticais | `x 79–81` e `x 145–147` | alinhadas com as aberturas norte/sul |
| Avenidas horizontais | `y 55–57` e `y 97–99` | alinhadas com as aberturas leste/oeste |
| Banda de salas norte | `y 14–27` | 15 salas, porta ao **sul**; a parede de trás é a do prédio |
| Área aberta A | `y 28–53` | Time Produto · Lounge Norte · Time Plataforma |
| Banda de salas do meio | `y 59–72` | 9 salas, porta ao **norte** (dão na avenida) |
| Área aberta B | `y 73–95` | Time Dados · Café · Time Design |
| Área aberta C | `y 101–123` | Lounge Sul · Recepção · Time Infra |
| Banda de salas sul | `y 124–138` | 9 salas, porta ao **norte**; a parede sul é a do prédio |

As três bandas são cortadas pelas duas avenidas verticais, o que dá três segmentos por banda.

**Como as paredes de uma banda são montadas** (tudo em `Pincel · Paredes`):

| Peça | GID | Onde |
|---|---|---|
| Topo da parede (cap) | `354` branco · `226` pedra · `290` tijolo | linha de cima da parede horizontal |
| Face da parede | `386` · `258` · `322` | linha de baixo, é o que se vê do lado sul |
| Divisória vertical | `72` (contorno à direita) / `74` (à esquerda) | o contorno olha **para dentro** da sala |
| Canto superior | `40` esquerdo · `42` direito | ponta da parede horizontal da banda |
| Encontro em T | `4079` + `4080` | divisória nascendo numa parede **branca** |
| Cruzamento | cap `+2` / face `+2` (ex.: `356`/`388`) | divisória cruzando uma parede **colorida** |

⚠️ O tee desenhado (`wall_tee_*`) só fecha com a parede branca. Numa parede de pedra ou tijolo use a
peça sem borda lateral do próprio estilo (a quarta coluna da família), senão aparece um talho branco
no meio da faixa.

**Salas de reunião** levam `meeting: true` no `extraJson`, piso `carpet` e parede de **pedra**; salas
de time levam parede de **tijolo**; salas pessoais ficam brancas com piso `cream`. O fone de reunião
não é objeto do Tiled: ele nasce sozinho no **centro da parede norte** de toda sala marcada como
`meeting`, então não pendure quadro nessa posição.

**Portas do prédio.** `office_door` é arte de fachada, em elevação: só assenta na **parede norte**,
que é a única desenhada com duas linhas de tile. Nas paredes fina do sul e das laterais o sprite fica
pendurado por fora, sobre a grama — ali a abertura fica limpa e quem marca a saída é o portão da
cerca. As entradas atuais são a porta de vidro em `x 145–147` e a portinha de madeira em `x 80`, as
duas ao norte.

**Quintal.** A cerca-viva fecha o retângulo `x 8–216`, `y 8–144` na camada `Pincel · Cercas` (topo e
base com `hedge_top`, laterais com duas colunas de `hedge_fill`, como no `tooq-office`). O único vão
é `x 79–81`, no eixo da saída sul do prédio: dali sai um caminho de piso `cream` até o portão
`garden_gate_1`, com o spawn `yard-gate` logo acima e o portal `yard-exit` em cima da passagem. Sem
esse anel a cena era uma casca solta no meio de grama infinita.

## 8. Editar portas

Uma porta é um retângulo da camada `11 · Portas` com classe `door`.

| Propriedade | Uso |
|---|---|
| `parent` | `building` ou o ID da sala, por exemplo `meeting`. |
| `side` | `N`, `S`, `E` ou `W`. |
| `texture` | `interior_sliding_door` para salas; `office_door` somente na saída externa. |
| `frame` | Porta interna aberta = `6`; porta externa aberta = `8`. |
| `automatic` | Em `extraJson`, faz a porta interna abrir ao aproximar e fechar ao afastar. |
| `flipX` | Espelha a porta, se necessário. |

A posição e o comprimento do retângulo viram automaticamente `at` e `len`. Ao mover uma porta para
outra parede, atualize também `side`. A porta deve permanecer encostada na borda do objeto pai.
As portas internas deslizantes têm dois tiles de largura (`len=2`).

Salas também aceitam `wallStyle` dentro de `extraJson`: `white`, `stone`, `brick` ou `lavender`. O
corte atual usa painéis `white` nos dois escritórios. Neles, `southWall3d: true` cria uma parede sul
de dois tiles para embutir a porta de 32 px; a abertura remove as duas células da parede e a porta
controla a colisão.

## 9. Colisões, cercas e caminhos

Para criar um objeto geométrico novo, desenhe um retângulo na camada correta e defina sua classe:

| Classe | Resultado no runtime |
|---|---|
| `path` | Piso, sem colisão; requer propriedade `floor`. |
| `hedge` | Cerca desenhada e sólida. |
| `collision` | Barreira invisível. |
| `zone` | Área aberta com piso e rótulo. |
| `room` | Sala com piso e paredes. |

Prefira duplicar um objeto do mesmo tipo: a classe e as propriedades necessárias vêm juntas.

No mundo, cada fachada também possui um retângulo `collision` cobrindo **toda a caixa ocupada pelo
PNG**, não apenas sua base. O portal fica sobre a borda externa da entrada. Ao mover ou trocar uma
fachada, mova/recalibre juntos o prop, o footprint, o portal e o spawn de retorno.

## 10. Spawns e portais

### Spawn

Um spawn é um **ponto** de classe `spawn`. Seu nome e a propriedade `id` identificam a entrada.
Todo mapa precisa de um spawn chamado `default`.

Duplique um spawn existente, mova-o para uma área livre e troque nome e `id`.

### Portal

Um portal é um retângulo de classe `portal` com:

- `id`: identificador único;
- `targetScene`: ID cadastrado em `maps/scenes.json`;
- `targetSpawn`: spawn no mapa de destino;
- `label`: texto mostrado perto do jogador.

O portal deve ser acessível e não ficar inteiramente dentro de uma colisão. Sempre teste ida e volta.

## 11. Câmera

O retângulo da camada `14 · Limite da câmera` vira `camera.bounds`. O zoom fica nas propriedades do
mapa:

- `cameraZoom`;
- `cameraMinZoom`;
- `cameraMaxZoom`, opcional.

Selecione **Map → Map Properties** para editá-las. Nos mapas cercados, faça o limite terminar no
portão. `cameraMinZoom: 0.8` permite a visão geral atual; o runtime ainda limita o scroll ao ponto em
que o retângulo inteiro cabe na janela e centraliza as margens automaticamente.

## 12. Adicionar PNGs à paleta

### Móvel

Copie um arquivo `of_*.png` para `client-web/assets/furniture/office/`.

Isso deixa o PNG disponível ao Tiled, mas não cria um item comprável. Para entrar no inventário do
jogo, adicione a mesma chave a `assets/furniture/catalog.json` e a `GameInventorySeed.cs`. O catálogo
controla nome, categoria, preview e colisão; o seed controla definição persistente e interação.

### Mundo

Copie o PNG para `client-web/assets/world/`. O nome do arquivo sem `.png` será o `assetId`. O runtime
agora resolve automaticamente qualquer PNG dessa pasta.

Depois regenere os tilesets:

```powershell
node client-web/tools/tiled-converter.mjs assets
```

Os IDs antigos são preservados; assets novos são anexados ao catálogo. Reabra o tileset no Tiled se
a nova imagem não aparecer imediatamente.

Animações versionadas são cadastradas em `assets/animations/catalog.json`. O Tiled usa o campo
`preview`, enquanto o Phaser carrega a spritesheet indicada em `path`.

### Tileset personalizado sem conversor

Você também pode criar um tileset inteiramente no Tiled:

1. use **File → New → New Tileset**;
2. escolha uma spritesheet ou marque **Collection of Images**;
3. salve o arquivo dentro de `client-web/tiled/tilesets/` como `.tsj`;
4. no mapa, use **Map → Add External Tileset** e selecione esse `.tsj`;
5. pinte em qualquer tile layer ou insira seus tiles como objetos e salve o mapa.

O carregador descobre o tileset pela referência do próprio `.tmj`, resolve imagens relativas e as
carrega no Phaser. Para objetos, defina a classe `prop`, `furniture` ou outra mecânica no tile/objeto;
`assetId` é opcional, mas recomendado para manter um ID legível e estável. Novos tilesets não
precisam ser adicionados ao conversor nem a um catálogo JavaScript.

## 13. Comandos avançados e legados

```powershell
# Atualiza as paletas de PNGs.
node client-web/tools/tiled-converter.mjs assets

# Cria TMJ a partir dos mapas de runtime. Não sobrescreve por padrão.
node client-web/tools/tiled-converter.mjs to-tiled all

# Sobrescreve os TMJs deliberadamente.
node client-web/tools/tiled-converter.mjs to-tiled all --force

# Exporta TMJ para um snapshot JSON legado. O jogo não usa essa saída.
node client-web/tools/tiled-converter.mjs from-tiled all

# Valida TMJ, assets, cenas, spawns e destinos sem escrever runtime.
node client-web/tools/tiled-converter.mjs validate all

# Prova que runtime → Tiled → runtime não perde dados.
node client-web/tools/tiled-converter.mjs roundtrip all

# Migra um mapa procedural antigo para tile layers nativas editáveis.
# Os mapas atuais já foram migrados; não é um comando de uso diário.
node client-web/tools/tiled-converter.mjs make-editable all
```

## 14. Checklist antes de terminar

- [ ] O `.tmj` foi salvo.
- [ ] O navegador confirmou `Mapa atualizado` sem erro.
- [ ] A cena abriu pela URL direta.
- [ ] O mapa foi conferido com `?debug=collisions`.
- [ ] Todos os spawns estão livres.
- [ ] Portais funcionam nos dois sentidos.
- [ ] O limite da câmera termina na borda planejada.
- [ ] Assets novos foram registrados também no `ASSETS.md`.

