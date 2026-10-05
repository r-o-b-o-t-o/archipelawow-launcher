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
    // Per server, cancelled and replaced by its stop, restart and kill: a start still waiting for MySQL or
    // the authserver would otherwise start it once the stop is done, which closing the window then leaves
    // running. Once shutting down, MySQL's stays cancelled, and with it every start, as they all need it.
    readonly Dictionary<ManagedProcess, CancellationTokenSource> _startCancellations;
    bool _shuttingDown;

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
        _startCancellations = All.ToDictionary(p => p, _ => new CancellationTokenSource());
    }

    public ManagedProcess Get(string name) =>
        All.FirstOrDefault(p => p.Name == name) ?? throw new ArgumentException($"Unknown server {name}.");

    /// <summary>Starts a server, and MySQL first when the server needs it.</summary>
    public async Task StartAsync(string name)
    {
        var process = Get(name);
        using var cancellation = StartCancellation(process);
        await IgnoreCancellation(StartAsync(process, cancellation.Token));
    }

    async Task StartAsync(ManagedProcess process, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        if (!Directory.Exists(_paths.MySqlDataDir))
            throw new InvalidOperationException("The database isn't set up yet, run the setup first.");

        if (process != MySql)
        {
            if (!_configs.ConfigsExist)
                throw new InvalidOperationException("The server configuration files are missing, run the setup first.");
            MySql.Start();
            await MySql.WaitUntilRunningAsync(token);
            if (process == AuthServer && !AuthServer.IsActive &&
                _configs.GetDatabaseName("authserver.conf", "LoginDatabaseInfo") is { } loginDatabase)
                await _mySql.ClearRealmVersionMismatchAsync(loginDatabase);
            // Both servers create the login database when it's missing, and would get in each other's way.
            // Whether the authserver then runs doesn't matter: the worldserver can run without it.
            while (process == WorldServer && AuthServer.State == ServerState.Starting)
                await Task.Delay(250, token);
            token.ThrowIfCancellationRequested();
        }
        process.Start();
    }

    /// <summary>Stops a server, and first the servers that depend on it. Cancels the starts that need it.</summary>
    public async Task StopAsync(string name)
    {
        var process = Get(name);
        CancelStarts(process);
        if (process == MySql)
            await Task.WhenAll(AuthServer.StopAsync(), WorldServer.StopAsync());
        await process.StopAsync();
    }

    /// <summary>Restarts a server. Cancels the starts that need it.</summary>
    public async Task RestartAsync(string name)
    {
        var process = Get(name);
        CancelStarts(process);
        // Made before stopping, so that a stop meanwhile also cancels this start
        using var cancellation = StartCancellation(process);
        await process.StopAsync();
        await IgnoreCancellation(StartAsync(process, cancellation.Token));
    }

    /// <summary>Ends a server's process right away. Cancels the starts that need it.</summary>
    public void Kill(string name)
    {
        var process = Get(name);
        CancelStarts(process);
        process.Kill();
    }

    public async Task StartAllAsync()
    {
        // Both made first, so that stopping MySQL meanwhile cancels the worldserver's start too
        using var authCancellation = StartCancellation(AuthServer);
        using var worldCancellation = StartCancellation(WorldServer);
        await IgnoreCancellation(StartAsync(AuthServer, authCancellation.Token));
        await IgnoreCancellation(StartAsync(WorldServer, worldCancellation.Token));
    }

    public Task StopAllAsync() => StopAsync(MySql.Name);

    /// <summary>
    /// Stops every server for good, as the launcher quits: cancels the starts in progress and any later one.
    /// </summary>
    public Task ShutDownAsync()
    {
        _shuttingDown = true;
        return StopAllAsync();
    }

    // Cancelled by a stop, restart or kill of the server, or of MySQL, which every server needs
    CancellationTokenSource StartCancellation(ManagedProcess process) =>
        CancellationTokenSource.CreateLinkedTokenSource(
            _startCancellations[process].Token, _startCancellations[MySql].Token);

    void CancelStarts(ManagedProcess process)
    {
        var starts = _startCancellations[process];
        if (!_shuttingDown)
            _startCancellations[process] = new CancellationTokenSource();
        starts.Cancel();
    }

    static async Task IgnoreCancellation(Task start)
    {
        try
        {
            await start;
        }
        catch (OperationCanceledException)
        {
            // What a stop asks for, not an error to report
        }
    }

    ProcessSpec ServerSpec(string name) => new(_paths.ServerExe(name), [], _paths.ServerBin);
}
