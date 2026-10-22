param([switch]$NoTunnel,[switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot
try {
  Add-Type -Path (Join-Path $PSScriptRoot 'console-lifetime.cs')
  [PieonaConsoleLifetime]::Attach($projectRoot)
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
  New-Item -ItemType Directory -Path (Join-Path $projectRoot 'logs') -Force | Out-Null
  if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
  if (-not (Test-Path -LiteralPath 'node_modules')) {
    & npm.cmd install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
  }
  if (-not $SkipBuild -or -not (Test-Path -LiteralPath 'dist/index.html')) {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
  }
  $PID | Set-Content -LiteralPath (Join-Path $projectRoot 'logs/console.pid')
  Write-Host 'Keep this window open. Closing it stops PIEONA and its tunnel.'
  $serveArgs = @((Join-Path $PSScriptRoot 'serve.mjs'))
  if ($NoTunnel) { $serveArgs += '--no-tunnel' }
  & node.exe @serveArgs
  $result = $LASTEXITCODE
} catch {
  Write-Error $_ -ErrorAction Continue
  $result = 1
} finally {
  $pidFile = Join-Path $projectRoot 'logs/console.pid'
  if ((Test-Path -LiteralPath $pidFile) -and (Get-Content -LiteralPath $pidFile) -eq "$PID") { Remove-Item -LiteralPath $pidFile }
}
exit $result
