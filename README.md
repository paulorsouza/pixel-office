# Office Quest — escritório virtual da Tooq

Escritório virtual estilo **Gather.town** integrado com **gestão de atividades + controle de horas +
gamificação**. O backend em C# é a base definitiva do produto.

---

## 🔴 Comece por aqui

| Doc | Pra quê |
|---|---|
| **[`CONTEXT.md`](CONTEXT.md)** | **A fonte de verdade.** Estado, como as peças se conectam, decisões de design e próximos passos |
| **[`ASSETS.md`](ASSETS.md)** | Onde estão os assets, o que tem em cada pack e **tudo que já mapeamos** (coordenadas, medidas, gotchas) |
| [`client-web/README.md`](client-web/README.md) | Cliente do jogo: schema do mapa + como editar (hardcode e editor in-game) |
| [`docs/COMO-RODAR.md`](docs/COMO-RODAR.md) | Subir backend + LiveKit e testar |
| [`docs/PLANO_CLIENTE_V2.md`](docs/PLANO_CLIENTE_V2.md) | Escopo em fases (escrito p/ Unity; as fases de gameplay/rede/minigames seguem válidas) |
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | ⚠️ Retrospectiva do cliente Unity — **a ordem de direção dos personagens nele está ERRADA** |
| [`docs/historico/`](docs/historico/) | ⚠️ Arquivo morto (memória acumulada). Serve pra entender *"por que chegamos aqui"*, não como instrução |

**Em caso de conflito entre docs, `CONTEXT.md` vence.**

---

## Estado (2026-07-17)

| Peça | Estado |
|---|---|
| **backend/** — ASP.NET Core (.NET 10) + EF/SQLite + SignalR (porta **5210**) | ✅ Sólido — não refazer |
| **wwwroot** — app web (kanban, sprints, horas, relatórios, perfil) | ✅ Funciona |
| **livekit/** — SFU self-hosted (porta **7880**) | ✅ Funciona |
| **client-web/** — cliente do jogo em Phaser, orientado a dados (mapa = JSON + editor in-game) | ✅ Roda; falta mobiliar/rede |
| **office-unity/** | ⏸️ Abandonado (arquivo) |
| ~~Tauri (app de tasks)~~ | ❌ Cancelado — o app web cobre |

**Por que web e não Unity:** o produto é *"entrar por link"*, e o Unity não faz isso com esta stack
(WebGL descartado — o SignalR custom e o SDK ffi do LiveKit não rodam nele). Somado a isso: o ciclo
de trabalho na web é muito melhor e escala melhor pra online. Motivos completos no `CONTEXT.md`.

---

## Rodar

```powershell
# 1. LiveKit (opcional — só a call da reunião depende dele)
& ".\livekit\start-livekit.ps1"    # espere "portHttp: 7880"

# 2. Backend — rodar a DLL (o `dotnet run` detached não persistia)
.\backend\VirtualOffice.Api\bin\Debug\net10.0\VirtualOffice.Api.dll
```

Abra **http://localhost:5210**. Sem senha (protótipo). Pra multiplayer, abra outra aba anônima.
O SQLite (`office.db`) é criado e populado no primeiro boot — **apagar o arquivo reseta tudo**.

```bash
# Cliente do jogo (porta 8123) — servidor estático Node, sem dependências
node client-web/server.js
```

---

## Estrutura

```
virtual-office/
├── CONTEXT.md          ← 🔴 fonte de verdade
├── ASSETS.md           ← assets: onde estão e o que já mapeamos
├── README.md
├── docs/
│   ├── COMO-RODAR.md · PLANO_CLIENTE_V2.md
│   ├── HANDOFF.md      ⚠️ dados obsoletos
│   └── historico/      ⚠️ arquivo morto
├── backend/VirtualOffice.Api    ✅ API + SignalR + wwwroot (app web)
├── livekit/                     ✅ SFU
├── client-web/                  ✅ cliente do jogo (Phaser, mapa = dado + editor)
└── office-unity/                ⏸️ abandonado
```

**Os packs LimeZu crus (~1,3 GB) NÃO são versionados** — ver `ASSETS.md`. Os recortes que o cliente
carrega estão versionados em `client-web/assets/`.

---

## O que já funciona (backend + app web)

| Área | Recursos |
|---|---|
| **Tasks** | Épicos, sprints, tipos (Task/Bug/Atendimento), kanban com drag & drop, backlog, criação/edição, estimativa vs horas |
| **Horas** | Timer estilo Clockify, grade semanal, lançamento manual |
| **Relatórios** | Horas por dia / categoria / pessoa / épico, período configurável |
| **Gamificação** | XP por horas (teto diário anti-farm) e por conclusão; níveis; **drops** com raridade; objetivos com **medalhas automáticas**; ranking; skins; sala pessoal decorável |
| **Integração office** | Entrar na Sala de Reunião **inicia lançamento de horas automático**; sentar na própria mesa inicia o timer da task ativa; "fone de reunião" permite circular sem sair da call |
| **A/V** | LiveKit: mic/câmera/tela; token só é emitido se a pessoa está na reunião |

## Arquitetura do backend

```
backend/VirtualOffice.Api      ASP.NET Core (.NET 10) + EF Core (SQLite) + SignalR
  Models.cs                    User, Epic, Sprint, WorkItem, TimeEntry, XpEvent,
                               ItemDefinition, InventoryItem, RoomItem
  Game.cs                      Regras de XP/nível, loot table, conquistas
  OfficeHub.cs                 Hub SignalR: presença, movimento, zonas, chat de proximidade
  OfficeLayout.cs              Planta do escritório — contrato de mapa (server units = 28/tile)
  LiveKitService.cs            Emite JWT; só se Presence.InMeeting
  BotService.cs                Bots que dão vida ao mapa
  Seed.cs                      Dados de exemplo
  Program.cs                   API REST
  wwwroot/                     App web (ES modules, sem build)
```

## Notas conhecidas

- **Auth é simbólica** (header `X-User-Id`) — não usar fora de ambiente local. Trocar por
  OpenIddict/JWT antes de qualquer coisa séria.
- Aviso NuGet **NU1903** (SQLitePCLRaw): vulnerabilidade em dependência transitiva do SQLite;
  some ao migrar pra Postgres.
- Postgres deve substituir o SQLite quando sair do protótipo.
- Cores de usuários/épicos passam em contraste/daltonismo, mas ficam acima da luminosidade
  recomendada pra dark mode — reavaliar com o design system definitivo.
