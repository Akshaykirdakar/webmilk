using MilkBilling.Api.Data;
using MilkBilling.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MilkBilling.Api.Controllers;

/// <summary>
/// The original Crystal Reports, printed exactly like the VB report forms did (same procedures / views before
/// printing, same selection formulas and parameters). Returns a PDF shown inside the form's Frame2.
/// </summary>
[ApiController, Route("api/crystal"), Authorize]
public class CrystalController(Db db, CrystalService cr) : ControllerBase
{
    /// <summary>The PDF, or with ?img=1 (phones) the pages as JPEG images.</summary>
    private async Task<IActionResult> Pdf(Task<byte[]> render, string name)
    {
        var b = await render;
        if (Request.Query["img"] == "1") return Ok(new { name, pages = await cr.ToImages(b) });
        Response.Headers["Content-Disposition"] = $"inline; filename=\"{name}.pdf\"";
        return File(b, "application/pdf");
    }

    private Row Fort(string year, long fortno) =>
        db.Row("select dstart_date, dend_date from milk_fortnight where vyear_code = :y and nfortno = :f", new { y = year, f = fortno })
        ?? throw new AppException("Fortnight not found", 404);

    private static string Q(string s) => s.Replace("'", "''");
    private static string HeaderSel(string y, long f) => $"{{MILK_BILL_HEADER.vyear_code}}='{Q(y)}' and {{MILK_BILL_HEADER.nfortno}}= {f}";
    private static string DetailSel(string y, long f) => $"{{milk_bill_detail.vyear_code}}='{Q(y)}' and {{milk_bill_detail.nfortno}}= {f}";

    private List<CrParam> FortParams(string y, long f)
    {
        var r = Fort(y, f);
        return new()
        {
            CrParam.Date("mstart_date", r.Date("dstart_date")!.Value), CrParam.Date("mend_date", r.Date("dend_date")!.Value),
            CrParam.Str("myear", y), CrParam.Num("mfortno", f),
            CrParam.Str("Pm-MILK_BILL_HEADER.VYEAR_CODE", y), CrParam.Num("Pm-MILK_BILL_HEADER.NFORTNO", f)
        };
    }

    /// <summary>repo_milk_Bill.Command5_Click: the bill views VW_BILL_DETAIL / VW_BILL_DETAIL2 for the fortnight.</summary>
    private void BillViews(string y, long f) => BillViews(db, y, f);
    internal static void BillViews(Db db, string y, long f)
    {
        var yq = Q(y);
        db.Exec($@"create or replace view vw_bill_detail as
            select t.vyear_code,t.nfortno,t.ncode,t.nbillno,t.ddate, sum(nvl(t.nltr,0)) as mlt1,min(nvl(t.nfat,0)) as mfat1,min(nvl(t.nclr,0)) as mnclr1,
                   min(nvl(t.nsnf,0)) as msnf1,min(nvl(t.nrate,0)) as nrate1, sum(nvl(t.namount,0)) as amt1,
                   0 as mlt2, 0 as mfat2, 0 as mnclr2, 0 msnf2, 0 as nrate2, 0 as amt2
            from milk_bill_detail t where t.vyear_code>='{yq}' and t.nfortno= {f} and t.ntime=1 and nvl(t.nltr,0) >0
            group by t.vyear_code,t.nfortno,t.ncode,t.nbillno,t.ddate
            union all
            select t.vyear_code,t.nfortno,t.ncode,t.nbillno,t.ddate,0 as mlt1, 0 as mfat1, 0 mnclr1, 0 msnf1, 0 as nrate1, 0 as amt1,
                   sum(nvl(t.nltr,0)) as mlt2,min(nvl(t.nfat,0)) as mfat2,min(nvl(t.nclr,0)) as mnclr2, min(nvl(t.nsnf,0)) as msnf2,
                   min(nvl(t.nrate,0)) as nrate2, sum(nvl(t.namount,0)) as amt2
            from milk_bill_detail t where t.vyear_code>='{yq}' and t.nfortno= {f} and t.ntime=2 and nvl(t.nltr,0) >0
            group by t.vyear_code,t.nfortno,t.ncode,t.nbillno,t.ddate");
        db.Exec(@"create or replace view vw_bill_detail2 as
            select t.vyear_code,t.nfortno,t.ncode,t.nbillno,t.ddate,
                   sum(nvl(mlt1,0)) as ltr1,sum(nvl(mfat1,0)) as fat1,sum(nvl(mnclr1,0)) as clr1, sum(nvl(msnf1,0)) as snf1,sum(nvl(nrate1,0)) as rate1,
                   sum(nvl(amt1,0)) as amt1, sum(nvl(mlt2,0)) as ltr2,sum(nvl(mfat2,0)) as fat2,sum(nvl(mnclr2,0)) as clr22, sum(nvl(msnf2,0)) as snf2,
                   sum(nvl(nrate2,0)) as rate2, sum(nvl(amt2,0)) as amt2
            from vw_bill_detail t group by t.vyear_code,t.nfortno,t.ncode,t.nbillno,t.ddate");
    }

    // repo_milk_daily
    [HttpGet("daily")]
    public async Task<IActionResult> Daily(DateTime date, int time)
    {
        var f = db.Rows("select nfortno, vyear_code from milk_fortnight where :d between dstart_date and dend_date order by dstart_date", new { d = date.Date }).LastOrDefault();
        var b = await cr.Render("daily_moring_report", null,
            new[] { CrParam.Date("pdate", date.Date), CrParam.Num("ptime", time) },
            () =>
            {
                // if milk_rate_proc fails (e.g. ORA-01427: two old charts overlap) the report is still printed
                // with the rates already saved at entry time.
                if (f != null) try { db.Proc("milk_rate_proc", new { yearcode = f.Str("vyear_code"), frtno = f.Long("nfortno") }); } catch { }
            });
        return await Pdf(Task.FromResult(b), $"daily_{date:dd-MM-yyyy}_{time}");
    }

    // repo_milk_Bill
    [HttpGet("bill")]
    public async Task<IActionResult> Bill(string year, long fortno, long? code)
    {
        var sel = HeaderSel(year, fortno) + (code is > 0 ? $" and {{MILK_BILL_HEADER.ncode}} = {code}" : "");
        return await Pdf(cr.Render("bill_report", sel, FortParams(year, fortno), () => BillViews(year, fortno)), $"bill_{fortno}");
    }

    // repo_milk_Bill_reg: register / bank list / rokha list / bank letter
    [HttpGet("register")]
    public async Task<IActionResult> Register(string year, long fortno) =>
        await Pdf(cr.Render("bill_registar", HeaderSel(year, fortno), FortParams(year, fortno)), $"register_{fortno}");

    [HttpGet("bank")]
    public async Task<IActionResult> Bank(string year, long fortno) =>
        await Pdf(cr.Render("bill_bank", HeaderSel(year, fortno) + " and {MILK_BILL_HEADER.NNET_AMOUNT} > 0  and {MILK_SUPPLIER.nacno} > 0",
            FortParams(year, fortno)), $"bank_{fortno}");

    [HttpGet("rokha")]
    public async Task<IActionResult> Rokha(string year, long fortno) =>
        await Pdf(cr.Render("bill_rokha", HeaderSel(year, fortno) + " and {MILK_BILL_HEADER.NNET_AMOUNT} > 0  and {MILK_SUPPLIER.nacno} = 0",
            FortParams(year, fortno)), $"rokha_{fortno}");

    [HttpGet("bankletter")]
    public async Task<IActionResult> BankLetter(string year, long fortno)
    {
        var f = Fort(year, fortno);
        var amt = db.Row(@"select nvl(sum(h.nnet_amount),0) a from milk_bill_header h, milk_supplier s where h.ncode = s.ncode
                           and h.vyear_code = :y and h.nfortno = :f and nvl(h.nnet_amount,0) > 0 and nvl(s.nacno,0) > 0", new { y = year, f = fortno })!.Dec("a");
        return await Pdf(cr.Render("bank_ltr", null, new[] { CrParam.Num("amt", amt), CrParam.Date("fdate", f.Date("dstart_date")!.Value),
            CrParam.Date("tdate", f.Date("dend_date")!.Value) }), $"bank_letter_{fortno}");
    }

    // repo_milk_Bill_summary
    [HttpGet("summary")]
    public async Task<IActionResult> Summary(string year, long fortno, string kind = "daily")
    {
        var p = FortParams(year, fortno);
        byte[] b = kind.ToLowerInvariant() switch
        {
            "total" => await cr.Render("bill_summary_only", HeaderSel(year, fortno), p),
            "cow" => await cr.Render("bill_summary_cow", $"{{MILK_SUPPLIER.CB}} = 'C' AND " + DetailSel(year, fortno), p, () => BillViews(year, fortno), true),
            "buffalo" => await cr.Render("bill_summary_buff", $"{{MILK_SUPPLIER.CB}} = 'B' AND " + DetailSel(year, fortno), p, () => BillViews(year, fortno), true),
            "shivamrut" => await cr.Render("bill_summary2", DetailSel(year, fortno), p,
                () => db.Proc("milk_shiv_proc", new { yearcode = year, frtno = fortno }), true),
            _ => await cr.Render("bill_summary", HeaderSel(year, fortno), p, () => BillViews(year, fortno))
        };
        return await Pdf(Task.FromResult(b), $"summary_{kind}_{fortno}");
    }

    // repo_milk_ledger: ledger, receivable/payable list (yanedene), feed purchase & issue (CAFEED)
    [HttpGet("ledger")]
    public async Task<IActionResult> Ledger(DateTime from, DateTime to, long? ded, long? code, string mode = "detail")
    {
        if (mode == "cattle")
            return await Pdf(cr.Render("milk_cattel_Led", null, Array.Empty<CrParam>(),
                () => db.Proc("milk_cattel_proc", new Dictionary<string, object?> { ["fromdate"] = from.Date, ["todate"] = to.Date, ["ledger"] = null, ["subledger"] = code is > 0 ? code : null })),
                "feed_ledger");
        if (ded is null or 0) throw new AppException("Invalid data");
        return await Pdf(cr.Render(mode == "list" ? "milk_Sub_Led_list" : "milk_Sub_Led", null, new[] { CrParam.Date("pdate", to.Date) },
            () => db.Proc("milk_ledger_proc", new Dictionary<string, object?> { ["fromdate"] = from.Date, ["todate"] = to.Date, ["ledger"] = ded, ["subledger"] = code is > 0 ? code : null })),
            mode == "list" ? "yene_dene_list" : "ledger");
    }

    // repo_rate_chart* (Print after the optional "Process Rate ?")
    [HttpGet("ratechart")]
    public async Task<IActionResult> RateChart(string type, DateTime from, DateTime to, long? dairy)
    {
        var p = new List<CrParam> { CrParam.Date("start_date", from.Date), CrParam.Date("to_date", to.Date) };
        var rpt = type.ToLowerInvariant() switch { "anudan9" => "milk_rate_chart9", "buffalo" => "milk_rate_chart_B", _ => "milk_rate_chart" };
        if (rpt != "milk_rate_chart") p.Add(CrParam.Num("dairy", dairy ?? 0));
        return await Pdf(cr.Render(rpt, null, p, null, true), "rate_chart");
    }

    // repo_chk_llist
    [HttpGet("checklist")]
    public async Task<IActionResult> CheckList(int type) =>
        await Pdf(cr.Render(type == 2 ? "milk_supplier_chk_lst" : "milk_fortnight_chk_lst", null, Array.Empty<CrParam>()), "master_list");
}
