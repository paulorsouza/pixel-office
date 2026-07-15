# AGENTS.md — leia antes de mexer no código

Projeto **Office Quest / Tooq** — escritório virtual estilo Gather.town.

## 🔴 Leitura obrigatória (nesta ordem)

1. **[`CONTEXT.md`](CONTEXT.md)** — **A FONTE DE VERDADE.** Handoff de 2026-07-15: o que existe e
   funciona, a decisão de engine, os **fatos técnicos verificados**, as tensões de design,
   **o que deu errado** e a ordem de trabalho recomendada.
2. **[`ASSETS.md`](ASSETS.md)** — onde estão os assets, o que tem em cada pack e **tudo que já foi
   mapeado** (coordenadas, tamanhos de frame, paletas, gotchas). **Não re-descubra isso.**
3. [`docs/PLANO_CLIENTE_V2.md`](docs/PLANO_CLIENTE_V2.md) — escopo em fases (escrito p/ Unity; as
   fases de gameplay/rede/minigames seguem válidas).

## ⚠️ Não confie nestes (dados obsoletos)

- [`docs/HANDOFF.md`](docs/HANDOFF.md) — retrospectiva do cliente Unity. **A ordem de direção dos
  personagens está ERRADA** (diz `down/up/left/right`; o certo é `right/up/left/down`).
- [`docs/historico/`](docs/historico/) — cópia da memória acumulada na era Unity. É **arquivo morto**:
  serve pra entender *"por que chegamos aqui"*, não como instrução.

**Em caso de conflito, `CONTEXT.md` vence.**

## Estado (2026-07-15)

- **Cliente do jogo será WEB (Phaser)**, não Unity. O produto é "entrar por link" e o Unity não faz
  isso com esta stack (WebGL descartado — SignalR custom e LiveKit ffi não rodam nele). Detalhes no
  `CONTEXT.md`.
- ✅ **Manter:** `backend/` (ASP.NET + SignalR, porta 5210), app web em `backend/.../wwwroot`,
  `livekit/` (porta 7880).
- 🔄 **Refazer:** só o cliente do jogo, **do zero**.
- ⚠️ `web-client-poc/game.js` é **descartável** (reescrito ~11x a palpite, sem arquitetura, sem rede,
  interior nunca mobiliado). **`web-client-poc/assets/` é bom** — tudo recortado e conferido,
  inclusive `office_tooq.png` (fachada com a placa **TOOQ BMS**).
- ⏸️ `office-unity/` pausado.

## Regras de trabalho (aprendidas na dor — ver seção 8 do CONTEXT.md)

1. **Fixe o escopo por escrito antes de codar.** A sessão anterior queimou horas chutando design e
   reescreveu o cliente ~11 vezes.
2. **Comece pelo INTERIOR do escritório**, não pelo cenário. As pessoas passam 8h/dia dentro — o
   interior mobiliado **é o produto**. Fachada/telhado/jardim são enfeite. (Os 339 móveis do pack
   Office **nunca foram usados**.)
3. **Não comemore antes de verificar** — e verifique olhando, no navegador.
4. **Mapa como dado (JSON), não hardcode** — as salas customizáveis pelo dono dependem disso.
5. **Rede cedo**, não no fim. Dois avatares andando juntos vale mais que qualquer telhado.
6. Ao testar movimento sozinho, use `scene.input.keyboard.enabled = false` — senão você confunde o
   usuário jogando com bug (aconteceu).

## Rodar

```powershell
# LiveKit (opcional)
& ".\livekit\start-livekit.ps1"

# Backend, porta 5210 — rodar a DLL (o `dotnet run` detached não persistia)
.\backend\VirtualOffice.Api\bin\Debug\net10.0\VirtualOffice.Api.dll
```

```bash
# POC web, porta 8123 — estático Node, sem dependências
node web-client-poc/server.js
```

## Assets

Os packs LimeZu crus (~1,3 GB) ficam **fora do repo**, em `C:\Users\prs\Claude Sessions\LimeZu\`.
São comprados, nunca mudam e são re-baixáveis do itch.io. **Ver [`ASSETS.md`](ASSETS.md)** — ele tem
o mapa dos packs e todas as medidas já verificadas.
