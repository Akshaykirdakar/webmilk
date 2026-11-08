# Reads the design of one Crystal report (.rpt) into JSON: sections, objects, fonts, formulas, running totals, SQL.
# tools\genrptdefs.js turns these files into frontend\js\rptdefs.js (layout) and the server's fastsql.json.
# Run with 32-bit PowerShell (C:\Windows\SysWOW64\...), one process per report (the runtime has 5 licences):
#   powershell -NoProfile -ExecutionPolicy Bypass -File rptdump.ps1 -rpt D:/.../bill_report.rpt -out D:/.../bill_report.json
param([string]$rpt, [string]$out, [string]$server = 'bgkdata', [string]$user = 'bgk', [string]$password = 'bgk',
      [string]$oraHome = 'C:/oraclexe/app/oracle/product/11.2.0/server')
$bs = [string][char]92
$rpt = $rpt.Replace('/', $bs); $out = $out.Replace('/', $bs); $oraHome = $oraHome.Replace('/', $bs)
$env:PATH = "$oraHome${bs}bin;" + $env:PATH
$env:TNS_ADMIN = "$oraHome${bs}network${bs}ADMIN"
function P($o, $n) { try { return [System.__ComObject].InvokeMember($n, [Reflection.BindingFlags]::GetProperty, $null, $o, $null) } catch { return $null } }
function Rpt($r) {
  $d = [ordered]@{}
  $d.sel = $r.RecordSelectionFormula
  try { foreach ($t in $r.Database.Tables) { $t.SetLogOnInfo($server, '', $user, $password) }; $d.sql = $r.SQLQueryString } catch { $d.sql = '' }
  $d.margins = @($r.LeftMargin, $r.RightMargin, $r.TopMargin, $r.BottomMargin); $d.orient = $r.PaperOrientation
  $d.formulas = @($r.FormulaFields | % { @{ n = $_.FormulaFieldName; t = $_.Text } })
  $d.running = @($r.RunningTotalFields | % { $f = $_
    @{ n = $f.Name; of = (P (P $f 'SummarizedField') 'Name'); op = (P $f 'SummaryType'); ev = (P $f 'EvaluateCondition'); rs = (P $f 'ResetCondition')
       evf = (P $f 'EvaluateConditionFormula'); rsf = (P $f 'ResetConditionFormula'); evn = (P (P $f 'EvaluateConditionField') 'Name'); rsn = (P (P $f 'ResetConditionField') 'Name')
       evg = (P $f 'EvaluateGroupNumber'); rsg = (P $f 'ResetGroupNumber') } })
  $d.params = @($r.ParameterFields | % { $_.ParameterFieldName })
  $d.areas = @($r.Areas | % { $a = $_; $c = ''; try { $c = $a.GroupConditionField.Name } catch {}
    @{ n = $a.Name; k = $a.Kind; c = $c; s = @($a.Sections | % { $_.Name }) } })
  $d.sections = @($r.Sections | % { $s = $_
    $objs = @($s.ReportObjects | % { $o = $_; $k = $o.Kind
      $x = [ordered]@{ k = $k; n = $o.Name; x = $o.Left; y = $o.Top; w = $o.Width; h = $o.Height }
      foreach ($pp in 'Suppress', 'HorAlignment', 'DecimalPlaces', 'TextColor', 'BackColor', 'BorderColor', 'LineColor', 'LeftLineStyle', 'RightLineStyle', 'TopLineStyle', 'BottomLineStyle', 'CanGrow', 'Right', 'Bottom', 'LineStyle', 'LineThickness', 'ExtendToBottomOfSection', 'SuppressIfDuplicated', 'DateOrder', 'YearType', 'MonthType', 'DayType', 'DateFirstSeparator', 'DateSecondSeparator', 'ThousandsSeparators', 'SuppressIfZero', 'CornerEllipseHeight', 'FillColor', 'UseSystemDefaults', 'CurrencySymbolFormat') {
        $v = P $o $pp; if ($v -ne $null) { $x[$pp] = $v } }
      $es = P $o 'EndSection'; if ($es) { $x.end = (P $es 'Name') }
      if ($k -eq 2) { $x.t = $o.Text } elseif ($k -eq 1) { $x.f = $o.Field.Name } elseif ($k -eq 5) { $x.sub = $o.SubreportName }
      $fo = P $o 'Font'; if ($fo) { $x.font = (P $fo 'Name'); $x.size = (P $fo 'Size'); $x.bold = (P $fo 'Bold'); $x.ital = (P $fo 'Italic'); $x.und = (P $fo 'Underline') }
      $x })
    [ordered]@{ n = $s.Name; h = $s.Height; sup = $s.Suppress; np = @($s.NewPageBefore, $s.NewPageAfter); ka = $s.KeepTogether; o = $objs } })
  $d
}
$app = New-Object -ComObject CrystalRuntime.Application.8.5
$r = $app.OpenReport($rpt, 1)
$d = Rpt $r
$subs = @{}
foreach ($s in $r.Sections) { foreach ($o in $s.ReportObjects) { if ($o.Kind -eq 5) { $subs[$o.SubreportName] = Rpt ($r.OpenSubreport($o.SubreportName)) } } }
$d.subs = $subs
$d | ConvertTo-Json -Depth 12 | Out-File $out -Encoding UTF8
