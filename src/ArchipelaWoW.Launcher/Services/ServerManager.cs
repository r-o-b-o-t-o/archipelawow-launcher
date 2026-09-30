using ArchipelaWoW.Launcher.Terminal;

namespace ArchipelaWoW.Launcher.Services;

/// <summary>MySQL, authserver and worldserver, started and stopped in dependency order.</summary>
public sealed class ServerManager
{
    // worldserver's exit code for "server restart"
    const int RestartExitCode = 2;

    readonly AppPaths _paths;
    readonly MySqlService _mySql;
    readonly ConfigService _configs;

    public ManagedProcess MySql { get; }
    public ManagedProcess AuthServer { get; }
    public ManagedProcess WorldServer { get; }
    public IReadOnlyList<ManagedProcess> All { get; }

    public bool AnyActive => All.Any(p => p.IsActive);

    public ServerManager(AppPaths paths, SettingsStore settings, MySqlService mySql, ConfigService configs)
    {
        _paths = paths;
        _mySql = mySql;
        _configs = configs;

        // The servers inherit it: they create the databases they miss instead of asking about it on
        // their console and waiting for an answer
        Environment.SetEnvironmentVariable("AC_DISABLE_INTERACTIVE", "1");

        MySql = new ManagedProcess("mysql", "MySQL", new TerminalBuffer("mysql", paths.LauncherLogsDir),
            mySql.ServerSpec, () => settings.Current.MySqlPort, TimeSpan.FromSeconds(60))
        {
            RequestStop = mySql.RequestShutdownAsync,
        };
        AuthServer = new ManagedProcess("authserver", "Authserver", new TerminalBuffer("authserver", paths.LauncherLogsDir),
            () => ServerSpec("authserver"), () => configs.GetInt("authserver.conf", "RealmServerPort") ?? 3724,
            TimeSpan.FromSeconds(15));
        WorldServer = new ManagedProcess("worldserver", "Worldserver", new TerminalBuffer("worldserver", paths.LauncherLogsDir),
            () => ServerSpec("worldserver"), () => configs.GetInt("worldserver.conf", "WorldServerPort") ?? 8085,
            TimeSpan.FromSeconds(90))
        {
            RestartExitCode = RestartExitCode,
        };
        All = [MySql, AuthServer, WorldServer];
    }

    public ManagedProcess Get(string name) =>
        All.FirstOrDefault(p => p.Name == name) ?? throw new ArgumentException($"Unknown server {name}.");

    /// <summary>Starts a server, and MySQL first when the server needs it.</summary>
    public async Task StartAsync(string name)
    {
        var process = Get(name);
        if (!Directory.Exists(_paths.MySqlDataDir))
            throw new InvalidOperationException("The database isn't set up yet, run the setup first.");

        if (process != MySql)
        {
            if (!_configs.ConfigsExist)
                throw new InvalidOperationException("The server configuration files are missing, run the setup first.");
            MySql.Start();
            await MySql.WaitUntilRunningAsync();
            if (process == AuthServer && !AuthServer.IsActive &&
                _configs.GetDatabaseName("authserver.conf", "LoginDatabaseInfo") is { } loginDatabase)
                await _mySql.ClearRealmVersionMismatchAsync(loginDatabase);
        }
        process.Start();
    }

    /// <summary>Stops a server, and first the servers that depend on it.</summary>
    public async Task StopAsync(string name)
    {
        var process = Get(name);
        if (process == MySql)
            await Task.WhenAll(AuthServer.StopAsync(), WorldServer.StopAsync());
        await process.StopAsync();
    }

    public async Task RestartAsync(string name)
    {
        await Get(name).StopAsync();
        await StartAsync(name);
    }

    public async Task StartAllAsync()
    {
        await StartAsync(AuthServer.Name);
        // Both servers create the login database when it's missing, and would get in each other's way
        try
        {
            await AuthServer.WaitUntilRunningAsync();
        }
        catch (InvalidOperationException)
        {
            // Its output tells why, and the worldserver can run without it
        }
        await StartAsync(WorldServer.Name);
    }

    public Task StopAllAsync() => StopAsync(MySql.Name);

    ProcessSpec ServerSpec(string name) => new(_paths.ServerExe(name), [], _paths.ServerBin);
}
