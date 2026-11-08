using MilkBilling.Api.Data;
using MilkBilling.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MilkBilling.Api.Controllers;

public record MilkEntryDto(long? NtransNo, long Ncode, DateTime Ddate, int Ntime, decimal? Nfat, decimal? Nsnf, decimal? Nltr,
    long Nfortno, string VyearCode);

/// <summary>Daily Milk Collection (frmstudent_subject_MASTER.frm) on table MILK_INPUT.</summary>
[ApiController, Route("api/collection"), Authorize]
public class CollectionController(Db db, ILogger<CollectionController> log) : ControllerBase
{
    [HttpGet("entries")]
    public IActionResult Entries(DateTime date, int? time) => Ok(db.Rows($@"
        select t.ntrans_no, t.ddate, t.ntime, t.ncode, s.vname, t.nltr, t.nfat, t.nsnf, t.nrate, t.namount
        from milk_input t, milk_supplier s
        where t.ncode = s.ncode(+) and t.ddate = :d {(time is > 0 ? "and t.ntime = :t" : "")}
        order by t.ntrans_no desc", time is > 0 ? new { d = date.Date, t = time } : (object)new { d = date.Date }));

    /// <summary>Cow / buffalo / total litres and average fat, snf, rate for the date and shift (the totals panel).</summary>
    [HttpGet("summary")]
    public IActionResult Summary(DateTime date, int time)
    {
        var p = new { d = date.Date, t = time };
        var byType = db.Rows(@"select m.cb, nvl(sum(i.nltr),0) ltr, nvl(round(avg(i.nfat),1),0) fat, nvl(round(avg(i.nsnf),1),0) snf,
                                      nvl(round(avg(i.nrate),1),0) rate, nvl(sum(i.namount),0) amount, count(*) cnt
                               from milk_input i, milk_supplier m
                               where i.ncode = m.ncode and i.ddate = :d and i.ntime = :t and m.cb in ('C','B') group by m.cb", p);
        var total = db.Row(@"select nvl(sum(nltr),0) ltr, nvl(round(avg(nfat),1),0) fat, nvl(round(avg(nsnf),1),0) snf,
                                    nvl(round(avg(nrate),1),0) rate, nvl(sum(namount),0) amount, count(*) cnt
                             from milk_input where ddate = :d and ntime = :t", p);
        Row Empty() => new() { ["ltr"] = 0m, ["fat"] = 0m, ["snf"] = 0m, ["rate"] = 0m, ["amount"] = 0m, ["cnt"] = 0m };
        return Ok(new
        {
            cow = byType.FirstOrDefault(r => r.Str("cb") == "C") ?? Empty(),
            buffalo = byType.FirstOrDefault(r => r.Str("cb") == "B") ?? Empty(),
            total = total ?? Empty()
        });
    }

    /// <summary>One supplier's milk from the fortnight start date up to this entry (date + shift), without the
    /// entry being edited: sums and counts, so the form can add the values being typed and show totals / averages.</summary>
    [HttpGet("upto")]
    public IActionResult Upto(long code, DateTime from, DateTime date, int time, long? exclude) => Ok(db.Row(@"
        select count(*) cnt, nvl(sum(nltr),0) ltr, nvl(sum(nfat),0) fat, nvl(sum(nsnf),0) snf,
               nvl(sum(nrate),0) rate, nvl(sum(namount),0) amount
        from milk_input
        where ncode = :code and ddate >= :f and (ddate < :d or (ddate = :d and ntime <= :t)) and ntrans_no <> :x",
        new { code, f = from.Date, d = date.Date, t = time, x = exclude ?? -1 }));

    /// <summary>The same entries one by one (Details button): date, shift, fat, snf, litres, rate, amount.</summary>
    [HttpGet("upto/rows")]
    public IActionResult UptoRows(long code, DateTime from, DateTime date, int time) => Ok(db.Rows(@"
        select ntrans_no, ddate, ntime, nfat, nsnf, nltr, nrate, namount
        from milk_input
        where ncode = :code and ddate >= :f and (ddate < :d or (ddate = :d and ntime <= :t))
        order by ddate, ntime, ntrans_no",
        new { code, f = from.Date, d = date.Date, t = time }));

    /// <summary>Suppliers who gave milk on the previous day in this shift but have no entry today (the MILK_NON_CODE list).</summary>
    [HttpGet("absent")]
    public IActionResult Absent(DateTime date, int time) => Ok(db.Rows(@"
        select t.ncode, f.vname from
          (select ncode from milk_input where ddate = :prev and ntime = :t
           minus
           select ncode from milk_input where ddate = :d and ntime = :t) t, milk_supplier f
        where t.ncode = f.ncode order by t.ncode", new { prev = date.Date.AddDays(-1), d = date.Date, t = time }));

    private Row? RateRow(DbSession s, long code, DateTime date, decimal fat, decimal snf) => s.Row(@"
        select r.nrate, f.ndairy from milk_fat_snf_rate_master r, milk_supplier f
        where f.ncode = :code and :d >= r.drate_from_date and :d <= r.drate_to_date
          and r.nfat = :fat and r.nsnf = :snf and f.ndairy = r.ndairy and rownum = 1",
        new { code, d = date.Date, fat, snf });

    /// <summary>txtnsnf_LostFocus: rate for supplier's dairy, date, fat and snf.</summary>
    [HttpGet("rate")]
    public IActionResult Rate(long code, DateTime date, decimal fat, decimal snf, decimal? ltr)
    {
        using var s = db.Session();
        var inTable = s.ScalarDec("select count(*) from milk_fat_snf_rate_master where nfat = :fat and nsnf = :snf", new { fat, snf }) > 0;
        var r = RateRow(s, code, date, fat, snf);
        var rate = r == null ? 0m : Num.R(r.Dec("nrate"));
        return Ok(new
        {
            inTable,
            found = r != null,
            rate,
            dairy = r?.DecN("ndairy") ?? 0,
            amount = Num.R(rate * (ltr ?? 0)),
            message = inTable ? (r == null ? "No rate for this supplier's dairy on this date" : null) : "Rate for  Fat & Snf  not in rate table pl verify"
        });
    }

    [HttpGet("find")]
    public IActionResult Find(DateTime date, int time, long code) => Ok(db.Row(@"
        select t.ntrans_no, t.ddate, t.ntime, t.ncode, s.vname, t.nltr, t.nfat, t.nsnf, t.nclr, t.nrate, t.namount, t.nfortno, t.vyear_code
        from milk_input t, milk_supplier s where t.ncode = s.ncode(+) and t.ntime = :t and t.ncode = :code and t.ddate = :d",
        new { t = time, code, d = date.Date }) ?? throw new AppException("Record Not Found", 404));

    [HttpPost]
    public IActionResult Save(MilkEntryDto e)
    {
        if (e.Ntime is not (1 or 2)) throw new AppException("Select morning / evening");
        if (e.Ncode <= 0) throw new AppException("Select milk supplier");
        if (e.Nltr is null or 0) throw new AppException("Lit should not be zero..");
        if (e.Nfat is null) throw new AppException("Enter fat");
        if (e.Nsnf is null) throw new AppException("Enter SNF");

        using var s = db.Session(true);
        var fort = s.Row("select dstart_date, dend_date from milk_fortnight where vyear_code = :y and nfortno = :n",
                       new { y = e.VyearCode, n = e.Nfortno }) ?? throw new AppException("Fortnight not found");
        if (e.Ddate.Date < fort.Date("dstart_date") || e.Ddate.Date > fort.Date("dend_date"))
            throw new AppException("Invalid Date should be cuurent month or fortnight");
        if (s.ScalarDec("select count(*) from milk_supplier where ncode = :c", new { c = e.Ncode }) == 0)
            throw new AppException("Supplier not found");

        var r = RateRow(s, e.Ncode, e.Ddate, e.Nfat.Value, e.Nsnf.Value)
                ?? throw new AppException("Rate for  Fat & Snf  not in rate table pl verify");
        var rate = Num.R(r.Dec("nrate"));
        var amount = Num.R(e.Nltr.Value * rate);

        var dup = s.ScalarDec(@"select count(*) from milk_input where ncode = :c and ddate = :d and ntime = :t
                                and ntrans_no <> :no", new { c = e.Ncode, d = e.Ddate.Date, t = e.Ntime, no = e.NtransNo ?? -1 });
        if (dup > 0) throw new AppException("Entry for this supplier, date and time already exists. Use Change to modify it.");

        var p = new Dictionary<string, object?>
        {
            ["c"] = e.Ncode, ["d"] = e.Ddate.Date, ["t"] = e.Ntime, ["fat"] = e.Nfat, ["snf"] = e.Nsnf, ["ltr"] = e.Nltr,
            ["amt"] = amount, ["rate"] = rate, ["fno"] = e.Nfortno, ["y"] = e.VyearCode
        };
        long no;
        var smsHead = "";
        var smsSend = true;
        if (e.NtransNo is null or 0)
        {
            s.Exec(@"insert into milk_input (ntrans_no, ncode, ddate, ntime, nfat, nsnf, nclr, nltr, namount, nrate, nfortno, vyear_code)
                     select nvl(max(ntrans_no),0) + 1, :c, :d, :t, :fat, :snf, 0, :ltr, :amt, :rate, :fno, :y from milk_input", p);
            no = (long)s.ScalarDec("select ntrans_no from milk_input where ncode = :c and ddate = :d and ntime = :t",
                new { c = e.Ncode, d = e.Ddate.Date, t = e.Ntime });
        }
        else
        {
            no = e.NtransNo.Value;
            p["no"] = no;
            var old = s.Row("select ncode, ddate, ntime, nfat, nsnf, nltr, nrate from milk_input where ntrans_no = :no", new { no });
            smsHead = "Corrected";
            smsSend = old == null || old.Long("ncode") != e.Ncode || old.Date("ddate") != e.Ddate.Date || old.Long("ntime") != e.Ntime
                || old.Dec("nfat") != e.Nfat || old.Dec("nsnf") != e.Nsnf || old.Dec("nltr") != e.Nltr || old.Dec("nrate") != rate;   // Save without a change: no SMS
            var n = s.Exec(@"update milk_input set ncode = :c, ddate = :d, ntime = :t, nfat = :fat, nsnf = :snf, nclr = 0, nltr = :ltr,
                               namount = :amt, nrate = :rate, nfortno = :fno, vyear_code = :y where ntrans_no = :no", p);
            if (n == 0) throw new AppException("Record Not Found", 404);
        }
        s.Commit();
        if (smsSend) Sms.Queue(db, log, no, e.Ncode, Sms.Text(smsHead, e.Ddate, e.Ntime, e.Ncode, e.Nltr, e.Nfat, e.Nsnf, rate, amount), Request.Headers["X-Sms-Device"].FirstOrDefault());
        return Ok(new { ntransNo = no, rate, amount, dairy = r.DecN("ndairy"), message = "Record Saved" });
    }

    [HttpDelete("{no:long}")]
    public IActionResult Delete(long no)
    {
        var old = db.Row("select ncode, ddate, ntime, nfat, nsnf, nltr, nrate, namount from milk_input where ntrans_no = :no", new { no });
        db.Exec("delete from milk_input where ntrans_no = :no", new { no });
        if (old != null)
        {
            // not sent yet: it just does not go; already sent: the supplier is told
            var pending = db.Exec("update milk_sms_queue set vstatus = 'X', verror = 'entry deleted' where ntrans_no = :no and vstatus = 'P'", new { no });
            if (pending == 0 && Convert.ToInt32(db.Scalar("select count(*) from milk_sms_queue where ntrans_no = :no and vstatus in ('S','C')", new { no })) > 0)
                Sms.Queue(db, log, no, old.Long("ncode"), Sms.Text("Deleted", old.Date("ddate")!.Value, (int)old.Long("ntime"), old.Long("ncode"), old.Dec("nltr"), old.Dec("nfat"), old.Dec("nsnf"), old.Dec("nrate"), old.Dec("namount")), Request.Headers["X-Sms-Device"].FirstOrDefault());
        }
        return Ok(new { message = "Record Deleted!" });
    }
}
