# CONTEXT — Office Quest (escritório virtual da Tooq)

**Atualizado:** 2026-07-28

Visão geral pragmática do projeto: o que é, o que existe, como as peças se conectam e para onde vai.
Detalhes vivem em docs específicos (linkados no fim) — aqui é o mapa mental.

---

## 1. O produto

Escritório virtual estilo **Gather.town** para a **Tooq**: o time fica logado o dia todo, cada
pessoa com um avatar andando por um escritório 2D top-down, com **chat de proximidade**, **A/V**
(LiveKit), integração com **tasks/horas** e **gamificação**.

O jogo tem **várias cenas independentes** e uma **cidade cercada caminhável** que funciona como hub:
nela o jogador escolhe entre Tooq Office, Coworking, Dark Company e a Vila dos Jogadores. Escritórios
reúnem interior mobiliado e áreas externas próprias; elevador/escadas ligam cenas de piso e as casas
do vilarejo apontam para interiores vazios preparados para futura compra.

Entrar é **por link** (abrir a URL e já estar dentro) — foi o motivo de o cliente ser **web**, não
Unity (ver §4).

---

## 2. As peças do sistema

| Peça | Onde | Estado |
|---|---|---|
| **Backend C#** | `backend/VirtualOffice.Api` | ✅ ASP.NET + EF + SignalR. Porta **5210**. **Postgres em tudo**, schema por migrations EF. Ver [`docs/BANCO_POSTGRES.md`](docs/BANCO_POSTGRES.md). |
| **Auth** | `backend/.../Auth.cs`, `AuthEndpoints.cs` | ✅ Login Google (OIDC) + JWT próprio; papéis Member/Manager/Admin. `X-User-Id` sobrevive só via `Auth:DevBypass` (dev). Ver [`docs/PLANO_AUTH.md`](docs/PLANO_AUTH.md). |
| **App web** (tasks/horas) | `backend/.../wwwroot` | ✅ Kanban, backlog, horas, objetivos, relatórios, perfil. ES modules, sem build. |
| **UI de trabalho compartilhada** | `backend/.../wwwroot/shared` | ✅ Kanban/horas/objetivos existem **uma vez só** e rodam no app web e dentro do jogo. Ver [`docs/KANBAN_HORAS.md`](docs/KANBAN_HORAS.md). |
| **LiveKit** | `livekit/` (local) ou **LiveKit Cloud** | ✅ SFU. Local (LAN) ou Cloud (entre redes). URL vem do backend (`LiveKit:Url`). |
| **Contrato de mapa** | `backend/OfficeLayout.cs` | Server units = **28 por tile**. |
| **Cliente do jogo** ⭐ | `client-web/` | ✅ Phaser 3, orientado a dados. Presença em rede, voz por proximidade, xadrez e cardgame social. |
| **Tooq Triad** | `client-web/src/cardgame`, `backend/.../CardGame*.cs` | ✅ 151 Pokémon, álbum e deck persistentes, 3 boosters iniciais e PvP por proximidade. Partidas ainda ficam em memória. Ver [`docs/CARDGAME.md`](docs/CARDGAME.md). |
| **Deploy** | `docker-compose.yml`, `run-beta.ps1` | ✅ Produção (Docker+Postgres+Caddy) e beta local via túnel. Ver [`docs/DEPLOY_DOCKER.md`](docs/DEPLOY_DOCKER.md), [`docs/BETA_TUNEL.md`](docs/BETA_TUNEL.md). |
| Cliente Unity (antigo) | `office-unity/` | ⏸️ Abandonado (ver §4). Mantido só como arquivo. |

---

## 3. O cliente (`client-web/`)

Phaser 3 (vendorizado, sem CDN). **As cenas são dados**, não código: o manifesto
`maps/scenes.json` registra os mapas e `src/MapRenderer.js` desenha tanto mundos quanto interiores.
O runtime troca de mapa e spawn pelos portais. O level design é feito visualmente no **Tiled**;
`src/TiledRuntimeLoader.js` lê `.tmj`, `.tsj` e templates diretamente no navegador. `server.js`
observa os salvamentos, valida todo o projeto e recarrega a cena, sem gerar arquivo intermediário.
A decoração de
móveis feita pelo usuário é uma camada separada, aplicada em tempo real por sala; o editor antigo
foi preservado apenas como referência.

```
client-web/src/main.js          runtime de cenas, player, câmera, HUD e portais
client-web/src/MapRenderer.js   desenha world/interior a partir do JSON
client-web/src/CharacterSystem.js  avatar modular, editor e persistência
client-web/src/RoomDecorationSystem.js  editor de móveis, validação e integração com estoque
client-web/src/GameItemsSystem.js       API de inventário/mobília + cliente SignalR
client-web/src/FurnitureInteractionSystem.js  kanban, baú, cadeira, estação e café
client-web/src/NavigationSystem.js    grade de caminhabilidade + A* + suavização de rota
client-web/src/ClickToMove.js         clique/toque vira destino (só anda; não interage)
client-web/src/TouchControls.js       botão de ação contextual + pinça de zoom
client-web/src/cardgame/CardGamePanel.js  central do jogador, álbum, boosters, deck e partida
client-web/src/mechanics/             registro e handlers extensíveis de gameplay
client-web/src/DevMapSync.js          feedback e recarga do Tiled ao vivo
client-web/src/TiledRuntimeLoader.js  TMJ/TSJ/templates → contrato do renderer no navegador
client-web/maps/scenes.json     manifesto e cena inicial
client-web/tiled/maps/*.tmj       fontes visuais editáveis no Tiled
client-web/tiled/tilesets/*.tsj   tilesets externos carregados diretamente
client-web/maps/*.json            snapshots legados para migração e testes
client-web/tools/tiled-converter.mjs  ferramenta de migração/diagnóstico, fora do fluxo diário
```

### Contrato de itens do Phaser

O backend mantém as tabelas antigas `ItemDefinition`, `InventoryItem` e `RoomItem` para o
app/backoffice legado. **Não use essas tabelas para novas mecânicas do Phaser.** A trilha atual é:

```text
GameItemDefinition  definição do catálogo + InteractionType
GameItemInstance    unidade única, dono e localização
FurniturePlacement  instância colocada, sceneId/roomId/x/y/flipX
```

O schema vem de **migrations EF** (`Migrations/`), aplicadas no boot — os scripts aditivos de SQLite
foram removidos junto com o provider. `GameInventorySeed.RunAsync` **reconcilia** o catálogo curado (acrescenta o que
falta e corrige a interação do que mudou) e dá o estoque inicial. Antes ele só inseria com a tabela
vazia, então mudar a interação de um item não tinha efeito em banco já semeado. Endpoints atuais: `/api/game/inventory`, `/api/game/rooms/{scene}/{room}/furniture`,
`/api/game/furniture`, `/api/game/chests/*` e `/api/game/workstations/*`.

**Schema do mapa, referência de campos e limitações conhecidas:**
👉 [`client-web/README.md`](client-web/README.md).
**Tutorial passo a passo para editar o mundo e escolher uma IDE:**
👉 [`client-web/GUIA-EDICAO.md`](client-web/GUIA-EDICAO.md).
**Fluxo visual no Tiled:** 👉 [`client-web/tiled/README.md`](client-web/tiled/README.md).
**Ruas e estruturas no mundo aberto:**
👉 [`client-web/GUIA-MUNDO-ABERTO.md`](client-web/GUIA-MUNDO-ABERTO.md).
**Padrões de Phaser e debug no navegador:** 👉 [`client-web/TUTORIAL.md`](client-web/TUTORIAL.md).

**Estilo visual:** salão **aberto** estilo Gather — áreas comuns são *zonas* (tapetes de piso, sem
parede: café, lounge e zonas de time); salas de reunião podem ser fechadas. Pisos lisos (não
"dungeon"). Paredes brancas finas + **painéis brancos 3D**; salas com porta deslizante podem usar
também uma face sul de dois tiles para embutir a animação. Estações de trabalho são organizadas em
mesa/computador/cadeira.

---

## 4. Decisões que valem (e por quê)

**Engine = web (Phaser), não Unity.** O produto é "entrar por link"; Unity com esta stack não faz
isso (WebGL não roda `MiniSignalR` nem o SDK ffi do LiveKit ⇒ viraria app desktop). E o ciclo de
trabalho na web é incomparável: roda, olha no navegador, corrige em segundos. **Mantém-se:** backend
C#, app web, LiveKit. **Refez-se:** só o cliente do jogo.

**Onde cada estado mora (3 camadas).** Teste: *dois clientes com os mesmos dados chegam sozinhos
à mesma conclusão?*
1. **Derivado** — sim: não existe estado no servidor. As **portas automáticas** são função pura das
   posições (que a presença já replica), assim como o volume da voz e os prompts de proximidade.
   Antes a porta olhava só o avatar local, e o colega atravessava porta fechada.
2. **Efêmero com dono** — não, mas morre com a sessão: `ClaimEntity`/`ReleaseEntity` no hub
   (`Presence.SceneClaims`, por cena). Hoje: **assento**, **porta trancada**, **reserva de sala**.
   Recusa disputa, um claim por `kind` por conexão e **libera sozinho** ao trocar de cena ou cair.
3. **Persistente** — não e precisa sobreviver ao processo: banco (mobília, inventário, horas, xadrez).

Evitar o reflexo de "põe no servidor": derivar é de graça e nunca dessincroniza. O canal de claims
usa grupo SignalR por cena, mas a **presença segue global** de propósito — a lista de online do app
web depende disso.

**Mapa como dado, não hardcode.** O roadmap pede salas customizáveis pelo dono — só funciona se o
mapa for dado. `.tmj`, `.tsj` e `.tj` são a fonte e são consumidos diretamente pelo navegador; não
há JSON gerado no fluxo diário. O carregador transporta classes novas como entidades genéricas,
tile layers livres como camadas visuais e tilesets externos sem cadastro prévio no conversor. Cada
comportamento é um handler registrado, em vez de outro caso especial no renderer. Salvar no Tiled
valida o projeto e atualiza o jogo automaticamente; erros aparecem sobre o jogo.

No modo `visualMode: "tiled"`, chão/ruas, paredes e cercas são tile layers nativas e desbloqueadas,
não prévias procedurais. Paredes e cercas derivam colisão diretamente dos tiles pintados. O hub
`world` usa um canvas cercado de 220×150 tiles e não possui objeto manual de limite de câmera.
O limite aberto acompanha qualquer redimensionamento feito em **Map → Resize Map** e também cresce
quando um objeto visível é colocado além das bordas do canvas. Estradas e cercas são tile layers; as
quatro bordas e os footprints completos das 15 fachadas são colisões orientadas a dados.

**Fachada bonita + interior grande (não roof-reveal).** Roof-reveal (entrar = remover o teto) amarra
o tamanho do interior ao do telhado ⇒ laje cinza feia em interior grande. Os prédios lindos do Modern
Exteriors são **fachadas em 3/4**, não telhados top-down. Padrão escolhido: fachada por fora +
entrar ⇒ interior grande (estilo Pokémon/Stardew). A fachada **TOOQ** já está pronta
(`assets/world/office_tooq.png`).

**Andares como cenas.** A unidade de navegação continua sendo a cena. Elevador e escadas são
entidades `verticalAccess` que ligam o térreo do Tooq Office às alas pessoais públicas. Novos pisos
reutilizam o mesmo contrato `targetScene`/`targetSpawn`, sem empilhar mapas no mesmo mundo Phaser.

**Estrutura de mundo:**
```
Cidade Tooq (hub cercado 220×150)
        ├── Tooq Office ── elevador/escadas ── alas pessoais públicas
        ├── Coworking
        ├── Dark Company
        └── Vila dos Jogadores ── 12 casas ── interior-base dinâmico
```

**Fluxo atual:** cidade → fachada → interior/quintal → cidade. Objetos volumosos carregam footprints
de colisão no mapa. As fachadas externas bloqueiam todo o retângulo ocupado pelo prédio e o portal
fica acessível do lado de fora. No `scene.restart()`, o renderer limpa móveis, portas e prompts da
cena anterior para não vazar ações como sentar ou pegar café para o mundo. Cenas fechadas podem
manter limites de câmera explícitos; no hub a câmera usa toda a dimensão do mapa.

**Equipamentos implementados:** `Tab` abre um loadout RPG persistente com seis slots (veículo,
corrente, brincos, pulseira, teclado e mouse) e um baú com os itens disponíveis. Clicar no baú equipa
o item no slot correto; clicar no slot o devolve. O slot de veículo oferece skate, patins, patinete
elétrico e moto: segurar `Shift` ativa o escolhido, troca pose/visual e aplica a velocidade definida
em `assets/equipment/catalog.json`; soltar volta imediatamente à caminhada. Os outros slots já têm
itens e persistência, mas ainda não aplicam efeitos ao avatar. `src/EquipmentSystem.js` concentra o
loadout, o perfil de movimento e a pixel art procedural. A moto reutiliza a pose sentada oficial do
Adam; os packs comprados não possuem sprites pessoais adequados para os quatro veículos. Não há HUD
fixo de veículo: o loadout aparece somente enquanto o menu está aberto.
Skate e patins usam uma base corporal estável em vez da corrida; as botas dos patins são renderizadas
sobre os sapatos para permanecerem visualmente presas aos pés.

**Customização do personagem implementada:** o mesmo menu de `Tab` possui a aba `Personagem`, com
prévia nas quatro direções e seleção persistente de pele, olhos, roupa, cabelo e acessório. O avatar
é composto em tempo real por cinco folhas modulares LimeZu alinhadas, tanto no mundo quanto na ficha
RPG. `assets/character/catalog.json` é a fonte de opções e frames; `src/CharacterSystem.js` concentra
validação, `localStorage`, UI e sprites sobrepostos. Caminhada, idle, moto e os outros equipamentos
continuam usando o mesmo corpo físico invisível para não duplicar colisão ou câmera.

**Inventário e decoração persistentes:** cada unidade de mobília é uma instância única no backend,
com dono e localização (`inventory`, `placed` ou `chest`). O editor mostra apenas o estoque real,
consome a instância ao colocar e devolve a mesma unidade ao recolher. Posição, espelhamento, cena e
sala são persistidos atomicamente; SignalR replica inclusão, movimento e remoção para todos que
estão na mesma sala. O Tiled continua fornecendo estrutura e cenário-base, enquanto a decoração do
jogador é uma camada de dados separada. A chave antiga de `localStorage` não participa mais do runtime.
O seed cria duas unidades de cada item curado para cada usuário humano, apenas para validar a
economia; não é uma regra definitiva de balanceamento. O cliente usa `X-User-Id`/`?userId=` no
protótipo e precisa migrar para autenticação real antes de produção.

**Kanban, horas e objetivos — uma UI, dois clientes (feito).** A tela de trabalho não é
reimplementada no jogo: `wwwroot/shared/*` é servido pelo backend e importado tanto pelo
app web quanto pelo `client-web/src/WorkPanel.js` (que só monta as abas e liga o tema
escuro). O quadro ganhou prioridade, etiquetas, checklist, comentários, prazo, bloqueio,
arquivamento, trilha de auditoria e **ordem persistida na coluna**. As horas passaram de
três categorias fixas para um **catálogo de tipos** (`ActivityTypes`) com XP/gold por hora,
atalho de lançamento rápido (6 h de dev, 1 h de pair, 30 min de estudo) e meta diária —
tudo dado, ajustável em `WorkCatalogSeed.cs` sem recompilar. **Objetivos** diários e
semanais recalculam o progresso a partir dos lançamentos (nunca incrementam), então
corrigir um lançamento acerta a meta sozinho. Apagar lançamento **estorna** o que ele
pagou. `Game:WelcomeGrantCoins` credita o bônus do beta (10 000 moedas) uma vez por
usuário, inclusive nos já existentes. Detalhes: [`docs/KANBAN_HORAS.md`](docs/KANBAN_HORAS.md).

**Tooq Triad — coleção persistente e PvP próximo (primeira fatia feita).** `Cartas`, no dock, abre a
Central do Jogador com Álbum, Boosters, Baralho e as mesmas telas compartilhadas de Horas,
Objetivos, Quadro e Backlog. Todo perfil novo do cardgame nasce com álbum vazio e três boosters de
cinco cartas. Coleção, shiny, saldo de boosters e deck de nove cartas ficam no Postgres; o backend
recusa decks com cartas que o jogador não possui. Clicar em outro avatar humano próximo abre o
desafio, e o `OfficeHub` controla mãos privadas, compra automática, turnos, captura e resultado.
O catálogo e os 151 sprites são locais. Partidas ainda são efêmeras e não sobrevivem ao restart.
Detalhes e roteiro de teste: [`docs/CARDGAME.md`](docs/CARDGAME.md).

**Movimento por destino (clique e toque):** clicar ou tocar no chão manda o avatar até lá,
em vez de joystick virtual — um input só serve mouse e celular, e o desktop ganha função em vez
de perder. `NavigationSystem.js` deriva uma grade de caminhabilidade dos **mesmos retângulos de
colisão** que a física usa (`scene.solids`), então nunca diverge do que o jogador vê; a grade é
reconstruída a cada clique (menos de 1 ms no mapa de 220×150) em vez de invalidada, porque
invalidação esquecida vira bug silencioso. A* com corte de quina proibido, mais *string pulling*
para a rota não ficar colada na parede. Blockers de porta ficam **fora** da grade: elas abrem por
proximidade, e como parede nenhuma rota entraria em sala alguma.

**Botão de ação no toque.** No celular não há tecla `E`, então o mesmo prompt que a HUD já
resolve (`activeFurniturePrompt || activeHeadsetPrompt || activePortal`) vira um botão no polegar
direito, com o rótulo do prompt — "Entrar no Tooq Office", "Sentar", "Levantar". Ele **dispara os
mesmos handlers do teclado** (`handleInteract`/`handleHeadset`), então confirmar no celular e
apertar `E` no desktop passam pelo mesmo caminho. O fone tem botão próprio: com um só, pegar o
fone competiria com sentar. **Pinça** substitui o `scroll` do zoom e reusa `applyCameraZoom`, com
os mesmos limites. Quem decide se os controles existem é `isTouchDevice()` no JS (`?touch=1`
força, para testar no desktop) — uma media query seria uma segunda fonte de verdade.

**O clique só anda.** Sentar, entrar num portal ou abrir um móvel continua exigindo confirmação
(`E` ou o botão de ação) — ninguém senta sem querer ao tocar na tela. Qualquer tecla de movimento
cancela o destino, então o caminho do teclado no desktop segue idêntico ao que era.

**HUD com chassi e uma porta só (`client-web/src/hud/`).** Cada feature trazia o próprio botão fixo
("Meu menu" no topo direito, "Decorar sala" logo abaixo) e o rodapé era uma tira de teclas dizendo
sempre a mesma coisa — que o celular escondia por CSS, porque não serve para toque. Agora existe um
**dock** de ícones (Trabalho, Personagem, Itens, Loja, Cartas, Decorar, Como jogar) que em tela até
760px vira um botão `☰` abrindo a mesma lista como **folha de tela cheia**; as teclas viraram a
folha *Como jogar*, que mostra gestos em quem está no toque. A voz ficou de fora de propósito: a
barra da reunião já é permanente e é a única que conhece o estado do call.
Três regras que valem para todo painel novo:
1. **Quem bloqueia o mundo se registra** (`HudShell.register`). `uiIsBlocking()` não é mais uma
   lista escrita à mão em `main.js` — era ela que deixava clique e pinça vazarem quando entrava
   um painel novo.
2. **Botão de HUD para o toque no `pointerup`, com `stopPropagation`** — o Phaser escuta na janela,
   e com `preventDefault` no `pointerdown` o `click` nem chega (lição do `TouchControls`).
3. **Uma área rolável por folha**, com `overscroll-behavior: contain`: o `body` é `overflow:hidden`,
   então folha sem container próprio simplesmente não rola.
O CSS da HUD saiu do `<style>` do `index.html` para `src/hud/hud.css`, e o
[harness](client-web/hud-test.html) monta dock e folhas **sem Phaser** — é onde isso se testa (a
aba oculta do preview congela o `requestAnimationFrame` e o jogo nem sai do carregamento).

**Interações de mobília:** definições declaram um `InteractionType`, resolvido por um registro
extensível no cliente. `of_171` abre o kanban e escolhe a atividade ativa; `of_176` funciona como
baú e transfere instâncias; estações/computadores iniciam e encerram lançamentos de horas. Cadeiras
procuram uma estação próxima e só abrem o fluxo de trabalho quando há uma composição válida.
`FurnitureInteractionSystem.js` contém o registro de handlers. Hoje `of_171` é `kanban`, `of_176`
é `chest`, `of_225/227/229/231/233/235/317/318/319` são `workstation`, e as poltronas/cadeiras
curadas são `seat`. O armário servidor é um placeholder visual de baú até entrar um asset melhor.

Duas interações — **`seat`** e **`coffee`** — também valem para **móvel do cenário** (colocado no
Tiled, sem `GameItemInstance`), via a propriedade `interactionType` no objeto. `kanban`/`chest`/
`workstation` continuam exigindo item de inventário (dependem do `placementId`). Sentar num móvel de
cenário usa a posição do mapa como chave do claim, então o assento continua exclusivo em rede. O
encaixe do avatar sentado é **dado do móvel** (`seatX`/`seatY`/`seatPose`/`seatDir`/`seatCover`) e
tem três receitas, porque a folha `sit` só tem lateral boa (`up`/`down` leem como pessoa em pé, ver
`ASSETS.md` §3.1):
1. **cadeira de perfil** → `sit` lateral, sem truque;
2. **estação** (mesa+cadeira num sprite só) → `idle` de costas para o monitor + `seatCover`
   redesenhando a cadeira na frente do avatar, senão ele parece em pé sobre ela;
3. **sofá** (visto de frente) → o mesmo truque invertido: `idle` para a câmera + `seatCover` com a
   frente do estofado, que corta a perna onde ela sumiria de verdade.

`client-web/tools/seat-preview.mjs` compõe móvel + avatar fora do Phaser para calibrar esses
números. Regras completas em [`client-web/tiled/README.md`](client-web/tiled/README.md) §5.

**Rede implementada nesta fatia:** `GameItemsSystem.js` usa o cliente SignalR oficial vendorizado em
`client-web/lib/signalr.min.js`. `JoinGame(userId, sceneId, roomId)` assina os grupos do usuário e
da sala; `FurniturePlaced`, `FurnitureMoved`, `FurnitureRemoved`, `InventoryChanged`,
`ChestChanged` e `WorkSessionChanged` mantêm sessões abertas convergentes. Isso sincroniza mobília,
não avatares: presença/movimento ainda precisa ganhar isolamento por `sceneId`.

**Coworking (`tooq-office`):** área-piloto de 48×44 tiles com recepção, dois escritórios fechados, open
space, lounge, café e quintal privado. O Tiled expõe paletas curadas por uso; móveis multi-tile
aceitam footprints explícitos e `anim_coffee` prova o fluxo de decoração animada orientada a dados.
As estações seguem a composição do `Office_Design_2` (mesa, equipamento e cadeira), as salas usam
painéis brancos do room builder e porta interna deslizante automática do Modern Interiors. A face
sul dessas duas salas tem dois tiles; a porta abre ao aproximar, fecha ao afastar e
habilita/desabilita a colisão junto com a animação.

**Dark Company (`tooq-office-1`):** a segunda cena de escritório, `225×153`, mobiliada em cima da
casca vazia que já existia. Padrão diferente do piloto: as salas são **recortadas da própria casca**,
encostadas nas paredes externas e **compartilhando a divisória** com a vizinha — sem corredor nas
costas de sala nenhuma; a circulação são avenidas centrais alinhadas com as aberturas da casca. São
**três bandas de salas** (33 no total: 15 de reunião com parede de pedra, 9 de time com tijolo, 7
pessoais e 2 cabines com parede branca) intercaladas com áreas abertas de time, dois lounges, café e
recepção. Portas animadas em todas as salas; o quintal é fechado por cerca-viva com um portão
alinhado à saída sul, e o portal de volta ao mundo fica no portão. Foi **gerado por script aditivo**
sobre a casca — a planta completa e as regras de parede estão em
[`client-web/tiled/README.md`](client-web/tiled/README.md) §7.1.

**Tooq Office (`tooq-campus` + `personal-wing`) — prédio pequeno de propósito.** O térreo mede
**52×34 tiles** (era 124×112: quase 8× de área a menos). A faixa norte tem **um** cômodo de cada
tipo — cozinha, jogos, estudos e 1×1 — dividindo parede com a vizinha e com porta ao sul. O resto é
a **sala grande**, um open space em "L" com ilha de estações, mesa comunitária, lounge de sofás e a
recepção junto da entrada. A **sala de reunião** ocupa o canto sudoeste, com a porta virada a leste:
quem entra pelo vão sul dá de cara com ela, e a parede norte fica livre para o fone da reunião
(`meeting: true` já pendura um). O núcleo vertical — escada e poço de elevador — fica agrupado a
leste. O prédio inteiro cabe em poucas telas, que era o problema: antes o time se perdia num galpão.

A **sala grande tem canal de voz próprio**: uma `zone` com `voice: true` no mapa vale como sala para
o `syncVoiceChannel`. As duas metades do "L" compartilham o `id`, então são um canal só; tapetes são
zonas mudas, só piso. Corredor e quintal seguem sem canal.

**Andares.** Cada andar de salas pessoais tem **6 salas** (três de cada lado do corredor) e o prédio
nasce com **dois**. `personal-wing@N` é o andar N+1. **Elevador** abre um seletor de andar
(`src/FloorPicker.js`) e tem **poço em todos os andares**; **escadas** andam um andar por vez via
`floorDelta`, com arte distinta para subir e descer. Os spawns são nomeados pelo lado de onde a
pessoa chega (`from-stairs-above`/`from-stairs-below`/`from-elevator`), então o mesmo destino serve
térreo e andar. A resolução do destino é função pura em `src/FloorNavigation.js` e tem teste: o
`verticalAccess` montava o portal sem repassar `floorDelta`, e subir e descer caíam no mesmo andar —
bug mudo, nada quebrava. O backend fixa `RoomsPerFloor = 6` / `MinimumFloors = 2` e **reacomoda** salas que ficaram
fora da planta (`RepackPersonalRoomsAsync`), reancorando junto a mobília já colocada — sem isso a
mesa do dono ficaria atravessada na parede da sala nova.

Salas pessoais continuam sendo slots físicos públicos: todos veem e entram, somente o dono decora.
Cadastro provisiona `wingIndex`/`slotIndex`, mesa, kanban e skate básico. Loja, preços e propriedade
de equipamentos vêm do backend. Arquitetura, planta e próximas fatias:
[`docs/PLANO_CAMPUS_V2.md`](docs/PLANO_CAMPUS_V2.md).

**Ferramentas de arte (novas).** `tools/png.mjs` é um codec PNG sem dependências (o `zlib` do Node),
e sobre ele: `tools/asset-sheet.mjs` monta a folha de contato de uma família do tileset — sem ver a
arte não dá para escolher entre `lr_37` e `kt_190`; `tools/generate-furniture-composites.mjs` monta
as peças que o pack não tem (mesa de reunião contínua, mesas de apoio e a **mesa de xadrez**, que
antes era um retângulo marrom desenhado em código); `tools/map-preview.mjs` renderiza o mapa
inteiro em PNG com piso, paredes, móveis e mecânicas reais — **é assim que a planta é conferida**,
já que o Phaser não completa o boot no navegador embutido; e `tools/layout-audit.mjs` aponta móvel
sobre a parede, colisão empilhada e assento sem mesa ao lado.

⚠️ **Sentar tem dois caminhos.** Cadeira de perfil (`of_306`/`of_307`) usa a pose `sit` — o encosto
delas é à **direita**, então sem espelhar a pessoa encara a esquerda. Sofá é de frente e usa o truque
da estação invertido: `idle` para a câmera + `seatCover` cobrindo as pernas com a frente do estofado
(`tools/seat-preview.mjs` calibra os dois números). Poltrona de frente (`of_196`–`of_199`) segue
cenário. Nada disso seria preciso se a folha `sit` tivesse `up`/`down` decentes — item 6 dos
próximos passos.

**Mundo aberto v2 (`world` + `player-home-shell`):** hub cercado de `220×150` tiles, com o Tooq
Office central junto do spawn, Coworking e Dark Company afastados, malha de ruas, calçadas,
vegetação e cenários. A Vila dos Jogadores ocupa a lateral leste com 12 casas físicas; cada fachada
aponta para uma instância lógica (`player-home-shell@house-XX`) do mesmo interior vazio. O retorno
é materializado para a porta correta, permitindo evoluir cada lote para uma casa comprável sem
duplicar mapas.

**Presença + voz por proximidade (feito):** o cliente Phaser conecta o hub de presença
(`PresenceSystem.js`), renderiza avatares remotos interpolados (filtro de cena no cliente) e
sincroniza `Join/Move/SetScene/SetAppearance`. Os avatares remotos usam a **skin modular** e o
**veículo** de cada jogador (`RemoteAvatar.js` reaproveita os visuais do avatar local; bots e
clientes antigos caem no corpo base). A voz é LiveKit por **(cena, sala)** (`ProximityVoice.js`): o call
só existe **dentro de uma sala declarada** (isolado, todos no volume cheio) ou **com o fone da
reunião**. Em área verde e corredor não há canal e o HUD some — o call de área aberta com volume
por distância foi removido. Salas de reunião têm um **fone pendurado na parede**
(`MeetingHeadset.js`, derivado de `map.rooms`): pegar com `F` mantém você na reunião mesmo saindo
da sala, até soltar.
A URL do LiveKit vem do backend. O HUD da reunião é estilo
Meet (`MeetingHUD.js`): barra inferior com mic/câmera/tela e seletor de dispositivos, três
layouts (jogo | dividido | foco com o jogo em PiP), tela cheia, grade com indicador de fala,
painel de pessoas e toasts; QA visual em `client-web/hud-test.html`.
Detalhes e caveats: [`docs/REUNIAO_PROXIMIDADE.md`](docs/REUNIAO_PROXIMIDADE.md).

**Reunião conta horas + xadrez (ligados a salas existentes, de forma aditiva):** ⚠️ **lição
aprendida** — o mapa do escritório é trabalho manual (quintal, portas animadas, mobília); mexer nele
é **sempre aditivo, nunca regenerar** (uma regeneração cega foi revertida do backup). Hoje: o
**Escritório B** está marcado como sala de reunião (`meeting:true` no `extraJson`) → entrar dispara o
lançamento de horas; e há **um objeto `type=chess`** no lounge → mecânica `chess` (tabuleiro DOM em
rede, `src/chess/engine.js` validada por perft). As **8 salas pessoais** ficaram para o dono desenhar
no Tiled (é o fluxo do projeto).

**Auth (login-only por enquanto):** OIDC do Google + JWT próprio, escopo só `openid email profile`
(sem Calendar ainda — é flip de config `Auth:Scopes`+`OfflineAccess`). `Auth:DevBypass=true` mantém o
`X-User-Id` vivo em dev; produção = `false` + credenciais Google. Passo a passo (inclusive sem admin
no Workspace): [`docs/PLANO_AUTH.md`](docs/PLANO_AUTH.md). Para **testar só o cliente sem backend**,
`?dev=1` pula a portaria de login — mas **só em host local** (`localhost`/`127.0.0.1`/`*.localhost`);
em qualquer domínio real o parâmetro é ignorado, então não vira porta dos fundos publicada
(`LoginScreen.isLocalDevBypass`). Nesse modo o jogo roda offline; ver [`docs/COMO-RODAR.md`](docs/COMO-RODAR.md) §0.

**Deploy — produção (Docker) e beta (túnel):**
- **Produção local v1** (`run-prod-local.ps1`): sobe o stack Docker inteiro na máquina.
  **Preserva os dados entre execuções** — é produção; zerar exige `-Reset`. Um banco novo nasce
  com só o catálogo curado (tipos de lançamento, objetivos, etiquetas, loja), sem o time fictício
  (`Seed:DemoData=false`); `-Demo` traz a demonstração de volta. Gera senha do Postgres,
  `JWT_KEY` e segredo do LiveKit, e recusa subir com `AUTH_DEV_BYPASS=true`.
  **O túnel do Cloudflare sobe por padrão** (`-NoTunnel` desliga) e o link para compartilhar
  aparece em destaque, na área de transferência e em `deploy/tunnel-url.txt`.
  Publica como o beta: origem HTTP única (`:8080`
  do Caddy), game na raiz e **app web em `/app/`** (o quick tunnel só expõe uma porta). A/V usa
  **LiveKit Cloud por padrão** — UDP não passa por túnel HTTP, então o SFU em container virou
  opcional (perfil `local-livekit`) e só serve para a LAN.
- **Docker** (`docker-compose.yml`): Postgres + backend + game (nginx) + Caddy (TLS); o LiveKit
  local é opcional (perfil `local-livekit`). O schema é aplicado por migrations EF no start do
  container. O Caddy roteia `/api`, `/hub`, `/auth` **e `/shared`** para o backend — `/shared` é
  a UI compartilhada, que não existe na imagem do game — e publica `:8080` como origem HTTP
  única para o túnel. Ver [`docs/DEPLOY_DOCKER.md`](docs/DEPLOY_DOCKER.md).
- **Postgres em dev** (`docker-compose.dev.yml`): só o banco; backend e jogo continuam fora do
  Docker. Ver [`docs/BANCO_POSTGRES.md`](docs/BANCO_POSTGRES.md).
- **Beta sem Docker** (`run-beta.ps1`): Caddy nativo (origem única `:8080`) + Cloudflare Tunnel expõem
  a máquina sem port-forward. **A/V entre redes exige um relay público** — voz por túnel com LiveKit
  local **não funciona** (UDP não passa em túnel HTTP); a beta usa **LiveKit Cloud** (chaves em
  `deploy/beta.env`, gitignored). Ver [`docs/BETA_TUNEL.md`](docs/BETA_TUNEL.md).
- **Cliente mesma-origem**: `resolveApiBase` (auth.js) usa `location.origin` fora da porta de dev
  `:8123`, então o game atrás do proxy/túnel fala `/api` na própria origem (sem CORS).

---

## 5. Assets

Comprados (LimeZu, ~815 MB / 99 mil arquivos) ficam em **`LimeZu/`**, dentro do workspace e
ignorados pelo Git (re-baixáveis do itch.io). Os **recortes** que o cliente usa estão versionados em
`client-web/assets/`. Política, estrutura dos packs e **todas as medidas já verificadas** (chars,
paredes, pisos, móveis, exteriores, porta animada):
👉 [`ASSETS.md`](ASSETS.md). **Não redescubra medida** — está lá.

---

## 6. Próximos passos

1. ✅ **Presença de avatares por cena** — feito. `PresenceSystem.js` conecta o hub, sincroniza
   `Join/Move/SetScene` e renderiza avatares remotos interpolados (filtro de cena no cliente).
   Ver [`docs/REUNIAO_PROXIMIDADE.md`](docs/REUNIAO_PROXIMIDADE.md).
2. **Adicionar handlers das próximas mecânicas** e seus templates tipados no Tiled.
3. **Ligar drops à progressão**; compra, preços, propriedade e permissões de sala já funcionam.
4. ✅ **Segunda cena de destino** — feito. A Dark Company (`tooq-office-1`) entrou no hub pelo mesmo
   contrato de `portals[]`/`spawns`, provando que a arquitetura cresce além do escritório-piloto.
5. ✅ **A/V por sala** (LiveKit JS) — feito. `ProximityVoice.js`: call isolado por sala declarada
   ou pelo fone, mic/câmera/tela sob demanda. Posse do fone e estado de reunião passam pela presença.
6. **Redesenhar os frames `up`/`down` da folha `sit`** nas 23 folhas modulares — hoje são o `idle`
   com a perna encurtada, então sentar de frente/costas não presta. Estação e sofá contornam com
   `idle` + `seatCover`, e poltrona de frente segue sendo só cenário; é isso que o redesenho
   destrava, além de sentar encarando o monitor de verdade.
7. **Persistir casas compráveis**: o vilarejo e os 12 destinos dinâmicos existem; falta propriedade,
   compra e decoração independente do interior-base.
8. **Completar a economia do Tooq Triad**: fonte recorrente de boosters, pity, histórico de
   aberturas, bônus shiny na partida e persistência/reconexão de partidas.

---

## 7. Perguntas em aberto (alinhar quando pegarem cada frente)

- A Tooq tem **paleta/identidade visual**? Dá pra tingir placa e detalhes em vez do cinza genérico.
- Quantas pessoas **simultâneas** o v1 precisa aguentar?
- Quem pode decorar cada sala: só dono, time ou administradores? Hoje somente o dono da instância
  consegue alterá-la, usando identidade simbólica do protótipo.

---

## 8. Docs relacionados

- [`client-web/README.md`](client-web/README.md) — schema do mapa, como editar, móveis, limitações.
- [`client-web/GUIA-EDICAO.md`](client-web/GUIA-EDICAO.md) — tutorial prático de edição e IDEs.
- [`client-web/GUIA-MUNDO-ABERTO.md`](client-web/GUIA-MUNDO-ABERTO.md) — ruas, fachadas, colisões e
  novos interiores pelo Tiled.
- [`client-web/tiled/README.md`](client-web/tiled/README.md) — operação do editor visual Tiled.
- [`client-web/TUTORIAL.md`](client-web/TUTORIAL.md) — padrões de Phaser + debug no navegador.
- [`docs/KANBAN_HORAS.md`](docs/KANBAN_HORAS.md) — quadro, lançamento de horas, objetivos, economia e a UI compartilhada.
- [`docs/CARDGAME.md`](docs/CARDGAME.md) — estado implementado do Tooq Triad, arquitetura, chances e testes.
- [`docs/PLANO_CARDGAME_POKEMON.md`](docs/PLANO_CARDGAME_POKEMON.md) — regras e roadmap completo do cardgame.
- [`docs/BANCO_POSTGRES.md`](docs/BANCO_POSTGRES.md) — Postgres local, migrations EF, datas em UTC.
- [`docs/PLANO_AUTH.md`](docs/PLANO_AUTH.md) — auth Google + JWT, permissões, passo a passo do OAuth.
- [`docs/REUNIAO_PROXIMIDADE.md`](docs/REUNIAO_PROXIMIDADE.md) — presença em rede + A/V por proximidade.
- [`docs/DEPLOY_DOCKER.md`](docs/DEPLOY_DOCKER.md) — build de produção completo (Docker/Postgres/Caddy).
- [`docs/BETA_TUNEL.md`](docs/BETA_TUNEL.md) — beta na sua máquina, acessível de fora (Cloudflare Tunnel).
- [`ASSETS.md`](ASSETS.md) — onde estão os assets e todas as medidas verificadas.
- `docs/PLANO_CLIENTE_V2.md` — plano em fases (F0-F10). Foi escrito p/ Unity; as fases de
  gameplay/rede/minigames seguem válidas como referência de escopo.
- `docs/historico/` — retrospectivas antigas (loop cego do Unity). Arquivo; ⚠️ o `HANDOFF.md` tem a
  **ordem de direção dos chars ERRADA** — use a do `ASSETS.md` §3.1.
- Memória do projeto: `projeto-escritorio-virtual.md`, `poc-web-phaser.md`.
