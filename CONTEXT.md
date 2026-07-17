# CONTEXT — Office Quest (escritório virtual da Tooq)

**Atualizado:** 2026-07-17

Visão geral pragmática do projeto: o que é, o que existe, como as peças se conectam e para onde vai.
Detalhes vivem em docs específicos (linkados no fim) — aqui é o mapa mental.

---

## 1. O produto

Escritório virtual estilo **Gather.town** para a **Tooq**: o time fica logado o dia todo, cada
pessoa com um avatar andando por um escritório 2D top-down, com **chat de proximidade**, **A/V**
(LiveKit), integração com **tasks/horas** e **gamificação**.

O que importa: as pessoas passam o dia **dentro do escritório**. O interior mobiliado **é o
produto**; fachada, jardim e mundo externo são cenário.

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

Phaser 3 (vendorizado, sem CDN). **O escritório é dado**, não código: descrito em
`maps/tooq-office.json` e desenhado por `src/MapRenderer.js`. Edita-se **na mão** (JSON) ou **no
jogo** (editor de móveis, tecla `E`) — os dois gravam o mesmo arquivo via `POST /api/map/...`.

```
client-web/src/main.js         Phaser + OfficeScene (player, câmera, zoom, anims)
client-web/src/MapRenderer.js   desenha building/zones/rooms/paredes a partir do JSON
client-web/src/Editor.js       editor de móveis in-game
client-web/maps/tooq-office.json  ← o escritório
```

**Schema do mapa, como editar, referência de móveis e limitações conhecidas:**
👉 [`client-web/README.md`](client-web/README.md).
**Padrões de Phaser e debug no navegador:** 👉 [`client-web/TUTORIAL.md`](client-web/TUTORIAL.md).

**Estilo visual (decidido com o usuário):** salão **aberto** estilo Gather — áreas comuns são
*zonas* (tapetes de piso, sem parede: cozinha, lounge, piscina, zonas de time); só as *salas
pessoais* são fechadas (1 por pessoa). Pisos lisos (não "dungeon"). Paredes finas + **parede norte
3D** com face de tijolo para pendurar decoração.

---

## 4. Decisões que valem (e por quê)

**Engine = web (Phaser), não Unity.** O produto é "entrar por link"; Unity com esta stack não faz
isso (WebGL não roda `MiniSignalR` nem o SDK ffi do LiveKit ⇒ viraria app desktop). E o ciclo de
trabalho na web é incomparável: roda, olha no navegador, corrige em segundos. **Mantém-se:** backend
C#, app web, LiveKit. **Refez-se:** só o cliente do jogo.

**Mapa como dado (JSON), não hardcode.** O roadmap pede salas customizáveis pelo dono — só funciona
se o mapa for dado. Já é: renderer + editor operam sobre o JSON. A edição in-game é "editar o JSON e
salvar", não uma reescrita de código.

**Fachada bonita + interior grande (não roof-reveal).** Roof-reveal (entrar = remover o teto) amarra
o tamanho do interior ao do telhado ⇒ laje cinza feia em interior grande. Os prédios lindos do Modern
Exteriors são **fachadas em 3/4**, não telhados top-down. Padrão escolhido: fachada por fora +
entrar ⇒ interior grande (estilo Pokémon/Stardew). A fachada **TOOQ BMS** já está pronta
(`assets/world/office_tooq.png`).

**Multi-andar por troca de camada, não troca de cena.** Mostrar/esconder o container do andar + trocar
o grupo de colisão, acionado por escada. Testado e funcionou; preferir a teleporte entre mapas.

**Estrutura de mundo pretendida:**
```
Interior do escritório (vários andares)   ← o PRODUTO
        ↑ porta
Jardim/terreno da Tooq (cercado)
        ↑ portão
Mundo aberto
```

---

## 5. Assets

Comprados (LimeZu, ~1,3 GB) ficam **fora do repo** em `C:\Users\prs\Claude Sessions\LimeZu\`
(re-baixáveis do itch.io). Os **recortes** que o cliente usa estão versionados em
`client-web/assets/`. Política, estrutura dos packs e **todas as medidas já verificadas** (chars,
paredes, pisos, móveis, exteriores, porta animada):
👉 [`ASSETS.md`](ASSETS.md). **Não redescubra medida** — está lá.

---

## 6. Próximos passos

1. **Corrigir a ancoragem dos móveis no editor** (footprint real via `w`/`h` do catálogo + snap ao
   tile). É o que destrava mobiliar de verdade — hoje peças multi-tile desalinham. Detalhe em
   `client-web/README.md`.
2. **Mobiliar o interior** (estações de trabalho, cozinha, lounge, salas pessoais).
3. **Plugar rede** (SignalR JS + contrato de 28/tile). Dois avatares no mesmo mapa é o marco.
4. **Decoração de parede** na face de tijolo (quadros/TV/troféu).
5. **A/V por proximidade** (LiveKit JS), depois da rede.
6. **Exterior** por último (fachada já pronta + jardim + portão).

---

## 7. Perguntas em aberto (alinhar quando pegarem cada frente)

- A Tooq tem **paleta/identidade visual**? Dá pra tingir placa e detalhes em vez do cinza genérico.
- V1 é **um andar** ou já multi-andar?
- Quantas pessoas **simultâneas** o v1 precisa aguentar?

---

## 8. Docs relacionados

- [`client-web/README.md`](client-web/README.md) — schema do mapa, como editar, móveis, limitações.
- [`client-web/TUTORIAL.md`](client-web/TUTORIAL.md) — padrões de Phaser + debug no navegador.
- [`ASSETS.md`](ASSETS.md) — onde estão os assets e todas as medidas verificadas.
- `docs/PLANO_CLIENTE_V2.md` — plano em fases (F0-F10). Foi escrito p/ Unity; as fases de
  gameplay/rede/minigames seguem válidas como referência de escopo.
- `docs/historico/` — retrospectivas antigas (loop cego do Unity). Arquivo; ⚠️ o `HANDOFF.md` tem a
  **ordem de direção dos chars ERRADA** — use a do `ASSETS.md` §3.1.
- Memória do projeto: `projeto-escritorio-virtual.md`, `poc-web-phaser.md`.
