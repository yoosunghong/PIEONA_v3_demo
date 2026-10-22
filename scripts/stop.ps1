$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
foreach ($kind in @('console','server','tunnel')) {
  $pidPath = Join-Path $projectRoot "logs/$kind.pid"
  if (-not (Test-Path -LiteralPath $pidPath)) { continue }
  $ownedId = 0
  if (-not [int]::TryParse((Get-Content -LiteralPath $pidPath -Raw).Trim(), [ref]$ownedId) -or $ownedId -le 0) { throw "Invalid PID file: $pidPath" }
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$ownedId"
  $expectedEntry = if ($kind -eq 'console') { Join-Path $projectRoot 'scripts/start.ps1' } else { Join-Path $projectRoot "scripts/run-$kind.mjs" }
  $expectedName = if ($kind -eq 'console') { 'powershell.exe' } else { 'node.exe' }
  if ($processInfo -and $processInfo.Name -eq $expectedName -and $processInfo.CommandLine.Contains($expectedEntry)) {
    # Stop child cloudflared before its Node launcher. Only stop this launcher's direct children.
    if ($kind -eq 'tunnel') { Get-CimInstance Win32_Process -Filter "ParentProcessId=$ownedId" | Where-Object { $_.Name -eq 'cloudflared.exe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue } }
    Stop-Process -Id $ownedId -ErrorAction SilentlyContinue
    Wait-Process -Id $ownedId -Timeout 10 -ErrorAction SilentlyContinue
    Write-Host "Stopped PIEONA $kind."
  }
  if (Test-Path -LiteralPath $pidPath) { Remove-Item -LiteralPath $pidPath }
}
