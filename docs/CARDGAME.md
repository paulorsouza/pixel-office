# Tooq Triad — cardgame social

Estado atual do minigame Pokémon do Office Quest. O plano de produto e as decisões de
balanceamento continuam em [`PLANO_CARDGAME_POKEMON.md`](PLANO_CARDGAME_POKEMON.md); este arquivo
descreve o que está implementado e como operar/testar.

## 1. Fluxo jogável

1. O jogador abre `Cartas`, no dock da HUD.
2. Uma conta sem perfil de cardgame recebe **3 boosters** e começa com o **álbum vazio**.
3. Cada booster revela **5 cartas** e grava o resultado no Postgres antes de responder ao cliente.
4. Com pelo menos 9 cartas diferentes, o jogador monta e salva um baralho de **9 cartas**.
5. Próximo de outro avatar humano na mesma cena, clica nele e escolhe `Desafiar`.
6. O adversário aceita ou recusa. Ao aceitar, recebe 6 cartas na mão e deixa 3 no monte.
7. Cada carta jogada compra automaticamente a próxima. Depois de 9 jogadas, todas as cartas dos
   dois baralhos estiveram disponíveis como escolha.

Não existe oponente controlado pela máquina. Bots da presença não podem ser desafiados.

## 2. Central do jogador

O cardgame não mantém um painel fixo grande sobre o mundo, nem botão próprio: a entrada é o item
`Cartas` do dock (`client-web/src/hud/Dock.js`), que abre uma central responsiva com:

- **Visão geral** — quantidade de cartas únicas, shiny e estado do baralho;
- **Álbum** — as 151 posições da Pokédex, filtros e silhuetas das cartas ainda não obtidas;
- **Boosters** — pacote animado e revelação sequencial das cinco cartas;
- **Baralho** — seleção de 9 cartas pertencentes ao jogador;
- **Horas, Objetivos, Quadro e Backlog** — os módulos oficiais de
  `backend/VirtualOffice.Api/wwwroot/shared/`, também usados pelo app web.

Não duplique as telas de trabalho dentro do cardgame. `CardGamePanel.js` apenas hospeda
`WorkPanel.js`, que importa os módulos compartilhados do backend.

## 3. Catálogo e chances

O catálogo versionado contém os 151 Pokémon originais e as variantes iniciais Pikachu do Ash e
Dragonite Carteiro. O script `client-web/tools/generate-cardgame-catalog.mjs` gera os valores e
baixa os sprites para uso local; nenhuma API Pokémon é consultada em runtime.

Cada booster usa RNG criptograficamente seguro no backend. A quinta posição garante raridade
incomum ou melhor. Os pesos relativos atuais por carta são:

| Raridade | Peso |
|---|---:|
| Comum | 6500 |
| Incomum | 2500 |
| Rara | 650 |
| Épica | 90 |
| Lendária | 8 |
| Especial | 1 |

Nos três boosters iniciais, o sorteio prioriza cartas ainda ausentes do álbum. Isso garante
15 cartas diferentes e permite montar o primeiro baralho; depois de completar o catálogo, o
sorteio volta a aceitar duplicatas.

Shiny é persistido como descoberta separada da carta-base e aparece com tratamento holográfico no
álbum. O bônus shiny durante a partida ainda não está conectado à coleção persistente.

## 4. Persistência e autoridade

O schema é criado pela migration `20260728000327_AddCardGameCollection`:

| Entidade | Conteúdo |
|---|---|
| `CardGameProfile` | usuário, boosters disponíveis e baralho em JSON |
| `CardGameCollectionItem` | usuário, carta, shiny, quantidade e primeira aquisição |

O perfil é criado de forma preguiçosa no primeiro acesso, com três boosters. O backend valida que
as nove cartas salvas e usadas em desafio pertencem ao álbum do usuário.

REST implementado:

```text
GET  /api/cardgame/profile
POST /api/cardgame/boosters/open
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
client-web/assets/cardgame/pokemon/*.png             151 sprites locais
```

## 6. Como testar com dois jogadores

Suba Postgres, backend e cliente conforme [`COMO-RODAR.md`](COMO-RODAR.md). Abra:

```text
http://localhost:8123/?userId=1&scene=tooq-campus
http://localhost:8123/?userId=2&scene=tooq-campus
```

Em cada janela:

1. abra `Cartas` no dock;
2. confira `3 boosters`, álbum `0/151` e baralho `0/9`;
3. abra os três boosters;
4. monte e salve um baralho de nove cartas;
5. aproxime os avatares;
6. em uma janela, clique no outro avatar e envie o desafio;
7. aceite na segunda janela e complete as nove jogadas.

Checagens automatizadas:

```powershell
node --test client-web/src/cardgame/engine.test.mjs
node --test client-web/tools/tiled-converter.test.mjs
dotnet build backend/VirtualOffice.Api/VirtualOffice.Api.csproj --no-restore
```

## 7. Pendências conhecidas

- persistir e recuperar partida em andamento;
- aplicar e exibir o bônus shiny no card usado na partida;
- criar fontes recorrentes de boosters, loja, custo e histórico de abertura;
- adicionar pity e mostrar probabilidades finais na interface;
- animações específicas para captura e vantagem de tipo;
- telemetria e balanceamento em larga escala.
