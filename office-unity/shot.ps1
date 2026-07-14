# Roda só o DevShots (assume compile já ok). Garante backend up e sem Unity travado.
$ErrorActionPreference = 'Continue'
$unity = 'C:\Program Files\Unity\Hub\Editor\6000.5.2f1\Editor\Unity.exe'
$proj = 'C:\Users\prs\Claude Sessions\virtual-office\office-unity'
$logs = Join-Path $proj 'Logs'
$dll = 'C:\Users\prs\Claude Sessions\virtual-office\backend\VirtualOffice.Api\bin\Debug\net10.0\VirtualOffice.Api.dll'

# backend
try { Invoke-WebRequest 'http://localhost:5210/api/users' -UseBasicParsing -TimeoutSec 3 | Out-Null; Write-Output 'backend OK' }
catch {
  Start-Process -FilePath 'dotnet' -ArgumentList $dll, '--urls', 'http://localhost:5210' -WorkingDirectory (Split-Path $dll) -WindowStyle Hidden
  for ($i = 0; $i -lt 20; $i++) { Start-Sleep 2; try { Invoke-WebRequest 'http://localhost:5210/api/users' -UseBasicParsing -TimeoutSec 2 | Out-Null; Write-Output 'backend subiu'; break } catch {} }
}

# mata unity editor travado
Get-Process Unity -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*Hub\Editor*Unity.exe' } | ForEach-Object { Stop-Process -Id $_.Id -Force }
Start-Sleep 4

Get-ChildItem "$logs\shot-*.png" -ErrorAction SilentlyContinue | Remove-Item -Force
# NÃO usar -batchmode: em batchmode o editor encerra assim que -executeMethod retorna, antes do
# roteiro (loop de EditorApplication.update) rodar. Editor GUI mantém o loop vivo até Exit(0).
& $unity -projectPath $proj -executeMethod OfficeQuest.EditorTools.DevShots.Run -logFile "$logs\shots-run.log"
Write-Output "exit=$LASTEXITCODE"
Get-ChildItem "$logs\shot-*.png" -ErrorAction SilentlyContinue | Select-Object Name, @{n='KB';e={[int]($_.Length/1KB)}}
