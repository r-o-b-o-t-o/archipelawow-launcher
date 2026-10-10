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
    public NetworkService Network { get; }
    public ApWorldService ApWorld { get; }
    public TrackerService Tracker { get; } = new();
    public LauncherUpdater LauncherUpdater { get; } = new();
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
        Network = new NetworkService(Settings, MySql, Configs, Http);
        Servers = new ServerManager(paths, Settings, MySql, Configs, Network);
        Tasks = new TaskRunner(paths.LauncherLogsDir);
        Repack = new RepackService(paths, Settings, Configs, Http);
        try
        {
            Repack.MoveOutOfServerBin();
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            Log.Error("Could not move the server configuration out of server\\bin", ex);
        }
        ClientData = new ClientDataService(paths, Settings, Http);
        Players = new PlayerFilesService(paths);
        ApWorld = new ApWorldService(Http);
    }

    public void Dispose()
    {
        Tracker.Dispose();
        Http.Dispose();
    }
}
