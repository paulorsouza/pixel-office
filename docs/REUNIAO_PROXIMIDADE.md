# Reunião por proximidade (presença em rede + A/V espacial)

**Atualizado:** 2026-07-20

Traz para o cliente Phaser: (1) **presença em rede** — ver os avatares dos outros andando
na mesma cena; e (2) **A/V por proximidade** — áudio com volume por distância e vídeo/tela
sob demanda, via LiveKit. A sala de reunião fixa continua existindo (ver §Follow-ups).

## Arquitetura

- **Presença**: uma conexão SignalR dedicada (`PresenceSystem.js`), separada da de mobília.
  `Join(userId)` cria o `PlayerState`; `Move(x,y,dir)`, `SetScene(sceneId)` e
  `SetAppearance(json)` sincronizam.
  A isolação por cena é feita **no cliente** (renderiza só quem tem a mesma cena) para não
  afetar a lista de online do app web, que usa a presença global. Bots vêm com `scene:""`
  e por isso não são desenhados no mundo.
- **A/V espacial**: o call é keyed por **(cena, sala)**, emitido por
  `POST /api/av/proximity-token` (`{sceneId, roomId}`; sem gate de zona, basta estar autenticado):
  - **área aberta** → `proximity-{cena}`: volume por distância entre os avatares (posições vêm
    da presença), cheio até `NEAR_PX=90`, mudo a partir de `FAR_PX=280`, linear no meio;
  - **dentro de uma sala fechada** → `proximity-{cena}--{sala}`: **call isolado**, todos no
    mesmo volume; quem está fora não ouve e não é ouvido.

  O cliente (`ProximityVoice.js`) resolve o canal-alvo a cada frame a partir da sala em que o
  avatar está (`roomAtPoint`) e reconecta quando ele muda, com **dwell de 350 ms** para não
  ficar trocando de call na soleira da porta. Áudio é automático; **mic/câmera/tela são sob
  demanda** no HUD. Se o LiveKit não estiver no ar, degrada em silêncio.

## Avatares remotos: skin modular, animação e veículo

Os outros jogadores são desenhados com **o mesmo código do avatar local** — `RemoteAvatar.js`
monta um *player fantasma* (`{x, y, body.bottom}`) e entrega para `createCharacterVisual` e
`createEquipmentVisual`, então camadas, poses e veículos não têm caminho duplicado.

- **Aparência na rede**: `SetAppearance(json)` guarda `PlayerState.Appearance` e emite
  `PlayerAppearance` para os outros; quem entra depois recebe tudo pelo `Snapshot`. O payload é
  `{character: {body, eyes, outfit, hairstyle, accessory}, vehicle: id|null}` — **opaco para o
  servidor**, que só limita o tamanho (2000 chars) e ignora reenvio idêntico.
- **Quando é enviado**: ao trocar qualquer camada no menu `Tab` (reflete na hora nos outros) e ao
  entrar/sair de um veículo com `Shift`. Reconexão reenvia cena + aparência.
- **Validação na entrada**: `normalizeAppearance` normaliza contra o catálogo — opção ou veículo
  inexistente cai no padrão, então json adulterado não quebra o render de quem recebe.
- **Animação**: direção vem do `Move`; `moving` é inferido do tempo desde o último update
  (`MOVING_TIMEOUT_MS`). Pose segue a regra do avatar local — moto = `sit`, demais veículos e
  parado = `idle`, andando = `walk`.
- **Fallback**: sem aparência (bots, cliente antigo) volta para o corpo base `adam_idle/run`.

## Fone de reunião (ficar na call ao sair da sala)

Toda sala marcada como reunião (`meeting:true` no `extraJson`, ou `id: "meeting"`) ganha um
**fone no chão**, gerado por `MeetingHeadset.js` a partir de `map.rooms` — **derivado, não é
objeto do Tiled**, porque o mapa é trabalho manual e só recebe edição aditiva.

- Chegar perto e apertar `E` → **pega o fone**: o call fica **fixo** naquela sala mesmo que o
  avatar saia dela (é o "levanto para pegar um café e continuo na reunião").
- Soltar: `E` de novo perto do suporte, ou o botão **🎧 Soltar o fone** na barra do HUD (funciona
  de qualquer lugar). Trocar de cena também solta o fone automaticamente.
- O fone também fala com o backend (`PickUpHeadset`/`DropHeadset`, que já existiam): é o que
  **mantém o lançamento de horas da reunião aberto** enquanto a pessoa circula fora da sala —
  `SetZone("")` só encerra a reunião quando `HasHeadset` é falso. Os outros clientes veem
  **🎧 no label** de quem está com o fone.
- Enquanto está vestido, o suporte fica apagado no lugar para o jogador saber onde devolver, e o
  HUD mostra o chip `🎧 {sala}`.

O fone é **local por cliente** (cada um "veste o seu"): não há disputa de posse em rede — está
nos follow-ups.

## HUD da reunião (estilo Meet)

A UI vive em `MeetingHUD.js` (módulo só de interface; `ProximityVoice.js` cuida do LiveKit e
alimenta o HUD com roster, tracks, quem fala e volume por distância).

- **Barra inferior** (sempre visível): mic e câmera com seletor de dispositivos (chevron),
  apresentar tela, abas de layout, tela cheia, painel de pessoas e sair/entrar na voz.
  Estados no padrão Meet: mudo = botão vermelho; relógio da reunião e ponto de status à esquerda.
- **Três layouts** (abas na barra, `Alt+1/2/3`):
  - **Jogo** — só o jogo; vídeos/tela viram tiles flutuantes no canto (clicar = modo dividido);
  - **Dividido** — reunião grande à esquerda, jogo reduzido à direita;
  - **Foco** — reunião em tela toda e o jogo vira um PiP clicável (dá para continuar andando
    com WASD, o que muda os volumes por proximidade).
  O Phaser usa `Scale.RESIZE`, então o HUD só re-estiliza o `#game` e dispara `resize`.
- **Grade de participantes**: tile com vídeo ou avatar de iniciais, anel + equalizer para quem
  fala (`ActiveSpeakersChanged`), badge de mic mudo e indicador de 3 barras com o volume por
  distância (some no call de sala, onde todos se ouvem por completo); apresentação de tela vira
  palco com filmstrip embaixo.
- **Chip do canal** no cabeçalho: `Área aberta · proximidade`, `{sala}` ou `🎧 {sala}` (fone).
- **Painel Pessoas**: quem está na voz (com volume) e quem está na cena fora da voz (presença).
- **Extras de UX**: atalhos `Ctrl+D` (mic) e `Ctrl+E` (câmera); toasts para permissão negada,
  tela apresentada e autoplay de áudio bloqueado (`room.startAudio` num clique); auto-hide da
  barra no modo foco; auto-volta ao modo jogo quando a voz cai.

> **Harness de QA sem Phaser/LiveKit:** `client-web/hud-test.html` monta o HUD com participantes
> e vídeos falsos (canvas `captureStream`); `client-web/voice-test.html` stuba o LiveKit e o
> endpoint de token para dirigir a troca de canal (entrar/sair de sala, fone, dwell) e conferir
> em `window.__connects` as salas efetivamente conectadas.
> ⚠️ Não usar `transition` no `#game` entre valores `auto`↔numéricos: trava a troca de layout.

### Arquivos
```
client-web/src/PresenceSystem.js     presença, aparência em rede e avatares interpolados
client-web/src/RemoteAvatar.js       avatar do outro jogador (skin modular + veículo + fallback)
client-web/src/ProximityVoice.js     call por (cena,sala), volume por distância, estado → HUD
client-web/src/MeetingHUD.js         UI da reunião: barra, grade, layouts, pessoas, toasts
client-web/src/MeetingHeadset.js     fone das salas de reunião (fixa o call até soltar)
client-web/hud-test.html             harness de QA do HUD (dados falsos, sem Phaser)
client-web/voice-test.html           harness de QA do canal de voz (LiveKit stubado)
client-web/presence-test.html        harness de QA da presença (2 conexões SignalR reais)
client-web/lib/livekit-client.umd.min.js  SDK vendorizado (v2.20.0)
backend/.../Presence.cs               PlayerState.Scene / .Appearance / .HasHeadset
backend/.../OfficeHub.cs              SetScene, SetAppearance, PickUpHeadset/DropHeadset
backend/.../Program.cs                POST /api/av/proximity-token  {sceneId, roomId}
```

## Como testar

1. **LiveKit no ar** (só o áudio depende dele):
   `& ".\livekit\start-livekit.ps1"` (espere `portHttp: 7880`).
2. **Backend**: rode a DLL dentro de `backend/VirtualOffice.Api`.
3. **Cliente**: `node client-web/server.js`.
4. Abra **duas janelas** (navegadores/perfis diferentes), uma com `?userId=1#world` e outra
   com `?userId=2#world` em `http://localhost:8123`.
   - Ande com uma: o avatar aparece e se move na outra (presença).
   - Na barra do HUD, clique **mic**; aproxime os avatares → o volume sobe; afaste → cai.
     Câmera/tela publicam vídeo (tiles / palco de apresentação).
5. **Call por sala** (`?scene=tooq-office`): coloque os dois avatares no open space (se ouvem por
   proximidade) e leve **um** para dentro do Escritório B → ele some do áudio do outro; com os
   dois dentro, se ouvem por completo. O chip do HUD mostra a sala.
6. **Fone**: dentro do Escritório B, chegue no 🎧 e aperte `E` → chip vira `🎧 Escritório B`.
   Saia da sala andando: **continua ouvindo a reunião** (e as horas seguem contando; o outro
   cliente mostra 🎧 no seu label). `E` no suporte (ou **Soltar o fone** na barra) volta para a
   proximidade da área aberta.
7. **Skin em rede**: em uma janela abra `Tab → Personagem` e troque cabelo/roupa → o avatar muda
   **na outra janela na hora**. Segure `Shift` com um veículo equipado → o outro vê o veículo e a
   pose (moto = sentado). Os bots continuam com o corpo base.

> O navegador embutido do assistente não consegue bootar esse cliente Phaser (geração
> procedural de texturas + assets pesados), então a verificação visual foi feita via harnesses
> (`presence-test.html` com SignalR real, `voice-test.html` com LiveKit stubado) e testes
> headless com stubs do Phaser. O render e o áudio precisam de um navegador real.

## Follow-ups

- **Fone sem posse em rede**: cada cliente renderiza/veste o seu fone; dois jogadores podem
  "pegar" o mesmo suporte e ninguém vê o fone sumir do chão do outro. Sincronizar posse (e mostrar
  quem está com ele) pede um evento no hub de presença.
- **Fone não aparece no avatar** (só no HUD) — falta a camada visual no personagem.
- **Sem indicação de quem está em qual sala** no painel de pessoas: hoje ele lista quem está no
  seu call e quem está na cena fora dele, sem dizer em que sala fechada cada um está.
- **Equipamentos não-veículo não vão para a rede** (corrente, brincos, teclado…): a aparência
  publicada cobre as 5 camadas do personagem + veículo. Os outros slots ainda não têm efeito
  visual nem no avatar local, então nada a sincronizar por enquanto.
- **Pose de sentar em cadeira/estação não é sincronizada** — quem trabalha numa estação aparece
  de pé para os outros.
- **Switch para a sala fixa na zona de reunião**: hoje o mundo usa proximidade e a sala fixa
  `meeting` segue acessível pelo app web, mas o cliente Phaser ainda **não troca** para a sala
  `meeting` (áudio full) ao entrar na zona — falta o Phaser detectar a zona e chamar o token
  da sala fixa. As duas coexistem, mas sem a troca automática.
- **Otimização de banda**: hoje o volume é ajustado por distância mas todos os áudios ficam
  subscritos; dá para *unsubscribe* além do `FAR_PX` quando a cena tiver muita gente.
- **Presença por grupos de cena no servidor** (hoje o broadcast é global e o cliente filtra);
  escala melhor mover o filtro para grupos SignalR por cena.
