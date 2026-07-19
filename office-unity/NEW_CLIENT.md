# Novo cliente do jogo — reconstrução do zero

> **PLANO ARQUIVADO.** A reconstrução vigente aconteceu em `../client-web/`, não neste projeto.

> Arquitetura nova, encostada no **pipeline 2D real do Unity** (import pelo editor,
> Tilemap, Pixel Perfect Camera, Light2D). Substitui o cliente antigo, que carregava
> arte em runtime e misturava estilos — a causa-raiz do visual ruim (ver `HANDOFF.md`).

## Princípios (o que mudou de verdade)

1. **Zero arte em runtime.** Um script de editor (`OfficeBuilder`) importa a arte de
   `Assets/Art/` com os settings certos (PPU16, Point, sem compressão, mipmaps), fatia as
   folhas e cria **assets editáveis de verdade** (sprites, tiles, prefab, cena).
2. **Uma só linguagem visual:** pixel art LimeZu 16px. Nada de vetor SoftArt misturado.
3. **Mapa em Tilemap** (Grid + Tilemap), não montado por heurística no código.
4. **Pixel Perfect Camera + Light2D desde o início** (não colados no fim).
5. **Incremental e verificável por você:** cada incremento é algo que você **vê** no Play e
   me dá feedback. Nada de eu construir às cegas.

## Estrutura

```
Assets/
├─ Art/Rooms/room_builder.png     # atlas de piso/parede (16x14 tiles de 16px)
├─ Art/Chars/{Adam,Alex,Amelia,Bob}_{idle_anim,run,sit}.png   # 24 quadros = 6/direção
├─ Scripts/Net/                   # REAPROVEITADO: Api.cs, MiniSignalR.cs
├─ Scripts/Game/                  # NOVO e limpo
│  ├─ CharacterAnimator.cs        # anima por sprites fatiados (down/up/left/right)
│  ├─ PlayerController.cs         # WASD + colisão física (Incremento 1)
│  └─ CameraFollow.cs
├─ Editor/OfficeBuilder.cs        # << monta tudo: menu "Office Quest ▸ Rebuild"
├─ Settings/URP2D.asset + Renderer2D.asset   # URP 2D (já ativo)
└─ (gerados pelo Rebuild) Tiles/, Prefabs/Player.prefab, Scenes/Office.unity
```

O cliente antigo foi movido para `office-unity/_legacy_client/` (fora de `Assets/`, recuperável).

## COMO RODAR o Incremento 1

1. Abra `virtual-office/office-unity` no **Unity 6000.5.2f1** (pelo Unity Hub).
   Ele vai resolver os pacotes 2D novos e compilar (pode demorar no 1º open).
2. Confirme que **compilou sem erros** (Console limpo). Se houver erro, me mande o texto.
3. No menu superior: **Office Quest ▸ Rebuild (Incremento 1)**.
   Isso importa/fatiа a arte, cria os tiles, o prefab do jogador e a cena.
4. Abra `Assets/Scenes/Office.unity` e dê **Play**.
5. Ande com **WASD / setas**. Você deve ver:
   - piso com textura de Tilemap e parede de tijolo em volta (com colisão),
   - o personagem Adam **andando nas 4 direções corretas** (frente/costas/perfil),
   - iluminação quente (luz global + 2 focos), câmera pixel-perfect seguindo o boneco.

## O que eu preciso de você depois do Play

Um **print** (ou 2–3) e uma frase de feedback: as direções estão certas? O piso/parede
ficaram bons? A luz está agradável? A escala está pixel-perfect (sem “esticado”)?
Com isso eu ajusto e sigo para o Incremento 2.

## Roadmap dos incrementos

- **1 (agora):** offline — andar num quarto com Tilemap + luz + pixel-perfect. *(foco: o visual base ficar bom)*
- **2:** múltiplos móveis (singles LimeZu) + salas do escritório em Tilemap + colisão de móveis.
- **3:** rede — conectar no backend (`MiniSignalR`), ver outros jogadores andando, chat de proximidade.
- **4:** sentar na mesa → timer da task ativa; zonas (reunião/café); fone.
- **5:** HUD em UI Toolkit (reaproveitar `app.uss`/lógica de kanban) + planilha de horas.
- **6:** A/V (LiveKit) + gamificação (XP/níveis/skins).

Só avanço um incremento quando o anterior estiver **bonito e aprovado por você**.
