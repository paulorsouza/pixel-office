# Office Quest Unity — contexto atual do client

> **ARQUIVADO EM 2026-07.** Este não é mais o contexto atual do produto. Leia `../CONTEXT.md`.

Atualizado em 2026-07-13. Este é o contexto de continuidade para qualquer pessoa ou agente que trabalhe no client Unity.

## Decisão principal

O client segue uma arquitetura **editor-first**. O mapa definitivo é criado e mantido manualmente no Unity Editor.

- Fonte de verdade do mapa: `Assets/Scenes/MyOffice.unity`.
- `Assets/Scenes/Office.unity` é uma demonstração legada; não é a cena principal e não deve receber trabalho novo.
- Nenhuma ferramenta de importação pode apagar, substituir ou gerar novamente `MyOffice.unity` quando ela já existir.
- Assets são importados pelo pipeline do Unity; não devem ser carregados e fatiados manualmente em runtime.

## Fluxo seguro no Unity

1. `Office Quest > Prepare Imported Assets`: configura importadores, material, tiles e prefab do personagem. Não altera cenas.
2. `Office Quest > Prepare Manual Authoring`: atualiza tiles e prefabs de móveis e adiciona somente camadas ausentes em `MyOffice`. Não apaga conteúdo existente.
3. Abrir `Assets/Scenes/MyOffice.unity`.
4. Pintar pelo painel `Window > 2D > Tile Palette`.
5. Arrastar móveis de `Assets/Prefabs/Furniture` para a Scene.

## Organização da cena

Dentro de `Grid`:

- `Floor`: pisos, sorting order 0, sem colisão.
- `Walls`: parte sólida/superior das paredes, order 10, com `TilemapCollider2D`.
- `WallFaces`: face visual frontal das paredes, order 20, sem colisão própria.
- `Decoration`: detalhes pintados sem colisão, order 30.
- `Collision`: bloqueios extras, order 40, com `TilemapCollider2D`.

Objetos e móveis devem continuar como prefabs/GameObjects, não ser incorporados ao gerador de mapa. A ordenação de profundidade é feita por `YSort`.

## Assets

- Arte importada em uso: `Assets/Art`.
- Fonte original LimeZu: `C:/Users/prs/Claude Sessions/LimeZu`.
- Tiles editáveis: `Assets/Tiles`.
- Tile Palette: `Assets/Palettes/Office.prefab`.
- Móveis editáveis: `Assets/Prefabs/Furniture`.
- Personagem: `Assets/Prefabs/Player.prefab`.
- Material URP 2D: `Assets/Art/SpriteLit.mat`.

Configuração visual canônica: PPU 16, Filter Mode Point, sem compressão, câmera Pixel Perfect com referência 320x180 e URP 2D Renderer.

## Regras para futuras alterações

- Nunca chamar `EditorSceneManager.NewScene` para atualizar uma cena que já existe.
- Nunca recolocar `Office.unity` no Build Settings.
- Ferramentas de preparação devem ser idempotentes: executar duas vezes produz a mesma estrutura sem perder trabalho manual.
- Novos sistemas de gameplay, rede, backend e UI devem ser componentes independentes da autoria do mapa.
- Antes de modificar importadores em massa, preservar pivôs, slicing e referências de sprites existentes.
- Colisores de prefabs gerados são apenas ponto de partida; os prefabs aprovados visualmente devem ter colisores curados manualmente.

## Estado conhecido

- O client atual já usa URP 2D, Tilemap, Pixel Perfect Camera, prefabs e sprites importados pelo Editor.
- `MyOffice.unity` ainda contém pouco conteúdo; isso é intencional para permitir que o mapa seja desenhado manualmente.
- A integração completa de rede, backend, chat, reuniões e UI do protótipo antigo ainda não foi migrada para esta cena limpa.
- A animação atual usa `CharacterAnimator.cs` com troca de sprites; migrar para Animator Controller continua recomendado, mas deve ser uma etapa separada.

## Arquivos centrais

- `Assets/Editor/OfficeBuilder.cs`: preparação dos assets; não cria cenas.
- `Assets/Editor/Authoring.cs`: preparação incremental da cena manual e prefabs.
- `Assets/Scripts/Game/PlayerController.cs`: movimento local provisório.
- `Assets/Scripts/Game/CharacterAnimator.cs`: animação provisória.
- `AUTORIA.md`: guia operacional para editar o mapa no Unity.
