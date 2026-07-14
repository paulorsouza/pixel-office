# Fazer o mapa à mão — guia do iniciante (Etapa 1)

Objetivo desta etapa: você **pintar seu primeiro cômodo** e **colocar alguns móveis**, vendo na tela.
Sem pressa, sem decorar nada — é só seguir os passos. Qualquer travada, me manda print.

## 0. Preparar as ferramentas (uma vez)

1. No Unity, rode o menu **Office Quest ▸ Prepare Imported Assets** — isso configura a arte sem mexer na cena.
2. Depois rode **Office Quest ▸ Prepare Manual Authoring**.
   Isso cria: os tiles (Assets/Tiles), um prefab por móvel (Assets/Prefabs/Furniture) e a cena
   **Assets/Scenes/MyOffice.unity** quando ela ainda não existir. Se já existir, apenas adiciona camadas
   ausentes e preserva tudo que você pintou ou posicionou.

> Os dois comandos agora são seguros para executar novamente: nenhum deles substitui `MyOffice.unity`.

## 1. Abrir a cena e a paleta

1. Na janela **Project** (embaixo), abra **Assets/Scenes/MyOffice.unity** (duplo-clique). Esta é a cena
   principal do projeto e a única que deve receber o mapa definitivo.
2. No menu do topo: **Window ▸ 2D ▸ Tile Palette**. Vai abrir um painel novo (a "paleta").
3. No painel da paleta, clique em **Create New Palette** ▸ nome **Office** ▸ salve em `Assets/Palettes`.
4. Na janela **Project**, abra a pasta **Assets/Tiles** e **arraste os tiles de lá para dentro do painel
   da paleta** (são poucos e já prontos: `floor_gray`, `floor_wood`, `floor_carpet`, `wall`, `wall_face`).
   - Esses tiles já têm a colisão certa (chão = passa, parede = bloqueia).
   - (Opcional, mais pra frente: arrastar `Assets/Art/Rooms/room_builder.png` traz TODOS os tiles do
     escritório, se você quiser mais variedade de piso.)

## 2. Pintar o piso (a vitória rápida 🎉)

1. Na janela **Hierarchy** (esquerda), abra **Grid** e clique em **Floor** (é a camada do chão).
2. No painel da paleta, **clique no tile `floor_gray`** (o piso de escritório cinza).
3. No painel da paleta, selecione a ferramenta **pincel** (ícone de pincel) — geralmente já vem selecionada.
4. Vá pra janela **Scene** (não a Game) e **pinte** arrastando o mouse. Deve aparecer o chão.
   - Zoom: scroll do mouse. Mover a vista: segure o **botão do meio** (ou Alt+arrastar).
   - Apagar: segure **Shift** enquanto pinta (vira borracha), ou escolha a ferramenta de borracha.

## 3. Pintar as paredes (por enquanto simples)

1. Na Hierarchy, clique na camada **Walls** para a parte superior sólida da parede. Use **WallFaces**
   para a face visual que aparece voltada para o jogador.
2. Na paleta, **clique no tile `wall`** (parede branca).
3. Pinte o contorno do cômodo na janela Scene. (Nesta etapa a parede é um tile só; na **Etapa 2**
   eu ligo a "parede que se conecta sozinha" com cantos, igual ao exemplo que você mandou.)

## 4. Colocar móveis

1. Na janela **Project**, abra **Assets/Prefabs/Furniture**.
2. **Arraste** um móvel (ex.: `desktop`, `chair_up`, `plant_a`, `coffee`) da janela Project **para dentro
   da janela Scene**, no lugar que quiser.
3. Ajuste a posição arrastando o móvel na Scene (ele já tem colisão e se ordena por profundidade).
   - Dica: os móveis "assentam" pela base; encoste-os no chão/parede à vontade.

## 5. Testar

1. Aperte **Play** (▶ no topo) e ande com **WASD/setas** (se o boneco estiver na cena).
2. Saiu do Play (▶ de novo) pra continuar editando.

---

## O que me mandar

Um print do seu primeiro cômodo pintado. Com isso eu:
- ligo as **paredes autoconectáveis** (Etapa 2),
- e a gente parte pros **vários cômodos + salas de usuário**.

> Importante: **edite na `MyOffice.unity`**. `Office.unity` agora é apenas uma demonstração legada e
> não está mais no Build Settings.
</content>
