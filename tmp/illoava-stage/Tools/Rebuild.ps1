param(
    [string]$Source = 'D:/Github/PIEONA_v3_prototype',
    [string]$Unity = 'C:/Program Files/Unity/Hub/Editor/6000.6.6f1/Editor/Unity.exe',
    [string]$Blender = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe',
    [switch]$BuildPlayer
)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot
Push-Location $projectRoot
try {
    node Tools/Migration/export-environment.mjs $Source $projectRoot
    if($LASTEXITCODE -ne 0){throw 'Environment export failed'}
    & $Blender --background --python Tools/Blender/build_piona.py -- $projectRoot
    if($LASTEXITCODE -ne 0){throw 'Blender authoring failed'}
    $sceneRun=Start-Process -FilePath $Unity -ArgumentList @('-batchmode','-quit','-force-d3d11','-projectPath',('"'+$projectRoot+'"'),'-executeMethod','Illoava.Editor.MigrationBuilder.Build','-logFile',('"'+$projectRoot+'/Logs/MigrationBuild.log"')) -WindowStyle Hidden -Wait -PassThru
    if($sceneRun.ExitCode -ne 0){throw 'Unity scene build failed; see Logs/MigrationBuild.log'}
    if($BuildPlayer){
        $playerRun=Start-Process -FilePath $Unity -ArgumentList @('-batchmode','-quit','-force-d3d11','-projectPath',('"'+$projectRoot+'"'),'-executeMethod','Illoava.Editor.MigrationBuilder.BuildPlayer','-logFile',('"'+$projectRoot+'/Logs/PlayerBuild.log"')) -WindowStyle Hidden -Wait -PassThru
        if($playerRun.ExitCode -ne 0){throw 'Player build failed; see Logs/PlayerBuild.log'}
    }
} finally { Pop-Location }
