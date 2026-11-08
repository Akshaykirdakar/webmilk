using System.Text;
using System.Text.Json;
using MilkBilling.Api.Data;
using MilkBilling.Api.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    // When installed as a Windows service the working directory is System32, so anchor to the exe folder.
    ContentRootPath = Microsoft.Extensions.Hosting.WindowsServices.WindowsServiceHelpers.IsWindowsService()
        ? AppContext.BaseDirectory : default
});
builder.Host.UseWindowsService(o => o.ServiceName = "MilkBillingApi");

builder.Services.AddSingleton<Db>();
builder.Services.AddSingleton<TokenService>();
builder.Services.AddSingleton<CrystalService>();
builder.Services.AddControllers().AddJsonOptions(o =>
{
    o.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    o.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
});

var jwtKey = builder.Configuration["Auth:JwtKey"] ?? throw new InvalidOperationException("Auth:JwtKey missing");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = false,
        ValidateAudience = false,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        ClockSkew = TimeSpan.FromMinutes(2)
    };
    // Allows file downloads (Excel / backup) opened via a plain link: ?access_token=...
    o.Events = new JwtBearerEvents
    {
        OnMessageReceived = ctx =>
        {
            var t = ctx.Request.Query["access_token"];
            if (!string.IsNullOrEmpty(t)) ctx.Token = t;
            return Task.CompletedTask;
        }
    };
});
builder.Services.AddAuthorization();

var origins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
{
    if (origins.Length == 0 || origins.Contains("*")) p.AllowAnyOrigin(); else p.WithOrigins(origins);
    p.AllowAnyHeader().AllowAnyMethod().WithExposedHeaders("Content-Disposition");
}));

var app = builder.Build();

app.UseMiddleware<ErrorMiddleware>();
app.UseCors();

// Optionally serve the separate frontend folder from the same port (no CORS needed then).
var frontendPath = builder.Configuration["Frontend:Path"];
if (!string.IsNullOrWhiteSpace(frontendPath))
{
    var full = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, frontendPath));
    if (Directory.Exists(full))
    {
        var fp = new PhysicalFileProvider(full);
        app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = fp });
        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = fp,
            // the phone app can be downloaded from http://server:5080/MilkBilling.apk
            ContentTypeProvider = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider { Mappings = { [".apk"] = "application/vnd.android.package-archive" } },
            // browsers must re-check the program files on every load (they are small; unchanged files answer 304),
            // otherwise an updated version is not seen until the browser cache expires
            OnPrepareResponse = ctx =>
            {
                var ext = Path.GetExtension(ctx.File.Name).ToLowerInvariant();
                if (ext is ".html" or ".js" or ".css" or ".json")
                    ctx.Context.Response.Headers.CacheControl = "no-cache";
            }
        });
        app.Logger.LogInformation("Serving frontend from {Path}", full);
    }
    else app.Logger.LogWarning("Frontend folder not found: {Path}", full);
}

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/api/health", (Db db) => Results.Ok(new { status = "ok", db = db.Ping() }));

app.Run();
