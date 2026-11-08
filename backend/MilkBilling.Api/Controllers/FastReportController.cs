using System.Text.Json;
using MilkBilling.Api.Data;
using MilkBilling.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MilkBilling.Api.Controllers;

/// <summary>
/// Data of the reports for the page-side report engine (frontend\js\rptengine.js): the same procedures, views and
/// selections as CrystalController, with the SQL of the .rpt file (reports\fastsql.json, tools\genrptdefs.js).
/// The page draws the report itself, so it opens at once; the Crystal route stays available.
/// </summary>
[ApiController, Route("api/fast"), Authorize]
public class FastReportController(Db db, IConfiguration cfg, IWebHostEnvironment env) : ControllerBase
{
    private sealed record Q(string sql, string[] cols);
    private sealed record Rq(Q? main, Dictionary<string, Q?> subs);
    private static Dictionary<string, Rq>? _sql;
    private Dictionary<string, Rq> Sql() => _sql ??= JsonSerializer.Deserialize<Dictionary<string, Rq>>(
        System.IO.File.ReadAllText(Path.Combine(env.ContentRootPath, cfg["Crystal:ReportsPath"] ?? "reports", "fastsql.json")))!;

    private static string With(string sql, string? where)
    {
        if (string.IsNullOrWhiteSpace(where)) return sql;
        var order = sql.IndexOf(" ORDER BY ", StringComparison.Ordinal);
        var head = order >= 0 ? sql[..order] : sql;
        var tail = order >= 0 ? sql[order..] : "";
        return head + (head.Contains(" WHERE ") ? " AND " : " WHERE ") + "(" + where + ")" + tail;
    }

    private object Rows(Q? q, string? where, object? p)
    {
        if (q == null) return new { cols = Array.Empty<string>(), rows = Array.Empty<object?[]>() };
        var rows = db.Rows(With(q.sql, where), p);
        return new
        {
            q.cols,
            rows = rows.Select(r => q.cols.Select((_, i) => r.TryGetValue("c" + i, out var v) ? v : null).ToArray()).ToList()
        };
    }

    /// <summary>One report: prepare (views / procedures on shared tables) and read under the same lock as Crystal.</summary>
    private async Task<IActionResult> Report(string name, string? where, object? bind, Dictionary<string, object?> pars,
        Action? prepare = null, bool factoryTitle = false, string? subWhere = null, object? subBind = null)
    {
        if (!Sql().TryGetValue(name, out var q)) throw new AppException("Report not found", 404);
        await Db.ScratchLock.WaitAsync();
        try
        {
            prepare?.Invoke();
            return Ok(new
            {
                report = name,
                title = factoryTitle ? "" : cfg["Crystal:ReportTitle"],
                pars,
                data = Rows(q.main, where, bind),
                subs = q.subs.ToDictionary(k => k.Key, k => Rows(k.Value, subWhere, subBind))
            });
        }
        finally { Db.ScratchLock.Release(); }
    }

    private Row Fort(string year, long fortno) =>
        db.Row("select dstart_date, dend_date from milk_fortnight where vyear_code = :y and nfortno = :f", new { y = year, f = fortno })
        ?? throw new AppException("Fortnight not found", 404);

    private Dictionary<string, object?> FortPars(string y, long f)
    {
        var r = Fort(y, f);
        return new() { ["mstart_date"] = r.Date("dstart_date"), ["mend_date"] = r.Date("dend_date"), ["myear"] = y, ["mfortno"] = f };
    }

    private const string Hdr = "\"MILK_BILL_HEADER\".\"VYEAR_CODE\" = :y AND \"MILK_BILL_HEADER\".\"NFORTNO\" = :f";
    private const string Det = "\"MILK_BILL_DETAIL\".\"VYEAR_CODE\" = :y AND \"MILK_BILL_DETAIL\".\"NFORTNO\" = :f";

    private static string OfCb(string cb) => $"\"MILK_BILL_HEADER\".\"NCODE\" IN (SELECT NCODE FROM MILK_SUPPLIER WHERE CB = '{cb}')";

    [HttpGet("daily")]
    public async Task<IActionResult> Daily(DateTime date, int time)
    {
        var f = db.Rows("select nfortno, vyear_code from milk_fortnight where :d between dstart_date and dend_date order by dstart_date", new { d = date.Date }).LastOrDefault();
        return await Report("daily_moring_report", "\"MILK_BILL_DETAIL\".\"DDATE\" = :d AND \"MILK_BILL_DETAIL\".\"NTIME\" = :t", new { d = date.Date, t = time },
            new() { ["pdate"] = date.Date, ["ptime"] = time },
            () => { if (f != null) try { db.Proc("milk_rate_proc", new { yearcode = f.Str("vyear_code"), frtno = f.Long("nfortno") }); } catch { } });
    }

    [HttpGet("bill")]
    public async Task<IActionResult> Bill(string year, long fortno, long? code) =>
        await Report("bill_report", Hdr + (code is > 0 ? " AND \"MILK_BILL_HEADER\".\"NCODE\" = :c" : ""),
            code is > 0 ? new { y = year, f = fortno, c = code } : new { y = year, f = fortno }, FortPars(year, fortno),
            () => CrystalController.BillViews(db, year, fortno));

    [HttpGet("register")]
    public async Task<IActionResult> Register(string year, long fortno) =>
        await Report("bill_registar", Hdr, new { y = year, f = fortno }, FortPars(year, fortno));

    [HttpGet("bank")]
    public async Task<IActionResult> Bank(string year, long fortno) =>
        await Report("bill_bank", Hdr + " AND \"MILK_BILL_HEADER\".\"NNET_AMOUNT\" > 0 AND \"MILK_SUPPLIER\".\"NACNO\" > 0", new { y = year, f = fortno }, FortPars(year, fortno));

    [HttpGet("rokha")]
    public async Task<IActionResult> Rokha(string year, long fortno) =>
        await Report("bill_rokha", Hdr + " AND \"MILK_BILL_HEADER\".\"NNET_AMOUNT\" > 0 AND \"MILK_SUPPLIER\".\"NACNO\" = 0", new { y = year, f = fortno }, FortPars(year, fortno));

    [HttpGet("bankletter")]
    public async Task<IActionResult> BankLetter(string year, long fortno)
    {
        var f = Fort(year, fortno);
        var amt = db.Row(@"select nvl(sum(h.nnet_amount),0) a from milk_bill_header h, milk_supplier s where h.ncode = s.ncode
                           and h.vyear_code = :y and h.nfortno = :f and nvl(h.nnet_amount,0) > 0 and nvl(s.nacno,0) > 0", new { y = year, f = fortno })!.Dec("a");
        return await Report("bank_ltr", null, null, new() { ["amt"] = amt, ["fdate"] = f.Date("dstart_date"), ["tdate"] = f.Date("dend_date") });
    }

    [HttpGet("summary")]
    public async Task<IActionResult> Summary(string year, long fortno, string kind = "daily")
    {
        var b = new { y = year, f = fortno };
        var p = FortPars(year, fortno);
        return kind.ToLowerInvariant() switch
        {
            "total" => await Report("bill_summary_only", Hdr, b, p),
            "cow" => await Report("bill_summary_cow", OfCb("C") + " AND " + Det, b, p, () => CrystalController.BillViews(db, year, fortno), true, Hdr, b),
            "buffalo" => await Report("bill_summary_buff", OfCb("B") + " AND " + Det, b, p, () => CrystalController.BillViews(db, year, fortno), true, Hdr, b),
            "shivamrut" => await Report("bill_summary2", Det, b, p, () => db.Proc("milk_shiv_proc", new { yearcode = year, frtno = fortno }), true),
            _ => await Report("bill_summary", Hdr, b, p, () => CrystalController.BillViews(db, year, fortno), false, Hdr, b)
        };
    }

    [HttpGet("ledger")]
    public async Task<IActionResult> Ledger(DateTime from, DateTime to, long? ded, long? code, string mode = "detail")
    {
        if (mode == "cattle")
            return await Report("milk_cattel_Led", null, null, new(),
                () => db.Proc("milk_cattel_proc", new Dictionary<string, object?> { ["fromdate"] = from.Date, ["todate"] = to.Date, ["ledger"] = null, ["subledger"] = code is > 0 ? code : null }));
        if (ded is null or 0) throw new AppException("Invalid data");
        return await Report(mode == "list" ? "milk_Sub_Led_list" : "milk_Sub_Led", null, null, new() { ["pdate"] = to.Date },
            () => db.Proc("milk_ledger_proc", new Dictionary<string, object?> { ["fromdate"] = from.Date, ["todate"] = to.Date, ["ledger"] = ded, ["subledger"] = code is > 0 ? code : null }));
    }

    [HttpGet("checklist")]
    public async Task<IActionResult> CheckList(int type) =>
        await Report(type == 2 ? "milk_supplier_chk_lst" : "milk_fortnight_chk_lst", null, null, new());
}
