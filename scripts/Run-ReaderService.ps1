param([Parameter(Mandatory=$true)][string]$NodeExecutable)
$ErrorActionPreference = 'Stop'
$readerServiceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $readerServiceRoot
$env:PORT = '4173'
# Task Scheduler owns this hidden process; returning the child exit code enables recovery.
& $NodeExecutable (Join-Path $readerServiceRoot 'server\reader-supervisor.mjs')
exit $LASTEXITCODE
