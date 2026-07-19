# CONTEXT — Office Quest (escritório virtual da Tooq)

**Atualizado:** 2026-07-19

Visão geral pragmática do projeto: o que é, o que existe, como as peças se conectam e para onde vai.
Detalhes vivem em docs específicos (linkados no fim) — aqui é o mapa mental.

---

## 1. O produto

Escritório virtual estilo **Gather.town** para a **Tooq**: o time fica logado o dia todo, cada
pessoa com um avatar andando por um escritório 2D top-down, com **chat de proximidade**, **A/V**
(LiveKit), integração com **tasks/horas** e **gamificação**.

O jogo tem **várias cenas independentes** e um **quintal central caminhável** que funciona como hub:
nele o jogador escolhe quais locais visitar. O escritório é uma dessas cenas e reúne o interior
mobiliado com um pequeno quintal privado; o exterior dá contexto e escolha sem virar um mapa vazio.

Entrar é **por link** (abrir a URL e já estar dentro) — foi o motivo de o cliente ser **web**, não
Unity (ver §4).

---

## 2. As peças do sistema

| Peça | Onde | Estado |
|---|---|---|
| **Backend C#** | `backend/VirtualOffice.Api` | ✅ ASP.NET + EF/SQLite + SignalR. Porta **5210**. Execute a DLL dentro dessa pasta para manter `office.db` previsível. |
| **App web** (tasks/horas) | `backend/.../wwwroot` | ✅ Kanban, sprints, horas, relatórios, perfil. ES modules, sem build. |
| **LiveKit** | `livekit/` | ✅ SFU self-hosted, porta **7880**. Token só se `Presence.InMeeting`. |
| **Contrato de mapa** | `backend/OfficeLayout.cs` | Server units = **28 por tile**. |
| **Cliente do jogo** ⭐ | `client-web/` | ✅ Phaser 3, orientado a dados. É onde o trabalho de cliente acontece. |
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
client-web/src/FurnitureInteractionSystem.js  kanban, baú, cadeira e estação
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
migration EF formal ainda. `GameInventorySeed.RunAsync` cadastra os 37 recortes curados e estoque
inicial. Endpoints atuais: `/api/game/inventory`, `/api/game/rooms/{scene}/{room}/furniture`,
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

**Mapa como dado, não hardcode.** O roadmap pede salas customizáveis pelo dono — só funciona se o
mapa for dado. `.tmj`, `.tsj` e `.tj` são a fonte e são consumidos diretamente pelo navegador; não
há JSON gerado no fluxo diário. O carregador transporta classes novas como entidades genéricas,
tile layers livres como camadas visuais e tilesets externos sem cadastro prévio no conversor. Cada
comportamento é um handler registrado, em vez de outro caso especial no renderer. Salvar no Tiled
valida o projeto e atualiza o jogo automaticamente; erros aparecem sobre o jogo.

No modo `visualMode: "tiled"`, chão/ruas, paredes e cercas são tile layers nativas e desbloqueadas,
não prévias procedurais. Paredes e cercas derivam colisão diretamente dos tiles pintados. O hub
`world` usa um canvas de 96×72 tiles e não possui objeto manual de limite de câmera. O limite aberto
acompanha qualquer redimensionamento feito em **Map → Resize Map** e também cresce quando um objeto
visível é colocado além das bordas do canvas; assim a câmera continua seguindo o avatar até áreas em
coordenadas negativas ou maiores que o mapa original.

**Fachada bonita + interior grande (não roof-reveal).** Roof-reveal (entrar = remover o teto) amarra
o tamanho do interior ao do telhado ⇒ laje cinza feia em interior grande. Os prédios lindos do Modern
Exteriors são **fachadas em 3/4**, não telhados top-down. Padrão escolhido: fachada por fora +
entrar ⇒ interior grande (estilo Pokémon/Stardew). A fachada **TOOQ** já está pronta
(`assets/world/office_tooq.png`).

**Sem múltiplos andares.** A unidade de navegação é a cena. Cada prédio/local aponta para um mapa
independente, com spawn de entrada e portal de retorno. O escritório atual é apenas térreo.

**Estrutura de mundo:**
```
Mundo aberto editável (hub 96×72, expansível no Tiled)
        ├── Escritório Tooq (cena térrea)
        ├── Local/cena futura A
        └── Local/cena futura B
```

**Primeiro corte implementado:** mundo aberto → porta da fachada → escritório + quintal privado →
portão → hub. Objetos volumosos carregam footprints de colisão no JSON. Cenas fechadas podem manter
limites de câmera explícitos; no hub a câmera usa toda a dimensão do mapa. O mesmo contrato de
`portals[]` e `spawns` permite acrescentar novas cenas sem criar outra classe Phaser.

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

**Rede implementada nesta fatia:** `GameItemsSystem.js` usa o cliente SignalR oficial vendorizado em
`client-web/lib/signalr.min.js`. `JoinGame(userId, sceneId, roomId)` assina os grupos do usuário e
da sala; `FurniturePlaced`, `FurnitureMoved`, `FurnitureRemoved`, `InventoryChanged`,
`ChestChanged` e `WorkSessionChanged` mantêm sessões abertas convergentes. Isso sincroniza mobília,
não avatares: presença/movimento ainda precisa ganhar isolamento por `sceneId`.

**Área-piloto de design:** o escritório foi compactado para 48×44 tiles e agora tem recepção, dois
escritórios fechados, open space, lounge, café e quintal privado. O Tiled expõe paletas curadas por
uso; móveis multi-tile aceitam footprints explícitos e `anim_coffee` prova o fluxo de decoração
animada orientada a dados. As estações seguem a composição do `Office_Design_2` (mesa, equipamento
e cadeira), as salas usam painéis brancos do room builder e porta interna deslizante automática do
Modern Interiors. A face sul dessas duas salas tem dois tiles; a porta abre ao aproximar, fecha ao
afastar e habilita/desabilita a colisão junto com a animação. Sofás modulares foram removidos do
lounge em favor das poltronas vistas no `Office_Design_1`; `office_door` ficou restrita à transição
externa.

---

## 5. Assets

Comprados (LimeZu, ~815 MB / 99 mil arquivos) ficam em **`LimeZu/`**, dentro do workspace e
ignorados pelo Git (re-baixáveis do itch.io). Os **recortes** que o cliente usa estão versionados em
`client-web/assets/`. Política, estrutura dos packs e **todas as medidas já verificadas** (chars,
paredes, pisos, móveis, exteriores, porta animada):
👉 [`ASSETS.md`](ASSETS.md). **Não redescubra medida** — está lá.

---

## 6. Próximos passos

1. **Plugar presença de avatares por cena.** O SignalR JS e os grupos de sala já existem para
   mobília; agora `Join/Move/Presence` precisam carregar `sceneId`. Dois avatares no mesmo mapa é o marco.
2. **Adicionar handlers das próximas mecânicas** e seus templates tipados no Tiled.
3. **Evoluir a economia de itens** com compra, drops, preços e permissões de sala.
4. **Adicionar a segunda cena de destino** ao hub para provar que a arquitetura cresce além do
   escritório.
5. **A/V por proximidade** (LiveKit JS), depois da presença em rede.
6. **Polimento visual e conteúdo** do escritório, preservando o mapa como dados do Tiled.

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
- [`ASSETS.md`](ASSETS.md) — onde estão os assets e todas as medidas verificadas.
- `docs/PLANO_CLIENTE_V2.md` — plano em fases (F0-F10). Foi escrito p/ Unity; as fases de
  gameplay/rede/minigames seguem válidas como referência de escopo.
- `docs/historico/` — retrospectivas antigas (loop cego do Unity). Arquivo; ⚠️ o `HANDOFF.md` tem a
  **ordem de direção dos chars ERRADA** — use a do `ASSETS.md` §3.1.
- Memória do projeto: `projeto-escritorio-virtual.md`, `poc-web-phaser.md`.
