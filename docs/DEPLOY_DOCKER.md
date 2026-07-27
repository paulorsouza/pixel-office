# Deploy com Docker

Build de produção completo: Postgres + backend (.NET) + game (Phaser/nginx) + LiveKit + Caddy
(proxy reverso com TLS). Tudo definido em [`docker-compose.yml`](../docker-compose.yml).

## Topologia

```
Navegador ──HTTPS──▶ Caddy (self-signed, sem domínio)
                       ├─ https://localhost        → game (Phaser) + /api,/hub,/auth,/shared → backend  (mesma origem)
                       ├─ https://localhost:8443   → app web (kanban/horas) do backend
                       ├─ http://localhost:8080    → origem única do Cloudflare Tunnel
                       │                             (game na raiz, app web em /app/)
                       └─ wss://localhost:7443     → LiveKit local (perfil local-livekit)
Backend ──▶ Postgres (volume pgdata)
A/V      ──▶ LiveKit Cloud (padrão) ou SFU em container (UDP 50000–50100 + TCP 7881)
```

O game e a API ficam na **mesma origem** (`https://localhost`) — isso elimina CORS e faz o
SignalR/cookies funcionarem sem gambiarra. O cliente detecta isso sozinho (`resolveApiBase`
usa `location.origin` fora da porta de dev `:8123`).

O Caddy manda para o backend `/api/*`, `/hub/*`, `/auth/*` **e `/shared/*`**. Esse último é a
UI de kanban/horas/objetivos compartilhada (`wwwroot/shared`), que o cliente do jogo importa
em runtime. Ela não existe na imagem do game — sem essa rota o painel do jogo abre vazio em
produção (e só em produção, porque em dev o jogo fala direto com o `:5210`).

## Subir — v1 local com um comando

```powershell
.\run-prod-local.ps1
```

O script cuida do que dá para errar à mão: confere o Docker, cria o `.env` **gerando senha do
Postgres, `JWT_KEY` e segredo do LiveKit de verdade**, recusa subir com os valores de exemplo,
desliga o `AUTH_DEV_BYPASS` e espera o backend aplicar as migrations.

**Os dados são preservados entre execuções.** É produção: rodar de novo não pode custar as
contas e as horas de ninguém. Zerar o banco é explícito, com `-Reset`.

| Flag | Efeito |
|---|---|
| *(nenhuma)* | sobe **preservando** o banco e **abre o túnel**, mostrando o link |
| `-Reset` | zera o banco antes de subir (pede confirmação) |
| `-Reset -Force` | zera sem perguntar |
| `-NoTunnel` | sobe **sem** expor na internet (o túnel é o padrão) |
| `-Demo` | num banco vazio, cria o time fictício em vez de só o catálogo |
| `-LocalLiveKit` | usa o SFU em container em vez da LiveKit Cloud (voz só na LAN) |
| `-Down` | derruba tudo (o volume do banco fica) |

**Um banco novo nasce limpo:** `SEED_DEMO_DATA=false` cria só o catálogo curado — 8 tipos de
lançamento, 9 objetivos, 6 etiquetas e os 55 itens da loja. Zero usuários, zero cards, zero
horas. A primeira pessoa se cadastra em https://localhost:8443 → *Criar conta*; para ela
nascer Admin, ponha o e-mail em `Auth__AdminEmails__0` no compose **antes** do cadastro.

O seed só age em banco vazio, então `-Demo` não muda nada num banco que já tem gente.

### Acesso externo: Cloudflare Tunnel + LiveKit Cloud

O túnel **sobe por padrão**, como no `run-beta.ps1` — expor é o caso normal deste script.
Para rodar só na sua máquina, use `-NoTunnel`.

Mesmo modelo do beta: o `cloudflared` publica uma URL `https://…trycloudflare.com` apontando
para **uma origem HTTP única** (`:8080` do Caddy), então game e API ficam na mesma origem e não
há CORS. O que muda em relação ao beta é o que está atrás dela — o stack de produção inteiro em
container, com Postgres.

Como o quick tunnel expõe **uma porta só**, a raiz é do game e o app web fica sob **`/app/`**:

| URL | O quê |
|---|---|
| `https://…trycloudflare.com/` | o jogo (Phaser) |
| `https://…trycloudflare.com/app/` | app web: kanban, horas, objetivos |
| `/api`, `/hub`, `/auth`, `/shared` | backend (mesma origem) |

O `cloudflared` cospe a URL no meio de dezenas de linhas de log, então o script a **pesca e
mostra em destaque**, copia para a área de transferência e salva em `deploy/tunnel-url.txt`
(gitignorado) — é só colar e mandar. `Ctrl+C` encerra o túnel; o stack continua rodando.

**A/V exige LiveKit remoto.** WebRTC é UDP e **UDP não passa por túnel HTTP** — com o SFU local,
quem entra de fora fica sem voz. Por isso o padrão do script é a **LiveKit Cloud**: preencha
`LIVEKIT_URL`/`KEY`/`SECRET` no `.env` (o script reaproveita as chaves de `deploy/beta.env` se
você já as tiver). O container `livekit` do compose virou **opcional**, sob o perfil
`local-livekit`, e só serve para uso na própria máquina/LAN:

```bash
docker compose --profile local-livekit up -d      # SFU em container
```

Duas limitações herdadas do quick tunnel, iguais às do beta:

- **A URL muda a cada execução.** Para URL fixa, é named tunnel + domínio próprio.
- **Google OAuth não funciona**, porque o redirect URI precisa estar registrado no console do
  Google e a URL é aleatória. Login por usuário+senha funciona normalmente.

### Ou na mão

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

O `run-prod-local.ps1` já entrega isto pronto na sua máquina: `AUTH_DEV_BYPASS=false`, segredos
gerados e banco limpo. Para publicar num servidor de verdade falta:

1. **Contas.** Login por usuário+senha já funciona (cadastro aberto). Para entrar com a conta
   Tooq, configure o Google OAuth (`GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_HOSTED_DOMAIN`) — ver
   [`PLANO_AUTH.md`](PLANO_AUTH.md). Feche o cadastro (`AUTH_ALLOW_REGISTRATION=false`) depois
   de criar as contas, se quiser beta por convite.
2. `JWT_KEY` forte e único (o script gera; num servidor, gere você).
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

- **Banco:** Postgres em todos os ambientes; o schema vem de **migrations EF** aplicadas no
  start do container. Dados persistem no volume `officequest_pgdata` (o `run-prod-local.ps1`
  usa o nome de projeto `officequest`). Dev usa o `docker-compose.dev.yml`. Ver
  [`BANCO_POSTGRES.md`](BANCO_POSTGRES.md).
- **Imagens:** backend = multi-stage `dotnet/sdk:10.0`→`aspnet:10.0`; game = `nginx:alpine`
  servindo os estáticos (inclui `tiled/` porque os `.tmj` são carregados em runtime).
- `.env` está no `.gitignore` — não versione segredos.
