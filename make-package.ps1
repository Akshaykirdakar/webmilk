# Builds the installation package for another computer:  D:\dairy\webmilk\deploy\MilkBilling  (+ MilkBilling.zip)
#   app\         the server, self-contained (no .NET needed): MilkBilling.Api.exe, appsettings.json, reports, crystal, gs
#   frontend\    the web pages
#   database\    01_recompile_objects.sql
#   install.bat  run once on the new computer (as Administrator)
# Usage: powershell -ExecutionPolicy Bypass -File make-package.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pkg  = Join-Path $root 'deploy\MilkBilling'
if (Test-Path $pkg) { Remove-Item $pkg -Recurse -Force }
New-Item -ItemType Directory -Force $pkg | Out-Null

Write-Host 'Publishing the server ...'
dotnet publish (Join-Path $root 'backend\MilkBilling.Api') -c Release -r win-x64 --self-contained true -o (Join-Path $pkg 'app') --nologo -v q
if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed' }

Write-Host 'Copying pages, database script, Ghostscript ...'
Copy-Item (Join-Path $root 'frontend') (Join-Path $pkg 'frontend') -Recurse
Copy-Item (Join-Path $root 'backend\database') (Join-Path $pkg 'database') -Recurse
$gsBin = 'C:\Program Files\gs\gs10.07.0\bin'
if (Test-Path $gsBin) { New-Item -ItemType Directory -Force (Join-Path $pkg 'app\gs') | Out-Null; Copy-Item "$gsBin\gswin64c.exe", "$gsBin\gsdll64.dll" (Join-Path $pkg 'app\gs') }
# the DVB Marathi fonts the reports use (from the Fontmap), installed by install.ps1 when missing
New-Item -ItemType Directory -Force (Join-Path $pkg 'fonts') | Out-Null
Get-Content (Join-Path $root 'backend\MilkBilling.Api\crystal\Fontmap') | Where-Object { $_ -match '^/DVB' -and $_ -match '\((.+)\)' } |
  ForEach-Object { $Matches[1] -replace '/', '\' } | Select-Object -Unique | Where-Object { Test-Path $_ } | ForEach-Object { Copy-Item $_ (Join-Path $pkg 'fonts') }
foreach ($f in 'start-milkbilling.ps1', 'make-desktop-shortcut.ps1', 'Milk-Billing.bat') { Copy-Item (Join-Path $root $f) $pkg }
foreach ($f in 'install.bat', 'install.ps1', 'INSTALL-MARATHI.txt') { Copy-Item (Join-Path $root "package\$f") $pkg }

# settings for the package: pages one folder up, Ghostscript shipped with the program
$cfgFile = Join-Path $pkg 'app\appsettings.json'
$cfg = Get-Content $cfgFile -Raw -Encoding UTF8 | ConvertFrom-Json
$cfg.Frontend.Path = '..\frontend'
$cfg.Crystal.Ghostscript = 'gs\gswin64c.exe'
$cfg | ConvertTo-Json -Depth 10 | Set-Content $cfgFile -Encoding UTF8

$zip = Join-Path $root 'deploy\MilkBilling.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $pkg -DestinationPath $zip
$mb = [math]::Round((Get-Item $zip).Length / 1MB)
Write-Host ''
Write-Host "Package ready: $pkg"
Write-Host "Zip (copy this to the other computer): $zip  ($mb MB)"
