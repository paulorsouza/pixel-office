# Office Quest — protótipo do escritório virtual gamificado

Protótipo integrado de **escritório virtual + gestão de atividades + controle de horas + gamificação**.
O backend em C# é a base definitiva do produto; a interface web serve para testar e sentir a
experiência antes da migração dos clientes para **Unity** (office) e **Tauri** (app de tasks).

## Como rodar

```powershell
cd backend/VirtualOffice.Api
dotnet run
```

Abra **http://localhost:5210**. Escolha um usuário (sem senha — protótipo).
Para testar o multiplayer, abra outra janela do navegador (ou aba anônima) e entre com outro usuário.

O banco é um SQLite (`office.db`) criado e populado automaticamente na primeira execução.
Para resetar tudo, apague o arquivo `office.db` e rode de novo.

## O que já funciona

| Área | Recursos |
|---|---|
| **Office 2D** | Mapa com mesas, Sala de Reunião e Café; avatares (WASD/setas); bots circulando; chat por proximidade (bots respondem); modo **compacto** (câmera segue você — conceito "toolbar game") e **expandido** |
| **Integração** | Entrar na Sala de Reunião **inicia lançamento de horas automático** (fecha ao sair); timer ativo aparece como status no avatar (`🔴 TSK-2`, `📅 Reunião`); skin equipada muda o avatar em tempo real |
| **Tasks** | Épicos, sprints, tipos (Task/Bug/Atendimento), board kanban com drag & drop, backlog em lista, criação/edição, estimativa vs horas lançadas |
| **Horas** | Timer na topbar (estilo Clockify), grade semanal, lançamento manual, exclusão |
| **Relatórios** | Horas por dia / categoria / pessoa / épico, período configurável |
| **Gamificação** | XP por horas (teto diário anti-farm) e por conclusão de atividades; níveis; **drops** com raridade (level-up e sessões de foco 25min+); objetivos com **medalhas automáticas** (ex.: 100h em reuniões); ranking; skins equipáveis; **sala pessoal decorável** |

## Arquitetura

```
backend/VirtualOffice.Api    ASP.NET Core (.NET 10) + EF Core (SQLite) + SignalR
  Models.cs                  Entidades: User, Epic, Sprint, WorkItem, TimeEntry,
                             XpEvent, ItemDefinition, InventoryItem, RoomItem
  Game.cs                    Regras de XP/nível, loot table, conquistas
  OfficeHub.cs               Hub SignalR: presença, movimento, zonas, chat por proximidade
  BotService.cs              Bots que dão vida ao mapa no protótipo
  Seed.cs                    Dados de exemplo (usuários, sprint, tasks, horas, itens)
  Program.cs                 API REST (tasks, timer, horas, relatórios, inventário, sala)
  wwwroot/                   Frontend do protótipo (HTML/JS puro, sem build)
    js/office.js             Mapa 2D em canvas
    js/tasks.js              Kanban / backlog
    js/timesheet.js          Grade semanal de horas
    js/reports.js            Relatórios
    js/profile.js            Perfil, conquistas, inventário, sala pessoal
```

## Caminho de evolução (plano completo na sessão de planejamento)

1. **Unity (office)**: ✅ **feito** — projeto em [`office-unity/`](office-unity/README.md),
   consome o mesmo `OfficeHub`/API (web e Unity convivem no mesmo mapa). Arte pixel
   procedural, sentar (E), emotes (1–4), zoom, animação de caminhada.
2. **Tauri (tasks)**: o frontend de tasks migra para React/TS no Tauri, mesma API, com timer no tray.
3. **Áudio/vídeo**: LiveKit self-hosted (o backend só emite tokens e regras de proximidade).
4. **Auth real**: trocar o header `X-User-Id` por OpenIddict/JWT.
5. Postgres no lugar do SQLite quando sair do protótipo.

## Notas conhecidas do protótipo

- Autenticação é simbólica (header `X-User-Id`) — não usar fora de ambiente local.
- Aviso NuGet NU1903 (SQLitePCLRaw): vulnerabilidade conhecida na dependência transitiva do
  SQLite; some ao migrar para Postgres, ou atualize o pacote quando houver patch.
- Cores de usuários/épicos passam nas checagens de contraste e daltonismo nos gráficos, mas
  ficam acima da faixa de luminosidade recomendada para dark mode — reavaliar com o design
  system definitivo.
