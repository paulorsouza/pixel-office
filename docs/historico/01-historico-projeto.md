---
name: projeto-escritorio-virtual
description: "Projeto do usuário — escritório virtual (estilo Gather) com gestão de tasks, horas e gamificação; backend C#, office em Unity, app de tasks em Tauri"
metadata: 
  node_type: memory
  type: project
  originSessionId: 66ab608e-1e9b-4c4a-8672-a9d965cc1975
---

Iniciado em 2026-07-07. O usuário quer desenvolver um escritório virtual próprio com controle de atividades integrado:

- **Tasks**: sprints, épicos, tasks, bugs, atendimentos (tickets), controle de horas estilo Clockify, relatórios.
- **Escritório virtual**: estilo Gather.town, mas com usabilidade "toolbar game" — não deve tomar a tela inteira o tempo todo; integração total com timer de horas e tasks.
- **Gamificação**: objetivos (ex.: 100h em reuniões), XP por horas lançadas, drops de skins e itens, sala pessoal decorável por usuário (mesas, estátuas, medalhas), sistema de skins.
- **Stack definida pelo usuário**: backend todo em C#; office game em Unity; app de tasks em Tauri.

O plano de arquitetura/roadmap foi montado (fases: fundação → tasks+horas → office MVP → integração → gamificação → salas/skins).

**Protótipo construído em 2026-07-07** em `C:\Users\prs\Claude Sessions\virtual-office\`:
backend ASP.NET Core (.NET 10) + EF Core/SQLite + SignalR servindo frontend web sem build
(wwwroot, JS puro) em http://localhost:5210 (`dotnet run` em backend/VirtualOffice.Api).
Funciona: office 2D canvas (avatares, bots, chat proximidade, modos compacto/expandido),
kanban/sprints/épicos, timer estilo Clockify integrado (reunião automática ao entrar na sala),
XP/níveis/drops/medalhas/skins/sala pessoal, relatórios. Máquina do usuário NÃO tem Node,
Rust nem Unity instalados (por isso frontend sem build).

**Cliente Unity criado em 2026-07-07** em `virtual-office/office-unity/` (não testado —
Unity não instalado; usuário precisa instalar Unity Hub + Unity 6 LTS e abrir a pasta):
zero assets binários (arte pixel procedural em Sprites.cs), zero cena configurada
(bootstrap RuntimeInitializeOnLoadMethod), SignalR via cliente JSON minimalista próprio
(Net/MiniSignalR.cs, com negotiate para saber o connectionId). Posições em "server units"
(28/tile) — Unity e web convivem no mesmo mapa; geometria de colisão espelha
wwwroot/js/office.js (mudar mapa = mudar nos dois). Mecânicas novas: sentar (E, dir="sit"
trafega no campo dir do Move), emotes 1-4 (tokens :like: etc via Chat), zoom scroll.
Fonte legada não tem emoji → AvatarView.Sanitize mapeia status para [REC]/[REUNIAO].
**Status 2026-07-07 (noite): Unity RODANDO e verificado visualmente.** Unity 6000.5.2f1
instalado; compilação batch limpa. Pipeline de verificação visual próprio:
`Assets/Scripts/Editor/DevShots.cs` (menu "OfficeQuest/Capturar screenshots" ou CLI
`-executeMethod OfficeQuest.EditorTools.DevShots.Run`) — entra em Play com auto-login
(PlayerPrefs "oq-autologin"), tira shots em Logs/shot-*.png e fecha o editor. CUIDADO:
a janela rouba o foco do teclado — se o usuário estiver digitando, o texto vira input
WASD no jogo (aconteceu; virou teste de integração acidental: colisão, porta, zona,
timer de reunião automático e banner, tudo confirmado funcionando). Arte v2 aplicada
(contornos automáticos via OutlinePass, paleta mais quente, xadrez 2x2, tapete com canto
arredondado, zoom padrão 5). Web+Unity confirmados convivendo no mesmo mapa.
Arte v3 (usuário aprovou ambiente, pediu foco nos personagens): avatares redesenhados em
32x48 @ PPU32 (2x densidade dos tiles 16px, mesmo tamanho no mundo) — 4 estilos de cabelo
por userId%4, olhos com brilho, boca/bochechas, gola, cinto com fivela, respiração no idle,
sombra elíptica suave, sombra atrás do nome. Ambiente: janelas noturnas na parede norte com
poças de luz, regra "face da parede só com chão ao sul" (WallTop liso em trechos verticais,
senão vira persiana), balcão do café em y13 (fora da área dos bots), mesa de reunião com
papéis/laptop, bebedouro/impressora/relógio/pôsteres/arbustos, riscos esparsos no piso.
**Feature "fone de reunião" (2026-07-08, testada ponta a ponta no web; Unity compilado limpo)**:
pegar fone na sala de reunião (botão no web / tecla F ou botão HUD no Unity) permite circular
pelo mapa continuando na reunião — chat de reunião e lançamento de horas seguem ativos; soltar
o fone fora da sala fecha o lançamento na hora; pegar fora da sala é recusado com toast.
Server: PlayerState.HasHeadset, Presence.InMeeting(), hub PickUpHeadset/DropHeadset, evento
"Headset"; avatar ganha fone desenhado (web canvas + sprite Unity), suporte de fones em (25,8).
Decisão do usuário: continuar 2D (avaliou 3D; recomendei contra pelo custo de arte 5-10x e
pelo conceito toolbar-game). Geometria web/Unity re-sincronizada (balcão do café na linha y13,
plantas extras, bebedouro/impressora/arbustos agora nos DOIS mapas).
**A/V real via LiveKit (2026-07-08)**: SFU self-hosted em `virtual-office/livekit/`
(livekit-server.exe v1.13.3 Windows + livekit.yaml devkey + start-livekit.ps1, porta 7880).
Backend: LiveKitService.cs gera JWT HS256 à mão; POST /api/av/token só emite se
Presence.InMeeting (403 caso contrário) — sala única "meeting", identity única por conexão.
Web: wwwroot/js/av.js + livekit-client UMD em lib/ — call entra/sai pela participação na
reunião (zona+fone via Office.updateMeetingUi), barra fixa com mic/câmera/tela, tiles de
vídeo, botão "ativar áudio" (autoplay policy), retry em falha e re-checagem de wanted
pós-connect (bugs achados em teste). TESTADO ponta a ponta no browser (token negado fora,
conecta na sala, cai ao sair). Unity: io.livekit.livekit-sdk#v1.4.0 no manifest +
AvManager.cs (corrotinas: MicrophoneSource, WebCamTexture→TextureVideoSource,
ScreenVideoSource=tela do jogo, VideoStream/AudioStream remotos, tiles RawImage na HUD)
— COMPILADO LIMPO (batch, return code 0) após correções: os tipos TrackPublishOptions/
TrackSource/VideoCodec/encodings moram em LiveKit.Proto (README omite!), e Room/RoomOptions/
AudioSource precisam de alias (Proto também os define); ParticipantDisconnected usa
delegate Participant (não RemoteParticipant). Falta só validar em runtime (Play com 2
participantes) — mic/câmera/tela não testáveis em batch.
AudioListener adicionado à câmera (sem ele a call fica muda).
**Painéis de trabalho no Unity (2026-07-08)**: WorkPanels.cs (tecla T = minhas atividades
com iniciar timer + avançar status via PATCH; tecla H = horas da semana) + timer ativo na
HUD com botão Parar (OfficeGame.RefreshMeAsync alimenta via /api/me). Api.PatchAsync via
UnityWebRequest (HttpClient.PatchAsync é arriscado no perfil .NET do Unity). Helpers de UI
do Hud viraram internal para reuso. VALIDADO em runtime via DevShots: screenshot capturou
reunião + timer automático na HUD + call LiveKit conectada (barra Mic/Camera/Tela) + toast
— stack A/V inteira funciona no Unity. **WebGL avaliado e descartado por ora**: MiniSignalR
(ClientWebSocket+threads) e o SDK LiveKit ffi não rodam em WebGL (existe client-sdk-unity-web
separado); o cliente web puro já cobre o browser. Kanban completo/relatórios/sala pessoal
seguem só no web, por decisão.
**PIVÔ pós-POC (2026-07-08, decisão do usuário)**: POC aprovada. O jogo passa a existir
SÓ no Unity (cliente web do jogo descontinuado — wwwroot vira legado até substituição,
não investir mais nele). Tauri CANCELADO — no lugar, uma página web React com: entrar em
reuniões (call), administrar tasks manualmente e participar dos chats do jogo, sem a
interface do jogo. Visual do Unity: abandonar pixel art → 2D vetorial arredondado
("cozy RPG", paleta quente clara), personagens articulados por partes (rig procedural:
andar com balanço, respirar, piscar, sentar com transição de verdade), UI redesenhada
com fonte Nunito e cantos redondos.
Salto visual v1 ENTREGUE (2026-07-08): SoftArt.cs (SDF vetorial 64px/tile, paleta quente),
CharacterRig.cs (partes articuladas + SortingGroup; andar/respirar/piscar/sentar animado;
braços atrás do corpo ordem 3, rosto sobre o cabelo ordem 9, cabelo desloca p/ nuca na
lateral), HUD tema claro + fonte Nunito (Assets/Resources/Fonts, carregada em Hud.UiFont),
GetInstanceID é erro no Unity 6.5 (usar seed própria). Sprites.cs (pixel) ficou órfão.
**Usuário gostou mas quer estilo EASTWARD** (= hi-bit pixel art com iluminação, feita por
artistas — não é alcançável por código procedural; caminho recomendado: pack LimeZu
Modern Interiors (itch.io ~US$20, padrão p/ офисes top-down) + URP Light2D p/ atmosfera;
perguntado ao usuário qual rota seguir).
**Integração LimeZu EM ANDAMENTO (2026-07-08/09)**: usuário comprou packs LimeZu, em
`C:\Users\prs\Claude Sessions\LimeZu\` (Modern_Office_Revamped_v1.2 pago, Modern_Interiors_Free_v2.2,
modernuserinterface-win, Portrait_Generator). Assets copiados p/ `office-unity/Assets/StreamingAssets/LimeZu/`
(room_builder.png 48px, singles/ 339 móveis, chars/ Adam-Alex-Amelia-Bob run/idle_anim/sit).
Carregados em RUNTIME sem pipeline de import: `LimeArt.cs` (Texture2D.LoadImage de
StreamingAssets — RbTile(col,row) 48px, Single(number) quadro 96x144 pivô no tile de baixo,
CharFrame 16x32 @ PPU16, sheets tem 24 frames = 6 por direção na ordem right,up,left,down).
`LimeCharacter.cs` substitui CharacterRig nos avatares (personagem por userId%4, anim
run/idle_anim/sit). OfficeMap trocado p/ tiles+singles LimeZu (workstations 227/231, mesa
reunião 189, cadeiras 101/102, plantas 98-100, café 320-323, etc). AvatarView usa LimeCharacter;
skin não muda cor por ora. Câmera bg #26262e. **GOTCHA CRÍTICO**: nome real dos singles é
`Modern_Office_Singles_48x48_{n}.png` (o "48x48" no meio) — corrigido em LimeArt.Single em
2026-07-09. Compilou limpo; 1º screenshot mostrou pisos+personagem OK mas móveis faltando
(era o bug do filename). Falta: re-verificar com móveis aparecendo (editor estava aberto
travando o batch de screenshot), ajustar direções de cadeira/sentar, avaliar floors (meeting
olive esquisito). Pisos: office RbTile(10+alt,5) cinza, meeting (13+alt,9) olive, coffee (10+alt,11).
DevShots continua o verificador (precisa editor FECHADO p/ rodar batch).
**LIMPEZA COMPLETA (2026-07-09)**: usuário reportou "muita física e arte quebrando".
Causa raiz do descompasso: móveis LimeZu 48px + personagens 16px (só existe 16px no pack
grátis) → padronizei TUDO em 16px (assets 16px em StreamingAssets: room_builder 256x224,
singles 32x48 nome sem prefixo, chars já 16px). LimeArt agora PPU16/tile16 e **recorta cada
single ao conteúdo opaco com pivô base-centro** (SingleWidth expõe largura em tiles) — resolve
os desalinhamentos (cadeira 101 usava só o tile inf-esq do quadro; genérico centralizava
errado). OfficeMap reescrito limpo: Place(num,tileX,tileY) posiciona por tile+largura,
colisões casam com o desenho, sem cadeiras duplicadas (227 é mesa 2-tiles SEM cadeira; chair
101 é 1-tile separada). Pisos quentes: office madeira RbTile(13/14,5), meeting oliva (13/14,9),
coffee terracota (13/14,11); parede face (4,5)/(4,9 reunião) topo (11,2). Código morto REMOVIDO:
Sprites.cs (758l, pixel órfão) + CharacterRig.cs (192l, rig órfão) deletados; SoftArt cortado
793→~240l (só Soft engine + CharShadow/CharHeadset/Emote/Rounded/Hex). SoftArt.HeadsetRack
virou single 273. Verificação: DevShots precisa editor FECHADO + backend rodando (senão
auto-login trava). build-and-shot.ps1 automatiza compile+captura.
LIMPEZA VERIFICADA OK (2026-07-09): screenshots confirmaram — open space com 4 estações
227 (monitores duplos) + 2 cadeiras cada, alinhadas e SEM sobreposição; reunião com mesa
de conferência comprida (single 208, 2-tiles, repetida em 27/29/31 row5) + cadeiras 2 lados
+ quadro. Resolução coerente (personagem 16px = móveis 16px). Mesa de reunião ANTES era
single 189 (mesinha 1.3-tile, esparsa) → trocada por 208. DevShots agora teleporta o jogador
(open space su 210,300 zoom6; reunião su 826,230) via FindAnyObjectByType<LocalPlayer> +
View.CurrentSu/TargetSu — dá shots confiáveis das 2 áreas. Pendências COSMÉTICAS (não
quebram): piso office saiu cinza RbTile(13,5) e meeting oliva RbTile(13,9) — pack Modern
Office é corporativo (cinza/azul), não tem madeira óbvia; warmth de piso fica p/ decidir com
usuário. build-and-shot.ps1 na raiz do projeto automatiza compile+captura (precisa editor
fechado + backend up). office.db pode ter timer de reunião preso de sessões antigas (resetar
apagando o arquivo com backend parado).
**FEATURE salas de dev + task ativa + sentar-rastreia (2026-07-09, EM VERIFICAÇÃO)**:
Backend (compilado+testado via curl): User.ActiveWorkItemId; OfficeLayout.cs define 4 mesas/kanbans
nos cantos (desk=tile do assento: (4,4)(31,4)(4,18)(31,18); kanban parede norte (4,1)(31,1)(4,15)(31,15))
— DEVE casar com OfficeMap.cs Unity. PlayerState ganhou DeskX/Y, AtDesk, AutoEntryId, AutoKind.
Auto-timer UNIFICADO (reunião+mesa) via AutoEntryId/AutoKind: StartAutoEntryAsync (só se não há
timer aberto), CloseAutoEntryAsync (fecha+XP), CloseAutoIfKindAsync. Hub.SitAt(tileX,tileY):
sentar na própria mesa com task ativa → inicia timer da task; levantar → fecha. Join calcula
desk por rank entre não-bots. Endpoints: POST /api/me/active-task (valida assignee+não-done),
GET /api/desks, /api/me expõe activeTask+desk. Seed dá task ativa default por dev. Spawn movido
p/ centro (17,11). BANCO RECRIADO (coluna nova; EnsureCreated não migra) — rodar DLL direto
(dotnet run detached não persistia; usar bin\Debug\net10.0\VirtualOffice.Api.dll).
Cliente Unity (COMPILA LIMPO, visual em verificação): OfficeMap refeito com 4 salas (paredes+porta+
piso madeira), reunião norte-centro, café sul-centro, open space meio; Build(parent, JArray desks)
desenha placas "Sala de X" + kanban (single 171) + mesa (227) + cadeira=sitspot. Zones meeting
(13,1,11,6) coffee (13,15,11,6). LocalPlayer envia SitAt ao sentar/levantar, abre seletor de task
com E perto do kanban (KanbanTile de /api/me), dica de proximidade. WorkPanels: botão ★ Ativar por
task + destaque da ativa + OpenActiveTaskPickerAsync. HUD.SetActiveTask mostra task ativa.
OfficeGame busca /api/desks e passa ao mapa; handler evento "ActiveTask". DevShots teleporta p/
centro (overview) e sala do Paulo. build-and-shot.ps1 precisa 6s entre compile e shots (lock).
**OVERHAUL DA UI (2026-07-09, ENTREGUE+VERIFICADO)**: usuário disse UI "feia e quase
inutilizável". Criado Ui/Theme.cs (sistema de design): chrome ESCURO quente translúcido
(#231f1b) + texto claro (lê muito melhor sobre o mapa claro que o creme antigo), tipografia
com hierarquia (H1/H2/Body/Small/Tiny), componentes: Card (sombra+borda+corpo via SoftArt.
Shadow/Rounded), Button (BtnStyle Primary/Subtle/Ghost/Danger/Good, pílula), Chip, ProgressBar
(SetProgress por ANCHOR não pixel — bug inicial: retornava fill em vez do track e sizeProgress
vazava), Dot, Divider. SoftArt ganhou Pill() e Shadow() p/ 9-slice. Hud.cs reescrito: card de
jogador unificado (avatar+nome+chip nível+barra XP+status+task ativa+timer), chat/AV/online/
toasts/hint/zone-banner/headset/login todos no Theme. WorkPanels reescrito: linhas com tag
colorida por tipo (Task teal/Bug vermelho/Atendimento âmbar), status, ★ Ativa destacada, botões.
API pública da Hud mantida EXCETO SetMe agora (name,colorHex,level,xp,floor,next) — OfficeGame
passa levelFloor. Verificado por screenshot: ficou profissional. GOTCHAS de verificação:
(1) DevShots trava se outra instância Unity segura o projeto — matar Unity.exe antes; (2) após
build batch, o 1º open reimporta/indexa e o DevShots sai antes do Play — rodar DevShots 2x
(1ª importa, 2ª captura). Seed: TSK-2 tinha virado Done no office.db (persistente) deixando
Paulo sem tasks — recriar office.db resolve; dei TSK-8 ao Paulo p/ robustez.
**PIVÔ p/ APP WEB MODERNO (2026-07-09)**: usuário frustrado — UI do jogo (uGUI) "feia e quase
inutilizável", quer "estilo web, kanban de verdade"; jogo Unity tb "quebrado/animação ruim".
Fui honesto: uGUI na mão não vira UI web-quality; kanban é coisa de web app. AskUserQuestion →
usuário escolheu "App web moderno + kanban". Node NÃO instalado (mas não precisa). CONSTRUÍDO
app web novo servido pelo backend C# (wwwroot), ES modules puros, SEM build:
- DELETADOS os js do cliente-jogo web legado (office/av/tasks/timesheet/reports/profile antigos).
- css/app.css = design system moderno (tema claro pro, acento #7c5cff, tokens, sombras, radius,
  componentes: btn/input/badge/avatar/kcol/kcard/modal/toast/sidebar). Estilo Linear/Height.
- js/api.js (fetch+helpers h()/avatar/toast/modal), main.js (shell sidebar+topbar+router+login+
  sessão+hub SignalR compartilhado), board.js (KANBAN drag-drop 5 colunas, filtros sprint/resp/
  tipo, PATCH otimista), task-modal.js (criar/editar+definir ativa), backlog.js (tabela),
  hours.js (timesheet semanal+lançamento), reports.js (gráficos CSS), profile.js (nível/objetivos/
  ranking/skins), meeting.js (call LiveKit via SetZone meeting→token), chat.js (presença+chat hub).
VERIFICADO no preview (localhost:5210, Claude Preview MCP): login ok, 5 colunas/13 cards, cards
brancos sombra radius draggable, modal abre (9 campos), **drag-drop TSK-3 Todo→Review persistiu
no backend**, todas as 7 páginas carregam sem erro no console. Ficou realmente profissional.
Screenshots do preview vêm downscaled (~800px) — verificar detalhe via preview_eval/inspect.
Backend: rodar via bin\Debug\net10.0\VirtualOffice.Api.dll (dotnet run detached não persiste);
preview_start usa launch.json (dotnet run) na porta 5210 — parar dotnet manual antes.
**HUD UNITY EM UI TOOLKIT (2026-07-10)**: usuário esclareceu que a reclamação era da UI DENTRO
do Unity (não a web — eu tinha entendido errado e feito o web app). Migrei a HUD uGUI → **UI
Toolkit** (o jeito certo de UI web-like no Unity: USS = CSS). Arquivos: Assets/Resources/UI/
AppTheme.tss (importa unity-theme://default + app.uss), app.uss (design system tema claro
moderno: tokens, .card/.btn/.badge/.avatar/.kcol/.kcard/.sheet/.login etc), UiKit.cs (fábrica
VisualElement), Hud.cs REESCRITO em UITK (PanelSettings+tema criados em runtime; player card,
chat, banner, fone, AV bar, online, toasts, login — mesma API pública), WorkPanels.cs REESCRITO
como painel deslizante (sheet) com KANBAN de 5 colunas + horas. Theme.cs (uGUI) DELETADO.
**GOTCHA**: precisou adicionar "com.unity.modules.uielements":"1.0.0" ao manifest (senão
VisualElement/Button/Label não resolvem — CS1069 "forwarded to UnityEngine.UIElementsModule").
VERIFICADO via DevShots: HUD renderizou LINDA (card branco, chip roxo, barra XP, chat estilizado,
pílula de dicas) e o kanban in-game ficou profissional (colunas com dots/contadores, cards com
epicbar/badge/código/★Ativar/→, task ativa destacada). Foi o resultado que o usuário queria.
DevShots.OpenTasksPanel abre o kanban p/ shot-2. shot.ps1 = captura standalone (compile já ok).
Lembrete build: "COMPILE_LIMPO" do build-and-shot pode ser cache falso qdo há lock; conferir
batch log direto. UITK compila só com o módulo uielements no manifest.
**KANBAN IN-GAME REFINADO (2026-07-10)**: WorkPanels UITK ganhou drag-and-drop (PointerDown
com limiar 6px → CapturePointer → ghost .drag-ghost seguindo o cursor → hit-test col.worldBound
→ PATCH status no drop), filtro de sprint (DropdownField, default sprint ativo), toggle escopo
Minhas/Todas (.seg), avatar do responsável no card. Verificado: toolbar+colunas+avatares
renderizam lindo. FIX importante: o chat TextField UITK auto-focava no start e roubava o teclado
(WASD virava digitação) — corrigido com blur agendado no start (schedule ExecuteLater 60ms),
Enter foca / Enter-envia+Blur / Esc limpa+Blur (Hud). Confirmado: chat mostra placeholder, não
focado. Estilos de drag/toolbar em app.uss (.kcard-dragging/.kcol-drop/.drag-ghost/.seg/.wdrop).
**REFATORAÇÃO VISUAL/ANIMAÇÃO DO JOGO (2026-07-10)** — código pronto e compila limpo, mas SEM
screenshot de verificação (ver bloqueio abaixo):
- **BUG de direção corrigido** (era a "animação ruim"): as folhas LimeZu (run/idle_anim/sit,
  24 frames = 6/direção) estão na ordem real **down(0-5), up(6-11), left(12-17), right(18-23)**.
  O código mapeava right→0(=down) e down→3(=right), então andar p/ direita mostrava o boneco de
  frente. Corrigido em LimeCharacter.Tick (dirIndex: up=1,left=2,right=3,default down) e comentários
  em LimeArt. Confirmei a ordem inspecionando a folha Adam_run ampliada.
- **Timing de animação**: run 10fps, idle 4.5fps, acumulador limitado `(_animT+dt*fps)%6` (sem drift).
- **Sombras de contato**: SoftArt.GroundShadow() (elipse difusa); OfficeMap.ContactShadow desenha
  sob cada móvel (escala pela largura) e cadeira (order-1, acima do piso/abaixo do móvel). Sombra
  do personagem afinada (LimeCharacter shadow scale .62x.6, SoftArt.CharShadow alpha .3).
- **Pisos sem costura + paleta quente**: removido o xadrez `(x+y)%2` (quebrava a textura). Agora
  FloorBlockFor devolve bloco (col,row,w,h) do atlas e amostra `RbTile(c+Mod(x,w), r+Mod(y,h))`.
  Blocos: open=madeira(13,5), dev=carpete cinza(10,7), meeting=oliva(13,9), coffee=terracota(10,11),
  todos 3x2. (Atlas room_builder = 16col x 14row; cols 10-15 são pisos "fill" sem borda.)
- Arquivos: LimeCharacter.cs, LimeArt.cs, SoftArt.cs, OfficeMap.cs (Game); DevShots.cs (Editor).

**BLOQUEIO DE CAPTURA HEADLESS (2026-07-10)**: nesta sessão o editor Unity NÃO roda em Play/render
— em -batchmode o editor encerra assim que `-executeMethod` retorna (antes do loop de screenshots);
sem -batchmode o editor GUI sai ao entrar em Play (Game view não apresenta em sessão sem desktop) e
com domain reload ativo trava no abort de thread SignalR/LiveKit (`abort_threads`). No fim o Unity
parou de iniciar (nenhum log gerado — licenciamento/gráfico). COMPILA LIMPO: uma run chegou a
"Entering Playmode" (só ocorre pós-compile limpo). DevShots foi endurecido: Run() só arma a flag;
o runner espera compilar (isCompiling/isUpdating) e entra em Play sozinho; captura via
Camera→RenderTexture→EncodeToPNG (shot-1 open space; shot-2 close-up andando p/ direita = prova do
fix). shot.ps1 voltou a NÃO usar -batchmode. EditorSettings.asset revertido (EnterPlayModeOptions
off). PENDENTE: rodar shot.ps1 quando a máquina tiver desktop/gráfico ativo p/ validar visualmente.

**CAPTURA HEADLESS DESTRAVADA (2026-07-10)** — RESOLVIDO o bloqueio anterior:
- Causa-raiz das falhas: EU matei o processo **Unity Hub** nas limpezas → licensing daemon morreu
  → `Unity.exe` saía instantâneo (0s, sem log). Além disso, editor GUI/Play não renderiza a partir
  da minha sessão de background sem desktop interativo. **Lição: NÃO matar "Unity Hub.exe"** (o
  shot.ps1 já filtra só `*Hub\Editor*Unity.exe`); se o editor sair em 0s, reiniciar o Hub
  (`C:\Program Files\Unity Hub\Unity Hub.exe`).
- SOLUÇÃO confiável: `DevShots.RenderStatic` — render SÍNCRONO em edit mode (sem Play, sem backend,
  sem janela): monta OfficeMap com desks fake + 3 personagens em poses (right/down/up), renderiza
  Camera→RenderTexture→EncodeToPNG. Saída: Logs/shot-map.png (mapa) e shot-close.png (close).
  Rodar: `Start-Process Unity -Wait -PassThru -ArgumentList -batchmode,-projectPath,"<quoted>",
  -executeMethod,OfficeQuest.EditorTools.DevShots.RenderStatic,-quit,-logFile,"<quoted>"`.
  CRÍTICO: aspas embutidas nos paths (têm espaço "Claude Sessions") senão exit=1 sem log. Sandbox
  bloqueia Remove-Item perto do path do Unity — não pré-deletar PNGs, usar LastWriteTime.
- Agora dá pra ITERAR visualmente ~1min/ciclo. O DevShots antigo (Runner por Play/screenshot)
  continua no arquivo mas é frágil; usar RenderStatic.

**FIXES VISUAIS VERIFICADOS (2026-07-10)** com o render acima:
- PAREDES: eram faixas brancas horríveis (WallTop=(11,2) = branco chapado). Removida a heurística
  face/topo; agora parede = tijolo cinza sólido único `RbTile(1,8)`. Sem branco, coerente.
- PISO open space: de cinza frio (13,5, que eu achei que era madeira) → tan quente **(13,7)**.
  Dev=(10,7) cinza, meeting=(13,9) tan, coffee=(10,11) terracota. Atlas: cols 10-15 = pisos fill;
  cols 0-9 = blocos de parede com "cap" branco no topo (por isso o branco).
- Confirmado no render: direções OK (frente/costas/perfil), sombras de contato sob tudo, mapa
  coeso e quente. FALTA p/ o salto "Eastward": luz 2D (URP), pixel-perfect camera, dimensão nas
  paredes (cap/topo). Personagens/móveis/sombras já estão bons.

**CHAT/MOVIMENTO (2026-07-10)**: o campo de chat (UITK) prendia o teclado (WASD não andava) porque
`_typing` dependia de eventos de foco racy. Agora determinístico: OpenChat()/CloseChat() setam
`_typing` na hora; Enter abre, Enter/Esc fecham+Blur (KeyDown com TrickleDown). NÃO testado em runtime.

**DECISÃO DO USUÁRIO (2026-07-10)**: migrar o visual do jogo para o PIPELINE 2D REAL do Unity
(import de sprites LimeZu, Tilemap, Pixel Perfect Camera, URP 2D + luzes), uma só linguagem visual,
SoftArt só na UI. Verificação: destravar/rodar o Unity juntos (feito — RenderStatic funciona).
Feedback do usuário: UI ainda ruim (bordas/fonte/cores), jogo estava "muito mais feio que no começo".

**UX UI — CHAT + MOUSE (2026-07-10)** (compila limpo; NÃO verificado em runtime — HUD UITK só
renderiza em Play, e RenderStatic não monta a HUD):
- CHAT redesenhado compacto: era um card 380x200 sempre visível ("CONVERSA POR PERTO") que comia a
  tela. Agora `.chat` = container transparente (pickingMode Ignore) bottom-left só com as últimas 5
  msgs em "pílulas" translúcidas (`.chatline`) que somem sozinhas após 9s (fade via transition
  opacity). Input (`.chatinput`) fica ESCONDIDO (display none) e só aparece ao apertar Enter
  (OpenChat mostra+foca; Enter envia / Esc / clicar fora → CloseChat esconde+blur). USS novo em
  app.uss (.chat/.chatlog/.chatline/.chatinput). Removido _chatLines.
- MOUSE (LocalPlayer): clique-para-andar. HandleMouseClick converte tela→mundo→su
  (OfficeMap.WorldToSu novo), respeita HUD via Hud.PointerOverUi (RuntimePanelUtils.ScreenToPanel +
  panel.Pick — passar Input.mousePosition SEM flip). Intenções: clicar no próprio quadro kanban →
  anda e abre (OnKanban); clicar numa cadeira (SitSpots) → anda e senta (SitAtSpot extraído);
  chão livre → só anda. AutoMove move c/ colisão (CanStand) + anti-travamento (_stuckT). WASD tem
  prioridade e cancela o destino. HandleMovement agora retorna bool. Hint atualizada.
- PENDENTE testar no Play: foco/estética do chat e feel do mouse. Verificação da HUD headless
  segue sem solução (UITK→RT síncrono é complicado); usar Play do usuário.

**MIGRAÇÃO PIPELINE 2D — PASSOS 1-2 FEITOS (2026-07-10)** (usuário aprovou 1 a 4):
- **URP 17.6.0 instalado** (manifest; versão veio do template 2D do editor em
  Editor/Data/Resources/PackageManager/ProjectTemplates/*.tgz — extrair com tar p/ achar versão).
  Core/shadergraph 17.5 resolvidos. Antes era Built-in RP.
- **URP Asset + 2D Renderer criados por script** (UrpSetup.SetupUrp2D): Renderer2DData +
  UniversalRenderPipelineAsset.Create(rd), salvos em Assets/Settings/, atribuídos via
  GraphicsSettings.defaultRenderPipeline + QualitySettings.renderPipeline. Rodar:
  -batchmode -executeMethod OfficeQuest.EditorTools.UrpSetup.SetupUrp2D -quit.
- **RenderStatic adaptado p/ URP**: cam.Render() não funciona em SRP; usa
  RenderPipeline.StandardRequest + cam.SubmitRenderRequest (via RenderPipelineManager.currentPipeline).
- **Mipmaps ligados no LimeArt.Tex** (mipChain=true): sem eles o URP 2D esfarelava os sprites de
  16px no zoom-out. Point filter mantido. Corrigiu o garble do overview.
- **Luz 2D (Light2D)**: OfficeMap.BuildLighting = 1 global (LightType.Global, warm-neutral
  1.0/0.96/0.88, intensity 0.9) + pontos quentes nas mesas/reunião/café (Point, radius 7-8,
  intensity 2-2.2). Material Sprite-Lit compartilhado (GameLit.Lit() =
  "Universal Render Pipeline/2D/Sprite-Lit-Default") aplicado a TODO sprite do mundo (OfficeMap.Spawn,
  ContactShadow, LimeCharacter corpo+sombra) via GameLit.Apply(sr).
- **VERIFICADO headless**: mundo renderiza sob URP (close-up perfeito, mapa limpo a size 10),
  compila limpo, luz GLOBAL aplica. **NÃO verificável headless**: as POÇAS das luzes pontuais
  (SubmitRenderRequest em edit mode não renderiza Point Light2D) — só no Play. Também precisa Play
  p/ confirmar que HUD/chat/mouse/movimento seguem ok sob URP.
- shot-map a size 12 esfarela (além do zoom máx do jogo=10); shot ajustado p/ size 10.

**PASSO 3 FEITO (2026-07-10)** — Pixel Perfect Camera: OfficeGame.SetupCamera adiciona
`PixelPerfectCamera` (assetsPPU=16, ref 320x180, upscaleRT=false, pixelSnapping=true). O zoom livre
(scroll→orthographicSize) virou DISCRETO: LocalPlayer.LateUpdate muda `_ppc.refResolutionX/Y` entre
níveis 256x144..512x288 (16:9, altura múltipla de 36). Removido _targetZoom. `using
UnityEngine.Rendering.Universal` em OfficeGame e LocalPlayer. Compila limpo. NÃO verificável headless
(PPC afeta a câmera do jogo; RenderStatic usa câmera própria) — precisa Play.

Passo 4 (densidade SoftArt): recomendei PULAR — baixo valor, mexer em SoftArt.Ppu quebra tamanhos.

**DECISÃO (2026-07-10): USUÁRIO VAI RECOMEÇAR O CLIENTE DO JOGO DO ZERO.** Feedback: "está tudo
tenebroso... tudo que você faz só piora". Frustração legítima — resultado visual não chegou e o loop
de verificação headless (sem GUI) inviabilizou iterar em arte. Escrevi handoff completo em
`virtual-office/HANDOFF.md` (visão, estrutura, ONDE estão os assets LimeZu, backend/web/Unity script
a script, conceitos, avaliação honesta do que deu errado, e recomendações pra recomeçar).
- MANTER: backend C# (sólido), app web (wwwroot), LiveKit. REFAZER: só o cliente Unity.
- Causa-raiz do visual ruim (documentada): carregar arte em runtime (contorna o editor/import/atlas/
  tilemap), 3 estilos misturados (pixel+vetor SoftArt+TextMesh), mapa por heurística, URP colado no
  fim, e sobretudo o loop de trabalho às cegas (arte exige feedback visual em tempo real).
- Recomendação p/ recomeçar: template "2D (URP)", importar sprites pelo editor (PPU16/Point/mipmaps/
  atlas), mapa em Tilemap, Pixel Perfect Camera desde o início, Light2D, Animator; reaproveitar
  Api.cs/MiniSignalR.cs e o contrato de server units (28/tile) + OfficeLayout.
- Fatos úteis p/ o recomeço: chars LimeZu 16x32, 24 frames=6/dir, ordem down/up/left/right;
  room_builder.png 16x14 (cols 10-15 pisos, 0-9 paredes); backend porta 5210.

**RECOMEÇO DO CLIENTE INICIADO (2026-07-10)** — modo de trabalho **HÍBRIDO GUIADO** (usuário
escolheu via AskUserQuestion): EU escrevo todo código + um script de editor que constrói o projeto
pelo pipeline REAL (AssetDatabase), o USUÁRIO abre o Unity, roda o menu, dá Play e me manda print.
NÃO tentar Unity headless (trava por licença/sem-desktop nesta sessão — foi o loop cego que estragou
tudo; lição registrada). Reconstrução IN-PLACE em `office-unity` (reusa ProjectSettings/URP2D já
válidos e resolvidos, em vez de bootstrap de projeto novo às cegas). Cliente antigo arquivado em
`office-unity/_legacy_client/` (fora de Assets; só Net/ Api.cs+MiniSignalR.cs mantidos — sólidos).
- **Incremento 1 ENTREGUE (código, não verificado ainda)**: offline, puramente visual — andar com
  Adam num quarto Tilemap + Light2D + Pixel Perfect Camera. Arquivos NOVOS: `Assets/Art/Rooms/room_builder.png`
  + `Assets/Art/Chars/*` (arte COPIADA de StreamingAssets pra virar asset importado de verdade);
  `Assets/Scripts/Game/CharacterAnimator.cs` (anima por sprites FATIADOS, ordem down0/up1/left2/right3,
  6/dir), `PlayerController.cs` (WASD + Rigidbody2D dinâmico + colisão TilemapCollider2D), `CameraFollow.cs`;
  `Assets/Editor/OfficeBuilder.cs` = menu **"Office Quest ▸ Rebuild (Incremento 1)"** que configura
  importers (PPU16/Point/no-compress/mip via importer.spritesheet), fatia chars 16x32 e room 16x16,
  cria Tiles (floor=rb_13_7, wall=rb_1_8), material Sprite-Lit, prefab Player e a cena Office.unity.
- Manifest ganhou `com.unity.2d.sprite` + `com.unity.2d.tilemap` + `com.unity.modules.tilemap` (todos
  BuiltIn "1.0.0" neste editor — resolvem sem rede; confirmado no ProjectTemplates 2D). URP2D.asset já
  atribuído em Graphics/QualitySettings e referencia Renderer2D (2D Renderer) → Light2D funciona.
- Guia de execução + roadmap dos 6 incrementos em `office-unity/NEW_CLIENT.md`. **Riscos conhecidos a
  validar no 1º Play do usuário**: importer.spritesheet é obsoleto (warning, mas funcional) — se não
  fatiar, migrar p/ SpriteDataProviderFactories; nomes de props do PixelPerfectCamera (usei só os 3
  estáveis: assetsPPU/refResolutionX/refResolutionY). PENDENTE: usuário abrir, confirmar compile limpo
  + rodar Rebuild + Play + mandar print. Só então Incremento 2 (móveis/salas).

**SNAPSHOT "VERSÃO ANTIGA" CRIADO (2026-07-13)**: usuário quis apresentar o projeto antigo →
criei `C:\Users\prs\Claude Sessions\virtual-office-antigo\` = cópia AUTÔNOMA e rodável do sistema
ANTES da reconstrução (backend + web + livekit + cliente Unity antigo restaurado dos scripts de
`office-unity/_legacy_client/`). Excluídos Library/bin/obj/office.db (regeneram; db some → seed fresco
sem timer preso). Manifest revertido (tirei 2d.sprite/2d.tilemap/modules.tilemap que só o cliente novo
usa). Guia em `virtual-office-antigo/APRESENTACAO.md`. Projeto novo em `virtual-office/` segue intacto.
AMBOS usam porta 5210 no backend — rodar um de cada vez. NOTA: o usuário tinha apontado o Unity Hub
para a pasta `_legacy_client` (ela virou um projeto Unity aninhado meio quebrado com Assets/Library
criados em 14:36) — não é a forma certa de rodar o antigo; usar `virtual-office-antigo/office-unity`.

**ORDEM DAS FOLHAS LimeZu — DEFINITIVO (2026-07-13, verificado nos PIXELS ampliados)**: a ordem
real dos 24 quadros (6/direção) das folhas run/idle/sit é **right(0-5), up(6-11), left(12-17),
down(18-23)** — NÃO é down/up/left/right como o HANDOFF e a nota de 07-10 diziam (ambos ERRADOS; a
nota de 07-09 "right,up,left,down" estava certa). Prova: grupo0 = perfil lateral (um olho só),
grupo1(quadro6) = nuca/costas = up. No cliente NOVO, CharacterAnimator usa `DirGroup={3,1,2,0}`
(Down→18, Up→6, Left→12, Right→0). Sintoma quando errado: "andar pra baixo mostra o boneco de lado"
(Down mapeava pro grupo do Right). Método p/ verificar sem chutar: PowerShell System.Drawing recorta
quadros 0/6/12/18, escala NearestNeighbor, salva PNG no scratchpad, e eu leio a imagem.

**INCREMENTO 1 VERIFICADO OK (2026-07-13)**: usuário rodou Rebuild+Play. FIX de tilemap vazio:
OfficeBuilder.BuildScene precisou de `CompressBounds()+RefreshAllTiles()` nos tilemaps + `SetDirty`
+ `EditorSceneManager.MarkSceneDirty(scene)` antes de SaveScene — sem isso o SetTile só ficava em
memória e a cena salvava Tilemap vazio (m_TileAssetArray:[], m_Size 0 → piso/parede invisíveis, boneco
flutuando). **A peça CRÍTICA e fácil de esquecer é `EditorUtility.SetDirty(tilemap)` em CADA tilemap
antes do SaveScene** — sem ela, CompressBounds+RefreshAllTiles+MarkSceneDirty NÃO bastam e os tiles
não persistem (aconteceu de novo no Incremento 2 quando reescrevi o OfficeBuilder e esqueci o SetDirty:
piso/parede sumiram mas móveis apareceram). Receita completa: pintar → CompressBounds → RefreshAllTiles
→ SetDirty(tm)+SetDirty(tm.gameObject) em cada → MarkSceneDirty(scene) → SaveScene. Depois do fix Inc1:
piso tan + paredes de tijolo + poças de luz quentes + pixel-perfect 1080p,
tudo renderizando lindo. Pixel Perfect reclama de resolução ímpar → setar Game view p/ resolução fixa
(Full HD). Falta só o fix de direção (acima) que é runtime (não precisa re-Rebuild).

**ESTILO/TILES DO ESCRITÓRIO (2026-07-13)**: usuário achou tijolo="dungeon" e piso tan="estranho".
Método que funcionou: renderizar mocks (PowerShell System.Drawing) ANTES de pedir Rebuild — atlas
rotulado (rb_col_rowTop), mini-salas de combos piso+parede, e o 1º frame de `6_Office_Designs/
Office_Design_1.gif` como referência do look certo (paredes brancas + piso tile cinza + mesas com
tampo). Decisões: usar o room builder do PACK DE OFFICE (`Modern_Office_Revamped_v1.2/1_Room_Builder_
Office/Room_Builder_Office_16x16.png`, copiado sobre Assets/Art/Rooms/room_builder.png) — mesma grade
16x14. Piso = rb_11_9 (tile cinza), parede topo = rb_11_3 (branco), parede FACE = rb_11_6 (cinza).
Paredes ganham altura via regra: onde o vizinho ao SUL de uma parede é chão, pinta wall_face lá (2 tiles
= topo+frente). MESA de verdade = tampo `desktop`(#219) sólido 2-tiles + monitor `desk`(#227) 1 tile
acima com sortingOrder+2 (senão vira "monitor flutuando"). Cadeiras direcionais: #101 down("chair"),
#105 up("chair_up"), #103 left, #104 right. Luz NATURAL = Global Light2D intensity ~0.92 (1.45 estoura
tudo p/ branco e vira "dungeon"). **DECISÃO (2026-07-13): próximo = EDITOR DE MÓVEIS in-game** (colocar/
mover/girar/apagar na grade, ao vivo) — o usuário compõe com o próprio olho (fim do chute cego) e isso
JÁ É a base da customização de salas por usuário (Incremento 3). Cat álogo: office singles 16x16 têm 339
peças 32x48 RGBA (StreamingAssets/LimeZu/singles/Modern_Office_Singles_N.png). CHARACTER GENERATOR 2.0 +
moderninteriors-win completo (comprados) têm partes modulares (Bodies/Eyes/Outfits/Hairstyles/Accessories)
p/ customizar o boneco ANDANDO — ordem de empilhamento Body→Eyes→Outfit→Hairstyle→Accessory.

**VIRADA P/ AUTORIA À MÃO (2026-07-13)** — usuário frustrado ("resultado deprimente") perguntou por
tutorial/doc; fui honesto: eu vinha GERANDO o mapa por código (procedural, às cegas) = ferramenta
errada p/ level design. O certo/documentado: Unity **Tile Palette** (pintar à mão) + **RuleTile**
(paredes autoconectam, pacote com.unity.2d.tilemap.extras) + móveis como **prefabs**. Causa de fundo:
EU não enxergo o editor e level design exige ver → quem desenha tem que ser o usuário (que enxerga).
Usuário ESCOLHEU fazer à mão com as ferramentas certas (é iniciante, quer orientação). VISÃO do mapa:
prédios + cômodos fixos (nós desenhamos) + salas que um usuário é DONO e customiza livremente (dado no
backend por dono, modo edição in-game). Modelo Gather/Habbo. PLANO em etapas: (1) montar ferramentas +
ensinar a pintar 1 cômodo [FEITO], (2) paredes autoconectáveis (RuleTile), (3) vários cômodos+portas,
(4) salas de usuário (edit mode + salvar backend). ENTREGUE Etapa 1: `Assets/Scripts/Game/YSort.cs`
(ordena sprite por Y), `Assets/Editor/Authoring.cs` = menu **"Office Quest ▸ Setup Authoring Tools"**
(cria tiles em Assets/Tiles, 1 prefab por móvel em Assets/Prefabs/Furniture c/ collider+YSort, e cena
limpa **Assets/Scenes/MyOffice.unity** pronta pra pintar). Guia iniciante em `office-unity/AUTORIA.md`
(criar Tile Palette via GUI + pintar piso/parede + arrastar móveis). Pré-req: rodar Rebuild 1x antes
(importa arte). Usuário edita MyOffice.unity (não Office.unity, que o Rebuild sobrescreve). PENDENTE:
usuário pintar 1º cômodo e mandar print → então Etapa 2 (RuleTile de parede, testar mapping via mock).

**MCP DO UNITY CONFIGURADO (2026-07-13)** — pra resolver o trabalho às cegas. Tentei 1º o oficial
`com.unity.ai.assistant` mas era pre-release/menu mudou/pode exigir plano; usuário instalou Node e pediu
"do jeito certo". Fui de **mcp-unity (CoderGamester)**, servidor Node. FEITO PELO CLAUDE (validado):
(1) `git clone https://github.com/CoderGamester/mcp-unity.git` → `C:\Users\prs\Claude Sessions\mcp-unity-server`;
(2) build: `PATH+=/c/Program Files/nodejs; cd Server~; npm install; npm run build` → gerou
`mcp-unity-server/Server~/build/index.js` (v1.3.0); (3) pacote Unity no manifest:
`"com.gamelovers.mcp-unity": "https://github.com/CoderGamester/mcp-unity.git"`; (4) config Claude Code em
`C:\Users\prs\Claude Sessions\.mcp.json` (mcpServers.mcp-unity → command="C:\\Program Files\\nodejs\\node.exe",
args=[".../mcp-unity-server/Server~/build/index.js"], env UNITY_PORT=8090). GOTCHA: Node instalado em
`C:\Program Files\nodejs` (v24) mas NÃO no PATH do shell — usar caminho completo. PENDENTE (usuário, guia
em `office-unity/MCP_SETUP.md`): (a) Unity importar o pacote → menu Tools ▸ MCP Unity; (b) Tools ▸ MCP
Unity ▸ Server Window ▸ Start Server (WebSocket porta 8090); (c) REINICIAR Claude Code (nesta pasta) e
aprovar o server mcp-unity. **Só funciona na PRÓXIMA sessão** (MCP carrega no início). Na próxima sessão:
testar chamando uma tool do mcp-unity (ler cena/console) — aí eu enxergo o editor de verdade.

**MCP UNITY FUNCIONANDO (2026-07-13)**: diagnóstico — bridge conectava mas Unity respondia em ~13s
(> timeout 10s) porque `EditorApplication.delayCall` só roda no tick do editor e o Unity em background
era throttled. Usuário setou Interaction Mode = No Throttling → resolvido. Agora dá pra ver hierarquia/
console/Play e dirigir o editor via MCP. Obs: bridge Node lê McpUnitySettings.json do cwd dele
(`Claude Sessions\ProjectSettings\` — não existe; usa default 10s).

**PLANO CLIENTE V2 (2026-07-13)**: usuário pediu plano de recriação do cliente Unity do zero →
`virtual-office/PLANO_CLIENTE_V2.md`. 10 fases: F0 limpeza in-place / F1 pipeline de assets (16px,
RuleTiles, prefabs) / F2 sala de referência transcrita de 6_Office_Designs (GATE visual) / F3
personagem+feel (avatar JÁ em camadas Body→Eyes→Outfit→Hairstyle→Accessory, premades 16x16) / F4
usuário PINTA os prédios (Tile Palette; eu superviso via MCP) / F5 rede / F6 interações / F7 LiveKit
embedded / F8 salas customizáveis por dono (edit mode + backend) / F9 PERSONALIZAÇÃO DO PERSONAGEM
(pedido explícito do usuário: partes do Character_Generator 16x16 in-game + aparência no perfil/
SignalR + outfits como drops; usuário opera os .exe Character Generator 2.0/Portrait Generator p/
premades, bots e retratos; F9 pode rodar em paralelo pós-F3) / F10 polimento. Mundo = prédios estáticos (mapas interiores ligados por lobby) + cômodos editáveis pelo
dono. Divisão explícita: eu faço código/pipeline/verificação; usuário pinta mapas, aprova gates,
testa feel/A/V. Decisão pendente: comprar Modern Exteriors p/ mundo externo. AGUARDANDO aprovação
do plano p/ iniciar F0.

**F0 EXECUTADA — RECOMEÇO DO ZERO (2026-07-14)**: usuário aprovou o PLANO_CLIENTE_V2 e, via
AskUserQuestion, escolheu "recomeçar do zero mesmo" (não construir sobre a base) — CIENTE de que
o office-unity já tinha o Incremento 1 verificado + pipeline bom (eu mostrei os scripts antes de
perguntar). Unity estava FECHADO (verificado: nenhum processo Unity) → arquivamento no disco seguro,
sem conflito de .meta. Cliente MOVIDO (reversível) p/ `office-unity/_legacy_client_v2/Assets/`:
Art, Editor, Palettes, Prefabs, Resources, Scenes, Tiles, Scripts/Game (com .meta). PRESERVADO em
Assets/: `Settings/` (URP2D.asset + Renderer2D.asset), `UniversalRenderPipelineGlobalSettings.asset`
+ `DefaultVolumeProfile.asset` (raiz), `StreamingAssets/LimeZu/` (354 arquivos = chars/singles/
room_builder, meu INPUT de import), `Scripts/Net/` (Api.cs + MiniSignalR.cs — grep confirmou zero
refs a Game/LiveKit, compila sozinho). Manifest intacto (URP 17.6, 2d.sprite/tilemap, modules.tilemap/
uielements/physics2d, newtonsoft, unitywebrequest). NÃO removi LiveKit do manifest (cached em Library,
inofensivo; plano manda migrar p/ embedded file: só na F7 — não mexer agora p/ evitar re-resolve).
FALTA p/ F1: adicionar `com.unity.2d.tilemap.extras` (RuleTile). **Sorting layers DEFERIDAS p/ F2**
(construção de cena) com CORREÇÃO: a lista do plano (Ground<Walls<Furniture<Characters<Above<Lights)
está ERRADA p/ top-down — móveis e personagens têm que Y-interpolar na MESMA layer dinâmica (senão
personagem sempre desenha sobre todo móvel), e Light2D MIRA sorting layers, não é uma. Vou usar
Ground/Walls/Dynamic/Overlay + Y-sort dentro de Dynamic. **BLOQUEIO**: MCP deu timeout (expirou 60s
na fila) na 1ª chamada real desta fase — Unity precisa estar ABERTO + focado + No Throttling p/ o MCP
responder. Verificação da F0 (projeto abre limpo, compila sem erro de órfão) PENDENTE de abrir o Unity.

**MCP INUTILIZÁVEL NA SESSÃO 07-14 + CONSERTO P/ PRÓXIMA (2026-07-14)**: mesmo com No Throttling
ATIVO (usuário confirmou) e Unity aberto/ocioso, cada chamada MCP leva >10s e o bridge fecha o socket
antes → Unity loga `[MCP Unity] WebSocket error: An error has occurred in sending data` (resposta chega
tarde demais). Teste WS direto: conecta mas 0 resposta em 30s (pior que os 13s de antes do arquivamento).
Causa: o timeout do BRIDGE (Node) é 10s por padrão, lido do cwd do bridge (`C:\Users\prs\Claude Sessions`)
que não tinha ProjectSettings. NÃO dá p/ mudar o bridge no meio da sessão (lê config só no start).
CONSERTO aplicado p/ PRÓXIMA sessão: criei `C:\Users\prs\Claude Sessions\ProjectSettings\McpUnitySettings.json`
com `{"Port":8090,"RequestTimeoutSeconds":60}` — o bridge vai esperar 60s e tolerar a lentidão do Unity.
(Se ainda falhar, o gargalo é o Unity não tickar o delayCall quando sem foco — manter janela em foco.)
Nesta sessão seguimos em MODO GUIADO (eu escrevo editor script, usuário roda menu + manda Console/print).

**F1 INICIADA — MODO GUIADO (2026-07-14)**: catálogo confirmado no disco: chars 12 folhas 384x32
(24 quadros 16x32), room_builder 256x224 (grade 16x14 @16px), 339 singles `Modern_Office_Singles_N.png`
32x48 @16px. (Cheguei a pôr `com.unity.2d.tilemap.extras": "4.1.0"` no manifest mas REVERTI —
versão não confirmada p/ Unity 6.5 poderia dar erro de pacote ao abrir e travar o MCP; adicionar
via Package Manager UI na F1b, deixando a UI escolher a versão.)
Escrito `Assets/Editor/AssetPipeline.cs` (namespace OfficeQuest.EditorTools, autocontido — não depende de
Game): menu **"Office Quest ▸ 1 · Import Art (F1)"** copia StreamingAssets/LimeZu → Assets/Art (chars,
Rooms/room_builder, Singles/single_N renomeado) e configura importers (PPU16/Point/uncompressed/mipmaps;
chars 24 quadros 16x32 pivô base-centro; room 16x14 rb_col_rowTop; singles Single-mode pivô base-centro)
+ material SpriteLit. StreamingAssets NÃO importa como sprite (é copiado cru p/ build) — por isso a cópia
p/ Assets/Art é obrigatória. PENDENTE: usuário rodar o menu; eu verifico no disco (ler .meta: PPU/slice).
Próximo: F1b (Build Tiles + RuleTiles de parede — preciso renderizar o atlas rotulado p/ mapear as células)
e F1c (1 prefab por móvel). NÃO reconstruí Player/cena (isso é F2/F3).

**GOTCHA LIVEKIT (2026-07-13)**: abrir um projeto Unity NOVO (sem Library) com a dep git
`io.livekit.livekit-sdk` (github client-sdk-unity#v1.4.0) trava "Resolving packages…" por HORAS —
o pacote tem ~1,2GB de libs nativas e o clone git engasga (a Library inchou p/ 4,4G no antigo).
`git ls-remote` é rápido, mas o clone completo não. SOLUÇÃO aplicada no antigo: apontar o manifest
p/ o pacote JÁ resolvido no projeto novo (`virtual-office/office-unity/Library/PackageCache/
io.livekit.livekit-sdk@de76e7f2b545`, 1,2G) copiando-o p/ `Packages/io.livekit.livekit-sdk/`
(embedded) e trocando a dep p/ `"file:io.livekit.livekit-sdk"`; apaguei a Library parcial p/
reimport limpo. Sem git, sem download. Lição p/ o cliente NOVO: adicionar LiveKit só quando for
usar A/V, e preferir embedded/file: em vez da URL git (evita o hang de horas).
