param(
    [string]$Reference = 'ArtSource/Characters/Piona/piona-front-prepared.png',
    [int]$MaxCredits = 30,
    [switch]$Generate
)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path (Split-Path $PSScriptRoot)
Push-Location $projectRoot
try {
    $cli=Join-Path $PSScriptRoot 'node_modules/.bin/meshy.cmd'
    if (!(Test-Path -LiteralPath $cli)) { throw 'Run npm ci --prefix Tools/Meshy first.' }
    if (!(Test-Path -LiteralPath $Reference)) { throw 'Reference image is missing.' }
    if (!$Generate) {
        & $cli make $Reference --dry-run --max-credits $MaxCredits --no-update-check
    } else {
        $destination=Join-Path $projectRoot ('ArtSource/Characters/Piona/Meshy-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
        & $cli make $Reference --max-credits $MaxCredits --timeout 600 --output $destination --no-update-check
    }
    if ($LASTEXITCODE -ne 0) { throw "Meshy exited with code $LASTEXITCODE" }
} finally { Pop-Location }
