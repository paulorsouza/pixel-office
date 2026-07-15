---
name: poc-web-phaser
description: Cliente do jogo vai ser WEB (Phaser). POC de 2026-07-14/15 descartável; LEIA virtual-office/CONTEXT.md antes de qualquer coisa
metadata: 
  node_type: memory
  type: project
  originSessionId: 1d4fce5b-2bec-4c26-8a88-fc88315bf4f4
---

**⚠️ COMEÇAR POR AQUI: `C:\Users\prs\Claude Sessions\virtual-office\CONTEXT.md`** — handoff completo
escrito em 2026-07-15 quando o usuário decidiu **recomeçar o cliente do zero em outra sessão**.
Tem os fatos técnicos verificados (mapeamento de tiles, frames, offsets), as decisões de design e,
principalmente, **o que deu errado**. Não reinventar nem re-descobrir.

**Decisão de engine (2026-07-14, mantida):** cliente do jogo em **web/Phaser**, não Unity. Motivos:
produto é "entrar por link" (Unity WebGL descartado — MiniSignalR e LiveKit ffi não rodam em WebGL);
ciclo de trabalho web é incomparável (vejo/dirijo o navegador em segundos vs. loop cego do Unity);
LiveKit JS + SignalR JS mais simples; escala melhor (carrega só a área onde a pessoa está).
**MANTÉM:** backend C# (porta 5210), app web React (wwwroot), LiveKit. **REFAZ:** só o cliente.

**POC em `virtual-office/web-client-poc/`** — Phaser 3.80.1 local, `server.js` (Node sem deps),
launch.json name **"web-poc"** porta 8123. **O `game.js` é DESCARTÁVEL** (reescrito ~11x a palpite,
sem arquitetura, sem rede, interior nunca mobiliado). **APROVEITAR:** a pasta `assets/` (tudo já
recortado e conferido, inclusive `office_tooq.png` = fachada com a placa **TOOQ BMS** que eu
construí pixel a pixel, e `sign_tooq.png`), o `server.js`, e os fatos do CONTEXT.md.

**Fatos que mais custaram (detalhe no CONTEXT.md):** chars 24 frames 16x32 ordem
**right/up/left/down** (HANDOFF.md está errado); parede fina = cols 7-9 do room_builder, com
**`rb_8_1`** sendo a horizontal sem emenda (não rb_3_1); parede 3D decorável = **`rb_1_9`+`rb_1_10`**;
porta animada Office = **frames 48x32, 14 frames, 0 fechada / 8 aberta** (não 32x32/21);
grama fill seamless = **Grass_1_22**. Packs LimeZu (inclui **Modern Exteriors**, comprado 2026-07-15).

**Tensão de design descoberta na marra:** roof-reveal amarra o interior ao tamanho do telhado
(interior grande ⇒ laje cinza feia) e Modern Exteriors é **3/4 fachada**, não telhado top-down.
**Escolha do usuário:** fachada bonita por fora + entrar ⇒ interior grande multi-andar.

**Lição de método (a mais importante):** eu chutei design em vez de fixar requisito, comemorei cedo,
e caçei bug fantasma — o boneco "andando sozinho" **era o usuário jogando** enquanto eu testava
(usar `input.keyboard.enabled=false` pra testar). E gastei a sessão no cenário: **o interior
mobiliado — que É o produto — nunca foi feito**. No recomeço: **começar pelo interior**, fixar
escopo por escrito antes de codar, rede cedo, exterior por último. Ver [[projeto-escritorio-virtual]].
