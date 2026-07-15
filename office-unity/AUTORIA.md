# Editar o ambiente à mão — guia do iniciante

Objetivo: você **pintar cômodos** e **colocar móveis** na sua cena, vendo na tela.
É pra experimentar sem medo — se quebrar, tem o botão de conserto (seção "SOCORRO" no fim). 🙂

---

## Atalhos que salvam sua vida (decore só estes 3)

- **Ctrl+Z** = desfazer (errou? desfaz). **Ctrl+S** = salvar a cena (salve sempre!).
- **Segurar Shift enquanto pinta** = vira **borracha** (apaga tile).
- **Scroll** = zoom · **botão do meio do mouse (ou Alt+arrastar)** = mover a vista.

---

## 0. Preparar (uma vez, ou sempre que quiser consertar)

1. Menu **Office Quest ▸ Rebuild** (se ainda não rodou hoje) — importa a arte.
2. Menu **Office Quest ▸ Prepare Manual Authoring** — cria os tiles, os móveis (prefabs) e a cena
   **MyOffice.unity**. Rodar de novo **não apaga** o que você pintou; só repõe o que faltar
   (jogador/câmera/luz/camadas). **Salve antes (Ctrl+S)** se tiver mudança sem salvar.

## 1. Abrir a cena e a paleta

1. Na janela **Project** (embaixo), duplo-clique em **Assets/Scenes/MyOffice.unity**.
2. Menu do topo: **Window ▸ 2D ▸ Tile Palette** — abre o painel da paleta.
3. No painel: **Create New Palette** ▸ nome **Office** ▸ salvar em `Assets/Palettes`.
4. Na janela Project, abra **Assets/Tiles** e **arraste os tiles de lá pra dentro do painel da paleta**
   (`floor_gray`, `floor_wood`, `floor_carpet`, `wall`, `wall_face`). Já vêm com a colisão certa.

## 2. Entender as CAMADAS (importante!)

Na **Hierarchy**, dentro de **Grid**, tem várias camadas. Cada tile vai na camada certa:

| Camada | Pra que serve | Colide? |
|---|---|---|
| **Floor** | o chão (pisos) | não (você anda) |
| **Walls** | as paredes | **sim** (bloqueia) |
| **WallFaces** | a "frente" da parede (decorativo, dá altura) | não |
| **Decoration** | tapetes, detalhes no chão | não |
| **Collision** | (avançado) marcar bloqueio invisível | sim |

**Regra de ouro:** antes de pintar, **clique na camada certa na Hierarchy**. Piso → Floor. Parede → Walls.

## 3. Pintar o piso (a vitória rápida 🎉)

1. Na **Hierarchy**, clique em **Floor**.
2. No painel da paleta, clique no tile **`floor_gray`**.
3. Na janela **Scene** (não a Game), **pinte** arrastando o mouse. Apareceu o chão!

## 4. Pintar as paredes

1. Na **Hierarchy**, clique em **Walls**.
2. Na paleta, clique no tile **`wall`**.
3. Pinte o contorno do cômodo. (Por enquanto é 1 tile só; na próxima etapa eu ligo as paredes que
   se conectam sozinhas, com cantos, iguais ao exemplo.)

## 5. Colocar móveis

1. Na janela **Project**, abra **Assets/Prefabs/Furniture**.
2. **Arraste** um móvel (ex.: `desktop`, `chair_up`, `plant_a`, `coffee`) pra dentro da janela **Scene**.
3. Ajuste a posição arrastando na Scene. Ele já tem colisão e se ordena por profundidade.

## 6. Testar

1. **Ctrl+S** pra salvar. Aperte **Play** (▶). Ande com **WASD/setas** — a câmera segue o boneco.
2. Aperte **Play** de novo pra sair e continuar editando.

---

## 🆘 SOCORRO — quebrei algo!

- **O jogador sumiu / apaguei a câmera / sumiu uma camada:** salve (Ctrl+S) e rode
  **Office Quest ▸ Prepare Manual Authoring**. Ele repõe o que faltar **sem apagar seus tiles**.
- **Apaguei um tile sem querer:** Ctrl+Z.
- **Pintei na camada errada:** selecione a camada certa e repinte; use Shift pra apagar da errada.
- **Sumiu tudo / bagunçou demais:** apague o arquivo `Assets/Scenes/MyOffice.unity` na janela Project
  e rode **Prepare Manual Authoring** — ele cria uma MyOffice novinha (você perde só o que tinha pintado
  nessa cena).

### O que NÃO apagar (senão precisa reparar)
O **Grid** e as camadas dentro dele (Floor/Walls/…), o **Main Camera**, o **Global Light** e o **Player**.
Se apagar algum, é só rodar o reparo acima.

---

## O que me mandar
Um print do seu cômodo. Com isso eu ligo as **paredes autoconectáveis** e a gente segue pros vários
cômodos e as salas de usuário.

> Edite sempre na **MyOffice.unity** (a `Office.unity` é gerada pelo Rebuild e seria sobrescrita).
