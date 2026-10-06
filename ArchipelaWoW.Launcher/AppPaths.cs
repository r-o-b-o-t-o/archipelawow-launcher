namespace ArchipelaWoW.Launcher;

/// <summary>
/// Layout of the portable installation. Everything lives under <see cref="Root"/>, and the server configs
/// only reference it through relative paths, so the whole folder can be moved.
/// </summary>
public sealed class AppPaths(string root)
{
    public string Root { get; } = Path.GetFullPath(root);

    public string ServerDir => Path.Combine(Root, "server");
    public string ServerBin => Path.Combine(ServerDir, "bin");
    public string ConfigsDir => Path.Combine(ServerBin, "configs");
    public string DataDir => Path.Combine(ServerDir, "data");
    public string LogsDir => Path.Combine(ServerDir, "logs");
    public string SourceDir => Path.Combine(ServerDir, "source");
    public string ServerLicensesDir => Path.Combine(ServerDir, "licenses");
    public string ManifestFile => Path.Combine(ServerDir, "release.json");

    public string MySqlDir => Path.Combine(Root, "mysql");
    public string MySqlBin => Path.Combine(MySqlDir, "bin");
    public string MySqlDataDir => Path.Combine(MySqlDir, "data");
    public string MySqlIni => Path.Combine(MySqlDir, "my.ini");

    public string LauncherDir => Path.Combine(Root, "launcher");
    public string LauncherLogsDir => Path.Combine(LauncherDir, "logs");
    public string SettingsFile => Path.Combine(LauncherDir, "settings.json");
    public string WebViewDataDir => Path.Combine(LauncherDir, "webview2");
    public string DownloadsDir => Path.Combine(LauncherDir, "downloads");
    public string StagingDir => Path.Combine(LauncherDir, "staging");

    public string PlayersDir => Path.Combine(Root, "players");

    public string ServerExe(string name) => Path.Combine(ServerBin, name + ".exe");
    public string MySqlExe(string name) => Path.Combine(MySqlBin, name + ".exe");
}
