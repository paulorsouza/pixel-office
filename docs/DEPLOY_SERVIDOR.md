# Servidor Linux — specs e deploy (10–20 jogadores)

Como dimensionar e subir o Office Quest inteiro (jogo + kanban/horas + A/V) numa máquina Linux.
Complementa o [`DEPLOY_DOCKER.md`](DEPLOY_DOCKER.md), que descreve o build em si; aqui é o que
muda quando sai do `localhost` e vai para um servidor com domínio.

## De onde vem a conta

O stack tem quatro cargas, e só uma delas importa para o dimensionamento:

| Componente | Carga com 20 jogadores | Peso |
|---|---|---|
| SignalR (movimento/presença) | `MOVE_INTERVAL_MS = 100` → 10 msg/s por jogador; com fanout, 20×19×10 ≈ **3.800 msg/s**, ~400 KB/s | desprezível |
| Postgres | 20 contas, cards, horas, objetivos — base < 1 GB por anos | desprezível |
| Game estático (nginx) | 28 MB no primeiro load, depois cache do navegador | desprezível |
| **LiveKit self-hosted** | voz de proximidade + câmera + compartilhamento de tela | **é o único gargalo real** |

O SFU não transcodifica — ele só reencaminha pacotes. Então o custo do LiveKit é **banda**, não CPU:

- **Só voz**, todo mundo falando: 20 pub × 19 sub × ~40 kbps ≈ **15 Mbps** de saída
- **Reunião de 8 com vídeo** (com `adaptiveStream` + `dynacast`, que o cliente já liga): **30–50 Mbps**
- **Tela compartilhada em 1080p** para 15 pessoas: ~**35 Mbps**

Pico realista: **~100 Mbps de saída**. Consumo mensal: **2–4 TB**.

## Specs

### Opção A — tudo self-hosted, inclusive o LiveKit (recomendada)

| Item | Mínimo | Recomendado |
|---|---|---|
| vCPU | 2 dedicadas | **4 dedicadas** — vCPU compartilhada dá jitter no áudio |
| RAM | 4 GB | **8 GB** |
| Disco | 40 GB SSD | **80 GB NVMe** |
| Rede | 1 Gbps, 5 TB/mês | 1 Gbps, **≥ 10 TB/mês** |
| IPv4 | público dedicado | obrigatório (o SFU precisa anunciar um IP alcançável) |
| SO | Ubuntu 24.04 LTS ou Debian 13 | + Docker Engine e o plugin compose |

Uso de RAM esperado em pico: Postgres ~500 MB, backend .NET ~400 MB, LiveKit 200 MB–1 GB,
nginx + Caddy ~70 MB, SO + Docker ~800 MB → **~3 GB**. 8 GB deixa folga confortável.

### Opção B — LiveKit Cloud

Com `LIVEKIT_URL` apontando para a nuvem, a mídia **nem passa pelo servidor** — ele vira só app
e banco. Aí **2 vCPU / 4 GB / 40 GB e banda mínima** bastam. Sai mais caro em assinatura e mais
barato em máquina, e resolve de graça o NAT/firewall de rede corporativa.

### A região importa mais que a spec

Se o time é no Brasil, **o SFU tem que estar em São Paulo**. Voz e vídeo são sensíveis a RTT:
uma máquina europeia (Hetzner é ótimo hardware por ~€14/mês) coloca ~200 ms de ida e volta na
conversa e a reunião fica desconfortável. O backend e o kanban toleram; a mídia não.

Opções com região SP: Vultr, AWS Lightsail, Magalu Cloud, Hostinger. O **Oracle Cloud Free
Tier Ampere** (4 vCPU ARM / 24 GB / 10 TB, grátis, tem SP) atende de sobra — todas as imagens
do compose têm arm64 (.NET 10, livekit-server, postgres-alpine, caddy, nginx); só é preciso
buildar o backend e o game na própria máquina, que é o que o `--build` já faz.

### Teto

O jogo e o kanban aguentam 100+ pessoas nessa máquina sem suar — o limite é a banda do LiveKit.
Passando de ~40 simultâneos com vídeo, o caminho é **mover o SFU para um nó separado**, não
engordar este.

## Portas

| Porta | Uso |
|---|---|
| TCP 80 | desafio HTTP-01 do Let's Encrypt + redirect http→https |
| TCP 443 | game, app web, API, SignalR (wss) e sinalização do LiveKit |
| UDP 7882 | mídia WebRTC (UDP mux — uma porta só) |
| TCP 7881 | fallback ICE/TCP, para rede que bloqueia UDP |
| TCP 22 | SSH — restrinja por IP e use só chave |

> **Cuidado com o ufw.** Publicar porta no Docker escreve regras na cadeia `DOCKER-USER`, que é
> avaliada **antes** das suas — o ufw não bloqueia porta publicada por container. Feche o que
> sobra no **firewall do provedor** (security group), que fica fora da máquina. O
> `docker-compose.server.yml` já ajuda: ele publica só 80 e 443 no Caddy, em vez das quatro
> portas do compose local (a `:8080` do compose base é HTTP **sem TLS**, para o túnel — essa
> não pode vazar para a internet).

## DNS

Dois registros A apontando para o IP do servidor:

```
office.SEU-DOMINIO.com     A   <ip>
livekit.SEU-DOMINIO.com    A   <ip>     # só com LiveKit self-hosted
```

Uma origem só para o produto: **game na raiz**, app web em **`/app/`**, backend em
`/api`, `/hub`, `/auth` e `/shared`. Isso elimina CORS, faz o SignalR fazer upgrade de
WebSocket e o cookie de sessão valer nas duas UIs.

## Subir

```bash
git clone <repo> officequest && cd officequest
cp .env.example .env
```

No `.env`, preencha (o resto segue o [`DEPLOY_DOCKER.md`](DEPLOY_DOCKER.md)):

```ini
PUBLIC_DOMAIN=office.SEU-DOMINIO.com
ACME_EMAIL=voce@empresa.com
PUBLIC_ORIGIN=https://office.SEU-DOMINIO.com
PUBLIC_APP_ORIGIN=https://office.SEU-DOMINIO.com

POSTGRES_PASSWORD=<senha forte de verdade>
JWT_KEY=<>= 32 bytes, gerado: openssl rand -base64 48>
AUTH_DEV_BYPASS=false

LIVEKIT_URL=wss://livekit.SEU-DOMINIO.com
LIVEKIT_API_KEY=<gerado>
LIVEKIT_API_SECRET=<gerado: openssl rand -base64 32>
```

`PUBLIC_ORIGIN` é a **primeira** origem da allowlist, e a primeira é também o destino padrão do
login (`AuthEndpoints.IsAllowedReturn`) — por isso ela tem que ser a do produto, não a do app web.

Com LiveKit self-hosted:

```bash
docker compose -f docker-compose.yml -f docker-compose.server.yml --profile local-livekit up -d --build
```

Com LiveKit Cloud (sem o SFU local): tire o `--profile local-livekit` e apague o bloco
`livekit.{$PUBLIC_DOMAIN}` do [`Caddyfile.server`](../deploy/Caddyfile.server) — sem DNS para o
subdomínio, o Caddy fica tentando emitir um certificado que nunca sai.

O que o override muda em relação ao compose local:

| | local (`docker-compose.yml`) | servidor (`+ docker-compose.server.yml`) |
|---|---|---|
| Caddy | `tls internal`, host `localhost`, portas 443/8443/7443/8080 | Let's Encrypt, host `$PUBLIC_DOMAIN`, portas 80/443 |
| Caddyfile | [`deploy/Caddyfile`](../deploy/Caddyfile) | [`deploy/Caddyfile.server`](../deploy/Caddyfile.server) |
| LiveKit | [`livekit.docker.yaml`](../livekit/livekit.docker.yaml), `use_external_ip: false` | [`livekit.server.yaml`](../livekit/livekit.server.yaml), `use_external_ip: true` |
| Origens | `https://localhost` + `:8443` | `$PUBLIC_ORIGIN` + `$PUBLIC_APP_ORIGIN` |

### Primeira conta

Banco novo nasce limpo (`SEED_DEMO_DATA=false`): só o catálogo curado, zero usuários. A primeira
pessoa se cadastra em `https://office.SEU-DOMINIO.com/app/` → *Criar conta*. Para ela nascer
Admin, ponha o e-mail em `Auth__AdminEmails__0` no compose **antes** do cadastro. Depois de criar
as contas, feche o cadastro com `AUTH_ALLOW_REGISTRATION=false`.

## Depois de subir

**Backup do banco** — o volume `pgdata` é a única coisa insubstituível (contas, horas, cards):

```bash
docker compose exec -T db pg_dump -U officequest officequest | gzip > /var/backups/oq-$(date +%F).sql.gz
```

Num cron diário, com retenção de umas duas semanas e cópia fora da máquina.

**Rotação de log do Docker** — sem isso o disco enche sozinho em uns meses. Em
`/etc/docker/daemon.json`:

```json
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
```

**Swap de 2 GB** se a máquina tiver 4 GB, para o build do .NET não morrer por OOM.

## Se o A/V não conectar

O resto do jogo (mundo, presença, tarefas, xadrez) **não depende do LiveKit** — ele degrada em
silêncio. Na ordem, o que checar:

1. `use_external_ip: true` está valendo? (`docker compose logs livekit | grep -i "node ip"`).
   Se o provedor faz NAT 1:1 e a descoberta falha, fixe `node_ip: <ip público>` no
   `livekit.server.yaml`.
2. UDP 7882 aberto no firewall do provedor.
3. Rede corporativa que bloqueia UDP cai no TCP 7881 — mais latência, mas conecta. Se nem isso
   passa, o caminho é TURN sobre TLS em 443, que conflita com o Caddy nessa porta: aí é hora de
   usar a LiveKit Cloud, que já resolve isso.
