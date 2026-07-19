# Tutorial — criar ruas e estruturas no mundo aberto

Este guia mostra como expandir manualmente a cena externa do Office Quest usando o **Tiled**. O
objetivo do exercício é criar uma nova rua, colocar uma estrutura no fim dela, configurar colisões
e, opcionalmente, transformar a porta da estrutura em entrada para outra cena.

Você não precisa alterar o Phaser para usar os pisos e assets já cadastrados. O trabalho normal é:

```text
Tiled: tiled/maps/world.tmj
          + tilesets/*.tsj
          ↓ salvar
Validação local → recarga automática → jogo no navegador
```

Mobília colocada no mundo pelo Tiled é cenário fixo. O estoque persistente e o editor do jogador
atuam em salas declaradas e mantêm suas instâncias fora do `.tmj`; não use o inventário para ruas,
fachadas, cercas ou mobiliário urbano estrutural.

## 1. A regra que evita perder trabalho

Edite [`tiled/maps/world.tmj`](tiled/maps/world.tmj). O `.tmj` e os `.tsj` referenciados são a
fonte carregada diretamente pelo jogo; `maps/world.json` é apenas um snapshot legado.

O desenho existente está em três tile layers nativas e desbloqueadas:

- `🎨 00 · CHÃO E RUAS`;
- `🎨 01 · PAREDES`;
- `🎨 02 · CERCAS`.

Edite-as diretamente com o pincel e a borracha. Prédios, árvores e outras imagens continuam como
objetos movíveis em `09 · Props do mundo`; móveis ficam em `10 · Móveis`.

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

O jogo estará em `http://localhost:8123/#world`. Ao salvar um mapa válido, o servidor valida os
arquivos do Tiled e o navegador recarrega a cena automaticamente.

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

1. redimensione o mapa; no mundo aberto a câmera acompanha automaticamente as novas dimensões;
2. pinte a nova área na camada `🎨 00 · CHÃO E RUAS`;
3. pinte ou apague as cercas na camada `🎨 02 · CERCAS`;
4. remova a cerca antiga exatamente onde a nova rua deve continuar.

Ao aumentar o mapa, os tiles novos começam vazios. Use o preenchimento do Tiled na camada `🎨 00`
para cobrir rapidamente a nova área com grama.

Paredes e cercas pintadas geram a própria colisão. Não existe retângulo separado para manter
sincronizado; apagar o tile libera a passagem.

## 5. Criar uma rua com os pisos atuais

1. selecione `🎨 00 · CHÃO E RUAS`;
2. escolha o piso desejado na paleta `01 · Construção`;
3. use **Stamp Brush** (`B`), **Bucket Fill** (`F`) e a borracha para desenhar a rua;
4. salve e confira o resultado no navegador.

Pisos disponíveis:

| `floor` | Aparência atual | Uso sugerido |
|---|---|---|
| `light` ou `cream` | piso claro | calçada e rua clara |
| `gray` ou `carpet` | cinza | protótipo de asfalto |
| `terra` ou `sage` | verde/terroso | trilha e praça |
| `wood` | madeira | deck e passarela |
| `water` | água | lago decorativo, sem colisão automática |

Tiles de piso são atravessáveis. Não coloque colisão sobre a rua.

### Formar curvas e cruzamentos

Como a rua agora é pintada tile a tile, curvas e cruzamentos podem ter qualquer formato.

```text
            ramal 5 tiles
                │
                │
   rua principal 7 tiles ─────────
```

Sobreposição de caminhos é permitida. Deixe ambos com o mesmo `floor` para a emenda desaparecer.

## 6. Adicionar um piso de asfalto novo

O PNG deve ser **seamless, 16×16 e sem bordas**. Não é necessário alterar JavaScript ou conversor:

1. copie o tile para `client-web/assets/floors/floor_road.png`;
2. no Tiled, use **File → New → New Tileset** e marque **Collection of Images**;
3. adicione `floor_road.png` e salve como `client-web/tiled/tilesets/my-roads.tsj`;
4. em `world.tmj`, use **Map → Add External Tileset** e escolha `my-roads.tsj`;
5. pinte o novo tile em `🎨 00 · CHÃO E RUAS` e salve.

O `.tmj` passa a referenciar o novo `.tsj`; o carregador encontra a imagem e a entrega ao Phaser
automaticamente. Se o tile possuir uma borda, ela será repetida a cada 16 px e a rua ficará
quadriculada. Confira o PNG ampliado antes de cadastrá-lo.

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
5. crie ou abra um tileset externo **Collection of Images** em `client-web/tiled/tilesets/`;
6. use **Tileset → Add Tiles** para adicionar `arcade_front.png`;
7. no tile, defina `class = prop` e a propriedade string `assetId = arcade_front`;
8. adicione esse tileset externo ao `world.tmj` e insira o objeto em `09 · Props do mundo`.

O runtime lê a referência externa e carrega a imagem sem cadastro em código. Se você quiser incluir
o asset nas paletas oficiais geradas do projeto, ainda pode atualizar `tiled/palettes.json` e rodar
o comando legado `assets`, mas isso não é necessário para usar um tileset próprio.

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
   { "id": "arcade", "file": "tiled/maps/arcade.tmj" }
   ```

8. salve; o servidor valida e recarrega a cena automaticamente.

Os IDs devem coincidir exatamente: nome do `.tmj`, `id` do mapa, `targetScene` e entrada do
manifesto.

## 10. Salvar e testar

Com `node client-web/server.js` rodando, salvar o `.tmj` ou `.tsj` já valida o projeto e recarrega o
jogo. Aguarde a confirmação `Mapa atualizado` no navegador. Se houver erro, corrija a mensagem
exibida e salve novamente.

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
3. salve e caminhe;
4. posicione as fachadas;
5. adicione colisões deixando as portas livres;
6. salve e use `debug=collisions`;
7. adicione árvores, bancos, placas, postes e detalhes;
8. crie portais e interiores;
9. teste ida e volta;
10. somente depois refine piso, curvas, sombras e decoração.

Uma boa primeira entrega manual é **uma rua nova + uma fachada + um interior simples + retorno ao
mundo**. Ela prova o fluxo inteiro antes de multiplicar o trabalho.

## 12. Erros comuns

| Sintoma | Causa provável |
|---|---|
| A rua não aparece no jogo | a camada `🎨 00` não foi salva ou o salvamento mostrou erro |
| Consigo ver, mas não pintar | está selecionada uma camada de objetos; selecione uma camada `🎨` |
| O mapa não abre após salvar | há uma referência, classe ou propriedade inválida; leia o aviso no jogo |
| O piso sempre fica claro | `floor` inválido; o renderer usa `light` como fallback |
| O prédio aparece, mas o avatar o atravessa | faltou footprint ou camada `12 · Colisões` |
| A porta está desenhada, mas não entra | porta visual não é portal; crie classe `portal` |
| O portal não valida | `targetScene` ou `targetSpawn` não existe |
| O avatar nasce preso | spawn está dentro de colisão ou em cima da parede |
| A câmera mostra vazio | a área nova ainda não foi preenchida na camada `🎨 00` |
| O PNG novo não aparece no jogo | o `.tsj` não foi adicionado ao mapa, ou o `.tsj`/`.tmj` não foi salvo |

## 13. Checklist final

- [ ] O `.tmj` foi salvo.
- [ ] A rua foi pintada na camada `🎨 00 · CHÃO E RUAS`.
- [ ] Paredes e cercas foram pintadas nas camadas `🎨 01` e `🎨 02`.
- [ ] Existe espaço para o avatar e para os veículos.
- [ ] Props grandes têm colisão apenas na base.
- [ ] Portas acessíveis possuem um vão real entre colisões.
- [ ] Todo portal tem spawn válido no destino e caminho de volta.
- [ ] O limite da câmera cobre a nova área sem revelar vazio.
- [ ] O navegador confirmou `Mapa atualizado` sem erro.
- [ ] A cena foi testada normalmente e com `debug=collisions`.
- [ ] Assets novos foram registrados no `ASSETS.md`.
