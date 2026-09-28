$ErrorActionPreference = 'Stop'
$readerRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$readerIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$readerSid = $readerIdentity.User.Value
$readerTaskName = 'LittleStoryGarden-' + $readerSid
$readerDescription = 'Little Story Garden managed local reader | ' + $readerRoot
$readerServiceScript = Join-Path $PSScriptRoot 'Run-ReaderService.ps1'
$readerStateDir = Join-Path $readerRoot '.runtime\reader-4173'
$readerUrl = 'http://127.0.0.1:4173'

function Get-ManagedReaderTask {
    $task = Get-ScheduledTask -TaskName $readerTaskName -ErrorAction SilentlyContinue
    if ($task -and $task.Description -ne $readerDescription) {
        throw 'A managed reader from another folder is installed. Disable that installation before changing folders.'
    }
    return $task
}
function Get-ReaderHealth {
    try {
        $health = Invoke-RestMethod -Uri ($readerUrl + '/api/health') -TimeoutSec 2
        if ($health.service -eq 'little-story-garden') { return $health }
    } catch { return $null }
    return $null
}
function Wait-ReaderReady {
    for ($attempt=0; $attempt -lt 35; $attempt++) {
        if (Get-ReaderHealth) { return }
        Start-Sleep -Milliseconds 500
    }
    throw ('Reader not ready. See ' + (Join-Path $readerStateDir 'events.log'))
}
function Stop-ManagedReaderProcesses {
    # Exact script paths prevent touching Node processes belonging to other apps.
    $supervisorScript = Join-Path $readerRoot 'server\reader-supervisor.mjs'
    $serverScript = Join-Path $readerRoot 'server.mjs'
    foreach ($script in @($supervisorScript, $serverScript)) {
        Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
            $_.CommandLine -and $_.CommandLine -match ([regex]::Escape($script) + '(?:"|\s|$)')
        } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
    }
}
