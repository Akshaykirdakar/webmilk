# Milk Billing - installs the program on this computer, using the Oracle database that is already here.
# Run through install.bat (as Administrator). Safe to run again.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$app  = Join-Path $root 'app'
$exe  = Join-Path $app 'MilkBilling.Api.exe'
$cfgFile = Join-Path $app 'appsettings.json'
function Ok($m)   { Write-Host "  [OK]   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [!!]   $m" -ForegroundColor Yellow }
function Step($m) { Write-Host ''; Write-Host $m -ForegroundColor Cyan }

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Warn 'Not running as Administrator: the firewall rule cannot be added. Right-click install.bat > Run as administrator.' }

$cfg = Get-Content $cfgFile -Raw -Encoding UTF8 | ConvertFrom-Json
$conn = $cfg.ConnectionStrings.Oracle
$user = if ($conn -match 'User Id=([^;]+)') { $Matches[1] } else { 'bgk' }
$pass = if ($conn -match 'Password=([^;]+)') { $Matches[1] } else { 'bgk' }
$ds   = if ($conn -match 'Data Source=([^;]+)') { $Matches[1] } else { 'localhost:1521/XE' }

Step "1. Database connection (appsettings.json):  $user@$ds"
$svc = Get-Service 'OracleServiceXE' -ErrorAction SilentlyContinue
if ($svc) { if ($svc.Status -eq 'Running') { Ok 'OracleServiceXE is running' } else { Warn "OracleServiceXE is $($svc.Status) - start it (services.msc)" } }
else { Warn 'OracleServiceXE not found. If the database is on another computer or has another name, edit ConnectionStrings:Oracle in app\appsettings.json' }

Step '2. Database procedures (recompile after a backup restore)'
$sqlplus = (Get-Command sqlplus.exe -ErrorAction SilentlyContinue).Source
if (-not $sqlplus) { $sqlplus = Get-ChildItem 'C:\oraclexe' -Recurse -Filter sqlplus.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName }
if ($sqlplus) {
  $env:NLS_LANG = 'AMERICAN_AMERICA.AL32UTF8'   # 03 holds DVB text
  foreach ($sql in '01_recompile_objects.sql', '02_rate_chart_fix.sql', '03_ledger_same_calc.sql', '04_sms_queue.sql') {
    $out = 'exit' | & $sqlplus -S "$user/$pass@$ds" "@$(Join-Path $root "database\$sql")" 2>&1
    if ($LASTEXITCODE -eq 0) { Ok "$sql done" } else { Warn "$($sql): $($out | Select-Object -Last 3)" }
  }
} else { Warn 'sqlplus not found - run database\01_recompile_objects.sql once with SQL*Plus' }

Step '3. Crystal Reports (printing of the original .rpt reports)'
$crystal = Test-Path 'Registry::HKEY_CLASSES_ROOT\CrystalRuntime.Application.8.5'
if ($crystal) { Ok 'Crystal Reports 8.5 runtime installed' } else { Warn 'Crystal Reports 8.5 runtime NOT found: install it (the same setup used for the VB program), otherwise reports cannot be printed' }
$oraHome = Get-ChildItem 'C:\oraclexe\app\oracle\product' -Directory -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'server' } | Where-Object { Test-Path "$_\bin" } | Select-Object -First 1
if ($oraHome) {
  $cfg.Crystal.OracleBin = "$oraHome\bin"; $cfg.Crystal.TnsAdmin = "$oraHome\network\ADMIN"
  Ok "Oracle home: $oraHome"
  $tns = Join-Path $oraHome 'network\ADMIN\tnsnames.ora'
  if ((Test-Path $tns) -and (Select-String -Path $tns -Pattern "^\s*$($cfg.Crystal.Server)\b" -Quiet)) { Ok "TNS name '$($cfg.Crystal.Server)' found" }
  else { Warn "TNS name '$($cfg.Crystal.Server)' missing in $tns - add it (copy the entry from the old computer), reports use it" }
} else { Warn 'Oracle XE home not found under C:\oraclexe: set Crystal:OracleBin / TnsAdmin in app\appsettings.json' }
if (Test-Path (Join-Path $app 'gs\gswin64c.exe')) { Ok 'Ghostscript (included)' } else { Warn 'Ghostscript missing in app\gs' }
$cfg | ConvertTo-Json -Depth 10 | Set-Content $cfgFile -Encoding UTF8

Step '4. Marathi fonts (DVB-TT) for the reports'
$have = Get-ChildItem "$env:windir\Fonts" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
$fontmap = Get-Content (Join-Path $app 'crystal\Fontmap') -ErrorAction SilentlyContinue | Where-Object { $_ -match '^/DVB' } |
  ForEach-Object { if ($_ -match '\((.+)\)') { $Matches[1] -replace '/', '\' } } | Select-Object -Unique
$missing = @($fontmap | Where-Object { -not (Test-Path $_) })
if ($missing.Count -eq 0) { Ok 'DVB fonts present' }
else {
  # the package carries the fonts (fonts\): install them into Windows for Crystal / Ghostscript
  $src = Join-Path $root 'fonts'
  foreach ($m in $missing) {
    $f = Join-Path $src (Split-Path $m -Leaf)
    if ((Test-Path $f) -and $admin) {
      Copy-Item $f $m -ErrorAction SilentlyContinue
      New-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts' -Name "$([IO.Path]::GetFileNameWithoutExtension($m)) (TrueType)" -Value (Split-Path $m -Leaf) -Force -ErrorAction SilentlyContinue | Out-Null
    }
  }
  $still = @($missing | Where-Object { -not (Test-Path $_) })
  if ($still.Count -eq 0) { Ok 'DVB fonts installed' } else { Warn "Install these fonts (ISM / DVB): $($still -join ', ')" }
}

Step '5. Network access for phones and other PCs (port 5080)'
if ($admin) {
  netsh advfirewall firewall delete rule name="Milk Billing 5080" >$null 2>&1
  netsh advfirewall firewall add rule name="Milk Billing 5080" dir=in action=allow protocol=TCP localport=5080 profile=any >$null
  Ok 'firewall rule "Milk Billing 5080" added'
} else { Warn 'firewall rule not added (needs Administrator)' }
$ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^(127|169\.254)\.' -and $_.InterfaceAlias -notmatch 'vEthernet|Loopback' } | Select-Object -First 1 -ExpandProperty IPAddress

Step '6. Desktop icon and automatic start'
& (Join-Path $root 'make-desktop-shortcut.ps1') | ForEach-Object { Ok $_ }
$startup = [Environment]::GetFolderPath('Startup')
$s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup 'Milk Billing Server.lnk'))
$s.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$s.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$root\start-milkbilling.ps1`" -NoBrowser"
$s.WorkingDirectory = $root; $s.WindowStyle = 7; $s.Save()
Ok 'server starts by itself when Windows starts (phones can connect without opening the program)'

Step '7. Starting the server and testing'
& (Join-Path $root 'start-milkbilling.ps1') -NoBrowser
try { $h = Invoke-RestMethod 'http://localhost:5080/api/health' -TimeoutSec 10 } catch { $h = $null }
if ($h -and $h.db) { Ok 'server running, database connected' }
elseif ($h) { Warn 'server running but the DATABASE does not answer: check ConnectionStrings:Oracle in app\appsettings.json and that Oracle is started' }
else { Warn "server did not start: run `"$exe`" in a Command Prompt to see the error" }

Write-Host ''
Write-Host 'Done.' -ForegroundColor Cyan
Write-Host '  This computer : double-click the "Milk Billing" icon on the desktop (login admin / admin@123)'
if ($ip) { Write-Host "  Phones / PCs  : http://$($ip):5080" }
