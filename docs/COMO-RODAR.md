# Como subir tudo manualmente e testar

## 0. LiveKit (áudio/vídeo/tela — precisa estar no ar para a call funcionar)

Num terminal:

```powershell
& "C:\Users\prs\Claude Sessions\virtual-office\livekit\start-livekit.ps1"
```

Espere `starting LiveKit server ... portHttp: 7880`. Deixe aberto.
Sem ele o escritório funciona normal, só a call da reunião que não conecta
(o app avisa e fica tentando de novo).

## 1. Backend (obrigatório, é ele que liga tudo)

Abra um terminal (PowerShell) e rode:

```powershell
cd "C:\Users\prs\Claude Sessions\virtual-office\backend\VirtualOffice.Api"
dotnet run
```

Espere aparecer `Now listening on: http://localhost:5210`. Deixe esse terminal aberto.

- Os dados ficam no arquivo `office.db` (SQLite) nessa pasta — sobrevivem a reinícios.
- **Para resetar tudo do zero**: pare o servidor (Ctrl+C), apague `office.db` e rode de novo
  (o seed recria usuários, sprint, tasks e inventário).

## 2. Cliente web (tasks + horas + gamificação + office 2D)

Abra no navegador: **http://localhost:5210**

Escolha um usuário (sem senha). Abas: Office, Tasks, Horas, Relatórios, Perfil.

## 3. Cliente Unity (o jogo do escritório)

1. Abra o **Unity Hub** → projeto `office-unity` (já está adicionado; se não estiver:
   Add → Add project from disk → `C:\Users\prs\Claude Sessions\virtual-office\office-unity`)
2. Com o projeto aberto, aperte **Play** (qualquer cena serve, até vazia — o jogo se monta sozinho)
3. Escolha um usuário na tela de login

Controles: **WASD/setas** andar · **E** sentar/levantar · **F** fone (na reunião) ·
**T** minhas atividades (iniciar timer, avançar status) · **H** minhas horas da semana ·
**1–4** emotes · **Enter** chat · **Scroll** zoom · **Tab** (segurar) quem está online

O timer ativo aparece na barra superior esquerda com botão **Parar** — é o mesmo timer
do web (iniciar num cliente reflete no outro). Kanban completo, relatórios e a sala
pessoal continuam no web (`http://localhost:5210`).

### Salas de dev + task ativa + sentar rastreia horas (novo)

Cada dev tem uma **sala própria num canto do mapa** com mesa nominal, cadeira e um
**quadro kanban** na parede. A HUD mostra sua **task ativa** no topo-esquerdo.

1. Vá até a sua sala (a placa mostra "Sala de <você>").
2. Chegue perto do **quadro kanban** e aperte **E** → abre a lista das suas tasks;
   clique **★ Ativar** na que você vai trabalhar (só tasks no seu nome, não concluídas).
3. **Sente na sua mesa** (E na cadeira da sua sala) → começa a contar horas nessa task
   automaticamente (status 🔴 CÓDIGO sobre seu avatar).
4. **Levante** (andar ou E) → fecha o lançamento e credita as horas + XP.
5. Confira em **H** (horas) ou na aba Horas do web que o tempo entrou na task certa.

Cada usuário já vem com uma task ativa default (dá pra trocar no kanban).

> Menu extra no editor: **OfficeQuest → Capturar screenshots** roda uma verificação
> automática (entra em Play sozinho, fotografa e fecha).

## Roteiro de teste sugerido (a integração é o produto)

1. **Multiplayer web+Unity**: entre como Paulo no Unity e como Marina no navegador
   (ou duas janelas do navegador) — vocês se veem no mesmo mapa, com os bots circulando.
2. **Chat por proximidade**: aproxime os avatares e converse; afaste e veja que a
   mensagem não chega. Bots respondem se estiverem perto.
3. **Reunião automática**: entre na Sala de Reunião (canto superior direito) com
   qualquer cliente → banner "EM REUNIÃO" → saia → vá em **Horas** no web: o
   lançamento de reunião apareceu sozinho, com XP ganho.
   - **Fone de reunião 🎧**: dentro da sala, clique em "🎧 Pegar fone e circular"
     (web) ou aperte **F** (Unity) → saia da sala andando: você continua na
     reunião (horas contando, chat com quem está na sala, fone visível no avatar).
     Só sai ao clicar "🔴 Soltar fone" (ou **F** de novo) — se estiver fora da
     sala, o lançamento fecha nesse momento. Pegar fone fora da sala é recusado.
   - **Call de verdade (mic/câmera/tela)**: com o LiveKit rodando (passo 0),
     ao entrar na reunião aparece a **barra da call** embaixo — botões de
     microfone, câmera e compartilhar tela. Abra duas janelas do navegador com
     usuários diferentes, entre na sala com os dois e converse. A call segue
     você com o fone e cai sozinha quando você sai da reunião. Se o navegador
     bloquear o som, clique em "🔊 Ativar áudio" na barra. No Unity: mesmos
     botões na barra inferior (a tela compartilhada é a janela do jogo).
4. **Timer ↔ office**: no web, abra uma task no board e clique ▶ — o status
   "🔴 TSK-x" aparece sobre o seu avatar (no Unity vira "[REC] TSK-x"). Pare o
   timer e veja o XP subir (timers de 25min+ têm chance de drop).
5. **Kanban**: arraste uma task sua para "Concluído" → toast de XP (+50) e,
   se subir de nível, drop de item.
6. **Gamificação**: aba **Perfil** — objetivos com progresso, medalhas, ranking,
   inventário; equipe outra skin e veja o avatar mudar de roupa em tempo real
   nos dois clientes; decore sua sala pessoal e salve.
7. **Relatórios**: horas por dia/categoria/pessoa/épico dos últimos 14 dias.

## Problemas comuns

| Sintoma | Causa/solução |
|---|---|
| `address already in use` ao rodar o backend | Já existe um rodando — feche o outro terminal (ou `Get-Process dotnet \| Stop-Process`) |
| Unity mostra "Backend não respondeu" | O passo 1 não está rodando; suba o backend e ele reconecta sozinho (tenta a cada 3s) |
| Reiniciou o backend com o Unity aberto | O web reconecta sozinho; no Unity, saia do Play e entre de novo |
| Quer testar drops rápido | Deixe um timer rodando 25+ min ou conclua tasks para acumular XP |
