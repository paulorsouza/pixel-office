# Sobe o Office Quest v1 em modo PRODUCAO na sua maquina.
#
# Diferente do run-beta.ps1 (que roda o backend solto e expoe por tunel), aqui tudo
# vai em container, exatamente como no servidor: Postgres + backend + game (nginx)
# + Caddy (HTTPS).
#
# DADOS SAO PRESERVADOS entre execucoes -- e producao. Um banco NOVO nasce limpo:
# sem time ficticio, sem horas inventadas, so o catalogo curado (tipos de
# lancamento, objetivos, itens da loja). Para zerar, e preciso pedir com -Reset.
#
# Pre-requisito: Docker Desktop instalado.
#
# O TUNEL DO CLOUDFLARE SOBE POR PADRAO e o link para compartilhar aparece em
# destaque no fim (igual ao run-beta.ps1). Use -NoTunnel para rodar so local.
#
# Uso:
#   .\run-prod-local.ps1              # sobe + tunel publico + mostra o link
#   .\run-prod-local.ps1 -NoTunnel    # so local, sem expor na internet
#   .\run-prod-local.ps1 -Reset       # ZERA o banco antes de subir (pede confirmacao)
#   .\run-prod-local.ps1 -Reset -Force  # zera sem perguntar
#   .\run-prod-local.ps1 -Demo        # num banco vazio, cria o time ficticio
#   .\run-prod-local.ps1 -LocalLiveKit  # SFU em container (voz so na LAN)
#   .\run-prod-local.ps1 -Down        # derruba tudo (o banco fica no volume)
#
# A/V: por padrao usa a LiveKit CLOUD (LIVEKIT_URL no .env). E obrigatorio para
# acesso externo -- o WebRTC e UDP e UDP nao passa por tunel HTTP. O script
# reaproveita as chaves de deploy\beta.env se o .env ainda nao tiver.

[CmdletBinding()]
param(
  [switch]$Reset,
  [switch]$Force,
  [switch]$Demo,
  [switch]$NoTunnel,
  [switch]$LocalLiveKit,
  [switch]$Down
)

# Expor e o caso normal deste script; nao expor e a excecao.
$Tunnel = -not $NoTunnel

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$project = 'officequest'
$envFile = Join-Path $root '.env'
$composeFile = Join-Path $root 'docker-compose.yml'
# Splat: evita que o PowerShell tente interpretar '--build' como parametro dele.
$compose = @('compose', '-p', $project, '-f', $composeFile)
if ($LocalLiveKit) { $compose = @('compose', '--profile', 'local-livekit', '-p', $project, '-f', $composeFile) }
# Para DERRUBAR usamos sempre todos os perfis: 'docker compose down' ignora servicos
# de perfil inativo, e o SFU local de um run anterior ficava rodando (segurando as
# portas UDP) ao trocar para a LiveKit Cloud.
$composeAll = @('compose', '--profile', 'local-livekit', '-p', $project, '-f', $composeFile)

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Step($text) { Write-Host ''; Write-Host "==> $text" -ForegroundColor Cyan }

# Segredo alfanumerico: base64 tem '+', '/' e '=', que atrapalham dentro de uma
# connection string do Postgres e do .env. Funciona no PS 5.1 e no 7.
function New-Secret($length = 40) {
  $buffer = New-Object byte[] 96
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($buffer)
  $text = ([Convert]::ToBase64String($buffer) -replace '[^A-Za-z0-9]', '')
  return $text.Substring(0, $length)
}

function Read-EnvFile($path) {
  $map = @{}
  if (-not (Test-Path $path)) { return $map }
  foreach ($line in Get-Content $path) {
    if ($line -match '^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$') { $map[$Matches[1]] = $Matches[2].Trim() }
  }
  return $map
}

function Set-EnvValue($path, $key, $value) {
  $lines = @(Get-Content $path)
  $done = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*$key\s*=") { $lines[$i] = "$key=$value"; $done = $true }
  }
  if (-not $done) { $lines += "$key=$value" }
  Set-Content -Path $path -Value $lines -Encoding ASCII
}

function Assert-PortFree($port, $service) {
  $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $listener) { return }
  $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
  $name = if ($process) { "$($process.ProcessName) (PID $($process.Id))" } else { "PID $($listener.OwningProcess)" }
  throw "A porta $port ($service) ja esta em uso por $name. Feche esse processo e rode de novo."
}

# --- 0. Docker de pe ---
# Este script NAO instala nem baixa o Docker. Ele so procura o que ja esta na maquina.
# (O 'up --build' la embaixo baixa as IMAGENS base na primeira vez -- isso sim, ~1 GB.)
Step 'Checando o Docker'
$docker = (Get-Command docker -ErrorAction SilentlyContinue).Source
if (-not $docker) {
  # Terminal aberto antes da instalacao nao enxerga o PATH novo; procure no lugar padrao
  # antes de desistir, senao o script acusa "nao encontrado" com o Docker instalado.
  $known = @(
    'C:\Program Files\Docker\Docker\resources\bin\docker.exe',
    "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe",
    "$env:LOCALAPPDATA\Docker\wsl\docker.exe"
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if ($known) {
    $docker = $known
    # Nao basta achar o docker.exe: o proprio Docker chama auxiliares pelo %PATH%
    # (docker-credential-desktop, plugins do buildx). Sem a pasta no PATH, o build
    # morre com "error getting credentials". Vale so para este processo.
    $env:Path = (Split-Path -Parent $known) + ';' + $env:Path
    Say "Docker achado em '$docker' (fora do PATH deste terminal; ajustado para este run)." Yellow
  }
}
if (-not $docker) {
  Say "Docker Desktop nao encontrado nesta maquina." Red
  Say "Instale uma vez (o script nao faz isso por voce):" Yellow
  Say "    winget install Docker.DockerDesktop" White
  Say "Se voce ACABOU de instalar, abra um terminal novo: o atual ainda tem o PATH antigo." Yellow
  throw 'Docker ausente.'
}
& $docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Say "Docker instalado, mas o motor nao respondeu. Abrindo o Docker Desktop..." Yellow
  $desktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
  if (Test-Path $desktop) { Start-Process $desktop }
  $deadline = (Get-Date).AddMinutes(3)
  do {
    Start-Sleep -Seconds 5
    & $docker info 2>&1 | Out-Null
  } while ($LASTEXITCODE -ne 0 -and (Get-Date) -lt $deadline)
  if ($LASTEXITCODE -ne 0) { throw "O motor do Docker nao subiu em 3 minutos. Abra o Docker Desktop e tente de novo." }
}
Say "Docker pronto." Green

# --- derrubar e sair ---
if ($Down) {
  Step 'Derrubando o ambiente (os dados continuam no volume)'
  & $docker @composeAll down
  Say "Pronto. Para apagar o banco tambem:  docker volume rm ${project}_pgdata" Green
  return
}

# --- 1. .env: cria e gera segredos de verdade na primeira vez ---
Step 'Conferindo o .env'
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $root '.env.example') $envFile
  # Producao nao pode subir com a senha e a chave do exemplo.
  Set-EnvValue $envFile 'POSTGRES_PASSWORD' (New-Secret 32)
  Set-EnvValue $envFile 'JWT_KEY' (New-Secret 48)
  Set-EnvValue $envFile 'LIVEKIT_API_SECRET' (New-Secret 40)
  Set-EnvValue $envFile 'AUTH_DEV_BYPASS' 'false'
  Say ".env criado. Senha do Postgres, JWT_KEY e segredo do LiveKit gerados automaticamente." Green
}

$conf = Read-EnvFile $envFile
$problems = @()
if (-not $conf['JWT_KEY'] -or $conf['JWT_KEY'] -like 'troque*') { $problems += 'JWT_KEY ainda e o valor de exemplo' }
elseif ($conf['JWT_KEY'].Length -lt 32) { $problems += 'JWT_KEY tem menos de 32 caracteres' }
if (-not $conf['POSTGRES_PASSWORD'] -or $conf['POSTGRES_PASSWORD'] -like 'troque*') { $problems += 'POSTGRES_PASSWORD ainda e o valor de exemplo' }
if ($problems.Count -gt 0) {
  Say "Corrija no .env antes de subir em modo producao:" Red
  foreach ($p in $problems) { Say "  - $p" Red }
  throw "Configuracao insegura para producao."
}

# DevBypass ligado em producao e porta dos fundos: o header X-User-Id vira login de qualquer um.
if ($conf['AUTH_DEV_BYPASS'] -eq 'true') {
  Say "AVISO: AUTH_DEV_BYPASS=true aceita X-User-Id como login. Desligando para este run." Yellow
  Set-EnvValue $envFile 'AUTH_DEV_BYPASS' 'false'
}
if ($Demo) { Set-EnvValue $envFile 'SEED_DEMO_DATA' 'true' } else { Set-EnvValue $envFile 'SEED_DEMO_DATA' 'false' }
# O seed so age em banco VAZIO; num banco que ja tem gente isto nao muda nada.
$dados = if ($Demo) { 'time ficticio (demo)' } else { 'so o catalogo curado' }
Say "Configuracao ok. Se o banco estiver vazio, ele nasce com: $dados." Green

# --- 1.1 A/V: LiveKit Cloud (remoto) ou container local ---
Step 'Conferindo o A/V (LiveKit)'
if ($LocalLiveKit) {
  Set-EnvValue $envFile 'LIVEKIT_URL' ''
  Say "SFU em container (perfil local-livekit). A voz so funciona na sua maquina/LAN." Yellow
  if ($Tunnel) {
    Say "AVISO: com -Tunnel, quem entrar de fora NAO tera voz -- UDP nao passa por tunel HTTP." Yellow
  }
} else {
  # Reaproveita as chaves da Cloud que o beta ja usa, em vez de pedir de novo.
  if (-not $conf['LIVEKIT_URL']) {
    $betaEnvFile = Join-Path $root 'deploy\beta.env'
    $beta = Read-EnvFile $betaEnvFile
    if ($beta['LIVEKIT_URL']) {
      Set-EnvValue $envFile 'LIVEKIT_URL' $beta['LIVEKIT_URL']
      if ($beta['LIVEKIT_API_KEY'])    { Set-EnvValue $envFile 'LIVEKIT_API_KEY' $beta['LIVEKIT_API_KEY'] }
      if ($beta['LIVEKIT_API_SECRET']) { Set-EnvValue $envFile 'LIVEKIT_API_SECRET' $beta['LIVEKIT_API_SECRET'] }
      Say "Chaves da LiveKit Cloud reaproveitadas de deploy\beta.env." Green
      $conf = Read-EnvFile $envFile
    }
  }
  if ($conf['LIVEKIT_URL']) {
    Say "A/V: LiveKit Cloud ($($conf['LIVEKIT_URL'])) -- voz funciona entre redes." Green
    if (-not $conf['LIVEKIT_API_KEY'] -or -not $conf['LIVEKIT_API_SECRET']) {
      Say "AVISO: LIVEKIT_API_KEY/SECRET vazios no .env; a voz nao vai autenticar." Yellow
    }
  } else {
    Say "Sem LIVEKIT_URL no .env: nao havera A/V." Yellow
    Say "  - voz entre redes: preencha LIVEKIT_URL/KEY/SECRET (LiveKit Cloud) no .env" Gray
    Say "  - voz so na LAN:   rode com -LocalLiveKit" Gray
    if ($Tunnel) { Say "  (o resto do jogo funciona normal pelo tunel; so a voz fica de fora.)" Gray }
  }
}

# --- 1.2 tunel: o binario precisa existir ANTES de subir o stack ---
$cloudflared = $null
if ($Tunnel) {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) { $cloudflared = $cmd.Source }
  elseif (Test-Path (Join-Path $root 'deploy\cloudflared.exe')) { $cloudflared = Join-Path $root 'deploy\cloudflared.exe' }
  if (-not $cloudflared) {
    # Falta so o tunel: o stack local continua util, entao avisa e segue.
    Say "cloudflared nao encontrado -- vai subir SEM acesso externo." Yellow
    Say "Para ter o link de compartilhar, baixe de github.com/cloudflare/cloudflared/releases" Yellow
    Say "e ponha no PATH ou em deploy\cloudflared.exe" Yellow
    $Tunnel = $false
  } else {
    Say "cloudflared: $cloudflared" Green
  }
}

# --- 2. derruba a execucao anterior e prepara o banco ---
# O PADRAO E PRESERVAR OS DADOS. Este e um ambiente de producao: subir de novo nao
# pode custar as contas e as horas de ninguem. Zerar e explicito, com -Reset.
$volume = "${project}_pgdata"
$exists = (& $docker volume ls -q -f "name=^$volume$")

if ($Reset -and $exists -and -not $Force) {
  Step 'Zerar o banco (-Reset)'
  Say "Isto APAGA o volume '$volume': todas as contas, horas e atividades deste ambiente." Red
  Say "Sem -Reset, o script sobe preservando tudo." Gray
  $answer = Read-Host "Confirma? (digite: sim)"
  if ($answer -ne 'sim') { Say 'Cancelado.' Yellow; return }
}

Step 'Derrubando a execucao anterior'
& $docker @composeAll down

# So agora checamos as portas: antes do 'down' o Caddy da rodada anterior ainda
# estava segurando a 443, e re-rodar o script falhava por causa de si mesmo.
Assert-PortFree 443  'o Caddy / game'
Assert-PortFree 8443 'o Caddy / app web'
Assert-PortFree 7443 'o Caddy / LiveKit'
Assert-PortFree 8080 'o Caddy / origem do tunel'

if ($Reset -and $exists) {
  & $docker volume rm $volume | Out-Null
  Say "Banco zerado: o volume '$volume' foi removido." Yellow
} elseif ($exists) {
  Say "Banco PRESERVADO (volume '$volume'). Use -Reset para zerar." Green
} else {
  Say 'Primeira execucao: o banco nasce vazio, so com o catalogo curado.' Gray
}
# O volume do Caddy fica de proposito: apaga-lo troca a CA interna e voce teria
# de confiar no certificado de novo a cada run.

# --- 3. build + up ---
Step 'Construindo as imagens e subindo (o primeiro run demora)'
& $docker @compose up --build -d
if ($LASTEXITCODE -ne 0) { throw "docker compose up falhou." }

Step 'Esperando o backend aplicar as migrations e comecar a escutar'
$deadline = (Get-Date).AddMinutes(5)
$ready = $false
$crashed = $false
do {
  Start-Sleep -Seconds 4
  $log = (& $docker @compose logs --no-color --tail 200 backend 2>&1) -join "`n"
  if ($log -match 'Application started|Now listening on') { $ready = $true; break }
  if ($log -match 'Unhandled exception|Npgsql\.\w*Exception|terminated unexpectedly') { $crashed = $true; break }
} while ((Get-Date) -lt $deadline)

if (-not $ready) {
  $motivo = if ($crashed) { 'O backend quebrou ao subir.' } else { 'O backend nao respondeu no tempo esperado.' }
  Say $motivo Red
  Say "Log completo:" Red
  Say "    docker compose -p $project logs backend" White
  throw 'Ambiente subiu incompleto.'
}

# --- 4. instrucoes ---
Step 'Office Quest v1 no ar'
Say ""
Say "  Jogo (o produto):        https://localhost" Green
Say "  App web (kanban/horas):  https://localhost:8443" Green
Say ""
Say "O certificado e auto-assinado: o navegador avisa na primeira vez." Yellow
Say "Para o audio do LiveKit funcionar, confie na CA do Caddy:" Yellow
Say "    docker compose -p $project cp caddy:/data/caddy/pki/authorities/local/root.crt .\caddy-root.crt" White
Say "    (importe em certmgr.msc -> Autoridades de Certificacao Raiz Confiaveis)" White
Say ""
if ($exists -and -not $Reset) {
  Say "Banco preservado: as contas e as horas de antes continuam la." Green
} elseif (-not $Demo) {
  Say "Banco vazio: ainda nao existe nenhuma conta." Cyan
  Say "Abra https://localhost:8443, clique em 'Criar conta' e cadastre a primeira pessoa." Cyan
  Say "Para ela nascer Admin, ponha o e-mail em Auth__AdminEmails__0 no docker-compose.yml antes de cadastrar." Gray
}
Say ""
Say "Comandos uteis:" Gray
Say "    docker compose -p $project logs -f backend    # acompanhar o backend" White
Say "    docker compose -p $project ps                 # o que esta rodando" White
Say "    .\run-prod-local.ps1                          # subir de novo, SEM perder dados" White
Say "    .\run-prod-local.ps1 -NoTunnel                # subir sem expor na internet" White
Say "    .\run-prod-local.ps1 -Reset                   # zerar o banco (pede confirmacao)" White
Say "    .\run-prod-local.ps1 -Down                    # derrubar" White

# --- 5. tunel publico ---
# O cloudflared imprime a URL no meio de dezenas de linhas de log. Rodamos ele em
# background, pescamos a URL e mostramos em destaque -- o link e o produto aqui.
if ($Tunnel) {
  Step 'Abrindo o tunel publico (Cloudflare)'
  $logOut = Join-Path $env:TEMP 'officequest-tunnel.out.log'
  $logErr = Join-Path $env:TEMP 'officequest-tunnel.err.log'
  Remove-Item $logOut, $logErr -ErrorAction SilentlyContinue

  $tunnelProc = Start-Process -FilePath $cloudflared `
    -ArgumentList @('tunnel', '--url', 'http://localhost:8080') `
    -RedirectStandardOutput $logOut -RedirectStandardError $logErr `
    -NoNewWindow -PassThru

  try {
    $publicUrl = $null
    $deadline = (Get-Date).AddMinutes(2)
    while (-not $publicUrl -and (Get-Date) -lt $deadline) {
      Start-Sleep -Seconds 2
      if ($tunnelProc.HasExited) { break }
      $texto = @()
      foreach ($f in @($logErr, $logOut)) {
        if (Test-Path $f) { $texto += (Get-Content $f -Raw -ErrorAction SilentlyContinue) }
      }
      $m = [regex]::Match(($texto -join "`n"), 'https://[a-z0-9-]+\.trycloudflare\.com')
      if ($m.Success) { $publicUrl = $m.Value }
    }

    if (-not $publicUrl) {
      Say "Nao consegui ler a URL do tunel. Log: $logErr" Red
      if ($tunnelProc.HasExited) { Say "O cloudflared encerrou sozinho (codigo $($tunnelProc.ExitCode))." Red }
      throw 'Tunel nao subiu.'
    }

    $linha = '=' * 62
    Write-Host ''
    Write-Host $linha -ForegroundColor Green
    Write-Host '  LINK PARA COMPARTILHAR' -ForegroundColor Green
    Write-Host ''
    Write-Host "    $publicUrl" -ForegroundColor White
    Write-Host ''
    Write-Host "  App web (kanban/horas):  $publicUrl/app/" -ForegroundColor Gray
    Write-Host $linha -ForegroundColor Green
    Write-Host ''

    try {
      Set-Clipboard -Value $publicUrl
      Say 'O link ja esta na sua area de transferencia (Ctrl+V).' Green
    } catch {
      # Set-Clipboard nao existe em toda sessao (ex.: PowerShell sem STA); nao e critico.
    }
    $urlFile = Join-Path $root 'deploy\tunnel-url.txt'
    Set-Content -Path $urlFile -Value $publicUrl -Encoding ASCII
    Say "Tambem salvo em deploy\tunnel-url.txt" Gray
    Say ""

    if ($conf['LIVEKIT_URL']) {
      Say 'Voz: funciona para quem entrar de fora (LiveKit Cloud).' Green
    } else {
      Say 'Voz: quem entrar de fora NAO tera audio (sem LiveKit Cloud). O resto funciona.' Yellow
    }
    Say 'Login: usuario + senha. O Google OAuth nao funciona em quick tunnel --' Yellow
    Say 'a URL muda a cada execucao e precisa estar registrada no console do Google.' Yellow
    Say ''
    Say 'Ctrl+C encerra o tunel. O stack continua rodando (-Down para derrubar).' Cyan
    Say ''

    Wait-Process -Id $tunnelProc.Id
  } finally {
    # Ctrl+C ou erro: nao deixe o cloudflared orfao segurando o tunel.
    if ($tunnelProc -and -not $tunnelProc.HasExited) {
      Stop-Process -Id $tunnelProc.Id -Force -ErrorAction SilentlyContinue
      Say 'Tunel encerrado.' Gray
    }
  }
}
