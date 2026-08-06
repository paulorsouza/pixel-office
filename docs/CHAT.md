# Chat — global, prédio, sala e PM

Uma tela só, dois hospedeiros: o app web (`/#/chat`) e a folha do HUD no jogo (botão 💬 do dock).
É a mesma regra do kanban — a UI mora em `backend/.../wwwroot/shared/` e o cliente do jogo a
importa de lá. **Não reimplemente nada disso no `client-web`.**

## Os quatro canais

O canal é uma string opaca para o resto do sistema (`Chat.cs` → `ChatChannels`):

| Canal | Id | Quem recebe |
|---|---|---|
| Global | `global` | toda conexão que se anunciou (ver `ChatSetLocation`) |
| Prédio | `building:<id>` | quem está no mesmo prédio |
| Sala | `room:<cena>\|<sala>` | quem está na mesma sala |
| PM | `dm:<menor>:<maior>` | as duas pessoas, em **todas** as janelas delas |

**O servidor não conhece o mapa.** Quem diz "estou no prédio X, sala Y" é o cliente, que é quem
carrega os mapas do Tiled; o backend só higieniza os ids e transforma em grupo do SignalR. Foi essa
escolha que evitou duplicar o catálogo de cenas dentro do C#.

Os canais de lugar viajam por **grupo do SignalR**; a PM vai pelo **grupo do usuário**
(`game:user:<id>`), que o jogo e o painel web já assinam no `Join`. Por isso uma PM chega em todas as
janelas da pessoa sem ninguém assinar conversa nenhuma.

### O que é "prédio"

`buildingOf()` em `client-web/src/FloorNavigation.js`: a cena-template, com uma exceção —
os andares de salas pessoais (`personal-wing@N`) são o **mesmo prédio do campus** (`tooq-campus`).
Sem isso, subir de escada tiraria a pessoa da conversa do prédio em que ela continua estando.
Coberto por `client-web/src/chat-channels.test.mjs`.

### O que é "sala"

O mesmo `roomAtPoint()` que decide o call de voz, em `syncVoiceChannel()` (main.js). A diferença é
que a voz aceita zona aberta (`voice` no mapa) e o chat não: sala é sala. Corredor e rua têm prédio,
mas não têm sala — e isso é legítimo.

## Quem pode falar onde

`SendChat` recusa (`false`) canal que não é da conexão: só dá para falar no global, no prédio e na
sala que a conexão **declarou** em `ChatSetLocation`, ou numa PM de que a pessoa participa. Isso vale
igual para o jogo e para o app web — a checagem é uma só.

No jogo, o lugar vem do avatar e muda sozinho ao trocar de sala. No app web **não há avatar**, então
a pessoa escolhe em "⌖ Escolher prédio / sala", numa lista montada a partir da presença
(`GET /api/chat/directory`) — prédios e salas com gente **agora**. Se o avatar dessa mesma conta
estiver no mundo, o painel já abre no lugar dele (`you` na mesma resposta).

## Persistência

`ChatMessages` (canal, autor, texto, data) e `ChatReads` (até onde cada pessoa leu cada canal).
Histórico paginado para trás por `GET /api/chat/history`; não lidas e conversas por
`GET /api/chat/inbox`; `POST /api/chat/read` avança a marca (nunca para trás — duas janelas leem
fora de ordem).

Chat sem histórico é bilhete: quem entra depois precisa ver o que já foi dito, e uma PM tem de
esperar o destinatário voltar. É por isso que isso está no banco e não em memória como a presença.

## Arquivos

| Arquivo | Papel |
|---|---|
| `backend/.../Chat.cs` | modelos + o que é um canal válido |
| `backend/.../ChatHub.cs` | `ChatSetLocation`, `SendChat`, entrega |
| `backend/.../ChatEndpoints.cs` | histórico, caixa de entrada, leitura, diretório |
| `wwwroot/shared/chat-core.js` | estado: canais, histórico, não lidas (sem DOM) |
| `wwwroot/shared/chat-ui.js` | a tela |
| `wwwroot/shared/chat-ui.css` | escopado em `.wq-chat`, tokens de `work-ui.css` |
| `wwwroot/js/chat.js` | cola do app web |
| `client-web/src/hud/ChatPanel.js` | cola do jogo (folha + dock + tema escuro) |

## Detalhes que já custaram tempo

- **`setTimeout`, não `requestAnimationFrame`**, para coalescer o redesenho: em aba de fundo o rAF
  não roda, e a conversa congelava no que estava quando a aba saiu de foco.
- **Estreito é medido pelo CONTAINER**, não pela janela: a mesma tela é folha de 420px no jogo e
  painel largo no navegador. A medida também acontece a cada desenho, porque o `ResizeObserver` só
  entrega junto com o quadro — numa aba que ainda não pintou o layout nasceria largo.
- **`replaceChildren` não ignora `false`** como o `h()` de `work-core.js` ignora: ele desenha o texto
  "false" na tela. Item condicional em lista passa por `.filter(Boolean)`.
- O antigo **chat de proximidade** do app web (e as respostas dos bots) saiu: a sala é a proximidade
  agora, e manter os dois seria manter duas coisas dizendo a mesma coisa de formas diferentes.
