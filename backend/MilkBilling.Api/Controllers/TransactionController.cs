using MilkBilling.Api.Data;
using MilkBilling.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MilkBilling.Api.Controllers;

public record TxDto(long? NtransactionNo, long Ncode, DateTime? Ddate, long? NdedCode, decimal? Ndedamt, string? Vnar,
    long? NprodCode, decimal? Nbag, decimal? Nrate, string? VyearCode, long? Nfortno);

/// <summary>
/// Supplier account transactions:
///  purchase  - Cattle Feed Purchase   (frm_item_DEDUCTION_purch.frm)  MILK_ITEM_PURCHASE
///  deduction - Deduction              (frm_milk_DEDUCTION.frm)        MILK_DEDUCTION_2
///  jama      - Deduction Cash Jama    (frm_milk_DEDUCTION_jama.frm)   MILK_DEDUCTION_JAMA
///  adj       - Deduction Adjustment   (frm_milk_DEDUCTION_adj.frm)    MILK_DED_ADJ
/// </summary>
[ApiController, Route("api/tx/{kind}"), Authorize]
public class TransactionController(Db db) : ControllerBase
{
    private static string Table(string kind) => kind.ToLowerInvariant() switch
    {
        "purchase" => "milk_item_purchase",
        "deduction" => "milk_deduction_2",
        "jama" => "milk_deduction_jama",
        "adj" => "milk_ded_adj",
        _ => throw new AppException("Unknown transaction type", 404)
    };

    [HttpGet]
    public IActionResult List(string kind, long code)
    {
        var t = Table(kind);
        var sql = kind.Equals("purchase", StringComparison.OrdinalIgnoreCase)
            ? $@"select p.ntransaction_no, p.ddate, p.nprod_code, i.vprod_name as name, p.nbag, p.nrate, p.ndedamt, p.vnar
                 from {t} p, milk_item_master i where p.nprod_code = i.nprod_code(+) and p.ncode = :code order by p.ddate desc, p.ntransaction_no desc"
            : $@"select p.ntransaction_no, p.ddate, p.nded_code, m.vdeduction_name as name, p.ndedamt, p.vnar
                 from {t} p, milk_deduction_master m where p.nded_code = m.ndeduction_code(+) and p.ncode = :code order by p.ddate desc, p.ntransaction_no desc";
        return Ok(db.Rows(sql, new { code }));
    }

    [HttpGet("{no:long}")]
    public IActionResult Get(string kind, long no) => Ok(db.Row($"select * from {Table(kind)} where ntransaction_no = :no", new { no })
                                                         ?? throw new AppException("Record Not Found", 404));

    /// <summary>Deduction Adj.: bills of the working fortnight (ListView3) to pick feed / advance amounts from.</summary>
    [HttpGet("/api/tx/adj-bills")]
    public IActionResult AdjBills(string year, long fortno) => Ok(db.Rows(@"
        select h.nbillno, h.ncode, s.vname, h.nltr, h.nrate, h.nmilk_amount, h.nfeed, h.nadv, h.nbonus_anamat, h.ndeduction, h.nnet_amount,
               h.nfeed_opbal, h.nadv_opbal
        from milk_bill_header h, milk_supplier s where h.ncode = s.ncode and h.vyear_code = :year and h.nfortno = :fortno order by h.ncode",
        new { year, fortno }));

    [HttpPost]
    public IActionResult Save(string kind, TxDto d)
    {
        var t = Table(kind);
        kind = kind.ToLowerInvariant();
        if (d.Ncode <= 0) throw new AppException("Select supplier");
        if (d.Ddate is null) throw new AppException("Invalid date");
        var p = new Dictionary<string, object?> { ["code"] = d.Ncode, ["d"] = d.Ddate.Value.Date, ["nar"] = string.IsNullOrWhiteSpace(d.Vnar) ? null : d.Vnar };
        string cols, vals, set;
        switch (kind)
        {
            case "purchase":
                if (d.NprodCode is null or 0) throw new AppException("Select item");
                var amt = d.Ndedamt ?? Num.R((d.Nbag ?? 0) * (d.Nrate ?? 0), 0);
                if (amt == 0) throw new AppException("Invalid data");
                p["ded"] = 1; p["amt"] = amt; p["prod"] = d.NprodCode; p["bag"] = d.Nbag ?? 0; p["rate"] = d.Nrate ?? 0;
                cols = "ncode, ddate, nded_code, ndedamt, vnar, nprod_code, nbag, nrate";
                vals = ":code, :d, :ded, :amt, :nar, :prod, :bag, :rate";
                break;
            case "deduction":
                if (d.NdedCode is null or 0) throw new AppException("Select recovery type");
                if (d.NdedCode == 1 && d.NprodCode is null or 0) throw new AppException("Select cattle feed type");
                var damt = d.NdedCode == 1 && d.Nbag is > 0 ? (d.Nbag ?? 0) * (d.Nrate ?? 0) : d.Ndedamt ?? 0;
                if (damt == 0) throw new AppException("Invalid data");
                p["ded"] = d.NdedCode; p["amt"] = damt;
                p["prod"] = d.NdedCode == 1 ? d.NprodCode : null; p["rate"] = d.NdedCode == 1 ? d.Nrate ?? 0 : 0; p["bag"] = d.NdedCode == 1 ? d.Nbag ?? 0 : 0;
                cols = "ncode, ddate, nded_code, ndedamt, vnar, nprod_code, nrate, nbag";
                vals = ":code, :d, :ded, :amt, :nar, :prod, :rate, :bag";
                break;
            case "jama":
                if (d.NdedCode is null or 0) throw new AppException("Select recovery type");
                if (d.Ndedamt is null or 0) throw new AppException("Invalid data");
                p["ded"] = d.NdedCode; p["amt"] = d.Ndedamt;
                cols = "ncode, ddate, nded_code, ndedamt, vnar";
                vals = ":code, :d, :ded, :amt, :nar";
                break;
            default: // adj
                if (d.NdedCode is null or 0) throw new AppException("Select recovery type");
                if (string.IsNullOrEmpty(d.VyearCode) || d.Nfortno is null) throw new AppException("Working fortnight missing");
                p["ded"] = d.NdedCode; p["amt"] = d.Ndedamt ?? 0; p["y"] = d.VyearCode; p["fno"] = d.Nfortno;
                cols = "ncode, ddate, nded_code, ndedamt, vnar, vyear_code, nfortno";
                vals = ":code, :d, :ded, :amt, :nar, :y, :fno";
                break;
        }
        set = string.Join(", ", cols.Split(',').Zip(vals.Split(','), (c, v) => c.Trim() + " = " + v.Trim()));

        using var s = db.Session(true);
        long no;
        if (d.NtransactionNo is null or 0)
        {
            no = (long)s.ScalarDec($"select nvl(max(ntransaction_no),0) + 1 from {t}");
            p["no"] = no;
            s.Exec($"insert into {t} (ntransaction_no, {cols}) values (:no, {vals})", p);
        }
        else
        {
            no = d.NtransactionNo.Value;
            p["no"] = no;
            if (s.Exec($"update {t} set {set} where ntransaction_no = :no", p) == 0) throw new AppException("Record Not Found", 404);
        }
        s.Commit();
        return Ok(new { ntransactionNo = no, message = "Record Saved" });
    }

    [HttpDelete("{no:long}")]
    public IActionResult Delete(string kind, long no)
    {
        db.Exec($"delete from {Table(kind)} where ntransaction_no = :no", new { no });
        return Ok(new { message = "Record Deleted!" });
    }
}
