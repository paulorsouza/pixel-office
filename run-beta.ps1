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

# --- 0. checagens ---
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

# --- 1. garante o backend buildado ---
$apiDir = Join-Path $root 'backend\VirtualOffice.Api'
$dll = Join-Path $apiDir 'bin\Debug\net10.0\VirtualOffice.Api.dll'
if (-not (Test-Path $dll)) {
  Write-Host "Buildando o backend..." -ForegroundColor Cyan
  & dotnet build $apiDir -c Debug | Out-Host
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
if ($betaEnv['LIVEKIT_URL'])        { $env:LiveKit__Url = $betaEnv['LIVEKIT_URL'] }
if ($betaEnv['LIVEKIT_API_KEY'])    { $env:LiveKit__ApiKey = $betaEnv['LIVEKIT_API_KEY'] }
if ($betaEnv['LIVEKIT_API_SECRET']) { $env:LiveKit__ApiSecret = $betaEnv['LIVEKIT_API_SECRET'] }
Start-Term 'OfficeQuest - Backend' "Set-Location '$apiDir'; & dotnet '$dll'"

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
