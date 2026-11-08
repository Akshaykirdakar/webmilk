using MilkBilling.Api.Data;
using MilkBilling.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MilkBilling.Api.Controllers;

public record ProcessDto(string VyearCode, long Nfortno);

/// <summary>Bill Process / Bonus bill process / Anudan bill process (frm_milk_bill_proc, frm_milk_bonus_proc, frm_milk_bill_anudan).</summary>
[ApiController, Route("api/process"), Authorize]
public class ProcessController(Db db, ILogger<ProcessController> log) : ControllerBase
{
    private static readonly SemaphoreSlim Running = new(1, 1);

    [HttpPost("{kind}")]
    public async Task<IActionResult> Run(string kind, ProcessDto d)
    {
        var proc = kind.ToLowerInvariant() switch
        {
            "bill" => "milk_bill_proc2",
            "bonus" => "milk_bonus_proc2",
            "anudan" => "milk_bill_proc_anudan",
            _ => throw new AppException("Unknown process", 404)
        };
        if (string.IsNullOrWhiteSpace(d.VyearCode) || d.Nfortno <= 0) throw new AppException("Select working date first");
        if (!await Running.WaitAsync(0)) throw new AppException("Another bill process is running. Please wait and try again.", 409);
        try
        {
            var started = DateTime.Now;
            await Task.Run(() => db.Proc(proc, new { yearcode = d.VyearCode, frtno = d.Nfortno }));
            log.LogInformation("{Proc}({Year},{Fort}) by {User} in {Sec:n1}s", proc, d.VyearCode, d.Nfortno, User.Identity?.Name,
                (DateTime.Now - started).TotalSeconds);
            return Ok(new { message = "Process Completed Successfully" });
        }
        finally { Running.Release(); }
    }
}

public record RateChartDto(string Type, DateTime From, DateTime To, long? Dairy,
    decimal Rate3585, decimal Diff30, decimal Diff29, decimal Diff80, decimal Rate3579, decimal Diff3079, decimal Diff2979,
    decimal Diff79, decimal Rate3685, decimal Diff36, decimal Rate3679, decimal Diff3679, decimal Diff8582, decimal Diff7975,
    decimal Rate1, decimal Diff1, decimal Diff2, decimal Diff3, decimal Diff4, decimal Rate2, decimal Diff5, decimal Diff6);

/// <summary>
/// Rate charts (repo_rate_chart*.frm): generate MILK_FAT_SNF_RATE_MASTER through the rate procedures and print the chart.
/// type: cow (Cow 8.5), anudan (Cow 8.5 Anudan), anudan9 (Cow 9.0 Anudan, per dairy), buffalo (per dairy).
/// </summary>
[ApiController, Route("api/ratechart"), Authorize]
public class RateChartController(Db db) : ControllerBase
{
    private static string T(string type) => type?.ToLowerInvariant() switch
    {
        "cow" or "anudan" or "anudan9" or "buffalo" => type.ToLowerInvariant(),
        _ => throw new AppException("Unknown rate chart", 404)
    };

    [HttpGet("periods")]
    public IActionResult Periods(string type) => Ok(T(type) switch
    {
        "anudan9" => db.Rows(@"select drate_from_date, drate_to_date, ndairy from milk_fat_snf_rate_master where cb = 1
                               group by drate_from_date, drate_to_date, ndairy order by drate_from_date desc, ndairy"),
        "buffalo" => db.Rows(@"select drate_from_date, drate_to_date, ndairy from milk_fat_snf_rate_master where cb = 2
                               group by drate_from_date, drate_to_date, ndairy order by drate_from_date desc, ndairy"),
        _ => db.Rows(@"select drate_from_date, drate_to_date from milk_fat_snf_rate_master
                       group by drate_from_date, drate_to_date order by drate_from_date desc")
    });

    /// <summary>txtfromdate_LostFocus: warn when the new period starts before the latest existing rate period.</summary>
    [HttpGet("check-from")]
    public IActionResult CheckFrom(string type, DateTime from)
    {
        var max = db.Scalar(T(type) == "buffalo"
            ? "select max(drate_from_date) from milk_fat_snf_rate_master where cb = 2"
            : "select max(drate_from_date) from milk_fat_snf_rate_master") as DateTime?;
        return Ok(new { maxFrom = max, ok = max == null || from.Date >= max.Value.Date });
    }

    [HttpPost("process")]
    public IActionResult Process(RateChartDto d)
    {
        var type = T(d.Type);
        if (d.To.Date < d.From.Date) throw new AppException("To date should not be before From date");
        var baseRate = type == "buffalo" ? d.Rate1 : d.Rate3585;
        if (baseRate <= 0) throw new AppException("invalid Rate process not allowed");
        var common = new Dictionary<string, object?>
        {
            ["sdate"] = d.From.Date, ["tdate"] = d.To.Date
        };
        switch (type)
        {
            case "buffalo":
                if (d.Dairy is null or 0) throw new AppException("Select dairy");
                foreach (var (k, v) in new (string, object?)[] { ("mrate1", d.Rate1), ("mdiff1", d.Diff1), ("mdiff2", d.Diff2), ("mdiff3", d.Diff3),
                    ("mdiff4", d.Diff4), ("mrate2", d.Rate2), ("mdiff5", d.Diff5), ("mdiff6", d.Diff6), ("dairy", d.Dairy) }) common[k] = v;
                db.Proc("milk_rate_chart_b", common);
                break;
            default:
                foreach (var (k, v) in new (string, object?)[] { ("mrate3585", d.Rate3585), ("mdiff30", d.Diff30), ("mdiff29", d.Diff29),
                    ("mdiff80", d.Diff80), ("mrate3579", d.Rate3579), ("mdiff3079", d.Diff3079), ("mdiff2979", d.Diff2979), ("mdiff79", d.Diff79),
                    ("mrate3685", d.Rate3685), ("mdiff36", d.Diff36), ("mrate3679", d.Rate3679), ("mdiff3679", d.Diff3679) }) common[k] = v;
                if (type == "anudan9")
                {
                    if (d.Dairy is null or 0) throw new AppException("Select dairy");
                    common["mdiff8582"] = d.Diff8582; common["mdiff7975"] = d.Diff7975; common["dairy"] = d.Dairy;
                    db.Proc("milk_rate_chartanu9", common);
                }
                else db.Proc(type == "anudan" ? "milk_rate_chartanu" : "milk_rate_chart", common);
                break;
        }
        return Ok(new { message = "Rate processed" });
    }

    [HttpDelete]
    public IActionResult Delete(string type, DateTime from, DateTime to, long? dairy)
    {
        type = T(type);
        var p = new Dictionary<string, object?> { ["f"] = from.Date, ["t"] = to.Date };
        var extra = "";
        if (type == "anudan9") { extra = " and cb = 1 and ndairy = :dairy"; p["dairy"] = dairy ?? 0; }
        if (type == "buffalo") extra = " and cb = 2";
        var n = db.Exec($"delete from milk_fat_snf_rate_master where drate_from_date = :f and drate_to_date = :t{extra}", p);
        return Ok(new { deleted = n, message = "Record Deleted!" });
    }

    /// <summary>Data for the printed chart (fat rows x snf columns), same filters as milk_rate_chart*.rpt.</summary>
    [HttpGet("chart")]
    public IActionResult Chart(string type, DateTime from, DateTime to, long? dairy)
    {
        type = T(type);
        var p = new Dictionary<string, object?> { ["f"] = from.Date, ["t"] = to.Date };
        string filter = type switch
        {
            "buffalo" => " and nfat >= 5.6 and nsnf >= 8.5 and ndairy = :dairy",
            "anudan9" => " and nfat <= 5.5 and nsnf <= 9.0 and ndairy = :dairy",
            _ => " and nfat <= 5.5 and nsnf <= 9.0"
        };
        if (filter.Contains(":dairy")) p["dairy"] = dairy ?? 0;
        var rows = db.Rows($@"select nfat, nsnf, max(nrate) nrate from milk_fat_snf_rate_master
                              where drate_from_date >= :f and drate_to_date <= :t{filter}
                              group by nfat, nsnf order by nfat, nsnf", p);
        return Ok(new
        {
            fats = rows.Select(r => r.Dec("nfat")).Distinct().OrderBy(x => x),
            snfs = rows.Select(r => r.Dec("nsnf")).Distinct().OrderBy(x => x),
            rates = rows.Select(r => new { fat = r.Dec("nfat"), snf = r.Dec("nsnf"), rate = r.Dec("nrate") })
        });
    }
}
