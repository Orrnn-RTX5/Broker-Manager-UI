$ErrorActionPreference = 'Stop'
. 'D:\RTX\Broker-Backend-V2\scripts\local\env.ps1'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$logDir = 'D:\RTX-Support\dev-tools\runtime\logs\manager-ui'
New-Item -ItemType Directory -Force $logDir | Out-Null
$listener = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if ($existing.CommandLine -notlike '*rtx5-broker-manager-ui*node_modules*vite*') {
        throw 'Port 3000 is occupied by another application.'
    }
    Write-Host 'Manager UI is already running: http://localhost:3000'
    return
}
$node = (Get-Command node.exe).Source
$vite = Join-Path $repo 'node_modules\vite\bin\vite.js'
$process = Start-Process -FilePath $node -ArgumentList @($vite, '--mode', 'web', '--host', '127.0.0.1', '--port', '3000', '--strictPort') -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'stdout.log') -RedirectStandardError (Join-Path $logDir 'stderr.log') -PassThru
$process.Id | Set-Content (Join-Path $logDir 'server.pid')
Write-Host 'Manager UI: http://localhost:3000'
