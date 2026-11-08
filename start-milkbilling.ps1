# Desktop icon "Milk Billing": starts the server if it is not running yet, then opens the program
# full screen (no browser bars). The server keeps running (minimized "Milk Billing Server" window) for the
# phones and other PCs; close that window to stop it.
param([string]$Server = 'http://localhost:5080', [switch]$NoBrowser)   # -NoBrowser: only start the server (Windows startup)
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
# installed package: app\MilkBilling.Api.exe;  development folder: backend\MilkBilling.Api\bin\Release
if (Test-Path (Join-Path $root 'app\MilkBilling.Api.exe')) { $api = Join-Path $root 'app'; $exe = Join-Path $api 'MilkBilling.Api.exe' }
else { $api = Join-Path $root 'backend\MilkBilling.Api'; $exe = Join-Path $api 'bin\Release\net8.0\MilkBilling.Api.exe' }

function Test-Server { try { (Invoke-WebRequest "$Server/api/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch { $false } }

if ($Server -match 'localhost|127\.0\.0\.1' -and -not (Test-Server)) {
  if (Test-Path $exe) {
    # working directory = project folder: appsettings.json, reports, crystal and ..\..\frontend are found from there
    Start-Process -FilePath $exe -WorkingDirectory $api -WindowStyle Minimized
  } else {
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "title Milk Billing Server && cd /d `"$api`" && dotnet run -c Release --no-launch-profile" -WindowStyle Minimized
  }
  $until = (Get-Date).AddSeconds(120)
  while (-not (Test-Server) -and (Get-Date) -lt $until) { Start-Sleep -Milliseconds 700 }
  if (-not (Test-Server)) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("Milk Billing server did not start.`nStart $exe in a Command Prompt to see the error.", 'Milk Billing') | Out-Null
    exit 1
  }
}

if ($NoBrowser) { exit 0 }
$browser = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
Start-Process -FilePath $browser -ArgumentList "--app=$Server", '--start-fullscreen', "--user-data-dir=`"$env:LOCALAPPDATA\MilkBillingBrowser`""
