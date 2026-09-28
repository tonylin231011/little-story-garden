param([switch]$NoBrowser)
. (Join-Path $PSScriptRoot 'scripts\Reader-Service-Common.ps1')
$readerTask = Get-ManagedReaderTask
if (-not $readerTask) {
    & (Join-Path $readerRoot 'scripts\Install-ReaderService.ps1') -NoBrowser
} else {
    if ($readerTask.State -eq 'Disabled') { Enable-ScheduledTask -TaskName $readerTaskName | Out-Null }
    Start-ScheduledTask -TaskName $readerTaskName
    Wait-ReaderReady
}
Write-Output ('Reader ready: ' + $readerUrl + '/')
if (-not $NoBrowser) { Start-Process ($readerUrl + '/') }
