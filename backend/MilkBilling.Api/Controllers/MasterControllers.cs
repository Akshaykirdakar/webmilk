using System.Text.Json;
using System.Text.RegularExpressions;
using MilkBilling.Api.Data;
using MilkBilling.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MilkBilling.Api.Controllers;

// ---------------------------------------------------------------- Fortnight (frmstudent_subject.frm)

public record FortnightDto(bool IsNew, long? Nfortno, string VyearCode, DateTime DstartDate, DateTime DendDate, string? VopenFortnight);

[ApiController, Route("api/fortnights"), Authorize]
public class FortnightController(Db db) : ControllerBase
{
    [HttpGet]
    public IActionResult List() => Ok(db.Rows(
        "select nfortno, vyear_code, dstart_date, dend_date, vopen_fortnight from milk_fortnight order by dstart_date desc, nfortno desc"));

    [HttpGet("{year}/{no:long}")]
    public IActionResult Get(string year, long no) => Ok(db.Row(
        "select nfortno, vyear_code, dstart_date, dend_date, vopen_fortnight from milk_fortnight where vyear_code = :year and nfortno = :no",
        new { year, no }) ?? throw new AppException("Record Not Found", 404));

    [HttpPost]
    public IActionResult Save(FortnightDto d)
    {
        if (!Regex.IsMatch(d.VyearCode ?? "", @"^\d{4}-\d{4}$")) throw new AppException("Year should be like 2026-2027");
        if (d.DendDate.Date < d.DstartDate.Date) throw new AppException("To date should not be before From date");
        using var s = db.Session(true);
        long no;
        if (d.IsNew)
        {
            no = d.Nfortno ?? (long)s.ScalarDec("select nvl(max(nfortno),0) + 1 from milk_fortnight");
            if (s.ScalarDec("select count(*) from milk_fortnight where nfortno = :no", new { no }) > 0)
                throw new AppException($"Fortnight no. {no} already exists");
            s.Exec(@"insert into milk_fortnight (nfortno, dstart_date, dend_date, vopen_fortnight, vyear_code)
                     values (:no, :f, :t, :o, :y)", new { no, f = d.DstartDate.Date, t = d.DendDate.Date, o = d.VopenFortnight, y = d.VyearCode });
        }
        else
        {
            no = d.Nfortno ?? throw new AppException("Fortnight no. required");
            var n = s.Exec(@"update milk_fortnight set dstart_date = :f, dend_date = :t, vopen_fortnight = :o, vyear_code = :y
                             where nfortno = :no", new { no, f = d.DstartDate.Date, t = d.DendDate.Date, o = d.VopenFortnight, y = d.VyearCode });
            if (n == 0) throw new AppException("Record Not Found", 404);
        }
        s.Commit();
        return Ok(new { nfortno = no, message = "Record Saved" });
    }

    [HttpDelete("{year}/{no:long}")]
    public IActionResult Delete(string year, long no)
    {
        db.Exec("delete from milk_fortnight where vyear_code = :year and nfortno = :no", new { year, no });
        return Ok(new { message = "Record Deleted!" });
    }
}

// ---------------------------------------------------------------- Milk supplier (frmCDO_MAIN_YOJANA_MASTER.frm)

public record SupplierDto(bool IsNew, long? Ncode, string? Vname, string? EngName, string? Nacno, string? NmobileNo, string? Aharno,
    string? CowType, string? Idno, string? Cb, long? VillCode, long? BankCode, string? BankBranch, string? IfscCode, long? Ndairy,
    List<string>? Tags);

[ApiController, Route("api/suppliers"), Authorize]
public class SupplierController(Db db) : ControllerBase
{
    private const string Cols = @"s.ncode, s.vname, s.eng_name, to_char(s.nacno) nacno, to_char(s.nmobile_no) nmobile_no, to_char(s.aharno) aharno,
        s.cow_type, s.idno, s.cb, s.vill_code, s.bank_code, s.bank_branch, s.ifsc_code, s.ndairy";

    [HttpGet]
    public IActionResult List() => Ok(db.Rows($@"select {Cols}, v.village_name, b.bank_name
        from milk_supplier s, milk_village_master v, milk_bank_master b
        where s.vill_code = v.village_code(+) and s.bank_code = b.bank_code(+) order by s.ncode"));

    [HttpGet("{code:long}")]
    public IActionResult Get(long code)
    {
        var row = db.Row($"select {Cols} from milk_supplier s where s.ncode = :code", new { code })
                  ?? throw new AppException("Record Not Found", 404);
        row["tags"] = db.Rows("select to_char(tagno) tagno from anudan_tag_master where code = :code order by tagno", new { code })
            .Select(r => r.Str("tagno")).ToList();
        return Ok(row);
    }

    private static decimal? Digits(string? v, string field)
    {
        if (string.IsNullOrWhiteSpace(v)) return null;
        v = v.Trim();
        if (!Regex.IsMatch(v, @"^\d{1,20}$")) throw new AppException($"{field} should contain digits only");
        return decimal.Parse(v);
    }

    private static string? N(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();

    [HttpPost]
    public IActionResult Save(SupplierDto d)
    {
        if (string.IsNullOrWhiteSpace(d.Vname)) throw new AppException("blank name");
        var p = new Dictionary<string, object?>
        {
            ["vname"] = d.Vname.Trim(), ["eng"] = N(d.EngName), ["acno"] = Digits(d.Nacno, "A/c No"),
            ["mob"] = Digits(d.NmobileNo, "Mobile No"), ["ahar"] = Digits(d.Aharno, "Aadhaar No"),
            ["cow"] = N(d.CowType), ["idno"] = N(d.Idno), ["cb"] = N(d.Cb)?.ToUpperInvariant(), ["vill"] = d.VillCode,
            ["bank"] = d.BankCode, ["branch"] = N(d.BankBranch), ["ifsc"] = N(d.IfscCode)?.ToUpperInvariant(), ["dairy"] = d.Ndairy
        };
        if (p["cb"] is string cb && cb != "C" && cb != "B") throw new AppException("C/B should be C (cow) or B (buffalo)");
        var tags = (d.Tags ?? new()).Select(t => t?.Trim()).Where(t => !string.IsNullOrEmpty(t)).Select(t => Digits(t, "Tag no")).ToList();

        using var s = db.Session(true);
        long code;
        if (d.IsNew)
        {
            code = d.Ncode ?? (long)s.ScalarDec("select nvl(max(ncode),0) + 1 from milk_supplier");
            if (code <= 0) throw new AppException("Invalid data");
            if (s.ScalarDec("select count(*) from milk_supplier where ncode = :code", new { code }) > 0)
                throw new AppException($"Supplier code {code} already exists");
            p["code"] = code;
            s.Exec(@"insert into milk_supplier (ncode, vname, eng_name, nacno, nmobile_no, aharno, cow_type, idno, cb, vill_code,
                       bank_code, bank_branch, ifsc_code, ndairy)
                     values (:code, :vname, :eng, :acno, :mob, :ahar, :cow, :idno, :cb, :vill, :bank, :branch, :ifsc, :dairy)", p);
        }
        else
        {
            code = d.Ncode ?? throw new AppException("Code required");
            p["code"] = code;
            var n = s.Exec(@"update milk_supplier set vname = :vname, eng_name = :eng, nacno = :acno, nmobile_no = :mob, aharno = :ahar,
                       cow_type = :cow, idno = :idno, cb = :cb, vill_code = :vill, bank_code = :bank, bank_branch = :branch,
                       ifsc_code = :ifsc, ndairy = :dairy where ncode = :code", p);
            if (n == 0) throw new AppException("Record Not Found", 404);
        }
        s.Exec("delete from anudan_tag_master where code = :code", new { code });
        foreach (var t in tags) s.Exec("insert into anudan_tag_master (code, tagno) values (:code, :t)", new { code, t });
        s.Commit();
        return Ok(new { ncode = code, message = "Record Saved" });
    }

    [HttpDelete("{code:long}")]
    public IActionResult Delete(long code)
    {
        using var s = db.Session(true);
        var used = s.ScalarDec(@"select (select count(*) from milk_input where ncode = :code) +
                                        (select count(*) from milk_bill_header where ncode = :code) from dual", new { code });
        if (used > 0) throw new AppException("This supplier has milk entries / bills and cannot be deleted.");
        s.Exec("delete from anudan_tag_master where code = :code", new { code });
        s.Exec("delete from milk_supplier where ncode = :code", new { code });
        s.Commit();
        return Ok(new { message = "Record Deleted!" });
    }
}

// ---------------------------------------------------------------- Small code/name masters
// Village (FRMvillage_MASTER), Bank (FRMbank_MASTER), Item (FRMDIS_PRODUCT_MASTER), Deduction (frmDEDUCTION_MASTER)

public record MasterField(string Col, bool Numeric, bool Required = false, bool NonZero = false, int MaxLen = 0, decimal? InsertDefault = null);
public record MasterDef(string Table, string Key, string OrderBy, MasterField[] Fields);

public record MasterSaveDto(bool IsNew, long? Key, Dictionary<string, JsonElement>? Values);

[ApiController, Route("api/masters/{kind}"), Authorize]
public class SimpleMasterController(Db db) : ControllerBase
{
    private static readonly Dictionary<string, MasterDef> Defs = new(StringComparer.OrdinalIgnoreCase)
    {
        ["village"] = new("milk_village_master", "village_code", "village_code",
            new[] { new MasterField("village_name", false, Required: true, MaxLen: 200) }),
        ["bank"] = new("milk_bank_master", "bank_code", "bank_code",
            new[] { new MasterField("bank_name", false, Required: true, MaxLen: 300), new MasterField("bank_branch", false, MaxLen: 200),
                    new MasterField("ifsc_code", false, MaxLen: 11) }),
        ["item"] = new("milk_item_master", "nprod_code", "nprod_code",
            new[] { new MasterField("vprod_name", false, Required: true, MaxLen: 400), new MasterField("unit", false, MaxLen: 10),
                    new MasterField("nrate", true, Required: true, NonZero: true),
                    new MasterField("nhsn_asc", true, InsertDefault: 0), new MasterField("nps", true, InsertDefault: 0) }),
        ["deduction"] = new("milk_deduction_master", "ndeduction_code", "ndeduction_code",
            new[] { new MasterField("vdeduction_name", false, MaxLen: 200), new MasterField("npriority_code", true),
                    new MasterField("ndeduction_value", true) }),
    };

    private static MasterDef Def(string kind) => Defs.TryGetValue(kind, out var d) ? d : throw new AppException("Unknown master", 404);

    [HttpGet]
    public IActionResult List(string kind)
    {
        var d = Def(kind);
        return Ok(db.Rows($"select {d.Key} as code, {string.Join(", ", d.Fields.Select(f => f.Col))} from {d.Table} order by {d.OrderBy}"));
    }

    [HttpPost]
    public IActionResult Save(string kind, MasterSaveDto dto)
    {
        var d = Def(kind);
        var vals = new Dictionary<string, object?>();
        foreach (var f in d.Fields)
        {
            object? v = null;
            if (dto.Values != null && dto.Values.TryGetValue(f.Col, out var je) && je.ValueKind != JsonValueKind.Null)
            {
                var txt = je.ValueKind == JsonValueKind.String ? je.GetString() : je.GetRawText();
                txt = txt?.Trim();
                if (!string.IsNullOrEmpty(txt))
                {
                    if (f.Numeric)
                        v = decimal.TryParse(txt, System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var n)
                            ? n : throw new AppException($"Invalid data ({f.Col})");
                    else
                    {
                        if (f.MaxLen > 0 && txt.Length > f.MaxLen) throw new AppException($"{f.Col} is too long (max {f.MaxLen})");
                        v = txt;
                    }
                }
            }
            if (f.Required && v == null) throw new AppException("This Field should not be empty");
            if (f.NonZero && (v is decimal z && z == 0)) throw new AppException("Invalid data");
            vals[f.Col] = v;
        }

        using var s = db.Session(true);
        long key;
        if (dto.IsNew)
        {
            key = dto.Key ?? (long)s.ScalarDec($"select nvl(max({d.Key}),0) + 1 from {d.Table}");
            if (key <= 0) throw new AppException("Invalid data");
            if (s.ScalarDec($"select count(*) from {d.Table} where {d.Key} = :k", new { k = key }) > 0)
                throw new AppException($"Code {key} already exists");
            foreach (var f in d.Fields) vals[f.Col] ??= f.InsertDefault;
            vals["k"] = key;
            s.Exec($"insert into {d.Table} ({d.Key}, {string.Join(", ", d.Fields.Select(f => f.Col))}) values (:k, {string.Join(", ", d.Fields.Select(f => ":" + f.Col))})", vals);
        }
        else
        {
            key = dto.Key ?? throw new AppException("Code required");
            var upd = d.Fields.Where(f => f.InsertDefault == null).ToArray();
            var p = upd.ToDictionary(f => f.Col, f => vals[f.Col]);
            p["k"] = key;
            var n = s.Exec($"update {d.Table} set {string.Join(", ", upd.Select(f => f.Col + " = :" + f.Col))} where {d.Key} = :k", p);
            if (n == 0) throw new AppException("Record Not Found", 404);
        }
        s.Commit();
        return Ok(new { code = key, message = "Record Saved" });
    }

    [HttpDelete("{key:long}")]
    public IActionResult Delete(string kind, long key)
    {
        var d = Def(kind);
        db.Exec($"delete from {d.Table} where {d.Key} = :k", new { k = key });
        return Ok(new { message = "Record Deleted!" });
    }
}
