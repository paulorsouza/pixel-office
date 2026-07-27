# CONTEXT — Office Quest (escritório virtual da Tooq)

**Atualizado:** 2026-07-27

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
| **Backend C#** | `backend/VirtualOffice.Api` | ✅ ASP.NET + EF + SignalR. Porta **5210**. SQLite (dev) ou **Postgres** (`Database:Provider`). |
| **Auth** | `backend/.../Auth.cs`, `AuthEndpoints.cs` | ✅ Login Google (OIDC) + JWT próprio; papéis Member/Manager/Admin. `X-User-Id` sobrevive só via `Auth:DevBypass` (dev). Ver [`docs/PLANO_AUTH.md`](docs/PLANO_AUTH.md). |
| **App web** (tasks/horas) | `backend/.../wwwroot` | ✅ Kanban, sprints, horas, relatórios, perfil. ES modules, sem build. |
| **LiveKit** | `livekit/` (local) ou **LiveKit Cloud** | ✅ SFU. Local (LAN) ou Cloud (entre redes). URL vem do backend (`LiveKit:Url`). |
| **Contrato de mapa** | `backend/OfficeLayout.cs` | Server units = **28 por tile**. |
| **Cliente do jogo** ⭐ | `client-web/` | ✅ Phaser 3, orientado a dados. Presença em rede, voz por proximidade, xadrez. |
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

`GameInventorySeed.EnsureSchemaAsync` cria o schema aditivo em bancos SQLite existentes; não há
migration EF formal ainda. `GameInventorySeed.RunAsync` **reconcilia** o catálogo curado (acrescenta o que
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
encaixe do avatar sentado é **dado do móvel** (`seatX`/`seatY`/`seatPose`/`seatDir`/`seatCover`):
cadeira solta senta de perfil (`sit`, a única pose lateral boa do pack — `up`/`down` da folha `sit`
leem como pessoa em pé, ver `ASSETS.md` §3.1); a **estação** (mesa+cadeira num sprite só) usa `idle`
de costas para o monitor e `seatCover` redesenha a cadeira na frente do avatar para ele encaixar no
assento em vez de ficar por cima dela. Regras completas em
[`client-web/tiled/README.md`](client-web/tiled/README.md) §5.

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

**Tooq Office (`tooq-campus` + `personal-wing`):** evolução paralela, sem regenerar o mapa testado.
O prédio principal possui 5 salas de reunião, 10 salas 1×1, jogos, cozinha e 3 salas de estudos.
As salas usam faixas contíguas com paredes compartilhadas e portas frontais; um eixo central
contínuo conecta todas as fileiras à recepção. Prédio, corredores, salas e alas pessoais usam o
mesmo piso de madeira. Elevador animado e escada completa usam sprites LimeZu no saguão e são
portais `E` reais entre o térreo e as alas pessoais, com os dois meios disponíveis também para o
retorno. O elevador fica em um poço técnico fechado e a escada tem blocker próprio separado do
sensor frontal. O térreo possui saída física para um quintal caminhável; o portão sul usa `E` para
voltar ao mundo aberto.
Salas pessoais ocupam slots físicos em alas públicas de 12 cômodos; todos veem e entram, enquanto
somente o dono decora. Cadastro provisiona `wingIndex`/`slotIndex`, mesa, kanban e skate básico.
Loja, preços e propriedade de equipamentos agora vêm do backend; há dois modelos de cada base de
locomoção. Arquitetura, estado e próximas fatias: [`docs/PLANO_CAMPUS_V2.md`](docs/PLANO_CAMPUS_V2.md).

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
- **Docker** (`docker-compose.yml`): Postgres + backend + game (nginx) + LiveKit + Caddy (TLS). O
  backend suporta Postgres via `Database:Provider` (no Postgres o `EnsureCreated` cria o schema; os
  scripts aditivos de SQLite são pulados). Ver [`docs/DEPLOY_DOCKER.md`](docs/DEPLOY_DOCKER.md).
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
   com a perna encurtada, então sentar de frente/costas não presta (a estação contorna com `idle` de
   costas). É o que destrava sentar encarando o monitor de verdade.
7. **Persistir casas compráveis**: o vilarejo e os 12 destinos dinâmicos existem; falta propriedade,
   compra e decoração independente do interior-base.

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
