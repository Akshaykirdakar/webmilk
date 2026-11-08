using System.Data;
using System.Reflection;
using Oracle.ManagedDataAccess.Client;
using Oracle.ManagedDataAccess.Types;

namespace MilkBilling.Api.Data;

/// <summary>One result row; keys are lower-case column names (case-insensitive lookup).</summary>
public sealed class Row : Dictionary<string, object?>
{
    public Row() : base(StringComparer.OrdinalIgnoreCase) { }
    public decimal Dec(string k) => this.TryGetValue(k, out var v) && v != null ? Convert.ToDecimal(v) : 0m;
    public decimal? DecN(string k) => this.TryGetValue(k, out var v) && v != null ? Convert.ToDecimal(v) : null;
    public long Long(string k) => (long)Dec(k);
    public string Str(string k) => this.TryGetValue(k, out var v) && v != null ? Convert.ToString(v)!.Trim() : "";
    public DateTime? Date(string k) => this.TryGetValue(k, out var v) && v is DateTime d ? d : null;
}

public sealed class Db(IConfiguration cfg, ILogger<Db> log)
{
    private readonly string _cs = cfg.GetConnectionString("Oracle") ?? throw new InvalidOperationException("ConnectionStrings:Oracle missing");

    /// <summary>
    /// Several legacy procedures (ledger, cattle feed ledger, anudan adjust) and their reports share scratch
    /// tables (MILK_LEDGER, MILK_LEDGER_OP, MILK_BILL_HEADER_ANUDAN). Serialise "run proc + read result"
    /// so two web users cannot overwrite each other's report data.
    /// </summary>
    public static readonly SemaphoreSlim ScratchLock = new(1, 1);

    public DbSession Session(bool transaction = false)
    {
        var conn = new OracleConnection(_cs);
        conn.Open();
        return new DbSession(conn, transaction ? conn.BeginTransaction() : null);
    }

    public List<Row> Rows(string sql, object? p = null) { using var s = Session(); return s.Rows(sql, p); }
    public Row? Row(string sql, object? p = null) { using var s = Session(); return s.Row(sql, p); }
    public object? Scalar(string sql, object? p = null) { using var s = Session(); return s.Scalar(sql, p); }
    public int Exec(string sql, object? p = null) { using var s = Session(); return s.Exec(sql, p); }
    public void Proc(string name, object? p = null) { using var s = Session(); s.Proc(name, p); }

    public bool Ping()
    {
        try { return Convert.ToInt32(Scalar("select 1 from dual")) == 1; }
        catch (Exception ex) { log.LogError(ex, "DB ping failed"); return false; }
    }
}

public sealed class DbSession(OracleConnection conn, OracleTransaction? tx) : IDisposable
{
    public OracleConnection Connection => conn;

    private OracleCommand Cmd(string sql, object? p, CommandType type = CommandType.Text)
    {
        var c = conn.CreateCommand();
        c.BindByName = true;
        c.CommandText = sql;
        c.CommandType = type;
        c.CommandTimeout = 900;
        if (tx != null) c.Transaction = tx;
        if (p != null) AddParams(c, p);
        return c;
    }

    private static void AddParams(OracleCommand c, object p)
    {
        IEnumerable<KeyValuePair<string, object?>> pairs = p is IDictionary<string, object?> d
            ? d
            : p.GetType().GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .Select(pi => new KeyValuePair<string, object?>(pi.Name, pi.GetValue(p)));
        foreach (var (name, value) in pairs)
        {
            var op = new OracleParameter(name, value ?? DBNull.Value);
            switch (value)
            {
                case DateTime: op.OracleDbType = OracleDbType.Date; break;
                case decimal or double or float or int or long or short: op.OracleDbType = OracleDbType.Decimal; break;
                case string: op.OracleDbType = OracleDbType.Varchar2; break;
                case null: op.OracleDbType = OracleDbType.Varchar2; break;
            }
            c.Parameters.Add(op);
        }
    }

    private static object? Read(OracleDataReader r, int i)
    {
        if (r.IsDBNull(i)) return null;
        var t = r.GetFieldType(i);
        if (t == typeof(decimal))
        {
            // NUMBER without scale (e.g. AVG results) can exceed .NET decimal precision.
            var od = OracleDecimal.SetPrecision(r.GetOracleDecimal(i), 27);
            return od.Value;
        }
        var v = r.GetValue(i);
        return v is string s ? s.TrimEnd() : v;
    }

    public List<Row> Rows(string sql, object? p = null)
    {
        using var c = Cmd(sql, p);
        using var r = c.ExecuteReader();
        var list = new List<Row>();
        var names = Enumerable.Range(0, r.FieldCount).Select(i => r.GetName(i).ToLowerInvariant()).ToArray();
        while (r.Read())
        {
            var row = new Row();
            for (int i = 0; i < names.Length; i++) row[names[i]] = Read(r, i);
            list.Add(row);
        }
        return list;
    }

    public Row? Row(string sql, object? p = null) => Rows(sql, p).FirstOrDefault();

    public object? Scalar(string sql, object? p = null)
    {
        var row = Row(sql, p);
        return row?.Values.FirstOrDefault();
    }

    public decimal ScalarDec(string sql, object? p = null) => Convert.ToDecimal(Scalar(sql, p) ?? 0m);

    public int Exec(string sql, object? p = null)
    {
        using var c = Cmd(sql, p);
        return c.ExecuteNonQuery();
    }

    public void Proc(string name, object? p = null)
    {
        using var c = Cmd(name, p, CommandType.StoredProcedure);
        c.ExecuteNonQuery();
    }

    /// <summary>Streams a query (used by the CSV backup) without materialising it.</summary>
    public void Each(string sql, Action<OracleDataReader> onRow, Action<string[]>? onHeader = null)
    {
        using var c = Cmd(sql, null);
        c.FetchSize = 1024 * 1024;
        using var r = c.ExecuteReader();
        onHeader?.Invoke(Enumerable.Range(0, r.FieldCount).Select(r.GetName).ToArray());
        while (r.Read()) onRow(r);
    }

    public void Commit() => tx?.Commit();

    public void Dispose()
    {
        tx?.Dispose();
        conn.Dispose();
    }
}
