# AGENTS.md — leia antes de mexer no código

Projeto **Office Quest / Tooq** — escritório virtual estilo Gather.town.

## 🔴 Leitura obrigatória (nesta ordem)

1. **[`CONTEXT.md`](CONTEXT.md)** — visão geral: o que existe, como as peças se conectam, decisões
   de design que valem e próximos passos. É o mapa mental do projeto.
2. **[`ASSETS.md`](ASSETS.md)** — onde estão os assets e **tudo que já foi mapeado** (coordenadas,
   tamanhos de frame, IDs de móvel, paletas, gotchas). **Não redescubra isso.**
3. Trabalhando no cliente do jogo: **[`client-web/README.md`](client-web/README.md)** (schema do
   mapa + como editar) e **[`client-web/TUTORIAL.md`](client-web/TUTORIAL.md)** (Phaser + debug).

## ⚠️ Não confie nestes (dados obsoletos)

- [`docs/HANDOFF.md`](docs/HANDOFF.md) — retrospectiva do cliente Unity. **A ordem de direção dos
  personagens está ERRADA** (diz `down/up/left/right`; o certo é `right/up/left/down` — ver
  `ASSETS.md` §3.1).
- [`docs/historico/`](docs/historico/) — arquivo da era Unity. Serve pra entender *"por que chegamos
  aqui"*, não como instrução.

**Em caso de conflito, `CONTEXT.md` vence.**

## Estado

- **Cliente do jogo é WEB (Phaser)**, não Unity — o produto é "entrar por link". Detalhes e a
  justificativa no `CONTEXT.md` §4.
- ✅ **Backend** (ASP.NET + SignalR, porta 5210), app web em `backend/.../wwwroot`, **LiveKit**
  (porta 7880) — sólidos, não mexer sem motivo.
- ✅ **`client-web/`** — cliente Phaser multi-cena orientado a dados. `maps/scenes.json` registra a
  cidade (`world.tmj`), Tooq Office, Coworking, Dark Company, alas pessoais e o interior-base das
  casas. `src/MapRenderer.js` renderiza os mapas e `E` entra/sai pelos portais. As fontes visuais
  ficam em `tiled/maps/*.tmj`; `tools/tiled-converter.mjs` serve para migração/diagnóstico, não para
  o fluxo diário.
- ⏸️ `office-unity/` — abandonado, mantido só como arquivo.
- ✅ **Inventário/mobília** — instâncias únicas persistidas no backend; editor consome estoque,
  interações de kanban/baú/estação e sincronização SignalR por sala. Ver `CONTEXT.md` §4.
- ✅ **Kanban / horas / objetivos** — a UI existe **uma vez só**, em `backend/.../wwwroot/shared/`,
  e roda no app web e dentro do jogo. Não reimplemente essas telas no `client-web`: ele importa
  esses módulos do backend. Ver [`docs/KANBAN_HORAS.md`](docs/KANBAN_HORAS.md).
- ✅ **Banco** — **Postgres só**, schema por migrations EF. Ver [`docs/BANCO_POSTGRES.md`](docs/BANCO_POSTGRES.md).

## Regras de trabalho

1. **Verifique olhando, no navegador**, antes de dar algo como pronto.
2. **Mobile não é "depois".** Toda feature nova precisa funcionar no celular: painel vira folha
   de tela cheia em tela pequena, `env(safe-area-inset-*)` em tudo que é `position: fixed`,
   alvo de toque ≥ 44px e nada de `min-height` grande (o celular deitado tem ~390px de altura).
   **Layout** se adapta por largura; **afordância de toque** por `@media (pointer: coarse)` —
   nunca gateie controle de toque por largura. Painel novo entra no `uiIsBlocking()` de
   `main.js`, senão clique, pinça e botão de ação vazam para o mundo atrás.
3. **O interior mobiliado é o produto** — fachada/telhado/jardim (em `assets/world/`) são enfeite.
4. **Mapa como dado (JSON), não hardcode** — edição pelo dono depende disso.
5. **Rede cedo**, não no fim. Dois avatares andando juntos é o marco.
6. Ao testar movimento sozinho, `scene.input.keyboard.enabled = false` — senão você confunde o
   usuário jogando com bug (já aconteceu). **Religue** ao terminar.

## Rodar

```bash
# Postgres (obrigatório — é o único provider). Uma vez só; os dados ficam num volume.
docker compose -f docker-compose.dev.yml up -d
```

```powershell
# LiveKit (opcional)
& ".\livekit\start-livekit.ps1"

# Backend, porta 5210 — as migrations EF são aplicadas sozinhas no boot
Push-Location .\backend\VirtualOffice.Api
dotnet run
```

```bash
# Cliente do jogo, porta 8123 — estático Node, sem dependências
node client-web/server.js
```

```powershell
# Produção local v1 (stack Docker completo, banco limpo, HTTPS em https://localhost)
.\run-prod-local.ps1
```

## Assets

Packs LimeZu crus (~815 MB / 99 mil arquivos) ficam em **`LimeZu/`**, dentro do workspace mas
ignorados pelo Git (comprados, re-baixáveis do itch.io). Os recortes que o cliente usa estão versionados em
`client-web/assets/`. **Ver [`ASSETS.md`](ASSETS.md)** — mapa dos packs + todas as medidas.
