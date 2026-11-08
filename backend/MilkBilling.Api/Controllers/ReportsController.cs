using MilkBilling.Api.Data;
using MilkBilling.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MilkBilling.Api.Controllers;

/// <summary>
/// Data for the printable reports that the VB6 program produced with Crystal Reports (reports\*.rpt).
/// The frontend renders them as A4 HTML pages.
/// </summary>
[ApiController, Route("api/reports"), Authorize]
public class ReportsController(Db db, ILogger<ReportsController> log) : ControllerBase
{
    // ------------------------------------------------------------ Daily report (repo_milk_daily / daily_moring_report.rpt)
    [HttpGet("daily")]
    public IActionResult Daily(DateTime date, int time, string? year, long? fortno)
    {
        // The VB screen first re-applies the rate table to the fortnight's entries (milk_rate_proc).
        if (!string.IsNullOrEmpty(year) && fortno is > 0)
        {
            try { db.Proc("milk_rate_proc", new { yearcode = year, frtno = fortno }); }
            catch (Exception ex) { log.LogWarning(ex, "milk_rate_proc failed; printing stored rates"); }
        }
        var rows = db.Rows(@"select t.ncode, s.vname, s.cb, t.nltr, t.nfat, t.nsnf, t.nrate, t.namount
                             from milk_input t, milk_supplier s
                             where t.ncode = s.ncode(+) and t.ddate = :d and t.ntime = :t order by t.ncode",
            new { d = date.Date, t = time });
        return Ok(new { date = date.Date, time, rows });
    }

    // ------------------------------------------------------------ Milk bill (repo_milk_Bill / bill_report.rpt)
    private const string HeaderCols = @"h.nbillno, h.ncode, s.vname, s.eng_name, to_char(s.nacno) nacno, s.cb scb, h.cb, h.dfdate, h.dedate,
        h.nltr, h.nrate, h.nfat, h.nsnf, h.nmilk_amount, h.nfeed, h.nadv, h.noth1, h.noth2, h.nbonus_anamat, h.ndeduction, h.nnet_amount,
        h.nfeed_opbal, h.nadv_opbal, h.nfeed_clbal, h.nadv_clbal, h.noth1_opbal, h.noth2_opbal, h.noth1_clbal, h.noth2_clbal, h.vyear_code, h.nfortno";

    [HttpGet("bill")]
    public IActionResult Bill(string year, long fortno, long? code)
    {
        var p = new Dictionary<string, object?> { ["y"] = year, ["f"] = fortno };
        var cf = "";
        if (code is > 0) { cf = " and h.ncode = :c"; p["c"] = code; }
        var heads = db.Rows($@"select {HeaderCols} from milk_bill_header h, milk_supplier s
                               where h.ncode = s.ncode(+) and h.vyear_code = :y and h.nfortno = :f{cf} order by h.ncode", p);
        var det = db.Rows($@"select d.ncode, d.ddate, d.ntime, d.nltr, d.nfat, d.nsnf, d.nrate, d.namount from milk_bill_detail d
                             where d.vyear_code = :y and d.nfortno = :f and nvl(d.nltr,0) > 0{cf.Replace("h.", "d.")}
                             order by d.ncode, d.ddate, d.ntime", p)
            .GroupBy(r => r.Long("ncode")).ToDictionary(g => g.Key, g => g.ToList());
        var bills = heads.Select(h =>
        {
            var days = (det.TryGetValue(h.Long("ncode"), out var l) ? l : new List<Row>())
                .GroupBy(r => r.Date("ddate"))
                .Select(g => new
                {
                    date = g.Key,
                    m = g.FirstOrDefault(r => r.Long("ntime") == 1),
                    e = g.FirstOrDefault(r => r.Long("ntime") == 2)
                }).ToList();
            h["days"] = days;
            h["avgRate"] = h.Dec("nltr") == 0 ? 0 : Num.R(h.Dec("nmilk_amount") / h.Dec("nltr"));
            h["netInWords"] = Num.ToWords(h.Dec("nnet_amount"));
            return h;
        }).ToList();
        return Ok(bills);
    }

    // ------------------------------------------------------------ Bill register (bill_registar.rpt)
    [HttpGet("register")]
    public IActionResult Register(string year, long fortno) => Ok(db.Rows($@"
        select {HeaderCols} from milk_bill_header h, milk_supplier s
        where h.ncode = s.ncode(+) and h.vyear_code = :y and h.nfortno = :f order by h.ncode", new { y = year, f = fortno }));

    // ------------------------------------------------------------ Bill summaries (repo_milk_Bill_summary)
    /// <summary>kind: daily (all), cow, buffalo, shivamrut - date-wise morning/evening totals; total - one summary of all bills.</summary>
    [HttpGet("summary")]
    public IActionResult Summary(string year, long fortno, string kind = "daily")
    {
        var p = new Dictionary<string, object?> { ["y"] = year, ["f"] = fortno };
        kind = kind.ToLowerInvariant();
        if (kind == "total")
        {
            return Ok(db.Rows(@"select nvl(h.cb, '-') cb, count(*) bills, sum(h.nltr) nltr, sum(h.nmilk_amount) nmilk_amount,
                    round(sum(h.nmilk_amount) / nullif(sum(h.nltr),0), 2) avg_rate, sum(h.nfeed) nfeed, sum(h.nadv) nadv,
                    sum(h.noth1) noth1, sum(h.noth2) noth2, sum(h.nbonus_anamat) nbonus_anamat, sum(h.ndeduction) ndeduction,
                    sum(h.nnet_amount) nnet_amount
                from milk_bill_header h where h.vyear_code = :y and h.nfortno = :f group by h.cb order by h.cb", p));
        }
        string from, cbFilter = "";
        if (kind == "shivamrut")
        {
            try { db.Proc("milk_shiv_proc", new { yearcode = year, frtno = fortno }); }
            catch (Exception ex) { log.LogWarning(ex, "milk_shiv_proc failed"); }
            from = "milk_shivamrut d";
        }
        else
        {
            from = "milk_bill_detail d, milk_supplier s";
            cbFilter = " and d.ncode = s.ncode";
            if (kind == "cow") cbFilter += " and s.cb = 'C'";
            if (kind == "buffalo") cbFilter += " and s.cb = 'B'";
        }
        var rows = db.Rows($@"select d.ddate, d.ntime, count(*) cnt, sum(nvl(d.nltr,0)) nltr,
                    round(avg(case when d.nfat > 0 then d.nfat end), 2) nfat, round(avg(case when d.nsnf > 0 then d.nsnf end), 2) nsnf,
                    round(avg(case when d.nrate > 0 then d.nrate end), 2) nrate, sum(nvl(d.namount,0)) namount
                from {from} where d.vyear_code = :y and d.nfortno = :f and nvl(d.nltr,0) > 0{cbFilter}
                group by d.ddate, d.ntime order by d.ddate, d.ntime", p);
        var days = rows.GroupBy(r => r.Date("ddate")).Select(g => new
        {
            date = g.Key,
            m = g.FirstOrDefault(r => r.Long("ntime") == 1),
            e = g.FirstOrDefault(r => r.Long("ntime") == 2),
            ltr = g.Sum(r => r.Dec("nltr")),
            amount = g.Sum(r => r.Dec("namount"))
        });
        return Ok(days);
    }

    // ------------------------------------------------------------ Bank list / cash (rokha) list / bank letter
    [HttpGet("banklist")]
    public IActionResult BankList(string year, long fortno, string type = "bank")
    {
        var cond = type.Equals("cash", StringComparison.OrdinalIgnoreCase) ? "nvl(s.nacno,0) = 0" : "nvl(s.nacno,0) > 0";
        var rows = db.Rows($@"select h.cb, h.nbillno, h.ncode, s.vname, to_char(s.nacno) nacno, s.ifsc_code, h.nnet_amount
                              from milk_bill_header h, milk_supplier s
                              where h.ncode = s.ncode and h.vyear_code = :y and h.nfortno = :f and nvl(h.nnet_amount,0) > 0 and {cond}
                              order by h.cb, h.ncode", new { y = year, f = fortno });
        var total = rows.Sum(r => r.Dec("nnet_amount"));
        return Ok(new { rows, total, totalInWords = Num.ToWords(total) });
    }

    [HttpGet("bankletter")]
    public IActionResult BankLetter(string year, long fortno)
    {
        var r = db.Row(@"select f.dstart_date, f.dend_date,
                           (select nvl(sum(h.nnet_amount),0) from milk_bill_header h, milk_supplier s
                             where h.ncode = s.ncode and h.vyear_code = f.vyear_code and h.nfortno = f.nfortno
                               and nvl(h.nnet_amount,0) > 0 and nvl(s.nacno,0) > 0) amount,
                           (select count(*) from milk_bill_header h, milk_supplier s
                             where h.ncode = s.ncode and h.vyear_code = f.vyear_code and h.nfortno = f.nfortno
                               and nvl(h.nnet_amount,0) > 0 and nvl(s.nacno,0) > 0) cnt
                         from milk_fortnight f where f.vyear_code = :y and f.nfortno = :f", new { y = year, f = fortno })
                ?? throw new AppException("Fortnight not found", 404);
        r["amountInWords"] = Num.ToWords(r.Dec("amount"));
        return Ok(r);
    }

    // ------------------------------------------------------------ Ledger (repo_milk_ledger / milk_Sub_Led*.rpt, milk_cattel_Led.rpt)
    /// <summary>Supplier ledger for one recovery head (feed, advance ...). mode=list gives the receivable/payable list.</summary>
    [HttpGet("ledger")]
    public async Task<IActionResult> Ledger(DateTime from, DateTime to, long ded, long? code, string mode = "detail")
    {
        await Db.ScratchLock.WaitAsync();
        try
        {
            using var s = db.Session();
            s.Proc("milk_ledger_proc", new Dictionary<string, object?>
                { ["fromdate"] = from.Date, ["todate"] = to.Date, ["ledger"] = ded, ["subledger"] = code is > 0 ? code : null });
            var rows = s.Rows(@"select op.ncode, sp.vname, op.ddate, op.vnar, op.namount, op.nbag
                                from milk_ledger_op op, milk_supplier sp
                                where op.ncode = sp.ncode(+) and op.ndeduction_code = :ded
                                order by op.ncode, op.ddate, op.rowid", new { ded });
            var head = s.Row("select ndeduction_code, vdeduction_name from milk_deduction_master where ndeduction_code = :ded", new { ded });
            return Ok(new { head, from = from.Date, to = to.Date, accounts = Accounts(rows, r => r.Long("ncode"), mode) });
        }
        finally { Db.ScratchLock.Release(); }
    }

    /// <summary>Cattle feed purchase &amp; issue ledger in bags, per item (CAFEED button).</summary>
    [HttpGet("cattle")]
    public async Task<IActionResult> Cattle(DateTime from, DateTime to, long? code)
    {
        await Db.ScratchLock.WaitAsync();
        try
        {
            using var s = db.Session();
            s.Proc("milk_cattel_proc", new Dictionary<string, object?>
                { ["fromdate"] = from.Date, ["todate"] = to.Date, ["ledger"] = null, ["subledger"] = code is > 0 ? code : null });
            var rows = s.Rows(@"select op.ndeduction_code nprod_code, i.vprod_name, op.ncode, sp.vname, op.ddate, op.vnar, op.namount
                                from milk_ledger_op op, milk_item_master i, milk_supplier sp
                                where op.ndeduction_code = i.nprod_code(+) and op.ncode = sp.ncode(+)
                                order by op.ndeduction_code, op.ddate, op.rowid");
            return Ok(new { from = from.Date, to = to.Date, accounts = Accounts(rows, r => r.Long("nprod_code"), "detail") });
        }
        finally { Db.ScratchLock.Release(); }
    }

    private static List<object> Accounts(List<Row> rows, Func<Row, long> key, string mode)
    {
        var list = new List<object>();
        foreach (var g in rows.GroupBy(key))
        {
            decimal bal = 0;
            var lines = g.Select(r =>
            {
                var amt = r.Dec("namount");
                bal += amt;
                return new
                {
                    date = r.Date("ddate"), narration = r.Str("vnar"), debit = amt > 0 ? amt : 0, credit = amt < 0 ? -amt : 0,
                    balance = bal, bags = r.DecN("nbag"), name = r.Str("vname")
                };
            }).ToList();
            var first = g.First();
            if (mode == "list" && bal == 0) continue;
            list.Add(new
            {
                code = g.Key, name = first.Str("vname"), item = first.Str("vprod_name"),
                debit = lines.Sum(x => x.debit), credit = lines.Sum(x => x.credit), balance = bal,
                lines = mode == "list" ? null : lines
            });
        }
        return list;
    }

    // ------------------------------------------------------------ Master check lists (repo_chk_llist)
    [HttpGet("checklist")]
    public IActionResult CheckList(string type) => Ok(type.ToLowerInvariant() switch
    {
        "fortnight" => db.Rows("select nfortno, vyear_code, dstart_date, dend_date, vopen_fortnight from milk_fortnight order by dstart_date"),
        "supplier" => db.Rows(@"select s.ncode, s.vname, s.eng_name, s.cb, s.ndairy, to_char(s.nacno) nacno, to_char(s.nmobile_no) nmobile_no,
                                       s.ifsc_code, v.village_name from milk_supplier s, milk_village_master v
                                where s.vill_code = v.village_code(+) order by s.ncode"),
        "deduction" => db.Rows("select ndeduction_code, vdeduction_name, npriority_code, ndeduction_value from milk_deduction_master order by ndeduction_code"),
        _ => throw new AppException("Unknown list", 404)
    });
}
