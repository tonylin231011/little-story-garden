param([switch]$NoBrowser)
. (Join-Path $PSScriptRoot 'Reader-Service-Common.ps1')
$readerNode = Get-Command node -ErrorAction Stop
$existing = Get-ManagedReaderTask
$powerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -NodeExecutable "{1}"' -f $readerServiceScript, $readerNode.Source
$action = New-ScheduledTaskAction -Execute $powerShellExe -Argument $arguments -WorkingDirectory $readerRoot
$triggers = @(
    (New-ScheduledTaskTrigger -AtLogOn -User $readerSid),
    (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1))
)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -Hidden
$principal = New-ScheduledTaskPrincipal -UserId $readerSid -LogonType Interactive -RunLevel Limited
$definition = New-ScheduledTask -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description $readerDescription
Register-ScheduledTask -TaskName $readerTaskName -InputObject $definition -Force | Out-Null
Start-ScheduledTask -TaskName $readerTaskName
Wait-ReaderReady
Write-Output 'Installed: starts at Windows sign-in, recovers after failure, and stays on while using battery power.'
Write-Output ('Reader ready: ' + $readerUrl + '/')
if (-not $NoBrowser) { Start-Process ($readerUrl + '/') }
