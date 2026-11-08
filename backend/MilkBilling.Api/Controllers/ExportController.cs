using System.IO.Compression;
using System.Text;
using ClosedXML.Excel;
using MilkBilling.Api.Data;
using MilkBilling.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MilkBilling.Api.Controllers;

/// <summary>
/// Excel exports that the VB6 program built through Excel automation (bank "pendrive" lists, Anudan formats, SMS list)
/// and the CSV backup (frmbackup.frm). Files are returned as downloads instead of being saved on drive H:/C:.
/// </summary>
[ApiController, Route("api/export"), Authorize]
public class ExportController(Db db, IConfiguration cfg) : ControllerBase
{
    private const string MarathiFont = "DVBW-TTSurekh";
    private const string Xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    private string A(string key) => cfg[$"Anudan:{key}"] ?? "";

    private Row Fortnight(string year, long fortno) =>
        db.Row("select dstart_date, dend_date from milk_fortnight where vyear_code = :y and nfortno = :f", new { y = year, f = fortno })
        ?? throw new AppException("Fortnight not found", 404);

    private static string D(DateTime? d) => d?.ToString("dd-MM-yyyy") ?? "";

    private FileContentResult File(XLWorkbook wb, string name)
    {
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return File(ms.ToArray(), Xlsx, name);
    }

    private static void Header(IXLWorksheet ws, int row, params string[] titles)
    {
        for (int i = 0; i < titles.Length; i++)
        {
            var c = ws.Cell(row, i + 1);
            c.Value = titles[i];
            c.Style.Font.Bold = true;
            c.Style.Font.FontColor = XLColor.Red;
        }
    }

    private static void Title(IXLWorksheet ws, string text, int col = 1)
    {
        var c = ws.Cell(1, col);
        c.Value = text;
        c.Style.Font.Bold = true;
        c.Style.Font.FontColor = XLColor.Red;
    }

    private static XLCellValue V(object? v) => v switch
    {
        null => Blank.Value,
        decimal d => d,
        DateTime dt => dt,
        _ => v.ToString()
    };

    // ------------------------------------------------------------ Bank list for the pendrive (repo_milk_Bill_reg: Command_pen / cmdcow / Cmdbuff)
    [HttpGet("banklist")]
    public IActionResult BankList(string year, long fortno, string cb = "all")
    {
        var f = Fortnight(year, fortno);
        cb = cb.ToUpperInvariant();
        var p = new Dictionary<string, object?> { ["y"] = year, ["f"] = fortno };
        var cbCond = "";
        if (cb is "C" or "B") { cbCond = " and h.cb = :cb"; p["cb"] = cb; }
        var rows = db.Rows($@"select h.cb, h.ncode, s.vname, to_char(s.nacno) acno, h.nnet_amount from milk_bill_header h, milk_supplier s
                              where h.ncode = s.ncode and h.nfortno = :f and h.vyear_code = :y and nvl(s.nacno,0) > 0
                                and nvl(h.nnet_amount,0) > 0{cbCond} order by {(cb == "ALL" ? "" : "h.cb, ")}h.ncode", p);
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("Bank List");
        Title(ws, $"Bank List From {D(f.Date("dstart_date"))} To {D(f.Date("dend_date"))}", 3);
        Header(ws, 2, "SR NO", "Code NO", "Name", "A/c No", "Amount");
        int r = 3, sr = 1;
        decimal total = 0;
        foreach (var x in rows)
        {
            ws.Cell(r, 1).Value = sr++;
            ws.Cell(r, 2).Value = x.Long("ncode");
            ws.Cell(r, 3).Value = x.Str("vname");
            ws.Cell(r, 3).Style.Font.FontName = MarathiFont;
            ws.Cell(r, 3).Style.Font.FontSize = 14;
            ws.Cell(r, 4).Value = x.Str("acno");
            ws.Cell(r, 4).Style.NumberFormat.Format = "@";
            ws.Cell(r, 5).Value = x.Dec("nnet_amount");
            total += x.Dec("nnet_amount");
            r++;
        }
        r++;
        ws.Cell(r, 3).Value = "Total Amount Rs.";
        ws.Cell(r, 5).Value = total;
        ws.Cell(r, 5).Style.Font.Bold = true;
        ws.Column(1).Width = 10; ws.Column(2).Width = 10; ws.Column(3).Width = 35; ws.Column(4).Width = 18; ws.Column(5).Width = 12;
        var prefix = cb switch { "C" => "Cow", "B" => "Buf", _ => "Bank" };
        return File(wb, $"{prefix} {D(f.Date("dstart_date"))}_TO_{D(f.Date("dend_date"))}.xlsx");
    }

    // ------------------------------------------------------------ Anudan Excel_1: farmer and cow (tag) information
    [HttpGet("anudan1")]
    public IActionResult Anudan1(string year, long fortno)
    {
        var f = Fortnight(year, fortno);
        var rows = db.Rows(@"select h.ncode, s.eng_name, s.idno, s.village farmer_village from milk_bill_header h, milk_supplier s
                             where h.ncode = s.ncode and h.nfortno = :f and h.vyear_code = :y and h.cb = 'C' order by h.ncode",
            new { y = year, f = fortno });
        var tags = db.Rows(@"select a.code, to_char(a.tagno) tagno from anudan_tag_master a order by a.code, a.tagno")
            .GroupBy(t => t.Long("code")).ToDictionary(g => g.Key, g => g.Select(t => t.Str("tagno")).ToList());
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("Form1");
        Title(ws, $"{A("HeaderTitle")}  {D(f.Date("dstart_date"))} To {D(f.Date("dend_date"))}   Farmer and Cow Information");
        Header(ws, 2, "SR NO", "Name of Union or VLCC", "Farmer Name", "Unique Farmer ID", "Animal Tag ID", "District", "Taluka", "Village");
        int r = 3, sr = 1;
        foreach (var x in rows)
        {
            var list = tags.TryGetValue(x.Long("ncode"), out var t) && t.Count > 0 ? t : new List<string> { "" };
            ws.Cell(r, 1).Value = sr++;
            foreach (var tag in list)
            {
                ws.Cell(r, 2).Value = A("Sangh");
                ws.Cell(r, 3).Value = x.Str("eng_name");
                ws.Cell(r, 4).Value = x.Str("idno");
                ws.Cell(r, 5).Value = tag;
                ws.Cell(r, 5).Style.NumberFormat.Format = "@";
                ws.Cell(r, 6).Value = A("District");
                ws.Cell(r, 7).Value = A("Taluka");
                ws.Cell(r, 8).Value = x.Str("farmer_village");
                r++;
            }
            r++;
        }
        ws.Columns().AdjustToContents();
        return File(wb, $"form1_{D(f.Date("dstart_date"))}_TO_{D(f.Date("dend_date"))}.xlsx");
    }

    private async Task<List<Row>> AnudanRows(string year, long fortno, bool villageMaster)
    {
        await Db.ScratchLock.WaitAsync();
        try
        {
            using var s = db.Session();
            s.Proc("milk_adjust_proc", new { yearcode = year, frtno = fortno });
            return s.Rows($@"select {(villageMaster ? "v.village_name" : "s.village")} village, s.idno, h.ncode, s.eng_name, h.act_ltr nltr,
                       h.afat nfat, h.asnf nsnf, h.act_new_amt_2550 nmilk_amount, h.arate nrate, h.adeduction ndeduction,
                       h.anet_amount nnet_amount, to_char(s.nacno) nacno, to_char(s.aharno) aharno, to_char(s.nmobile_no) nmobile_no
                from milk_bill_header_anudan h, milk_supplier s{(villageMaster ? ", milk_village_master v" : "")}
                where h.ncode = s.ncode and h.nfortno = :f and h.vyear_code = :y and h.cb = 'C'
                {(villageMaster ? "and s.vill_code = v.village_code" : "")} order by h.ncode", new { y = year, f = fortno });
        }
        finally { Db.ScratchLock.Release(); }
    }

    // ------------------------------------------------------------ Anudan Excel_2: subsidy claim format (excel3_Click)
    [HttpGet("anudan2")]
    public async Task<IActionResult> Anudan2(string year, long fortno)
    {
        var f = Fortnight(year, fortno);
        var rows = await AnudanRows(year, fortno, true);
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("Form2");
        Title(ws, $"{A("HeaderTitle")}  {D(f.Date("dstart_date"))} To {D(f.Date("dend_date"))}");
        Header(ws, 2, "SR.NO", "Private/Co-operative Milk Union", "FROM", "TO", "District", "Taluka", "Village",
            "Name of the VLCC/DCS/BULK Milk Supplier", "Unique Farmer ID", "Name of the Farmer", "Total quantity liter", "Average FAT",
            "Average SNF", "Total Amount", "Average Rate per Liter", "Total Deducation on if any", "Net Payment", "Remarks");
        int r = 3, sr = 1;
        decimal gltr = 0, gsamt = 0, gded = 0, gamt = 0;
        foreach (var x in rows)
        {
            object?[] vals = { sr++, A("Sangh"), f.Date("dstart_date"), f.Date("dend_date"), A("District"), A("Taluka"), x.Str("village"),
                A("Dairy"), x.Str("idno"), x.Str("eng_name"), x.DecN("nltr"), x.DecN("nfat"), x.DecN("nsnf"), x.DecN("nmilk_amount"),
                x.DecN("nrate"), x.DecN("ndeduction"), x.DecN("nnet_amount") };
            for (int i = 0; i < vals.Length; i++) ws.Cell(r, i + 1).Value = V(vals[i]);
            ws.Cell(r, 3).Style.DateFormat.Format = "dd/mm/yyyy";
            ws.Cell(r, 4).Style.DateFormat.Format = "dd/mm/yyyy";
            gltr += x.Dec("nltr"); gsamt += x.Dec("nmilk_amount"); gded += x.Dec("ndeduction"); gamt += x.Dec("nnet_amount");
            r++;
        }
        ws.Cell(r, 11).Value = gltr; ws.Cell(r, 14).Value = gsamt; ws.Cell(r, 16).Value = gded; ws.Cell(r, 17).Value = gamt;
        ws.Row(r).Style.Font.Bold = true;
        ws.Columns().AdjustToContents();
        return File(wb, $"form2_{D(f.Date("dstart_date"))}_TO_{D(f.Date("dend_date"))}.xlsx");
    }

    // ------------------------------------------------------------ Anudan Excel_3: farmer bank details (excel3A_click)
    [HttpGet("anudan3")]
    public async Task<IActionResult> Anudan3(string year, long fortno)
    {
        var f = Fortnight(year, fortno);
        var rows = await AnudanRows(year, fortno, false);
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("Form3");
        Title(ws, $"{A("HeaderTitle")}  {D(f.Date("dstart_date"))} To {D(f.Date("dend_date"))}");
        Header(ws, 2, "Sr.No.", "Unique Farmer ID", "Name of the Farmer", "District", "Taluka", "Village", "Farmer Bank Name", "Branch",
            "Account Number", "IFSC Code", "Adhar Card Number", "Mobile No");
        int r = 3, sr = 1;
        foreach (var x in rows)
        {
            object?[] vals = { sr++, x.Str("idno"), x.Str("eng_name"), A("District"), A("Taluka"), x.Str("village"), A("BankName"),
                A("Branch"), x.Str("nacno"), A("Ifsc"), x.Str("aharno"), x.Str("nmobile_no") };
            for (int i = 0; i < vals.Length; i++) ws.Cell(r, i + 1).Value = V(vals[i]);
            foreach (var c in new[] { 9, 11, 12 }) ws.Cell(r, c).Style.NumberFormat.Format = "@";
            r++;
        }
        ws.Columns().AdjustToContents();
        return File(wb, $"form3_{D(f.Date("dstart_date"))}_TO_{D(f.Date("dend_date"))}.xlsx");
    }

    // ------------------------------------------------------------ SMS list (repo_milk_sms: Excel_1)
    [HttpGet("sms")]
    public IActionResult Sms(DateTime date, int time)
    {
        var rows = db.Rows(@"select t.ncode, to_char(s.nmobile_no) nmobile_no, t.ddate, t.ntime,
                                    case when t.ntime = 1 then 'Morning' else 'Evening' end vtime, t.nfat, t.nsnf, t.nltr, t.nrate, t.namount
                             from milk_supplier s, milk_input t
                             where t.ncode = s.ncode and t.ddate = :d and nvl(s.nmobile_no,0) > 0 and t.ntime = :t order by s.ncode",
            new { d = date.Date, t = time });
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("SMS");
        var cols = new[] { "ncode", "nmobile_no", "ddate", "ntime", "vtime", "nfat", "nsnf", "nltr", "nrate", "namount" };
        for (int i = 0; i < cols.Length; i++) ws.Cell(1, i + 1).Value = cols[i];
        int r = 2;
        foreach (var x in rows)
        {
            for (int i = 0; i < cols.Length; i++) ws.Cell(r, i + 1).Value = V(cols[i] == "nmobile_no" ? x.Str(cols[i]) : x[cols[i]]);
            ws.Cell(r, 3).Style.DateFormat.Format = "dd/mm/yyyy";
            r++;
        }
        return File(wb, $"SMS_{(time == 1 ? "Morning" : "Evening")}_{date:dd-MM-yyyy}.xlsx");
    }

    // ------------------------------------------------------------ Backup (frmbackup.frm): every milk table as CSV, zipped
    [HttpGet("backup")]
    public IActionResult Backup()
    {
        var tables = cfg.GetSection("Backup:Tables").Get<string[]>() ?? Array.Empty<string>();
        var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, true))
        using (var s = db.Session())
        {
            foreach (var t in tables)
            {
                if (!System.Text.RegularExpressions.Regex.IsMatch(t, @"^[A-Za-z0-9_]+$")) continue;
                var entry = zip.CreateEntry(t + ".csv", CompressionLevel.Optimal);
                using var w = new StreamWriter(entry.Open(), new UTF8Encoding(true));
                static string Q(string v) => "\"" + v.Replace("\"", "\"\"") + "\"";
                s.Each($"select * from {t}",
                    r =>
                    {
                        var vals = new string[r.FieldCount];
                        for (int i = 0; i < r.FieldCount; i++)
                        {
                            if (r.IsDBNull(i)) { vals[i] = Q(""); continue; }
                            var v = r.GetFieldType(i) == typeof(decimal)
                                ? r.GetOracleDecimal(i).ToString()
                                : r.GetValue(i) is DateTime dt ? dt.ToString("dd-MM-yyyy HH:mm:ss") : Convert.ToString(r.GetValue(i)) ?? "";
                            vals[i] = Q(v);
                        }
                        w.WriteLine(string.Join(",", vals));
                    },
                    names => w.WriteLine(string.Join(",", names.Select(Q))));
            }
        }
        return File(ms.ToArray(), "application/zip", $"milk_backup_{DateTime.Now:dd-MM-yyyy_HHmm}.zip");
    }
}
