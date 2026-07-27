# Plano de execução — Campus Tooq v2

**Atualizado:** 2026-07-27

A Dark Company (`tooq-office-1`) permanece como referência funcional e não é regenerada. O Tooq
Office nasce em arquivos próprios e usa os mesmos contratos de mapa, presença, voz, inventário e
SignalR.

## 1. Planta do prédio principal

O mapa `tooq-campus` contém:

- 5 salas de reunião;
- 10 salas 1×1;
- 1 sala de jogos, com duas mesas de xadrez em rede;
- 1 cozinha;
- 3 salas de estudos;
- recepção, átrio e acesso às alas pessoais;
- eixo central de circulação ligando a recepção a todas as fileiras;
- núcleo reservado de elevador e escadas para a expansão vertical;
- porta principal, quintal ajardinado e portão de retorno ao mundo aberto.

O desenho segue o padrão estrutural validado em `tooq-office-1`: salas da mesma faixa compartilham
paredes, as salas das pontas usam o próprio perímetro do prédio, todas as entradas do campus ficam
nas paredes frontais (sul) e todo o piso interno — inclusive alas pessoais — usa madeira contínua.
As fileiras são divididas à esquerda e à direita do eixo `x=59..69`; essa passagem permanece livre
do topo do prédio até a recepção, evitando que salas superiores se tornem ilhas.

O quintal ocupa a faixa sul da cena, com caminho em cruz, fonte, bancos, árvores, flores e limite
vegetado. Colisões invisíveis fecham o perímetro sem contaminar a arte; existe uma abertura física
no portão sul. Ali, o portal `yard-exit` exibe a interação `E` e retorna ao spawn `from-campus` da
cena `world`.

Elevador e escadas são entidades `verticalAccess` orientadas a dados e usam sprites LimeZu. Os dois
acessos funcionam com `E`: no térreo levam às alas pessoais e, na ala, retornam aos spawns
correspondentes do saguão. A porta do elevador abre quando o avatar se aproxima. Novos andares
podem reutilizar a mecânica trocando apenas `targetScene` e `targetSpawn`. Visual e sensor são
independentes: a escada nasce na parede e a interação fica na faixa livre diante do primeiro
degrau; o elevador ocupa um poço técnico fechado em outro ponto do saguão e abre para uma cabine
escura, com a caixa mantendo a colisão de fundo.

As colisões dos móveis foram recalibradas pela base opaca de cada família e sincronizadas em todos
os TMJs. Escada, fonte, bancos e árvores possuem blockers próprios; quadros, flores e detalhes
continuam atravessáveis de propósito. Sensor de interação nunca funciona como corpo físico.

O gerador idempotente `client-web/tools/generate-tooq-campus.mjs` mantém `tooq-campus`,
`personal-wing`, `player-home-shell` e o hub `world`, registra as cenas e gera os snapshots usados
pelos testes. Ele nunca reescreve a planta da Dark Company (`tooq-office-1`) nem a do Coworking
(`tooq-office`).

## 2. Salas pessoais públicas

As salas não são instâncias privadas escondidas. Cada ala é uma cena pública com 12 cômodos físicos:
seis acima e seis abaixo de um corredor compartilhado.

```text
Campus principal
      │
      ▼
Ala pessoal 1 (slots 0–11) ⇄ Ala pessoal 2 (slots 12–23) ⇄ ...
```

No cadastro, o backend reserva de forma persistente:

- `RoomKey`: identidade estável da sala;
- `WingIndex`: número da ala;
- `SlotIndex`: posição dentro do módulo.

Todos os usuários na mesma ala compartilham presença e circulação. As placas mostram o dono e
qualquer pessoa pode entrar e conversar. Somente o dono recebe o botão de decoração e a API também
recusa colocação de mobília por terceiros.

Quando uma ala completa 12 salas, o próximo usuário ocupa automaticamente o primeiro slot da ala
seguinte. O módulo mantém dimensões e corredores regulares em qualquer escala.

## 3. Economia e carga inicial

Cada unidade continua sendo uma `GameItemInstance`. Uma conta nova recebe exatamente:

- 1 mesa de trabalho (`of_258`);
- 1 quadro kanban (`of_171`);
- 1 skate básico (`equipment:skate`).

Mesa e kanban já nascem colocados no slot pessoal. O skate fica no inventário/equipamento. O restante
do catálogo possui preço, raridade, tipo e capacidades. A loja do campus compra uma unidade por vez,
desconta moedas no backend e atualiza o inventário por SignalR.

O catálogo oferece dois modelos visuais de cada base de locomoção: skate, patins, patinete elétrico
e moto. Somente itens possuídos podem ser equipados.

## 4. Features de móveis

As regras são declaradas por `interactionType`/capacidades, não pelo ID visual:

| Interação | Integração |
|---|---|
| `workstation` | escolhe atividade e inicia/encerra lançamento real de horas |
| `timeclock` | lê o relatório real dos últimos 14 dias |
| `kanban` | lê o quadro e altera a atividade ativa |
| `whiteboard` | abre o diagrams.net/draw.io com chave estável do quadro |
| `coffee` | entrega a xícara animada na mão; o avatar bebe sentado |
| `seat` | claim de assento em rede e composição com estação próxima |
| `store` | catálogo, saldo e compra persistente |
| `chess` | partida em rede pelo registro de mecânicas |

## 5. Cidade e Vila dos Jogadores

O hub `world` mede `220×150` tiles, possui cerca e colisão nas quatro bordas, ruas/calçadas nativas
do Tiled e três empresas:

- Tooq Office central, próximo do spawn;
- Coworking afastado a noroeste;
- Dark Company afastada a nordeste.

A Vila dos Jogadores fica a leste, com seis fileiras e 12 casas. Cada entrada aponta para uma
identidade dinâmica `player-home-shell@house-XX`; o mesmo TMJ vazio é materializado com nome e spawn
de retorno próprios. Fachadas têm footprints sólidos completos e o portal fica do lado externo,
portanto o avatar não atravessa paredes/telhados para entrar.

Ao reiniciar a cena, `MapRenderer.resetSceneRenderState` descarta móveis e portas do mapa anterior.
Isso impede prompts de `seat`, `coffee` ou outras features internas de sobreviverem no mundo aberto.

## 6. Próximas fatias

1. Persistir o arquivo do draw.io por quadro (hoje a integração abre o editor, mas o arquivo ainda
   é responsabilidade do usuário).
2. Ligar drops a eventos de XP/conquistas com tabela de loot e auditoria; a compra já está funcional.
3. Criar mais famílias visuais de mobília e balancear preços/moedas.
4. Validar duas sessões simultâneas atravessando campus e ala, incluindo voz e decoração.
5. Criar os demais mapas de pisos e ligar novos destinos ao núcleo `verticalAccess`.
6. Polir a arte no Tiled sobre a planta funcional, preservando dimensões, IDs e portais.
7. Persistir compra, propriedade e decoração individual das 12 casas.
