using System.Text.Json;

namespace ArchipelaWoW.Launcher;

public sealed class LauncherSettings
{
    // Not 3306, so the launcher doesn't clash with a MySQL server already installed on the machine
    public int MySqlPort { get; set; } = 3310;
    public bool AutoStartServers { get; set; }
    public bool DatabaseInitialized { get; set; }
    /// <summary>Release tag of the downloaded client data, or "extracted".</summary>
    public string? ClientDataVersion { get; set; }
    public string? WowClientPath { get; set; }
    public TrackerSettings Tracker { get; set; } = new();
}

/// <summary>The room the tracker last connected to, and how it shows the checks.</summary>
public sealed class TrackerSettings
{
    public string? Host { get; set; }
    public int? Port { get; set; }
    public string? Slot { get; set; }
    public string? Password { get; set; }
    public bool HideChecked { get; set; } = true;
}

public sealed class SettingsStore(string file)
{
    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public LauncherSettings Current { get; private set; } = new();

    public void Load()
    {
        if (!File.Exists(file))
            return;
        try
        {
            Current = JsonSerializer.Deserialize<LauncherSettings>(File.ReadAllText(file), JsonOptions) ?? new();
        }
        catch (JsonException ex)
        {
            Log.Error($"Ignoring unreadable settings file {file}", ex);
        }
    }

    public void Update(Action<LauncherSettings> change)
    {
        change(Current);
        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
        File.WriteAllText(file, JsonSerializer.Serialize(Current, JsonOptions));
    }
}
