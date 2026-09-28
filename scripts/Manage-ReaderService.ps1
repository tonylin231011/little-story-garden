param([ValidateSet('Status','Repair','Disable')][string]$Action='Status')
. (Join-Path $PSScriptRoot 'Reader-Service-Common.ps1')
$task = Get-ManagedReaderTask
if ($Action -eq 'Disable') {
    if ($task) {
        Disable-ScheduledTask -TaskName $readerTaskName | Out-Null
        Stop-ScheduledTask -TaskName $readerTaskName -ErrorAction SilentlyContinue
    }
    Stop-ManagedReaderProcesses
    if ($task) { Unregister-ScheduledTask -TaskName $readerTaskName -Confirm:$false }
    Write-Output 'Resident reader disabled. Books, audio and browser records are preserved.'
    exit 0
}
if ($Action -eq 'Repair') {
    if ($task) { Disable-ScheduledTask -TaskName $readerTaskName | Out-Null; Stop-ScheduledTask -TaskName $readerTaskName -ErrorAction SilentlyContinue }
    Stop-ManagedReaderProcesses
    & (Join-Path $PSScriptRoot 'Install-ReaderService.ps1') -NoBrowser
    exit $LASTEXITCODE
}
$health = Get-ReaderHealth
Write-Output ('URL: ' + $readerUrl + '/')
Write-Output ('Startup task: ' + $(if($task){$task.State}else{'Not installed'}))
Write-Output ('Web reader: ' + $(if($health){'Ready (PID ' + $health.pid + ')'}else{'Not responding'}))
if ($task) { Get-ScheduledTaskInfo -TaskName $readerTaskName | Select-Object LastRunTime,LastTaskResult,NextRunTime }
Write-Output ('Diagnostic logs: ' + $readerStateDir)
if (Test-Path -LiteralPath (Join-Path $readerStateDir 'status.json')) { Get-Content -LiteralPath (Join-Path $readerStateDir 'status.json') }
