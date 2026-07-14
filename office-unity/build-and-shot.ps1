# Compila em batch; se limpo, roda DevShots para capturar screenshots.
$ErrorActionPreference = 'Continue'
$unity = 'C:\Program Files\Unity\Hub\Editor\6000.5.2f1\Editor\Unity.exe'
$proj = 'C:\Users\prs\Claude Sessions\virtual-office\office-unity'
$logs = Join-Path $proj 'Logs'
Get-ChildItem "$logs\shot-*.png" -ErrorAction SilentlyContinue | Remove-Item -Force

& $unity -batchmode -nographics -quit -projectPath $proj -logFile "$logs\batch-clean.log"
$errs = Select-String -Path "$logs\batch-clean.log" -Pattern 'error CS\d+' | ForEach-Object Line | Sort-Object -Unique
if ($errs) {
    Write-Output 'COMPILE_ERROS'
    $errs | Select-Object -First 12
    exit 1
}
Write-Output 'COMPILE_LIMPO'
# espera a instância de compilação soltar o lock do projeto
Start-Sleep -Seconds 6
& $unity -projectPath $proj -executeMethod OfficeQuest.EditorTools.DevShots.Run -logFile "$logs\shots-clean.log"
Write-Output "SHOTS_EXIT=$LASTEXITCODE"
Get-ChildItem "$logs\shot-*.png" -ErrorAction SilentlyContinue | Select-Object Name
