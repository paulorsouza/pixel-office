# Sobe a beta local do Office Quest (sem Docker) e a expoe pela internet via Cloudflare Tunnel.
# Pecas: backend (.NET :5210), Caddy (origem unica :8080), cloudflared (tunel).
# A/V: LiveKit Cloud (se deploy\beta.env estiver preenchido) ou LiveKit local (fallback).
#
# Pre-requisitos (binarios unicos, sem instalar nada pesado):
#   - .NET 10 SDK (ja usado no projeto)
#   - caddy.exe       -> https://caddyserver.com/download   (ponha no PATH ou em deploy\caddy.exe)
#   - cloudflared.exe -> https://github.com/cloudflare/cloudflared/releases  (PATH ou deploy\cloudflared.exe)
#   - Voz entre redes: preencha deploy\beta.env (copie de deploy\beta.env.example) com a LiveKit Cloud.
#
# Uso:  .\run-beta.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:OFFICE_GAME_ROOT = Join-Path $root 'client-web'

function Find-Exe($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $local = Join-Path $root "deploy\$name.exe"
  if (Test-Path $local) { return $local }
  return $null
}

function Assert-PortFree($port, $service) {
  $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $listener) { return }

  $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
  $processName = if ($process) { "$($process.ProcessName) (PID $($process.Id))" } else { "PID $($listener.OwningProcess)" }
  throw "Nao foi possivel iniciar $service`: a porta $port ja esta em uso por $processName. Feche o processo ou a execucao anterior do run-beta e tente novamente."
}

function Wait-HttpReady($url, $timeoutSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return $true }
    } catch {
      # O backend ainda pode estar aplicando o schema e iniciando os servicos.
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  return $false
}

# --- 0. checagens ---
# O backend so sobe com o Postgres de pe (nao existe mais fallback SQLite).
$pg = Get-NetTCPConnection -State Listen -LocalPort 5432 -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pg) {
  throw "Postgres nao esta escutando na porta 5432. Suba com:  docker compose -f docker-compose.dev.yml up -d   (ver docs\BANCO_POSTGRES.md)"
}
$caddy = Find-Exe 'caddy'
$cloudflared = Find-Exe 'cloudflared'
if (-not $caddy) { Write-Host "AVISO: caddy nao encontrado. Baixe caddy.exe (caddyserver.com/download) e ponha no PATH ou em deploy\caddy.exe" -ForegroundColor Yellow }
if (-not $cloudflared) { Write-Host "AVISO: cloudflared nao encontrado. Baixe (github.com/cloudflare/cloudflared/releases) e ponha no PATH ou em deploy\cloudflared.exe" -ForegroundColor Yellow }

# --- 0.1 config de A/V (LiveKit Cloud) ---
$betaEnv = @{}
$betaEnvFile = Join-Path $root 'deploy\beta.env'
if (Test-Path $betaEnvFile) {
  foreach ($line in Get-Content $betaEnvFile) {
    if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*)\s*$') { $betaEnv[$Matches[1]] = $Matches[2].Trim() }
  }
}
$useCloud = $betaEnv.ContainsKey('LIVEKIT_URL') -and $betaEnv['LIVEKIT_URL']

# Falhe antes de abrir qualquer janela. Antes o script iniciava servicos duplicados e
# seguia ate o tunel mesmo quando o backend nao conseguia escutar na porta 5210.
Assert-PortFree 5210 'o backend'
if ($caddy) { Assert-PortFree 8080 'o Caddy' }

# --- 1. garante que a DLL corresponde ao codigo atual ---
$apiDir = Join-Path $root 'backend\VirtualOffice.Api'
$dll = Join-Path $apiDir 'bin\Debug\net10.0\VirtualOffice.Api.dll'
Write-Host "Atualizando o backend..." -ForegroundColor Cyan
& dotnet build $apiDir -c Debug --nologo | Out-Host
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $dll)) {
  throw "O build do backend falhou. Corrija os erros acima antes de abrir a beta."
}

function Start-Term($title, $command) {
  Start-Process powershell -ArgumentList @('-NoExit','-Command', "`$host.UI.RawUI.WindowTitle='$title'; $command")
}

# --- 2. LiveKit local (so se NAO estiver usando a Cloud) ---
$lk = Join-Path $root 'livekit\livekit-server.exe'
if ($useCloud) {
  Write-Host "A/V: usando LiveKit Cloud ($($betaEnv['LIVEKIT_URL'])) - voz funciona entre redes." -ForegroundColor Cyan
} elseif (Test-Path $lk) {
  Write-Host "A/V: LiveKit local (a voz so funciona na sua LAN; preencha deploy\beta.env p/ voz entre redes)." -ForegroundColor Yellow
  Start-Term 'OfficeQuest - LiveKit' "Set-Location '$($root)\livekit'; & '.\livekit-server.exe' --config livekit.yaml"
} else {
  Write-Host "AVISO: sem LiveKit (nem Cloud nem local) - a voz nao vai funcionar (o resto funciona)." -ForegroundColor Yellow
}

# --- 3. backend (.NET) em :5210 (os filhos herdam estas variaveis) ---
$env:ASPNETCORE_URLS = 'http://localhost:5210'
# Banco: Postgres e o unico provider. As migrations rodam sozinhas no boot.
if ($betaEnv['DB_CONNECTION']) { $env:ConnectionStrings__Default = $betaEnv['DB_CONNECTION'] }
# Economia do beta: 10 mil moedas por usuario, concedidas uma unica vez.
$env:Game__WelcomeGrantCoins = if ($betaEnv['GAME_WELCOME_GRANT_COINS']) { $betaEnv['GAME_WELCOME_GRANT_COINS'] } else { '10000' }
if ($betaEnv['GAME_WELCOME_GRANT_KEY']) { $env:Game__WelcomeGrantKey = $betaEnv['GAME_WELCOME_GRANT_KEY'] }
if ($betaEnv['LIVEKIT_URL'])        { $env:LiveKit__Url = $betaEnv['LIVEKIT_URL'] }
if ($betaEnv['LIVEKIT_API_KEY'])    { $env:LiveKit__ApiKey = $betaEnv['LIVEKIT_API_KEY'] }
if ($betaEnv['LIVEKIT_API_SECRET']) { $env:LiveKit__ApiSecret = $betaEnv['LIVEKIT_API_SECRET'] }
# Conta por usuario+senha: no beta o X-User-Id fica desligado (senao qualquer um
# entra como qualquer um). Para voltar ao atalho de dev: AUTH_DEV_BYPASS=true no beta.env.
$env:Auth__DevBypass = if ($betaEnv['AUTH_DEV_BYPASS']) { $betaEnv['AUTH_DEV_BYPASS'] } else { 'false' }
if ($betaEnv['AUTH_ALLOW_REGISTRATION']) { $env:Auth__AllowRegistration = $betaEnv['AUTH_ALLOW_REGISTRATION'] }
if ($betaEnv['JWT_KEY']) { $env:Auth__JwtKey = $betaEnv['JWT_KEY'] }
Write-Host "Contas: usuario+senha (cadastro na tela de login). DevBypass=$($env:Auth__DevBypass)." -ForegroundColor Cyan
Start-Term 'OfficeQuest - Backend' "Set-Location '$apiDir'; & dotnet '$dll'"
Write-Host "Aguardando o backend ficar pronto..." -ForegroundColor Cyan
if (-not (Wait-HttpReady 'http://localhost:5210/' 30)) {
  throw "O backend foi iniciado, mas nao respondeu em http://localhost:5210 dentro de 30 segundos. Confira a janela 'OfficeQuest - Backend'."
}
Write-Host "Backend pronto em http://localhost:5210." -ForegroundColor Green

# --- 4. Caddy: game + API na mesma origem (:8080) ---
if ($caddy) {
  Start-Term 'OfficeQuest - Caddy' "`$env:OFFICE_GAME_ROOT='$($env:OFFICE_GAME_ROOT)'; & '$caddy' run --config '$($root)\deploy\Caddyfile.beta'"
}

Start-Sleep -Seconds 3
Write-Host ""
Write-Host "Local (teste na sua maquina/LAN):  http://localhost:8080" -ForegroundColor Green
Write-Host ""

# --- 5. tunel publico ---
if ($cloudflared) {
  Write-Host "Abrindo o tunel publico (Cloudflare). A URL https://...trycloudflare.com vai aparecer abaixo:" -ForegroundColor Green
  & $cloudflared tunnel --url http://localhost:8080
} else {
  Write-Host "Para expor pela internet, rode em outra janela:" -ForegroundColor Green
  Write-Host "    cloudflared tunnel --url http://localhost:8080" -ForegroundColor White
}
