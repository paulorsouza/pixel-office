# Deploy com Docker

Build de produção completo: Postgres + backend (.NET) + game (Phaser/nginx) + LiveKit + Caddy
(proxy reverso com TLS). Tudo definido em [`docker-compose.yml`](../docker-compose.yml).

## Topologia

```
Navegador ──HTTPS──▶ Caddy (self-signed, sem domínio)
                       ├─ https://localhost        → game (Phaser) + /api,/hub,/auth → backend  (mesma origem)
                       ├─ https://localhost:8443   → app web (kanban/horas) do backend
                       └─ wss://localhost:7443     → LiveKit (sinalização)
Backend ──▶ Postgres (volume pgdata)
LiveKit  ──▶ mídia WebRTC direto pelas portas UDP 50000–50100 + TCP 7881
```

O game e a API ficam na **mesma origem** (`https://localhost`) — isso elimina CORS e faz o
SignalR/cookies funcionarem sem gambiarra. O cliente detecta isso sozinho (`resolveApiBase`
usa `location.origin` fora da porta de dev `:8123`).

## Subir

```bash
cp .env.example .env
# edite .env: troque POSTGRES_PASSWORD e JWT_KEY (>=32 bytes) no mínimo
docker compose up --build
```

Acesse:
- **Game (produto):** https://localhost
- **App web (tarefas/horas):** https://localhost:8443

### O aviso de certificado (esperado)

Sem domínio, o Caddy usa uma **CA interna** e o navegador vai avisar que o certificado não é
confiável. Para o A/V (LiveKit wss) funcionar e sumir o aviso, confie na CA do Caddy:

```bash
# exporta a raiz da CA interna do Caddy
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
```
Importe `caddy-root.crt` no repositório de **Autoridades de Certificação Raiz Confiáveis** do
Windows (certmgr.msc) e reinicie o navegador. Sem isso, o `wss://localhost:7443` do LiveKit é
recusado pelo navegador (certificado não confiável) e o áudio não conecta.

## Rodar de verdade em produção

O default do `.env.example` sobe funcional para **validar o build** (`AUTH_DEV_BYPASS=true`,
que ainda aceita o `X-User-Id`). Para um deploy real:

1. `AUTH_DEV_BYPASS=false` e configure o Google OAuth (`GOOGLE_CLIENT_ID/SECRET`,
   `GOOGLE_HOSTED_DOMAIN`) — ver [`PLANO_AUTH.md`](PLANO_AUTH.md). Sem isso, com DevBypass=false
   ninguém entra.
2. `JWT_KEY` forte e único.
3. **Com domínio real:** troque `tls internal` por `tls seu@email.com` (ou remova, o Caddy pega
   Let's Encrypt automático) e use o domínio no lugar de `localhost` no
   [`Caddyfile`](../deploy/Caddyfile); ajuste `Auth__GoogleRedirectUri`, `AllowedOrigins` e
   `LiveKit__Url` no compose para o domínio.

## LiveKit / A/V — atenção

O WebRTC precisa de UDP direto entre navegador e LiveKit. Isso é sensível a NAT/Docker:

- **Docker Desktop (Windows/Mac):** a mídia UDP através da VM do Docker Desktop é limitada; o
  áudio por proximidade **pode não conectar** mesmo com as portas mapeadas. Para validar A/V de
  verdade, rode o LiveKit num host **Linux** com `network_mode: host`, ou fora do Docker.
- **Servidor Linux com IP público:** em [`livekit/livekit.docker.yaml`](../livekit/livekit.docker.yaml)
  troque `use_external_ip: true` (ou defina `node_ip`) para o LiveKit anunciar candidatos
  alcançáveis. As chaves `LIVEKIT_API_KEY/SECRET` do `.env` têm que bater com o backend (já batem
  via compose).

O resto do jogo (mundo, presença, tarefas, xadrez) **não depende do LiveKit** e funciona normal.

## Notas

- **Banco:** o backend usa `Database__Provider=postgres` no compose; o `EnsureCreated` cria todo
  o schema a partir do modelo EF (os scripts aditivos de SQLite são pulados fora do SQLite). Dados
  persistem no volume `pgdata`. Local/dev continua em SQLite (default).
- **Imagens:** backend = multi-stage `dotnet/sdk:10.0`→`aspnet:10.0`; game = `nginx:alpine`
  servindo os estáticos (inclui `tiled/` porque os `.tmj` são carregados em runtime).
- `.env` está no `.gitignore` — não versione segredos.
