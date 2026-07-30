# Casino Nerd

Cassino do Office Quest: prédio no mundo aberto, cena própria e quatro jogos jogáveis:
**Arrange Dice**, **Nerd Slots**, **Blackjack** e **Liga Pokémon da Casa**.

## Fluxo

```text
world.casino-nerd-door
  → casino-nerd.entrance
  → arrangeDiceTable(arrange-dice) | nerdSlotMachine(nerd-slots)
    | blackjackTable(blackjack)
  → /api/casino/games/{gameId}
  → casino-nerd.casino-exit
  → world.from-casino-nerd
```

O jogo usa somente `User.Coins`. Não existe compra com dinheiro real, saque ou carteira paralela.

## Regras implementadas

1. O jogador escolhe sete cartas únicas entre 3 e 11 e define sua ordem.
2. A rodada começa com cinco lançamentos. Cada clique envia uma ação autoritativa e o backend
   sorteia e persiste somente aquele par.
3. Cada soma entre 3 e 11 levanta a carta correspondente; repetições não levantam outra carta.
4. Sequências de 3, 4, 5, 6 e 7 cartas pagam ×4, ×12, ×40, ×80 e ×200. Uma sequência de cinco
   ou mais também concede um **Booster Raro**.
5. Uma soma 2 repete o lançamento consumido e concede mais uma rodada extra: na prática adiciona
   duas oportunidades futuras. Para proteger a rodada de uma sequência sem fim, o total é limitado
   a quinze lançamentos.
6. Uma soma 12 remove uma rodada futura, mas vira um coringa: o jogador escolhe qualquer carta ainda
   abaixada para levantar.
7. Seis cartas adjacentes concedem **Pikachu Jogador** (13/13/13/13); todas as sete concedem
   **Mewtwo Rei do Cassino** (15/15/15/15), além do prêmio em moedas e do Booster Raro.
8. Se uma carta da sequência vencedora tiver sido sorteada duas vezes, o prêmio inteiro recebe ×3.
   Com três ou mais ocorrências dessa carta, recebe ×20.
9. Quatro ocorrências da mesma soma em uma rodada concedem **Alakazam Quadra**, forma especial
   com quatro colheres e atributos 7/7/7/7; cinco ou mais concedem somente o prêmio superior,
   **Alakazam Quina**, com cinco colheres e 9/9/9/9. Esses prêmios não dependem de formar uma sequência.

## Nerd Slots

- duas máquinas compartilham o mesmo jogo e a mesma tabela de regras;
- três rolos misturam `bug`, `coffee`, `code`, `d20`, `rocket`, booster e Pokémon;
- pares não pagam prêmio;
- somente as trincas nerd pagam moedas: ×4, ×6, ×8, ×12 ou ×20, conforme o símbolo;
- três boosters concedem **um booster persistente**, sem pagar moedas;
- três Gengar, Charizard ou Porygon concedem, respectivamente, **Gengar Glitch** (8/9/8/9),
  **Charizard Arcade** (9/9/9/9) ou **Porygon Jackpot** (8/8/8/8), sem pagar moedas;
- os símbolos especiais são menos frequentes e seus prêmios nunca acumulam a premiação monetária;
- o backend sorteia os três símbolos e liquida a rodada antes da animação;
- o cliente anima os rolos e os para em sequência, sem decidir o resultado.

## Blackjack

- duas cartas para jogador e dealer; a segunda carta do dealer fica oculta;
- `hit` compra carta e `stand` entrega a vez ao dealer;
- o Ás vale 1 ou 11; figuras valem 10; dealer para em 17;
- vitória normal retorna ×2, blackjack natural retorna ×2,5 e empate devolve a aposta;
- somente o blackjack natural participa do sorteio de booster, com 10% de chance;
- blackjack natural continua concedendo **Meowth Dealer** (8/8/8/8);
- início da mão e cada ação têm chaves UUID independentes de idempotência;
- uma mão ativa é recuperada no `GET` do jogo após reload ou queda de conexão;
- não é possível abrir outra mão ou deixar a mesa antes de concluir a atual.

## Liga Pokémon da Casa

- usa o baralho ativo de 15 cartas do jogador e o mesmo tabuleiro 3×3 do PvP;
- a partida e a sequência são autoritativas e persistidas no backend; recarregar a página retoma
  a batalha em andamento;
- iniciar uma nova sequência custa 100 moedas; os níveis seguintes da mesma sequência não possuem
  novo custo;
- a casa possui seis níveis. Cada nível escolhe 15 espécies numa faixa progressivamente mais forte
  do catálogo; a partir do nível 2, a IA prioriza capturas, força impressa e controle do centro;
- no nível 4, uma carta da mão inicial da casa recebe `+1` numa borda; no nível 5 são três;
  no nível 6 são cinco cartas energizadas e o **Mewtwo Rei do Cassino** (15/15/15/15) ocupa
  a sexta posição da mão inicial, tornando o confronto final deliberadamente muito difícil;
- vencer apenas reserva o prêmio daquele patamar e libera o próximo nível. Ao sair da mesa ou
  perder, o jogador recebe somente o maior prêmio alcançado na sequência, sem acumular os anteriores;
- vencer o nível 6 encerra e paga a sequência automaticamente. Depois de qualquer encerramento,
  a próxima entrada começa no nível 1 e custa novamente 100 moedas;
- nível 1: 1 Booster Nacional;
- nível 2: 3 Boosters Nacionais;
- nível 3: 1 Nacional e 1 Raro;
- nível 4: 3 Nacionais e 3 Raros;
- nível 5: 5 Raros;
- nível 6: 1 Raro e 1 Ultrarraro;
- cada ação possui UUID de idempotência. O servidor valida posse do deck, mão, turno, casa livre,
  captura, recompensa e progressão;
- o Booster Ultrarraro entrega cinco cartas `Rare+`, com `Legendary` garantida na quinta posição e
  10% de chance shiny por carta.

## Cena e interação

- `client-web/tiled/maps/casino-nerd.tmj`: interior 52×40, salão, lounge, saída, mesas e a
  reunião ambiente. O próprio `building` usa `voice:true`: todo jogador dentro do cassino entra
  no canal `casino-nerd::casino-meeting`, sem sala ou retângulo de reunião separado. Sair do
  prédio devolve o jogador ao áudio ambiente normal.
- `client-web/tiled/templates/arrange-dice-table.tj`: template para novas mesas.
- `client-web/src/mechanics/ArrangeDiceTableMechanic.js`: visual, colisão, proximidade e claim
  `arrange-dice`.
- `client-web/src/mechanics/CasinoGameMechanics.js`: máquinas/mesa, colisão, proximidade e claims
  de `nerd-slots` e `blackjack`. O tamanho visual vem do `width`/`height` do mapa: slots usam
  2,5×3,75 tiles, Arrange Dice 4×2,5 e blackjack 5×2,5. As áreas ficam organizadas em Grandia no topo,
  Arcade Nerd embaixo à esquerda e blackjack embaixo à direita.
- `client-web/src/casino/ArrangeDicePanel.js`: seleção, ordenação, lançamento manual um a um,
  animação dos dados, tutorial em quatro passos e resultado.
- `client-web/src/casino/NerdSlotsPanel.js`: rolos mistos, animação sequencial, sprites Pokémon
- `client-web/src/casino/PokemonCasinoTablePanel.js`: reutiliza o padrão visual do duelo X1
  (placar, tabuleiro, oponente, mão e overlay de tipos), acrescentando somente a faixa compacta
  de progresso e o prêmio protegido da Liga Pokémon da Casa.
  locais e tabela que separa prêmios em moedas dos prêmios colecionáveis.
- `client-web/src/casino/BlackjackPanel.js`: cartas, mão recuperável e ações pedir/parar.
- `client-web/src/casino/casino.css`: desktop, celular em pé/deitado, safe areas e movimento reduzido.
- `client-web/assets/casino/grandia3/cards/`: nove pinturas originais de fantasia JRPG. Os números
  continuam na interface HTML para legibilidade e acessibilidade.

Ao iniciar Arrange Dice, o POST cobra a aposta e cria o estado persistente. Cada ação `roll` gera
um par no backend; `wildcard` registra a carta escolhida após uma soma 12. A rodada ativa reaparece
depois de reload e o painel não pode ser fechado antes de sua conclusão. O tutorial abre
automaticamente na primeira visita, grava somente a preferência local de conclusão e pode ser
reaberto pelo botão `?`.

Uma mecânica pode expor `interaction`; o runtime escolhe a mais próxima por prioridade. `E` e o
botão de toque chamam exatamente o mesmo handler. A ordem é móvel → mecânica → portal.

## Backend

`CasinoEndpoints.cs` publica:

```text
GET  /api/casino/games/{gameId}
POST /api/casino/games/{gameId}/rounds
POST /api/casino/games/{gameId}/rounds/{roundId}/actions
GET  /api/casino/history
```

Cada rodada exige uma chave UUID de idempotência. A transação serializável desconta a aposta,
gera o resultado com RNG criptográfico, atualiza `User.Coins` e grava `CasinoRound`. Repetir a chave
para o mesmo usuário devolve a rodada anterior sem cobrar novamente. No blackjack, `OutcomeJson`
é atualizado enquanto Arrange Dice ou blackjack estão ativos e guarda as chaves das ações já
processadas. Prêmios de cartas e boosters são creditados na mesma transação da liquidação.

## Roteiro de teste

1. Abra `/?scene=world&spawn=from-casino-nerd&userId=1`.
2. Confirme a fachada e use `E` para entrar.
3. Para ir direto às mesas, abra `/?scene=casino-nerd&spawn=tables&userId=1`.
4. Use `E` ou `?touch=1` + botão de ação.
5. Conclua o tutorial, retire duas cartas, escolha outras e reordene a sequência.
6. Inicie a rodada e confirme que cada clique solicita e revela somente um par, com animação.
7. Durante a rodada, tente fechar o painel e confirme o aviso para concluir os lançamentos.
8. Repita o POST com a mesma `idempotencyKey`; `roundId` e saldo precisam permanecer iguais.
9. Abra `/?scene=casino-nerd&spawn=slots`, gire uma máquina e confira a parada dos três rolos.
10. Abra `/?scene=casino-nerd&spawn=blackjack`, distribua, peça carta e pare.
11. Recarregue com uma rodada ativa de Arrange Dice e uma mão ativa de blackjack; ambas reaparecem.
12. Teste 390×844 e 844×390, inclusive o tutorial e os jogos do cassino.

## Próximos cortes

- balcão para comprar e trocar medalhas, caso a economia seja separada de `User.Coins`;
- mobiliar recepção e lounge;
- acrescentar áudio com controle de volume;
- placar e conquistas sem expor perdas individuais;
- novos jogos reutilizando o mesmo contrato transacional;
- estatísticas agregadas e limites opcionais de sessão, sem expor perdas individuais.
