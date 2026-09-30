using System.Text.Json;
using System.Text.RegularExpressions;

namespace ArchipelaWoW.Launcher.Services;

/// <summary>
/// Reads and edits the AzerothCore .conf files ("Key = Value" lines, # comments). Files are named
/// relative to the configs directory, e.g. "worldserver.conf" or "modules/archipelawow.conf".
/// </summary>
public sealed class ConfigService(AppPaths paths, SettingsStore settings)
{
    public bool ConfigsExist => File.Exists(FullPath("authserver.conf")) && File.Exists(FullPath("worldserver.conf"));

    public IReadOnlyList<string> List() => Directory.Exists(paths.ConfigsDir)
        ? Directory.EnumerateFiles(paths.ConfigsDir, "*.conf", SearchOption.AllDirectories).Select(Relative).Order().ToList()
        : [];

    /// <summary>Copies every .conf.dist to its .conf and applies the launcher's defaults to it.</summary>
    /// <returns>The files that were written.</returns>
    public IReadOnlyList<string> CreateConfigs(bool overwrite)
    {
        if (!Directory.Exists(paths.ConfigsDir))
            throw new DirectoryNotFoundException($"{paths.ConfigsDir} is missing, the installation looks incomplete.");

        var defaults = LoadDefaults();
        var written = new List<string>();
        foreach (var dist in Directory.EnumerateFiles(paths.ConfigsDir, "*.conf.dist", SearchOption.AllDirectories))
        {
            var conf = dist[..^".dist".Length];
            if (File.Exists(conf) && !overwrite)
                continue;
            File.Copy(dist, conf, overwrite: true);
            var file = Relative(conf);
            if (defaults.TryGetValue(file, out var values))
                SetValues(file, values);
            written.Add(file);
        }
        // The servers only write log files to a directory that already exists
        Directory.CreateDirectory(paths.LogsDir);
        return written;
    }

    public string? GetValue(string file, string key)
    {
        var path = FullPath(file);
        if (!File.Exists(path))
            return null;
        var lines = File.ReadAllLines(path);
        var index = FindKey(lines, key);
        return index < 0 ? null : Unquote(lines[index][(lines[index].IndexOf('=') + 1)..]);
    }

    public int? GetInt(string file, string key) => int.TryParse(GetValue(file, key), out var value) ? value : null;

    /// <summary>Sets keys to raw values (quotes included for strings), appending the ones the file doesn't have.</summary>
    public void SetValues(string file, IReadOnlyDictionary<string, string> values)
    {
        var path = FullPath(file);
        var text = File.ReadAllText(path);
        var newline = text.Contains("\r\n") ? "\r\n" : "\n";
        var lines = text.Split(newline).ToList();
        foreach (var (key, value) in values)
        {
            var index = FindKey(lines, key);
            if (index >= 0)
                lines[index] = $"{key} = {value}";
            else
                lines.Insert(lines.Count > 0 && lines[^1].Length == 0 ? lines.Count - 1 : lines.Count, $"{key} = {value}");
        }
        File.WriteAllText(path, string.Join(newline, lines));
    }

    /// <summary>Points every local *DatabaseInfo connection at the given MySQL port.</summary>
    public void ApplyDatabasePort(int port)
    {
        var databaseInfo = new Regex("""^\s*([\w.]*DatabaseInfo)\s*=\s*"([^"]*)"\s*$""");
        foreach (var file in List())
        {
            var values = new Dictionary<string, string>();
            foreach (var line in File.ReadAllLines(FullPath(file)))
            {
                var match = databaseInfo.Match(line);
                if (!match.Success)
                    continue;
                var parts = match.Groups[2].Value.Split(';');
                if (parts.Length >= 5 && parts[0] is "127.0.0.1" or "localhost")
                {
                    parts[1] = port.ToString();
                    values[match.Groups[1].Value] = Quote(string.Join(';', parts));
                }
            }
            if (values.Count > 0)
                SetValues(file, values);
        }
    }

    public string ReadText(string file) => File.ReadAllText(FullPath(file));

    public void WriteText(string file, string text) => File.WriteAllText(FullPath(file), text);

    public static string Quote(string value) => $"\"{value}\"";

    static string Unquote(string value)
    {
        value = value.Trim();
        return value.Length >= 2 && value[0] == '"' && value[^1] == '"' ? value[1..^1] : value;
    }

    static int FindKey(IReadOnlyList<string> lines, string key)
    {
        var pattern = new Regex($@"^\s*{Regex.Escape(key)}\s*=");
        for (var i = lines.Count - 1; i >= 0; i--)
        {
            if (pattern.IsMatch(lines[i]))
                return i;
        }
        return -1;
    }

    string FullPath(string file)
    {
        var full = Path.GetFullPath(Path.Combine(paths.ConfigsDir, file));
        if (!full.StartsWith(paths.ConfigsDir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException($"{file} is not in the configs directory.");
        return full;
    }

    string Relative(string fullPath) => Path.GetRelativePath(paths.ConfigsDir, fullPath).Replace('\\', '/');

    /// <summary>
    /// Reads Resources/config-defaults.json into raw values: strings are quoted, numbers and booleans
    /// are written bare, and {"raw": "..."} is written as is.
    /// </summary>
    Dictionary<string, Dictionary<string, string>> LoadDefaults()
    {
        using var stream = typeof(ConfigService).Assembly.GetManifestResourceStream("config-defaults.json")!;
        using var document = JsonDocument.Parse(stream, new JsonDocumentOptions
        {
            CommentHandling = JsonCommentHandling.Skip,
            AllowTrailingCommas = true,
        });

        var port = settings.Current.MySqlPort.ToString();
        var defaults = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var file in document.RootElement.EnumerateObject())
        {
            var values = new Dictionary<string, string>();
            foreach (var entry in file.Value.EnumerateObject())
            {
                values[entry.Name] = entry.Value.ValueKind switch
                {
                    JsonValueKind.String => Quote(entry.Value.GetString()!.Replace("{mysqlPort}", port)),
                    JsonValueKind.True => "1",
                    JsonValueKind.False => "0",
                    JsonValueKind.Object => entry.Value.GetProperty("raw").GetString()!,
                    _ => entry.Value.GetRawText(),
                };
            }
            defaults[file.Name] = values;
        }
        return defaults;
    }
}
