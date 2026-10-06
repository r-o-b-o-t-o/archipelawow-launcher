namespace ArchipelaWoW.Launcher.Services;

public sealed class AppServices : IDisposable
{
    public AppPaths Paths { get; }
    public SettingsStore Settings { get; }
    public ConfigService Configs { get; }
    public MySqlService MySql { get; }
    public ServerManager Servers { get; }
    public TaskRunner Tasks { get; }
    public RepackService Repack { get; }
    public ClientDataService ClientData { get; }
    public PlayerFilesService Players { get; }
    public HttpClient Http { get; }

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
        Repack = new RepackService(paths, Settings, Configs, Http);
        ClientData = new ClientDataService(paths, Settings, Http);
        Players = new PlayerFilesService(paths);
    }

    public void Dispose() => Http.Dispose();
}
