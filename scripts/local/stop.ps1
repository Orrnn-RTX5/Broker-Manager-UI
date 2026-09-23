$ErrorActionPreference = 'Stop'
$pidFile = 'D:\RTX-Support\dev-tools\runtime\logs\manager-ui\server.pid'
if (Test-Path $pidFile) {
    $serverPid = [int](Get-Content $pidFile)
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid" -ErrorAction SilentlyContinue
    if ($process -and $process.CommandLine -like '*rtx5-broker-manager-ui*node_modules*vite*') {
        Stop-Process -Id $serverPid
    }
}
