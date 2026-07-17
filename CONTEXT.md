# CONTEXT — Office Quest (escritório virtual da Tooq)

**Atualizado:** 2026-07-17

Visão geral pragmática do projeto: o que é, o que existe, como as peças se conectam e para onde vai.
Detalhes vivem em docs específicos (linkados no fim) — aqui é o mapa mental.

---

## 1. O produto

Escritório virtual estilo **Gather.town** para a **Tooq**: o time fica logado o dia todo, cada
pessoa com um avatar andando por um escritório 2D top-down, com **chat de proximidade**, **A/V**
(LiveKit), integração com **tasks/horas** e **gamificação**.

O jogo tem **várias cenas independentes** e um **quintal central caminhável** que funciona como hub:
nele o jogador escolhe quais locais visitar. O escritório é uma dessas cenas e reúne o interior
mobiliado com um pequeno quintal privado; o exterior dá contexto e escolha sem virar um mapa vazio.

Entrar é **por link** (abrir a URL e já estar dentro) — foi o motivo de o cliente ser **web**, não
Unity (ver §4).

---

## 2. As peças do sistema

| Peça | Onde | Estado |
|---|---|---|
| **Backend C#** | `backend/VirtualOffice.Api` | ✅ ASP.NET + EF/SQLite + SignalR. Porta **5210**. Subir pelo `.dll` em `bin\Debug\net10.0\` (o `dotnet run` detached não persistia). |
| **App web** (tasks/horas) | `backend/.../wwwroot` | ✅ Kanban, sprints, horas, relatórios, perfil. ES modules, sem build. |
| **LiveKit** | `livekit/` | ✅ SFU self-hosted, porta **7880**. Token só se `Presence.InMeeting`. |
| **Contrato de mapa** | `backend/OfficeLayout.cs` | Server units = **28 por tile**. |
| **Cliente do jogo** ⭐ | `client-web/` | ✅ Phaser 3, orientado a dados. É onde o trabalho de cliente acontece. |
| Cliente Unity (antigo) | `office-unity/` | ⏸️ Abandonado (ver §4). Mantido só como arquivo. |

---

## 3. O cliente (`client-web/`)

Phaser 3 (vendorizado, sem CDN). **As cenas são dados**, não código: o manifesto
`maps/scenes.json` registra os mapas e `src/MapRenderer.js` desenha tanto mundos quanto interiores.
O runtime troca de mapa e spawn pelos portais. O level design é feito visualmente no **Tiled**;
`tools/tiled-converter.mjs` converte os `.tmj` para os JSONs enxutos do runtime. O editor de móveis
antigo foi preservado apenas como referência.

```
client-web/src/main.js          runtime de cenas, player, câmera, HUD e portais
client-web/src/MapRenderer.js   desenha world/interior a partir do JSON
client-web/maps/scenes.json     manifesto e cena inicial
client-web/maps/world.json      hub caminhável
client-web/maps/tooq-office.json  escritório térreo
client-web/tiled/maps/*.tmj       fontes visuais editáveis no Tiled
client-web/tools/tiled-converter.mjs  conversor bidirecional + validação
```

**Schema do mapa, referência de campos e limitações conhecidas:**
👉 [`client-web/README.md`](client-web/README.md).
**Tutorial passo a passo para editar o mundo e escolher uma IDE:**
👉 [`client-web/GUIA-EDICAO.md`](client-web/GUIA-EDICAO.md).
**Fluxo visual no Tiled:** 👉 [`client-web/tiled/README.md`](client-web/tiled/README.md).
**Padrões de Phaser e debug no navegador:** 👉 [`client-web/TUTORIAL.md`](client-web/TUTORIAL.md).

**Estilo visual:** salão **aberto** estilo Gather — áreas comuns são *zonas* (tapetes de piso, sem
parede: café, lounge e zonas de time); salas de reunião podem ser fechadas. Pisos lisos (não
"dungeon"). Paredes brancas finas + **parede norte 3D** de tijolo, portas de vidro nos vãos e
estações de trabalho organizadas em mesa/computador/cadeira.

---

## 4. Decisões que valem (e por quê)

**Engine = web (Phaser), não Unity.** O produto é "entrar por link"; Unity com esta stack não faz
isso (WebGL não roda `MiniSignalR` nem o SDK ffi do LiveKit ⇒ viraria app desktop). E o ciclo de
trabalho na web é incomparável: roda, olha no navegador, corrige em segundos. **Mantém-se:** backend
C#, app web, LiveKit. **Refez-se:** só o cliente do jogo.

**Mapa como dado, não hardcode.** O roadmap pede salas customizáveis pelo dono — só funciona se o
mapa for dado. A fonte visual é o `.tmj` do Tiled; o conversor gera o JSON consumido pelo renderer.
O round-trip é testado para não perder campos do contrato atual.

**Fachada bonita + interior grande (não roof-reveal).** Roof-reveal (entrar = remover o teto) amarra
o tamanho do interior ao do telhado ⇒ laje cinza feia em interior grande. Os prédios lindos do Modern
Exteriors são **fachadas em 3/4**, não telhados top-down. Padrão escolhido: fachada por fora +
entrar ⇒ interior grande (estilo Pokémon/Stardew). A fachada **TOOQ BMS** já está pronta
(`assets/world/office_tooq.png`).

**Sem múltiplos andares.** A unidade de navegação é a cena. Cada prédio/local aponta para um mapa
independente, com spawn de entrada e portal de retorno. O escritório atual é apenas térreo.

**Estrutura de mundo:**
```
Quintal central compacto (hub)
        ├── Escritório Tooq (cena térrea)
        ├── Local/cena futura A
        └── Local/cena futura B
```

**Primeiro corte implementado:** quintal central → porta da fachada → escritório + quintal privado
→ portão → hub. Objetos volumosos carregam footprints de colisão no JSON; os limites de câmera são
dados e terminam nos portões. O mesmo contrato de `portals[]` e `spawns` permite acrescentar novas
cenas sem criar outra classe Phaser.

---

## 5. Assets

Comprados (LimeZu, ~1,3 GB) ficam **fora do repo** em `C:\Users\prs\Claude Sessions\LimeZu\`
(re-baixáveis do itch.io). Os **recortes** que o cliente usa estão versionados em
`client-web/assets/`. Política, estrutura dos packs e **todas as medidas já verificadas** (chars,
paredes, pisos, móveis, exteriores, porta animada):
👉 [`ASSETS.md`](ASSETS.md). **Não redescubra medida** — está lá.

---

## 6. Próximos passos

1. **Plugar rede por cena** (SignalR JS + `sceneId` + contrato de 28/tile). Dois avatares na mesma
   cena é o próximo marco; jogadores em cenas diferentes não devem ser renderizados juntos.
2. **Refinar o pipeline Tiled** (propriedades tipadas, preview automática e footprint por móvel).
3. **Persistir mapas customizados** sem assumir um único `tooq-office.json`.
4. **Adicionar a segunda cena de destino** ao hub para provar que a arquitetura cresce além do
   escritório.
5. **A/V por proximidade** (LiveKit JS), depois da presença em rede.
6. **Polimento visual e conteúdo** do escritório, preservando o mapa como JSON.

---

## 7. Perguntas em aberto (alinhar quando pegarem cada frente)

- A Tooq tem **paleta/identidade visual**? Dá pra tingir placa e detalhes em vez do cinza genérico.
- Quantas pessoas **simultâneas** o v1 precisa aguentar?

---

## 8. Docs relacionados

- [`client-web/README.md`](client-web/README.md) — schema do mapa, como editar, móveis, limitações.
- [`client-web/GUIA-EDICAO.md`](client-web/GUIA-EDICAO.md) — tutorial prático de edição e IDEs.
- [`client-web/tiled/README.md`](client-web/tiled/README.md) — operação do editor visual Tiled.
- [`client-web/TUTORIAL.md`](client-web/TUTORIAL.md) — padrões de Phaser + debug no navegador.
- [`ASSETS.md`](ASSETS.md) — onde estão os assets e todas as medidas verificadas.
- `docs/PLANO_CLIENTE_V2.md` — plano em fases (F0-F10). Foi escrito p/ Unity; as fases de
  gameplay/rede/minigames seguem válidas como referência de escopo.
- `docs/historico/` — retrospectivas antigas (loop cego do Unity). Arquivo; ⚠️ o `HANDOFF.md` tem a
  **ordem de direção dos chars ERRADA** — use a do `ASSETS.md` §3.1.
- Memória do projeto: `projeto-escritorio-virtual.md`, `poc-web-phaser.md`.
