# Tooq Triad — cardgame social

Estado atual do minigame Pokémon do Office Quest. O plano de produto e as decisões de
balanceamento continuam em [`PLANO_CARDGAME_POKEMON.md`](PLANO_CARDGAME_POKEMON.md); este arquivo
descreve o que está implementado e como operar/testar.

## 1. Fluxo jogável

1. O jogador abre `Cartas`, no dock da HUD.
2. Uma conta sem perfil de cardgame recebe **3 boosters** e começa com o **álbum vazio**.
3. Cada booster revela **5 cartas** e grava o resultado no Postgres antes de responder ao cliente.
4. Com pelo menos 15 cartas diferentes, o jogador monta e salva um baralho de **15 cartas**.
5. Próximo de outro avatar humano na mesma cena, clica nele e escolhe `Desafiar`.
6. O adversário aceita ou recusa. Ao aceitar, recebe 6 cartas na mão e deixa 3 no monte.
7. Cada carta jogada compra automaticamente a próxima. O deck maior mantém cartas ocultas e
   aumenta a variação sem alongar as nove jogadas do tabuleiro.

Não existe oponente controlado pela máquina. Bots da presença não podem ser desafiados.

## 2. Central do jogador

O cardgame não mantém um painel fixo grande sobre o mundo, nem botão próprio: a entrada é o item
`Cartas` do dock (`client-web/src/hud/Dock.js`), que abre uma central responsiva com:

- **Visão geral** — quantidade de cartas únicas, shiny e estado do baralho;
- **Álbum** — as 1.025 posições da Pokédex Nacional, filtros, carregamento progressivo, silhuetas
  e entradas separadas para a carta normal e cada bônus shiny possuído;
- **Boosters** — pacote animado e revelação sequencial das cinco cartas;
- **Baralho** — seleção de 15 espécies pertencentes ao jogador, incluindo a variante shiny escolhida;
- **Horas, Objetivos, Quadro e Backlog** — os módulos oficiais de
  `backend/VirtualOffice.Api/wwwroot/shared/`, também usados pelo app web.

Não duplique as telas de trabalho dentro do cardgame. `CardGamePanel.js` apenas hospeda
`WorkPanel.js`, que importa os módulos compartilhados do backend.

## 3. Catálogo e chances

O catálogo versionado contém os 1.025 Pokémon das gerações I–IX, Pikachu do Ash, Dragonite Carteiro e oito
prêmios do Casino Nerd: Pikachu Jogador, Mewtwo Rei do Cassino, Alakazam Quadra, Alakazam Quina, Gengar Glitch,
Charizard Arcade, Porygon Jackpot e Meowth Dealer. Essas oito cartas não entram no sorteio comum de boosters: só podem ser obtidas
pelas respectivas conquistas do cassino. Atributos-base ficam entre 1 e 15.
O script `client-web/tools/generate-cardgame-catalog.mjs` gera os valores e
baixa os sprites para uso local; nenhuma API Pokémon é consultada em runtime.
O álbum sempre mostra as 1.025 cartas-base e acrescenta cada prêmio especial depois de conquistado;
o perfil é atualizado ao abrir Álbum ou Baralho, portanto prêmios recém-recebidos podem ser usados
sem recarregar a página.

Cada booster usa RNG criptograficamente seguro no backend. A quinta posição dos boosters regulares
garante raridade incomum ou melhor. Cada slot volta a sortear do catálogo completo do booster:
possuir ou já ter sorteado uma carta não muda sua chance, e duplicatas no mesmo pacote são válidas.
Os pesos relativos atuais por carta são:

| Raridade | Peso |
|---|---:|
| Comum | 6500 |
| Incomum | 2500 |
| Rara | 650 |
| Épica | 90 |
| Lendária | 8 |
| Especial | 1 |

Existem Booster Nacional, nove edições por geração, Booster Raro e Booster Especial. O raro usa
chance shiny aumentada. Entregar dez cópias normais iguais concede um Booster Especial daquela
espécie: as cinco cartas compartilham ao menos um tipo com o alvo, há 10% exatos de incluir o
shiny-alvo e as demais espécies têm 0,05% de shiny por carta.

### 3.1 O que a Banca de cartas vende

A Banca de cartas da Galeria Tooq (`store:cards`) vende **somente as nove Edições por geração**,
por **400 moedas** e no máximo **uma de cada por semana**, por jogador. A semana é a mesma dos
objetivos — segunda-feira no fuso do time, via `Periods.WeekStart`.

Nacional, Raro, Ultrarraro e Especial **continuam fora do balcão**: eles são a moeda das
conquistas (cassino, objetivo semanal, Liga, trocas do álbum) e vendê-los apagaria essas rotas.

O teto é do balcão, não do cardgame: `GameItemDefinition.WeeklyPurchaseLimit` (0 = sem teto, o
caso de todo móvel e equipamento) com o consumo em `StorePurchaseQuota`, uma linha por
usuário/item/semana. A compra roda em transação `Serializable` — em `ReadCommitted` dois cliques
simultâneos leem a mesma cota zerada e ambos passam.

`GET /api/game/catalog` devolve `weeklyLimit`, `weeklyPurchased` e `weeklyRemaining` por item, para
o balcão marcar `Esgotado` antes do clique em vez de recusar só na hora de pagar.

Calibragem: com o teto diário de 400 de gold do trabalho mais 180 de presença, comprar as nove
edições numa semana custa uma semana cheia de moeda — perseguir uma geração continua sendo escolha.

O Booster Raro possui duas rotas sem moedas:

- concluir os cinco objetivos semanais ativos concede um por semana;
- entregar 50 cópias normais `Rare`, `Epic` ou `Legendary` excedentes, distribuídas entre pelo
  menos 10 espécies, concede um. A troca preserva uma cópia de cada espécie e consome as cartas
  da menor raridade primeiro.

No Arrange Dice, completar cinco ou mais cartas vizinhas também concede um Booster Raro.

O **Booster Ultrarraro** não é vendido e, neste momento, só vem da sexta vitória consecutiva na
Liga Pokémon da Casa. Ele contém cinco cartas `Rare+`, garante `Legendary` na quinta posição e
aplica 10% de chance shiny independentemente em cada carta.

Pokémon com próxima evolução possuem outra troca direta no Álbum: cinco cópias normais da espécie
viram uma cópia normal da evolução escolhida. Em linhas ramificadas, como Eevee, o jogador escolhe
o destino; não existe sorteio nessa receita. Shinies nunca são consumidos por ela.

Shiny é persistido com o lado aleatório bonificado. Ele soma +1 permanente; uma borda-base 15
vira 16, única forma de imprimir 16. Duas shinies da mesma espécie podem ter lados bonificados
diferentes; o álbum, o deck e a partida preservam e exibem essa escolha.

## 4. Persistência e autoridade

O schema é criado pela migration `20260728000327_AddCardGameCollection`:

| Entidade | Conteúdo |
|---|---|
| `CardGameProfile` | usuário e baralho em JSON |
| `CardGameCollectionItem` | usuário, carta, lado shiny, quantidade e primeira aquisição |
| `CardGameBoosterBalance` | usuário, tipo do booster, alvo opcional e quantidade |

A cota semanal da Banca vem da migration `20260730213348_AddStorePurchaseQuota`:

| Entidade | Conteúdo |
|---|---|
| `StorePurchaseQuota` | usuário, item, início da semana e quantidade já comprada |

O perfil é criado de forma preguiçosa no primeiro acesso, com três Boosters Nacionais. O backend
valida que as quinze referências salvas e usadas em desafio pertencem ao álbum do usuário.

REST implementado:

```text
GET  /api/cardgame/profile
POST /api/cardgame/boosters/open
POST /api/cardgame/boosters/exchange
POST /api/cardgame/evolutions/exchange
GET  /api/cardgame/casino-table
POST /api/cardgame/casino-table/start
POST /api/cardgame/casino-table/move
POST /api/cardgame/casino-table/leave
PUT  /api/cardgame/deck
```

Desafio e partida passam pelo `OfficeHub`:

```text
ChallengeCardGame
AcceptCardGameChallenge
DeclineCardGameChallenge
CardGameMove
ResignCardGame
```

O servidor valida proximidade máxima de 150 unidades, cena, propriedade do baralho, turno, versão,
casa e carta na mão. O snapshot enviado a cada cliente contém apenas sua própria mão; do oponente
expõe somente as contagens.

Coleção, boosters e baralho sobrevivem ao reinício. Partidas em andamento ainda são mantidas em
memória e não sobrevivem ao restart do backend.

## 5. Arquivos principais

```text
backend/VirtualOffice.Api/CardGameEndpoints.cs       coleção, booster e baralho
backend/VirtualOffice.Api/CardGameHub.cs             desafio e partida
backend/VirtualOffice.Api/Data/cardgame-catalog.json catálogo validado pelo servidor
client-web/src/cardgame/CardGamePanel.js             central, álbum, booster, deck e partida
client-web/src/cardgame/engine.js                    motor puro do tabuleiro
client-web/src/cardgame/engine.test.mjs               testes do motor e catálogo
client-web/assets/cardgame/catalog.json              catálogo visual
client-web/assets/cardgame/pokemon/*.png             1.025 sprites locais
```

## 6. Como testar com dois jogadores

Suba Postgres, backend e cliente conforme [`COMO-RODAR.md`](COMO-RODAR.md). Abra:

```text
http://localhost:8123/?userId=1&scene=tooq-campus
http://localhost:8123/?userId=2&scene=tooq-campus
```

Em cada janela:

1. abra `Cartas` no dock;
2. confira `3 boosters`, álbum `0/1025` e baralho `0/15`;
3. abra os três boosters;
4. monte e salve um baralho de quinze cartas;
5. aproxime os avatares;
6. em uma janela, clique no outro avatar e envie o desafio;
7. aceite na segunda janela e complete as nove jogadas.

Checagens automatizadas:

```powershell
node --test client-web/src/cardgame/engine.test.mjs
node --test client-web/src/store-catalog.test.mjs
node --test client-web/tools/tiled-converter.test.mjs
dotnet build backend/VirtualOffice.Api/VirtualOffice.Api.csproj --no-restore
```

Para conferir a Banca à mão: abra a Galeria Tooq, vá ao balcão de cartas e compre uma edição
duas vezes. A segunda precisa recusar com o aviso de limite semanal, e a linha do item passa a
mostrar `Esgotado` / `volta segunda` mesmo com moeda sobrando.

## 7. Pendências conhecidas

- persistir e recuperar partida em andamento;
- ampliar as fontes recorrentes do Booster Raro (as edições já têm balcão e custo) e registrar
  histórico de abertura;
- adicionar pity e mostrar probabilidades finais na interface;
- animações específicas para captura e vantagem de tipo;
- telemetria e balanceamento em larga escala.
