#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Sobe o PokeTche no Android conectado via USB: Postgres + API + Metro + app.

.DESCRIPTION
  Reproduz o fluxo de "rodar no device via USB":
    1. Detecta o aparelho Android via adb (USB debugging).
    2. Sobe o Postgres (docker compose) e espera ficar healthy.
    3. Gera o Prisma Client e sobe a API Fastify (janela separada) -> /health.
    4. Configura adb reverse: 8081 (Metro) e 3000 (API). O app usa http://localhost
       via o tunel USB, entao nao depende de Wi-Fi/firewall.
    5. Sobe o Metro (janela separada) e pre-compila o bundle (evita timeout no 1o load).
    6. Abre o app no aparelho apontando pro Metro.

  Pre-requisito: o dev client (com.poketche.app) ja instalado no aparelho.
  Na primeira vez, ou quando mudar dependencia NATIVA, rode com -Rebuild
  (recompila e reinstala o dev client via gradle).

.PARAMETER Serial     Serial do aparelho (adb). Default: o primeiro conectado.
.PARAMETER Rebuild    Recompila+reinstala o dev client (expo run:android). Use na 1a vez.
.PARAMETER NoBackend  Nao sobe Postgres/API (use se ja estiverem rodando).
.PARAMETER MetroPort  Porta do Metro (default 8081).
.PARAMETER ApiPort    Porta da API (default 3000).

.EXAMPLE
  .\start.ps1              # fluxo diario (app ja instalado)
.EXAMPLE
  .\start.ps1 -Rebuild     # primeira vez / mudou lib nativa
#>
param(
  [string]$Serial,
  [switch]$Rebuild,
  [switch]$NoBackend,
  [int]$MetroPort = 8081,
  [int]$ApiPort   = 3000
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$pkg  = 'com.poketche.app'

function Info($m)  { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "OK  $m" -ForegroundColor Green }
function Warn2($m) { Write-Host "!!  $m" -ForegroundColor Yellow }

# --- Localiza o adb ---------------------------------------------------------
function Resolve-Adb {
  foreach ($base in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk'))) {
    if ($base) {
      $p = Join-Path $base 'platform-tools\adb.exe'
      if (Test-Path $p) { return $p }
    }
  }
  $c = Get-Command adb -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  throw "adb nao encontrado. Instale o Android SDK ou defina ANDROID_HOME."
}
$adb = Resolve-Adb
$sdk = Split-Path (Split-Path $adb -Parent) -Parent   # ...\Android\Sdk
Ok "adb: $adb"

# --- Detecta o aparelho -----------------------------------------------------
function Get-Devices {
  & $adb devices | Select-Object -Skip 1 |
    Where-Object { $_ -match "`tdevice$" } |
    ForEach-Object { ($_ -split "`t")[0] }
}
$devices = Get-Devices
if (-not $Serial) { $Serial = $devices | Select-Object -First 1 }
if (-not $Serial) {
  throw "Nenhum aparelho Android autorizado via USB. Conecte o cabo, ative a 'Depuracao USB' e autorize o computador."
}
Ok "Aparelho: $Serial"

# --- Helpers de espera por HTTP ---------------------------------------------
# Checagens HTTP do lado do PC usam 127.0.0.1 (a API escuta em IPv4/0.0.0.0;
# 'localhost' pode resolver pra ::1 primeiro e recusar). O aparelho continua
# usando 'localhost' via adb reverse, que no Android resolve pra 127.0.0.1.
function Test-Http($url) {
  try { Invoke-WebRequest $url -TimeoutSec 5 -UseBasicParsing | Out-Null; return $true }
  catch { return $false }
}
function Wait-Http($url, $label, $tries = 40) {
  for ($i = 0; $i -lt $tries; $i++) {
    if (Test-Http $url) { Ok "$label pronto"; return $true }
    Start-Sleep 2
  }
  Warn2 "$label nao respondeu em $($tries*2)s ($url)"
  return $false
}

# --- 1) Backend: Postgres + API --------------------------------------------
if (-not $NoBackend) {
  Info "Subindo Postgres (docker compose up -d db)"
  Push-Location $root
  docker compose up -d db | Out-Null
  Pop-Location

  Info "Aguardando Postgres ficar healthy"
  $healthy = $false
  for ($i = 0; $i -lt 30; $i++) {
    $s = (docker inspect --format '{{.State.Health.Status}}' poketche-db 2>$null)
    if ($s -eq 'healthy') { $healthy = $true; break }
    Start-Sleep 2
  }
  if ($healthy) { Ok "Postgres healthy" } else { Warn2 "Postgres ainda nao esta healthy; seguindo mesmo assim" }

  $apiHealth = "http://127.0.0.1:$ApiPort/health"
  # Algumas tentativas rapidas antes de decidir subir outra instancia (cold-start sob carga).
  $apiUp = $false
  for ($i = 0; $i -lt 3; $i++) { if (Test-Http $apiHealth) { $apiUp = $true; break } }
  if ($apiUp) {
    Ok "API ja esta rodando na porta $ApiPort"
  } else {
    # Gera o Prisma Client apenas quando vamos subir a API (com a API no ar a DLL
    # do engine fica travada e o generate falha com EPERM).
    Info "Gerando Prisma Client"
    Push-Location $root
    pnpm --filter '@poketche/api' prisma:generate | Out-Null
    Pop-Location

    Info "Subindo API Fastify (janela separada)"
    Start-Process powershell -ArgumentList @(
      '-NoExit','-Command',
      "Set-Location '$root'; Write-Host 'API PokeTche (porta $ApiPort)'; pnpm --filter '@poketche/api' dev"
    ) | Out-Null
    Wait-Http $apiHealth "API" 40 | Out-Null
  }
} else {
  Warn2 "NoBackend: pulando Postgres/API"
}

# --- 2) adb reverse (tunel USB) --------------------------------------------
Info "Configurando adb reverse (Metro=$MetroPort, API=$ApiPort)"
& $adb -s $Serial reverse tcp:$MetroPort tcp:$MetroPort | Out-Null
& $adb -s $Serial reverse tcp:$ApiPort   tcp:$ApiPort   | Out-Null
Ok "reverse ativo: $(& $adb -s $Serial reverse --list)"

# --- 3a) Rebuild: recompila e instala o dev client via gradle ---------------
if ($Rebuild) {
  Info "Rebuild: removendo instalacao anterior (evita conflito de assinatura)"
  & $adb -s $Serial uninstall $pkg 2>$null | Out-Null
  Info "Compilando + instalando dev client (expo run:android) - pode levar alguns minutos"
  Push-Location (Join-Path $root 'apps\mobile')
  $env:ANDROID_HOME = $sdk
  $env:ANDROID_SDK_ROOT = $sdk
  pnpm exec expo run:android
  Pop-Location
  Ok "Rebuild concluido - o app foi instalado e aberto."
  return
}

# --- 3b) Metro (dev server) -------------------------------------------------
$metroStatus = "http://127.0.0.1:$MetroPort/status"
if (Test-Http $metroStatus) {
  Ok "Metro ja esta rodando na porta $MetroPort"
} else {
  Info "Subindo Metro (janela separada)"
  Start-Process powershell -ArgumentList @(
    '-NoExit','-Command',
    "Set-Location '$root\apps\mobile'; `$env:ANDROID_HOME='$sdk'; Write-Host 'Metro PokeTche (porta $MetroPort)'; pnpm exec expo start --dev-client --port $MetroPort"
  ) | Out-Null
  Wait-Http $metroStatus "Metro" 30 | Out-Null
}

# --- 4) Pre-compila o bundle (evita timeout do dev client no 1o load) -------
Info "Pre-compilando o bundle Android (primeira vez demora ~20-60s)"
try {
  $manifest = Invoke-RestMethod "http://127.0.0.1:$MetroPort/" -TimeoutSec 20 -Headers @{
    'expo-platform' = 'android'
    'Accept'        = 'application/expo+json,application/json'
  }
  $bundleUrl = ($manifest.launchAsset.url) -replace '127\.0\.0\.1','localhost'
  Invoke-WebRequest $bundleUrl -TimeoutSec 400 -UseBasicParsing | Out-Null
  Ok "Bundle compilado e em cache"
} catch {
  Warn2 "Nao consegui pre-compilar o bundle (o app vai compilar sob demanda): $($_.Exception.Message)"
}

# --- 5) Abre o app apontando pro Metro --------------------------------------
Info "Abrindo o app no aparelho"
& $adb -s $Serial shell am force-stop $pkg | Out-Null
Start-Sleep 1
$devUrl = "poketche://expo-development-client/?url=http%3A%2F%2Flocalhost%3A$MetroPort"
& $adb -s $Serial shell am start -a android.intent.action.VIEW -d $devUrl $pkg | Out-Null

Write-Host ""
Ok "Tudo pronto! O PokeTche deve abrir no aparelho conectado."
Write-Host "   - API:   http://localhost:$ApiPort/health   (janela separada)"
Write-Host "   - Metro: http://localhost:$MetroPort         (janela separada)"
Write-Host "   - App:   $pkg em $Serial"
Write-Host ""
Write-Host "Dica: se aparecer um aviso do Android sobre 'compatibilidade 16 KB', toque em"
Write-Host "      'Nao mostrar de novo' - e apenas um aviso do dev build, o app funciona normal."
