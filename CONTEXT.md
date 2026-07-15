# CONTEXT — Cliente do jogo (Office Quest / Tooq)

**Escrito em:** 2026-07-15, no fim de uma sessão longa que **desandou**.
**Para:** a próxima sessão, que vai **recomeçar o cliente do zero**.
**Objetivo deste doc:** entregar os **fatos verificados** (que custaram caro) e ser honesto sobre
**o que deu errado**, pra não repetir.

> Leia a seção **"O que deu errado"** ANTES de escrever qualquer código. O problema não foi
> técnico — foi de método.

---

## 1. O produto (não mudou)

Escritório virtual estilo **Gather.town** para a **Tooq**: pessoas ficam logadas o dia todo,
com avatar, andando por um escritório 2D top-down, com chat de proximidade, A/V (LiveKit),
integração com tasks/timer de horas e gamificação.

**O ponto central que eu perdi de vista:** as pessoas passam o dia **DENTRO do escritório**.
O interior mobiliado **é o produto**. Fachada, telhado, jardim e mundo externo são cenário.
Eu gastei a sessão inteira no cenário e **nunca mobiliei o interior**.

---

## 2. O que EXISTE e funciona (não mexer, reaproveitar)

| Peça | Onde | Estado |
|---|---|---|
| **Backend C#** | `virtual-office/backend/VirtualOffice.Api` | ✅ Sólido. ASP.NET + EF/SQLite + SignalR. Porta **5210**. Rodar via `bin\Debug\net10.0\VirtualOffice.Api.dll` (o `dotnet run` detached não persistia) |
| **App web (React/JS)** | `backend/.../wwwroot` | ✅ Kanban, sprints, horas, relatórios, perfil. Sem build (ES modules) |
| **LiveKit** | `virtual-office/livekit/` | ✅ SFU self-hosted, porta 7880. Token só se `Presence.InMeeting` |
| **Contrato de mapa** | `OfficeLayout.cs` (backend) | Server units = **28/tile** |
| **Cliente Unity** | `virtual-office/office-unity` | ⏸️ Pausado. F1 (import de arte) concluída e verificada. Ver `office-unity/PROXIMA_SESSAO.md` |
| **POC web (Phaser)** | `virtual-office/web-client-poc` | ⚠️ Funciona mas é **descartável** — ver seção 6 |

---

## 3. Decisão de engine: **web (Phaser)** — e por quê

O usuário perguntou se Unity era a melhor escolha. Resposta honesta que demos e **continua válida**:

- **O produto é "entrar por link"** (um colega abre a URL e está dentro). Unity **não faz isso**
  com esta stack: WebGL foi descartado porque `MiniSignalR` (ClientWebSocket+threads) e o SDK
  ffi do LiveKit **não rodam em WebGL**. Unity ⇒ download de app desktop.
- **O ciclo de trabalho na web é incomparável**: dá pra rodar, ver no navegador, clicar,
  printar e corrigir em segundos. O loop cego do Unity foi a causa raiz de meses de dor
  (documentado em `HANDOFF.md`).
- **LiveKit JS** e **SignalR JS** são mais simples que os equivalentes Unity — e o `livekit-client`
  **já roda** no app web de vocês.
- **Escala melhor pra online**: interiores como mapas/áreas separadas ⇒ carrega e sincroniza só
  onde a pessoa está. Um mapão único faz todo cliente renderizar/receber o mundo inteiro.

**Mantém:** backend C#, app web, LiveKit. **Refaz:** só o cliente do jogo.

---

## 4. Assets (comprados, no disco) — `C:\Users\prs\Claude Sessions\LimeZu\`

| Pack | Pasta | Para quê |
|---|---|---|
| **Modern Interiors** | `moderninteriors-win` | Interiores, personagens, Character Generator |
| **Modern Office Revamped** | `Modern_Office_Revamped_v1.2` | Room builder de escritório + 339 móveis |
| **Modern Exteriors** ⭐ | `modernexteriors-win` | Grama, árvores, prédios, portões, cercas, jardim. **6225 singles** |
| Modern Exteriors RPG Maker | `Modern_Exteriors_RPG_Maker_MV_v42.3` | (versão RPG Maker; não usada) |
| UI | `modernuserinterface-win` | Ícones/molduras pixel |
| Character Generator 2.0 / Portrait Generator | `.exe` | Usuário opera; gera premades e retratos |

**Regra:** usar sempre a versão **16x16** dos packs (a arte é autorada em 16px; 32/48 são upscale).

---

## 5. FATOS TÉCNICOS VERIFICADOS (isto aqui é o valor deste doc)

Tudo abaixo foi **medido/renderizado e conferido visualmente** nesta sessão. Não chute de novo.

### 5.1 Personagens (Modern Interiors)
- Folhas: **384x32** = **24 frames de 16x32**.
- **Ordem das direções: `right(0-5), up(6-11), left(12-17), down(18-23)`** — verificado nos pixels.
  (O `HANDOFF.md` e notas antigas dizem `down/up/left/right` — **estão ERRADOS**.)
- Run ~10-12fps, idle ~4.5-5fps.

### 5.2 `room_builder.png` (do pack **Office**, 256x224 = grade **16 col x 14 linhas** @16px)
Nomenclatura usada: `rb_<col>_<row>` (row contado do topo).

**Parede fina (laterais/sul) — conjunto cols 7-9:**
```
TL=rb_7_1   TOP=rb_8_1   TR=rb_9_1
 L=rb_7_2  FILL=rb_8_2    R=rb_9_2
BL=rb_7_3   BOT=rb_8_3   BR=rb_9_3
```
- ⚠️ **`rb_8_1` é a horizontal SEM emenda.** `rb_3_1`/`rb_4_1` têm **gaps** (parecem certas e não são).
- Topo≠base e esq≠dir (peças distintas) ⇒ **RuleTile automática NÃO resolve** (vizinhos idênticos).
  Pinte **por posição**; fica perfeito.

**Parede NORTE 3D (com volume, decorável — quadros/troféus):** 2 tiles de altura
```
rb_1_9  (topo branco + tijolo)   ← linha de cima
rb_1_10 (tijolo + rodapé)        ← linha de baixo
```
Variantes: `rb_5_9/rb_5_10` (tan B), `rb_8_9/rb_8_10` (branco).
Só a parede **norte** tem face alta; laterais/sul são finas (igual aos `6_Office_Designs`).

**Pisos (seamless):** `rb_13_9` madeira/tan · `rb_10_9` cinza · `rb_10_7` cinza claro · `rb_13_11` terracota.

**Referência visual do alvo:** `Modern_Office_Revamped_v1.2/6_Office_Designs/Office_Design_1.gif`
(1º frame). É a sala que valida o padrão de qualidade.

### 5.3 Modern Exteriors
- **Grama:** `Terrains_and_Fences_16x16_Grass_1_22` = **fill liso seamless**.
  `Grass_1_9` = tufos (espalhar por cima). ⚠️ `Grass_1_5` tem **borda** (é peça de canto, não fill).
- **Árvores:** `Camping_16x16_Tree_N` (64x64). **Arbustos:** `Garden_16x16_Bush_N` (16x16).
- **Prédios de escritório completos:**
  - `Office_16x16_Example_1` = **LIME CORP**, 192x304 (12x19 tiles)
  - `Office_16x16_Example_2` = **G-NERIC CORP**, 304x288 (19x18 tiles)
  - São **fachadas em 3/4 de perspectiva** (não telhado top-down!).
  - Em `Example_2`: **porta em local (80, 256)**, 48x32 · **placa em local (54, 238)**, 112x16.
- **Porta de escritório animada:** `Animated_sheets_16x16/Office_Door_1_16x16.png` = 672x32
  - ⚠️ **FRAMES SÃO 48x32 ⇒ 14 frames** (não 32x32/21 — esse erro embaralha a animação).
  - **frame 0 = fechada, frame 8 = aberta, 13 = fechada** (é um ciclo).
  - Correto: animar **0→8 e SEGURAR** em 8; fechar = 8→0.
- **Telhado (só se for usar):** superfície seamless = crop **(0,48) 16x16** de
  `Office_16x16_Roof_Middle_Modular` (48x80). Peças: `Roof_Left` 32x80, `Roof_Middle_Modular` 48x80,
  `Roof_Right` 32x80. Props: `Air_Duct_1/2` 32x32, `Solar_Panel` 32x48, `Shutter_Dish` 48x64,
  `Roof_Stairs` 48x80, `Cabin_Entrance` 32x64.
- **Portões:** `Garden_16x16_Gate_1/2` 48x32 · **`Gate_3/4` 64x32** (duplo, ornamentado). Já vêm
  com cerca-viva nas laterais.
- **Cerca-viva (hedge):** `Garden_16x16_Grass_Wall_1_2` (topo) + `Grass_Wall_1_8` (miolo).
  Regra que funciona: *sem hedge acima ⇒ topo; senão ⇒ miolo*.
- **Jardim:** `Fountain_1_1` 32x48 · `Big_Bench_Horizontal` 48x16 · flores 16x32.

### 5.4 Placa customizada (TOOQ BMS) — já feita
As placas do pack **vêm com texto** ("LIME CORP", "G-NERIC CORP"); não há versão em branco, e as
letras **T, Q, B, S não existem** em nenhuma. Então foi criada uma placa do zero:
- Paleta extraída da placa original: fundo `#6C6E85` · letras `#E2F2F3` · bisel `#BAD2E0` ·
  contorno `#3A3A50` · topo `#7C7F96`
- Fonte pixel **7x9** desenhada à mão (T, O, Q, B, M, S).
- Artefatos prontos: `web-client-poc/assets/sign_tooq.png` (112x16) e
  **`assets/office_tooq.png`** = o `Example_2` com a placa **TOOQ BMS** colada em (54,238). **Reaproveitar.**

### 5.5 Gotchas de ferramenta (me custaram tempo)
- **PowerShell + System.Drawing:** multiplicação dentro de `New-Object System.Drawing.Rectangle(...)`
  vira `Object[]` e explode. **Sempre pré-computar em `[int]$var`.**
- **PowerShell array 2D** `$a[$y,$x]` se comporta mal → usar **hashtable** `"x,y"`.
- Screenshot do Browser pane às vezes trava depois de muitos reloads (transitório; volta sozinho).
- **Não** interpretar movimento estranho do boneco como bug: **era o usuário jogando** enquanto eu
  testava. Se precisar testar sem interferência, `scene.input.keyboard.enabled = false`.

---

## 6. O POC atual (`web-client-poc/`) — o que é e o que fazer com ele

**Stack:** Phaser **3.80.1** (arquivo local `phaser.min.js`, sem CDN) · `server.js` = estático Node
sem dependências · `.claude/launch.json` config **`web-poc`**, porta **8123** ·
subir com `preview_start {name:"web-poc"}`.

**O que ele demonstra (tudo verificado no navegador):** grama/árvores/arbustos reais, fachada
**TOOQ BMS**, porta animada abrindo por proximidade, entrar no prédio (fade) → interior, jardim
com fonte/bancos/flores, muro-verde + portão, mundo aberto, câmera seguindo, **zoom por scroll**,
canvas preenchendo a tela.

**Veredito honesto: o `game.js` é DESCARTÁVEL.** Ele foi reescrito ~11 vezes ao sabor de palpites,
não tem arquitetura (tudo num arquivo, sem separação de cena/mundo/entidades), não tem rede, e o
interior nunca foi mobiliado.

**O que APROVEITAR do POC:**
1. **`assets/`** — tudo já recortado e conferido (inclusive `office_tooq.png` e `sign_tooq.png`).
2. **`server.js` + `launch.json`** — servem de infra local na hora.
3. **Os fatos da seção 5** — é o conhecimento caro.

---

## 7. Decisões de design (com as tensões reais)

### Roof-reveal vs. Fachada — a tensão que descobrimos na marra
- **Roof-reveal** (entrar remove o teto) **amarra o tamanho do interior ao do telhado**. Interior
  grande ⇒ telhado gigante ⇒ **laje cinza feia**. Nenhum prop salva. Funciona bem só em
  **construção pequena** (quiosque, guarita, casinha).
- **Modern Exteriors é 3/4 de perspectiva** — os prédios lindos são **fachadas**, não telhados
  top-down. Sobrepor fachada em interior top-down **vaza** (a fachada tem áreas transparentes).
- **Escolha do usuário (última):** **fachada bonita por fora + entrar ⇒ interior grande com vários
  andares.** É o padrão de mercado (Pokémon/Stardew) e o que o pack foi desenhado pra ser.

### Camadas do mundo (pedido do usuário)
```
Interior do escritório (vários andares)  ←  o PRODUTO
        ↑ porta animada
Jardim/terreno da Tooq (cercado, fonte, bancos)
        ↑ portão
Mundo aberto
```

### Multi-andar
Testado e funcionou: **troca de camada** (mostra/esconde o container do andar + troca o grupo de
colisão) acionada por escada — **sem transição de cena**. Preferir isso a teleporte entre mapas.

---

## 8. O QUE DEU ERRADO nesta sessão (leia isto)

Sendo direto, porque o próximo passo depende de não repetir:

1. **Chutei design em vez de fixar requisito.** Reescrevi o `game.js` ~11 vezes: prédios procedurais →
   fachadas → roof-reveal → transição de cena → prédio gigante → fachada de novo. Cada pivô veio de
   eu adivinhar o que "ficaria bonito" em vez de alinhar antes.
2. **Comemorei cedo.** Dei "🎉 funcionou!" várias vezes em cima de coisa meia-boca. O usuário teve
   que me corrigir: *"não é para comemorar, nada funciona"*. Justo.
3. **Diagnostiquei fantasma.** Passei rodadas caçando "teclas grudadas" e "ping-pong" que **eram o
   usuário jogando** enquanto eu testava. Inventei bug e "consertei" o que não estava quebrado.
4. **Fiz o cenário e esqueci o produto.** Telhado, grama, portão, placa... e o **interior continua
   uma sala vazia**. O escritório mobiliado — a única coisa que o time vai usar 8h/dia — nunca saiu.
5. **Bugs reais que eu mesmo criei e depois "descobri"**: frame da porta 32 vs 48; textura usada sem
   preload; `stopFollow()`/`keyboard.enabled=false` deixados ligados depois dos testes (o usuário
   achou que a câmera e o teclado estavam quebrados — estavam, por minha causa).

---

## 9. Recomendação para o recomeço

**Ordem sugerida (do produto pra fora, não o contrário):**

1. **Fixar o escopo por escrito ANTES de codar.** Uma página: o que o v1 do cliente precisa fazer.
   Não começar a desenhar mundo sem isso.
2. **Começar pelo INTERIOR.** Um andar de escritório bonito e **mobiliado** (salas de reunião,
   estações de trabalho, café, decoração na parede 3D de tijolo). Usar os 339 móveis do pack Office
   + os fatos da seção 5.2. **Este é o gate de qualidade** — nada de exterior antes disso ficar bom.
3. **Arquitetura de código de verdade** (o POC não tem): separar `scenes/`, `world/`, `entities/`,
   `net/`. Pensar em ambientes/áreas como dados (JSON de mapa), não código hardcoded — porque a
   **F8/F9 do plano** (salas customizáveis pelo dono) depende de mapa-como-dado.
4. **Rede cedo** (não deixar pro fim): SignalR JS + o contrato de 28/tile do `OfficeLayout.cs`.
   Dois avatares andando no mesmo mapa é um marco melhor que qualquer telhado.
5. **Exterior por último** — e simples: a fachada `office_tooq.png` já pronta + jardim + portão.
6. **A/V (LiveKit JS)** depois da rede.

**Perguntas em aberto pro usuário (alinhar no início da próxima sessão):**
- A Tooq tem **paleta/identidade visual**? (dá pra tingir placa e detalhes em vez do cinza genérico)
- O v1 é **um andar** ou já multi-andar?
- Quantas pessoas simultâneas o v1 precisa aguentar?
- Mapa **fixo** (nós desenhamos) ou já com **edição pelo dono** (F8/F9 do `PLANO_CLIENTE_V2.md`)?

---

## 10. Docs relacionados

- `PLANO_CLIENTE_V2.md` — plano em 10 fases (F0-F10). Ainda é uma boa referência de escopo/fases,
  **mas foi escrito para Unity**. As fases de gameplay/rede/minigames seguem válidas.
- `HANDOFF.md` — retrospectiva do cliente Unity antigo e por que falhou (loop cego). ⚠️ Contém a
  **ordem de direção dos chars ERRADA** — use a da seção 5.1 daqui.
- `office-unity/PROXIMA_SESSAO.md` — estado do Unity (F1 concluída) se um dia voltar.
- Memória do projeto: `projeto-escritorio-virtual.md`, `poc-web-phaser.md`.
