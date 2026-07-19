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
- ✅ **`client-web/`** — cliente Phaser multi-cena orientado a dados. `maps/scenes.json` registra o
  hub (`world.json`) e os locais (`tooq-office.json`); `src/MapRenderer.js` renderiza os mapas e `E`
  entra/sai pelos portais. As fontes visuais ficam em `tiled/maps/*.tmj` e são convertidas por
  `tools/tiled-converter.mjs`; o editor antigo não participa deste runtime.
- ⏸️ `office-unity/` — abandonado, mantido só como arquivo.
- ✅ **Inventário/mobília** — instâncias únicas persistidas no backend; editor consome estoque,
  interações de kanban/baú/estação e sincronização SignalR por sala. Ver `CONTEXT.md` §4.

## Regras de trabalho

1. **Verifique olhando, no navegador**, antes de dar algo como pronto.
2. **O interior mobiliado é o produto** — fachada/telhado/jardim (em `assets/world/`) são enfeite.
3. **Mapa como dado (JSON), não hardcode** — edição pelo dono depende disso.
4. **Rede cedo**, não no fim. Dois avatares andando juntos é o marco.
5. Ao testar movimento sozinho, `scene.input.keyboard.enabled = false` — senão você confunde o
   usuário jogando com bug (já aconteceu). **Religue** ao terminar.

## Rodar

```powershell
# LiveKit (opcional)
& ".\livekit\start-livekit.ps1"

# Backend, porta 5210 — execute nessa pasta para o office.db ficar previsível
Push-Location .\backend\VirtualOffice.Api
.\bin\Debug\net10.0\VirtualOffice.Api.dll
```

```bash
# Cliente do jogo, porta 8123 — estático Node, sem dependências
node client-web/server.js
```

## Assets

Packs LimeZu crus (~815 MB / 99 mil arquivos) ficam em **`LimeZu/`**, dentro do workspace mas
ignorados pelo Git (comprados, re-baixáveis do itch.io). Os recortes que o cliente usa estão versionados em
`client-web/assets/`. **Ver [`ASSETS.md`](ASSETS.md)** — mapa dos packs + todas as medidas.
