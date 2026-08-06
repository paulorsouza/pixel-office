# Kanban, horas e objetivos

Como o trabalho vira jogo: o que o quadro faz, como as horas são lançadas, o que dá XP e
moeda, e por que jogo e app web mostram exatamente a mesma tela.

---

## 1. Uma UI só, dois clientes

A regra que sustenta tudo: **kanban, backlog, horas e objetivos existem uma vez só**, em
`backend/VirtualOffice.Api/wwwroot/shared/`. O backend serve esses módulos e os dois
clientes os consomem:

```
wwwroot/shared/work-core.js    cliente de API, helpers de DOM, formatação, toast/modal
wwwroot/shared/work-ui.css     design system escopado em `.wq` (tema claro e escuro)
wwwroot/shared/card-dialogs.js formulário e detalhe do card (criar, editar, checklist, comentários)
wwwroot/shared/quick-parse.js  parser da captura de uma linha (módulo puro, com teste)
wwwroot/shared/quick-add.js    o campo de captura em si (input + pílulas)
wwwroot/shared/board.js        quadro kanban com drag & drop posicional
wwwroot/shared/backlog.js      a mesma base em lista/tabela
wwwroot/shared/timesheet.js    semana de horas, lançamento rápido e contador ao vivo
wwwroot/shared/objectives.js   metas diárias e semanais
```

**QA sem banco:** `wwwroot/work-test.html` monta quadro, backlog e horas com um
`client` falso em memória — dá para mexer nas três telas sem Postgres e sem Phaser.
Serve `wwwroot/` com qualquer servidor estático e abre `/work-test.html`;
`?tab=hours`, `?theme=dark` e `?touch=1` cobrem os casos que costumam quebrar.

- **App web** — `wwwroot/js/board.js`, `backlog.js`, `hours.js` e `goals.js` são cascas de
  ~15 linhas. `wwwroot/js/work-bridge.js` traduz a autenticação do app para o contrato
  compartilhado.
- **Cliente do jogo** — `client-web/src/WorkPanel.js` importa os mesmos módulos **da origem
  do backend** (`import(`${apiBase}/shared/board.js`)`), monta as abas e liga
  `data-theme="dark"`. O quadro de planejamento (`of_171`) abre na aba *Quadro*; o quadro
  de métricas (`of_172`) abre em *Horas*.

Por isso `app.UseCors()` foi movido para **antes** de `app.UseStaticFiles()` no
`Program.cs`: em dev o jogo roda em `:8123` e o backend em `:5210`, e módulos ES
cross-origin precisam dos cabeçalhos de CORS. Em beta e produção tudo fica atrás do mesmo
proxy e a questão não existe.

Todo o CSS é escopado em `.wq`. Dentro do jogo o `body` pertence ao Phaser, e uma regra
solta em `button` ou `table` quebraria a HUD — por isso nenhuma regra vaza do escopo.
A camada de toast/modal também é local ao container (`createFeedback`), com a variante
`fixed` para a página do app, que rola.

## 2. O quadro

Cada card carrega: tipo, **prioridade**, código, título, **etiquetas**, responsável,
**checklist** (progresso), **comentários** (contagem), horas lançadas contra a estimativa,
**prazo** (com destaque de atrasado/próximo) e **impedimento**.

- **Ordem dentro da coluna é persistida.** `BoardOrder` é um `double` espaçado de 1000 em
  1000; `POST /api/workitems/{id}/move` recebe `{status, position}` e grava o ponto médio
  entre os vizinhos. Arrastar não renumera a coluna inteira.
- **Impedimento é atributo, não coluna.** Um card bloqueado continua no fluxo onde está,
  marcado em vermelho com o motivo — não some numa coluna "Blocked" paralela.
- **Trilha de auditoria.** `WorkItemEvents` registra criação, mudança de status,
  responsável, prioridade, sprint, bloqueio e comentário. O detalhe do card mostra o
  histórico.
- **Arquivar, não apagar.** `ArchivedUtc` tira do quadro e preserva as horas lançadas.
- **Filtros**: sprint, responsável (com atalho *Só meus*), prioridade, etiqueta, tipo e
  busca por título/código.

### Criar em uma linha

O caminho padrão para criar atividade **não é mais o formulário de 11 campos**.
No topo do backlog e no pé de cada coluna do kanban existe um campo só: digita o
título, Enter cria, o foco fica — dá para despejar dez atividades seguidas sem
tocar no mouse. Sem token nenhum sai Task/Média, na coluna onde foi digitado,
herdando o sprint e o responsável dos filtros da tela.

Tokens reconhecidos (`quick-parse.js`), válidos como palavra inteira e em
qualquer posição da frase:

| Token | Vira | Exemplos |
|---|---|---|
| `/bug` `/atd` `/task` | tipo | `/b` `/a` `/t` também |
| `!!` `!alta` `!baixa` | prioridade | `!u` `!a` `!m` `!b` |
| `@ana` | responsável | casa por prefixo, nome ou sobrenome, sem acento; `@eu` |
| `#frontend` | etiqueta, ou épico se não houver etiqueta | `_` vale por espaço |
| `~2h` `~90m` `~1,5h` | estimativa | |
| `hoje` `amanhã` `sex` `12/09` | prazo | dia da semana só na abreviação de 3 letras |

O que não casa com nada **continua no título** — nada é engolido em silêncio.
E `Ctrl/⌘+Enter` abre o formulário completo já preenchido com o que foi digitado,
para quando falta descrição ou checklist.

Duas fontes decidem tipo, prioridade e responsável, e a regra de desempate é a
recência: o **token** vale para aquela linha; a **pílula** clicada é grudenta e
sobrevive à criação (cadastrar cinco bugs seguidos é um clique, não cinco). Um
token novo derruba a pílula; continuar digitando não. As pílulas são o caminho do
celular, onde ninguém vai digitar `!alta`.

### Facilitar a atividade atual

Dois botões em cada card, e os mesmos no detalhe:

- **★** define a *atividade ativa* (`User.ActiveWorkItemId`) — é a que a estação de
  trabalho do jogo conta quando você senta.
- **▶** já inicia o contador nela. Iniciar um contador também **passa a atividade ativa**
  para aquele card: contar tempo é declarar no que se está trabalhando, e manter as duas
  coisas separadas só criava divergência.

## 3. Lançamento de horas

Tipos de lançamento são **dado** (`ActivityTypes`), não enum. Cada um define XP/hora,
gold/hora, duração padrão do atalho, se exige um card do quadro, se aceita dupla e se
conta como jornada. Balanceamento se ajusta em `WorkCatalogSeed.cs` e vale no próximo boot.

| Chave | Tipo | Atalho | XP/h | 🪙/h | Observação |
|---|---|---|---|---|---|
| `task` | 💻 Desenvolvimento | **6 h** | 60 | 30 | exige card do quadro; meta diária de 6 h |
| `pair` | 👥 Pair programming | **1 h** | 80 | 45 | aceita apontar a dupla |
| `estudo` | 📚 Estudo | **30 min** | 90 | 55 | melhor taxa: é o que se quer incentivar |
| `reuniao` | 📅 Reunião | 1 h | 40 | 20 | o jogo lança sozinho ao entrar em sala de reunião |
| `review` | 🔍 Code review | 30 min | 70 | 40 | aceita dupla |
| `suporte` | 🎧 Suporte | 1 h | 60 | 35 | |
| `planejamento` | 🗺️ Planejamento | 1 h | 50 | 25 | |
| `outro` | 📌 Outro | 30 min | 30 | 15 | |

**Lançamento rápido** é um clique: o botão já traz a duração padrão e mostra quanto vai
render. O `±` colado nele abre a folha no mesmo tipo, para ajustar antes de gravar.

**A grade da semana é o formulário.** Cada célula (tipo × dia) é um botão, inclusive as
zeradas — a linha vazia é o convite. Um toque abre a folha já sabendo o dia e o tipo; um
toque num preset de duração (15min … 8h) grava. Dois toques, sem digitar nada, e dá para
preencher a semana inteira assim. O `−`/`+` de 15 em 15 cobre o que os presets não cobrem.

- **Editar é tocar na linha** do lançamento, não só apagar: usa o `PATCH` que já existia e
  a UI nunca chamava. A **data não muda na edição** (o `PATCH` não move o dia) e a folha
  diz isso no rótulo; para trocar de dia, apaga e lança de novo.
- **Repetir o último dia** procura o último dia com movimento (até 14 dias atrás), mostra o
  que vai copiar e recria tudo com a data de hoje — em série, porque cada lançamento
  precisa passar pelo teto diário enxergando o anterior.
- **Desenvolvimento sem atividade ativa** não é mais um beco: em vez de só reclamar, abre a
  folha com o tipo escolhido para a pessoa apontar o card ali mesmo. Quem *exige* card já
  chega com a atividade ativa selecionada; quem não exige (estudo, reunião) chega com
  nenhuma, para não sujar o "lançado" de um card que não pediu aquilo.

**Contador ao vivo** (`/api/timer/start` e `/stop`, ou sentar numa estação no jogo) fecha o
lançamento e paga na hora. Encerrar na estação do jogo agora passa pelo **mesmo caminho**
do `/timer/stop` — antes a estação só fechava a linha e o tempo jogado não valia nada.

### Anti-farm e reversibilidade

- **Teto diário** (`Game:DailyXpCapFromTime` / `DailyGoldCapFromTime`, padrão 600 XP e
  400 🪙): o que passa do teto não é creditado. Lançar o dia inteiro de uma vez rende o
  mesmo que lançar aos poucos.
- **A recompensa fica guardada na linha** (`TimeEntry.XpAwarded` / `GoldAwarded`). Apagar
  ou editar o lançamento **estorna exatamente o que ele pagou**, com um `XpEvent` negativo
  no histórico. Sem isso, lançar e apagar em loop era moeda infinita.

## 4. Objetivos

Metas por período, com recompensa própria. Definidas em `WorkCatalogSeed.cs`.

| Escopo | Objetivo | Meta | Recompensa |
|---|---|---|---|
| Diário | ✅ Bateu o ponto | 1 lançamento | 10 XP · 10 🪙 |
| Diário | 🕕 Jornada completa | 6 h de trabalho | 120 XP · 60 🪙 |
| Diário | 👥 Dupla produtiva | 1 h de pair | 40 XP · 30 🪙 |
| Diário | 📚 Meia hora de estudo | 30 min | 30 XP · 25 🪙 |
| Diário | 🔍 Revisor do dia | 30 min de review | 25 XP · 20 🪙 |
| Semanal | 🏁 Semana de 30 horas | 30 h | 300 XP · 220 🪙 |
| Semanal | 🔥 Cinco dias ativos | 5 dias com lançamento | 200 XP · 150 🪙 |
| Semanal | 🚀 Três entregas | 3 cards concluídos | 150 XP · 120 🪙 |
| Semanal | 🎓 Duas horas de estudo | 2 h | 120 XP · 90 🪙 |

O progresso é **sempre recalculado a partir dos lançamentos**, nunca incrementado. Assim
corrigir ou apagar um lançamento ajusta a meta sozinho. A concessão é idempotente pela
linha única `(usuário, objetivo, período)` em `ObjectiveProgress` — o período é a data
âncora (o dia, ou a segunda-feira), no fuso do time.

Métricas suportadas: `minutes` (total ou de um tipo), `entries`, `tasks_done`,
`active_days`.

## 5. Conclusão de card também paga

Mover para *Concluído* paga uma vez, para o responsável (ou para quem moveu, se não houver
responsável), com multiplicador de prioridade:

| Tipo | Base | | Prioridade | Multiplicador |
|---|---|---|---|---|
| Task | 50 XP · 35 🪙 | | Urgente | ×1,6 |
| Bug | 60 XP · 45 🪙 | | Alta | ×1,3 |
| Atendimento | 40 XP · 30 🪙 | | Média | ×1,0 |
| | | | Baixa | ×0,8 |

## 6. Moedas do beta

`Game:WelcomeGrantCoins` credita um bônus **uma única vez por usuário, inclusive nos que já
existem** — no beta, 10 000 moedas, para todo mundo poder testar a loja de verdade.

A idempotência vem do próprio histórico: o crédito só acontece se não existir um `XpEvent`
com `Source = "grant"` e `Reason = "welcome:{WelcomeGrantKey}"`. Reiniciar o servidor não
repete o crédito; **trocar a chave** (`Game:WelcomeGrantKey`) concede uma nova rodada.

É aplicado em três pontos, todos passando pela mesma checagem: no seed de boot (pega quem
já existia), no cadastro (`/auth/register`) e em `/api/me` (pega quem se cadastrou antes de
a config mudar). Configuração em `deploy/beta.env` (`GAME_WELCOME_GRANT_COINS=10000`) e no
`docker-compose.yml`.

## 7. Sincronização entre jogo e app

Tudo passa pelo `OfficeHub`:

| Evento | Alcance | Efeito |
|---|---|---|
| `BoardChanged` | todos | o quadro é do time; qualquer card muda para todo mundo |
| `TimeChanged` | grupo do usuário | horas são pessoais; recarrega a semana |
| `RewardGranted` | grupo do usuário | toast de XP/moeda no app **e** na HUD do jogo |
| `ObjectiveCompleted` | grupo do usuário | celebra a meta nos dois clientes |

O app web entra no grupo do usuário via `Join`; o cliente do jogo via `JoinGame`.

## 8. API

| Rota | Uso |
|---|---|
| `GET /api/board` | quadro com filtros (`sprintId`, `assigneeId`, `type`, `priority`, `labelId`, `q`, `includeArchived`) |
| `GET /api/workitems/{id}` | detalhe: card, comentários, checklist, histórico e horas |
| `POST /api/workitems` · `PATCH /api/workitems/{id}` | criar e editar (inclui prioridade, prazo, bloqueio, etiquetas, arquivar) |
| `POST /api/workitems/{id}/move` | mover de coluna **e** posicionar |
| `POST /api/workitems/{id}/comments` · `DELETE /api/comments/{id}` | discussão |
| `POST /api/workitems/{id}/checklist` · `PATCH`/`DELETE /api/checklist/{id}` | checklist |
| `GET`/`POST /api/labels` | etiquetas |
| `GET /api/activity-types` | catálogo de tipos de lançamento |
| `GET /api/timesheet?from=&to=` | grade da semana, totais, contador ativo e ganhos |
| `POST /api/timeentries` · `/quick` · `PATCH`/`DELETE /api/timeentries/{id}` | lançamentos |
| `POST /api/timer/start` · `/stop` | contador ao vivo |
| `GET /api/objectives` | metas do período com progresso (recalcula na leitura) |

O código vive em `WorkEndpoints.cs`; o motor de metas em `Objectives.cs`; a economia em
`Game.cs`.
