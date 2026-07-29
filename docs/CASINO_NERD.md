# Casino Nerd

Cassino do Office Quest: prédio no mundo aberto, cena própria e três jogos jogáveis:
**Arrange Dice**, **Nerd Slots** e **Blackjack**.

## Fluxo

```text
world.casino-nerd-door
  → casino-nerd.entrance
  → arrangeDiceTable(arrange-dice) | nerdSlotMachine(nerd-slots) | blackjackTable(blackjack)
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
4. Sequências de 3, 4, 5, 6 e 7 cartas pagam ×2, ×6, ×20, ×40 e ×100.
5. Uma soma 2 repete o lançamento consumido e concede mais uma rodada extra: na prática adiciona
   duas oportunidades futuras. Para proteger a rodada de uma sequência sem fim, o total é limitado
   a quinze lançamentos.
6. Uma soma 12 remove uma rodada futura, mas vira um coringa: o jogador escolhe qualquer carta ainda
   abaixada para levantar.
7. Seis cartas adjacentes concedem **Pikachu Jogador** (8/8/8/8); todas as sete concedem
   **Mewtwo Rei do Cassino** (10/10/10/10), além do prêmio em moedas.

## Nerd Slots

- três rolos com `bug`, `coffee`, `code`, `d20` e `rocket`;
- qualquer par paga ×2;
- trincas pagam ×3, ×5, ×8, ×15 ou ×25, conforme o símbolo;
- qualquer trinca concede um booster; trinca de D20 ou foguete também concede
  **Porygon Jackpot** (8/8/8/8);
- o backend sorteia os três símbolos e liquida a rodada antes da animação;
- o cliente anima os rolos e os para em sequência, sem decidir o resultado.

## Blackjack

- duas cartas para jogador e dealer; a segunda carta do dealer fica oculta;
- `hit` compra carta e `stand` entrega a vez ao dealer;
- o Ás vale 1 ou 11; figuras valem 10; dealer para em 17;
- vitória normal paga ×2, blackjack natural paga 3:2 e empate devolve a aposta;
- vitória com total 21 concede um booster; blackjack natural também concede
  **Meowth Dealer** (8/8/8/8);
- início da mão e cada ação têm chaves UUID independentes de idempotência;
- uma mão ativa é recuperada no `GET` do jogo após reload ou queda de conexão;
- não é possível abrir outra mão ou deixar a mesa antes de concluir a atual.

## Cena e interação

- `client-web/tiled/maps/casino-nerd.tmj`: interior 52×40, salão, lounge, saída e três mesas.
- `client-web/tiled/templates/arrange-dice-table.tj`: template para novas mesas.
- `client-web/src/mechanics/ArrangeDiceTableMechanic.js`: visual, colisão, proximidade e claim
  `arrange-dice`.
- `client-web/src/mechanics/CasinoGameMechanics.js`: máquinas/mesa, colisão, proximidade e claims
  de `nerd-slots` e `blackjack`. O tamanho visual vem do `width`/`height` do mapa: slots usam
  4×6 tiles e a mesa de blackjack 7×4 tiles.
- `client-web/src/casino/ArrangeDicePanel.js`: seleção, ordenação, lançamento manual um a um,
  animação dos dados, tutorial em quatro passos e resultado.
- `client-web/src/casino/NerdSlotsPanel.js`: rolos, animação sequencial e tabela de prêmios.
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
12. Teste 390×844 e 844×390, inclusive o tutorial e os dois jogos novos.

## Próximos cortes

- balcão para comprar e trocar medalhas, caso a economia seja separada de `User.Coins`;
- mobiliar recepção e lounge;
- acrescentar áudio com controle de volume;
- placar e conquistas sem expor perdas individuais;
- novos jogos reutilizando o mesmo contrato transacional;
- estatísticas agregadas e limites opcionais de sessão, sem expor perdas individuais.
