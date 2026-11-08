using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.IdentityModel.Tokens;
using Oracle.ManagedDataAccess.Client;

namespace MilkBilling.Api.Infrastructure;

/// <summary>A validation/business error whose message is shown to the user (the VB MsgBox equivalent).</summary>
public class AppException(string message, int status = 400) : Exception(message)
{
    public int Status { get; } = status;
}

public class ErrorMiddleware(RequestDelegate next, ILogger<ErrorMiddleware> log)
{
    public async Task Invoke(HttpContext ctx)
    {
        try
        {
            await next(ctx);
        }
        catch (Exception ex) when (!ctx.Response.HasStarted)
        {
            int status;
            string message;
            switch (ex)
            {
                case AppException a:
                    status = a.Status; message = a.Message; break;
                case OracleException o when o.Number == 1:
                    status = 409; message = "Record already exists (duplicate entry). " + o.Message; break;
                case OracleException o when o.Number == 2292:
                    status = 409; message = "Record is in use and cannot be deleted. " + o.Message; break;
                case OracleException o when o.Number is >= 20000 and <= 20999:
                    // message written by a procedure for the user (raise_application_error)
                    status = 400; message = System.Text.RegularExpressions.Regex.Replace(o.Message.Split('\n')[0], @"^ORA-\d+:\s*", ""); break;
                case OracleException o:
                    log.LogError(ex, "Oracle error");
                    status = 500; message = o.Message; break;
                default:
                    log.LogError(ex, "Unhandled error");
                    status = 500; message = ex.Message; break;
            }
            ctx.Response.StatusCode = status;
            ctx.Response.ContentType = "application/json";
            await ctx.Response.WriteAsync(JsonSerializer.Serialize(new { message }));
        }
    }
}

public record AppUser(string UserName, string Password, string? DisplayName);

public class TokenService(IConfiguration cfg)
{
    public AppUser? Validate(string user, string password)
    {
        var users = cfg.GetSection("Auth:Users").Get<AppUser[]>() ?? Array.Empty<AppUser>();
        return users.FirstOrDefault(u =>
            string.Equals(u.UserName, user?.Trim(), StringComparison.OrdinalIgnoreCase) && u.Password == password);
    }

    public string Create(AppUser user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(cfg["Auth:JwtKey"]!));
        var hours = cfg.GetValue("Auth:TokenHours", 12);
        var token = new JwtSecurityToken(
            claims: new[] { new Claim(ClaimTypes.Name, user.UserName), new Claim("display", user.DisplayName ?? user.UserName) },
            expires: DateTime.UtcNow.AddHours(hours),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

public static class Num
{
    /// <summary>VB Round() used on amounts: away from zero to the given digits.</summary>
    public static decimal R(decimal v, int d = 2) => Math.Round(v, d, MidpointRounding.AwayFromZero);

    private static readonly string[] Ones = { "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
        "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen" };
    private static readonly string[] Tens = { "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety" };

    private static string Two(long n) => n < 20 ? Ones[n] : Tens[n / 10] + (n % 10 > 0 ? " " + Ones[n % 10] : "");
    private static string Three(long n) => n >= 100 ? Ones[n / 100] + " Hundred" + (n % 100 > 0 ? " " + Two(n % 100) : "") : Two(n);

    /// <summary>Amount in words, Indian numbering (lakh/crore) - replacement for Crystal's NoToWords.</summary>
    public static string ToWords(decimal amount)
    {
        amount = R(Math.Abs(amount));
        long rupees = (long)Math.Floor(amount);
        int paise = (int)((amount - rupees) * 100);
        if (rupees == 0 && paise == 0) return "Zero Only";
        var parts = new List<string>();
        long crore = rupees / 10000000, lakh = rupees / 100000 % 100, thousand = rupees / 1000 % 100, rest = rupees % 1000;
        if (crore > 0) parts.Add(Three(crore) + " Crore");
        if (lakh > 0) parts.Add(Two(lakh) + " Lakh");
        if (thousand > 0) parts.Add(Two(thousand) + " Thousand");
        if (rest > 0) parts.Add(Three(rest));
        var s = (rupees > 0 ? "Rupees " + string.Join(" ", parts) : "");
        if (paise > 0) s += (s.Length > 0 ? " and " : "") + Two(paise) + " Paise";
        return s + " Only";
    }
}
