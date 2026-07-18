# Tutorial — criar ruas e estruturas no mundo aberto

Este guia mostra como expandir manualmente a cena externa do Office Quest usando o **Tiled**. O
objetivo do exercício é criar uma nova rua, colocar uma estrutura no fim dela, configurar colisões
e, opcionalmente, transformar a porta da estrutura em entrada para outra cena.

Você não precisa alterar o Phaser para usar os pisos e assets já cadastrados. O trabalho normal é:

```text
Tiled: tiled/maps/world.tmj
          ↓ validate / from-tiled
Runtime: maps/world.json
          ↓ Ctrl+R
Jogo no navegador
```

## 1. A regra que evita perder trabalho

Edite [`tiled/maps/world.tmj`](tiled/maps/world.tmj), não `maps/world.json`. O `.tmj` é a fonte
visual; o JSON é gerado pelo conversor e pode ser sobrescrito.

Também não edite estas camadas bloqueadas:

- `00 · Prévia dos pisos`;
- `05 · Prévia das cercas`;
- `07 · Prévia das paredes`.

Elas são regeneradas por `refresh-preview`. Ruas são desenhadas como objetos na camada
`02 · Caminhos`; prédios, árvores e outras imagens ficam em `09 · Props do mundo`.

> Nunca use `to-tiled --force` para atualizar uma prévia. Esse comando reconstrói o mapa inteiro a
> partir do JSON e pode descartar seu trabalho visual.

## 2. Preparar o ambiente

1. Instale o [Tiled](https://www.mapeditor.org/).
2. Abra `client-web/tiled/office-quest.tiled-project`.
3. Abra `client-web/tiled/maps/world.tmj`.
4. Ative a grade em **View → Show Grid**.
5. Ative **Snap to Grid** para alinhar ruas e colisões em múltiplos de 16 px.
6. Deixe os painéis **Layers**, **Objects**, **Properties** e **Tilesets** visíveis.

Em outro terminal, a partir de `E:\workspace\pixel-office`, deixe o cliente rodando:

```powershell
node client-web/server.js
```

O jogo estará em `http://localhost:8123/#world`. O servidor não recarrega sozinho; depois de gerar
o mapa, use `Ctrl+R` no navegador.

## 3. Entender a escala

Um tile do mapa mede **16×16 px**. O Tiled mostra dimensões de objetos em pixels, mas o runtime
converte tudo para tiles.

| Medida desejada | Valor no Tiled |
|---|---:|
| 1 tile | 16 px |
| 3 tiles | 48 px |
| 5 tiles | 80 px |
| 8 tiles | 128 px |

No mapa atual, caminhos de 5 tiles funcionam bem para pedestres, skate, patins, patinete e moto.
Para uma avenida visualmente mais larga, comece com 7 ou 8 tiles e deixe pelo menos 2 tiles livres
entre props sólidos.

## 4. Aumentar a área do mundo

Se a nova rua não cabe no mapa atual:

1. Abra **Map → Resize Map**.
2. Aumente `Width` e/ou `Height` em tiles.
3. Escolha a âncora que mantém a área existente parada. Para crescer para a direita e para baixo,
   use o canto superior esquerdo como âncora.
4. Confirme e salve.

Exemplo: mudar de `44×36` para `64×48` acrescenta 20 tiles à direita e 12 embaixo sem mover a
composição existente.

Depois do redimensionamento:

1. selecione a camada `14 · Limite da câmera`;
2. redimensione o retângulo de classe `camera` para abranger somente a área que deve ser revelada;
3. mova ou estenda as cercas da camada `06 · Cercas` para a nova borda;
4. remova a cerca antiga exatamente onde a nova rua deve continuar.

O fundo de grama é preenchido automaticamente. Não é necessário pintar cada tile.

Para conferir as prévias depois de salvar:

```powershell
node client-web/tools/tiled-converter.mjs refresh-preview world
```

Se o Tiled avisar que o arquivo mudou fora do editor, aceite recarregá-lo.

## 5. Criar uma rua com os pisos atuais

O modo mais seguro é duplicar um caminho existente:

1. selecione a camada `02 · Caminhos`;
2. escolha a ferramenta **Select Objects** (`S`);
3. clique num caminho existente e duplique com `Ctrl+D`;
4. arraste o novo retângulo para o local desejado;
5. redimensione pelas alças, mantendo a grade ligada;
6. no painel **Properties**, confirme que a classe é `path`;
7. escolha a propriedade `floor`.

Pisos disponíveis:

| `floor` | Aparência atual | Uso sugerido |
|---|---|---|
| `light` ou `cream` | piso claro | calçada e rua clara |
| `gray` ou `carpet` | cinza | protótipo de asfalto |
| `terra` ou `sage` | verde/terroso | trilha e praça |
| `wood` | madeira | deck e passarela |
| `water` | água | lago decorativo, sem colisão automática |

Um `path` é sempre atravessável. Não coloque colisão sobre a rua.

### Formar curvas e cruzamentos

O formato atual usa retângulos, então uma rua em `L` é feita com dois objetos `path` sobrepostos.
Um cruzamento em `T` usa três retângulos ou um caminho principal mais um ramal.

```text
            ramal 5 tiles
                │
                │
   rua principal 7 tiles ─────────
```

Sobreposição de caminhos é permitida. Deixe ambos com o mesmo `floor` para a emenda desaparecer.

### Limitação atual

As camadas de piso visíveis são prévias geradas. O conversor ainda não preserva uma rua pintada
tile por tile com curvas, faixas e meios-fios. Portanto:

- use retângulos para planejar circulação agora;
- use props pequenos para placas, postes e decoração lateral;
- não pinte manualmente na camada `00 · Prévia dos pisos`;
- para ruas urbanas com autotile, será necessário evoluir o schema para uma camada de tiles real.

## 6. Adicionar um piso de asfalto novo

Esta é uma extensão opcional e exige uma pequena alteração única no código. O PNG central deve ser
**seamless, 16×16 e sem bordas**.

1. Copie o tile para `client-web/assets/floors/floor_road.png`.
2. Em `src/main.js`, inclua `road` na lista de pisos carregados:

   ```js
   ['wood', 'carpet', 'cream', 'sage', 'water', 'road']
   ```

3. Em `src/MapRenderer.js`, acrescente ao objeto `FLOORS`:

   ```js
   road: 'floor_road',
   ```

4. Em `tools/tiled-converter.mjs`, acrescente em `SURFACES`:

   ```js
   { id: 'road', path: 'assets/floors/floor_road.png' },
   ```

5. No mesmo arquivo, acrescente `road: 'road'` em `FLOOR_ALIASES`.
6. Regenere os tilesets:

   ```powershell
   node client-web/tools/tiled-converter.mjs assets
   ```

7. Reabra o tileset `01 · Construção · Pisos` no Tiled.
8. Use `floor = road` nos objetos da camada `02 · Caminhos`.

Se o tile possuir uma borda, ela será repetida a cada 16 px e a rua ficará quadriculada. Confira o
PNG ampliado antes de cadastrá-lo.

## 7. Colocar uma estrutura já cadastrada

Estruturas externas são props: fachadas, casas, portões, árvores grandes e monumentos.

1. selecione a camada `09 · Props do mundo`;
2. no painel **Tilesets**, abra `Office Quest · Mundo`;
3. escolha a fachada ou estrutura;
4. use a ferramenta **Insert Tile** e clique no mapa;
5. mova o objeto pela base visual — o ponto de origem padrão é o centro inferior;
6. salve.

Para duplicar uma estrutura já posicionada, use `Ctrl+D`. Espelhar horizontalmente é permitido;
rotação e espelhamento vertical não são suportados pelo catálogo atual.

### Estrutura decorativa ou fechada

Se ninguém deve atravessá-la, adicione as propriedades numéricas ao próprio prop:

| Propriedade | Significado |
|---|---|
| `collisionX` | deslocamento horizontal em tiles |
| `collisionY` | deslocamento vertical em tiles |
| `collisionW` | largura física em tiles |
| `collisionH` | altura física em tiles |

Exemplo de base com 8 tiles de largura:

```text
collisionX = -4
collisionY = -1
collisionW = 8
collisionH = 1
```

Colida apenas com a base. Não bloqueie toda a altura da imagem: o avatar precisa poder passar atrás
da fachada e ser coberto naturalmente pelo Y-sort.

### Estrutura com porta acessível

Para um prédio que pode ser visitado, não use uma colisão única sobre toda a base:

1. deixe o prop sem `collisionW`/`collisionH`;
2. na camada `12 · Colisões`, duplique um retângulo de classe `collision`;
3. crie uma colisão à esquerda da porta e outra à direita;
4. deixe o vão da porta completamente livre;
5. na camada `13 · Spawns e portais`, coloque o portal sobre esse vão.

```text
[ colisão esquerda ][ porta livre ][ colisão direita ]
```

Use `http://localhost:8123/?scene=world&debug=collisions` para confirmar visualmente o vão.

## 8. Adicionar uma estrutura nova dos packs LimeZu

Os PNGs crus ficam em `LimeZu/exteriores/singles/`. Use sempre a versão 16×16.

1. procure uma fachada com nome descritivo em `LimeZu/exteriores/singles/`;
2. abra o PNG e confira tamanho, transparência e ponto da porta;
3. copie somente o PNG escolhido para `client-web/assets/world/`;
4. dê um nome curto, sem espaço ou acento, como `arcade_front.png`;
5. execute:

   ```powershell
   node client-web/tools/tiled-converter.mjs assets
   ```

6. reabra `Office Quest · Mundo` no Tiled;
7. arraste `arcade_front` para `09 · Props do mundo`.

O nome sem `.png` vira o `assetId` automaticamente. O conversor também inclui o asset na lista do
mapa quando ele é usado.

Para fazê-lo aparecer na paleta curta `04 · Exterior · Quintal`, inclua seu ID em
`client-web/tiled/palettes.json`, dentro de `gardenPalette.assetIds`, e execute `assets` novamente.
Isso é opcional; o catálogo completo já contém todos os PNGs de `assets/world/`.

Registre em `ASSETS.md` o arquivo de origem, tamanho e finalidade do novo recorte.

## 9. Fazer a porta abrir outra cena

O padrão do projeto é: a fachada permanece no mundo e o interior vive em outra cena.

### No mundo

1. na camada `13 · Spawns e portais`, duplique um portal existente;
2. coloque-o sobre a porta da nova fachada;
3. mantenha a classe `portal`;
4. edite as propriedades:

   ```text
   id = arcade-door
   targetScene = arcade
   targetSpawn = entrance
   label = Entrar no arcade
   ```

5. duplique um ponto de classe `spawn` e crie `arcade-exit` diante da porta. Esse será o retorno do
   interior para o mundo.

### Criar o mapa interno

1. duplique `client-web/tiled/maps/tooq-office.tmj` como `arcade.tmj`;
2. em **Map → Map Properties**, altere `id`, `name` e `subtitle`;
3. mantenha `kind = interior`;
4. apague ou reorganize salas, móveis, quintal e colisões;
5. mantenha um spawn de classe `spawn` com `id = entrance`;
6. crie um portal de saída com:

   ```text
   targetScene = world
   targetSpawn = arcade-exit
   ```

7. cadastre a cena em `client-web/maps/scenes.json`:

   ```json
   { "id": "arcade", "file": "arcade.json" }
   ```

8. salve e converta todas as cenas.

Os IDs devem coincidir exatamente: nome do `.tmj`, `id` do mapa, `targetScene` e entrada do
manifesto.

## 10. Converter e testar

Depois de salvar o `.tmj`:

```powershell
# Valida sem alterar o runtime.
node client-web/tools/tiled-converter.mjs validate all

# Atualiza pisos/cercas/paredes visíveis no Tiled.
node client-web/tools/tiled-converter.mjs refresh-preview world

# Gera os JSONs usados pelo jogo.
node client-web/tools/tiled-converter.mjs from-tiled all
```

Abra a cena diretamente:

```text
http://localhost:8123/?scene=world
```

Depois confira as colisões:

```text
http://localhost:8123/?scene=world&debug=collisions
```

Teste andando — e também com skate, patins, patinete e moto — por toda a largura da rua, ao redor
das estruturas e através de cada porta.

## 11. Ordem recomendada para construir um bairro

Trabalhe em cortes pequenos para ser fácil descobrir qual edição causou um problema:

1. aumente o mapa e a câmera;
2. faça somente as ruas principais;
3. converta e caminhe;
4. posicione as fachadas;
5. adicione colisões deixando as portas livres;
6. converta e use `debug=collisions`;
7. adicione árvores, bancos, placas, postes e detalhes;
8. crie portais e interiores;
9. teste ida e volta;
10. somente depois refine piso, curvas, sombras e decoração.

Uma boa primeira entrega manual é **uma rua nova + uma fachada + um interior simples + retorno ao
mundo**. Ela prova o fluxo inteiro antes de multiplicar o trabalho.

## 12. Erros comuns

| Sintoma | Causa provável |
|---|---|
| A rua não aparece no jogo | faltou `from-tiled` ou a classe não é `path` |
| A rua voltou ao visual antigo no Tiled | faltou `refresh-preview` |
| O trabalho sumiu | foi usado `to-tiled --force` depois de editar o `.tmj` |
| O piso sempre fica claro | `floor` inválido; o renderer usa `light` como fallback |
| O prédio aparece, mas o avatar o atravessa | faltou footprint ou camada `12 · Colisões` |
| A porta está desenhada, mas não entra | porta visual não é portal; crie classe `portal` |
| O portal não valida | `targetScene` ou `targetSpawn` não existe |
| O avatar nasce preso | spawn está dentro de colisão ou em cima da parede |
| A câmera mostra vazio | bounds não foram ajustados depois de redimensionar |
| O PNG novo não aparece no Tiled | faltou executar `assets` e reabrir o tileset |

## 13. Checklist final

- [ ] O `.tmj` foi salvo.
- [ ] Nenhuma camada de prévia foi editada manualmente.
- [ ] A rua está na camada `02 · Caminhos` e usa classe `path`.
- [ ] Existe espaço para o avatar e para os veículos.
- [ ] Props grandes têm colisão apenas na base.
- [ ] Portas acessíveis possuem um vão real entre colisões.
- [ ] Todo portal tem spawn válido no destino e caminho de volta.
- [ ] O limite da câmera cobre a nova área sem revelar vazio.
- [ ] `validate all` passou.
- [ ] `from-tiled all` foi executado.
- [ ] A cena foi testada normalmente e com `debug=collisions`.
- [ ] Assets novos foram registrados no `ASSETS.md`.

