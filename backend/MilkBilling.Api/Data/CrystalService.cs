using System.Diagnostics;
using System.Text.Json;
using MilkBilling.Api.Infrastructure;

namespace MilkBilling.Api.Data;

public record CrParam(string Name, string Type, object? Value)
{
    public static CrParam Date(string n, DateTime d) => new(n, "date", d.ToString("yyyy-MM-dd"));
    public static CrParam Num(string n, decimal v) => new(n, "number", v);
    public static CrParam Str(string n, string v) => new(n, "string", v);
}

/// <summary>
/// Prints the original Crystal Reports files (reports\*.rpt) to PDF through the 32-bit Crystal Reports 8.5 runtime
/// (crystal\crexport.ps1), then embeds the DVB-TT Marathi fonts with Ghostscript so the PDF shows correctly on any PC.
/// </summary>
public class CrystalService(IConfiguration cfg, IWebHostEnvironment env, ILogger<CrystalService> log)
{
    private static readonly SemaphoreSlim One = new(1, 1);
    private string C(string k, string def = "") => cfg[$"Crystal:{k}"] ?? def;
    private string Abs(string p) => Path.IsPathRooted(p) ? p : Path.GetFullPath(Path.Combine(env.ContentRootPath, p));

    /// <summary>Ghostscript: the configured path, else the copy shipped with the program (gs\), else the default install.</summary>
    private string Gs()
    {
        foreach (var p in new[] { C("Ghostscript"), "gs/gswin64c.exe", @"C:\Program Files\gs\gs10.07.0\bin\gswin64c.exe" })
            if (!string.IsNullOrWhiteSpace(p) && File.Exists(Abs(p))) return Abs(p);
        return Abs(C("Ghostscript", "gs/gswin64c.exe"));
    }

    /// <summary>Runs prepare (procedures / views) and the report under one lock, as the report reads shared tables.</summary>
    public async Task<byte[]> Render(string report, string? selection, IEnumerable<CrParam> parameters, Action? prepare = null, bool factoryTitle = false)
    {
        var rpt = Path.Combine(Abs(C("ReportsPath", "reports")), report + ".rpt");
        if (!File.Exists(rpt)) throw new AppException("Report file not found: " + rpt, 404);
        var work = Path.Combine(Path.GetTempPath(), "milkbilling-reports");
        Directory.CreateDirectory(work);
        var id = Guid.NewGuid().ToString("N");
        var raw = Path.Combine(work, id + "_raw.pdf");
        var final = Path.Combine(work, id + ".pdf");
        var jobFile = Path.Combine(work, id + ".json");

        await Db.ScratchLock.WaitAsync();
        await One.WaitAsync();
        try
        {
            prepare?.Invoke();
            var job = new
            {
                rpt, @out = raw, selection, title = factoryTitle ? "" : C("ReportTitle"),
                server = C("Server", "bgkdata"), user = C("User", "bgk"), password = C("Password", "bgk"),
                oracleBin = C("OracleBin"), tnsAdmin = C("TnsAdmin"),
                @params = parameters.Select(p => new { name = p.Name, type = p.Type, value = p.Value })
            };
            await File.WriteAllTextAsync(jobFile, JsonSerializer.Serialize(job));
            var (code, output) = await Run(C("PowerShell32", @"C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"),
                $"-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"{Abs(C("Script", "crystal/crexport.ps1"))}\" -job \"{jobFile}\"", 180);
            if (code != 0 || !File.Exists(raw))
                throw new AppException("Crystal report error: " + output.Replace("ERROR:", "").Trim(), 500);
        }
        finally { One.Release(); Db.ScratchLock.Release(); TryDelete(jobFile); }

        try
        {
            FixWidths(raw);
            var gs = Gs();
            if (File.Exists(gs))
            {
                var fontmap = Abs(C("Fontmap", "crystal/Fontmap"));
                var (code, output) = await Run(gs,
                    $"-q -dNOPAUSE -dBATCH -dSAFER -sFONTMAP=\"{fontmap}\" -sDEVICE=pdfwrite -dEmbedAllFonts=true -dSubsetFonts=true -sOutputFile=\"{final}\" \"{raw}\"", 120);
                if (code == 0 && File.Exists(final)) return await File.ReadAllBytesAsync(final);
                log.LogWarning("Ghostscript failed ({Code}): {Out}", code, output);
            }
            return await File.ReadAllBytesAsync(raw); // fonts not embedded: shows correctly only where DVB fonts are installed
        }
        finally { TryDelete(raw); TryDelete(final); }
    }

    /// <summary>Report pages as JPEG images (phones cannot show a PDF inside a page).</summary>
    public async Task<List<string>> ToImages(byte[] pdf, int dpi = 110)
    {
        var gs = Gs();
        if (!File.Exists(gs)) throw new AppException("Ghostscript not installed on the server", 500);
        var dir = Path.Combine(Path.GetTempPath(), "milkbilling-reports", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var src = Path.Combine(dir, "r.pdf");
            await File.WriteAllBytesAsync(src, pdf);
            var (code, output) = await Run(gs, $"-q -dNOPAUSE -dBATCH -dSAFER -sDEVICE=jpeg -dJPEGQ=80 -r{dpi} -dTextAlphaBits=4 -dGraphicsAlphaBits=4 " +
                $"-sOutputFile=\"{Path.Combine(dir, "p%04d.jpg")}\" \"{src}\"", 180);
            if (code != 0) throw new AppException("Report image error: " + output, 500);
            var list = new List<string>();
            foreach (var f in Directory.GetFiles(dir, "p*.jpg").OrderBy(x => x))
                list.Add("data:image/jpeg;base64," + Convert.ToBase64String(await File.ReadAllBytesAsync(f)));
            return list;
        }
        finally { try { Directory.Delete(dir, true); } catch { /* */ } }
    }

    private static async Task<(int, string)> Run(string exe, string args, int seconds)
    {
        var psi = new ProcessStartInfo(exe, args)
        {
            UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true
        };
        using var p = Process.Start(psi) ?? throw new AppException("Cannot start " + exe, 500);
        var outTask = p.StandardOutput.ReadToEndAsync();
        var errTask = p.StandardError.ReadToEndAsync();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(seconds));
        try { await p.WaitForExitAsync(cts.Token); }
        catch (OperationCanceledException) { try { p.Kill(true); } catch { /* */ } throw new AppException("Report timed out", 504); }
        return (p.ExitCode, (await outTask) + (await errTask));
    }

    /// <summary>
    /// Crystal 8.5 writes the first TrueType font of a PDF with an empty width table (/FirstChar 0 /LastChar 0),
    /// which makes every letter of that font zero-width. Blank the entry (same length, so the xref stays valid);
    /// Ghostscript then takes the widths from the real font file.
    /// </summary>
    private static readonly System.Text.RegularExpressions.Regex BadWidths =
        new(@"/FirstChar\s+0\s+/LastChar\s+0\s+/Widths\s+\d+\s+0\s+R", System.Text.RegularExpressions.RegexOptions.Compiled);
    private static void FixWidths(string file)
    {
        var latin1 = System.Text.Encoding.Latin1;
        var s = latin1.GetString(File.ReadAllBytes(file));
        if (!BadWidths.IsMatch(s)) return;
        s = BadWidths.Replace(s, m => new string(m.Value.Select(ch => ch is '\r' or '\n' ? ch : ' ').ToArray()));
        File.WriteAllBytes(file, latin1.GetBytes(s));
    }

    private static void TryDelete(string f) { try { if (File.Exists(f)) File.Delete(f); } catch { /* */ } }
}
