# Plano — Recriação do Cliente Unity (v2)

> **DOCUMENTO HISTÓRICO.** O cliente oficial agora é `client-web/` em Phaser; não execute este plano
> como instrução atual. Consulte `CONTEXT.md`. No cliente web já existem: Tiled direto, múltiplas
> cenas, avatar modular (parte da F10), editor de salas com instâncias únicas no backend e
> sincronização SignalR de mobília (núcleo da F9). Presença de avatares e A/V no Phaser continuam
> pendentes. As fases abaixo servem apenas como referência de ideias de produto.

**Data:** 2026-07-13
**Objetivo:** refazer o cliente Unity do zero com a qualidade visual dos exemplos do
[Modern Office da LimeZu](https://limezu.itch.io/modernoffice), usando os packs comprados.
**Mantém-se:** backend C# (ASP.NET + SignalR + LiveKit), app web (wwwroot), contrato de
server units (28/tile), `Api.cs`/`MiniSignalR.cs`.

---

## Por que desta vez vai funcionar (o que mudou)

As tentativas anteriores falharam por duas causas raiz, ambas resolvidas:

1. **Arte carregada em runtime, fora do pipeline do Unity** → agora TUDO entra pelo
   pipeline real: sprites importados no editor, Tilemap, prefabs, Animator, atlas.
2. **Loop de trabalho às cegas** (headless, sem ver o editor) → agora o **MCP do Unity
   funciona** (verificado hoje; era só throttling de background). Eu consigo: ler a
   hierarquia das cenas, ler o console, entrar/sair de Play, executar menus, criar/mover
   objetos — e disparar renders que eu mesmo leio como imagem. O trabalho às cegas acabou.

**Lição mantida:** level design estético é trabalho de olho humano. Eu preparo todas as
ferramentas e verifico tecnicamente; **quem pinta o mapa final é você** (com paleta pronta,
referência do lado e me mandando print só nos gates).

---

## Decisões de base (propostas)

| Decisão | Escolha | Por quê |
|---|---|---|
| Resolução da arte | **16px, PPU 16, Pixel Perfect Camera** | A arte LimeZu é autorada em 16px (32/48 são upscale). Pixel perfect + zoom dá o look do itch.io. |
| Projeto | **Recomeço in-place em `office-unity`** (limpar `Assets/`, manter `ProjectSettings/` + URP 2D + manifest) | URP/licença/pacotes já resolvidos; bootstrap novo já causou horas de travamento (LiveKit git). |
| Mapa | **Tilemap + RuleTile (paredes autoconectam) + móveis como prefabs YSort** | O jeito documentado/correto; paredes com altura (topo+face) como nos Office_Designs. |
| Personagens | **Character Generator do Modern Interiors** (partes: Body→Eyes→Outfit→Hairstyle→Accessory) | Avatar customizável andando, mesma técnica do pack. Começamos com premades. |
| UI in-game | **UI Toolkit** (USS) + referências do pack `modernuserinterface` | UITK já provou qualidade (kanban ficou bom); o pack dá ícones/molduras no mesmo estilo pixel. |
| Mundo | **Prédios = mapas interiores** ligados por lobby/elevador | Não temos o pack Modern Exteriors (rua/fachadas). Ver "Decisão pendente" abaixo. |
| A/V (LiveKit) | Entra **só na fase 7**, via pacote embedded `file:` | Evita o hang de horas do clone git de 1,2GB. |

**Decisão pendente (sua):** "vários prédios" sem pack de exterior = navegação por lobby/
mapa de seleção. Se quiser rua/cidade de verdade ligando os prédios, é comprar o
**Modern Exteriors** da LimeZu (~US$; mesmo estilo). Não bloqueia as fases 0–7.

---

## Fases

### Fase 0 — Terreno limpo _(EU sozinho, ~1 sessão)_
- Arquivar cliente atual (`Assets/` → `_legacy_client_v2/`), preservar `Net/` (Api, MiniSignalR).
- Estrutura nova de pastas: `Art/ Tiles/ Palettes/ Prefabs/ Scenes/ Scripts/ UI/`.
- Conferir URP 2D + Pixel Perfect + sorting layers (`Ground < Walls < Furniture < Characters < Above < Lights`).
- **Verificação:** MCP (hierarquia + console limpo) — sem você.

### Fase 1 — Pipeline de assets _(EU sozinho, ~1 sessão)_
- Copiar dos packs para `Assets/Art/` (fonte da verdade: `LimeZu\Modern_Office_Revamped_v1.2`
  e `LimeZu\moderninteriors-win`, versões 16x16):
  - `Room_Builder_Office_16x16.png` (pisos/paredes do office)
  - Theme sorter do office (móveis com sombra) + singles 16x16 (339 peças)
  - Room builder + temas do Modern Interiors (variedade p/ salas customizadas)
  - Objetos animados (impressora, café, monitores…) do `3_Animated_objects/16x16`
  - Partes do Character Generator (premades primeiro)
- Script de import (editor): PPU16, Point, sem compressão, fatiamento correto
  (chars 16x32; singles recortados ao conteúdo com pivô base-centro — receita já validada).
- Gerar **RuleTiles de parede** (topo+face autoconectando) e **Tile Palettes** prontas.
- Gerar **1 prefab por móvel** (sprite + collider + YSort), organizados por categoria.
- **Verificação:** render estático que eu leio + atlas rotulado (mock) pra confirmar mapeamento.

### Fase 2 — Cena de referência "sala do itch.io" _(EU 80% / VOCÊ gate visual)_
- EU reproduzo **uma sala pequena** copiando um dos `6_Office_Designs` (referência pixel a
  pixel — não é criação, é transcrição, isso eu consigo verificar por render).
- Câmera pixel-perfect, Light2D global neutra (~0.92) + poças quentes discretas.
- **VOCÊ:** abre, dá Play, compara com o GIF do design e aprova o padrão de qualidade.
  Este é O gate mais importante do plano — nada avança sem essa sala estar bonita.

### Fase 3 — Personagem _(EU sozinho, gate de "feel" com VOCÊ)_
- Controller (WASD + clique-p/-andar), Rigidbody2D, colisão com Tilemap.
- Animator com as folhas do generator — ordem dos frames JÁ decifrada e registrada:
  **right(0-5), up(6-11), left(12-17), down(18-23)**, 6 frames/direção, run 10fps, idle 4.5fps.
- Sentar (transição real), sombra de contato.
- Sistema de avatar **já em camadas desde o início** (Body→Eyes→Outfit→Hairstyle→Accessory,
  cada camada um SpriteRenderer sincronizado no mesmo frame) — na fase 3 usando os
  `0_Premade_Characters/16x16` prontos; a UI de customização vem na fase 9, mas a
  arquitetura nasce preparada para ela (evita retrabalho no Animator).
- **VOCÊ:** Play de 2 minutos — "o andar está gostoso?" (feel não dá pra medir por render).

### Fase 4 — Prédio 1 pintado à mão _(VOCÊ pinta / EU superviso via MCP)_
- EU deixo pronto: cena com grid/tilemaps configurados, paleta aberta, camadas certas,
  guia curto de Tile Palette, e a planta sugerida (lobby, open space, salas de reunião,
  café, corredor de salas pessoais) desenhada como imagem de referência.
- **VOCÊ pinta** piso/paredes e arrasta móveis (prefabs prontos, já com colisão/YSort —
  é literalmente arrastar e soltar).
- EU acompanho por MCP em tempo real: corrijo sorting, colisão, portas, ilumino cada
  cômodo, e faço o "pente fino" técnico depois de cada sessão de pintura sua.
- Repetir o processo para os demais prédios (cada um = 1 mapa/cena).

### Fase 5 — Rede: entrar no mundo _(EU sozinho)_
- Reconectar ao backend: login, join, move, presença, chat de proximidade
  (reuso de `Api.cs`/`MiniSignalR.cs` + contrato server units 28/tile).
- Sincronizar `OfficeLayout.cs` do backend com o novo mapa (a planta vem da fase 4).
- Interpolação de avatares remotos, nomes, status.
- **Verificação:** 2 clientes (Unity + web app) no mesmo mapa via MCP/Play.

### Fase 6 — Interações do escritório _(EU sozinho, gates rápidos com VOCÊ)_
- Zonas (reunião/café) + timer automático, sentar na mesa → timer da task ativa,
  fone de reunião, kanban in-game (UITK — reaproveito o design que você aprovou), emotes.
- HUD nova em UITK: card do jogador, chat em pílulas, toasts (padrões já validados).

### Fase 7 — Mini-games sociais _(EU no código / VOCÊ nos gates de diversão)_
**Escopo da primeira entrega** (pedido do usuário): xadrez, jogo da velha e card game colecionável.

**Decisão-chave:** os jogos rodam como **painéis de UI (UITK)** que abrem ao interagir com o
objeto no mundo (mesa/quadro) — **não** desenhados no tilemap. Tabuleiro nítido, legível em
qualquer zoom, e zero dor de pipeline de arte pixel para as peças.

**Infra comum (EU construo uma vez):** um **MatchHub** no backend — turnos, estado de jogo,
convite/aceite, espectadores, resultado — reaproveitado pelos três jogos.

**♟ Xadrez (mesa de xadrez):**
- Mesa = prefab no mundo com 2 assentos; sentar nos dois lados + convite → abre o tabuleiro UITK.
- Regras completas (movimento legal, xeque, xeque-mate, roque, en passant, promoção) — lógica 100% minha.
- Multiplayer por turnos via MatchHub; espectadores assistem. Relógio e histórico de lances opcionais.
- **Assets das peças (decisão sua):** set de xadrez dedicado (comprar um pack barato 16/32px)
  **ou** peças vetoriais nítidas renderizadas no painel. Não faço procedural no mundo.

**⭕ Jogo da velha (no quadro):**
- Quadro branco = objeto no mundo; interagir abre a grade 3x3.
- Dois jogadores, detecção de vitória/empate, turnos via MatchHub. Sem assets novos (X/O desenhados).
- O mais simples — serve de "aquecimento" e valida o MatchHub cedo.

**🃏 Card game colecionável estilo Triple Triad (FF8) — a feature grande:**
- **Regra:** grade 3x3, cada carta tem 4 números (cima/direita/baixo/esquerda); ao colocar,
  captura as cartas adjacentes cujo lado tocado for menor. Variantes (Same/Plus/Elemental)
  como flags ligáveis depois.
- **Colecionável:** cartas são itens do backend — coleção e deck (5 cartas) por usuário;
  vencer captura carta(s) do oponente (regra "One"/"All" configurável).
- **Arte das cartas (sinergia com o resto):** rostos = **retratos do Portrait Generator**
  (personagens do time!) + itens/móveis do office como cartas comuns; molduras e raridade
  em UITK (ou do pack `modernuserinterface`). Reaproveita o Portrait Generator da fase 10.
- **Backend:** catálogo de cartas, coleção/deck por usuário, resultado de partida,
  transferência de carta ao vencer, drops de carta (integra com XP/drops já existentes).
- **Escopo honesto — é um jogo dentro do jogo, o maior dos três.** Faseável:
  (a) partida local 2 jogadores mesma tela p/ validar a regra → (b) coleção + deck + backend →
  (c) multiplayer em rede via MatchHub → (d) drops/recompensas e ranking.

**Verificação:** as regras eu testo por código (casos de captura, xeque-mate, vitória/empate);
**VOCÊ** testa a diversão real com 2 pessoas — esse é o gate de cada jogo.

### Fase 8 — A/V LiveKit _(EU sozinho, teste final com VOCÊ)_
- Pacote embedded (`file:`, sem git). AvManager (mic/câmera/tela) — código já dominado.
- **VOCÊ:** teste real com 2 pessoas (mic/câmera não dão pra validar sozinho).

### Fase 9 — Salas customizáveis pelo jogador _(EU sozinho no sistema / VOCÊ no gosto)_
O coração do produto (modelo Gather/Habbo):
- **Backend:** dono por sala, inventário de móveis, endpoint salvar/carregar layout
  (JSON de peças: prefabId, tile, rotação), permissões.
- **Unity:** modo edição in-game — grade destacada, colocar/mover/girar/remover móvel,
  preview fantasma, undo, catálogo (as 339+ peças, filtrável), persistência ao vivo
  via SignalR (outros veem a sala mudar).
- Prédios/cômodos comuns continuam estáticos (pintados na fase 4); só salas com dono
  são editáveis.
- Gancho com a gamificação existente: drops/skins viram móveis/decoração de sala.

### Fase 10 — Personalização do personagem _(EU no sistema / VOCÊ nos premades)_
Feature de primeira classe (usa o Character Generator comprado, nas duas formas):

**In-game (EU construo):**
- Catálogo de partes importado de `moderninteriors-win/2_Characters/Character_Generator/`
  em 16x16: **Bodies (tons de pele), Eyes, Outfits, Hairstyles, Accessories** — cada parte
  é uma folha de animação completa, então o avatar customizado **anda/senta animado**
  com as camadas empilhadas na ordem Body→Eyes→Outfit→Hairstyle→Accessory.
- Tela de customização in-game (UITK): preview animado girando nas 4 direções,
  seleção por categoria, aleatorizar.
- **Backend:** aparência no perfil do usuário (JSON de partes), sincronizada via
  SignalR — todos veem o avatar de todos; web app mostra a mesma aparência.
- Gancho com a gamificação: outfits/acessórios como **drops/desbloqueáveis** (integra
  com o sistema de skins/XP que já existe no backend).
- **Retratos (Portrait Generator .exe):** retrato do personagem no card do jogador/chat.
  O .exe exporta PNG; VOCÊ gera os retratos dos personagens do time, EU integro na HUD.
  (Alternativa automática: recortar o frame frontal do próprio avatar como mini-retrato.)

**Com os .exe comprados (VOCÊ opera, EU integro):**
- **Character Generator 2.0 (Setup.exe):** ferramenta visual para compor personagens e
  exportar a spritesheet pronta — ideal para **premades com cara do time e bots/NPCs**
  (recepcionista, etc). Você compõe, salva os PNGs numa pasta combinada, eu importo.
- Observação: o in-game usa as MESMAS partes do pack, então tudo que o .exe monta
  o jogo reproduz — o .exe é atalho de autoria, não dependência.

### Fase 10 — Polimento "itch.io" _(EU proponho / VOCÊ decide)_
- Objetos animados espalhados (café pingando, impressora, monitores piscando).
- Luz por cômodo, dia/noite sutil, transições de cena (fade), sons de passos/ambiente.

---

## Qual modelo eu uso em cada fase

**Como isto funciona:** o modelo é *seu* botão, não meu — você troca com `/model` (ou no
seletor do app) e liga o modo rápido com `/fast`. O padrão sensato para quase tudo é
**Opus 4.8** (o modelo atual mais capaz e o que estou rodando agora). A tabela abaixo diz
onde vale **descer para Sonnet 5** (economia em trabalho mecânico/volumoso, qualidade quase
Opus) ou **subir para Fable 5** (só na lógica mais difícil e de longo horizonte). Haiku 4.5
só para tarefas triviais.

| Fase | Modelo recomendado | Por quê |
|---|---|---|
| F0 Limpeza | **Sonnet 5** | Arquivar, criar pastas, conferir configs — mecânico; Opus é desperdício aqui. |
| F1 Pipeline de assets | **Opus 4.8** | Import/fatiamento/RuleTiles têm gotchas (pivôs, mipmaps); erro aqui contamina tudo. |
| F2 Sala de referência | **Opus 4.8** (`/fast`) | Transcrição + iteração visual via MCP; fast mode acelera o loop ver→ajustar→render. |
| F3 Personagem | **Opus 4.8** | Animator por camadas + feel de movimento; sensível a detalhe. |
| F4 Pintar prédios | **Sonnet 5** (Opus 4.8 nos travões) | Você pinta; eu faço pente-fino de sorting/colisão/porta — rotineiro. Subo p/ Opus quando a geometria/iluminação empacar. |
| F5 Rede | **Opus 4.8** | SignalR, reconexão, interpolação de remotos, sincronizar OfficeLayout — concorrência é traiçoeira. |
| F6 Interações | **Opus 4.8** | Zonas/timer/fone/kanban UITK entrelaçados com a rede. |
| **F7 Mini-games** | **Fable 5** no card game + xadrez; **Opus 4.8** no jogo da velha/MatchHub | Regras completas de xadrez (roque, en passant, xeque-mate) e Triple Triad + coleção/backend são a lógica mais difícil e de longo horizonte do projeto — vale o modelo mais capaz. O resto é Opus. |
| F8 A/V LiveKit | **Opus 4.8** | Gotchas de tipos/threads já mapeados; precisão importa mais que custo. |
| F9 Salas customizáveis | **Opus 4.8** (Fable 5 opcional no edit-mode) | Modo edição + persistência ao vivo + backend de dono; se o sistema ficar grande, Fable 5 ajuda. |
| F10 Personalização | **Opus 4.8** | Camadas de avatar + sync de aparência; Sonnet 5 se só integrar premades. |
| F11 Polimento | **Sonnet 5** | Objetos animados, luz por cômodo, sons — muitos ajustes pequenos e baratos. |

**Regra de bolso:** deixe em **Opus 4.8** por padrão; troque para **Sonnet 5** nas fases
marcadas (F0, F4, F11) para economizar sem perder qualidade perceptível; use **Fable 5**
pontualmente na F7 (card game/xadrez) e talvez na F9. `/fast` (Opus 4.8) é ótimo nas fases
de iteração visual via MCP (F2–F4), onde o ciclo curto ver→corrigir compensa o custo maior.

---

## Divisão de trabalho — resumo honesto

### EU faço 100% sozinho (agora com MCP + renders que eu leio)
- Todo o código (gameplay, rede, UI, modo edição, backend das salas).
- Pipeline de import, fatiamento, RuleTiles, paletas, prefabs de móveis.
- Transcrição da sala de referência (fase 2) a partir do design oficial.
- Iluminação, câmera, sorting, colisões, portas.
- Verificação técnica contínua: hierarquia, console, Play mode, renders.

### VOCÊ faz manualmente (onde o olho humano é a ferramenta)
1. **Pintar os mapas dos prédios** (fase 4) — Tile Palette + arrastar prefabs.
   Eu preparo tudo; você compõe. É a parte criativa e a mais determinante do visual.
2. **Gates visuais**: aprovar a sala de referência (fase 2), o feel do movimento
   (fase 3), e o gosto de piso/tema por área.
3. **Testes que exigem humano**: A/V com 2 pessoas, sensação de jogo.
4. **Manter o Unity aberto** com o MCP ativo enquanto trabalho (e Interaction Mode
   em No Throttling, como você já configurou).
5. **Compor personagens no Character Generator 2.0** (Setup.exe) — premades do time e
   bots/NPCs — e gerar retratos no **Portrait Generator** (fase 9); eu importo e integro.
6. *(Decisão)* Comprar ou não o Modern Exteriors para o mundo externo entre prédios.

---

## Ordem de execução e gates

```
F0 → F1 → F2 (GATE: sala bonita?) → F3 (GATE: feel ok?) → F4 (você pinta, por prédio)
                                                             ↓
                 F10 ← F9 ← F8 ← F7 (GATE: call 2p) ← F6 ← F5
```

(F9 personagem pode adiantar em paralelo com F5-F7 se você quiser ver a customização
mais cedo — ela só depende da F3.)

Cada fase termina com verificação minha via MCP + (quando for gate) seu OK visual.
Se um gate reprovar, iteramos ali — não se avança com base quebrada (foi o erro anterior).
