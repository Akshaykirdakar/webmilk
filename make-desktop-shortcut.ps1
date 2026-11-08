# Creates a "Milk Billing" icon on the desktop that opens the program full screen (no browser bars).
# On the server PC the icon also starts the server when it is not running (start-milkbilling.ps1).
# Run once on each computer:  powershell -ExecutionPolicy Bypass -File make-desktop-shortcut.ps1 [-Server http://192.168.1.10:5080]
param([string]$Server = 'http://localhost:5080')
$browser = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Write-Error 'Chrome or Edge not found'; exit 1 }
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Milk Billing.lnk'
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$s.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$here\start-milkbilling.ps1`" -Server $Server"
$s.WorkingDirectory = $here
$s.WindowStyle = 7
$s.IconLocation = "$browser,0"
$s.Description = 'Milk Billing System'
$s.Save()
"Shortcut created: $lnk  ->  $Server"
