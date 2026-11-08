# Prints one of the original Crystal Reports (.rpt) to PDF with the Crystal Reports 8.5 runtime (the same engine
# the VB6 program used through Crystl32.ocx). Must run in 32-bit PowerShell (C:\Windows\SysWOW64\...).
# Called by the API: powershell -File crexport.ps1 -job <job.json>
#   job.json = { rpt, out, selection, server, user, password, oracleBin, tnsAdmin, params: [ { name, type, value } ] }
param([Parameter(Mandatory = $true)][string]$job)
$ErrorActionPreference = 'Stop'
try {
  $j = Get-Content -Raw -Encoding UTF8 $job | ConvertFrom-Json
  if ($j.oracleBin) { $env:PATH = $j.oracleBin + ';' + $env:PATH }
  if ($j.tnsAdmin) { $env:TNS_ADMIN = $j.tnsAdmin }

  $app = New-Object -ComObject CrystalRuntime.Application.8.5
  $r = $app.OpenReport($j.rpt, 1)
  # every table (and sub report table) logs on to the same Oracle database
  foreach ($t in $r.Database.Tables) { $t.SetLogOnInfo($j.server, '', $j.user, $j.password) }
  foreach ($sec in $r.Sections) {
    foreach ($o in $sec.ReportObjects) {
      if ($o.Kind -eq 5) { # crSubreportObject
        $sub = $r.OpenSubreport($o.SubreportName)
        foreach ($t in $sub.Database.Tables) { $t.SetLogOnInfo($j.server, '', $j.user, $j.password) }
      }
    }
  }
  $r.EnableParameterPrompting = $false
  $r.DiscardSavedData()
  if ($j.selection) { $r.RecordSelectionFormula = [string]$j.selection }
  if ($null -ne $j.title) { $r.ReportTitle = [string]$j.title }
  foreach ($p in $r.ParameterFields) {
    $v = $j.params | Where-Object { $_.name -eq $p.ParameterFieldName } | Select-Object -First 1
    if ($null -eq $v) { continue }
    switch ($v.type) {
      'date'   { $p.AddCurrentValue([datetime]::ParseExact([string]$v.value, 'yyyy-MM-dd', $null)) }
      'number' { $p.AddCurrentValue([double]$v.value) }
      default  { $p.AddCurrentValue([string]$v.value) }
    }
  }
  $r.ExportOptions.FormatType = 31        # crEFTPortableDocFormat
  $r.ExportOptions.DestinationType = 1    # crEDTDiskFile
  $r.ExportOptions.DiskFileName = $j.out
  $r.Export($false)
  'OK'
  exit 0
} catch {
  'ERROR: ' + $_.Exception.Message
  exit 1
}
