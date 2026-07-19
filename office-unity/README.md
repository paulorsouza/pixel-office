# Office Quest — cliente Unity

> **ARQUIVADO.** O produto atual usa `../client-web/` com Phaser. Não implemente recursos novos aqui.

Cliente do escritório virtual em Unity 2D. Consome **o mesmo backend** do protótipo web
(`../backend/VirtualOffice.Api`): quem estiver no navegador e quem estiver no Unity
se veem no mesmo mapa, com o mesmo chat e as mesmas regras de horas/XP.

## Como rodar

1. **Backend primeiro**: `dotnet run` em `../backend/VirtualOffice.Api` (porta 5210).
2. Instale o **Unity Hub** (unity.com/download) e por ele um editor **Unity 6 LTS (6000.x)**
   — módulo de build "Windows" basta.
3. No Unity Hub: **Add → Add project from disk** → selecione esta pasta (`office-unity`).
4. Abra o projeto (primeira importação demora alguns minutos), com qualquer cena aberta
   (a vazia que o Unity criar serve) aperte **Play**.

Não há cena nem prefab para configurar: um bootstrap (`Boot.cs`) monta o jogo inteiro
em código ao dar Play, e **toda a arte é pixel art gerada proceduralmente** (`Sprites.cs`)
— para mudar o visual, mude a paleta lá.

## Controles

| Tecla | Ação |
|---|---|
| WASD / setas | andar |
| E | sentar / levantar (perto de cadeiras e do sofá) |
| 1–4 | emotes (joinha, coração, risada, café) |
| Enter | focar o chat / enviar |
| Scroll | zoom da câmera |
| Tab (segurar) | quem está no escritório |

Entrar na **Sala de Reunião** registra horas de reunião automaticamente (regra do servidor,
a mesma do web). O timer de task iniciado no app aparece como status sobre o avatar.

## Arquitetura

```
Assets/Scripts/
  Net/MiniSignalR.cs   cliente mínimo do protocolo JSON do SignalR sobre WebSocket puro
                       (negotiate → handshake → invocations + ping); sem NuGet externo
  Net/Api.cs           REST via UnityWebRequest (header X-User-Id)
  Game/Boot.cs         RuntimeInitializeOnLoadMethod — entra em qualquer cena
  Game/OfficeGame.cs   orquestrador: login, hub, jogadores, HUD
  Game/OfficeMap.cs    layout do mapa (geometria idêntica à do servidor/web),
                       colisão, zonas, assentos
  Game/Sprites.cs      TODA a arte: tiles, mobília, avatar, emotes (16px/tile, PPU 16)
  Game/AvatarView.cs   visual do jogador: animação, nome, status, balões de fala
  Game/LocalPlayer.cs  input, colisão, sentar, emotes, zonas, câmera/zoom
  UI/Hud.cs            login, topo (nível/XP/status), chat, toasts, lista online
```

**Posições em "server units"** (28 por tile, as mesmas do protótipo web) — por isso os
dois clientes convivem. A geometria de colisão espelha `wwwroot/js/office.js`; se mudar
o mapa, mude nos dois lugares (ou extraia para um JSON servido pelo backend — próximo passo).

## Limitações conhecidas

- A fonte legada do Unity não tem emoji: status como "🔴 TSK-2" viram "[REC] TSK-2"
  (mapeamento em `AvatarView.Sanitize`).
- Reconexão automática ainda não implementada (o web tem `withAutomaticReconnect`) —
  se o servidor reiniciar, reabra o Play.
- "Always on top"/janela compacta de verdade exige plugin nativo do Windows — fica para
  a fase do modo toolbar.
