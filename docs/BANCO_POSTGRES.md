# Banco de dados — Postgres + EF Migrations

**Postgres é o único provider.** Dev, beta e produção rodam o mesmo schema, criado e
evoluído por **migrations do EF Core**. O SQLite saiu, e junto com ele saíram os scripts
aditivos de schema (`AuthSchema.EnsureAsync`, `GameInventorySeed.EnsureSchemaAsync`) —
eles existiam só para remendar bancos SQLite antigos e eram uma fonte silenciosa de
divergência entre o que o modelo EF dizia e o que o banco realmente tinha.

---

## 1. Subir o banco local

Precisa de Docker (Desktop no Windows). Uma vez só:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Isso sobe um Postgres 16 em `localhost:5432` com usuário/senha/banco `officequest` —
exatamente a string de conexão que já é o padrão do `appsettings.json`. Os dados ficam
num volume nomeado, então parar o container não perde nada.

| Comando | O que faz |
|---|---|
| `docker compose -f docker-compose.dev.yml up -d` | sobe |
| `docker compose -f docker-compose.dev.yml down` | para, **mantendo** os dados |
| `docker compose -f docker-compose.dev.yml down -v` | para e **apaga** o banco |
| `docker compose -f docker-compose.dev.yml logs -f db` | acompanha o log |

Sem Docker, serve qualquer Postgres 14+ local; basta apontar a conexão:

```bash
export ConnectionStrings__Default="Host=localhost;Port=5432;Database=officequest;Username=postgres;Password=postgres"
```

O `run-beta.ps1` falha logo no começo, com mensagem clara, se a porta 5432 não estiver
escutando — antes ele abria as janelas todas e só depois o backend morria.

## 2. Rodar o backend

O `Program.cs` chama `db.Database.MigrateAsync()` no boot: **as migrations pendentes são
aplicadas sozinhas** ao subir. Não existe passo manual no fluxo do dia a dia.

```powershell
Push-Location .\backend\VirtualOffice.Api
dotnet run
```

Banco vazio nasce com o catálogo curado (tipos de lançamento, objetivos, etiquetas,
itens do jogo) e com os dados de demonstração do time fictício. Banco já populado só
recebe o catálogo reconciliado — nada é apagado.

## 3. Mudar o schema

1. Edite as entidades em `Models.cs` (e o `OnModelCreating` do `AppDb.cs`, se precisar de
   índice ou chave composta).
2. Gere a migration:

```bash
dotnet ef migrations add NomeDaMudanca --project backend/VirtualOffice.Api --output-dir Migrations
```

3. Confira o arquivo gerado em `backend/VirtualOffice.Api/Migrations/` — ele é código, e
   entra no commit junto com a mudança do modelo.
4. Suba o backend: a migration é aplicada no boot.

A ferramenta precisa bater com a versão do EF do projeto (hoje **10.0.9**):

```bash
dotnet tool install --global dotnet-ef --version 10.0.9
```

> **Cuidado com versão de pacote.** O projeto estava com
> `Npgsql.EntityFrameworkCore.PostgreSQL` **10.0.0-preview.1** junto de um EF Core
> **10.0.9** estável. A combinação quebra em tempo de execução com
> `Method not found: AbstractionsStrings.ArgumentIsEmpty` — não aparecia porque o dev
> rodava SQLite e o caminho Postgres nunca era exercitado. Hoje o pacote está em
> **10.0.3** estável. Ao atualizar EF Core, atualize o Npgsql na mesma leva.

## 4. Datas: sempre UTC

Postgres guarda `timestamp with time zone`, e o Npgsql **recusa** um `DateTime` com
`Kind` diferente de `Utc`. Isso importa em qualquer lugar que monte data a partir de
entrada do usuário:

```csharp
// errado: Kind = Unspecified → exceção no SaveChanges
var start = dto.Date.Date.AddHours(12);

// certo
var start = Periods.DayStart(Periods.Utc(dto.Date)).AddHours(9);
```

`Periods` (em `Objectives.cs`) centraliza isso e também sabe **onde o dia começa** para o
time: as fronteiras de dia e semana usam `Game:TimeZoneOffsetHours` (padrão `-3`), então a
meta diária vira à meia-noite de Brasília, não às 21h.

## 5. Produção

O `docker-compose.yml` já sobe o Postgres e passa a conexão para o backend. Não há mais
`Database__Provider` — a variável foi removida. As migrations rodam no start do container.

## 6. Onde cada coisa mora

| Tabela | Para quê |
|---|---|
| `WorkItems`, `WorkItemLabels`, `Labels` | cards do kanban e etiquetas |
| `ChecklistItems`, `WorkItemComments`, `WorkItemEvents` | checklist, discussão e auditoria do card |
| `ActivityTypes` | catálogo de tipos de lançamento (XP/gold por hora, meta, atalho) |
| `TimeEntries` | lançamentos de horas, com a recompensa concedida guardada na linha |
| `Objectives`, `ObjectiveProgress` | metas diárias/semanais e o progresso por período |
| `XpEvents` | razão de XP e gold — inclui estornos e o bônus de boas-vindas |
| `GameItem*`, `FurniturePlacements`, `PersonalRooms` | inventário e mobília do cliente Phaser |

Ver também: [`KANBAN_HORAS.md`](KANBAN_HORAS.md) para as regras de negócio em cima disso.
