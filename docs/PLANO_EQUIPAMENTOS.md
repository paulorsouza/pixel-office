# Plano — Equipamentos v2

Refatoração completa da feature de equipamentos: seis slots com atributos de verdade, cinco
raridades, baús com tabela de drop e uma UI nova. Este arquivo é a **especificação**; o
[`ECONOMIA.md`](ECONOMIA.md) continua sendo o retrato dos números vigentes e precisa ser
atualizado a cada fase que mexer em renda.

Decisões já fechadas com o dono do jogo (2026-07-31):

- o jogo está em beta → **os vestíveis antigos (brincos, corrente, pulseira) são removidos**,
  sem conversão nem reembolso;
- a regra base do Arrange Dice **fica intacta** — os bônus de amuleto só somam em cima dela;
- entrega **por fases**, com checkpoint no navegador entre uma e outra.

---

## 1. O que existe hoje (ponto de partida)

| Peça | Onde | Situação |
|---|---|---|
| Catálogo visual | [`client-web/assets/equipment/catalog.json`](../client-web/assets/equipment/catalog.json) | 6 slots, 18 itens, 4 raridades |
| Loadout | `localStorage` (`office-quest-equipment-v1`) | ⚠️ **só no cliente** |
| Posse | `GameItemInstance` + `ownedEquipmentIds()` | servidor |
| Preço/raridade | [`GameInventorySeed.cs:101`](../backend/VirtualOffice.Api/GameInventorySeed.cs) | servidor |
| Atributo | **nenhum**, exceto `speed` do veículo | — |
| UI | `#equipment-menu` no `index.html` + `EquipmentSystem.js` | mostra o catálogo inteiro, com os não-possuídos cinzas |

Os dois problemas estruturais que a refatoração precisa resolver antes de qualquer item novo:

1. **O loadout não existe no servidor.** Enquanto o bônus for cosmético isso não importa; no
   momento em que equipar um mouse muda quanto de moeda a presença paga, o servidor precisa
   saber o que está equipado — senão o bônus é um número que o cliente escolhe sozinho.
2. **A bag mostra o catálogo, não o inventário.** O pedido é o contrário: o item só aparece
   quando o jogador conquista.

---

## 2. Slots e itens

Seis slots, um item cada:

| Slot | `id` | Papel |
|---|---|---|
| Mouse | `mouse` | ganho passivo de moedas |
| Teclado | `keyboard` | ganho passivo de moedas |
| Amuleto | `amulet` | bônus nos jogos do cassino |
| Automóvel | `vehicle` | velocidade + um atributo próprio |
| Celular | `phone` | ganho passivo + gera baú de recompensa |
| Carteira | `wallet` | desconto, cota extra e itens exclusivos na loja |

---

## 3. Raridades

| Raridade | chave | borda | Onde se consegue |
|---|---|---|---|
| Comum | `common` | `#9aa4b2` | loja |
| Incomum | `uncommon` | `#78bf8a` | loja |
| Rara | `rare` | `#65a9e9` | baú |
| Lendária | `legendary` | `#f0b849` | baú raro ou melhor |
| Exótica | `exotic` | `#ff6ad5` | baú lendário/exótico |

**A raridade `epic` deixa de existir para equipamento.** Os itens que a usavam sobem para
`legendary`. Os boosters do cardgame continuam com as strings deles — é outro eixo, exibido em
outro balcão, e mexer neles não é assunto desta refatoração.

Regra dura, que vale para os quatro slots não-veículo e para o veículo:

> **Comum e Incomum se compram na loja. Rara, Lendária e Exótica só saem de baú.**

---

## 4. Vocabulário de atributos

O servidor é dono dos efeitos. Cada item declara um objeto `effects`; o servidor **soma** os
seis slots equipados e devolve o agregado. Chave nova = regra nova em um lugar só.

| Chave | Tipo | Efeito |
|---|---|---|
| `passiveCoinPercent` | número | soma % à taxa **e ao teto** do gold de presença (base 500/h) |
| `teamworkCoinPercent` | número | soma % à taxa **e ao teto** do gold de equipe (reunião 180/h, pair 240/h) |
| `diceStartRolls` | inteiro | +N lançamentos iniciais no Arrange Dice |
| `diceTwoExtraRolls` | inteiro | +N lançamentos ao tirar 2 (**soma ao +2 da regra base**) |
| `diceTwelveKeepsRoll` | bool | tirar 12 não consome lançamento (o coringa continua) |
| `diceDoublesBonusRoll` | inteiro | +N lançamentos ao tirar duas duplas seguidas |
| `slotsBoosterChancePercent` | número | +N p.p. na chance da trinca de booster do Nerd Slots |
| `boosterShinyPercent` | número | +N p.p. de shiny ao abrir booster |
| `storeDiscountPercent` | número | desconto no preço da loja |
| `storeWeeklyBonus` | inteiro | +N no teto semanal, **nunca além do dobro** do teto original |
| `storeExclusiveTier` | bool | libera itens marcados como exclusivos de carteira (Fase 3) |
| `chestHours` | inteiro | gera um baú a cada N horas equipado — **o relógio mora na unidade do item** |
| `chestTier` | string | qual baú esse timer gera |

### 4.1 Por que a % de presença mexe no teto também

A presença paga `500 moedas/hora` com teto de `4.500/dia` (9 horas)
([Game.cs](../backend/VirtualOffice.Api/Game.cs)). Um bônus só sobre a taxa seria engolido pelo
teto em poucas horas, então ele multiplica os dois:

```
taxa = PresenceGoldPerHour  × (1 + passiveCoinPercent/100)
teto = PresenceGoldDailyCap × (1 + passiveCoinPercent/100)
```

O gold de **equipe** (reunião e pair) segue a mesma forma, com o seu próprio par de números e o
seu próprio atributo — `teamworkCoinPercent`, que só o celular e alguns veículos têm:

```
taxa = TeamworkMeetingGoldPerHour | TeamworkPairGoldPerHour × (1 + teamworkCoinPercent/100)
teto = TeamworkGoldDailyCap                                 × (1 + teamworkCoinPercent/100)
```

E o pagamento passa a ser **por direito acumulado**, não por incremento:

```
devido = min(floor(MinutesOnline × taxa), teto) − GoldAwarded
```

Isso resolve a fração sem coluna nova: `PresenceDay` já guarda `MinutesOnline` e `GoldAwarded`,
e `floor` sobre o acumulado paga a moeda quebrada assim que ela fecha.

---

## 5. Tabela de itens

Preço só existe para Comum e Incomum — o resto não tem preço porque não tem balcão.

### 5.1 A escala de passiva (revisada)

Ancorada no **conjunto lendário = +100%**, que sobre a base de 500 moedas/hora dá exatamente as
**1.000/h** do topo. Amuleto e carteira não dão passiva: cada slot tem um papel, e dois deles são
cassino e loja.

| Slot | Comum | Incomum | Rara | Lendária | Exótica |
|---|---:|---:|---:|---:|---:|
| Mouse | 5% | 10% | 18% | **28%** | 40% |
| Teclado | 5% | 10% | 18% | **28%** | 40% |
| Celular | 4% | 8% | 15% | **24%** | 34% |
| Automóvel | 2% | 5% | 10% | **16–20%** | 26% |

Conjunto exótico completo chega a +140% (1.200/h) — o exótico está acima do lendário de propósito.

| id | Nome | Raridade | Bônus | Preço |
|---|---|---|---:|---:|
| `mouse-office` | Mouse de escritório | Comum | +5% | 180 |
| `mouse-precision` | Mouse Precision | Incomum | +10% | 380 |
| `mouse-rgb` | Mouse RGB | Rara | +18% | baú |
| `mouse-pro-wireless` | Mouse Pro Wireless | Lendária | +28% | baú |
| `mouse-quantum` | Mouse Quantum | Exótica | +40% | baú |

### 5.2 Teclado — `passiveCoinPercent`

| id | Nome | Raridade | Bônus | Preço |
|---|---|---|---:|---:|
| `keyboard-membrane` | Teclado de membrana | Comum | +5% | 200 |
| `keyboard-compact` | Teclado compacto | Incomum | +10% | 400 |
| `keyboard-mechanical` | Teclado mecânico | Rara | +18% | baú |
| `keyboard-optical` | Teclado óptico | Lendária | +28% | baú |
| `keyboard-holo` | Teclado holográfico | Exótica | +40% | baú |

### 5.3 Celular — passivo + baú por tempo + **equipe** (revisado 2026-08-06)

| id | Nome | Raridade | Passivo | Equipe | Baú | Preço |
|---|---|---|---:|---:|---|---:|
| `phone-basic` | Celular básico | Comum | +4% | +5% | Comum a cada 12 h | 220 |
| `phone-smart` | Smartphone | Incomum | +8% | +10% | Comum a cada 9 h | 460 |
| `phone-flagship` | Flagship | Rara | +15% | +20% | Raro a cada 7 h | baú |
| `phone-foldable` | Dobrável | Lendária | +24% | +35% | Raro a cada 5 h | baú |
| `phone-neural` | Neural Link | Exótica | +34% | +50% | Lendário a cada 4 h | baú |

O relógio conta **tempo com o item equipado**, pelos mesmos minutos de presença que alimentam
`PresenceDay` — ficar deslogado não conta. Ele mora no `StateJson` da **unidade**: cada celular
acumula o seu, e desequipar pausa sem zerar.

⚠️ **Por isso os intervalos caíram.** Como o relógio conta minutos ONLINE e a presença tem teto de
nove horas por dia, as 24 h do Comum eram quase três dias de escritório por baú — o item parecia
quebrado. Com 12 h, ele entrega em pouco mais de um dia; o Neural Link, em meio dia.

E o celular ganhou `teamworkCoinPercent`: é o item de **estar acessível**, e o pilar de equipe
([ECONOMIA §2.5](ECONOMIA.md#25-equipe-o-que-se-ganha-por-estar-com-alguém)) precisava de um
equipamento que falasse com ele. Sem isso, o conjunto inteiro empurrava só a moeda de ficar online.

### 5.4 Amuleto — cassino

| id | Nome | Raridade | Efeitos |
|---|---|---|---|
| `amulet-clover` | Amuleto Trevo | Comum | `slotsBoosterChancePercent: 0,3` |
| `amulet-dice` | Amuleto do Dado | Incomum | `slotsBoosterChancePercent: 0,6`, `boosterShinyPercent: 0,3` |
| `amulet-horseshoe` | Amuleto Ferradura | Rara | `slotsBoosterChancePercent: 1`, `boosterShinyPercent: 0,5` |
| `amulet-phoenix` | Amuleto Fênix | Lendária | `diceStartRolls: 1`, `diceTwelveKeepsRoll`, `diceDoublesBonusRoll: 1`, `slotsBoosterChancePercent: 1` |
| `amulet-void` | Amuleto do Vazio | Exótica | `diceStartRolls: 1`, `diceTwoExtraRolls: 2`, `diceTwelveKeepsRoll`, `diceDoublesBonusRoll: 1`, `slotsBoosterChancePercent: 2`, `boosterShinyPercent: 1` |

Preços: Trevo 240, Dado 520.

⚠️ **`diceStartRolls` esbarra no teto de lançamentos** (`ArrangeDiceMath.MaxRolls`). O bônus
inicial soma dentro do teto: se o teto for 8, começar com +1 significa começar em 6 em vez de 5,
não em 9. Sem isso o amuleto viraria uma rodada infinita.

### 5.5 Carteira — loja

| id | Nome | Raridade | Desconto | Cota extra | Exclusivos | Preço |
|---|---|---|---:|---:|---|---:|
| `wallet-canvas` | Carteira de lona | Comum | 2% | — | não | 200 |
| `wallet-leather` | Carteira de couro | Incomum | 4% | +1 | não | 450 |
| `wallet-titanium` | Carteira de titânio | Rara | 7% | +2 | não | baú |
| `wallet-black` | Carteira Black | Lendária | 10% | +3 | **sim** | baú |
| `wallet-infinite` | Carteira Infinita | Exótica | 15% | +5 | **sim** | baú |

**O desconto não vale para booster de cardgame.** O preço dos boosters foi calibrado contra a
renda semanal ([ECONOMIA.md §5.3](ECONOMIA.md)); deixar uma carteira dar 15% ali mexe na
progressão do álbum sem que ninguém tenha pedido. Vale para móvel, equipamento e baú.

### 5.6 Automóvel

Os oito atuais continuam, com raridade remapeada, e entram sete novos. Cada um ganha um
atributo próprio além da velocidade.

**Regra do slot, escrita em 2026-08-06:** dentro de uma raridade, todo veículo carrega a **mesma
passiva** (Comum 2 · Incomum 5 · Rara 10 · Lendária 16 · Exótica 26); o que muda é o **extra** por
cima. Antes não era assim, e o resultado era um degrau em que um item era estritamente melhor que
o outro: o Super Skate (Rara) dava +10% de passiva e o Patins Pro (Rara) dava +2% de desconto na
loja. Escolher entre os dois não era escolher — era descobrir qual. Agora se escolhe o extra
(loja, cassino, baú, equipe), não o poder.

| id | Nome | Raridade | px/s | Atributo | Preço |
|---|---|---|---:|---|---:|
| `skate` | Skate | Comum | 150 | `passiveCoinPercent: 2` (inicial, grátis) | starter |
| `china-custom` | Chinesa Custom | Incomum | 196 | `passiveCoinPercent: 5`, `storeDiscountPercent: 2` | 780 |
| `roller-skates` | Patins | Incomum | 166 | `passiveCoinPercent: 5` | 450 |
| `super-skate` | Super Skate | Rara | 174 | `passiveCoinPercent: 10`, `teamworkCoinPercent: 10` | baú |
| `skate-neon` | Skate Neon | Rara | 160 | `passiveCoinPercent: 10`, `slotsBoosterChancePercent: 0,5` | baú |
| `roller-skates-pro` | Patins Pro | Rara | 178 | `passiveCoinPercent: 10`, `storeDiscountPercent: 2` | baú |
| `electric-scooter` | Patinete elétrico | Rara | 188 | `passiveCoinPercent: 10`, `storeWeeklyBonus: 1` | baú |
| `royal-enfield` | Royal Enfield | Rara | 210 | `passiveCoinPercent: 10`, `storeDiscountPercent: 3` | baú |
| `electric-scooter-city` | Patinete City | Lendária | 202 | `passiveCoinPercent: 16`, `chestHours: −1` | baú |
| `tesla-scooter` | Patinete da Tesla | Lendária | 226 | `passiveCoinPercent: 16`, `chestHours: −2` | baú |
| `motorcycle-retro` | Moto Retrô | Lendária | 218 | `passiveCoinPercent: 16`, `teamworkCoinPercent: 20` | baú |
| `motorcycle` | Moto | Lendária | 232 | `passiveCoinPercent: 18` | baú |
| `indian-custom` | Indian Custom | Lendária | 240 | `passiveCoinPercent: 16`, `diceStartRolls: 1` | baú |
| `harley-custom` | Harley Custom | Lendária | 248 | `passiveCoinPercent: 20` | baú |
| `kawasaki-custom` | Kawasaki Custom | Exótica | 262 | `passiveCoinPercent: 26`, `slotsBoosterChancePercent: 1` | baú |

`chestHours` negativo subtrai horas do timer do celular, com piso de 3 h.

⚠️ **A âncora do conjunto não mudou.** A escala de passiva continua ancorada no lendário completo
= +100% (mouse 28 + teclado 28 + celular 24 + **Harley 20**) e no exótico = +140%. Subir os outros
veículos lendários de 0 para 16 não mexe no topo — mexe no piso, que era um item sem efeito nenhum.

---

## 6. Baús

O baú é um `GameItemDefinition` com `ItemType = "lootbox"`. Comprar cria uma instância no
inventário (a mesma máquina do móvel), e abrir consome a instância e sorteia um equipamento.
Nada de tabela nova para posse — o teto semanal também já existe (`StorePurchaseQuota`).

| id | Nome | Fonte | Preço | Teto/semana | Tabela |
|---|---|---|---:|---:|---|
| `lootbox:common` | Baú Comum | loja | 350 | 5 | Comum 65% · Incomum 35% |
| `lootbox:rare` | Baú Raro | loja | 1.400 | 2 | Incomum 50% · Rara 45% · Lendária 5% |
| `lootbox:legendary` | Baú Lendário | recompensa | — | — | Rara 62% · Lendária 33% · Exótica 5% |
| `lootbox:exotic` | Baú Exótico | recompensa | — | — | Lendária 75% · Exótica 25% |

### 6.1 De onde vêm os que não se compram

"Os mais raros precisam ser bem limitados" — então cada fonte tem um teto explícito:

| Baú | Fonte | Limite |
|---|---|---|
| Comum | objetivos **diários** completos (os seis) | 1/dia |
| Raro | objetivos **semanais** completos (os cinco) | 1/semana |
| Comum/Raro/Lendário | timer do celular | pelo `chestHours` do celular equipado |
| Lendário | trinca `rocket` no Nerd Slots (p = 0,013%) | sem teto, a probabilidade é o teto |
| Lendário | sequência de 7 no Arrange Dice | idem |
| Lendário | subir de nível múltiplo de 5 | ~1 a cada 5 níveis |
| **Exótico** | **6ª vitória seguida na Liga Pokémon** | **única fonte no jogo** |

O tipo de baú do timer é o do **celular**, não um valor fixo: Comum até o Smartphone, Raro no
Flagship e no Dobrável, Lendário no Neural Link. O veículo só encurta o intervalo (`chestHours`
negativo), com piso de 3 h.

O Baú Exótico ocupa, na progressão, o mesmo lugar do Booster Lendário: é o item que **moeda
nenhuma compra**, e a Liga é a única porta. Isso é intencional e está registrado no
[ECONOMIA.md §6](ECONOMIA.md) — não remova sem substituir.

### 6.2 Duplicata

O sorteio escolhe a raridade pela tabela e depois um item daquela raridade **que o jogador
ainda não tem**. Se todos os itens da raridade sorteada já forem dele, sorteia de novo até 3
vezes; persistindo, o baú converte em moedas:

| Raridade | Conversão |
|---|---:|
| Comum | 120 |
| Incomum | 260 |
| Rara | 700 |
| Lendária | 1.800 |
| Exótica | 4.000 |

Equipamento é **único por jogador**: dois mouses iguais não fazem sentido em um slot só.

---

## 7. Onde cada coisa mora

A divisão que evita duplicar regra em dois lugares:

| Dado | Dono | Arquivo |
|---|---|---|
| Efeito, raridade, preço, tabela de drop | **servidor** | `EquipmentCatalog.cs` (novo) + `GameInventorySeed.cs` |
| Sprite, ícone, cores, `speed`, animação do piloto | **cliente** | `assets/equipment/catalog.json` |
| Loadout | **servidor** | `GameItemInstance.EquippedSlot` |

O cliente junta os dois por `id`. Efeito nenhum é calculado no cliente: a UI **exibe** o que
`GET /api/game/equipment` devolveu.

### 7.1 Schema

Uma coluna nova, só:

```csharp
// GameItemInstance
public string EquippedSlot { get; set; } = "";   // "" | mouse | keyboard | amulet | vehicle | phone | wallet
```

Com `Location = "equipped"` e índice único parcial em `(UserId, EquippedSlot)` para
`EquippedSlot <> ''` — dois itens no mesmo slot é estado inválido, não regra de aplicação.

### 7.2 Endpoints novos

| Verbo | Rota | Faz |
|---|---|---|
| `GET` | `/api/game/equipment` | loadout + efeitos agregados + itens possuídos |
| `PUT` | `/api/game/equipment/{slot}` | equipa (`{instanceId}`) ou guarda (`null`) |
| `POST` | `/api/game/lootboxes/{instanceId}/open` | abre o baú e devolve o item sorteado |

---

## 8. Fases

Cada fase termina em algo verificável no navegador.

### Fase 1 — dados e loadout no servidor
- migration com `EquippedSlot`;
- `EquipmentCatalog.cs` com slots, raridades, itens e efeitos;
- seed: remove vestíveis antigos (e as instâncias deles), remapeia raridade, cria os itens novos;
- endpoints `GET /api/game/equipment` e `PUT /api/game/equipment/{slot}`;
- `EquipmentSystem.js` passa a ler/gravar no servidor e a bag mostra **só o que é do jogador**.

**Checkpoint:** equipar no jogo, dar F5 e o loadout continuar lá.

### Fase 2 — atributos ligados ✅
- presença com `passiveCoinPercent` (taxa e teto, pagamento por direito acumulado);
- Arrange Dice e Nerd Slots lendo os efeitos do amuleto;
- shiny de booster com `boosterShinyPercent`;
- loja com `storeDiscountPercent` e `storeWeeklyBonus` (com o freio do dobro).

**`storeExclusiveTier` foi adiado para a Fase 3**, junto com os baús. Ele libera "itens marcados
como exclusivos de carteira", e hoje não existe item marcado assim — implementá-lo agora seria uma
bandeira que ninguém lê. Na Fase 3 ele passa a guardar as prateleiras premium do balcão de baús,
que é onde o efeito nasce com trabalho para fazer.

**Checkpoint:** equipar mouse exótico e ver a moeda por minuto subir; jogar dados com amuleto.

### Fase 3 — baús ✅
- definições, tabelas de drop, abertura com anti-duplicata e conversão em moeda;
- as sete fontes da §6.1, com os tetos;
- timer de baú do celular;
- `storeExclusiveTier` (adiado da Fase 2) guardando o **Baú Selecionado**, o único item do balcão
  que exige Carteira Black ou melhor;
- equipamento passou a ser **único por jogador**: o balcão recusa a segunda unidade, porque o slot
  é um só e a segunda cópia seria dinheiro jogado fora.

**Checkpoint:** comprar Baú Comum, abrir, receber item, e o teto semanal segurar no sexto.

### Fase 4 — UI/UX ✅
- **raridade como sistema**: uma variável `--rarity` ligada por `[data-rarity]` serve card,
  encaixe, baú, chip e revelação. Lendária e Exótica ganham brilho. A cor **nunca** carrega o
  significado sozinha — todo lugar que colore também escreve o nome da raridade;
- **bag agrupada por slot**: com dezesseis itens soltos, escolher exigia ler todos os cards; agora
  a pergunta do jogador ("o que serve no mouse?") tem uma seção com a resposta, e o cabeçalho do
  grupo diz o que já está equipado ali;
- **comparação** ao apontar um item: "Agora / Trocando por", com os dois lados de efeito. Sem
  delta calculado no cliente — as frases vêm prontas do servidor, e refazer a conta aqui criaria
  uma segunda régua para os mesmos números;
- **efeitos no próprio card**, não em `title`: tooltip de atributo não abre no toque, e mobile é
  obrigatório;
- **revelação do baú**: cartão animado cobrindo o painel, com a cor da raridade e os efeitos do
  prêmio. `prefers-reduced-motion` corta a animação, não o cartão;
- **tabuleiro em grade** de três linhas no lugar de coordenadas absolutas, com altura em `clamp`;
- **mobile**: uma coluna, alvos ≥ 44px, sem rolagem horizontal, e o painel entra no
  `uiIsBlocking()`. Regra extra para celular deitado (~390px de altura).

**Checkpoint:** verificado no jogo real (não só no harness), em 1270px, 375×812 e 780×390.

---

## 9. O que isso faz com a economia

Números a reconferir no [ECONOMIA.md](ECONOMIA.md) ao fim da Fase 2 e da Fase 3:

- **Renda de presença** sobe até +55% com conjunto exótico completo (16+16+13+10). Sobre as
  1.260/semana de presença, são ~693 a mais — cerca de **+11,6% sobre as 5.945** da renda máxima
  atual. Vale a régua ser reconferida, não reescrita.
- **Novos sumidouros**: Baú Comum 5×350 = 1.750/semana e Baú Raro 2×1.400 = 2.800/semana. Somados,
  4.550/semana de dreno novo — mais que compensam a renda extra acima, o que é o desenhado:
  equipamento deve ser *destino* de moeda, não fonte.
- **Desconto de carteira** reduz o dreno em até 15%. Com a carteira exótica no pulso, aqueles
  4.550 viram 3.868 — ainda acima do ganho passivo.
- **RTP do cassino** não muda com o amuleto de moeda: os bônus de dado mexem em quantos
  lançamentos a rodada tem, então o Arrange Dice — que já era o jogo não medido — fica **ainda
  mais** carente de medição. Isso é o item 6 do checklist do `ECONOMIA.md` e continua aberto.

## 10. O que ficou sem teste automatizado

O backend não tem projeto de teste, então as regras da Fase 2 foram conferidas assim:

| Regra | Como foi verificada |
|---|---|
| Presença com bônus | **dados reais**: 346 min → 201 moedas, exatamente o teto novo (180 × 1,12) |
| `diceStartRolls` | **ao vivo**: rodada abre com 6 lançamentos em vez de 5 |
| Desconto e cota da carteira | **ao vivo**: preço e teto mudam ao equipar/guardar |
| `diceTwelveKeepsRoll`, `diceTwoExtraRolls`, `diceDoublesBonusRoll` | **por construção** — dependem de o dado cair |
| `slotsBoosterChancePercent`, `boosterShinyPercent` | **por construção** — sorteio probabilístico |
| Comprar, abrir e consumir baú | **ao vivo**: 350 → bag → item → unidade some; reabrir dá 404 |
| Conversão em moeda com o poço seco | **ao vivo**: com Comum e Incomum completos, o Baú Comum pagou 260 |
| Timer do celular | **ao vivo**: 1.080 min acumulados → Baú Comum concedido, contador zerado |
| Cota, desconto e trava de carteira nos baús | **ao vivo**: Selecionado destrancou com a Carteira Black |
| UI: agrupamento, raridade, comparação, revelação | **ao vivo**, no jogo real e no harness |
| UI: mobile retrato e paisagem | **ao vivo**: 375×812 e 780×390, alvos ≥ 44px, sem rolagem horizontal |
| Baú por objetivo diário/semanal, por nível, e o Exótico da Liga | **por construção** — exigem fechar o dia, subir de nível ou vencer seis partidas |

As três regras de dado agora vivem em `ArrangeDiceMath.ApplyRoll`, uma função pura: estado e lance
entram, estado sai. Ela foi extraída justamente para poder ser testada sem transação, idempotência
e aposta em volta — **falta só o projeto de teste que a exercite**. Mesma história para
`EquipmentState.PriceFor` e a aritmética da presença.


---

## 11. Revisão de balanceamento (2026-07-31)

Depois das quatro fases, três ajustes de produto:

### 11.1 Renda passiva 5× maior
Presença passou de 60 para **300 moedas/hora**, com teto de **9 horas** (2.700/dia). A escala de
`passiveCoinPercent` foi reancorada para o conjunto lendário bater **exatamente 600/h**. Detalhe e
tabelas em [ECONOMIA.md §2.2-b](ECONOMIA.md).

### 11.2 Relógio de baú dentro do item
O contador saiu da tabela por usuário e virou um campo no `StateJson` da **unidade**. Cada celular
acumula o seu: trocar o Flagship pelo Dobrável não transfere progresso, e desequipar **pausa sem
zerar** — o item guarda o que contou e volta de onde parou. A UI mostra a barra e quanto falta no
próprio card, com rótulo "pausado" quando o item está na bag.

### 11.3 XP removido
Ele não desbloqueava nada e ocupava oito telas do app web. Saíram `User.Xp`, nível, ranking de XP e
os campos de XP de atividade, objetivo e lançamento. `XpEvents` virou `CoinEvents` — **renomeada,
não recriada**: a migration que o EF gerou apagava a tabela, e com ela os marcadores de
idempotência que impedem baú repetido e o bônus de boas-vindas de ser pago duas vezes.

O Baú Lendário que caía a cada 5 níveis passou a cair a cada **40 horas lançadas** — de quebra, é o
contrapeso da presença, que virou a maior fonte do jogo.

### 11.4 Recompensa de objetivo bufada
Diários somam **1.200/dia** (era 165) e semanais **4.700** (era 730). Os valores antigos foram
calibrados quando a presença pagava 180/dia; ao lado de 2.700 eles eram troco.

### ✅ 11.5 O que ficou desalinhado — resolvido em 2026-08-06
O teto de lançamento de horas continuava em **400/dia** enquanto a presença dava 2.700. Ficar
online rendia ~7× mais que produzir, o que invertia o princípio declarado do jogo. **Foi para
6.000/dia** na revisão da §13; a relação está restaurada. Ver
[ECONOMIA.md §2.1-b](ECONOMIA.md).

### 11.6 Mesa de dados reequilibrada e Amuleto do Beta (2026-07-31)

**A mesa do Grandia III pagava 820% de RTP** sem amuleto nenhum, e 9.105% com um exótico — medido
por simulação, não estimado. A tabela de gold passou de `4/12/40/80/200` (com repetição de até 20×)
para `0,5/1/2/3/6` (repetição até 1,6×). Booster, carta e baú **não mudaram**.

**Os bônus da mesa de dados agora exigem Lendária+.** Eles multiplicam o RTP por 2 a 2,5 vezes; num
amuleto Comum de 240 moedas, isso se pagava em minutos. Comum, Incomum e Rara passaram a dar
`slotsBoosterChancePercent` e `boosterShinyPercent` — bônus que rendem carta, não moeda.

**`amulet-beta` — Amuleto do Beta (Exótica).** Todos os atributos de amuleto, concedido a todo
usuário humano em todo boot (`Starter: true`), não comprável e não dropável. Como todo mundo o
carrega, **é o RTP dele (85%) que vale como RTP real da mesa** — aposentá-lo depois do beta deixa a
mesa em 32% e exige reequilibrar.

| Tabela | Sem amuleto | Lendário | Exótico / Beta |
|---|---:|---:|---:|
| Antiga | 820% | 3.551% | 9.105% |
| **Nova** | **32%** | **67%** | **85%** |

---

## 12. A tela de itens (2026-08-05)

Quatro mudanças, todas na mesma queixa: **a bag parecia planilha, não RPG.**

**Arte por item.** Cada equipamento tem o seu PNG de 32×32 em `assets/equipment/items/<id>.png`,
gerado por `client-web/tools/generate-equipment-icons.mjs`. Antes o desenho era CSS por SLOT: os
cinco mouses eram o mesmo contorno pintado de outra cor, o que fazia a raridade parecer etiqueta.
Agora a receita usa a raridade para **acrescentar peça** — o mouse perde o fio ao virar sem fio, o
teclado exótico projeta as teclas, a carteira infinita ganha corrente. Trocar a arte de um item é
mexer na receita e rodar o script; nada no CSS.

**Voo ao equipar.** Clicar num card faz a arte voar até o encaixe (300 ms) e o slot pulsar na
chegada. Antes o card mudava de cor num canto e o slot mudava de conteúdo no outro, no mesmo frame:
duas coisas distantes, sem ligação visível. `prefers-reduced-motion` cancela o voo, não a troca.

**Bag reordenável.** Arrastar um card reordena a bag dentro do mesmo slot e a ordem fica na conta
(`GameItemInstances.BagOrder`, `PUT /api/game/equipment/bag/order`). Vai a lista inteira, nunca
"moveu de 3 para 7" — é o que impede duas ordens de divergirem quando dois arrastes se atropelam.
Item novo nasce com ordem zero e cai no fim, para não furar a fila de quem já organizou.

**O gesto tem dois gatilhos.** No mouse, arrasta depois de 8px; no toque, só depois de segurar
350ms. Sem a espera no toque, rolar a lista viraria arrastar card — e a bag ficaria impossível de
ler no celular.

---

## 13. Economia mais generosa e o pilar de equipe (2026-08-06)

Três números e um pilar novo. O detalhe econômico está em
[ECONOMIA.md §2.1-b, §2.2-b e §2.5](ECONOMIA.md); aqui fica o que muda em **equipamento**.

**`teamworkCoinPercent` é o atributo novo.** Multiplica o gold de reunião e pair programming (taxa
e teto), e não o de presença. Está no **celular** (+5% a +50%), que é o item de estar acessível, e
em dois veículos (Super Skate +10%, Moto Retrô +20%), que é a carona. Nenhum periférico o tem: o
mouse e o teclado continuam sendo a linha da moeda passiva, e misturar as duas faria o melhor
mouse pagar mais por participar da mesma reunião.

**Os veículos ganharam uma regra que não tinham.** Dentro de uma raridade, todos carregam a mesma
passiva (2/5/10/16/26) e se diferenciam pelo extra. Antes, dois itens Raros podiam valer +10% de
passiva e +2% de desconto — o segundo era estritamente pior, e a escolha era só descobrir qual.
A âncora do conjunto (lendário = +100%, exótico = +140%) **não mudou**: o topo é o mesmo, o piso
é que subiu. O Skate, veículo inicial de todo mundo, era o único item do jogo com efeito nenhum —
e, por ser o inicial, o primeiro card que a bag mostrava, vazio.

**O relógio do celular caiu pela metade.** Ele conta minutos ONLINE, e a presença tem teto de nove
horas por dia: 24 h de relógio eram quase três dias de escritório por baú. Ver §5.3.
