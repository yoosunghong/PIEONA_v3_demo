$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
foreach ($kind in @('server','tunnel')) {
  $pidPath = Join-Path $projectRoot "logs/$kind.pid"
  if (-not (Test-Path -LiteralPath $pidPath)) { continue }
  $ownedId = [int](Get-Content -LiteralPath $pidPath)
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$ownedId" -ErrorAction SilentlyContinue
  $expectedEntry = Join-Path $projectRoot "scripts/run-$kind.mjs"
  if ($processInfo -and $processInfo.CommandLine.Contains($expectedEntry)) {
    # Stop child cloudflared before its Node launcher. Only stop this launcher's direct children.
    if ($kind -eq 'tunnel') { Get-CimInstance Win32_Process -Filter "ParentProcessId=$ownedId" | Where-Object { $_.Name -eq 'cloudflared.exe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue } }
    Stop-Process -Id $ownedId -ErrorAction SilentlyContinue
    Write-Host "Stopped PIEONA $kind."
  }
  Remove-Item -LiteralPath $pidPath
}
