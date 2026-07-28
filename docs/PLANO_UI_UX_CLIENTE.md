# Plano — refatoração de UI/UX do cliente do jogo

Escopo: HUD e menus do `client-web/`, o card fixo de horas, o estado (status) do usuário e a
regra de lançamento de horas dirigida por esse estado. Não muda mapa, arte do mundo nem a UI
compartilhada de quadro/horas/objetivos (`wwwroot/shared/`) — o jogo continua **hospedando**
essa UI, não reimplementando.

Decisões já tomadas com o dono do produto:

1. **Menu principal = dock de ícones + folha.** Não é overlay de pause nem rail permanente.
2. **Estado não fragmenta o lançamento**: com uma linha de horas aberta, a mudança de estado
   só **carimba observação** nela.
3. **O card de horas é sempre visível** (com ou sem contador rodando).

---

## 0. Onde estão as coisas hoje (ponto de partida)

| Peça | Arquivo | Situação |
|---|---|---|
| Dica de teclas (fixa embaixo) | `client-web/index.html:379` (`#controls`) | **sai** |
| Card da cena | `#scene-card` (topo-esquerda) | vira linha do novo dock |
| "Decorar sala" | `#room-decoration-entry` (direita, `top:84px`) | absorvido pelo dock |
| Hub do jogador / cartas | `#player-hub-button`, criado em `cardgame/CardGamePanel.js:37` | absorvido pelo dock |
| "Menu principal" atual | `#equipment-menu` (Tab), abas Equipamentos/Personagem | vira duas folhas do dock |
| Barra de reunião | `#mh-bar`, `MeetingHUD.js` | fica onde está (bottom-center); ganha coordenação de z-index/idle com o dock |
| Painel de móvel/trabalho | `#furniture-interaction-panel` | vira folha; corrige scroll |
| Predicado "tem painel na frente" | `main.js:602` `uiIsBlocking()` | vira registro central |
| ~360 linhas de CSS | dentro do `<style>` do `index.html` | extraído para `client-web/src/hud/hud.css` |

Estado/horas no backend: `PlayerState.Status` (string) em `Presence.cs`, preenchido só pelo
contador (`OfficeHub.StartAutoEntryAsync`, `Program.cs /timer/start`, `StartWorkSession`).
`SetZone("meeting")` abre/fecha o lançamento de reunião. O `Snapshot` já carrega `status`,
mas **o cliente do jogo ignora** — quem consome hoje é só o app web (`wwwroot/js/chat.js:29`).

---

## Fase 1 — Chassi da HUD (dock + folhas)

**Entrega:** `client-web/src/hud/` com `HudShell.js`, `Dock.js`, `Sheet.js`, `hud.css`.

- `HudShell` é o **único** lugar que decide regiões, z-index e safe-area. Hoje isso está
  espalhado entre o `<style>` do `index.html`, o `injectStyles()` do `MeetingHUD` e o
  `cardgame-styles`.
- `Dock`: barra compacta de ícones — **Trabalho, Personagem, Itens, Loja, Cartas, Decorar,
  Voz, Ajuda**. Itens contextuais (Decorar só onde a sala é decorável) somem, não ficam
  desabilitados. Alvo ≥ 44px por `(pointer:coarse)`, como manda o `AGENTS.md` §2.
- `Sheet`: painel lateral no desktop, **folha de tela cheia** abaixo de 760px, com
  `overscroll-behavior:contain` e a região de conteúdo como única área rolável.
- **Registro central**: `hud.register(panel)` — `uiIsBlocking()` passa a perguntar ao shell.
  Painel novo entra por registro, não editando a lista de `main.js` (foi assim que o cardgame
  quase vazou clique e pinça para o mundo).
- `#controls` é removido; as teclas viram a folha **Ajuda** (teclas no desktop, gestos no toque).

**Feito quando:** dock aparece nas três larguras de teste, cada folha abre/fecha por toque e
por Esc, e nenhum clique/pinça vaza para o mundo com folha aberta.

---

## Fase 2 — Card fixo de horas (esquerda)

**Entrega:** `client-web/src/hud/TimeDock.js`.

Dois estados, sempre visível:

- **Sem contador** — total de hoje, meta do dia, e `▶ Iniciar` na atividade ★.
- **Com contador** — atividade (`código · título`), cronômetro ao vivo, o estado atual
  (focado / em reunião / pausa) e `■ Parar`.

Regras:

- Fonte de verdade é o servidor: `GET /api/timesheet` já devolve `running`, `dayTotals` e a
  meta. Atualização por evento do hub (`TimeChanged`, `WorkSessionChanged`, `RewardGranted`) —
  **sem polling**; o cronômetro é só formatação local a partir de `startUtc`.
- Importa `hm()` e o cliente de API de `${apiBase}/shared/work-core.js`, o mesmo caminho que o
  `WorkPanel.js` já usa. Nada de segunda formatação de horas no jogo.
- Tocar no card abre a folha **Trabalho → Horas** (a UI compartilhada, inalterada).
- Celular: vira pílula no topo-esquerda com cronômetro + estado; o card completo mora na folha.
- `#scene-card` deixa de ser um bloco solto e passa a ser a primeira linha desta coluna.

---

## Fase 3 — Estado do usuário

**Modelo** (novo, derivado — nunca digitado pelo usuário):

```
kind:   focus | meeting | coffee | idle
detail: nome da sala (meeting) ou código da atividade (focus)
since:  quando entrou no estado
```

- **Cliente** (`PresenceSystem.js`): novo `setPresenceState(kind, detail)` com o mesmo throttle
  do `setZone`. Derivação em `main.js`: sentado em `workstation`/`seat` com `interactionKey`
  → `focus`; dentro do `meetingRect` **ou** com fone → `meeting` + nome da sala; café na mão
  → `coffee`; senão `idle`.
- **Backend**: `PlayerState.StatusKind` / `StatusDetail`; `SetZone` passa a receber
  `(zone, detail)` — **atualizar também `wwwroot/js/meeting.js:33,58`**, que é o outro chamador
  (SignalR não aceita chamada com menos argumentos que a assinatura). O broadcast `Status`
  ganha `kind`/`detail` e **mantém** o `label` string, para o app web não quebrar.
- **Render**: badge no label do avatar (🔴 focado / 📅 reunião / ☕ pausa), linha de estado no
  card de horas, painel *Pessoas* do `MeetingHUD` e a lista de online do app web (que já lê
  `status`). O cliente do jogo passa a ouvir `Status` (mapeando `userId` → conexões, porque os
  avatares remotos são chaveados por `key`).

---

## Fase 4 — Horas dirigidas pelo estado (backend)

Regra escolhida: **linha aberta recebe observação; sem linha aberta, o estado abre a linha certa.**

| Situação | Com lançamento aberto | Sem lançamento aberto |
|---|---|---|
| Entra em reunião | carimba `[HH:mm] em reunião: {sala}` na nota | abre lançamento `reuniao` (como hoje) |
| Senta no computador | carimba `[HH:mm] focado` | abre `task` na atividade ★; **sem ★, abre `task` sem card, nota "focado sem atividade"** |
| Pega café | carimba `[HH:mm] pausa do café` | **não abre nada** — pausa não é jornada |

- Implementação em `OfficeHub`: um `AnnotateOpenEntryAsync(kind, detail)` ao lado do
  `StartAutoEntryAsync` atual, e `Program.cs StartWorkSession` deixa de **exigir** work item
  (hoje devolve `400 "Escolha uma atividade disponível"`, que é o que impede "focado sem atividade").
- `TimeEntry.Note` vira log curto: não repete o mesmo estado em sequência e tem teto de tamanho
  (~500 chars, corta o começo). Sem coluna nova, sem migration.
- A grade de horas já mostra `note`; as observações aparecem como chips na linha do lançamento.
- Documentar a tabela acima em `docs/KANBAN_HORAS.md` §3 — é regra de negócio, não detalhe de UI.

---

## Fase 5 — Scroll e miniaturas

**Scroll** — suspeitos levantados no CSS, cada um confirmado no navegador antes e depois:

1. `#furniture-interaction-content{max-height:570px}` fixo dentro de painel `overflow:hidden`
   → baú, estação e loja **cortam** em janela abaixo de ~660px. O modo `.work` já é flex; o
   resto não. Fix: painel sempre flex-column, conteúdo `flex:1;min-height:0`, sem max-height fixo.
2. `#equipment-menu` rola inteiro **e** tem `#equipment-list{max-height:362px}` e
   `.loadout-board{height:362px}` fixos → duas rolagens concorrentes. Fix: header/abas/rodapé
   fixos, só o miolo rola.
3. `#character-controls{max-height:365px}` — mesmo caso.
4. Painel de trabalho: `.wq` com `minHeight:100%` dentro de container de altura automática →
   percentual sem referência, e as colunas do kanban não rolam sozinhas. Fix: `height:100%` na
   cadeia inteira + `min-height:0` nos itens flex.
5. Toque: `overscroll-behavior:contain` nas folhas, senão a rolagem vaza para o `body`
   (`html,body{overflow:hidden}` faz isso virar "não rola nada").

**Miniaturas** — componente único `ItemThumb`, usado por baú, loja, catálogo de decoração e
inventário (hoje são três marcações diferentes):

- Catálogo de decoração usa `transform:scale(1.8)` para **todo** sprite (`index.html:263`):
  item de 16px fica minúsculo, item de 96px estoura o quadro. Fix: caixa fixa (64×64) com
  escala **inteira** calculada de `naturalWidth/Height` (pixel art: nearest, sem meio pixel).
- `GameInventorySeed.cs:126` só preenche `IconPath` para móvel: equipamento e veículo ficam com
  `IconPath = ""` → `<img src="">` quebrado no baú e loja **sem imagem nenhuma**. Fix: ícone
  para equipamento/veículo (reaproveitando os glifos já desenhados) + placeholder por raridade.

---

## Fase 6 — QA e docs

- `hud-test.html` ganha dock, card de horas e os estados — QA de HUD aqui é sem Phaser
  (screenshot no pane trava; usa-se JS + `read_page`).
- Checklist em **390×390** (celular deitado), **375×812** e **1280×800**, com `?touch=1`:
  cada área rolável testada até o fim; folha aberta não vaza clique nem pinça; safe-area em
  tudo que é `position:fixed`.
- Atualizar `CONTEXT.md` §4 (decisão do dock e do estado derivado), `docs/KANBAN_HORAS.md` §3
  (tabela da Fase 4) e `client-web/README.md` se a HUD entrar no contrato de mapa.

---

## Ordem de entrega

Um commit utilizável por fase, nesta ordem: **1 → 2 → 5(scroll) → 3 → 4 → 5(miniaturas) → 6**.
Scroll antes do estado porque a Fase 2 já joga conteúdo novo nas folhas — corrigir depois seria
depurar dois problemas ao mesmo tempo.

## Riscos

- **O `<style>` de 360 linhas do `index.html`** é usado por seletor por vários módulos JS;
  extrair sem quebrar exige mover em bloco e conferir cada `querySelector`.
- **`SetZone` muda de assinatura** — o app web é o outro chamador e precisa ir junto.
- **`Note` como log**: sem teto, uma sessão longa engorda a linha e polui a grade de horas.
- **Não duplicar a UI compartilhada**: o card de horas mostra e comanda, mas quem edita
  lançamento continua sendo `wwwroot/shared/timesheet.js`.
