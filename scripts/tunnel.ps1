$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
& node.exe scripts/run-tunnel.mjs
exit $LASTEXITCODE
