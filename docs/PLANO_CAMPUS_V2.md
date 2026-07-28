# Plano de execução — Campus Tooq v2

**Atualizado:** 2026-07-28

A Dark Company (`tooq-office-1`) permanece como referência funcional e não é regenerada. O Tooq
Office nasce em arquivos próprios e usa os mesmos contratos de mapa, presença, voz, inventário e
SignalR.

## 1. Planta do prédio principal

Revisada em 2026-07-28: o prédio era grande demais para o time se encontrar. O térreo passou de
`124×112` para **`52×34` tiles** (mapa `66×52`), com um cômodo de cada tipo em vez de fileiras
repetidas.

```text
              ← 52 tiles →
 ┌───────────┬─────────────┬──────────┬───────┐
 │ COZINHA 14│  JOGOS 17   │ESTUDO 13 │1×1 11 │  11  (portas ao sul)
 ├───────────┴─────────────┴──────────┴───────┤
 │        SALA GRANDE — canal de voz próprio  │  11
 │   ilha de estações · mesa comunitária ·    │
 │   lounge · bebedouro · impressora          │
 ├────────────┬───────────────────┬───────────┤
 │ REUNIÃO 16 │ recepção + loja   │ escada +  │  12
 │ (fone)   ▐ │ + entrada ao sul  │ elevador  │
 └────────────┴───────────────────┴───────────┘
```

O mapa `tooq-campus` contém:

- 1 sala de reunião (`meeting: true` ⇒ fone na parede norte), no canto sudoeste, **porta a leste**;
- 1 sala 1×1, 1 sala de jogos com duas mesas de xadrez em rede, 1 cozinha, 1 sala de estudos;
- a sala grande em "L", com recepção, loja e relógio de ponto junto da entrada;
- núcleo de elevador e escadas agrupado a leste, para a expansão vertical;
- vão de entrada ao sul, vãos laterais e quintal ajardinado com retorno ao mundo aberto.

Continua valendo o padrão estrutural de `tooq-office-1`: salas da mesma faixa compartilham paredes,
as das pontas usam o perímetro do prédio e as portas internas ficam na parede frontal — a exceção
deliberada é a reunião, cuja porta a leste mantém a parede norte livre para o fone.

**Piso por função, não madeira em tudo.** Cozinha em piso claro, jogos em sage, estudos/1×1/reunião
em carpete, sala grande em madeira. Isso expôs um detalhe do room builder: a peça lateral de parede
é uma tira fina com o resto do tile transparente, então pintar o retângulo inteiro da sala fazia o
piso vazar por baixo da parede. `MapRenderer.roomFloorRect` recua o piso para dentro das paredes.

**Voz na área aberta.** Uma `zone` com `voice: true` vale como sala para o `syncVoiceChannel`. As
duas metades do "L" compartilham o `id` `open-space`, então são um canal só; os tapetes são zonas
mudas. Sem isso o lugar mais movimentado do prédio seria justamente o único sem áudio.

**Dois jeitos de sentar, um para cada tipo de móvel.**

- **Cadeira de perfil** (`of_306`/`of_307`) usa a pose `sit`, a única lateral boa do pack, com
  `seatX: ∓0,5` e `seatY: -1,125`. O **encosto delas fica à direita** — medido, não chutado: a parte
  mais alta da arte está nas colunas 10–13 do conteúdo. Logo, sem espelhar a pessoa encara a
  **esquerda**; para o outro lado é a mesma peça com `flipX`, e aí o conteúdo pula para a outra
  metade do quadro de 32 px, então a coluna e o `seatX` acompanham. Inverter isso põe o encosto
  contra a mesa — foi o primeiro erro.
- **Sofá** (`of_200`/`of_205`) é visto de frente, e a folha `sit` não tem pose de frente que preste.
  Vale o **truque da estação, invertido**: `idle` virado para a câmera + `seatCover` redesenhando a
  frente do estofado na frente das pernas. `seatY: -1,35`, `seatCover: 7`. Um assento por sofá: o
  claim é por móvel.

Os quatro números saíram de `tools/seat-preview.mjs`, que compõe móvel + avatar com a matemática do
runtime — sentar é o tipo de coisa que só se acerta olhando. Erros que ele pegou: `seatY: -0,875`
(herdado das poltronas) deixava o avatar baixo demais na cadeira, e `seatCover: 11` cobria a perna
inteira, então o sofá ficava com gente sem pernas. Como a prévia usa o corpo base, cabelo alto ou
roupa comprida ainda podem pedir 1–2 px de ajuste.

Poltrona vista de frente (`of_196`–`of_199`) segue sendo cenário — ela não tem nem perfil nem frente
larga o bastante para o `seatCover`.

**Porta na parede de duas linhas.** A porta deslizante foi desenhada para a parede norte; girada na
tira fina de uma lateral, ela fica solta no chão. A Aurora usa porta ao norte, deslocada do centro
para não disputar lugar com o fone, que a `MeetingHeadset` pendura no meio da parede.

**`place()` fala em arte, não em quadro do Tiled.** `x` é a coluna do canto esquerdo e `y` a linha
da base. O contrato do runtime é `item.x = objeto.x/16 − 0,5` e `item.y = objeto.y/16 − 1`; usar o
quadro direto rende meia coluna e uma linha de erro — foi assim que apareceram armário sobre a
parede e cadeira longe da mesa. `tools/layout-audit.mjs` verifica isso no mapa inteiro.

O quintal ocupa a faixa sul da cena, com caminho em cruz, fonte, bancos, árvores, flores e limite
vegetado. Colisões invisíveis fecham o perímetro sem contaminar a arte; existe uma abertura física
no portão sul. Ali, o portal `yard-exit` exibe a interação `E` e retorna ao spawn `from-campus` da
cena `world`.

Elevador e escadas são entidades `verticalAccess` orientadas a dados e usam sprites LimeZu. Os dois
acessos funcionam com `E`: no térreo levam às alas pessoais e, na ala, retornam aos spawns
correspondentes do saguão. A porta do elevador abre quando o avatar se aproxima. Novos andares
podem reutilizar a mecânica trocando apenas `targetScene` e `targetSpawn`. Visual e sensor são
independentes: a escada nasce na parede e a interação fica na faixa livre diante do primeiro
degrau; o elevador ocupa um poço técnico fechado em outro ponto do saguão e abre para uma cabine
escura, com a caixa mantendo a colisão de fundo.

As colisões dos móveis foram recalibradas pela base opaca de cada família e sincronizadas em todos
os TMJs. Escada, fonte, bancos e árvores possuem blockers próprios; quadros, flores e detalhes
continuam atravessáveis de propósito. Sensor de interação nunca funciona como corpo físico.

O gerador idempotente `client-web/tools/generate-tooq-campus.mjs` mantém `tooq-campus`,
`personal-wing`, `player-home-shell` e o hub `world`, registra as cenas e gera os snapshots usados
pelos testes. Ele nunca reescreve a planta da Dark Company (`tooq-office-1`) nem a do Coworking
(`tooq-office`).

## 2. Salas pessoais públicas — um andar por cena

As salas não são instâncias privadas escondidas. Cada **andar** é uma cena pública com 6 cômodos
físicos: três acima e três abaixo de um corredor compartilhado. O prédio nasce com **dois andares**.

```text
Térreo (tooq-campus)
      │  elevador (expresso) · escada (um andar)
      ▼
1º andar = personal-wing@0 (slots 0–5)
      ▲▼ escada
2º andar = personal-wing@1 (slots 6–11)
```

As alas deixaram de ser vizinhas laterais ("ala anterior/próxima") e viraram andares de verdade.
Os spawns são nomeados pelo **lado de onde a pessoa chega** — `from-stairs-above`,
`from-stairs-below`, `from-elevator` — e existem com o mesmo nome no térreo e no andar, então um
destino só serve os dois casos.

**Escadas** andam um andar por vez, por `floorDelta` no objeto do mapa. ⚠️ O `verticalAccess`
montava o portal **sem repassar `floorDelta`**, e a resolução caía no ramo do `targetWing`, que é
fixo: subir e descer levavam ao mesmo andar. A decisão virou função pura
(`src/FloorNavigation.js#resolveSceneTarget`) com teste próprio, justamente porque o bug era mudo —
nada quebrava, você só não saía do lugar. Cada sentido tem arte própria
(`limezu_stairs_wood_down.png`, gerada a partir da de subida): sem isso as duas escadas ficam
idênticas no mapa. No último andar, subir avisa por toast em vez de não fazer nada.

**Elevador** serve o prédio inteiro: `E` abre o **seletor de andar** (`src/FloorPicker.js`), que
lista Térreo + os andares existentes, marca onde você está e segue as regras de painel do projeto
(folha de tela cheia no celular, alvo ≥ 44 px, entra no `uiIsBlocking()`). Cada andar tem o seu
**poço** — a porta precisa de uma parede atrás, senão fica solta no salão.

⚠️ Encolher o andar mexe em dados já gravados. `GameInventorySeed.RepackPersonalRoomsAsync` roda no
boot, reacomoda quem estava num slot que não existe mais preservando a ordem de chegada e **reancora
a mobília junto** (as colocações são coordenadas absolutas do mapa; sem o deslocamento, a mesa do
dono apareceria dentro da parede — ou da sala de outra pessoa).

No cadastro, o backend reserva de forma persistente:

- `RoomKey`: identidade estável da sala;
- `WingIndex`: número da ala;
- `SlotIndex`: posição dentro do módulo.

Todos os usuários na mesma ala compartilham presença e circulação. As placas mostram o dono e
qualquer pessoa pode entrar e conversar. Somente o dono recebe o botão de decoração e a API também
recusa colocação de mobília por terceiros.

Quando um andar completa 6 salas, o próximo usuário ocupa automaticamente o primeiro slot do andar
seguinte. O módulo mantém dimensões e corredores regulares em qualquer escala. `RoomsPerFloor` e
`MinimumFloors` vivem em `GameInventorySeed`; `FloorSlotOrigin` espelha o `wingBoundaries` do
gerador — se um mudar sem o outro, a mesa inicial nasce fora da sala.

## 3. Economia e carga inicial

Cada unidade continua sendo uma `GameItemInstance`. Uma conta nova recebe exatamente:

- 1 mesa de trabalho (`of_258`);
- 1 quadro kanban (`of_171`);
- 1 skate básico (`equipment:skate`).

Mesa e kanban já nascem colocados no slot pessoal. O skate fica no inventário/equipamento. O restante
do catálogo possui preço, raridade, tipo e capacidades. A loja do campus compra uma unidade por vez,
desconta moedas no backend e atualiza o inventário por SignalR.

O catálogo oferece dois modelos visuais de cada base de locomoção: skate, patins, patinete elétrico
e moto. Somente itens possuídos podem ser equipados.

## 4. Features de móveis

As regras são declaradas por `interactionType`/capacidades, não pelo ID visual:

| Interação | Integração |
|---|---|
| `workstation` | escolhe atividade e inicia/encerra lançamento real de horas |
| `timeclock` | lê o relatório real dos últimos 14 dias |
| `kanban` | lê o quadro e altera a atividade ativa |
| `whiteboard` | abre o diagrams.net/draw.io com chave estável do quadro |
| `coffee` | entrega a xícara animada na mão; o avatar bebe sentado |
| `seat` | claim de assento em rede e composição com estação próxima |
| `store` | catálogo, saldo e compra persistente |
| `chess` | partida em rede pelo registro de mecânicas |

## 5. Cidade e Vila dos Jogadores

O hub `world` mede `220×150` tiles, possui cerca e colisão nas quatro bordas, ruas/calçadas nativas
do Tiled e três empresas:

- Tooq Office central, próximo do spawn;
- Coworking afastado a noroeste;
- Dark Company afastada a nordeste.

A Vila dos Jogadores fica a leste, com seis fileiras e 12 casas. Cada entrada aponta para uma
identidade dinâmica `player-home-shell@house-XX`; o mesmo TMJ vazio é materializado com nome e spawn
de retorno próprios. Fachadas têm footprints sólidos completos e o portal fica do lado externo,
portanto o avatar não atravessa paredes/telhados para entrar.

Ao reiniciar a cena, `MapRenderer.resetSceneRenderState` descarta móveis e portas do mapa anterior.
Isso impede prompts de `seat`, `coffee` ou outras features internas de sobreviverem no mundo aberto.

## 6. Próximas fatias

1. Persistir o arquivo do draw.io por quadro (hoje a integração abre o editor, mas o arquivo ainda
   é responsabilidade do usuário).
2. Ligar drops a eventos de XP/conquistas com tabela de loot e auditoria; a compra já está funcional.
3. Criar mais famílias visuais de mobília e balancear preços/moedas.
4. Validar duas sessões simultâneas atravessando campus e ala, incluindo voz e decoração.
5. Criar os demais mapas de pisos e ligar novos destinos ao núcleo `verticalAccess`.
6. Polir a arte no Tiled sobre a planta funcional, preservando dimensões, IDs e portais.
7. Persistir compra, propriedade e decoração individual das 12 casas.
