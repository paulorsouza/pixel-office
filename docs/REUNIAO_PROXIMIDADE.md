# Reunião por proximidade (presença em rede + A/V espacial)

**Atualizado:** 2026-07-20

Traz para o cliente Phaser: (1) **presença em rede** — ver os avatares dos outros andando
na mesma cena; e (2) **A/V por proximidade** — áudio com volume por distância e vídeo/tela
sob demanda, via LiveKit. A sala de reunião fixa continua existindo (ver §Follow-ups).

## Arquitetura

- **Presença**: uma conexão SignalR dedicada (`PresenceSystem.js`), separada da de mobília.
  `Join(userId)` cria o `PlayerState`; `Move(x,y,dir)` e `SetScene(sceneId)` sincronizam.
  A isolação por cena é feita **no cliente** (renderiza só quem tem a mesma cena) para não
  afetar a lista de online do app web, que usa a presença global. Bots vêm com `scene:""`
  e por isso não são desenhados no mundo.
- **A/V espacial**: uma sala LiveKit por cena (`proximity-{cena}`), emitida por
  `POST /api/av/proximity-token` (sem gate de zona; basta estar autenticado). O cliente
  (`ProximityVoice.js`) ajusta o volume de cada participante pela distância entre os avatares
  (posições vêm da presença): cheio até `NEAR_PX=90`, mudo a partir de `FAR_PX=280`, linear
  no meio. Áudio é automático; **mic/câmera/tela são sob demanda** no HUD. Se o LiveKit não
  estiver no ar, degrada em silêncio.

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
  distância; apresentação de tela vira palco com filmstrip embaixo.
- **Painel Pessoas**: quem está na voz (com volume) e quem está na cena fora da voz (presença).
- **Extras de UX**: atalhos `Ctrl+D` (mic) e `Ctrl+E` (câmera); toasts para permissão negada,
  tela apresentada e autoplay de áudio bloqueado (`room.startAudio` num clique); auto-hide da
  barra no modo foco; auto-volta ao modo jogo quando a voz cai.

> **Harness de QA sem Phaser/LiveKit:** `client-web/hud-test.html` monta o HUD com participantes
> e vídeos falsos (canvas `captureStream`) — bom para mexer no visual sem subir o resto.
> ⚠️ Não usar `transition` no `#game` entre valores `auto`↔numéricos: trava a troca de layout.

### Arquivos
```
client-web/src/PresenceSystem.js     presença + avatares remotos interpolados
client-web/src/ProximityVoice.js     LiveKit por cena, volume por distância, estado → HUD
client-web/src/MeetingHUD.js         UI da reunião: barra, grade, layouts, pessoas, toasts
client-web/hud-test.html             harness de QA do HUD (dados falsos, sem Phaser)
client-web/lib/livekit-client.umd.min.js  SDK vendorizado (v2.20.0)
backend/.../Presence.cs               PlayerState.Scene
backend/.../OfficeHub.cs              SetScene + broadcast PlayerScene
backend/.../Program.cs                POST /api/av/proximity-token
```

## Como testar

1. **LiveKit no ar** (só o áudio depende dele):
   `& ".\livekit\start-livekit.ps1"` (espere `portHttp: 7880`).
2. **Backend**: rode a DLL dentro de `backend/VirtualOffice.Api`.
3. **Cliente**: `node client-web/server.js`.
4. Abra **duas janelas** (navegadores/perfis diferentes), uma com `?userId=1#world` e outra
   com `?userId=2#world` em `http://localhost:8123`.
   - Ande com uma: o avatar aparece e se move na outra (presença).
   - No HUD (canto inf. esquerdo), clique **🎤 mic**; aproxime os avatares → o volume sobe;
     afaste → cai. **📷/🖥️** publicam vídeo/tela (tiles no canto sup. direito).

> O navegador embutido do assistente não consegue bootar esse cliente Phaser (geração
> procedural de texturas + assets pesados), então a verificação visual foi feita via harness
> de SignalR (protocolo de presença) e `curl` (token). O render e o áudio precisam de um
> navegador real com LiveKit rodando.

## Follow-ups

- **Avatar remoto usa o corpo base** (`adam_idle/run`) + label com o nome; ainda **não**
  sincroniza a skin modular do CharacterSystem (cada cliente guarda a sua em localStorage).
  Falta enviar a composição pela rede.
- **Switch para a sala fixa na zona de reunião**: hoje o mundo usa proximidade e a sala fixa
  `meeting` segue acessível pelo app web, mas o cliente Phaser ainda **não troca** para a sala
  `meeting` (áudio full) ao entrar na zona — falta o Phaser detectar a zona e chamar o token
  da sala fixa. As duas coexistem, mas sem a troca automática.
- **Otimização de banda**: hoje o volume é ajustado por distância mas todos os áudios ficam
  subscritos; dá para *unsubscribe* além do `FAR_PX` quando a cena tiver muita gente.
- **Presença por grupos de cena no servidor** (hoje o broadcast é global e o cliente filtra);
  escala melhor mover o filtro para grupos SignalR por cena.
