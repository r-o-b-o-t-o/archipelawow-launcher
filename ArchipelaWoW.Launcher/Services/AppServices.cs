using System.Text.Json.Nodes;

namespace ArchipelaWoW.Launcher.Services;

public sealed class AppServices : IDisposable
{
    public AppPaths Paths { get; }
    public SettingsStore Settings { get; }
    public ConfigService Configs { get; }
    public MySqlService MySql { get; }
    public ServerManager Servers { get; }
    public TaskRunner Tasks { get; }
    public ClientDataService ClientData { get; }
    public PlayerFilesService Players { get; }
    public HttpClient Http { get; }

    /// <summary>release.json, written by the release workflow: versions of everything in the release.</summary>
    public JsonNode? Manifest { get; }

    /// <summary>
    /// Length of the longest SQL update path as worldserver opens it: the full path, through its working
    /// directory (...\server\bin\..\source\...). The core isn't long path aware, so past MAX_PATH the updates fail.
    /// </summary>
    public int LongestSourcePath => _longestSourcePath.Value;

    public const int MaxPath = 259;

    readonly Lazy<int> _longestSourcePath;

    public AppServices(AppPaths paths)
    {
        Paths = paths;
        Settings = new SettingsStore(paths.SettingsFile);
        Settings.Load();

        // Downloads take minutes; each call site sets its own limits
        Http = new HttpClient { Timeout = Timeout.InfiniteTimeSpan };
        Http.DefaultRequestHeaders.UserAgent.ParseAdd("ArchipelaWoW-Launcher");

        Configs = new ConfigService(paths, Settings);
        MySql = new MySqlService(paths, Settings);
        Servers = new ServerManager(paths, Settings, MySql, Configs);
        Tasks = new TaskRunner(paths.LauncherLogsDir);
        ClientData = new ClientDataService(paths, Settings, Http);
        Players = new PlayerFilesService(paths);

        _longestSourcePath = new(() => !Directory.Exists(paths.SourceDir)
            ? 0
            : Path.Combine(paths.ServerBin, "..", "source").Length + Directory
                .EnumerateFiles(paths.SourceDir, "*.sql", SearchOption.AllDirectories)
                .Select(file => file.Length - paths.SourceDir.Length)
                .DefaultIfEmpty(0)
                .Max());

        if (File.Exists(paths.ManifestFile))
        {
            try
            {
                Manifest = JsonNode.Parse(File.ReadAllText(paths.ManifestFile));
            }
            catch (Exception ex) when (ex is System.Text.Json.JsonException or IOException)
            {
                Log.Error("Ignoring unreadable release.json", ex);
            }
        }
    }

    public void Dispose() => Http.Dispose();
}
