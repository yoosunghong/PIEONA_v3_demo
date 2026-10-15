param([switch]$NoTunnel,[switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot
New-Item -ItemType Directory -Path (Join-Path $projectRoot 'logs') -Force | Out-Null
if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
if (-not (Test-Path -LiteralPath 'node_modules')) { & npm.cmd install --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' } }
if (-not $SkipBuild -or -not (Test-Path -LiteralPath 'dist/index.html')) { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Build failed.' } }
$portValue = 3000
Get-Content -LiteralPath '.env' | ForEach-Object { if ($_ -match '^PORT=(\d+)$') { $portValue = [int]$Matches[1] } }
$localUrl = "http://127.0.0.1:$portValue"
$health = $null
try { $health = Invoke-RestMethod -Uri "$localUrl/api/health" -TimeoutSec 3 } catch { }
$nodePath = (Get-Command node.exe).Source
if (-not $health.ok -or $health.app -ne 'pieona') {
  $serverEntry = Join-Path $projectRoot 'scripts/run-server.mjs'
  $serverProcess = Start-Process -FilePath $nodePath -ArgumentList @("`"$serverEntry`"") -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot 'logs/server.log') -RedirectStandardError (Join-Path $projectRoot 'logs/server-error.log') -PassThru
  $serverProcess.Id | Set-Content -LiteralPath 'logs/server.pid'
  for ($attempt = 0; $attempt -lt 20; $attempt++) { Start-Sleep -Milliseconds 400; try { $health = Invoke-RestMethod -Uri "$localUrl/api/health" -TimeoutSec 2; if ($health.ok) { break } } catch { } }
  if (-not $health.ok -or $health.app -ne 'pieona') { throw 'Server failed to start. See logs/server-error.log.' }
}
Write-Host "PIEONA server ready: $localUrl (AI: $($health.ai))"
if (-not $NoTunnel) {
  $tunnelEntry = Join-Path $projectRoot 'scripts/run-tunnel.mjs'
  $tunnelRunning = $false
  if (Test-Path -LiteralPath 'logs/tunnel.pid') { $previousId = [int](Get-Content -LiteralPath 'logs/tunnel.pid'); $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$previousId" -ErrorAction SilentlyContinue; $tunnelRunning = $processInfo -and $processInfo.CommandLine.Contains($tunnelEntry) }
  if (-not $tunnelRunning) {
    $tunnelProcess = Start-Process -FilePath $nodePath -ArgumentList @("`"$tunnelEntry`"") -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot 'logs/tunnel.log') -RedirectStandardError (Join-Path $projectRoot 'logs/tunnel-error.log') -PassThru
    $tunnelProcess.Id | Set-Content -LiteralPath 'logs/tunnel.pid'
    Start-Sleep -Milliseconds 1500
    if ($tunnelProcess.HasExited) { throw 'Tunnel failed to start. See logs/tunnel-error.log.' }
  }
  Write-Host 'Cloudflare Tunnel started: https://pieona.yoosung.dev'
}
