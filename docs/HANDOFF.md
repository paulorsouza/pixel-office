# Office Quest — Handoff / Documentação do Projeto

> Documento de entrega para **recomeçar o cliente do jogo do zero**.
> Escrito em 2026-07-10. Cobre o que existe, os conceitos, onde estão os assets,
> uma avaliação honesta do que não funcionou e recomendações concretas.
>
> **TL;DR:** o **backend (C#)** e o **app web** estão bons e reaproveitáveis.
> Quem precisa ser refeito é o **cliente do jogo em Unity** — e a razão principal
> do resultado ruim está explicada na seção "Por que ficou ruim".

---

## 1. Visão do produto

Um **escritório virtual** estilo Gather.town, mas com **gestão de atividades integrada**:

- **Tasks**: sprints, épicos, tasks, bugs, atendimentos (tickets); controle de horas estilo Clockify; relatórios.
- **Escritório 2D**: você anda com um personagem, entra em salas, senta na sua mesa (começa a contar horas na task ativa), entra em reuniões com áudio/vídeo/tela.
- **Gamificação**: XP por horas lançadas, níveis, drops de skins/itens, sala pessoal decorável, objetivos (ex.: 100h em reuniões).
- **Usabilidade "toolbar game"**: o jogo não toma a tela inteira o tempo todo; integra com o timer e as tasks.

Decisões de stack originais do usuário: **backend em C#**, **jogo em Unity**, e um **app web** (React-like) para juntar reuniões e administrar tasks sem abrir o jogo.

---

## 2. Estrutura de pastas (raiz: `C:\Users\prs\Claude Sessions`)

```
Claude Sessions/
├─ LimeZu/                      # PACKS DE ARTE comprados/baixados (fonte original)
└─ virtual-office/
   ├─ README.md, TESTE.md       # notas de como subir/testar
   ├─ backend/                  # API C# (ASP.NET Core) — REAPROVEITAR
   │  └─ VirtualOffice.Api/
   ├─ livekit/                  # servidor de A/V self-hosted (LiveKit) + scripts
   └─ office-unity/             # CLIENTE DO JOGO em Unity — REFAZER
      ├─ Assets/Scripts/        # todo o código do jogo
      ├─ Assets/StreamingAssets/LimeZu/   # arte COPIADA que o jogo carrega em runtime
      ├─ Assets/Resources/UI/   # tema/estilos da HUD (UI Toolkit)
      ├─ Assets/Settings/       # URP Asset + 2D Renderer (criados no fim)
      ├─ Packages/manifest.json # dependências Unity
      ├─ shot.ps1, build-and-shot.ps1     # scripts de captura headless (ver seção 9)
```

O **app web** mora dentro do backend, servido como estático:
`virtual-office/backend/VirtualOffice.Api/wwwroot/` (`index.html`, `js/`, `css/`, `lib/`).

---

## 3. ONDE ESTÃO OS ASSETS (importante)

### 3.1. Fonte original (packs LimeZu) — `Claude Sessions/LimeZu/`

- **`Modern_Office_Revamped_v1.2/`** — pack principal (escritório). Subpastas:
  - `1_Room_Builder_Office/` — atlas de pisos/paredes (tiles 16px).
  - `2_Modern_Office_Black_Shadow/` — móveis **com sombra** embutida.
  - `3_Modern_Office_Shadowless/` — móveis **sem sombra**.
  - `4_Modern_Office_singles/16x16` (e `32x32`, `48x48`) — **móveis avulsos**, um PNG por item.
  - `5_..._RPG_MAKER_MV/`, `6_Office_Designs/` (exemplos de mapas prontos), `7_..._Previous_Version/`.
- **`Modern_Interiors_Free_v2.2/Modern tiles_Free/`** — pack grátis (interiores + `Characters_free`).
- **`Portrait_Generator_1.5.0.../`** e `Portrait_Generator_Setup.exe` — gerador de retratos/avatares LimeZu.
- **`modernuserinterface-win/`** — pack de UI da LimeZu (se quiser HUD no mesmo estilo).

> Os `.zip` ao lado são os downloads originais. As licenças estão em `LICENSE_*.txt`.

### 3.2. Arte que o jogo usa hoje — `office-unity/Assets/StreamingAssets/LimeZu/`

Foi **copiada** da fonte para cá e o jogo carrega **em runtime** (ver seção 6 — este é um dos erros de arquitetura):

- `room_builder.png` — atlas 256×224 px = **16 colunas × 14 linhas** de tiles 16px.
  - **colunas 10–15** = pisos "fill" (cinza, madeira/tan, oliva, terracota).
  - **colunas 0–9** = blocos de parede de tijolo (com uma faixa branca de "cap" no topo).
- `singles/Modern_Office_Singles_N.png` — **678** móveis avulsos (quadros 32×48, objeto recortado ao conteúdo).
- `chars/` — personagens **Adam, Alex, Amelia, Bob**, cada um com `*_idle_anim.png`, `*_run.png`, `*_sit.png`.
  - Cada folha é **384×32 px = 24 frames de 16×32** = **6 frames por direção**.
  - **Ordem real das direções na folha: `down (0–5), up (6–11), left (12–17), right (18–23)`.** (Isso foi verificado ampliando a folha do Adam — o código antigo tinha essa ordem trocada, causando "andar pra direita e aparecer de frente".)

---

## 4. Backend (C#) — `backend/VirtualOffice.Api/`  ✅ bom, reaproveitar

**Stack:** ASP.NET Core (.NET 10) + EF Core/SQLite + SignalR. Monolito modular. Banco em `office.db` (SQLite).

**Arquivos principais:**
- `Program.cs` — endpoints REST e configuração. Endpoints: `/api/users`, `/api/me` (retorna task ativa, mesa, nível/XP, timer ativo), `/api/workitems`, `/api/timer/start|stop`, `/api/timeentries`, `/api/reports/summary`, `/api/me/active-task`, `/api/desks`, `/api/av/token`.
- `Models.cs` — entidades: `User` (tem `ActiveWorkItemId`, cor, XP), `WorkItem` (tipos: Task/Bug/Atendimento, com sprint/épico/status), `TimeEntry`, `Sprint`, `Epic`.
- `OfficeHub.cs` — **SignalR** (tempo real): `Join`, `Move`, `SetZone`, `SitAt(tileX,tileY)`, `PickUpHeadset`/`DropHeadset`, `Chat`. Ao sentar na mesa, inicia timer automático na task ativa (mecanismo unificado `StartAutoEntryAsync`/`CloseAutoEntryAsync` via `AutoEntryId`/`AutoKind`).
- `Presence.cs` — `PlayerState` em memória (posição, zona, mesa, fone, timer automático).
- `OfficeLayout.cs` — geometria compartilhada com o cliente: 4 mesas de dev `(4,4),(31,4),(4,18),(31,18)` e 4 quadros kanban `(4,1),(31,1),(4,15),(31,15)`. **Se mudar o mapa no cliente, mude aqui também.**
- `LiveKitService.cs` — gera **tokens JWT HS256** para o LiveKit (feito à mão).
- `Seed.cs` — dados iniciais (usuários Paulo/Cora/... , tasks de exemplo).
- `BotService.cs` — bots que andam pelo mapa (para testar presença).

**Como subir:** `dotnet run` na pasta `VirtualOffice.Api` (porta **5210**). Ou rode o DLL já buildado:
`bin\Debug\net10.0\VirtualOffice.Api.dll`. (Detalhe: `dotnet run` em background às vezes não persiste; rodar o DLL direto é mais confiável.)

---

## 5. App web — `wwwroot/`  ✅ ok

HTML/JS puro (sem framework pesado), servido pelo backend. Arquivos em `wwwroot/js/`:
`api.js`, `backlog.js`, `board.js` (kanban), `chat.js`, `hours.js`, `meeting.js` (call LiveKit), `profile.js`, `reports.js`, `task-modal.js`, `main.js`. Libs em `wwwroot/lib/`: `signalr.min.js`, `livekit-client.umd.min.js`.

Serve para: administrar tasks, ver relatórios/horas, e **entrar em reuniões/chat do jogo sem abrir o jogo**.

---

## 6. Cliente do jogo (Unity) — `office-unity/`  ⚠️ refazer

**Unity 6000.5.2f1** (Unity 6). Render pipeline: **URP 17.6.0** (migrado no fim; ver seção 8). Todos os scripts em `Assets/Scripts/`:

### Game/
- **`Boot.cs`** — bootstrap: cria o `OfficeGame` numa cena vazia.
- **`OfficeGame.cs`** — orquestra tudo: login, conexão SignalR (`MiniSignalR`), cria jogadores (`AvatarView`), câmera, HUD. `SetupCamera` monta a câmera ortográfica + `PixelPerfectCamera`.
- **`OfficeMap.cs`** — **constrói o mapa por código** (um `SpriteRenderer` por tile). 4 salas de dev nos cantos, reunião ao norte, café ao sul, open space no meio. Também: sombras de contato dos móveis e **iluminação 2D** (`Light2D` global + pontuais). Coordenadas em "server units" (28/tile).
- **`LimeArt.cs`** — **carrega os PNGs de StreamingAssets em runtime** e fatia sprites na mão (`Sprite.Create`). PPU 16 (1 tile = 1 unidade de mundo). *(Ponto crítico — ver seção 7.)*
- **`LimeCharacter.cs`** — anima o personagem por spritesheet (run/idle/sit), 6 frames/direção. Sombra + fone opcionais.
- **`AvatarView.cs`** — representação de cada jogador (rig + nome + status + balão de fala).
- **`LocalPlayer.cs`** — input do jogador local: movimento WASD **e mouse** (clique-pra-andar, clicar em cadeira senta, clicar no quadro abre kanban), colisão, zonas, sentar, emotes, câmera com zoom em passos.
- **`SoftArt.cs`** — **desenha vetorialmente** (anti-aliased) sombras, fone, emotes e formas da UI. *(Mistura de estilo com a pixel art — ver seção 7.)*
- **`GameLit.cs`** — material Sprite-Lit compartilhado (para os sprites receberem Light2D).
- **`AvManager.cs`** — áudio/vídeo via SDK LiveKit (mic/câmera/tela).

### Net/
- **`Api.cs`** — chamadas REST ao backend.
- **`MiniSignalR.cs`** — cliente SignalR próprio (WebSocket + JSON), com fila de eventos processada no `Update`.

### UI/
- **`Hud.cs`** — HUD em **UI Toolkit** (USS = "CSS do Unity"): card do jogador, XP, timer, banner de zona, chat compacto, lista de online, toasts, login.
- **`WorkPanels.cs`** — painel deslizante com **kanban** (drag-and-drop, filtro de sprint, avatares) e planilha de horas.
- **`UiKit.cs`** — fábrica de elementos UITK (botões, avatares, badges, etc.).
- `Assets/Resources/UI/app.uss` — design system (tema claro moderno). `AppTheme.tss` importa o tema + o USS.

### Editor/  (ferramentas de dev, não vão pro build)
- **`DevShots.cs`** — captura headless: renderiza a câmera pra PNG (`RenderStatic`) sem precisar de Play. Ver seção 9.
- **`UrpSetup.cs`** — cria o URP Asset + 2D Renderer por script.

---

## 7. Conceitos técnicos (explicados)

- **PPU (Pixels Per Unit):** quantos pixels de arte = 1 unidade de mundo. Com arte de 16px e **PPU 16**, 1 tile = 1 unidade. Personagem 16×32 = 1×2 unidades.
- **Câmera ortográfica:** sem perspectiva (essencial em 2D). `orthographicSize` = metade da altura visível em unidades. Ex.: size 5 mostra 10 unidades = 10 tiles = 160px de arte na vertical.
- **Escala inteira / Pixel Perfect:** se a arte de 16px é ampliada por um fator **fracionário** (ex.: 4,5×), os pixels saem de tamanhos diferentes → imagem "torta/esticada". Solução: **Pixel Perfect Camera** com PPU 16 e **resolução de referência 320×180** (base 16:9 canônica p/ 16px), que força ampliação por número inteiro (×4 = 1280×720, ×6 = 1920×1080). Foi a causa do "fora de proporção".
- **Filtro Point vs Bilinear:** pixel art usa **Point** (sem borrar). Vetores/sombras usavam **Bilinear** (suave) — misturar os dois cria sensação de escala inconsistente.
- **Mipmaps:** versões reduzidas pré-calculadas da textura; sem elas, sprites de 16px "esfarelam" quando muito reduzidos (zoom-out) sob URP.
- **Sorting / ordenação por Y:** em 2D top-down, quem está "mais embaixo" na tela desenha na frente. Feito via `sortingOrder` calculado a partir do Y.
- **Server units (28/tile):** o backend e o cliente trocam posições numa grade de 28 unidades por tile (herança do protótipo web). O cliente converte su↔mundo.
- **URP 2D + Light2D:** o **Universal Render Pipeline** com **2D Renderer** habilita **luz 2D** (global de ambiente + pontuais). Para um sprite receber luz, ele precisa do material **Sprite-Lit** (senão a luz é ignorada). É daqui que vem a atmosfera "Eastward".
- **UI Toolkit (UITK):** sistema de UI do Unity baseado em **USS (CSS) + UXML (HTML)**. A HUD do jogo foi feita nele. Renderiza num painel próprio (não pela câmera) — por isso não aparece em captura da câmera.
- **SignalR:** tempo real (WebSocket) entre cliente e servidor — movimento, chat, presença.
- **LiveKit:** SFU de áudio/vídeo self-hosted (`livekit/livekit-server.exe`), com tokens JWT gerados pelo backend.

---

## 8. O que foi feito nesta migração (últimas mudanças)

1. **Correções de arte:** direção da animação (ordem down/up/left/right), sombras de contato nos móveis, piso quente (tan) e paredes de tijolo sólido (removida a "faixa branca" que aparecia).
2. **Chat/mouse:** chat compacto que some sozinho + Enter abre / Esc fecha (determinístico, para não travar o WASD). Movimento por mouse (clique-pra-andar, sentar, abrir kanban).
3. **Migração pro pipeline 2D (parcial):**
   - URP 17.6.0 instalado (`Packages/manifest.json`), URP Asset + 2D Renderer em `Assets/Settings/`.
   - Sprites do mundo com material **Sprite-Lit**; **Light2D** global + pontuais no `OfficeMap`.
   - **Pixel Perfect Camera** (PPU 16, ref 320×180); zoom virou passos discretos.
   - Mipmaps ligados no carregamento das texturas.

Tudo **compila limpo**. O que **não** dava para verificar sem abrir o Play: as poças das luzes pontuais e o efeito do pixel-perfect (a captura headless usa câmera própria e só renderiza a luz global).

---

## 9. Ferramentas de captura headless (se quiser reaproveitar)

Como o desenvolvimento foi feito sem interface gráfica, criei um jeito de **ver o jogo sem abrir o editor**:
- `Assets/Scripts/Editor/DevShots.cs` → `RenderStatic`: monta o mapa + personagens em modo edição e renderiza a câmera pra `Logs/shot-map.png` e `Logs/shot-close.png`.
- Rodar: `Unity.exe -batchmode -projectPath "<proj>" -executeMethod OfficeQuest.EditorTools.DevShots.RenderStatic -quit -logFile "<log>"` (com **aspas** nos paths — têm espaço).
- **Lições aprendidas (importantes):**
  - **Não mate o processo "Unity Hub"** — ele serve a licença; sem ele o editor sai em 0s sem gerar log. Se isso acontecer, reabra o Unity Hub.
  - O **editor GUI/Play** não roda de forma confiável a partir de uma sessão sem desktop interativo; por isso a captura foi feita renderizando a câmera pra RenderTexture (não via Play/screenshot).
  - Sob URP, `Camera.Render()` não funciona — usar `Camera.SubmitRenderRequest`. **Point Light2D não renderiza** nesse caminho headless (só a global) — luz pontual só se vê no Play.

---

## 10. Por que ficou ruim (avaliação honesta)

O visual ficou aquém e cada iteração parecia piorar. As causas de raiz, na minha leitura:

1. **Carregar a arte em runtime, contornando o editor.** `LimeArt` lê PNGs crus e fatia sprites por código. Isso **briga com a engine**: sem pipeline de import (slicing, atlas, compressão, mipmaps configurados), sem Tilemap, e dificulta pixel-perfect, batching e iluminação. Foi escolhido para permitir trabalho "headless", mas custou caro em qualidade.
2. **Três linguagens visuais misturadas:** pixel art 16px (LimeZu) + vetor anti-aliased (SoftArt) + TextMesh. Nunca fica coeso.
3. **Mapa montado por heurística no código** (paredes por adivinhação) em vez de desenhado com **Tilemap** — resultado cru e sem carinho de level design.
4. **URP / pixel-perfect / luz colados no fim**, num projeto que nasceu Built-in, em vez de começar já como projeto **2D (URP)**.
5. **O loop de verificação estava quebrado:** eu construía praticamente às cegas (sem GUI) e validava por renders em lote. Para *arte*, isso é fatal — você precisa ver em tempo real, iterar rápido, ajustar no olho. Boa parte do "cada vez pior" veio disso.

**Nada disso é culpa da arte da LimeZu** (ela é ótima) nem do backend (que está sólido). É o **jeito como o cliente Unity foi montado** e o **fluxo de trabalho** para a parte visual.

---

## 11. Recomendações para recomeçar do zero (o cliente Unity)

Mantenha **backend, web e LiveKit** — só refaça o jogo. Sugestão de como:

1. **Comece pelo template "2D (URP)" do Unity 6.** Já vem com URP 2D Renderer, Pixel Perfect Camera, Tilemap, Sprite Editor e 2D Animation configurados. (As versões que batem com este editor: URP 17.6.0; pacotes 2D em `.../Editor/Data/.../ProjectTemplates/com.unity.template.2d-*.tgz`.)
2. **Importe a arte pelo editor, não em runtime.** Coloque os PNGs em `Assets/`, configure no inspector: **PPU 16**, **Filter Mode: Point**, **Compression: None**, **Mip Maps: on**. Use o **Sprite Editor** para fatiar as folhas de personagem (16×32, grid) e gere um **Sprite Atlas** para batching.
3. **Monte o mapa com Tilemap** (Grid + Tilemap + Tile Palette), pintando no editor — ou importe um mapa do **Tiled**. Bem melhor que montar por código.
4. **Pixel Perfect Camera desde o início:** PPU 16, referência **320×180**. Zoom em passos (mudando a referência), não `orthographicSize` livre.
5. **Iluminação com Light2D** para atmosfera: um **Global Light** de ambiente + **Point Lights** quentes (monitores, janelas, salas). Sprites como **Sprite-Lit**.
6. **Animação com o Animator + Sprite Animations** (a partir das folhas fatiadas), em vez de trocar frame na mão.
7. **HUD:** UI Toolkit é uma boa escolha; se quiser, reaproveite `app.uss`/`Hud.cs` como ponto de partida (a lógica de chat/kanban/mouse já está resolvida).
8. **Reaproveite a "cola" com o backend:** `Api.cs`, `MiniSignalR.cs`, e o contrato de posições em server units (28/tile) e a geometria de `OfficeLayout.cs`.
9. **Trabalhe com o editor aberto / feedback visual em tempo real.** Para arte, o loop precisa ser: mexeu → viu na hora → ajustou. Se for continuar com um agente, deixe o agente rodar o Unity com você olhando o Play, ou reserve a parte visual para iteração manual e use o agente para lógica/backend.

---

## 12. Como subir tudo hoje (para testar o que existe)

1. **Backend:** `cd virtual-office/backend/VirtualOffice.Api && dotnet run` (porta 5210). App web em `http://localhost:5210`.
2. **LiveKit (opcional, para A/V):** `virtual-office/livekit/start-livekit.ps1`.
3. **Jogo:** abra `virtual-office/office-unity` no Unity 6000.5.2f1 e dê **Play**. (Controles: WASD/clique mover, E ou clique sentar/abrir kanban, F fone, T tasks, H horas, 1–4 emotes, Enter chat, Tab pessoas.)

Notas em `virtual-office/README.md` e `virtual-office/TESTE.md`.

---

*Fim do handoff. O backend e a web são uma base sólida; o cliente do jogo vale recomeçar seguindo a seção 11.*
