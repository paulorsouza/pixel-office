# Autenticação, Permissão e Integração Google

**Atualizado:** 2026-07-19

Substitui a autenticação simbólica (`X-User-Id`) por **login com o Google Workspace da
Tooq + JWT próprio da aplicação**, com base para permissões e para Calendar/Meet.

Decisões alinhadas: **LiveKit continua** sendo o A/V de proximidade; **Meet só em reuniões
agendadas** (Calendar); **login restrito ao domínio da Tooq**.

---

## 1. Como funciona

Fluxo **Authorization Code (OIDC) mediado pelo backend** — necessário porque a integração
Calendar/Meet exige `refresh_token` offline, que só é emitido na troca feita pelo servidor.

```
Cliente → GET /auth/google/login?return=<url>   (302 para o Google)
Google  → consentimento (hd=<domínio>, access_type=offline)
        → 302 /auth/google/callback?code=…
Backend → troca code por id_token+access_token+refresh_token
        → valida (aud, iss, exp, email_verified, hd == domínio Tooq)
        → upsert do User (por 'sub'), guarda refresh_token cifrado
        → emite JWT próprio (access curto + refresh rotativo)
        → 302 de volta para <url>#access_token=…&refresh_token=…
Cliente → guarda tokens, manda Authorization: Bearer nas chamadas
```

O JWT próprio carrega as claims `uid`, `name`, `role`, `email`. A API valida com
`JwtBearer` (HS256). O SignalR recebe o token via `?access_token=` no handshake.

### Fallback de desenvolvimento

Enquanto `Auth:DevBypass = true` (default), a API **também** aceita o antigo `X-User-Id`
e o `userId` passado ao hub — para não quebrar o loop de dev antes das credenciais Google
existirem. Os clientes usam Bearer quando há token; senão, caem no modo dev.
**Em produção: `DevBypass = false`.**

### Conta local (usuário + senha) — o caminho do beta

O beta não depende do Workspace: dá para criar conta com **usuário e senha** na própria
tela de login. A conta **é o mesmo `User`**; cada forma de entrar é só uma credencial
pendurada nele:

```
User(Id) ──┬── Username + PasswordHash   (PBKDF2-SHA256, 210k iterações)
           └── GoogleSubject + Email     (vinculado depois, mesmo Id)
```

Como o progresso (XP, horas, inventário, móveis, tasks) sempre foi por `UserId`, ligar o
Google mais tarde **não migra nada** — o Id não muda.

| Endpoint | O que faz |
|---|---|
| `POST /auth/register` | cria conta (usuário, senha, nome) + estoque inicial; devolve os tokens |
| `POST /auth/login` | valida a senha; devolve os tokens (mesmo par do fluxo Google) |
| `GET /auth/me` | identidade + `hasPassword` / `hasGoogle` |
| `POST /auth/password` | troca a senha (ou define a primeira, para conta vinda do Google) e derruba as outras sessões |
| `GET /auth/google/login?link=<access_token>` | pendura o Google na conta **já logada**, em vez de criar outra |
| `POST /auth/google/unlink` | remove o vínculo (exige ter senha, senão a conta ficaria sem entrada) |

Defesas: senha mínima de 8 caracteres; hash com sal por usuário e rehash automático quando
as iterações subirem; resposta genérica ("usuário ou senha inválidos") com verificação
falsa para não vazar quais usuários existem; bloqueio por usuário e por IP após 8 falhas
em 15 minutos (`LoginThrottle`, em memória — vira store distribuído ao escalar).

Chaves de config: `Auth:PasswordEnabled` e `Auth:AllowRegistration` (beta por convite =
`AllowRegistration:false` e contas criadas por você).

### Uma conta = um avatar no mundo

O hub marca cada conexão como `world` (cliente Phaser) ou `panel` (app web). Ao entrar no
mundo, `OfficeHub.EvictWorldSessionsAsync` derruba as outras sessões **de mundo** da mesma
conta: manda `SessionEnded` e encerra o socket. O painel web fica de fora — é normal ele
estar aberto junto com o jogo.

**Quem cai é a sessão antiga, não a nova.** O contrário travaria o dono para fora sempre
que uma aba morresse sem avisar (navegador fechado no tranco, queda de internet), até o
timeout do SignalR. O cliente derrubado para a conexão de propósito (sem auto-reconnect,
senão as duas janelas ficariam se derrubando em loop), solta o microfone da call e mostra
"Sessão encerrada" com o botão **Jogar aqui**, que retoma o mundo naquela janela.

---

## 2. O que já está implementado (Fases 0–2)

| Área | Onde |
|---|---|
| Config, JWT (emissão/validação), fluxo Google, schema aditivo | `backend/.../Auth.cs` |
| Endpoints `/auth/config`, `/auth/google/login`, `/auth/google/callback`, `/auth/refresh`, `/auth/logout` | `backend/.../AuthEndpoints.cs` |
| Middleware JwtBearer + políticas `Admin`/`Manager`, CORS configurável, helper `UserId` via principal | `backend/.../Program.cs` |
| Hub deriva `userId` do JWT (fallback dev) | `backend/.../OfficeHub.cs` |
| Modelo: `User.GoogleSubject/Email/AppRole`, `User.Username/PasswordHash`, `UserRole`, `GoogleCredential`, `AppRefreshToken` | `backend/.../Models.cs` |
| Conta local: hash PBKDF2, regras de usuário/senha, freio de força bruta | `backend/.../PasswordAuth.cs` |
| Endpoints `/auth/register`, `/auth/login`, `/auth/me`, `/auth/password`, `/auth/google/unlink` e o `?link=` do Google | `backend/.../AuthEndpoints.cs` |
| Portaria do jogo + tela "sessão encerrada" | `client-web/src/LoginScreen.js` |
| Sessão única no mundo (`ClientKind`, takeover da sessão antiga) | `backend/.../Presence.cs`, `OfficeHub.cs` |
| Painel: formulário de conta no login e bloco "Conta" no perfil (trocar senha, vincular Google) | `backend/.../wwwroot/js/{main,profile}.js` |
| Cliente Phaser: captura de token, Bearer, `accessTokenFactory` | `client-web/src/auth.js`, `GameItemsSystem.js` |
| App web: botão Google + refresh + logout, Bearer | `backend/.../wwwroot/js/{api,main,chat}.js` |

Papéis (`Member`/`Manager`/`Admin`) já viajam no JWT e há políticas prontas. O
`refresh_token` do Google já é capturado e guardado cifrado (DataProtection), pronto para
Calendar/Meet.

**Escopo atual: só login.** O pedido de consentimento usa apenas `openid email profile`
(não sensível). O `refresh_token` do Google não é capturado enquanto `OfflineAccess=false`.

## 3. O que falta

### Habilitar Calendar/Meet (quando o app OAuth permitir)
1. `Auth:Scopes = "openid email profile https://www.googleapis.com/auth/calendar.events"`.
2. `Auth:OfflineAccess = true` (passa a receber e guardar o `refresh_token` cifrado).
3. App OAuth precisa ser **Internal** ou **verificado** — `calendar.events` é sensível.
   Em *External/Testing* o refresh token expira em 7 dias (ver §4).
4. Implementar (código ainda não escrito): `/api/calendar/today` + HUD de agenda; Meet
   agendado via `events.insert` com `conferenceData`. Libs: `Google.Apis.Calendar.v3`,
   `Google.Apis.Auth`. O modelo `GoogleCredential` e a captura do token já estão prontos.

### Outras frentes
- **Autorização por recurso**: quem decora cada sala (`RoomPermission` Owner/Team/Admins) —
  hoje mobília já é "só o dono"; falta formalizar sala com `IAuthorizationHandler`.
- **Endurecimento de produção** (§5).

---

## 4. Configurar o Google (Google Cloud Console do Workspace da Tooq)

1. **APIs & Services → OAuth consent screen**: preencha nome/logo. Escopos **só de login**:
   `openid`, `email`, `profile` — **não sensíveis, sem verificação**. (Calendar entra depois;
   ver "Habilitar Calendar/Meet" abaixo.)
2. **Credentials → Create OAuth client ID → Web application**.
   - **Authorized redirect URIs**: `http://localhost:5210/auth/google/callback` (dev) e a
     URL de produção equivalente.
3. Copie **Client ID** e **Client secret** para a config (§6) — o secret **nunca** vai
   versionado; use variáveis de ambiente/user-secrets.
4. Descubra o **domínio** exato do Workspace (o `hd`) e coloque em `Auth:HostedDomain`.

Para testar sem um Workspace, deixe `HostedDomain` vazio (aceita qualquer conta Google).

### Sem acesso de admin no Workspace

O modelo é **consentimento por usuário** (cada pessoa autoriza individualmente) — **não**
usa *domain-wide delegation*, então **não exige super admin**. Só é preciso conseguir criar
um projeto Cloud + OAuth client. Três cenários:

1. **"Internal" mesmo sem ser admin** — criar app Internal exige que o projeto pertença à
   org e que o admin não tenha bloqueado criação de projetos por membros. Se a opção
   *Internal* aparecer no consent screen, resolvido: sem verificação, sem limite de refresh
   token, Calendar liberado.
2. **"External" em modo "Testing"** (funciona sem admin) — OAuth client em qualquer conta,
   tipo *External*, status *Testing*, time como *test users* (até 100). **Pegadinhas:** o
   refresh token de app em *Testing* **expira em 7 dias** (quebra sync de Calendar em
   background; login tanto faz); e os test users veem aviso de "app não verificado".
   Durante os testes, deixe `HostedDomain` **vazio** (test users podem ser gmail pessoais,
   que a checagem `hd` barraria).
3. **Pedir ao admin** só uma coisa: criar o app Internal e entregar client id/secret, ou
   liberar criação de projetos. Pedido pontual, sem precisar de acesso.

---

## 5. Checklist de produção

- [ ] `Auth:DevBypass = false` (encerra o `X-User-Id`).
- [ ] `Auth:JwtKey` = segredo forte (≥ 32 bytes), via env, **não** o valor de dev.
- [ ] `Auth:GoogleClientId/Secret`, `Auth:HostedDomain`, `Auth:GoogleRedirectUri` de prod.
- [ ] `Auth:AllowedOrigins` com as origens reais → CORS deixa de ser `AllowAnyOrigin`.
- [ ] `Auth:AdminEmails` com os primeiros admins.
- [ ] Servir Phaser + app web + API sob **uma origem HTTPS** (proxy) simplifica cookies/CORS.
- [ ] Migrar SQLite → Postgres (o refresh token e credenciais pedem storage sério).

---

## 6. Referência de config (`appsettings` / env)

```jsonc
"Auth": {
  "DevBypass": true,                 // false em produção
  "HostedDomain": "",                // domínio do Workspace (claim 'hd')
  "GoogleClientId": "",
  "GoogleClientSecret": "",          // via env/secret em produção
  "GoogleRedirectUri": "http://localhost:5210/auth/google/callback",
  "Scopes": "openid email profile",  // só login; + calendar.events p/ agenda
  "OfflineAccess": false,            // true só p/ Calendar/Meet (pede refresh_token do Google)
  "JwtKey": "…",                     // ≥ 32 bytes; trocar em produção
  "AccessTokenMinutes": 30,
  "RefreshTokenDays": 14,
  "AllowedOrigins": [],              // ex.: ["https://office.tooq…"] → fecha o CORS
  "AdminEmails": [],                 // ex.: ["fulano@tooq…"]
  "SeedEmailLinks": {}               // ex.: {"paulo@tooq…": 1} vincula 1º login a user seed
}
```

`SeedEmailLinks` casa o primeiro login de um e-mail com um usuário já existente no banco
(preserva inventário/horas/decoração). Sem entrada, o primeiro login cria um usuário novo.

Variáveis de ambiente seguem o padrão ASP.NET: `Auth__GoogleClientSecret=…`,
`Auth__DevBypass=false`, etc.
