# Economia e balanceamento

Onde a moeda nasce, onde ela morre e quanto vale cada coisa. Este arquivo existe porque **a forma
de ganhar dinheiro no escritório vai mudar**: sem o retrato de agora, não dá para saber o que a
mudança quebra. A seção [§8](#8-checklist-para-mudar-a-renda) é o roteiro dessa mudança.

Todo número aqui foi lido do código, com o arquivo e a linha ao lado. Ao mexer no balanceamento,
**atualize a linha correspondente aqui junto** — um número errado neste arquivo é pior que nenhum.

Última conferência: 2026-07-31 (renda nova, XP removido).

---

## 1. As moedas do jogo

| Recurso | Onde vive | Para que serve |
|---|---|---|
| **Moeda** (`User.Coins`) | [Models.cs](../backend/VirtualOffice.Api/Models.cs) | Compra móvel, equipamento, baú e booster; aposta no cassino |
| **Booster** | `CardGameBoosterBalance` | Moeda paralela do cardgame. Ver [CARDGAME.md](CARDGAME.md) |

⚠️ **O XP foi removido do jogo.** Ele não desbloqueava nada — só aparecia em oito telas do app web
como um segundo placar. Saíram `User.Xp`, o nível, o ranking de XP e os campos de XP de atividade,
objetivo e lançamento; a tabela `XpEvents` virou **`CoinEvents`** (mesma tabela, renomeada, com a
coluna `Amount` a menos). O marco que dava Baú Lendário a cada 5 níveis passou a cair a cada
**40 horas lançadas** ([§6.1](#61-baús-que-moeda-não-compra-v2)).

A moeda é creditada sempre pelo mesmo lugar, `Game.AwardAsync`
([Game.cs](../backend/VirtualOffice.Api/Game.cs)), que grava um `CoinEvent` com um campo
`Source`. **Esse `Source` é a chave de tudo**: é por ele que o teto diário sabe o que limitar, e é
por ele que dá para auditar de onde veio o dinheiro.

---

## 2. Fontes de renda

| Fonte | `Source` | Quanto | Teto | Código |
|---|---|---|---:|---|
| Saldo inicial da conta | — | 250, uma vez | — | [Game.cs](../backend/VirtualOffice.Api/Game.cs) |
| Bônus de boas-vindas | `grant` | 0 (beta: 10.000), uma vez | — | [Game.cs](../backend/VirtualOffice.Api/Game.cs) |
| Lançamento de horas | `time` | **75–275/hora**, por atividade | **400/dia** ⚠️ | [Game.cs](../backend/VirtualOffice.Api/Game.cs) |
| Presença online | `presence` | **300/hora × equipamento** | **2.700/dia × equipamento** | [Game.cs](../backend/VirtualOffice.Api/Game.cs) |
| Objetivos diários | `objective` | **1.200/dia** somando os seis | — (o próprio alvo limita) | [WorkCatalogSeed.cs](../backend/VirtualOffice.Api/WorkCatalogSeed.cs) |
| Objetivos semanais | `objective` | **4.700/semana** somando os cinco | — (idem) | [WorkCatalogSeed.cs](../backend/VirtualOffice.Api/WorkCatalogSeed.cs) |
| Concluir item do quadro | `workitem` | 24–72 por item | **nenhum** ⚠️ | [WorkEndpoints.cs:234](../backend/VirtualOffice.Api/WorkEndpoints.cs) |

### 2.1 Gold por hora, por atividade

O teto de 400/dia é o mesmo para todos, mas a atividade decide **quantas horas** você precisa
lançar para bater nele:

| Atividade | Gold/h | Horas até o teto de 400 |
|---|---:|---:|
| Estudo | 275 | 1,5 h |
| Pair programming | 225 | 1,8 h |
| Code review | 200 | 2,0 h |
| Suporte | 175 | 2,3 h |
| Desenvolvimento | 150 | 2,7 h |
| Planejamento | 125 | 3,2 h |
| Reunião | 100 | 4,0 h |
| Outro | 75 | 5,3 h |

Estudo paga quase o dobro de Desenvolvimento por hora — decisão de produto, não acidente. As taxas
foram multiplicadas por 5 junto com a presença, mantendo a escala relativa entre atividades.

### ⚠️ 2.1-b O teto do trabalho ficou para trás

`DailyGoldCapFromTime` continua **400/dia** enquanto a presença subiu para **2.700/dia**. Na
prática: **uma hora e meia de estudo esgota o dia de trabalho**, e ficar online rende quase 7×
mais que produzir.

Isso inverte o princípio que o próprio jogo declarava ("ficar logado rende, mas não substitui
produzir"). Restaurar a relação antiga (trabalho ≈ 2,2× presença) exigiria um teto perto de
**6.000/dia**. O número não foi mexido porque ninguém pediu — é decisão de produto, não conserto
de bug. Enquanto ficar assim, o quadro e a planilha de horas competem em desvantagem.

### 2.2 O quadro é a única fonte sem teto

⚠️ Concluir um item paga `base × multiplicador de prioridade`, e **não passa por `CapDailyAsync`**:

| Tipo | Base | Urgente (×1,6) | Normal (×1,0) | Baixa (×0,8) |
|---|---:|---:|---:|---:|
| Bug | 45 | **72** | 45 | 36 |
| Atendimento | 30 | 48 | 30 | 24 |
| Demais | 35 | 56 | 35 | 28 |

Quem controla o quadro controla a torneira: criar e concluir dez bugs urgentes rende 720 moedas em
minutos. Hoje isso é contido por confiança, não por regra.

### 2.2-b Equipamento aumenta a presença (v2)

Mouse, teclado, celular e alguns automóveis somam `passiveCoinPercent`, e o bônus multiplica
**a taxa e o teto** ([PresenceRewards.cs](../backend/VirtualOffice.Api/PresenceRewards.cs)):

```
taxa = 5/min (300/h) × (1 + bônus)      teto = 2.700/dia (9 h) × (1 + bônus)
```

O pagamento é por **direito acumulado** (`floor(minutos × taxa) − já pago`), que é o que faz a
moeda quebrada do bônus fechar sem precisar de coluna nova.

A escala de passiva é ancorada no **conjunto lendário = +100%**: mouse 28 + teclado 28 + celular 24
+ Harley 20. Amuleto e carteira não dão passiva — cada slot tem um papel, e os dois deles são
cassino e loja.

| Conjunto | Bônus | Moedas/hora | Teto/dia | Semana |
|---|---:|---:|---:|---:|
| Nenhum | 0% | 300 | 2.700 | 18.900 |
| Incomum completo (loja) | 33% | 399 | 3.591 | 25.137 |
| **Lendário completo** | **100%** | **600** | **5.400** | 37.800 |
| Exótico completo | 140% | 720 | 6.480 | 45.360 |

Tirar o equipamento no meio do dia **não estorna** o que já foi pago; o pagamento só para.

### 2.3 O que o teto diário realmente cobre

`Game.CapDailyAsync` ([Game.cs:151](../backend/VirtualOffice.Api/Game.cs)) filtra por
`Source == "time"`. Ou seja: **só o lançamento de horas é limitado por ele.** Presença tem teto
próprio, dentro de `PresenceRewards.AccrueAsync`. Objetivo, quadro e bônus não têm teto nenhum.

O teto é sobre o *total do dia*, não por lançamento — lançar 8 horas de uma vez rende o mesmo que
lançar de hora em hora.

### 2.4 Estorno ✅ (furo fechado)

Apagar ou editar um lançamento devolve o que ele pagou: `RevertRewardAsync`
([WorkEndpoints.cs:627](../backend/VirtualOffice.Api/WorkEndpoints.cs)) subtrai de `User.Coins` e
grava um `CoinEvent` **negativo**, com `Source = "time"`.

Como o teto soma os eventos `time` do dia, um estorno negativo **devolve espaço no teto** — o que é
correto quando você apaga e relança no mesmo dia.

O furo antigo era a data: o evento usava `DateTime.UtcNow`, então apagar um lançamento de ontem
lançava −400 em **hoje** e o teto de hoje virava `400 − (−400) = 800`. Dava para dobrar a renda
diária apagando lançamento antigo.

**Corrigido:** o estorno agora é datado com `entry.StartUtc`, o dia do lançamento original. O
espaço volta para o dia certo.

---

## 3. Teto de renda por semana

Somando todas as fontes com teto, para um jogador que faz **tudo** todo dia:

| Fonte | Semana | Fatia |
|---|---:|---:|
| Presença online (2.700 × 7) | 18.900 | 60% |
| Objetivos diários (1.200 × 7) | 8.400 | 27% |
| Objetivos semanais | 4.700 | 15% |
| Lançamento de horas (400 × 7) | 2.800 | 9% |
| **Total** | **31.500** | |

**A renda quintuplicou** (5.945 → 31.500) e os **preços ficaram como estavam**, por decisão de
produto: no beta, ter gente circulando pelo conteúdo vale mais que a progressão longa. A régua da
[§5.3](#53-a-régua-atual) mudou de sentido — o que era decisão de semana virou compra de rotina.

**Mais o quadro, que é ilimitado.** Trate 31.500 como o piso do teto, não como o máximo.

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

### 4.1 O amuleto muda a mesa (v2)

Os bônus do amuleto **somam** sobre a regra base — ela não foi enfraquecida
([PLANO_EQUIPAMENTOS.md §5.4](PLANO_EQUIPAMENTOS.md)). O efeito é lido **uma vez**, na aposta, e
fica gravado no `OutcomeJson` da rodada: trocar de amuleto no meio não muda as regras do que já
está em jogo, e a auditoria passa a saber sob quais regras cada rodada correu.

| Jogo | O que o amuleto faz |
|---|---|
| Arrange Dice | +1 lançamento inicial, +N ao tirar 2, 12 não cobra lançamento, +1 a cada duas duplas seguidas |
| Nerd Slots | sorteio **separado** de booster, 0,5 a 2 p.p. por giro |

⚠️ **O caça-níqueis é o ponto a vigiar.** O amuleto **não** mexe nos rolos — mexer no peso do
símbolo mudaria o RTP em moeda de carona. Ele dá um sorteio à parte, só quando a trinca de booster
não saiu:

| Conjunto | Bônus | Booster/giro | Giros por booster |
|---|---:|---:|---:|
| Nenhum | — | 0,80% | 125 |
| Fênix (Lendário) | 1 p.p. | 1,79% | 56 |
| Vazio + Kawasaki (Exótico) | 3 p.p. | 3,78% | 26 |

O booster do caça-níqueis é o **Nacional**, que não é vendido em balcão nenhum
([§6](#6-boosters-que-moeda-não-compra)) — então não há preço de loja sendo furado. O que muda é
que, com o conjunto exótico, o Nacional deixa de ser raro. Cada giro continua destruindo 92,5% da
aposta, então isso é um sumidouro mais generoso, não uma fonte.

### 4.2 Arrange Dice: medido, e estava imprimindo dinheiro

A mesa nunca tinha sido medida. Foi, por simulação de Monte Carlo (500 mil rodadas, jogador com
arranjo ótimo `4-5-6-7-8-9-10`), e o resultado explica o pedido de reequilíbrio:

| Tabela | Sem amuleto | Amuleto lendário | Amuleto exótico |
|---|---:|---:|---:|
| **Antiga** (4/12/40/80/200 × repetição até 20×) | **820%** | 3.551% | **9.105%** |
| **Nova** (0,5/1/2/3/6 × repetição até 1,6×) | 32% | 67% | **85%** |

O furo tinha duas causas somadas: a sequência de 3 saía em ~26% das rodadas e já pagava 4×, e o
bônus de repetição de **20×** multiplicava justamente as rodadas que já haviam ganhado.

⚠️ **A âncora do balanceamento é o Amuleto do Beta, não o jogador sem amuleto.** Como ele é dado a
todo mundo ([§6.1](#61-baús-que-moeda-não-compra-v2)), é o RTP dele — **85%** — que vale como RTP
real da mesa. Aposentar o amuleto depois do beta deixa a mesa em 32% para quem não tiver outro:
**reequilibrar aí não é opcional.**

As recompensas em booster, carta e baú **não mudaram** — a mesa continua entregando Booster Raro na
sequência de 5, cartas exclusivas em 6 e 7, e Baú Lendário na jogada perfeita. Foi só o gold.

A tabela de pagamento passou a ser expressa em **pontos percentuais da aposta** (100 = 1×), porque
a curva nova precisa de meio multiplicador na sequência de 3.

Os outros dois jogos:

| Jogo | Apostas | Retorno |
|---|---|---|
| Blackjack | 10 / 20 / 50 | 2× normal, 2,5× no natural; dealer para no 17 |
| Arrange Dice | 10 / 25 / 50 | 0,5× / 1× / 2× / 3× / 6× para sequências de 3 a 7 |

O RTP do Blackjack **não está calculado**. Duas ressalvas antes de assumir qualquer coisa:

- o Blackjack aceita só `hit` e `stand` ([CasinoEndpoints.cs:298](../backend/VirtualOffice.Api/CasinoEndpoints.cs)) —
  sem dobrar, dividir ou desistir. Isso derruba o retorno abaixo do blackjack de mesa, onde boa
  parte da vantagem do jogador vem justamente de dobrar e dividir;
- o Arrange Dice depende da mecânica de relances e ninguém mediu. É o único jogo do prédio que
  **pode** estar pagando acima de 100%.

Vale medir os dois antes de mexer na renda.

A **Liga Pokémon da Casa** virou **quatro mesas, uma por liga**
([CasinoLeagueTables.cs](../backend/VirtualOffice.Api/CasinoLeagueTables.cs)) e **não devolve moeda
nenhuma** — só boosters. Continua sumidouro puro. São **quatro mesas físicas** no salão do Casino Nerd, lado a lado. A mesa em que você senta é a
divisão em que joga, e o baralho cobrado é o daquela liga.

Cada mesa tem três modos — **Fácil 50, Normal 100, Hard 200** —, o mesmo preço em todas. O preço é
pago **uma vez**; dentro do modo há uma escada de **quatro partidas**, e cada vitória trava uma faixa
melhor. Dá para sacar entre partidas; perder entrega a faixa já travada.

As faixas são uma escada só, indexada por `(partida − 1) + degrau do modo + degrau da liga`, o que
garante que o prêmio cresça quando qualquer um dos três sobe:

| Mesa | Fácil (50) | Normal (100) | Hard (200) |
|---|---|---|---|
| Common | 1N → 2N → 3N → 1N+1R | 2N → 3N → 1N+1R → 2N+2R | 3N → 1N+1R → 2N+2R → **4R + Lendário** |
| Great | 2N → 3N → 1N+1R → 2N+2R | 3N → 1N+1R → 2N+2R → 4R | 1N+1R → 2N+2R → 4R → **6R + Lendário** |
| Ultra | 3N → 1N+1R → 2N+2R → 4R | 1N+1R → 2N+2R → 4R → 6R | 2N+2R → 4R → 6R → **8R + Lendário** |
| **Master** | 1N+1R → 2N+2R → 4R → 6R | 2N+2R → 4R → 6R → 8R | 4R → 6R → 8R → **10R + Lendário + Baú Exótico** |

### O chefão

A quarta partida do Hard é o **chefão**, e é ele que paga o **Booster Lendário — em todas as ligas**.
O Baú Exótico continua exclusivo da Master.

Como o prêmio é o mesmo em qualquer mesa, o chefão é a **mesma parede em qualquer mesa**: nas três
primeiras partidas do Hard a casa joga com o teto da liga de cima, mas na quarta ela perde o teto por
completo e puxa do catálogo inteiro. O que muda entre as mesas é só o **seu** limite.

Medido na mesa Great (baralho do jogador fixo em 22–34, média 30,8):

| Modo | Baralho da casa | Acima do teto do jogador |
|---|---|---:|
| Fácil | 11–18 (média 15,5), joga ao acaso | 0 de 15 |
| Normal | 24–31 (média 26,6), energizadas crescentes | 0 de 15 |
| Hard 1–3 | 39–44 (média 41,6) | 14 de 15 |
| **Hard 4 (chefão)** | **41–55 (média 44,7)** + Mewtwo Rei + 5 energizadas | **14 de 15** |

⚠️ **Na Common o chefão é quase impossível.** Baralho de até 24 contra uma casa que vem de 41 a 55 é
uma diferença de ~20 de poder médio, contra ~14 na Great. É a consequência direta de o Lendário valer
o mesmo em todas as mesas: a casa é igual e só o seu teto muda. Se a Common virar conteúdo morto, o
ajuste é dar ao chefão um teto relativo (`HouseMaxPower` do chefão = teto da liga + 20) em vez de
nenhum — uma linha em `CasinoLeagueTables`.

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
| Mouse | 2 | 180–380 |
| Teclado | 2 | 200–400 |
| Celular | 2 | 220–460 |
| Amuleto | 2 | 240–520 |
| Carteira | 2 | 200–450 |
| Automóvel | 2 | 450–780 |
| **Baús** | 3 | 350–2.600 |

⚠️ **Mudou na v2 de equipamentos** (ver [PLANO_EQUIPAMENTOS.md](PLANO_EQUIPAMENTOS.md)). Os
vestíveis antigos saíram do jogo, e a regra do balcão passou a ser dura: **só Comum e Incomum se
compram — Rara, Lendária e Exótica saem de baú.** Por isso a faixa de equipamento despencou: a
Moto de 1.800 não tem mais preço porque não tem mais balcão.

Móvel e equipamento **não têm teto semanal** (`WeeklyPurchaseLimit = 0`): a raridade deles já mora
no preço. Móvel em [GameInventorySeed.cs:44](../backend/VirtualOffice.Api/GameInventorySeed.cs);
equipamento em [EquipmentCatalog.cs](../backend/VirtualOffice.Api/EquipmentCatalog.cs), que é dono
de preço, raridade e efeito.

### 5.2 Boosters (Banca de cartas)

| Booster | Preço | Teto/semana | Com carteira (máx.) | Semana cheia |
|---|---:|---:|---:|---:|
| Edição por geração (nove) | 400 | 10 de cada | 15 | 36.000 |
| Booster Raro | 1.200 | 3 | 5 | 3.600 |
| Booster Ultrarraro | 2.500 | 1 | **2** | 2.500 |

⚠️ **A carteira aumenta o teto, mas nunca além do dobro.** `storeWeeklyBonus` vai de +1 a +5; sem o
freio, a Carteira Infinita levaria o Ultrarraro de 1 para 6 por semana, e aquele teto de 1 não é
decoração — é o que segura o pico de quem teve uma noite boa no cassino. O freio mora em
[`EquipmentState.WeeklyLimitFor`](../backend/VirtualOffice.Api/EquipmentState.cs).

**O desconto da carteira não vale para booster** — só para móvel, equipamento e (na Fase 3) baú. O
preço do booster foi calibrado contra a renda semanal, e deixar 15% cair ali mexeria na progressão
do álbum sem ninguém ter pedido.

Detalhe da regra e dos três degraus de raridade em [CARDGAME.md §3.1](CARDGAME.md).

### 5.2-b Baús: o novo sumidouro (v2)

Equipamento Raro para cima não tem preço porque não tem balcão — sai de baú. É lá que a moeda
que antes comprava a Moto vai parar ([PLANO_EQUIPAMENTOS.md §6](PLANO_EQUIPAMENTOS.md)):

| Baú | Preço | Teto/semana | Semana cheia | Melhor drop |
|---|---:|---:|---:|---|
| Comum | 350 | 5 | 1.750 | Incomum 35% |
| Raro | 1.400 | 2 | 2.800 | Lendária 5% |
| Selecionado | 2.600 | 1 | 2.600 | Exótica 2% |
| Lendário | — | recompensa | — | Exótica 5% |
| Exótico | — | só a Liga | — | Exótica 25% |

**Dreno novo de até 7.150/semana** — mais que a renda semanal inteira de 5.945. O Selecionado só
aparece para quem equipa Carteira Black ou Infinita, então na prática o teto de quem não tem
carteira lendária é 4.550. Com o desconto máximo de carteira (15%), os 7.150 caem para 6.078.

Isso é intencional: **equipamento é destino de moeda, não fonte.** O ganho passivo do conjunto
exótico (+693/semana, [§2.2-b](#22-b-equipamento-aumenta-a-presença-v2)) é uma fração do que os
baús drenam.

O poço seca: equipamento é **único por jogador**, e o balcão recusa a segunda unidade. Quando a
raridade sorteada já está completa, o baú tenta outra três vezes e depois paga moeda —
120/260/700/1.800/4.000 por raridade. Um baú que abrisse vazio seria pior que baú nenhum.

### 5.3 A régua atual

Contra as **5.945** de renda semanal máxima:

- 3 Raros + 1 Ultrarraro = 6.100 → **1,4 dia** de renda (era uma semana);
- a estante completa (90 Edições + 3 Raros + 1 Ultra) = 42.100 → **1,3 semana** (era 7,1);
- o conjunto Incomum completo (seis slots) = 2.990 → **meio dia**;
- os baús da semana toda (7.150) = **1,6 dia**.

A intenção antiga era "móvel é troco, booster é decisão, estante completa é maratona". Com a renda
nova e os preços velhos, **quase tudo virou troco** — o único freio que sobrou de pé são os tetos
semanais de booster e de baú. Se o beta mostrar que o conteúdo acaba rápido demais, o botão a
girar é o preço, não a renda.

O equipamento Raro+ não entra nesta régua de propósito: ele não tem preço. A moeda que antes
comprava a Moto vai, na v2, para o **baú** — e é lá, na §5.4 do
[PLANO_EQUIPAMENTOS.md](PLANO_EQUIPAMENTOS.md), que o dreno novo é dimensionado.

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
| **Lendário** | **Chefão do Hard, em qualquer liga** | 200 moedas por escada |
| Comum shiny | Boosters Raro (12,5%), Ultrarraro (25%) e Lendário (50%) | preço do booster |

O Lendário é o único item do jogo que **moeda nenhuma compra**. Se a renda subir muito, essa
propriedade é o que sobra de progressão não-inflacionável — não a remova sem substituir.

### 6.1 Baús que moeda não compra (v2)

Mesma ideia, do lado do equipamento:

| Baú | Fonte | Limite |
|---|---|---|
| Comum | os seis objetivos diários | 1/dia |
| Comum/Raro/Lendário | timer do celular equipado | 6 a 24 h, pelo celular |
| Raro | os cinco objetivos semanais | 1/semana |
| Lendário | **a cada 40 horas lançadas** | 1 por faixa de 40 h |
| Lendário | trinca `rocket` no Nerd Slots | 0,0125% por giro |
| Lendário | sequência de 7 no Arrange Dice | a jogada perfeita |
| **Exótico** | **Liga, 6ª vitória seguida** | **única fonte no jogo** |

**Amuleto do Beta** — item exótico dado a todo usuário humano em todo boot do servidor
(`Starter`). Tem todos os atributos de amuleto e não é comprável nem dropável: a porta dele é
"estar aqui durante o beta". É ele que ancora o RTP da mesa de dados
([§4.2](#42-arrange-dice-medido-e-estava-imprimindo-dinheiro)).

O Baú Exótico é, entre os equipamentos, o que o Booster Lendário é entre as cartas. Mesma porta,
mesma razão: sem ele, tudo no jogo teria preço.

As concessões de rotina (diária, semanal, nível) passam por `Lootboxes.GrantOnceAsync`, que grava
um `CoinEvent` de valor zero com `Source = "chest"` como chave — o mesmo truque do bônus de
boas-vindas. Reprocessar não duplica prêmio.

⚠️ `Source = "chest"` **também** aparece com gold quando o baú vira moeda (raridade esgotada).
Uma auditoria por `Source` vai mostrar `chest` como fonte de renda — está correto, mas não confunda
com as linhas de valor zero, que são só marcadores de idempotência.

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
5. ✅ **Furo do estorno fechado** ([§2.4](#24-estorno--furo-fechado)) — era pré-requisito de
   apertar a renda — não adianta baixar o teto que se contorna apagando lançamento antigo.
6. **Meça o Blackjack** antes de assumir que o cassino drena. Nerd Slots (92,5% de perda) e
   Arrange Dice (85% de RTP com o Amuleto do Beta) estão medidos; o Blackjack continua incógnita.
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
| `DailyGoldCapFromTime` | 400 | sim |
| `PresenceGoldPerMinute` | **5** (300/h) | **não** — só o padrão do código |
| `PresenceGoldDailyCap` | **2.700** (9 h) | **não** — só o padrão do código |
| `TimeZoneOffsetHours` | −3 | sim, e no `docker-compose.yml` |

Preço de item, gold/hora de atividade e recompensa de objetivo **não** são configuráveis: moram no
seed e valem no próximo boot ([GameInventorySeed.cs](../backend/VirtualOffice.Api/GameInventorySeed.cs),
[WorkCatalogSeed.cs](../backend/VirtualOffice.Api/WorkCatalogSeed.cs)). O seed reconcilia em vez de
recriar, então mudar um preço lá e reiniciar já vale para as contas existentes.

---

## 9. Auditoria

Todo crédito de moeda vira uma linha em `CoinEvents` com `Source` e `Reason`. Linhas com
`Gold = 0` são marcadores de idempotência de baú, não renda. Para ver de onde saiu o dinheiro:

```sql
SELECT "Source", count(*), sum("Gold") AS gold
FROM "CoinEvents" WHERE "UserId" = 1
GROUP BY "Source" ORDER BY gold DESC;
```

Aposta e prêmio de cassino ficam em `CasinoRounds` (`Bet`, `Payout`, `BalanceAfter`), separados dos
`CoinEvents` — o cassino mexe em `User.Coins` direto, sem passar por `AwardAsync`. **Uma consulta só
de `CoinEvents` não enxerga o que o cassino levou.**

```sql
SELECT "GameId", count(*) AS rodadas, sum("Bet") AS apostado, sum("Payout") AS pago,
       sum("Payout") - sum("Bet") AS saldo_do_jogador
FROM "CasinoRounds" GROUP BY "GameId";
```

Compras de item não têm tabela de histórico: o gasto aparece só como queda em `User.Coins`. A cota
semanal do balcão (`StorePurchaseQuotas`) registra **quantidade**, não valor — dá para saber quantos
boosters alguém comprou na semana, não quanto gastou no total. Se o histórico de gasto virar
requisito, é uma tabela nova.
