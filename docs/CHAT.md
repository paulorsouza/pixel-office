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

## No jogo: o chat não para o mundo

A folha do chat é a **única folha do chassi que não bloqueia** (`blocking: false` no
`createSheet`). Conversa é coisa que se acompanha andando; congelar o avatar para ler uma linha
transformava o chat numa parada. Clique dentro da folha não vaza para o mundo porque o Phaser
escuta no canvas, e a folha está por cima dele.

Quem tira o teclado do jogo é o **foco do campo**, não a folha — disso já cuidava o
`KeyboardGuard`. As pontas soltas que sobravam viraram regra:

| Ação | O que acontece |
|---|---|
| `Enter` no mundo | abre o chat com o cursor já no campo (é a tecla de falar) |
| `Enter` no campo | envia (`Shift+Enter` quebra linha) |
| `Esc` digitando | devolve o teclado ao mundo **sem fechar** — o rascunho e a rolagem ficam |
| `Esc` fora do campo | fecha a folha |
| clique no mundo | tira o cursor do campo e anda (o `pointerdown` do canvas é a definição de "clicou fora") |

## Aviso no canto e balão na cabeça

**Cartão no canto superior direito** quando chega mensagem com a folha fechada. Não é um toast:
toast conta o que aconteceu e some; este **é o caminho de volta** — tocar nele abre o chat já no
canal da mensagem. Os outros cantos têm dono (horas em cima à esquerda, dock embaixo à esquerda,
barra da reunião embaixo ao centro).

Isso exigiu separar duas coisas que estavam misturadas no store: **"canal selecionado" não é
"canal à vista"**. No jogo o chat vive fechado com o global selecionado, e sem `setVisible()` toda
mensagem que chegasse era marcada como lida por uma tela que ninguém estava olhando — nenhum aviso
apareceria nunca.

**Balão sobre a cabeça** de quem escreveu (`client-web/src/ChatBubbles.js`), alimentado por
`store.onAnyMessage` — que dispara para toda mensagem, inclusive a própria, porque balão não tem
nada a ver com "lida" ou "nova". Detalhes que valem:

- **Só canal de lugar.** PM não vira balão: ela é privada, e desenhá-la sobre a cabeça de alguém —
  mesmo que só na minha tela — ensinaria exatamente a coisa errada sobre o que é privado aqui.
- **Texto aparado em 90 caracteres, com `…`.** Um parágrafo sobre a cabeça tapa o cenário e some
  antes de ser lido. O corte respeita a palavra, exceto quando ela engoliria o balão inteiro.
- **Reancorado a cada quadro** em vez de preso ao sprite: é o que mantém o balão colado em quem
  anda, e o que faz ele sumir sozinho quando a pessoa troca de cena — a âncora deixa de existir.
- Quem está sentado tem o balão na âncora da cadeira (`presence.avatarAnchor`), a mesma referência
  do rótulo com o nome; sem isso o balão ficaria na última posição em que a pessoa andou.

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
| `client-web/src/hud/ChatPanel.js` | cola do jogo (folha + dock + aviso no canto + tema escuro) |
| `client-web/src/ChatBubbles.js` | balão sobre a cabeça (texto aparado, só canal de lugar) |

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
