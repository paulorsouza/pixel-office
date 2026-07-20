# Beta na sua máquina, acessível de fora (sem Docker)

Roda tudo local (nada em serviço externo) e expõe pela internet com um **túnel** — sem abrir
porta no roteador, sem expor seu IP, com HTTPS automático. Um comando: [`run-beta.ps1`](../run-beta.ps1).

## Como funciona

```
Amigos ──HTTPS──▶ Cloudflare Tunnel ──▶ sua máquina:
                                          Caddy (:8080)  ─┬─ game (Phaser, estático)
                                                          └─ /api,/hub,/auth → backend (:5210) → SQLite
                                          LiveKit (:7880, LOCAL)
```

O game e a API ficam na **mesma origem** (a URL do túnel), então não há CORS e o SignalR
conecta normal. O cliente detecta isso sozinho (`resolveApiBase`).

## Pré-requisitos (binários únicos, nada pesado)

1. **.NET 10 SDK** — já usado no projeto.
2. **caddy.exe** — https://caddyserver.com/download (ponha no PATH ou em `deploy\caddy.exe`).
3. **cloudflared.exe** — https://github.com/cloudflare/cloudflared/releases (PATH ou `deploy\cloudflared.exe`).

## Rodar

```powershell
.\run-beta.ps1
```

O script abre janelas para LiveKit, backend e Caddy, e sobe o túnel. Vai aparecer uma linha tipo:

```
https://algo-aleatorio.trycloudflare.com
```

Esse é o link que você manda pros seus amigos. Testar na sua máquina: `http://localhost:8080`.

> A URL do quick tunnel **muda a cada vez** que você roda. Para uma URL fixa, crie uma conta
> Cloudflare + um "named tunnel" (aí precisa de um domínio) — dá pra fazer depois.

## ⚠️ Voz (A/V) — o limite do túnel

O LiveKit transmite mídia por **UDP/WebRTC**, e o túnel HTTP **não passa UDP**. Então:

- **Funciona pra todo mundo pelo link:** mundo, presença, movimento, chat, tarefas, **xadrez**.
- **Voz por proximidade:** só na **sua LAN / sua máquina** (teste em `http://localhost:8080` que a
  voz conecta). Pra quem entra de fora pelo túnel, a voz **não** conecta — e degrada em silêncio,
  sem quebrar o resto.

Pra voz funcionar para externos com LiveKit local, só **abrindo as portas UDP 50000–50100 do
LiveKit no roteador** + IP público (o que o túnel justamente evita). Fica pra quando você quiser.

## Segurança da beta

- Está com `Auth:DevBypass=true` (default): quem abre o link **entra escolhendo um usuário, sem
  senha**. Bom pra beta fechada — **mande o link só pra quem você confia**. Se vazar, qualquer um entra.
- Para travar de verdade, é o fluxo do Google OAuth (`DevBypass=false`) — ver [`PLANO_AUTH.md`](PLANO_AUTH.md);
  precisa do OAuth client e de uma URL estável (named tunnel/domínio).
- O app web de tarefas/horas fica em `http://localhost:5210` (só local); o túnel expõe o **game**.

## Encerrar

Feche as janelas do LiveKit/Backend/Caddy e dê Ctrl+C na janela do cloudflared. Os dados ficam no
`office.db` (SQLite) local.
