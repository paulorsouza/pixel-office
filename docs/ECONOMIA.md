# Economia e balanceamento

Onde a moeda nasce, onde ela morre e quanto vale cada coisa. Este arquivo existe porque **a forma
de ganhar dinheiro no escritório vai mudar**: sem o retrato de agora, não dá para saber o que a
mudança quebra. A seção [§8](#8-checklist-para-mudar-a-renda) é o roteiro dessa mudança.

Todo número aqui foi lido do código, com o arquivo e a linha ao lado. Ao mexer no balanceamento,
**atualize a linha correspondente aqui junto** — um número errado neste arquivo é pior que nenhum.

Última conferência: 2026-07-30.

---

## 1. As moedas do jogo

| Recurso | Onde vive | Para que serve |
|---|---|---|
| **Moeda** (`User.Coins`) | [Models.cs:22](../backend/VirtualOffice.Api/Models.cs) | Compra móvel, equipamento e booster; aposta no cassino |
| **XP** (`User.Xp`) | [Models.cs](../backend/VirtualOffice.Api/Models.cs) | Só nível. Nível dá drop de item, não moeda |
| **Booster** | `CardGameBoosterBalance` | Moeda paralela do cardgame. Ver [CARDGAME.md](CARDGAME.md) |

Moeda e XP são creditados sempre pelo mesmo lugar, `Game.AwardAsync`
([Game.cs:124](../backend/VirtualOffice.Api/Game.cs)), que grava um `XpEvent` com um campo
`Source`. **Esse `Source` é a chave de tudo**: é por ele que o teto diário sabe o que limitar, e é
por ele que dá para auditar de onde veio o dinheiro.

---

## 2. Fontes de renda

| Fonte | `Source` | Quanto | Teto | Código |
|---|---|---|---:|---|
| Saldo inicial da conta | — | 250, uma vez | — | [Game.cs:24](../backend/VirtualOffice.Api/Game.cs) |
| Bônus de boas-vindas | `grant` | 0 (beta: 10.000), uma vez | — | [Game.cs:30](../backend/VirtualOffice.Api/Game.cs) |
| Lançamento de horas | `time` | 15–55/hora, por atividade | **400/dia** | [Game.cs:40](../backend/VirtualOffice.Api/Game.cs) |
| Presença online | `presence` | 1/minuto | **180/dia** | [Game.cs:47](../backend/VirtualOffice.Api/Game.cs) |
| Objetivos diários | `objective` | 165/dia somando os seis | — (o próprio alvo limita) | [WorkCatalogSeed.cs:36](../backend/VirtualOffice.Api/WorkCatalogSeed.cs) |
| Objetivos semanais | `objective` | 730/semana somando os cinco | — (idem) | [WorkCatalogSeed.cs:50](../backend/VirtualOffice.Api/WorkCatalogSeed.cs) |
| Concluir item do quadro | `workitem` | 24–72 por item | **nenhum** ⚠️ | [WorkEndpoints.cs:234](../backend/VirtualOffice.Api/WorkEndpoints.cs) |

### 2.1 Gold por hora, por atividade

O teto de 400/dia é o mesmo para todos, mas a atividade decide **quantas horas** você precisa
lançar para bater nele:

| Atividade | Gold/h | XP/h | Horas até o teto |
|---|---:|---:|---:|
| Estudo | 55 | 90 | 7,3 h |
| Pair programming | 45 | 80 | 8,9 h |
| Code review | 40 | 70 | 10,0 h |
| Suporte | 35 | 60 | 11,4 h |
| Desenvolvimento | 30 | 60 | 13,3 h |
| Planejamento | 25 | 50 | 16,0 h |
| Reunião | 20 | 40 | 20,0 h |
| Outro | 15 | 30 | 26,7 h |

Estudo paga quase o dobro de Desenvolvimento por hora — decisão de produto, não acidente.

### 2.2 O quadro é a única fonte sem teto

⚠️ Concluir um item paga `base × multiplicador de prioridade`, e **não passa por `CapDailyAsync`**:

| Tipo | Base | Urgente (×1,6) | Normal (×1,0) | Baixa (×0,8) |
|---|---:|---:|---:|---:|
| Bug | 45 | **72** | 45 | 36 |
| Atendimento | 30 | 48 | 30 | 24 |
| Demais | 35 | 56 | 35 | 28 |

Quem controla o quadro controla a torneira: criar e concluir dez bugs urgentes rende 720 moedas em
minutos. Hoje isso é contido por confiança, não por regra.

### 2.3 O que o teto diário realmente cobre

`Game.CapDailyAsync` ([Game.cs:151](../backend/VirtualOffice.Api/Game.cs)) filtra por
`Source == "time"`. Ou seja: **só o lançamento de horas é limitado por ele.** Presença tem teto
próprio, dentro de `PresenceRewards.AccrueAsync`. Objetivo, quadro e bônus não têm teto nenhum.

O teto é sobre o *total do dia*, não por lançamento — lançar 8 horas de uma vez rende o mesmo que
lançar de hora em hora.

### 2.4 Estorno, e o furo que ele abre no teto

⚠️ Apagar ou editar um lançamento devolve o que ele pagou: `RevertRewardAsync`
([WorkEndpoints.cs:627](../backend/VirtualOffice.Api/WorkEndpoints.cs)) subtrai de `User.Coins` e
grava um `XpEvent` **negativo**, com `Source = "time"`.

Como o teto soma os eventos `time` do dia, um estorno negativo **devolve espaço no teto** — o que é
correto quando você apaga e relança no mesmo dia.

O problema é a data: o evento de estorno usa `CreatedUtc = DateTime.UtcNow`, **não** o dia do
lançamento apagado. Então:

1. ontem o jogador lança e recebe as 400 do teto;
2. hoje ele apaga aquele lançamento de ontem → entra um evento de −400 **em hoje**;
3. hoje o teto calcula `400 − (−400) = 800`.

Resultado: **apagar um lançamento antigo dobra o teto de hoje.** Não é teórico, sai direto da
aritmética de `CapDailyAsync`. A correção natural é datar o evento de estorno com o dia do
lançamento original (`entry.StartUtc`), e não com o instante do clique.

---

## 3. Teto de renda por semana

Somando todas as fontes com teto, para um jogador que faz **tudo** todo dia:

| Fonte | Semana | Fatia |
|---|---:|---:|
| Lançamento de horas (400 × 7) | 2.800 | 47% |
| Presença online (180 × 7) | 1.260 | 21% |
| Objetivos diários (165 × 7) | 1.155 | 19% |
| Objetivos semanais | 730 | 12% |
| **Total** | **5.945** | |

**Mais o quadro, que é ilimitado.** Trate 5.945 como o piso do teto, não como o máximo.

Esse número é a régua de todo preço do jogo. Se a renda mudar, ele muda — e tudo em [§5](#5-o-que-a-moeda-compra) precisa ser reconferido.

---

## 4. O cassino destrói moeda, não gera

Isso costuma surpreender, então está aqui em destaque. O **Nerd Slots** paga em moeda só nas cinco
trincas "normais"; as quatro combinações especiais pagam carta ou booster e **zero moeda**
([CasinoEndpoints.cs:652](../backend/VirtualOffice.Api/CasinoEndpoints.cs)).

Rolo de 20 posições: `bug`×4, `coffee`×3, `code`×2, `d20`×2, `rocket`×1, `booster`×4, `gengar`×2,
`charizard`×1, `porygon`×1.

| Trinca | P(trinca) | Multiplicador | Contribuição ao RTP |
|---|---:|---:|---:|
| bug | 0,800% | 4× | 3,200% |
| coffee | 0,338% | 6× | 2,025% |
| code | 0,100% | 8× | 0,800% |
| d20 | 0,100% | 12× | 1,200% |
| rocket | 0,013% | 20× | 0,250% |
| booster | 0,800% | — | 1 booster |
| gengar / charizard / porygon | 0,100% / 0,013% / 0,013% | — | carta-prêmio |

**RTP em moedas: 7,5%.** Cada giro devolve, em média, 7,5% da aposta — o jogador perde 92,5%.

O caça-níqueis não é um jogo de dinheiro: é uma **máquina de converter moeda em carta**. Um booster
sai a cada 125 giros, o que dá ~578 moedas líquidas na aposta mínima (5) e ~2.891 na máxima (25).
Comparado às 400 moedas de uma Edição no balcão, apostar é o caminho caro — o que se compra ali de
verdade são as quatro cartas exclusivas do cassino.

Os outros dois jogos:

| Jogo | Apostas | Retorno |
|---|---|---|
| Blackjack | 10 / 20 / 50 | 2× normal, 2,5× no natural; dealer para no 17 |
| Arrange Dice | 10 / 25 / 50 | 4× / 12× / 40× / 80× / 200× para sequências de 3 a 7 |

O RTP desses dois **não está calculado**. Duas ressalvas antes de assumir qualquer coisa:

- o Blackjack aceita só `hit` e `stand` ([CasinoEndpoints.cs:298](../backend/VirtualOffice.Api/CasinoEndpoints.cs)) —
  sem dobrar, dividir ou desistir. Isso derruba o retorno abaixo do blackjack de mesa, onde boa
  parte da vantagem do jogador vem justamente de dobrar e dividir;
- o Arrange Dice depende da mecânica de relances e ninguém mediu. É o único jogo do prédio que
  **pode** estar pagando acima de 100%.

Vale medir os dois antes de mexer na renda.

A **Liga Pokémon da Casa** cobra 100 moedas por entrada
([PokemonCasinoTableEndpoints.cs:49](../backend/VirtualOffice.Api/PokemonCasinoTableEndpoints.cs))
e **não devolve moeda nenhuma** — só boosters. É sumidouro puro.

---

## 5. O que a moeda compra

### 5.1 Móveis e equipamentos

| Categoria | Itens | Faixa |
|---|---:|---|
| Assentos | 8 | 80–110 |
| Decoração | 8 | 55–190 |
| Mesas | 5 | 120–280 |
| Armazenamento | 4 | 100–240 |
| Estações de trabalho | 12 | 180–380 |
| Vestíveis | 6 | 260–850 |
| Periféricos | 4 | 280–760 |
| Veículos | 7 | 450–2.100 |

Móvel e equipamento **não têm teto semanal** (`WeeklyPurchaseLimit = 0`): a raridade deles já mora
no preço. Todos em [GameInventorySeed.cs:44](../backend/VirtualOffice.Api/GameInventorySeed.cs).

### 5.2 Boosters (Banca de cartas)

| Booster | Preço | Teto/semana | Semana cheia |
|---|---:|---:|---:|
| Edição por geração (nove) | 400 | 10 de cada | 36.000 |
| Booster Raro | 1.200 | 3 | 3.600 |
| Booster Ultrarraro | 2.500 | 1 | 2.500 |

Detalhe da regra e dos três degraus de raridade em [CARDGAME.md §3.1](CARDGAME.md).

### 5.3 A régua atual

Contra as **5.945** de renda semanal máxima:

- 3 Raros + 1 Ultrarraro = 6.100 → **uma semana inteira**, e sobra nada;
- a estante completa (90 Edições + 3 Raros + 1 Ultra) = 42.100 → **7,1 semanas**;
- o veículo mais caro (2.100) = ~2,5 dias de renda;
- um móvel comum (55–380) = de minutos a algumas horas.

A intenção: **móvel é troco, booster é decisão, estante completa é maratona.**

---

## 6. Boosters que moeda não compra

Fontes não-monetárias, importantes porque **elas não escalam com a renda** — se o dinheiro ficar
fácil, são elas que preservam o sentido de conquista:

| Booster | Fonte | Custo |
|---|---|---|
| Nacional | Conta nova | 3 grátis |
| Nacional | Trincas e prêmios do cassino | aposta |
| Raro | Cinco objetivos semanais | 1/semana |
| Raro | Troca no álbum | 50 cartas excedentes, ≥10 `Rare+`, ≥10 tipos |
| Raro | Arrange Dice, 5+ vizinhas | aposta |
| Especial | Dez cópias normais iguais | 10 cartas |
| **Lendário** | **Liga, 6ª vitória seguida** | 100 moedas de entrada |

O Lendário é o único item do jogo que **moeda nenhuma compra**. Se a renda subir muito, essa
propriedade é o que sobra de progressão não-inflacionável — não a remova sem substituir.

---

## 7. XP, nível e drop

XP e moeda andam juntos em `AwardAsync`, mas XP **não** vem de presença (ficar com a janela aberta
não sobe de nível). Curva: `200 × (nível − 1)^1,5`
([Game.cs:83](../backend/VirtualOffice.Api/Game.cs)).

| Nível | XP acumulado |
|---:|---:|
| 2 | 200 |
| 5 | 1.600 |
| 10 | 5.400 |
| 20 | 16.563 |

Subir de nível rola um drop de item ([Game.cs:93](../backend/VirtualOffice.Api/Game.cs)):
Lendário 3%, Épico 12%, Raro 25%, Comum 60%. Drop dá item, nunca moeda.

---

## 8. Checklist para mudar a renda

Quando a forma de ganhar dinheiro mudar, percorra isto:

1. **Recalcule o teto de [§3](#3-teto-de-renda-por-semana).** É a régua de todo preço. Ele hoje vale 5.945/semana.
2. **Reveja os preços de booster** ([GameInventorySeed.cs:21](../backend/VirtualOffice.Api/GameInventorySeed.cs)).
   Eles foram calibrados para "3 Raros + 1 Ultra ≈ uma semana". Se a renda dobrar, o teto semanal
   vira o único freio — e ele foi desenhado para conter o *pico*, não o fluxo normal.
3. **Decida o que fazer com o quadro** ([§2.2](#22-o-quadro-é-a-única-fonte-sem-teto)). É a única
   torneira sem teto. Se a renda nova for automática, essa brecha deixa de ser aceitável.
4. **Confira se o novo `Source` entra em algum teto.** `CapDailyAsync` só filtra `"time"`. Uma
   fonte nova com `Source` novo nasce **sem teto** por omissão.
5. **Feche o furo do estorno** ([§2.4](#24-estorno-e-o-furo-que-ele-abre-no-teto)) antes de
   apertar a renda — não adianta baixar o teto que se contorna apagando lançamento antigo.
6. **Meça o Arrange Dice e o Blackjack** antes de assumir que o cassino drena. Só o Nerd Slots
   está medido (92,5% de perda); os outros dois são incógnita.
7. **Não deixe moeda comprar o Booster Lendário** ([§6](#6-boosters-que-moeda-não-compra)).
8. **Atualize este arquivo e o [CARDGAME.md](CARDGAME.md)** na mesma mudança.

### Botões de configuração

Já dá para ajustar sem recompilar, pela seção `Game` do `appsettings.json` ou por variável
`Game__*` ([Game.cs:56](../backend/VirtualOffice.Api/Game.cs)):

| Chave | Padrão | Em `appsettings.json`? |
|---|---:|---|
| `StartingCoins` | 250 | sim |
| `WelcomeGrantCoins` | 0 (beta: 10.000) | sim, e no `docker-compose.yml` |
| `WelcomeGrantKey` | `beta-v1` | sim, e no `docker-compose.yml` |
| `DailyXpCapFromTime` | 600 | sim |
| `DailyGoldCapFromTime` | 400 | sim |
| `PresenceGoldPerMinute` | 1 | **não** — só o padrão do código |
| `PresenceGoldDailyCap` | 180 | **não** — só o padrão do código |
| `TimeZoneOffsetHours` | −3 | sim, e no `docker-compose.yml` |

Preço de item, gold/hora de atividade e recompensa de objetivo **não** são configuráveis: moram no
seed e valem no próximo boot ([GameInventorySeed.cs](../backend/VirtualOffice.Api/GameInventorySeed.cs),
[WorkCatalogSeed.cs](../backend/VirtualOffice.Api/WorkCatalogSeed.cs)). O seed reconcilia em vez de
recriar, então mudar um preço lá e reiniciar já vale para as contas existentes.

---

## 9. Auditoria

Todo crédito de moeda vira uma linha em `XpEvents` com `Source` e `Reason`. Para ver de onde saiu o
dinheiro de alguém:

```sql
SELECT "Source", count(*), sum("Gold") AS gold, sum("Amount") AS xp
FROM "XpEvents" WHERE "UserId" = 1
GROUP BY "Source" ORDER BY gold DESC;
```

Aposta e prêmio de cassino ficam em `CasinoRounds` (`Bet`, `Payout`, `BalanceAfter`), separados dos
`XpEvents` — o cassino mexe em `User.Coins` direto, sem passar por `AwardAsync`. **Uma consulta só
de `XpEvents` não enxerga o que o cassino levou.**

```sql
SELECT "GameId", count(*) AS rodadas, sum("Bet") AS apostado, sum("Payout") AS pago,
       sum("Payout") - sum("Bet") AS saldo_do_jogador
FROM "CasinoRounds" GROUP BY "GameId";
```

Compras de item não têm tabela de histórico: o gasto aparece só como queda em `User.Coins`. A cota
semanal do balcão (`StorePurchaseQuotas`) registra **quantidade**, não valor — dá para saber quantos
boosters alguém comprou na semana, não quanto gastou no total. Se o histórico de gasto virar
requisito, é uma tabela nova.
