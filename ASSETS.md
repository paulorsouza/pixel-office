# ASSETS — onde está tudo e o que já foi explorado

**Atualizado:** 2026-07-17

Este doc responde três perguntas: **onde estão os assets**, **o que tem em cada pack**, e
**o que já mapeamos** (as coordenadas/medidas que custaram caro pra descobrir).

---

## 1. Política de versionamento

| | Onde | No git? |
|---|---|---|
| **Packs crus** (LimeZu, ~1,3 GB) | `C:\Users\prs\Claude Sessions\LimeZu\` (**fora do repo**) | ❌ Não |
| **Assets recortados** (o que o cliente carrega) | `client-web/assets/` (~1 MB) | ✅ Sim |

**Por quê:** os packs são comprados, **nunca mudam** e são **re-baixáveis do itch.io** com a conta de
vocês. Versionar 34 mil arquivos deixaria o git lento sem ganho — 95% deles (praia, cemitério, base
militar, metrô…) nunca serão usados num escritório. O que o jogo **precisa pra rodar** está
versionado.

> ⚠️ **Se a pasta `LimeZu/` sumir:** rebaixe os packs no itch.io (Modern Interiors, Modern Office
> Revamped, Modern Exteriors, Modern UI). O que **não** dá pra rebaixar é o que está no repo —
> por isso os recortes estão versionados.

---

## 2. Os packs (comprados) — `C:\Users\prs\Claude Sessions\LimeZu\`

| Pack | Pasta | Peso | Pra quê |
|---|---|---|---|
| **Modern Exteriors** ⭐ | `modernexteriors-win` | 233 MB | Grama, árvores, prédios, portões, cercas, jardim, ruas. **6.225 singles** |
| **Modern Interiors** | `moderninteriors-win` | 156 MB | Interiores, personagens, Character Generator, objetos animados |
| **Modern Office Revamped** | `Modern_Office_Revamped_v1.2` | 3 MB | Room builder de escritório + **339 móveis** + `6_Office_Designs` (referência) |
| **Modern UI** | `modernuserinterface-win` | 5 MB | Ícones/molduras pixel |
| Character Generator 2.0 | `Character Generator 2.0 Linux Build` | 217 MB | `.exe` — **o usuário opera** pra gerar premades/bots |
| Portrait Generator | `Portrait_Generator_1.5.0_Linux_Build` | 89 MB | `.exe` — retratos dos personagens |
| _(não usados)_ | `Modern_*_RPG_Maker_*`, `Fantasy Battlers`, `Fungus Cave` | 17 MB | Versões RPG Maker / packs de outro estilo |

### Regra de ouro
**Use SEMPRE a versão 16×16.** A arte é autorada em 16px; as pastas `32x32` e `48x48` são upscale e
só ocupam espaço (182 MB no Exteriors sozinho).

### Estrutura útil dentro dos packs

```
modernexteriors-win/Modern_Exteriors_16x16/
├── Modern_Exteriors_Complete_Singles_16x16/   ← 6.225 PNGs com NOME DESCRITIVO (mais fácil de usar)
├── ME_Theme_Sorter_16x16/                     ← folhas grandes por tema (16_Office, 17_Garden, 1_Terrains_and_Fences…)
├── Animated_16x16/Animated_sheets_16x16/      ← 456 spritesheets animadas (portas, veículos…)
└── Autotiles_16x16/

moderninteriors-win/
├── 1_Interiors/16x16/                         ← room builders e temas de interior
├── 2_Characters/Character_Generator/          ← partes modulares (Bodies/Eyes/Outfits/Hairstyles/Accessories)
├── 3_Animated_objects/16x16/                  ← impressora, café, monitores…
└── 6_Home_Designs/                            ← salas prontas (referência visual)

Modern_Office_Revamped_v1.2/
├── 1_Room_Builder_Office/Room_Builder_Office_16x16.png   ← 256x224 = grade 16x14
├── 2_.../singles                                          ← 339 móveis de escritório
└── 6_Office_Designs/Office_Design_1.gif                   ← ⭐ A REFERÊNCIA DE QUALIDADE
```

**Dica que economiza tempo:** os `Complete_Singles` têm nomes descritivos
(`ME_Singles_Garden_16x16_Gate_4.png`). Procurar por nome ali é muito mais rápido que caçar célula
nas folhas grandes.

---

## 3. ✅ O QUE JÁ FOI EXPLORADO E MEDIDO

Tudo abaixo foi **renderizado e conferido visualmente**. **Não chute de novo** — use estes valores.

### 3.1 Personagens (Modern Interiors)
- Folha: **384×32** = **24 frames de 16×32**
- **Ordem: `right(0-5), up(6-11), left(12-17), down(18-23)`** ⚠️ verificado nos pixels
  (o `docs/HANDOFF.md` e o histórico dizem `down/up/left/right` — **ERRADO**)
- Velocidades: run ~10-12 fps · idle ~4.5-5 fps
- Personagens: Adam, Alex, Amelia, Bob × (run / idle_anim / sit)

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

**Parede NORTE 3D** (com volume, decorável com quadros/troféus) — 2 tiles de altura:
```
rb_1_9    ← topo branco + tijolo
rb_1_10   ← tijolo + rodapé
```
Variantes: `rb_5_9`+`rb_5_10` (tan B) · `rb_8_9`+`rb_8_10` (branco).
Só a parede **norte** tem face alta; laterais/sul são finas (igual aos `6_Office_Designs`).

**Pisos** (todos seamless): `rb_13_9` madeira/tan · `rb_10_9` cinza · `rb_10_7` cinza claro ·
`rb_13_11` terracota.

### 3.3 Modern Exteriors — coordenadas verificadas

| Item | Arquivo (em `Complete_Singles_16x16/`) | Medida |
|---|---|---|
| **Grama fill** ⭐ | `ME_Singles_Terrains_and_Fences_16x16_Grass_1_22` | 16×16, **seamless** |
| Grama tufos | `..._Grass_1_9` | 16×16 (espalhar por cima) |
| ⚠️ Grama **errada** | `..._Grass_1_5` | tem **borda** (peça de canto, não fill) |
| Árvores | `ME_Singles_Camping_16x16_Tree_N` | 64×64 |
| Arbustos | `ME_Singles_Garden_16x16_Bush_N` | 16×16 |
| **Portão** ⭐ | `ME_Singles_Garden_16x16_Gate_4` | **64×32** (duplo, ornamentado). Gate_1/2 = 48×32 |
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
`Animated_16x16/Animated_sheets_16x16/Office_Door_1_16x16.png` — folha 672×32

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

### 3.6 Placa TOOQ BMS (feita à mão) ✅
As placas do pack **vêm com texto** e as letras **T, Q, B, S não existem** em nenhuma delas. Então
foi construída do zero:
- **Paleta extraída da placa original:** fundo `#6C6E85` · letras `#E2F2F3` · bisel `#BAD2E0` ·
  contorno `#3A3A50` · brilho do topo `#7C7F96`
- **Fonte pixel 7×9** desenhada à mão (T, O, Q, B, M, S)
- **Prontos e versionados:** `client-web/assets/world/sign_tooq.png` (112×16) e
  **`client-web/assets/world/office_tooq.png`** = o `Example_2` com a placa TOOQ BMS colada em (54,238)

---

## 4. Assets versionados (`client-web/assets/`)

Organizados em subpastas. O cliente atual (interior orientado a dados) usa `chars/`, `tiles/`,
`floors/` e `furniture/`; `world/` é o mundo externo (fachada/jardim/telhado), guardado mas ainda
não plugado.

| Pasta / arquivo | O que é |
|---|---|
| **`chars/`** `Adam_run.png`, `Adam_idle_anim.png` | Personagem (24 frames 16×32) |
| **`tiles/`** `room_builder.png` | Room builder do Office (256×224) — paredes e estrutura |
| **`floors/`** `floor_wood/carpet/cream/sage/water.png` | Pisos lisos (Modern Interiors) — ver §3.2 |
| **`furniture/office/`** `of_1..of_339.png` | Os 339 móveis do Office Revamped (§4.1) |
| **`world/`** `office_tooq.png` ⭐ | **Fachada da sede TOOQ BMS** (304×288) |
| `world/sign_tooq.png` | Placa TOOQ BMS avulsa (112×16) |
| `world/office_generic.png`, `world/office_lime.png` | Prédios originais do pack (referência) |
| `world/office_door.png` | Porta animada (672×32 — **frames 48×32**) |
| `world/grass.png`, `world/grass_detail.png` | Grama fill + tufos |
| `world/gate.png`, `world/hedge_top.png`, `world/hedge_fill.png` | Portão + cerca-viva |
| `world/fountain.png`, `world/bench.png`, `world/flower1/2.png` | Jardim |
| `world/tree1/2.png`, `world/bush1/2.png` | Vegetação |
| `world/roof.png`, `world/rp_*.png` | Telhado seamless + props (dutos, painel solar, antena, escada) |
| `world/house_country.png`, `world/house_japanese.png` | Casas completas (não usadas no plano atual) |

### 4.1 Móveis do Office (`furniture/office/of_N.png`) — IDs conferidos

Os 339 são fatias de `Modern_Office_Revamped_v1.2/.../4_Modern_Office_singles/16x16/` (arquivo
`Modern_Office_Singles_N.png` → `of_N`). Vistos na paleta do editor com thumbnail. IDs já conferidos
visualmente (o resto ainda não foi catalogado peça a peça):

| Peça | ID | Obs |
|---|---|---|
| Monitor duplo | `of_227` | vista de cima |
| Monitor simples | `of_285` | |
| Cadeira (topo) | `of_286`, `of_287` | vista de cima |
| Cadeira (lado) | `of_277`, `of_278` | |
| Mesa em L | `of_260`, `of_265`, `of_291` | estações de trabalho |
| Vaso de planta | `of_98`, `of_99`, `of_100` | detectados por pixel verde |

⚠️ **Não chute IDs de móvel.** Já erramos várias vezes achando que `of_115/118/120` eram
cadeiras/plantas (são clipboard/teclado/monitor). Confirme pela thumbnail no editor antes de usar.

---

## 5. Receita: como recortar um asset novo

1. **Ache pelo nome** em `Complete_Singles_16x16/` (`ls | grep -i <coisa>`). É mais rápido que caçar
   célula em folha grande.
2. **Confira o tamanho** antes de usar: `file arquivo.png | grep -oE "[0-9]+ x [0-9]+"`.
3. **Renderize ampliado e OLHE** antes de codar. Nunca assuma a grade — foi assim que descobrimos
   que a porta era 48px e não 32.
4. **Copie pra `assets/`** com um nome curto e versione.

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

- **`Modern_Office_Revamped_v1.2/6_Office_Designs/Office_Design_1.gif`** ⭐ — sala de escritório
  pronta, feita pela LimeZu. É o padrão a atingir: paredes brancas finas, parede norte de tijolo com
  decoração pendurada, piso de tile, mesas com tampo. **Extraia o 1º frame e compare.**
- `moderninteriors-win/6_Home_Designs/` — salas prontas de outros temas.

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
