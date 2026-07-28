# ASSETS — onde está tudo e o que já foi explorado

**Atualizado:** 2026-07-24

Este doc responde três perguntas: **onde estão os assets**, **o que tem em cada pack**, e
**o que já mapeamos** (as coordenadas/medidas que custaram caro pra descobrir).

---

## 1. Política de versionamento

| | Onde | No git? |
|---|---|---|
| **Packs crus** (LimeZu, ~815 MB / 99 mil arquivos) | `LimeZu/` (**no workspace, ignorado**) | ❌ Não |
| **Assets recortados** (o que o cliente carrega) | `client-web/assets/` (~1 MB) | ✅ Sim |

**Por quê:** os packs são comprados, **nunca mudam** e são **re-baixáveis do itch.io** com a conta de
vocês. Versionar 34 mil arquivos deixaria o git lento sem ganho — 95% deles (praia, cemitério, base
militar, metrô…) nunca serão usados num escritório. O que o jogo **precisa pra rodar** está
versionado.

> ⚠️ **Se a pasta `LimeZu/` sumir:** rebaixe os packs no itch.io (Modern Interiors, Modern Office
> Revamped, Modern Exteriors, Modern UI). O que **não** dá pra rebaixar é o que está no repo —
> por isso os recortes estão versionados.

---

## 2. Os packs (comprados) — `LimeZu/`

> **Reorganizados por tema** (2026-07-17). Cada pasta tem um `README.md` próprio; índice geral em
> `LimeZu/README.md`. Os `.zip` originais estão em `LimeZu/_zips-e-instaladores/` (restauração).

| Tema | Pasta | Peso | Pra quê |
|---|---|---|---|
| **Exteriores** (Modern Exteriors) ⭐ | `LimeZu/exteriores/` | 346 MB | Grama, árvores, prédios, portões, cercas, jardim, piscina. **6.225 singles** |
| **Interiores** (Modern Interiors) | `LimeZu/interiores/` | 220 MB | Room builder de interior, objetos, animados, salas prontas, paletas |
| **Personagens** (Char. Generator art) | `LimeZu/personagens/` | 91 MB | Partes modulares (Bodies/Eyes/Outfits/Hairstyles/Accessories) + premades |
| **Escritório** (Office Revamped) ⭐ | `LimeZu/escritorio/` | 5,5 MB | Room builder de escritório + **339 móveis** + `designs/` (referência) |
| **UI** (Modern UI) | `LimeZu/ui/` | 7,7 MB | Ícones/molduras pixel |
| **Geradores** (apps) | `LimeZu/geradores/` | 314 MB | Programas `.exe` — **o usuário opera** pra gerar premades e retratos |
| RPG Maker / não usados | `LimeZu/rpg-maker/`, `LimeZu/nao-usados/` | 20 MB | Versões RPG Maker / packs de outro estilo |

### Regra de ouro
**Use SEMPRE a versão 16×16.** A arte é autorada em 16px; as pastas `upscale-32/` e `upscale-48/`
(dentro de cada tema) são só ampliação e ocupam a maior parte do peso.

### Onde achar cada coisa (nova estrutura)

```
LimeZu/exteriores/
├── singles/          ← 6.225 PNGs com NOME DESCRITIVO (ME_Singles_<Tema>_16x16_<Item>_N.png)
├── theme-sorter/     ← folhas grandes por tema (16_Office, 17_Garden, 1_Terrains_and_Fences…)
├── animados/         ← spritesheets animadas (porta de escritório, veículos, água…)
└── autotiles/

LimeZu/interiores/
├── singles/          ← Room_Builder_16x16.png, Interiors_16x16.png, Room_Builder_subfiles/, Theme_Sorter*
├── animados/         ← impressora, café, monitores…
└── home-designs/     ← salas prontas (referência visual)

LimeZu/personagens/character-generator-parts/   ← Bodies/Eyes/Outfits/Hairstyles/Accessories + 0_Premade_Characters/

LimeZu/escritorio/
├── room-builder/Room_Builder_Office_16x16.png   ← 256x224 = grade 16x14
├── singles/                                       ← 339 móveis (Modern_Office_Singles_N.png)
└── designs/Office_Design_1.gif                    ← ⭐ A REFERÊNCIA DE QUALIDADE
```

**Dica que economiza tempo:** os `singles/` têm nomes descritivos
(`ME_Singles_Garden_16x16_Gate_4.png`). `ls exteriores/singles/ | grep -i gate` é muito mais rápido
que caçar célula nas folhas grandes.

---

## 3. ✅ O QUE JÁ FOI EXPLORADO E MEDIDO

Tudo abaixo foi **renderizado e conferido visualmente**. **Não chute de novo** — use estes valores.

### 3.1 Personagens (Modern Interiors)
- Folha: **384×32** = **24 frames de 16×32**
- **Ordem: `right(0-5), up(6-11), left(12-17), down(18-23)`** ⚠️ verificado nos pixels
  (o `docs/HANDOFF.md` e o histórico dizem `down/up/left/right` — **ERRADO**)
- Velocidades: run ~10-12 fps · idle ~4.5-5 fps
- Personagens: Adam, Alex, Amelia, Bob × (run / idle_anim / sit)
- `Adam_sit_16x16.png`: **384×32 = 12 frames de 32×32**, mas possui somente vistas laterais:
  `right(0-5), left(6-11)`. **Não existem frames sentados de frente/costas.** ⚠️ Apesar do nome
  `16x16`, não recorte esta folha com `frameWidth: 16`: isso alterna as metades do piloto. A moto
  usa `Adam_sit.png` na horizontal e os frames `up/down` de `Adam_idle_anim.png` na vertical.
- Skate e patins reutilizam `Adam_idle_anim.png`, não `Adam_run.png`: a pose estável evita passadas
  fora da prancha e das botas. No patins, o desenho procedural é uma camada frontal que cobre os
  sapatos do personagem.

#### Character Generator modular

- Fonte: `LimeZu/personagens/character-generator-parts/`.
- Ordem de composição oficial: **Body → Eyes → Outfit → Hairstyle → Accessory**.
- As folhas modulares têm **896×656**; `Bodies` mede **927×656** porque inclui anotações à direita,
  fora da área útil. Não use a largura total para inferir colunas.
- Cada célula útil mede **16×32**. Linhas usadas pelo cliente: `idle` em **y=32**, `walk` em
  **y=64** e `sit` em **y=128**.
- `idle` e `walk`: 24 frames na ordem `right(0-5), up(6-11), left(12-17), down(18-23)`.
- `sit`: **24 frames**, na ordem própria `right(0-5), left(6-11), up(12-17), down(18-23)`. O pack só
  trazia as laterais; cima e baixo foram geradas por script e escritas nas 23 folhas modulares (o
  tronco vem do `idle` correspondente e a parte de baixo alarga o quadril + escurece os joelhos).
  ⚠️ **Essa geração não convence** — o resultado lê como pessoa em pé (ver o alerta abaixo). As
  laterais do pack continuam sendo as únicas poses realmente sentadas.
- ⚠️ **`up` e `down` do `sit` não passam de pessoa em pé.** Ampliados lado a lado com o `idle`, a
  diferença é só a perna encurtada: não há joelho dobrado, que é o que faz a silhueta ler como
  sentada. Só as laterais do pack têm. Consequências no `tooq-office-1`:
  - cadeira/poltrona solta → pose `sit` de **perfil** (`left`/`right`), a única boa;
  - estação (`station_*`, cadeira encara o monitor) → **não** usa `sit`; o avatar fica em `idle up`,
    de costas para a tela, lendo como quem trabalha. Uma pose de sentar de frente ficaria em pé.
  - Quem senta é **desenhado acima do móvel** (`display.depth + 1`), senão o tampo da estação o
    esconde. Redesenhar os 12 frames `up`/`down` do `sit` nas 23 folhas é o que destrava sentar de
    frente/costas de verdade.
- ⚠️ Medir a **silhueta** não distingue poses de cadeira nem de personagem: as larguras por linha
  são iguais. É preciso comparar os pixels.
- O cliente carrega a imagem inteira e registra somente esses retângulos como frames nomeados no
  Phaser. Isso mantém as cinco camadas perfeitamente alinhadas sem gerar centenas de recortes.

### 3.2 `room_builder.png` (Office) — 256×224 = grade **16 col × 14 lin** @16px
Notação: `rb_<col>_<lin>` (linha contada do topo).

**Parede fina** (laterais e sul) — conjunto **cols 7-9**:
```
TL=rb_7_1   TOP=rb_8_1   TR=rb_9_1
 L=rb_7_2  FILL=rb_8_2    R=rb_9_2
BL=rb_7_3   BOT=rb_8_3   BR=rb_9_3
```
- ⚠️ **`rb_8_1` é a horizontal SEM emenda.** `rb_3_1` e `rb_4_1` **têm gaps** (parecem certas, não são)
- Topo≠base e esq≠dir ⇒ **RuleTile automática não resolve** (os vizinhos são idênticos).
  **Pinte por posição** — fica perfeito.

**Parede 3D** (com volume, decorável com quadros/troféus) — 2 tiles de altura:
```
rb_1_11   ← painel branco superior
rb_1_12   ← painel branco inferior + rodapé
```
Para encontros laterais, a família ocupa três colunas: `rb_0_*` tem a borda à esquerda,
`rb_1_*` é o trecho repetível e `rb_2_*` tem a borda à direita. Nos escritórios atuais, a parede
lateral fina é prolongada pelos dois tiles da parede sul 3D; assim as laterais terminam no mesmo
rodapé inferior, enquanto os painéis frontais começam um tile para dentro.
Variantes verificadas: `rb_1_7`+`rb_1_8` (pedra cinza) · `rb_1_9`+`rb_1_10`
(tijolo marrom) · `rb_1_5`+`rb_1_6` (tijolo lavanda). As antigas coordenadas registradas para
`white` e `tan` estavam erradas: repetiam o tijolo marrom ou apontavam para transparência.
Como regra, só a parede **norte** tem face alta; laterais/sul são finas (igual aos
`escritorio/designs/`). A exceção atual são os dois escritórios: a parede sul recebe a mesma
composição branca de dois tiles somente para embutir corretamente a porta deslizante de 32 px.

**Pisos** (todos seamless): `rb_13_9` madeira/tan · `rb_10_9` cinza · `rb_10_7` cinza claro ·
`rb_13_11` terracota.

### 3.3 Modern Exteriors — coordenadas verificadas

| Item | Arquivo (em `exteriores/singles/`) | Medida |
|---|---|---|
| **Grama fill** ⭐ | `ME_Singles_Terrains_and_Fences_16x16_Grass_1_22` | 16×16, **seamless** |
| Grama tufos | `..._Grass_1_9` | 16×16 (espalhar por cima) |
| ⚠️ Grama **errada** | `..._Grass_1_5` | tem **borda** (peça de canto, não fill) |
| Árvores | `ME_Singles_Camping_16x16_Tree_N` | 64×64 |
| Arbustos | `ME_Singles_Garden_16x16_Bush_N` | 16×16 |
| **Portão** ⭐ | `ME_Singles_Garden_16x16_Gate_4` | **64×32** (duplo, ornamentado). Gate_1/2 = 48×32 |
| Portão metálico externo | `animados/Animated_sheets_16x16/Railing_Gate_1.png` | folha 1120×48, **14 frames de 80×48**; frame 0 fechado, frame 6 aberto |
| Cancelas de veículos | `ME_Singles_Police_Station_16x16_Automatic_Barrier_1..4` | horizontais 80×32; verticais 32×80 |
| Cerca modular de metal | `24_Additional_Houses_Fence_2_*` | 13 peças; módulos 16×16 e passagem 48×16 |
| Cerca modular metal/madeira | `24_Additional_Houses_Fence_4_*` | 13 peças; módulos 16×16 e passagem 48×16 |
| Cerca-viva | `..._Grass_Wall_1_2` (topo) + `..._Grass_Wall_1_8` (miolo) | 16×16 cada |
| Fonte | `ME_Singles_Garden_16x16_Fountain_1_1` | 32×48 |
| Banco | `..._Big_Bench_Horizontal` | 48×16 |
| Flores | `..._Big_Sunflower`, `..._Big_Red_Flower` | 16×32 |
| **Prédio LIME CORP** | `ME_Singles_Office_16x16_Example_1` | 192×304 (12×19 tiles) |
| **Prédio G-NERIC CORP** ⭐ | `ME_Singles_Office_16x16_Example_2` | 304×288 (19×18 tiles) |
| Placas | `..._Building_Sign_1` (LIME) / `_2` (G-NERIC) | 112×16 — **vêm com texto, não há versão em branco** |

**Regra da cerca-viva que funciona:** *se não tem hedge acima ⇒ peça de topo; senão ⇒ miolo.*

**Dentro do `Example_2` (G-NERIC CORP), coordenadas locais medidas na régua:**
- **Porta:** `(80, 256)`, tamanho 48×32
- **Placa:** `(54, 238)`, tamanho 112×16

### 3.4 Porta de escritório animada ⚠️ (o erro que mais custou)
`exteriores/animados/Animated_sheets_16x16/Office_Door_1_16x16.png` — folha 672×32

- ⚠️ **Frames são 48×32 ⇒ 14 frames.** Fatiar em 32×32 (21 frames) **embaralha tudo** — a porta
  "escorrega" e pisca. Foi exatamente o bug que apareceu.
- **frame 0 = fechada · frame 8 = ABERTA · frame 13 = fechada** (a folha é um ciclo completo)
- **Correto:** animar `0→8` e **SEGURAR** em 8. Fechar = `8→0` (reverso).
  Tocar `0→20` faz a porta abrir e fechar sozinha.

### 3.5 Telhado (só se voltar a usar roof-reveal)
- **Superfície seamless:** crop **(0,48) 16×16** de `ME_Singles_Office_16x16_Roof_Middle_Modular`
  (o crop em y=32 tem faixas escuras — não serve)
- Peças: `Roof_Left` 32×80 · `Roof_Middle_Modular` 48×80 · `Roof_Right` 32×80 (ladrilham na horizontal)
- Props: `Air_Duct_1/2` 32×32 · `Solar_Panel` 32×48 · `Shutter_Dish` 48×64 · `Roof_Stairs` 48×80 ·
  `Cabin_Entrance` 32×64

### 3.6 Placa TOOQ (feita à mão) ✅
As placas do pack **vêm com texto** e as letras **T, Q, B, S não existem** em nenhuma delas. Então
foi construída do zero:
- **Paleta extraída da placa original:** fundo `#6C6E85` · letras `#E2F2F3` · bisel `#BAD2E0` ·
  contorno `#3A3A50` · brilho do topo `#7C7F96`
- **Fonte pixel 7×9** desenhada à mão; a versão atual usa somente T, O e Q.
- **Prontos e versionados:** `client-web/assets/world/sign_tooq.png` (112×16) e
  **`client-web/assets/world/office_tooq.png`** = o `Example_2` com a placa TOOQ colada em (54,238)

---

## 4. Assets versionados (`client-web/assets/`)

Organizados em subpastas. O cliente multi-cena usa `chars/`, `tiles/`, `floors/`, `furniture/`,
`animations/` e `world/`; somente os recortes necessários ao runtime são versionados.

| Pasta / arquivo | O que é |
|---|---|
| **`chars/`** `Adam_run.png`, `Adam_idle_anim.png` | Personagem (24 frames de 16×32) |
| **`chars/Adam_sit.png`** | Pose sentada (12 frames de 32×32; ver §3.1) |
| **`character/`** `catalog.json` + 23 PNGs | Avatar modular: corpos, olhos, roupas, cabelos e acessórios |
| **`equipment/`** `catalog.json` | Slots, itens, velocidades, poses e camadas dos equipamentos |
| **`tiles/`** `room_builder.png` | Room builder do Office (256×224) — paredes e estrutura |
| **`floors/`** `floor_wood/carpet/cream/sage/water.png` | Pisos lisos (Modern Interiors) — ver §3.2 |
| **`furniture/office/`** `of_1..of_339.png` | Os 339 móveis do Office Revamped (§4.1) |
| **`world/`** `office_tooq.png` ⭐ | **Fachada da sede TOOQ** (304×288) |
| **`animations/`** `coffee-steam.png` | Café com vapor, 6 frames de 16×16; metadados em `catalog.json` |
| `world/sign_tooq.png` | Placa TOOQ avulsa (112×16) |
| `world/office_generic.png`, `world/office_lime.png` | Prédios originais do pack (referência) |
| `world/office_door.png` | Porta animada (672×32 — **frames 48×32**) |
| `world/grass.png`, `world/grass_detail.png` | Grama fill + tufos |
| `world/gate.png`, `world/hedge_top.png`, `world/hedge_fill.png` | Portão + cerca-viva |
| `world/gates/garden_gate_1..4.png` | Família completa de portões externos; 1–3 = 48×32, 4 = 64×32 |
| `world/gates/railing_gate_open/closed.png` | Estados estáticos auditados do portão metálico de 80×48 |
| `world/gates/automatic_barrier_1..4.png` | Cancelas externas nas quatro orientações do pack |
| `world/fences/metal_*.png` | Família modular de cerca metálica cinza: 13 peças |
| `world/fences/wood_metal_*.png` | Família modular metal/madeira: 13 peças |
| `world/roads/*.png` ⭐ | Ruas e calçadas: 34 tiles de 16×16 — ver §4.3 |
| `world/fountain.png`, `world/bench.png`, `world/flower1/2.png` | Jardim |
| `world/tree1/2.png`, `world/bush1/2.png` | Vegetação |
| `world/roof.png`, `world/rp_*.png` | Telhado seamless + props (dutos, painel solar, antena, escada) |
| `world/house_country.png`, `world/house_japanese.png` | Casas completas (não usadas no plano atual) |

### 4.1 Móveis do Office (`furniture/office/of_N.png`) — IDs conferidos

Os 339 são fatias de `LimeZu/escritorio/singles/` (arquivo
`Modern_Office_Singles_N.png` → `of_N`). Vistos na paleta do editor com thumbnail. IDs já conferidos
visualmente (o resto ainda não foi catalogado peça a peça):

| Peça | ID | Obs |
|---|---|---|
| Monitor duplo | `of_227` | vista de cima |
| Monitor simples | `of_285` | |
| Estações com computador | `of_225`, `of_227`, `of_229`, `of_231`, `of_233`, `of_235` | conjuntos compactos com monitor/CPU |
| Mesas em L para estação | `of_300` (bege), `of_305` (cinza) | base usada no `Office_Design_2` |
| Equipamento completo de estação | `of_317`, `of_318`, `of_319` | monitor, CPU, teclado e objetos; sobrepor à mesa |
| Estações de café | `of_320`, `of_321`, `of_322` | máquinas e utensílios sobre bancada |
| Cadeiras de estação | `of_306`, `of_307`, `of_315`, `of_316` | variantes laranja/cinza, usadas atrás das mesas |
| Cadeira (topo) | `of_286`, `of_287` | vista de cima |
| Cadeira (lado) | `of_277`, `of_278` | |
| Mesa em L | `of_260`, `of_265`, `of_291` | estações de trabalho |
| Vaso de planta | `of_98`, `of_99`, `of_100` | detectados por pixel verde |
| Poltronas individuais | `of_196`, `of_197`, `of_198`, `of_199` | usadas no lounge do `Office_Design_1` |

⚠️ **Não chute IDs de móvel.** Já erramos várias vezes achando que `of_115/118/120` eram
cadeiras/plantas (são clipboard/teclado/monitor). Confirme pela thumbnail no editor antes de usar.

### 4.2 Animações versionadas

- `anim_coffee` usa `assets/animations/coffee-steam.png`: **96×16**, 6 frames de **16×16**,
  4 fps e loop contínuo.
- `coffee-steam-preview.png` é somente a miniatura estática da paleta do Tiled.
- `assets/animations/catalog.json` é lido tanto pelo preload do Phaser quanto pelo gerador de
  tilesets; novos itens animados devem ser cadastrados ali.
- `interior_glass_door` veio de
  `LimeZu/interiores/animados/spritesheets/animated_door_glass_double.png`: **256×48**, 8 frames de
  **32×48**. Foi auditada, mas não é usada nas salas porque as folhas articuladas ocupam muito
  espaço visual.
- `interior_door_glass_double` é a **mesma folha**, agora usada de verdade: é a porta da sala de
  reunião. A faixa de frames saiu de medir a **área opaca** de cada um — a folha é simétrica
  (928, 868, 752, 610, **182**, 610, 752, 868), então `0..4` abre e o resto é o espelho; o motor
  toca ao contrário para fechar.
- `interior_door_wood` veio de `animated_door_1.png`: **80×32**, 5 frames de **16×32**, porta comum.
- Trocar uma porta de 32 para 48 px de altura é seguro: a origem da porta é **centro-inferior**, a
  base fica no lugar e a porta só sobe mais na parede.
- `coffee_cup` é **desenhada aqui**, não vem de pack: **48×16**, 3 frames de **16×16**, xícara com
  vapor. É item de mão, não mobília, então não entra em `map.assets` — o `preload` e a criação da
  animação pedem por nome, como o fone. Não confundir com `anim_coffee`, que é a **máquina**.
- `interior_sliding_door` veio de `animated_door_sliding_glass.png`: **448×32**, 14 frames de
  **32×32**. Frame 0 = fechada, frame 6 = aberta, frame 13 = fechada novamente. É a porta interna
  escolhida; as folhas ficam recolhidas nas laterais do vão. A entrada externa continua usando
  `office_door`. No runtime a porta interna usa `0→6` ao aproximar, `6→0` ao afastar e a colisão do
  vão acompanha esse ciclo.

### 4.3 Acesso vertical do Campus v2

- `client-web/assets/architecture/limezu_elevator_door.png`: spritesheet LimeZu **448×32**, 14
  frames de 32×32. Origem:
  `LimeZu/interiores/animados/spritesheets/animated_elevator_door_entrance_1.png`.
- `client-web/assets/architecture/limezu_stairs_wood.png`: escada interna LimeZu **48×64**.
  Origem:
  `LimeZu/interiores/singles/Theme_Sorter/17_Visibile_Upstairs_System_16x16.png`
  (recorte sem a barra de demonstração do catálogo).
- Não redesenhar esses elementos com `Phaser.Graphics`: corrimão, degraus e portas já estão
  resolvidos nos sprites originais. `VerticalAccessMechanic.js` carrega e posiciona os dois assets.
- `visualX`/`visualY` posicionam o sprite na parede. O retângulo da entidade começa exatamente na
  base visual e avança para o corredor: ele é o sensor de `E`, nunca o volume ocupado pela arte.
  O elevador ainda desenha uma cabine escura atrás da folha e conserva a parede sólida do mapa.

### 4.4 Footprints físicos

- A fonte de verdade para móveis é `client-web/assets/furniture/catalog.json`.
- Os sprites de 32×48 usam centro-inferior, mas vários objetos ocupam apenas a metade esquerda da
  imagem. Por isso poltronas, cadeiras e plantas usam `collisionX=-0.5`; usar `0` desloca a caixa
  um tile para a direita.
- A colisão cobre somente a base/pés visíveis. Não prolongar a caixa abaixo do último pixel opaco:
  isso cria paredes invisíveis e invade a pose sentada.
- `tools/sync-furniture-collisions.mjs` aplica o catálogo a todos os TMJs. Execute após calibrar um
  footprint; o script é idempotente.

### 4.5 Receita de estação usada no mapa

Uma estação coerente com o `Office_Design_2` é composta por três objetos na mesma área:

1. mesa `of_300` ou `of_305`, com footprint de 3×0,8 tiles;
2. equipamento `of_317`, `of_318` ou `of_319`, na mesma âncora e sem colisão adicional;
3. cadeira `of_306`, `of_307`, `of_315` ou `of_316`, um ou dois tiles abaixo.

O computador deve ser criado depois da mesa para ficar visualmente por cima. A cadeira permanece
sem colisão para não prender o avatar em corredores estreitos.

### 4.5.1 IDs com interação no inventário persistente

`GameInventorySeed.cs` transforma estes recortes em definições de item. O comportamento não fica no
renderer; ele chega ao cliente como `InteractionType`:

| Interação | IDs atuais | Comportamento |
|---|---|---|
| `kanban` | `of_171` | Abre o quadro e permite escolher a atividade ativa. |
| `chest` | `of_176` | Guarda e retira instâncias; **placeholder visual de baú**. |
| `workstation` | `of_225`, `227`, `229`, `231`, `233`, `235`, `317`, `318`, `319` | Inicia/encerra horas de uma atividade. |
| `seat` | `of_196`–`199`, `306`, `307`, `315`, `316` | Senta no próprio assento e reserva a cadeira via claim de rede. |
| `coffee` | `of_320`–`322` | Tira um café da bancada; a xícara é consumida sentado ou expira em pé. |

Ao trocar um asset interativo, atualize juntos `assets/furniture/catalog.json`,
`GameInventorySeed.cs` e esta tabela. Não use o ID visual como regra de negócio dentro de
`main.js` ou `MapRenderer.js`.

### 4.6 Equipamentos de locomoção

A busca nos packs LimeZu por skate, patins, patinete/scooter, moto e bicicleta não encontrou sprites
pessoais compatíveis; o pack `Vehicles` contém carros, ônibus, barcos e veículos grandes. Para não
confundir esses assets com os itens pedidos, a primeira versão desenha os quatro veículos como pixel
art procedural no Phaser. O único recorte novo do pack é `Adam_sit.png`, auditado acima. Quando
sprites dedicados forem adquiridos, eles podem substituir o desenho sem alterar o catálogo de
velocidade nem a interação por Shift. O catálogo atual oferece **dois modelos de cada base visual**
(skate, patins, patinete e moto); as variantes reutilizam a geometria procedural e mudam paleta,
velocidade, raridade e preço.

### 4.7 Fachadas e casas do mundo

| Asset | Medida | Footprint no `world` |
|---|---:|---:|
| `office_tooq.png` | 304×288 px | 19×18 tiles |
| `office_generic.png` | 304×288 px | 19×18 tiles |
| `office_lime.png` | 192×304 px | 12×19 tiles |
| `house_country.png` | 288×256 px | 18×16 tiles |
| `house_japanese.png` | 240×240 px | 15×15 tiles |

Esses sprites usam origem esquerda/inferior (`originX=0`, `originY=1`). A colisão externa cobre
toda a caixa acima da base; não use somente uma faixa nos pés nem abra um corredor físico na porta.
O sensor do portal fica sobre a borda inferior externa e é acionado pelo pé do avatar.

---

### 4.8 Ruas e calçadas (`world/roads/*.png`)

Origem: `LimeZu/exteriores/theme-sorter/2_City_Terrains_Singles_16x16/`, famílias
`Asphalt_1_Variation_*` e `Sidewalk_1_*` (das seis variações de calçada do pack, foi recortada só a
**Sidewalk_1**). Todos os 34 tiles são **16×16** e ficam no tileset
`tiled/tilesets/palette-roads.tsj` (`09 · Ruas e calçadas`), já referenciado por `world.tmj`.

| Grupo | Arquivos | Origem |
|---|---|---|
| Asfalto | `asphalt`, `asphalt_2..4` | `Asphalt_1_Variation_21/16/20/23` — 21 é a variação mais lisa, as outras têm trinca/remendo |
| Marcações | `mark_line_h/v`, `mark_line_h_2/v_2`, `mark_dash_h/v`, `mark_corner_1..4`, `mark_tee_1..4`, `mark_cross` | `Asphalt_1_Variation_1..15` |
| Calçada e meio-fio | `sidewalk`, `curb_top/bottom/left/right`, `curb_bend_tl/tr/bl/br`, `curb_gutter_1/2` | `Sidewalk_1_9/6/2/4/8/13/14/12/11/19/20` |
| Faixa de pedestre | `crosswalk_h_l/h_r`, `crosswalk_v_t/v_b` | fatiados de `Sidewalk_1_30` (32×16) e `Sidewalk_1_34` (16×32) |

**Convenções conferidas pixel a pixel:**

- `curb_top` = **a calçada fica em cima** e o asfalto embaixo; o mesmo vale para os outros três.
- `curb_bend_tl` = a calçada ocupa o **quadrante superior esquerdo**. As quatro `bend` são
  esquinas arredondadas de cruzamento, não cantos de um quarteirão isolado — usadas como canto
  externo de um bloco solto elas curvam para o lado errado.
- ⚠️ **As 15 marcações têm 2 px de margem transparente em cada lado** (a arte ocupa só x/y 2..13).
  Pintadas em sequência elas produzem uma linha **tracejada**, nunca contínua. Servem para divisória
  de faixa e vaga de estacionamento; não existe linha central sólida neste pack.
- Os `assetId` levam prefixo `road_` (ex.: `road_asphalt`), e **os 34 estão listados em
  `ROAD_SURFACES` no [`MapRenderer.js`](client-web/src/MapRenderer.js)** — sem isso, um único tile
  de rua na camada de chão derruba o batching de toda a camada.

---

### 4.9 Interiores: paredes, pisos e móveis de cômodo

Importados de `LimeZu/interiores/singles/` para dar variedade de acabamento e mobília além do
escritório. Os móveis vêm dos **singles já recortados pelo pack** (`Theme_Sorter_Singles`, variante
com sombra — a mesma dos `of_N`), copiados byte a byte.

**Construção — tilesets em folha**, pintados com o pincel:

| Paleta | Arquivo | Grade | Origem |
|---|---|---|---|
| `10 · Interiores · Paredes` | `tiles/interior_walls.png` | 32×40 = 1280 tiles | `Room_Builder_Walls_16x16.png` — ~48 estilos de parede |
| `11 · Interiores · Pisos` | `tiles/interior_floors.png` | 15×40 = 600 tiles | `Room_Builder_Floors_16x16.png` — ~60 padrões |
| `12 · Interiores · Vãos e arcos` | `tiles/interior_entryways.png` | 10×32 = 320 tiles | `Room_Builder_Arched_Entryways_16x16.png` |

**Mobília — coleções de imagens**, colocadas como objeto em `Objetos · Móveis`:

Os quatro temas foram **consolidados** no tileset único de móveis
(`tiled/tilesets/tileset-moveis.tsj`), depois dos 339 `of_N` do Office e do `anim_coffee` — na ordem
abaixo. Os `.tsj` por tema e o antigo `palette-interior-furniture.tsj` foram removidos do disco;
tudo é carregado a partir do `tileset-moveis.tsj`:

| Pasta | Itens | `assetId` | Origem |
|---|---:|---|---|
| `furniture/living-room/` | 122 | `lr_N` | `2_Living_Room_Singles` |
| `furniture/bathroom/` | 159 | `bt_N` | `3_Bathroom_Singles` |
| `furniture/kitchen/` | 408 | `kt_N` | `12_Kitchen_Singles` |
| `furniture/conference/` | 68 | `cf_N` | `13_Conference_Hall_Singles` |

As estações compostas (`station_*`) e a xícara vêm depois, no fim do mesmo tileset.

O `N` preserva a numeração do pack, então dá para voltar ao arquivo de origem. Peças chegam a 32×64;
a origem é o centro inferior (`objectalignment: bottom`), como nos demais móveis.

**Faixas de GID** (seguindo o espaçamento de `FIRST_GID` no conversor): paredes 300000, pisos 310000,
vãos 320000, lounge 400000, banheiro 410000, copa 420000, reunião 430000. Registradas em
`tooq-office-1.tmj`.

⚠️ **Não pinte piso de interior na camada `Pincel · Chão e ruas`.** O agrupamento em faixas exige que
**todas** as células da camada sejam pisos simples sem `frame`; tile de folha sempre tem `frame`, então
um único deles derruba a otimização da camada inteira — num mapa grande isso vira dezenas de milhares
de sprites. Use `Pincel · Desenho livre` (profundidade −85, acima do chão em −100): o visual é o mesmo
e a camada de chão continua agrupada.

Como as paletas `gates`, `access-control`, `fences` e `roads`, estas **não** estão declaradas em
`tiled/palettes.json` — o runtime lê os tilesets direto do `.tmj`, mas o conversor legado não as
conhece.

### 4.10 Junção e vão de parede (`tiles/doorways/*.png`)

**Junção — começar uma parede lateral na parede de trás.** O `room_builder.png` tem a parede
horizontal em elevação (topo branco + face lavanda, 2 tiles) e a parede lateral como tira fina
vertical, mas **não** tem a peça de encontro entre as duas. Sem ela a tira começa solta, abaixo da
linha da base, e o encontro lê como buraco.

A parede de trás ocupa **duas linhas de tile**: a de cima (tile 177) traz o topo branco visto de
cima, a de baixo (tile 193) só a face. A parede lateral também é vista de cima, então o topo dela
precisa **fundir com o topo da parede de trás** — e isso exige peça nas duas linhas. Tratar só a
linha de baixo deixa a junção quebrada ao longo de toda a linha de cima.

| Situação | Linha de cima | Linha de baixo | Tile da lateral abaixo |
|---|---|---|---|
| Parede esquerda de sala | `wall_tee_top_right` | `wall_tee_right` | 39 (`MID_L`) |
| Parede direita de sala | `wall_tee_top_left` | `wall_tee_left` | 41 (`MID_R`) |

Na linha de cima a tira sobe até encostar no topo branco e rompe o contorno horizontal no seu miolo —
é esse rompimento que faz os dois topos lerem como uma superfície só. Na linha de baixo a tira
atravessa o tile inteiro, inclusive o contorno da base, para emendar sem quebra no tile da lateral.

Pinte as duas na camada `Pincel · Paredes` — são parede e devem colidir. O pareamento 39 na esquerda
e 41 na direita foi conferido nas divisórias do `tooq-office.tmj`.

⚠️ **As quatro peças são brancas e só fecham com a parede branca** (`rb_1_11`/`rb_1_12`). Numa parede
de pedra, tijolo ou lavanda o tee vira um talho claro no meio da faixa. Nesses estilos o encontro usa
a **quarta coluna da própria família** — `rb_3_<linha>`, a variante sem borda lateral: para a parede
branca é `356`/`388`, para a pedra `228`/`260`, para o tijolo `292`/`324`. Foi essa a regra usada nas
33 salas do `tooq-office-1.tmj`; o mesmo par serve quando a divisória **cruza** a parede horizontal
em vez de nascer nela (o caso das paredes sul das salas).

### 4.11 Estações de trabalho montadas (`furniture/stations/*.png`)

Peças **compostas**, não recortadas: mesa + itens de bancada + cadeira de costas empilhados num único
PNG de **32×64** (2×4 tiles). Todas as peças de `of_N` vêm num quadro de 32×48, então sobrepõem
alinhadas — o deslocamento só posiciona a cadeira à frente da mesa.

| Asset | Composição |
|---|---|
| `station_white_dual` | mesa clara `of_263` + monitor duplo `of_227` + cadeira `of_101` |
| `station_white_pc` | mesa clara + monitor/gabinete/teclado `of_231` + `of_101` |
| `station_white_lamp` | mesa clara + monitor e luminária `of_229` + `of_106` |
| `station_dark_dual` | mesa escura `of_268` + `of_227` + cadeira de tela `of_102` |
| `station_l_white` | mesa em L `of_264` + `of_227` + `of_101` |
| `station_l_orange` | mesa em L + `of_231` + cadeira laranja `of_107` |
| `station_gamer` | mesa em L escura `of_269` + monitor duplo em braço `of_311` + `of_101` + **fita de LED** |

⚠️ **As cadeiras do pack têm quatro poses, não variações de cor.** Comparando as imagens pixel a
pixel elas se agrupam em pares quase idênticos (diferença de ~50 px dentro do par, 174–287 entre
pares):

| Pose | Escuras | Laranja | Uso |
|---|---|---|---|
| **Encara a mesa** ✅ | `of_105` (tela), `of_106` (lisa) | `of_111` (tela), `of_112` (lisa) | pessoa sentada de frente para a mesa acima |
| De costas para a mesa ❌ | `of_101`, `of_102` | `of_107`, `of_108` | erradas para uma estação |
| De perfil | `of_103`, `of_104` | `of_109`, `of_110` | mesa encostada em parede lateral |

Medir só a silhueta **não** distingue as poses — as larguras por linha são iguais. É preciso comparar
os pixels. As sete estações usam a primeira linha da tabela.

**Mesas:** família `of_179`–`of_187` (esquerda/meio/direita em três cores, y16–36) e `of_210`–`of_224`
(cinco cores, y25–47). Já com 32 px de largura: `of_263`/`of_268` (retas) e `of_264`/`of_269` (em L).
Nem toda mesa emenda com a vizinha — só as de mesma assinatura de caixa (`of_180`, `of_183`, `of_186`).

A fita de LED da estação gamer é **desenhada**, não vem de pack: gradiente ciano→magenta com brilho
decrescente ao longo da borda frontal da mesa. O LimeZu não tem nada gamer.

Coloque em `Objetos · Móveis` com **Insert Tile** (`T`); a origem é o centro inferior, então o clique
cai nos pés da cadeira. Não têm colisão — se precisar bloquear, desenhe em `Objetos · Colisões`.

### 4.11b Peças compostas (`furniture/composites/*.png`)

Geradas por `client-web/tools/generate-furniture-composites.mjs`, que também as registra no
`tileset-moveis.tsj` (**no fim**, para não deslocar nenhum gid existente).

| Asset | Tamanho | O que é |
|---|---|---|
| `table_meeting` | 96×48 (6×3 tiles) | mesa de reunião contínua |
| `table_long` | 64×32 | mesa comprida (cozinha, mesa comunitária) |
| `table_round` | 48×32 | mesa de apoio (1×1, cantinho de café) |
| `chess_table` | 32×32 | mesa de xadrez com tabuleiro e peças |

Fora do tileset, o mesmo gerador escreve **`architecture/limezu_stairs_wood_down.png`**: a escada de
subida escurecida em direção ao topo, terminando num vão preto entre os corrimãos. Escada é
carregada pela mecânica, não pelo tileset — e sem duas artes, subir e descer ficam indistinguíveis
no mapa.

**Por que compor.** No Modern Office a mesa vem em **segmentos de 1 tile** — borda de trás
(`of_245`), miolo (`of_246`) e frente com pernas (`of_247`), repetidos a cada 5 ids em cinco cores.
Eles **encaixam sem emenda se colocados em tiles adjacentes** (colocar de 2 em 2 tiles deixa um
buraco de 16 px — foi o erro da primeira tentativa), mas cada segmento traz o próprio contorno
escuro nas colunas 0 e 15: uma fileira deles lê como "mesas encostadas", não como uma mesa. O
gerador costura as emendas (colunas 14/15/0 viram superfície) e apaga as pernas dos segmentos do
meio, deixando pé só nas pontas.

Paleta lida da própria arte, para não destoar: superfície `#d0be9c`, sombra `#caab8b`, contorno
`#3a3a50`, frente `#9c786b`, painel/pernas `#a79796`.

⚠️ **Faixa de gid.** `tileset-moveis` tinha 1104 peças e o `tileset-exterior` começava em 5187 =
4083 + 1104 — encostado. Ao acrescentar peças, os gids novos caíam no tileset vizinho e resolviam
para o asset errado **sem erro nenhum** (a peça só sumia). O exterior foi para 6000 nos mapas
gerados. Ao crescer o tileset, confira a folga.

### 4.11c Ferramentas de imagem (`tools/png.mjs` e amigos)

`tools/png.mjs` é um codec PNG completo em ~200 linhas sobre o `zlib` do Node — decodifica RGBA8,
RGB8, cinza+alfa e paleta; codifica RGBA8; e traz `blit`/`fillRect`/`setPixel` para composição.
Sem dependências, como o resto do `client-web`. Sobre ele:

- **`tools/asset-sheet.mjs <prefixo> [de] [até]`** — folha de contato de uma família do tileset, com
  o número de cada peça. O `tileset-moveis` tem 1104 assets cujo id é só um número do pack; sem ver
  a arte, escolher sofá ou geladeira é chute. Fatia curta sai com zoom maior.
- **`tools/map-preview.mjs <cena> [x y w h]`** — o mapa inteiro em PNG (piso, paredes, portas,
  móveis, props, elevador, escada e tabuleiro), com a **mesma matemática do `MapRenderer`**. É como
  a planta é conferida: o Phaser não completa o boot no navegador embutido do assistente.
- **`tools/layout-audit.mjs <cena>`** — o que o olho só pega dentro do jogo: móvel desenhado por
  cima da parede, colisões empilhadas e assento sem mesa do lado para onde encara.
- **`tools/seat-preview.mjs <asset> [pose] [direção] [seatY] [seatCover]`** — móvel + avatar
  compostos com a matemática do runtime, para calibrar o encaixe de quem senta. Usa o corpo base
  (`bodies/body_01.png`); cabelo e roupa mudam a silhueta em 1–2 px.

As saídas vão para `tools/.asset-sheets/` (ignorado pelo Git).

**Descobertas úteis do pack** (vistas nas folhas): sofás modernos `of_200`/`of_205` e poltronas
laterais `of_204`/`of_206`; mesas de centro `of_190`/`of_193`; estantes `of_194`/`of_195`; divisória
de vidro `of_207`–`of_209`; TV `of_116`; impressoras `of_147`–`of_152`. Cozinha: geladeiras
`kt_158`–`kt_161`, pias `kt_141`–`kt_146`, fogão/bancada `kt_192`–`kt_194`, armários `kt_121`/
`kt_122`. O tema `13_Conference_Hall` (`cf_*`) é **palco e cortina**, não sala de reunião — não
procure mesa de reunião ali.

### 4.12 Vão de parede (`tiles/doorways/doorway_*.png`)

Peça **montada**, não recortada de pack: as seis peças de `17 · Interiores · Vãos de parede` foram
compostas a partir das cores exatas dos tiles 177 (topo) e 193 (face) do `room_builder.png`, para
fecharem com a parede norte do prédio.

O problema que ela resolve: um buraco na camada de parede deixa o piso aparecer, e a abertura lê como
piso subindo, não como passagem. A peça devolve a leitura de vão — o topo branco da parede atravessa
a abertura, e por baixo fica um recuo em sombra com batentes escuros nas laterais, dissolvendo no
chão.

| Arquivo | Papel |
|---|---|
| `doorway_top_l/m/r` | linha da verga: contorno, 4 px de topo branco, contorno, sombra |
| `doorway_bottom_l/m/r` | passagem: sombra dissolvendo até transparente |

Os sufixos `l`/`r` trazem o batente de 2 px na borda que encosta na parede; `m` é o miolo. A sombra é
preta com alfa decrescente, então a peça funciona sobre qualquer piso.

⚠️ **Pinte em `Pincel · Desenho livre`, nunca em `Pincel · Paredes`.** A camada de parede gera colisão
a partir de cada tile pintado — o vão voltaria a ser bloqueado. O desenho livre não tem colisão e fica
em −85, acima do chão (−100) e abaixo da parede (−80).

Serve só para a **parede norte**, que usa a arte em elevação. As outras três usam a parede fina
esquemática (banda de 6 px no sul, 7 px nas laterais) e precisariam de peças próprias.

---

## 5. Receita: como recortar um asset novo

1. **Ache pelo nome** em `LimeZu/exteriores/singles/` (`ls | grep -i <coisa>`). É mais rápido que caçar
   célula em folha grande.
2. **Confira o tamanho** antes de usar: `file arquivo.png | grep -oE "[0-9]+ x [0-9]+"`.
3. **Renderize ampliado e OLHE** antes de codar. Nunca assuma a grade — foi assim que descobrimos
   que a porta era 48px e não 32.
4. **Copie pra `assets/`** com um nome curto e versione.
5. **Atualize a paleta do Tiled:** `node client-web/tools/tiled-converter.mjs assets`.

**Ferramenta:** PowerShell + `System.Drawing` (não precisa instalar nada).

```powershell
Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Image]::FromFile($src)
# ⚠️ GOTCHA: multiplicação dentro de New-Object Rectangle vira Object[] e explode.
# SEMPRE pré-compute em [int]:
[int]$w=$cols*$tile; [int]$h=$rows*$tile
$dst=New-Object System.Drawing.Rectangle(0,0,$w,$h)
$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor  # pixel art!
```

**Outro gotcha:** array 2D `$a[$y,$x]` no PowerShell se comporta mal → use hashtable com chave `"x,y"`.

---

## 6. Referências visuais (o alvo de qualidade)

- **`LimeZu/escritorio/designs/Office_Design_1.gif`** ⭐ — sala de escritório
  pronta, feita pela LimeZu. É o padrão a atingir: paredes brancas finas, parede norte de tijolo com
  decoração pendurada, piso de tile, mesas com tampo. **Extraia o 1º frame e compare.**
- `LimeZu/interiores/home-designs/` — salas prontas de outros temas.

---

## 7. Pendências de assets

- **Decoração de parede** (quadros, TV, troféus) na parede 3D de tijolo — **nunca foi feita**, e é
  pedido explícito do usuário.
- **Catalogar os 339 móveis** — só um punhado tem ID confirmado (§4.1); o resto é escolhido pela
  thumbnail no editor. Um índice peça→nome completo ajudaria a mobiliar mais rápido.
- **Ancoragem de móveis multi-tile** no editor (bug conhecido — ver `client-web/README.md`).
- **Character Generator / Portrait Generator** — o usuário opera os `.exe` pra gerar premades do time
  e retratos; depois é só importar.
- **Identidade visual da Tooq** — a placa está no cinza corporativo do pack. Se a Tooq tem paleta,
  dá pra tingir placa e detalhes.
