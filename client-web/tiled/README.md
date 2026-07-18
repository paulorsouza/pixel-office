# Editando o Office Quest no Tiled

O Tiled é agora o editor visual dos mapas. Os arquivos editáveis ficam em [`maps/`](maps/), e um
conversor gera os JSONs enxutos que o Phaser já consome em `client-web/maps/`.

Para um exercício completo de expansão do hub — redimensionar o mapa, criar ruas, adicionar
fachadas e ligar novos interiores — veja [`../GUIA-MUNDO-ABERTO.md`](../GUIA-MUNDO-ABERTO.md).

```text
tiled/maps/*.tmj  ── conversor ──►  maps/*.json  ──►  Phaser
     fonte visual                    runtime
```

## 1. Abrir o projeto

1. Instale o [Tiled](https://www.mapeditor.org/).
2. No Tiled, escolha **File → Open File or Project**.
3. Abra `client-web/tiled/office-quest.tiled-project`.
4. Abra um dos mapas:
   - `maps/world.tmj` — quintal central;
   - `maps/tooq-office.tmj` — escritório e quintal privado.

Os tilesets completos continuam disponíveis, mas o mapa também carrega paletas menores numeradas:
`01 · Construção`, `02 · Escritório`, `03 · Decoração`, `04 · Exterior` e `05 · Animações`.
Comece por elas; `Office Quest · Móveis` permanece como catálogo completo dos 339 recortes `of_*`.

## 2. Regra de fonte da verdade

Depois desta migração, edite preferencialmente os `.tmj`. Os arquivos `client-web/maps/*.json`
continuam versionados porque o cliente roda sem build, mas são a saída do conversor.

O comando `to-tiled --force` reconstrói um `.tmj` a partir do JSON do runtime e **sobrescreve as
edições visuais**. Use-o apenas quando quiser descartar deliberadamente o trabalho feito no Tiled.

## 3. Camadas do mapa

As camadas numeradas mantêm o desenho e os dados organizados:

| Camada | O que editar |
|---|---|
| `00 · Prévia dos pisos` | Não editar. Texturas geradas a partir das áreas. |
| `01 · Prédio e quintal` | Retângulos `building` e `yard`. |
| `02 · Caminhos` | Retângulos `path` e seu piso. |
| `03 · Zonas abertas` | Café, lounge, recepção e áreas de time. |
| `04 · Salas` | Salas fechadas, com paredes automáticas. |
| `05 · Prévia das cercas` | Não editar. Visual gerado das cercas. |
| `06 · Cercas` | Retângulos sólidos `hedge`. |
| `07 · Prévia das paredes` | Não editar. Paredes geradas de prédio, salas e portas. |
| `08 · Detalhes` | Grama e decoração pequena sem colisão. |
| `09 · Props do mundo` | Árvores, bancos, fachadas, portões e outros PNGs. |
| `10 · Móveis` | Mesas, computadores, cadeiras e decoração interna. |
| `11 · Portas` | Vãos associados ao prédio ou a uma sala. |
| `12 · Colisões` | Retângulos físicos invisíveis no jogo. |
| `13 · Spawns e portais` | Entradas do jogador e troca de cenas. |
| `14 · Limite da câmera` | Área máxima que a câmera pode revelar. |

As três camadas de prévia estão bloqueadas. A geometria editável continua nos objetos coloridos;
isso evita transformar o desenho em milhares de tiles difíceis de manter.

### Paletas curadas

| Paleta | Conteúdo |
|---|---|
| `01 · Construção · Pisos/Paredes` | Pisos repetíveis e peças do room builder. |
| `02 · Escritório · Estações` | Mesas, monitores, cadeiras e estações completas. |
| `03 · Decoração · Escritório` | Plantas, telas, armários, café, lounge e recepção. |
| `04 · Exterior · Quintal` | Vegetação, fonte, banco, cercas e portão. |
| `05 · Animações · Decoração` | Objetos animados prontos para o runtime, começando pelo café com vapor. |

A seleção vive em `tiled/palettes.json`. O comando `assets` recria essas paletas preservando os
IDs usados pelo mapa. Um objeto arrastado de uma paleta curada volta para o mesmo `assetId` do
catálogo completo.

## 4. Fluxo diário

Na raiz do repositório:

```powershell
# 1. Edite e salve o .tmj no Tiled.

# 2. Valide sem alterar o runtime.
node client-web/tools/tiled-converter.mjs validate all

# 3. Gere os JSONs usados pelo Phaser.
node client-web/tools/tiled-converter.mjs from-tiled all

# 4. Rode o jogo e confira no navegador.
node client-web/server.js
```

Você também pode trabalhar em uma cena só:

```powershell
node client-web/tools/tiled-converter.mjs validate tooq-office
node client-web/tools/tiled-converter.mjs from-tiled tooq-office
```

Depois de mudar tamanho de sala, caminho, cerca ou porta, atualize as camadas de prévia:

```powershell
node client-web/tools/tiled-converter.mjs refresh-preview tooq-office
```

Esse comando altera o `.tmj` somente nas camadas bloqueadas de prévia. Se o arquivo estiver aberto no
Tiled, aceite recarregá-lo quando o editor detectar a mudança externa.

## 5. Mover ou inserir um móvel

### Mover

1. Selecione a camada `10 · Móveis`.
2. Use a ferramenta de seleção de objetos.
3. Arraste o móvel. A grade é de 16 × 16 px.
4. Salve, converta e teste.

Objetos com pequenos ajustes podem ficar fora da grade. O conversor preserva coordenadas decimais.

### Inserir

1. Abra o tileset `Office Quest · Móveis`.
2. Escolha visualmente o móvel `of_*`.
3. Selecione a camada `10 · Móveis`.
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

## 6. Inserir um prop externo

1. Abra o tileset `Office Quest · Mundo`.
2. Selecione uma árvore, banco, fachada ou outro item.
3. Coloque-o na camada `09 · Props do mundo`.
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

## 13. Comandos disponíveis

```powershell
# Atualiza as paletas de PNGs.
node client-web/tools/tiled-converter.mjs assets

# Cria TMJ a partir dos mapas de runtime. Não sobrescreve por padrão.
node client-web/tools/tiled-converter.mjs to-tiled all

# Sobrescreve os TMJs deliberadamente.
node client-web/tools/tiled-converter.mjs to-tiled all --force

# Converte TMJ para o JSON usado pelo jogo.
node client-web/tools/tiled-converter.mjs from-tiled all

# Valida TMJ, assets, cenas, spawns e destinos sem escrever runtime.
node client-web/tools/tiled-converter.mjs validate all

# Prova que runtime → Tiled → runtime não perde dados.
node client-web/tools/tiled-converter.mjs roundtrip all

# Regenera somente pisos, paredes e cercas de prévia.
node client-web/tools/tiled-converter.mjs refresh-preview all
```

## 14. Checklist antes de terminar

- [ ] O `.tmj` foi salvo.
- [ ] `validate` passou.
- [ ] `from-tiled` gerou o JSON.
- [ ] A cena abriu pela URL direta.
- [ ] O mapa foi conferido com `?debug=collisions`.
- [ ] Todos os spawns estão livres.
- [ ] Portais funcionam nos dois sentidos.
- [ ] O limite da câmera termina na borda planejada.
- [ ] Assets novos foram registrados também no `ASSETS.md`.

