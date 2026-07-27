# Plano — cardgame Pokémon do Pixel Office

**Status:** em implementação — primeira fatia PvP jogável
**Codinome provisório:** Tooq Triad
**Escopo inicial:** PvP, 151 Pokémon originais, coleção, decks e boosters de 5 cartas

## Progresso

- [x] Motor puro do tabuleiro 3×3.
- [x] Baralho de 9, mão inicial de 6 e compra automática.
- [x] Comparação das quatro bordas e captura de múltiplos vizinhos.
- [x] Bônus de tipo bilateral limitado a `+1`.
- [x] Bônus shiny em uma borda.
- [x] Snapshot privado da mão e snapshot público do adversário.
- [x] Matriz moderna dos 18 tipos e catálogo completo dos 151 Pokémon originais.
- [x] Testes determinísticos da primeira fatia.
- [x] Variantes iniciais: Pikachu do Ash e Dragonite Carteiro.
- [x] Backend autoritativo em memória para desafios e partidas PvP.
- [x] Deck builder de 9 cartas e HUD completo da partida.
- [x] Desafio ao clicar em outro jogador próximo, com aceite e recusa.
- [x] Validação ponta a ponta com dois jogadores no navegador.
- [ ] Persistência de coleção e partidas.
- [ ] Boosters, animação de abertura, shiny e economia de raridade.

## 1. Visão do produto

Um cardgame social inspirado no ritmo do Triple Triad: partidas curtas, tabuleiro 3×3, baralho de
9 cartas, mão inicial de seis e captura por números nas quatro bordas. Depois de usar uma carta, o
jogador compra outra. O diferencial é que o tipo do Pokémon participa de cada confronto e pode
acrescentar `+1`.

O loop principal:

```text
trabalhar/jogar no Pixel Office
        ↓
ganhar ou comprar booster
        ↓
abrir 5 cartas
        ↓
completar a Pokédex e montar deck
        ↓
desafiar outro jogador numa mesa
        ↓
partida de 3–5 minutos
```

Não haverá adversário controlado pela máquina. Testes automatizados podem simular os dois lados,
mas isso não aparece como modo de jogo.

## 2. Decisões de design da primeira versão

### 2.1 Regra-base

- Tabuleiro de `3 × 3`.
- Cada jogador cadastra um baralho de exatamente 9 cartas.
- No começo da partida, o servidor embaralha cada baralho e compra seis cartas sem reposição.
- Depois de colocar uma carta, o jogador compra outra até esvaziar as três cartas restantes do
  monte.
- Com seis cartas iniciais, ambos já viram as nove antes de sua última escolha: inclusive o segundo
  jogador, que possui apenas quatro turnos no tabuleiro 3×3.
- A ordem do monte, as mãos e cada compra são persistidas no estado da partida para permitir
  auditoria e reconexão.
- O primeiro jogador é sorteado pelo servidor; numa revanche, a iniciativa alterna.
- Os jogadores colocam uma carta por turno em uma casa vazia.
- Cada carta possui quatro valores: `cima`, `direita`, `baixo` e `esquerda`.
- Ao colocar uma carta, cada lado encostado é comparado com o lado oposto da carta vizinha.
- Se o valor efetivo da carta colocada for maior, a vizinha muda de controle.
- Empate de valores não captura.
- A partida termina ao preencher as nove casas. Quem controlar pelo menos cinco vence.
- A carta que sobrar na mão não entra na pontuação.
- A v1 não terá as regras `Same`, `Plus`, combo, terreno elemental nem habilidades ativáveis.
  Elas ficam previstas como regras opcionais futuras.

Como são nove casas, a pontuação do tabuleiro sempre produz um vencedor. Isso deixa a partida curta
e evita uma regra de desempate escondida.

### 2.2 Bônus de tipo

Para cada confronto entre duas cartas:

```text
ataque efetivo  = borda da carta colocada + vantagem de tipo dela contra a vizinha
defesa efetiva  = borda oposta da vizinha + vantagem de tipo dela contra a carta colocada
```

- Cada lado recebe no máximo `+1`, mesmo que a combinação de dois tipos normalmente fosse 4×.
- Sem vantagem, resistência ou imunidade não retiram ponto na v1.
- Se as duas cartas tiverem vantagem uma contra a outra, as duas recebem `+1`.
- A UI mostra o cálculo antes de concluir a captura: por exemplo, `7 + 1 TIPO > 7`.
- A tabela de tipos é dado versionado e testado, não uma cadeia de `if` na UI.

Recomendação: usar os tipos modernos dos 151 Pokémon. Isso inclui, por exemplo, os tipos atuais
Fairy e Steel. Se a intenção for reproduzir estritamente a Geração I, essa é uma troca isolada no
catálogo e na matriz de tipos.

### 2.3 Números e balanceamento

- Valores impressos vão de `1` a `10`; o `10` pode ser exibido como `A` para preservar o sabor
  visual do gênero.
- O bônus temporário de tipo pode elevar um confronto a `11`.
- Cada definição possui um `powerRating`, calculado principalmente pela soma das quatro bordas.
- Raridade e força são campos separados. Uma carta rara pode ter distribuição especializada sem
  ser melhor em todas as direções.
- O modo competitivo usa um orçamento total de poder para o deck e limite de cartas de topo.
- O modo casual sem limite pode ser acrescentado depois.

Proposta para o primeiro balanceamento competitivo:

- baralho com exatamente 9 cartas;
- no máximo 1 carta `Epic`, `Legendary` ou `Special`;
- no máximo 3 cartas `Rare` ou superiores;
- orçamento de poder configurável no servidor;
- uma mesma instância não pode ocupar dois slots;
- no máximo uma carta da mesma espécie/variante no deck.

O orçamento deve ser definido por simulação depois que os 151 conjuntos de bordas existirem, em vez
de escolher um número arbitrário agora.

## 3. Catálogo inicial

### 3.1 Base

- 151 definições-base, uma por Pokémon da Pokédex de Kanto.
- Nome, número da Pokédex, tipos, quatro bordas, raridade, rating, chave de arte e texto curto.
- As evoluções tendem a ter rating maior, mas com exceções e distribuições direcionais para manter
  cartas básicas úteis.
- Cada família deve possuir uma identidade: defensiva, agressiva, canto forte, lateral forte ou
  equilibrada.

### 3.2 Variantes especiais

Variantes são definições próprias. Elas não substituem a carta normal e podem ter arte, moldura,
raridade e números diferentes.

Primeira lista sugerida:

| Variante | Papel sugerido | Diferença |
|---|---|---|
| Pikachu do Ash | `Special` ofensiva | laterais fortes e rating acima do Pikachu normal |
| Dragonite Carteiro | `Special` resistente | cima/baixo fortes, identidade visual de mensageiro |
| Mewtwo Armored | expansão posterior | não entra até existir direção de arte aprovada |
| Surfing Pikachu | expansão posterior | pode estrear junto de uma regra de temporada |

Os números exatos só devem ser fechados junto com o restante do catálogo. Variante especial não
ganha uma habilidade textual exclusiva na v1; toda a força continua legível nas quatro bordas.

### 3.3 Shiny

`Shiny` é uma propriedade da instância, não outra cópia de todas as 151 definições:

- tratamento visual foil/holográfico;
- paleta/arte shiny própria quando disponível;
- uma única borda recebe `+1` permanente;
- a borda bonificada é gravada na instância e destacada na carta;
- `powerRating` e custo de deck sobem junto com o bônus;
- uma borda impressa em `10` não recebe esse bônus permanente; o sorteio escolhe uma borda elegível.

Assim todo shiny possui bônus de rating, como solicitado, mas o jogador e o oponente conseguem
entender exatamente onde está a força adicional.

## 4. Raridades e boosters

Raridades propostas:

```text
Common → Uncommon → Rare → Epic → Legendary → Special
```

Cada booster contém exatamente cinco instâncias. O conteúdo é decidido e persistido pelo servidor
antes da animação começar.

### 4.1 Distribuição inicial para beta fechado

| Slot | Distribuição |
|---|---|
| 1–3 | 80% Common · 18% Uncommon · 2% Rare |
| 4 | 40% Common · 45% Uncommon · 14% Rare · 1% Epic |
| 5 | 55% Uncommon · 39% Rare · 5,8% Epic · 0,2% Legendary |

Rolls adicionais, independentes da raridade-base:

- shiny: `0,02%` por carta, aproximadamente 1 booster shiny a cada 1.000;
- Pikachu do Ash: peso inicial equivalente a aproximadamente 1 a cada 5.000 boosters;
- Dragonite Carteiro: peso inicial equivalente a aproximadamente 1 a cada 7.500 boosters.

Esses valores são configuração de catálogo, não constantes compiladas. Antes do beta público,
rodar uma simulação de pelo menos um milhão de boosters e publicar a chance real calculada.

### 4.2 Proteções

- Um booster nunca entrega menos de uma `Uncommon`.
- Pity de `Epic+` após 30 boosters sem `Epic+`.
- Pity de `Legendary` após 250 boosters sem `Legendary`.
- O pity não força shiny nem variante `Special`; esses continuam realmente raros.
- A abertura recebe uma chave idempotente: atualizar a página nunca cobra duas vezes nem duplica
  cartas.
- Moedas, abertura e cinco novas instâncias são gravadas numa única transação.
- No beta inicial, não vender boosters por dinheiro real.

Para o jogador conseguir começar:

- um baralho inicial balanceado de 9 cartas não negociáveis;
- um booster tutorial gratuito;
- moedas do Pixel Office podem comprar boosters, com preço configurável;
- recompensas por vitória devem ter limite diário para não incentivar combinação de resultado entre
  duas contas.

Não usar “o vencedor toma uma carta do perdedor” na v1. Essa regra cria perda involuntária,
multi-contas e suporte de recuperação antes de provar que a partida é divertida.

## 5. Experiência e UI

O cardgame abre como painel DOM responsivo sobre o Phaser, seguindo o precedente do xadrez atual,
mas em módulos próprios. Isso mantém cartas nítidas em qualquer zoom e facilita mouse, toque,
animações CSS e acessibilidade.

### 5.1 Anatomia da carta

- proporção aproximada de carta física, com silhueta forte;
- nome e número da Pokédex no topo;
- gema de raridade e selo de variante;
- chips dos tipos;
- ilustração ocupando o centro;
- quatro medalhões grandes nas bordas;
- cor do dono aplicada na moldura durante a partida, sem esconder a raridade;
- brilho foil animado e partículas discretas em shiny;
- a borda shiny bonificada recebe uma marca permanente;
- estado compacto para a mão e estado ampliado ao focar/segurar;
- verso próprio do Tooq Triad.

Direção visual sugerida: base escura azul-violeta, molduras metálicas por raridade, números muito
contrastados e efeitos de tipo com as cores já reconhecíveis. A arte do Pokémon é o foco; partículas
não podem competir com a leitura das bordas.

### 5.2 Tela de partida

- tabuleiro 3×3 no centro;
- mão local aberta na base;
- mão adversária com versos no topo;
- pequeno monte com contador `3 → 0`;
- animação curta de compra logo após cada colocação, sem bloquear a próxima atualização de rede;
- retrato, nome, placar e indicador de conexão dos dois lados;
- faixa clara de “Sua vez” e cronômetro opcional de 45 segundos;
- prévia de casas válidas ao selecionar uma carta;
- animação de colocação com impacto leve;
- confronto mostra os dois números e o `+1` de tipo;
- captura usa flip 3D curto e troca da cor da moldura;
- sequência de comparações ocorre em ordem visual previsível;
- vitória/derrota mostra placar, revanche e sair.

O servidor já decidiu o resultado da jogada quando a animação começa. A animação representa o
snapshot autoritativo; ela não calcula regras.

### 5.3 Coleção e deck builder

- visão Pokédex `0/151`, separada da contagem total de instâncias;
- grade, lista e detalhe ampliado;
- filtros por tipo, raridade, rating, shiny, variante e “não possuído”;
- ordenação por Pokédex, força, raridade e recentes;
- duplicatas agrupadas, com expansão para escolher a instância shiny específica;
- deck builder com 9 slots, orçamento visível, curva de raridade e mensagens claras de validação;
- indicação de que as nove cartas passarão pela mão durante a partida;
- salvar múltiplos decks fica para uma segunda entrega; a v1 possui um deck ativo.

### 5.4 Abertura do booster

Sequência proposta:

1. o servidor conclui a compra e devolve um `openingId`;
2. o pacote lacrado aparece no centro com parallax e brilho;
3. arrastar ou segurar rasga a faixa superior; um clique também funciona;
4. luz e partículas saem do pacote;
5. cinco versos de carta abrem em leque;
6. o jogador revela uma por vez;
7. raridade muda cor, som, impacto e duração da revelação;
8. shiny interrompe por um instante, escurece o fundo e aplica o efeito holográfico;
9. ao final, uma tela-resumo permite abrir outro ou ir à coleção.

Requisitos:

- botão `Pular` depois da primeira abertura;
- opção `reduzir movimento`;
- nenhuma informação do drop depende de terminar a animação;
- fechar/recarregar reabre o resumo do mesmo `openingId`;
- áudio pode ser desligado;
- no celular, alvos de toque e texto permanecem legíveis.

## 6. Integração com o mundo

Adicionar de forma manual e aditiva no Tiled, sem regenerar o mapa:

- entidade `cardTable` na sala de jogos do `tooq-campus`;
- propriedade `tableId` estável por mesa;
- dois pontos/assentos de desafio;
- `E` e o botão contextual do toque usam o mesmo handler;
- uma máquina ou balcão `boosterKiosk` abre loja/coleção;
- o painel pausa apenas o movimento local e não derruba presença, chat ou LiveKit;
- fechar o painel libera a mesa quando não existe partida ativa.

Módulos sugeridos no cliente:

```text
client-web/src/cardgame/CardGamePanel.js
client-web/src/cardgame/CardRenderer.js
client-web/src/cardgame/CollectionPanel.js
client-web/src/cardgame/BoosterOpening.js
client-web/src/cardgame/CardGameApi.js
client-web/src/mechanics/CardTableMechanic.js
client-web/src/mechanics/BoosterKioskMechanic.js
client-web/assets/cardgame/catalog.json
client-web/assets/cardgame/type-chart.json
client-web/assets/cardgame/art/
```

O catálogo visual pode ser servido como JSON estático, mas coleção, deck, preços, chances e partida
sempre vêm do backend autenticado.

## 7. Backend e persistência

Não copiar o protótipo atual de xadrez que mantém a partida em memória e confia parcialmente no
cliente. O cardgame precisa sobreviver a reinício, reconectar e validar cada jogada.

Entidades sugeridas:

| Entidade | Responsabilidade |
|---|---|
| `CardDefinition` | espécie/variante, tipos, bordas, raridade, rating e arte |
| `CardInstance` | dono, definição, shiny, borda bônus, origem e data |
| `CardDeck` | deck ativo do usuário |
| `CardDeckSlot` | posição e instância escolhida |
| `BoosterDefinition` | preço, slots, pesos, pity e período ativo |
| `BoosterOpening` | compra idempotente e resultado imutável |
| `BoosterOpeningCard` | as cinco instâncias e ordem de revelação |
| `CardMatch` | jogadores, status, turno, tabuleiro, versão e resultado |
| `CardMatchPlayer` | snapshot do baralho de 9, ordem do monte e mão atual |
| `CardMatchMove` | sequência auditável de jogadas |
| `CardPlayerStats` | vitórias/derrotas e progresso de temporada futuro |

Regras de integridade:

- índices únicos impedem usar a mesma instância em dois slots;
- apenas o dono monta o próprio deck;
- uma carta presa numa partida ativa não pode ser consumida ou transferida;
- abertura de booster usa transação e idempotência;
- `CardMatch.Version` protege contra duas jogadas simultâneas;
- datas em UTC e schema somente por migrations EF;
- catálogo é reconciliado por seed versionado, sem apagar instâncias existentes.

Rotas REST sugeridas:

```text
GET  /api/cardgame/catalog
GET  /api/cardgame/collection
GET  /api/cardgame/deck
PUT  /api/cardgame/deck
GET  /api/cardgame/boosters
POST /api/cardgame/boosters/{key}/open
GET  /api/cardgame/openings/{id}
POST /api/cardgame/challenges
POST /api/cardgame/challenges/{id}/accept
POST /api/cardgame/challenges/{id}/decline
GET  /api/cardgame/matches/{id}
POST /api/cardgame/matches/{id}/moves
POST /api/cardgame/matches/{id}/resign
POST /api/cardgame/matches/{id}/rematch
```

SignalR usa grupos `cardmatch:{matchId}` e envia snapshots pequenos:

- `CardChallengeReceived`;
- `CardMatchStarted`;
- `CardMatchState`;
- `CardMoveApplied`;
- `CardMatchFinished`;
- `CardOpponentConnectionChanged`.

O snapshot público contém tabuleiro, turno, placar e apenas a quantidade de cartas na mão e no
monte adversário. A mão completa e a carta recém-comprada são enviadas separadamente somente para
o grupo autenticado do respectivo usuário.

Cada jogada envia `matchId`, `expectedVersion`, `cardInstanceId` e `cell`. O servidor confirma:
identidade, participante, turno, snapshot do baralho, carta presente na mão atual, casa vazia, compra
seguinte, bônus de tipo, capturas e fim da partida. O cliente nunca informa a ordem do monte, a carta
comprada nem quais cartas foram capturadas.

Desconexão:

- a partida permanece por uma janela configurável;
- reconectar lê o snapshot completo e reassina o grupo;
- após o prazo, o jogador conectado pode reivindicar vitória;
- sair voluntariamente conta como desistência;
- espectadores ficam para depois da v1.

## 8. Segurança, economia e conteúdo

- RNG de booster somente no servidor, usando fonte criptograficamente segura.
- O resultado é persistido antes de chegar ao navegador.
- Preço e saldo são conferidos dentro da transação.
- Chances e pity devem aparecer na interface da loja.
- Recompensa PvP possui teto diário e detecção simples de repetição do mesmo par.
- Logs registram abertura, gasto, criação de instância, partida e recompensa.
- Nenhum asset ou metadado crítico é carregado de uma API pública em runtime.

O jogo é de uso exclusivamente interno, sem publicação externa. Os assets e metadados Pokémon
ficam locais no projeto e não dependem de hotlink ou API pública durante a execução.

## 9. Fases de implementação

### Fase 0 — especificação jogável

- fechar regra de tipo, pontuação e limites de deck;
- criar 20 cartas representativas para balancear;
- protótipo local do tabuleiro e das capturas;
- testes do motor de regras;
- gate: dez partidas manuais sem dúvida sobre por que uma captura ocorreu.

### Fase 1 — fundação de dados

- migrations, entidades, seed e endpoints de catálogo/coleção/deck;
- importar os 151 Pokémon e matriz de tipos;
- gerar stats iniciais por regras reproduzíveis e fazer curadoria manual;
- conceder deck inicial;
- gate: conta nova monta e salva um deck válido após reiniciar backend e navegador.

### Fase 2 — PvP autoritativo

- desafio, aceite, criação, jogada, desistência, resultado e revanche;
- SignalR por partida, controle de versão e reconexão;
- criar e persistir o snapshot dos dois baralhos, a ordem dos montes e as mãos iniciais;
- comprar automaticamente depois de cada jogada e incluir a nova mão no snapshot privado do dono;
- travar as 9 instâncias de cada jogador durante a partida;
- gate: dois navegadores terminam uma partida e recuperam o mesmo estado após refresh.

### Fase 3 — UI de coleção e partida

- sistema visual de cartas, deck builder e tabuleiro responsivo;
- animações de colocação, tipo e captura;
- estados de loading, erro, oponente desconectado e fim;
- gate: desktop e celular, mouse e toque, sem texto ilegível ou ação ambígua.

### Fase 4 — boosters

- definições, compra transacional, odds, pity e histórico;
- abertura completa com cinco cartas, skip e reduced motion;
- shiny e variantes especiais;
- gate: reload em cada etapa nunca perde nem duplica resultado.

### Fase 5 — integração no Pixel Office

- mesas e quiosque no Tiled;
- mecânicas registradas e ação contextual;
- presença continua ativa com o painel aberto;
- gate: dois avatares chegam à mesa, desafiam, jogam, fecham e voltam a andar.

### Fase 6 — balanceamento e beta

- simular pelo menos 1 milhão de boosters;
- analisar taxa de vitória por carta, tipo, iniciativa e rating do deck;
- ajustar catálogo/configuração sem alterar instâncias já emitidas de forma silenciosa;
- telemetria, limites de recompensa, auditoria e texto de chances;
- beta fechado e revisão das dez cartas mais/menos usadas.

## 10. Estratégia de testes

### Motor de regras

- todas as orientações de captura;
- empate;
- bônus unilateral e bilateral;
- Pokémon de dois tipos;
- bônus shiny e teto de borda;
- mão inicial de seis;
- compra automática sem reposição;
- esgotamento do monte após três compras;
- os dois jogadores conhecem as nove opções antes da própria última jogada;
- múltiplos vizinhos numa jogada;
- fim e vencedor;
- fixtures JSON compartilhadas entre backend e UI.

### Backend

- autenticação e propriedade;
- deck inválido;
- duas jogadas concorrentes;
- replay da mesma requisição;
- transação de booster e saldo insuficiente;
- pity;
- reconexão e timeout;
- reinício do processo durante partida.

### Probabilidade

- simulação grande compara frequência observada com a esperada;
- garante cinco cartas por abertura;
- mede boosters médios para completar os 151;
- mede impacto de duplicatas e pity;
- snapshot das configurações acompanha cada abertura para auditoria.

### Navegador

- dois usuários reais em janelas separadas;
- desktop e viewport de celular;
- teclado desabilitado durante automação e religado ao terminar;
- refresh no próprio turno, no turno adversário e durante abertura;
- atraso, perda e retorno de conexão;
- inspeção visual de Common, Legendary, Special e shiny.

## 11. Critérios de pronto da v1

- os 151 Pokémon-base estão disponíveis;
- Pikachu do Ash, Dragonite Carteiro e shiny funcionam como variantes de poder;
- cada baralho possui 9 cartas e ambos recebem acesso às nove durante a partida;
- booster sempre entrega cinco cartas com resultado persistente;
- coleção e deck sobrevivem a logout/restart;
- dois jogadores autenticados concluem partida sem confiar no cliente;
- reconexão recupera o estado correto;
- UI funciona em desktop e toque;
- chances são configuráveis e exibidas;
- nenhuma partida contra máquina existe;
- motor, economia e concorrência têm testes automatizados;
- resultado visual foi conferido no navegador com dois jogadores.

## 12. Ordem recomendada

Começar pelo motor com apenas 20 cartas e pelo PvP autoritativo. Não produzir as 151 artes nem a
animação final de booster antes de provar que dez partidas reais são claras e divertidas. Depois,
expandir o catálogo, implementar coleção/deck e fechar com a apresentação premium da abertura.
