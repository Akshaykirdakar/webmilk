using System.Globalization;
using MilkBilling.Api.Data;
using MilkBilling.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MilkBilling.Api.Controllers;

public record SmsNext(string Device, string? Name);
public record SmsReport(string Device, long Id, bool Ok, string? Error);
public record SmsSettings(bool Enabled, string? TestNo, int DailyLimit);
public record SmsSwitch(bool Enabled);

/// <summary>
/// SMS after a milk entry. Save puts the message in MILK_SMS_QUEUE; the Android app (android\) on the data-entry phones
/// asks for it and sends it from its own SIM. The phone that made the entry goes first; when it reached its daily limit
/// or is off, any other phone takes the message. Status: P waiting, C with a phone, S sent, F failed, X cancelled / too old.
/// </summary>
public static class Sms
{
    public const int ExpireHours = 12, OfflineMinutes = 3, MaxAttempts = 3;
    private static string N(decimal? v) => (v ?? 0).ToString("0.##", CultureInfo.InvariantCulture);

    public static string Text(string? head, DateTime date, int time, long code, decimal? ltr, decimal? fat, decimal? snf, decimal? rate, decimal? amount) =>
        (string.IsNullOrEmpty(head) ? "" : head + "\n") +
        $"Date: {date:dd'/'MM'/'yyyy}\nShift: {(time == 1 ? "Morning" : "Evening")}\nSOC Code: {code}\nLitre: {N(ltr)}\nFat: {N(fat)}\nSNF: {N(snf)}\nRate: {N(rate)}\nAmount: {N(amount)}";

    /// <summary>Never stops the entry: a problem here only means no SMS for this entry.</summary>
    public static void Queue(Db db, ILogger log, long no, long code, string text, string? device)
    {
        try
        {
            using var s = db.Session();
            if (s.ScalarDec("select nvl(max(nenabled),0) from milk_sms_setting") != 1) return;
            var mobile = Convert.ToString(s.Scalar("select to_char(nmobile_no) from milk_supplier where ncode = :c", new { c = code }));
            // an older message of this entry that has not gone yet is replaced
            s.Exec("update milk_sms_queue set vstatus = 'X', verror = 'replaced' where ntrans_no = :no and vstatus = 'P'", new { no });
            if (mobile == null || mobile.Length != 10) return;
            s.Exec(@"insert into milk_sms_queue (nid, vmobile, vtext, ncode, ntrans_no, vpref)
                     values (milk_sms_seq.nextval, :m, :t, :c, :no, :d)",
                new Dictionary<string, object?> { ["m"] = mobile, ["t"] = text, ["c"] = code, ["no"] = no, ["d"] = device });
        }
        catch (Exception ex) { log.LogWarning(ex, "SMS not queued"); }
    }
}

[ApiController, Route("api/sms"), Authorize]
public class SmsController(Db db) : ControllerBase
{
    private static readonly object Gate = new();

    /// <summary>The app asks for work: registers the phone, returns messages up to the phone's remaining limit.</summary>
    [HttpPost("next")]
    public IActionResult Next(SmsNext r)
    {
        if (string.IsNullOrWhiteSpace(r.Device)) throw new AppException("Device?");
        lock (Gate)
        {
            using var s = db.Session(true);
            var d = new { d = r.Device };
            if (s.Exec("update milk_sms_device set dlast_seen = sysdate, vname = nvl(:n, vname) where vdevice = :d",
                    new Dictionary<string, object?> { ["n"] = r.Name, ["d"] = r.Device }) == 0)
                s.Exec("insert into milk_sms_device (vdevice, vname, dlast_seen) values (:d, :n, sysdate)",
                    new Dictionary<string, object?> { ["d"] = r.Device, ["n"] = r.Name });
            var set = s.Row("select nenabled, vtest_no, ndaily_limit from milk_sms_setting where nid = 1")!;
            s.Exec($"update milk_sms_queue set vstatus = 'X', verror = 'too old' where vstatus in ('P','C') and dcreated < sysdate - {Sms.ExpireHours}/24");
            s.Exec($"update milk_sms_queue set vstatus = 'P' where vstatus = 'C' and dclaim < sysdate - {Sms.OfflineMinutes}/1440");
            var limit = (int)set.Dec("ndaily_limit");
            var used = (int)s.ScalarDec(@"select count(*) from milk_sms_queue where vdevice = :d and
                 ((vstatus = 'S' and dsent >= trunc(sysdate)) or vstatus = 'C')", d);
            var room = Math.Min(5, Math.Max(0, limit - used));
            var msgs = new List<object>();
            if (set.Dec("nenabled") == 1 && room > 0)
            {
                // this phone's own, any without a phone, and those of phones that are off or at their limit
                var rows = s.Rows($@"select nid, vmobile, vtext from (
                    select q.nid, q.vmobile, q.vtext from milk_sms_queue q
                     where q.vstatus = 'P' and (q.vpref = :d or q.vpref is null
                        or not exists (select 1 from milk_sms_device x where x.vdevice = q.vpref and x.dlast_seen >= sysdate - {Sms.OfflineMinutes}/1440)
                        or (select count(*) from milk_sms_queue y where y.vdevice = q.vpref and y.vstatus = 'S' and y.dsent >= trunc(sysdate)) >= :lim)
                     order by case when q.vpref = :d then 0 else 1 end, q.nid) where rownum <= :room",
                    new Dictionary<string, object?> { ["d"] = r.Device, ["lim"] = limit, ["room"] = room });
                var test = set.Str("vtest_no");
                foreach (var m in rows)
                {
                    s.Exec("update milk_sms_queue set vstatus = 'C', vdevice = :d, dclaim = sysdate where nid = :id",
                        new Dictionary<string, object?> { ["d"] = r.Device, ["id"] = m.Long("nid") });
                    msgs.Add(new { id = m.Long("nid"), to = test.Length > 0 ? test : m.Str("vmobile"), text = m.Str("vtext") });
                }
            }
            s.Commit();
            return Ok(new { enabled = set.Dec("nenabled") == 1, sentToday = used, limit, messages = msgs });
        }
    }

    [HttpPost("report")]
    public IActionResult Report(SmsReport r)
    {
        var p = new Dictionary<string, object?> { ["id"] = r.Id, ["d"] = r.Device };
        if (r.Ok) db.Exec("update milk_sms_queue set vstatus = 'S', dsent = sysdate, verror = null where nid = :id and vdevice = :d", p);
        else
        {
            p["e"] = (r.Error ?? "error").Length > 190 ? r.Error![..190] : r.Error ?? "error";
            p["max"] = Sms.MaxAttempts;
            db.Exec(@"update milk_sms_queue set nattempts = nattempts + 1, verror = :e,
                      vstatus = case when nattempts + 1 >= :max then 'F' else 'P' end where nid = :id and vdevice = :d", p);
        }
        return Ok(new { ok = true });
    }

    [HttpGet("status")]
    public IActionResult Status() => Ok(new
    {
        settings = db.Row("select nenabled, vtest_no, ndaily_limit from milk_sms_setting where nid = 1"),
        counts = db.Rows("select vstatus, count(*) n from milk_sms_queue where dcreated >= trunc(sysdate) group by vstatus"),
        devices = db.Rows(@"select d.vdevice, d.vname, d.dlast_seen, case when d.dlast_seen >= sysdate - 3/1440 then 1 else 0 end is_on,
                 (select count(*) from milk_sms_queue q where q.vdevice = d.vdevice and q.vstatus = 'S' and q.dsent >= trunc(sysdate)) sent
                 from milk_sms_device d order by d.dlast_seen desc"),
        recent = db.Rows(@"select * from (select q.nid, q.dcreated, q.dsent, q.ncode, q.vmobile, q.vstatus, q.verror, d.vname
                 from milk_sms_queue q, milk_sms_device d where q.vdevice = d.vdevice(+) order by q.nid desc) where rownum <= 40")
    });

    /// <summary>The Auto SMS button: asked once (nasked), then on / off. Off also stops what has not gone yet.</summary>
    [HttpGet("switch")]
    public IActionResult GetSwitch()
    {
        var r = db.Row("select nenabled, nasked from milk_sms_setting where nid = 1")!;
        return Ok(new { enabled = r.Dec("nenabled") == 1, asked = r.Dec("nasked") == 1 });
    }

    [HttpPost("switch")]
    public IActionResult SetSwitch(SmsSwitch r)
    {
        db.Exec("update milk_sms_setting set nenabled = :e, nasked = 1 where nid = 1", new Dictionary<string, object?> { ["e"] = r.Enabled ? 1 : 0 });
        if (!r.Enabled) db.Exec("update milk_sms_queue set vstatus = 'X', verror = 'auto SMS off' where vstatus = 'P'");
        return Ok(new { enabled = r.Enabled });
    }

    [HttpPost("settings")]
    public IActionResult Settings(SmsSettings r)
    {
        var test = (r.TestNo ?? "").Trim();
        if (test.Length > 0 && (test.Length != 10 && test.Length != 4 || !test.All(char.IsDigit))) throw new AppException("Test number: 10 digits");
        if (r.DailyLimit < 1) throw new AppException("Daily limit?");
        db.Exec("update milk_sms_setting set nenabled = :e, nasked = 1, vtest_no = :t, ndaily_limit = :l where nid = 1",
            new Dictionary<string, object?> { ["e"] = r.Enabled ? 1 : 0, ["t"] = test.Length > 0 ? test : null, ["l"] = r.DailyLimit });
        return Ok(new { message = "Saved" });
    }

    [HttpPost("retry")]
    public IActionResult Retry() => Ok(new
    {
        n = db.Exec("update milk_sms_queue set vstatus = 'P', nattempts = 0, verror = null, dcreated = sysdate where vstatus = 'F' and dcreated >= trunc(sysdate)")
    });
}
