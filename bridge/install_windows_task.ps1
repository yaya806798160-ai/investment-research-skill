param(
  [string]$Python = "python",
  [string]$TaskName = "InvestmentOS-LiveBridge"
)
$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Collector = Join-Path $Repo "bridge\collector.py"
$Server = Join-Path $Repo "app\server.py"

if (-not (Test-Path $Collector)) { throw "collector.py not found: $Collector" }
if (-not (Test-Path $Server)) { throw "server.py not found: $Server" }

# Start Investment OS proxy at logon if it is not already running.
$startupTask = "$TaskName-Proxy"
$proxyCmd = "cmd /c start \"\" /min $Python `"$Server`""
schtasks /Create /TN $startupTask /SC ONLOGON /TR $proxyCmd /F | Out-Null

# Refresh every 5 minutes. collector.py exits immediately outside A-share trading windows.
$collectCmd = "cmd /c cd /d `"$Repo`" ^&^& $Python `"$Collector`""
schtasks /Create /TN $TaskName /SC MINUTE /MO 5 /TR $collectCmd /F | Out-Null

# Run proxy now and perform a forced test snapshot + push.
try {
  $null = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8080/" -TimeoutSec 2
} catch {
  Start-Process -WindowStyle Minimized -FilePath $Python -ArgumentList @($Server)
  Start-Sleep -Seconds 2
}

& $Python $Collector --force --push
if ($LASTEXITCODE -ne 0) { throw "collector test failed with exit code $LASTEXITCODE" }

Write-Host "OK: $TaskName installed; 5-minute collector active; test snapshot pushed."
Write-Host "Verify: bridge\live\latest.json and bridge\logs\collector.log"
