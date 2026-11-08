using MilkBilling.Api.Data;
using MilkBilling.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MilkBilling.Api.Controllers;

public record LoginRequest(string UserName, string Password);

[ApiController, Route("api/auth")]
public class AuthController(TokenService tokens) : ControllerBase
{
    /// <summary>Replaces cab_Logon.frm.</summary>
    [HttpPost("login"), AllowAnonymous]
    public IActionResult Login(LoginRequest req)
    {
        var user = tokens.Validate(req.UserName, req.Password)
                   ?? throw new AppException("Incorrect User Name Or Password", 401);
        return Ok(new { token = tokens.Create(user), userName = user.UserName, displayName = user.DisplayName ?? user.UserName });
    }
}

[ApiController, Route("api/session"), Authorize]
public class SessionController(Db db) : ControllerBase
{
    /// <summary>
    /// HT_setup.frm: the working date decides the fortnight (year code, fortnight no, start/end date)
    /// used by every entry screen and report.
    /// </summary>
    [HttpGet("fortnight")]
    public IActionResult Fortnight(DateTime date)
    {
        var row = db.Rows(@"select nfortno, dstart_date, dend_date, vyear_code, vopen_fortnight from milk_fortnight
                            where :d between dstart_date and dend_date order by dstart_date", new { d = date.Date }).LastOrDefault();
        if (row == null) throw new AppException("No fortnight found for this date. Create a new fortnight first.", 404);
        return Ok(row);
    }
}

[ApiController, Route("api/lookups"), Authorize]
public class LookupController(Db db) : ControllerBase
{
    [HttpGet("suppliers")]
    public IActionResult Suppliers() => Ok(db.Rows(
        "select ncode, vname, eng_name, cb, ndairy, nacno, nmobile_no from milk_supplier order by ncode"));

    [HttpGet("villages")]
    public IActionResult Villages() => Ok(db.Rows(
        "select village_code, village_name from milk_village_master order by village_name"));

    [HttpGet("banks")]
    public IActionResult Banks() => Ok(db.Rows(
        "select bank_code, bank_name, bank_branch, ifsc_code from milk_bank_master order by bank_name"));

    [HttpGet("deductions")]
    public IActionResult Deductions() => Ok(db.Rows(
        "select ndeduction_code, vdeduction_name from milk_deduction_master order by vdeduction_name"));

    [HttpGet("items")]
    public IActionResult Items() => Ok(db.Rows(
        "select nprod_code, vprod_name, nrate, unit from milk_item_master order by vprod_name"));

    [HttpGet("years")]
    public IActionResult Years() => Ok(db.Rows(
        "select distinct vyear_code from milk_fortnight where vyear_code is not null order by vyear_code desc"));

    /// <summary>MILK_CATTEL_FEED_BALANCE view: feed items still in stock (bags &gt; 0), used by the Deduction screen.</summary>
    [HttpGet("feed-balance")]
    public IActionResult FeedBalance() => Ok(db.Rows(
        "select nprod_code, vprod_name, nrate, bag from milk_cattel_feed_balance where nvl(bag,0) > 0 order by nprod_code"));
}
