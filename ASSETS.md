# ASSETS — onde está tudo e o que já foi explorado

**Atualizado:** 2026-07-17

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
  `sit`: 12 frames, apenas `right(0-5), left(6-11)`; na vertical o runtime usa `idle`.
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
- `interior_sliding_door` veio de `animated_door_sliding_glass.png`: **448×32**, 14 frames de
  **32×32**. Frame 0 = fechada, frame 6 = aberta, frame 13 = fechada novamente. É a porta interna
  escolhida; as folhas ficam recolhidas nas laterais do vão. A entrada externa continua usando
  `office_door`. No runtime a porta interna usa `0→6` ao aproximar, `6→0` ao afastar e a colisão do
  vão acompanha esse ciclo.

### 4.3 Receita de estação usada no mapa

Uma estação coerente com o `Office_Design_2` é composta por três objetos na mesma área:

1. mesa `of_300` ou `of_305`, com footprint de 3×0,8 tiles;
2. equipamento `of_317`, `of_318` ou `of_319`, na mesma âncora e sem colisão adicional;
3. cadeira `of_306`, `of_307`, `of_315` ou `of_316`, um ou dois tiles abaixo.

O computador deve ser criado depois da mesa para ficar visualmente por cima. A cadeira permanece
sem colisão para não prender o avatar em corredores estreitos.

### 4.3.1 IDs com interação no inventário persistente

`GameInventorySeed.cs` transforma estes recortes em definições de item. O comportamento não fica no
renderer; ele chega ao cliente como `InteractionType`:

| Interação | IDs atuais | Comportamento |
|---|---|---|
| `kanban` | `of_171` | Abre o quadro e permite escolher a atividade ativa. |
| `chest` | `of_176` | Guarda e retira instâncias; **placeholder visual de baú**. |
| `workstation` | `of_225`, `227`, `229`, `231`, `233`, `235`, `317`, `318`, `319` | Inicia/encerra horas de uma atividade. |
| `seat` | `of_196`–`199`, `306`, `307`, `315`, `316` | Procura uma estação a até 2,75 tiles e abre o fluxo de trabalho. |

Ao trocar um asset interativo, atualize juntos `assets/furniture/catalog.json`,
`GameInventorySeed.cs` e esta tabela. Não use o ID visual como regra de negócio dentro de
`main.js` ou `MapRenderer.js`.

### 4.4 Equipamentos de locomoção

A busca nos packs LimeZu por skate, patins, patinete/scooter, moto e bicicleta não encontrou sprites
pessoais compatíveis; o pack `Vehicles` contém carros, ônibus, barcos e veículos grandes. Para não
confundir esses assets com os itens pedidos, a primeira versão desenha os quatro veículos como pixel
art procedural no Phaser. O único recorte novo do pack é `Adam_sit.png`, auditado acima. Quando
sprites dedicados forem adquiridos, eles podem substituir o desenho sem alterar o catálogo de
velocidade nem a interação por Shift.

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
