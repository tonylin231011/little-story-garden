# Integration check for an installed resident reader. Briefly stops ONLY this reader's processes.
$ErrorActionPreference = 'Stop'
$testRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $testRoot 'scripts\Reader-Service-Common.ps1')
$checks = New-Object System.Collections.Generic.List[object]
function Passed($name,$seconds=0) { $checks.Add(@{check=$name;seconds=$seconds}); Write-Output ('PASS ' + $name) }
function Wait-Recovered($oldServer,$oldSupervisor=0,$limit=30) {
    $watch=[Diagnostics.Stopwatch]::StartNew()
    while ($watch.Elapsed.TotalSeconds -lt $limit) {
        $health=Get-ReaderHealth
        try { $state=Get-Content -LiteralPath (Join-Path $readerStateDir 'status.json') -Raw | ConvertFrom-Json } catch { $state=$null }
        if ($health -and $health.pid -ne $oldServer -and $state -and $state.state -eq 'ready' -and (!$oldSupervisor -or $state.supervisorPid -ne $oldSupervisor) -and $state.serverPid -eq $health.pid) { return [Math]::Round($watch.Elapsed.TotalSeconds,2) }
        Start-Sleep -Milliseconds 300
    }
    throw 'The installed reader did not recover within the allowed time. Check .runtime logs.'
}
function Verified-Process($id,$script) {
    $process=Get-CimInstance Win32_Process -Filter "ProcessId = $id"
    if (!$process -or $process.Name -ne 'node.exe' -or $process.CommandLine -notmatch ([regex]::Escape($script)+'(?:"|\s|$)')) { throw 'Refusing to stop an unverified process.' }
    return $process
}
$task=Get-ManagedReaderTask
if (!$task) { throw 'Install the resident reader before running this test.' }
[xml]$xml=Export-ScheduledTask -TaskName $readerTaskName
if (!$xml.Task.Triggers.LogonTrigger -or $xml.Task.Triggers.TimeTrigger.Repetition.Interval -ne 'PT1M' -or $xml.Task.Settings.ExecutionTimeLimit -ne 'PT0S' -or $xml.Task.Settings.MultipleInstancesPolicy -ne 'IgnoreNew' -or $xml.Task.Settings.DisallowStartIfOnBatteries -ne 'false' -or $xml.Task.Settings.StopIfGoingOnBatteries -ne 'false') { throw 'Automatic startup/recovery configuration is incomplete.' }
Passed 'Windows sign-in trigger, recurring recovery, single instance, unlimited runtime and battery settings verified'
$before=Get-ReaderHealth
if (!$before) { throw 'Reader is not healthy before the recovery test.' }
& (Join-Path $testRoot 'Start-Reader.ps1') -NoBrowser | Out-Null
Start-Sleep -Milliseconds 400
if ((Get-ReaderHealth).pid -ne $before.pid) { throw 'Repeated launch replaced the healthy process.' }
Passed 'Repeated launcher invocation reuses the healthy reader'
$state=Get-Content -LiteralPath (Join-Path $readerStateDir 'status.json') -Raw | ConvertFrom-Json
[void](Verified-Process $before.pid (Join-Path $testRoot 'server.mjs'))
Stop-Process -Id $before.pid
$elapsed=Wait-Recovered $before.pid
Passed 'Reader process crash automatically recovers with a new healthy process' $elapsed
$before=Get-ReaderHealth
$state=Get-Content -LiteralPath (Join-Path $readerStateDir 'status.json') -Raw | ConvertFrom-Json
[void](Verified-Process $before.pid (Join-Path $testRoot 'server.mjs'))
[void](Verified-Process $state.supervisorPid (Join-Path $testRoot 'server\reader-supervisor.mjs'))
Stop-Process -Id $state.supervisorPid
Start-Sleep -Seconds 2
if (Get-Process -Id $before.pid -ErrorAction SilentlyContinue) { throw 'Reader became an orphan after its supervisor exited.' }
Passed 'Reader exits when its supervisor disappears, leaving no orphan process on the port'
Write-Output 'Waiting for Windows recovery after the supervisor process was stopped...'
$elapsed=Wait-Recovered $before.pid $state.supervisorPid 85
Passed 'Windows automatically recovers the supervisor and reader without manual restart' $elapsed
$page=Invoke-WebRequest -Uri ($readerUrl+'/') -UseBasicParsing -TimeoutSec 3
if ($page.StatusCode -ne 200 -or $page.Content -notmatch 'Little Story Garden') { throw 'Recovered reader did not serve the page.' }
Passed 'Recovered reader serves the original local URL'
$checks | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'service-recovery-results.json') -Encoding UTF8
