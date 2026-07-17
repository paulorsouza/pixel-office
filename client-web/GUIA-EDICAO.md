# Guia prático de edição dos mundos

Este guia ensina a alterar o **Office Quest / Tooq** sem precisar conhecer toda a engine. O cliente
usa **Phaser 3**, mas a maior parte do trabalho de level design acontece nos arquivos JSON em
[`maps/`](maps/). Salve o arquivo, atualize o navegador e veja o resultado; não existe etapa de
build.

> Para level design, comece pelo **Tiled + navegador** usando o fluxo em
> [`tiled/README.md`](tiled/README.md). VS Code continua recomendado para código, inspeção dos JSONs
> gerados e ajustes avançados.

## 1. Preparar o ambiente

Você precisa apenas de:

- [Node.js](https://nodejs.org/) para servir os arquivos locais;
- um editor de código, de preferência VS Code ou WebStorm;
- Chrome, Edge ou Firefox com as ferramentas de desenvolvedor.

Abra a pasta inteira `E:\workspace\pixel-office` no editor. No terminal, a partir da raiz do
projeto, execute:

```powershell
node client-web/server.js
```

Abra `http://localhost:8123`. Para encerrar o servidor, volte ao terminal e pressione `Ctrl+C`.

O servidor não faz recarregamento automático. Depois de salvar um mapa, use `Ctrl+R` no navegador.

## 2. Qual editor ou IDE usar

### Recomendação para agora: Visual Studio Code

O [VS Code](https://code.visualstudio.com/docs/languages/javascript) é gratuito e já traz suporte a
JavaScript, navegação, refatoração, formatação e depuração no navegador. Ele também
[valida JSON](https://code.visualstudio.com/docs/languages/json), o que ajuda a encontrar vírgulas e
chaves erradas antes de abrir o jogo.

Neste projeto, abra simultaneamente:

- `client-web/maps/world.json`, para o quintal central;
- `client-web/maps/tooq-office.json`, para escritório e quintal privado;
- `client-web/maps/scenes.json`, para cadastrar cenas;
- `client-web/src/MapRenderer.js`, somente quando precisar mudar o que o formato suporta;
- `client-web/src/main.js`, somente quando precisar cadastrar um novo tipo de asset.

Não é obrigatório instalar nenhuma extensão para começar.

### Alternativa completa: WebStorm

O [WebStorm](https://www.jetbrains.com/help/webstorm/javascript-specific-guidelines.html) é uma IDE
paga, com recursos fortes de inspeção, refatoração e depuração JavaScript. É uma boa escolha se você
já usa produtos JetBrains ou prefere uma IDE que configure mais coisas automaticamente. Para editar
os mapas, o fluxo é o mesmo do VS Code.

### Editor visual recomendado: Tiled

O [Tiled](https://doc.mapeditor.org/en/stable/manual/introduction/) é um editor visual de mapas 2D,
não uma IDE. O projeto agora possui mapas `.tmj`, paletas de assets e um conversor compatível com o
[formato JSON do Tiled](https://doc.mapeditor.org/en/stable/reference/json-map-format/). Ele permite
desenhar salas, posicionar objetos, editar colisões, spawns, portais e limites da câmera sem trabalhar
diretamente nos arrays JSON.

### Editor visual da engine: Phaser Editor 2D

O [Phaser Editor 2D](https://help-v3.phasereditor2d.com/intro/index.html) oferece ferramentas visuais
e um Scene Editor voltado a Phaser 3. Ele pode ajudar a compor cenas e inspecionar assets, mas também
não entende automaticamente o schema `building`, `rooms`, `furniture`, `props` e `portals` deste
projeto. Adotá-lo hoje exigiria um adaptador ou uma mudança planejada no pipeline dos mapas.

### Resumo da escolha

| Ferramenta | Funciona agora? | Melhor uso |
|---|---:|---|
| VS Code | Sim | Recomendado para mapas JSON e código Phaser. |
| WebStorm | Sim | IDE completa para quem prefere o ecossistema JetBrains. |
| Tiled | Sim, pelo conversor | Editor visual recomendado para mapas e objetos. |
| Phaser Editor 2D | Não diretamente | Composição visual Phaser, após integração com nosso schema. |
| DevTools do navegador | Sim | Ver erros, inspecionar rede, pausar código e testar o jogo. |

## 3. Como o mundo está organizado

```text
client-web/
├── maps/
│   ├── scenes.json          lista de cenas e cena inicial
│   ├── world.json           quintal central, usado como hub
│   └── tooq-office.json     interior do escritório + quintal privado
├── assets/
│   ├── chars/               personagens
│   ├── floors/              pisos repetíveis
│   ├── furniture/office/    móveis recortados, como of_225.png
│   ├── tiles/               peças de parede
│   └── world/               árvores, bancos, fachada, grama etc.
├── src/
│   ├── main.js              carrega assets, jogador, câmera e transições
│   └── MapRenderer.js       transforma cada mapa JSON em uma cena Phaser
└── server.js
```

O jogo carrega `scenes.json`, abre cada arquivo registrado e transforma seus dados em imagens,
pisos, paredes, colisões, spawns e portais.

Existem dois tipos de mapa:

- `"kind": "world"`: área externa, com terreno, caminhos, cercas e props;
- `"kind": "interior"`: prédio com paredes e mobília; também pode ter um `yard` externo.

## 4. Coordenadas: a regra mais importante

O mapa usa uma grade de **tiles**, e cada tile mede atualmente **16 × 16 pixels**.

```text
(0,0) ───────────────► x aumenta para a direita
  │
  │       objeto em (8,5)
  │
  ▼
y aumenta para baixo
```

Quase todos os números do JSON estão em tiles:

- `x`, `y`: posição;
- `w`, `h`: largura e altura;
- `camera.bounds`: retângulo que a câmera pode mostrar;
- `collision`: footprint físico do objeto;
- `spawns`: ponto onde os pés do avatar aparecem;
- `portals`: área onde o jogador pode pressionar `E`.

Valores decimais são permitidos. Por exemplo, `"x": 9.5` coloca o ponto no meio de um tile.

## 5. Seu primeiro ajuste: mover um banco

1. Inicie o servidor.
2. Abra `client-web/maps/world.json`.
3. Procure por um prop com `"texture": "bench"`.
4. Altere `x` e `y`.
5. Salve e use `Ctrl+R` no navegador.

Exemplo:

```json
{
  "texture": "bench",
  "x": 10,
  "y": 29,
  "originX": 0.5,
  "originY": 1,
  "collision": { "x": -1.5, "y": -0.55, "w": 3, "h": 0.55 }
}
```

O ponto `(x, y)` é a base central da imagem porque `originX` é `0.5` e `originY` é `1`. A colisão é
relativa a esse ponto. Nesse exemplo, ela começa 1,5 tile à esquerda e ocupa 3 tiles de largura.

Se mover o visual, sua colisão acompanha automaticamente. Se alterar o tamanho aparente do asset,
ajuste também o footprint.

## 6. Editar o quintal central

O arquivo é `client-web/maps/world.json`.

### Tamanho e câmera

```json
{
  "tile": 16,
  "w": 44,
  "h": 36,
  "camera": {
    "zoom": 2.15,
    "minZoom": 1.35,
    "bounds": { "x": 1, "y": 1, "w": 42, "h": 35 }
  }
}
```

- `w` e `h` definem o tamanho lógico do mapa;
- `zoom` é a aproximação inicial;
- `minZoom` limita o quanto o jogador pode afastar;
- `bounds` limita a câmera. A borda direita é `x + w` e a inferior é `y + h`.

Se o portão está em `y = 36`, fazer a borda inferior dos bounds terminar em 36 impede a câmera de
mostrar o vazio depois dele. O runtime também aumenta o zoom mínimo quando necessário para preencher
a janela inteira.

### Terreno, caminhos e detalhes

```json
"ground": "grass",
"paths": [
  { "x": 17, "y": 22, "w": 5, "h": 14, "floor": "light" }
],
"details": [
  { "x": 9, "y": 20, "alpha": 0.65 }
]
```

`ground` preenche o mapa. `paths` desenha retângulos de piso e não cria colisão. `details` coloca
pequenas variações na grama e também não cria colisão.

Pisos aceitos:

| Nome curto | Textura usada |
|---|---|
| `wood` | madeira |
| `gray` ou `carpet` | carpete cinza |
| `light` ou `cream` | piso claro |
| `terra` ou `sage` | piso verde/terroso |
| `water` | água |

### Cercas vivas

```json
"hedges": [
  { "x": 1, "y": 1, "w": 42, "h": 2 },
  { "x": 1, "y": 3, "w": 2, "h": 31 }
]
```

Cada hedge é desenhado **e já recebe colisão**. Deixe um intervalo real na lista quando quiser um
portão; uma única cerca comprida continuará bloqueando a passagem mesmo que você desenhe um portão
por cima.

### Objetos decorativos e sólidos

Itens em `props` são imagens posicionadas no mundo:

```json
{
  "texture": "flower1",
  "x": 5,
  "y": 23.5,
  "originX": 0.5,
  "originY": 1
}
```

Sem `collision`, o avatar atravessa o item. Isso é desejável para flores e detalhes pequenos.

Para árvore, banco, fonte, portão ou outro objeto volumoso, inclua `collision`:

```json
{
  "texture": "tree1",
  "x": 8,
  "y": 15,
  "originX": 0.5,
  "originY": 1,
  "collision": { "x": -1.2, "y": -0.8, "w": 2.4, "h": 0.8 }
}
```

Prefira colidir apenas com a base visual do objeto. Uma árvore alta pode cobrir o avatar quando ele
passa atrás dela; isso não significa que toda a copa deva bloquear o caminho.

### Colisões invisíveis

Use `collisions` quando a barreira não pertence a um único prop, como a parede sólida de uma
fachada:

```json
"collisions": [
  { "x": 12.5, "y": 22.1, "w": 5, "h": 1.9 },
  { "x": 20.5, "y": 22.1, "w": 11, "h": 1.9 }
]
```

Dividir a colisão em dois retângulos deixa o vão da porta livre.

## 7. Editar o escritório e o quintal privado

O arquivo é `client-web/maps/tooq-office.json`.

### Prédio principal

```json
"building": {
  "x": 2,
  "y": 2,
  "w": 52,
  "h": 34,
  "floor": "wood",
  "doors": [
    { "side": "S", "at": 24, "len": 3, "texture": "office_door", "frame": 8 }
  ]
}
```

O renderer preenche o piso e cria paredes com colisão no perímetro. A porta remove tiles da parede;
ela não deve ser simulada com um móvel colocado sobre a parede.

Em uma porta:

- `side`: `N`, `S`, `E` ou `W`;
- `at`: distância em tiles a partir do canto superior ou esquerdo do retângulo;
- `len`: tamanho do vão;
- `texture` e `frame`: imagem da porta aberta;
- `flipX`: espelha a imagem quando necessário.

Evite encostar o vão nos cantos. Em paredes norte, o renderer remove também a face 3D da parede.

### Zonas abertas

```json
{
  "id": "coffee",
  "name": "Café",
  "x": 39,
  "y": 22,
  "w": 11,
  "h": 8,
  "floor": "terra"
}
```

`zones` muda o piso e adiciona um rótulo, mas **não cria paredes nem colisão**. Use para café,
lounge, recepção e áreas de equipes.

### Salas fechadas e portas

```json
{
  "id": "focus-a",
  "name": "Sala de Foco",
  "x": 4,
  "y": 14,
  "w": 7,
  "h": 7,
  "floor": "light",
  "doors": [
    { "side": "S", "at": 2, "len": 3, "texture": "office_door", "frame": 8 }
  ]
}
```

`rooms` cria piso, parede sólida, vão de porta e rótulo. `x`, `y`, `w` e `h` incluem as paredes.
Não sobreponha duas salas nem encoste uma sala na saída do prédio sem verificar a colisão.

### Quintal privado

```json
"yard": { "x": 2, "y": 35, "w": 52, "h": 17, "ground": "grass" }
```

Um mapa `interior` com `yard` também aceita `details`, `paths`, `hedges`, `props` e `collisions`.
Esses campos funcionam exatamente como no `world.json`.

## 8. Colocar e mover móveis

Todo móvel usado por uma cena precisa aparecer em `assets`:

```json
"assets": [
  "office_door",
  "of_225",
  "of_306"
]
```

Depois, coloque-o em `furniture`:

```json
"furniture": [
  { "id": "of_225", "x": 26, "y": 10, "solid": true },
  { "id": "of_306", "x": 26, "y": 12 }
]
```

Campos suportados:

| Campo | Efeito |
|---|---|
| `id` | Nome do arquivo sem `.png`, por exemplo `of_225`. |
| `x`, `y` | Posição em tiles. |
| `offsetX`, `offsetY` | Ajuste fino em **pixels**, não tiles. |
| `originX`, `originY` | Ponto de ancoragem da imagem. O padrão é base central. |
| `flipX` | Espelha horizontalmente. |
| `depth` | Força a ordem de desenho; normalmente deixe automático. |
| `solid` | Adiciona a colisão genérica de um posto de trabalho. |

Limitação atual importante: `solid: true` cria sempre um footprint fixo de aproximadamente
`1.9 × 0.7` tiles. Ele funciona para mesas e objetos de tamanho parecido, mas não representa bem
móveis muito grandes. `furniture[].collision` ainda não é suportado. Use a rota de debug e, quando
necessário, acrescente um retângulo em `collisions` ou melhore o renderer.

Consulte [`../ASSETS.md`](../ASSETS.md) antes de escolher IDs. Esse arquivo registra as medidas e os
recortes já identificados.

## 9. Adicionar um asset novo

### Novo móvel de escritório

O runtime reconhece automaticamente IDs começando com `of_`:

1. coloque `of_999.png` em `client-web/assets/furniture/office/`;
2. adicione `"of_999"` ao `assets` do mapa;
3. adicione `{ "id": "of_999", "x": 20, "y": 10 }` a `furniture`;
4. recarregue o navegador.

O PNG deve estar recortado e com transparência. Registre no `ASSETS.md` a origem, dimensões e o que
o ID representa para não precisar redescobrir isso depois.

### Novo asset de mundo

Para um nome que não começa com `of_`, ainda é necessário cadastrar o caminho em
`client-web/src/main.js`:

```js
const ASSET_PATHS = {
  // ...assets existentes
  picnic_table: 'assets/world/picnic_table.png',
};
```

Depois adicione `"picnic_table"` ao `assets` do mapa e use a mesma chave em `props`:

```json
{
  "texture": "picnic_table",
  "x": 14,
  "y": 28,
  "originX": 0.5,
  "originY": 1,
  "collision": { "x": -1.5, "y": -0.8, "w": 3, "h": 0.8 }
}
```

Esta pequena parte ainda está em código. No futuro, o catálogo de caminhos pode virar outro JSON
para deixar a inclusão de assets totalmente orientada a dados.

## 10. Spawns, portais e novas cenas

### Spawns

```json
"spawns": {
  "default": { "x": 19.5, "y": 31 },
  "from-office": { "x": 19, "y": 25.5 }
}
```

Todo mapa precisa de `spawns.default`. Crie nomes descritivos para cada entrada. Posicione o spawn
em uma área livre, afastado da colisão e já do lado correto da porta.

### Portais

```json
{
  "id": "office-door",
  "x": 17.5,
  "y": 22,
  "w": 3,
  "h": 2.7,
  "targetScene": "tooq-office",
  "targetSpawn": "entrance",
  "label": "Entrar no escritório Tooq"
}
```

O portal é um sensor retangular. Quando os pés do avatar entram nele, o texto de `label` aparece e
`E` troca de cena. Ele não desenha a porta e não cria colisão.

Sempre crie os dois sentidos:

```text
world --portal--> nova-cena
world <--portal-- nova-cena
```

O `targetScene` precisa existir no manifesto, e o `targetSpawn` precisa existir no mapa de destino.

### Criar uma cena

1. Duplique o mapa do tipo mais parecido e renomeie para `client-web/maps/arcade.json`.
2. Troque `id`, `name`, dimensões, conteúdo e spawns.
3. Registre a cena em `client-web/maps/scenes.json`:

```json
{
  "startScene": "world",
  "scenes": [
    { "id": "world", "file": "world.json" },
    { "id": "tooq-office", "file": "tooq-office.json" },
    { "id": "arcade", "file": "arcade.json" }
  ]
}
```

4. Crie um portal no hub apontando para `arcade`.
5. Crie um portal em `arcade` apontando de volta para `world`.
6. Teste ida, volta, prompt, spawn, colisão e limites de câmera.

Para tornar outra cena inicial, altere `startScene`. Durante o desenvolvimento, é mais rápido usar a
URL de debug e manter o hub como cena inicial oficial.

## 11. Depurar sem andar pelo mapa inteiro

Abra diretamente uma cena e um spawn:

```text
http://localhost:8123/?scene=tooq-office&spawn=entrance
http://localhost:8123/?scene=tooq-office&spawn=yard-gate
```

Mostre todos os corpos de colisão:

```text
http://localhost:8123/?scene=world&debug=collisions
http://localhost:8123/?scene=tooq-office&spawn=entrance&debug=collisions
```

As caixas coloridas de debug não fazem parte do jogo. Use-as para procurar:

- móveis atravessáveis;
- colisões maiores do que a base visual;
- paredes invisíveis fechando uma porta;
- portal inacessível por causa de um portão;
- spawn dentro de parede ou móvel.

Abra também as DevTools com `F12` e consulte **Console**. Erros comuns aparecem como:

- `Unexpected token`: JSON inválido;
- `Asset sem caminho`: ID listado em `assets` mas ausente de `ASSET_PATHS`;
- `Cena desconhecida`: `targetScene` não cadastrado em `scenes.json`;
- erro 404: arquivo ou caminho do asset incorreto.

## 12. Validar o JSON antes de testar

JSON é rígido:

- não aceita comentários;
- não aceita vírgula depois do último item;
- exige aspas duplas em chaves e textos;
- toda chave `{` e lista `[` precisa ser fechada.

O VS Code marca esses erros automaticamente. Você também pode validar pelo terminal:

```powershell
node -e "JSON.parse(require('fs').readFileSync('client-web/maps/world.json','utf8')); console.log('world.json OK')"
node -e "JSON.parse(require('fs').readFileSync('client-web/maps/tooq-office.json','utf8')); console.log('tooq-office.json OK')"
```

Se o comando não imprimir `OK`, corrija o erro e a linha indicada antes de recarregar o jogo.

## 13. Fluxo seguro de edição

Para não se perder durante uma composição grande:

1. defina a intenção em uma frase, como “abrir um corredor entre recepção e café”;
2. altere um único grupo: primeiro piso, depois paredes, depois móveis, depois colisões;
3. salve e recarregue;
4. caminhe por todos os lados do objeto;
5. ligue `debug=collisions`;
6. teste a cena em uma janela pequena e outra grande para conferir a câmera;
7. faça um commit Git quando o corte estiver bom, antes da próxima alteração grande.

Ao testar movimento por código no console, desative antes a entrada real do teclado com
`scene.input.keyboard.enabled = false` e religue ao terminar. Assim o movimento automatizado não se
mistura com teclas pressionadas pelo usuário.

## 14. Checklist antes de considerar uma cena pronta

- [ ] JSON sem erros.
- [ ] Cena abre pela URL direta.
- [ ] Spawn não está preso.
- [ ] Paredes, cercas, mesas e objetos grandes têm colisão.
- [ ] Flores e detalhes pequenos não criam bloqueios desnecessários.
- [ ] Todos os vãos de porta são atravessáveis.
- [ ] Portais mostram a ação correta e funcionam nos dois sentidos.
- [ ] A câmera não mostra vazio fora do portão ou da cerca.
- [ ] A cena continua legível em mais de um tamanho de janela.
- [ ] IDs e medidas de assets novos foram registrados no `ASSETS.md`.

## 15. Limitações atuais e próxima evolução recomendada

Hoje a edição é manual porque `src/Editor.js` pertence ao runtime antigo e ainda não foi adaptado às
várias cenas. O jogo já é orientado a dados, mas faltam três melhorias para o dono editar tudo
visualmente:

1. catálogo de assets também em JSON, eliminando `ASSET_PATHS` do código;
2. colisão personalizada por móvel, em vez do footprint fixo de `solid: true`;
3. um editor visual — preferencialmente um importador do Tiled ou um editor próprio sobre a grade do
   jogo — capaz de editar props, salas, portas, spawns, portais e câmera.

O Tiled já cobre a edição visual. As próximas melhorias são propriedades tipadas dentro do projeto,
prévia atualizada diretamente no editor e colisões personalizadas por móvel. **Tiled + conversor +
URLs diretas + `debug=collisions`** é agora o fluxo recomendado.
