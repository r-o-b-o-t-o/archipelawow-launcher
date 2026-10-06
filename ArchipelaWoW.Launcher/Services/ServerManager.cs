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
    // Per server, cancelled and replaced by its stop: a start still waiting for MySQL, or for the other of the
    // authserver and worldserver, would otherwise start its server once the stop is done, which closing the window
    // then leaves running. Once shutting down, MySQL's stays cancelled, and with it every start, as they all need it.
    readonly Dictionary<ManagedProcess, CancellationTokenSource> _startCancellations;
    bool _shuttingDown;
    // Held by an authserver or worldserver start or restart until the server it launches is running or gone. A
    // worldserver flags its realm "version mismatch" until it's started, possibly after the authserver's start cleared
    // the flag, leaving that authserver without a realm (see ClearRealmVersionMismatchAsync). Both would also create
    // a missing login database.
    readonly SemaphoreSlim _launchGate = new(1);
    ManagedProcess? _launchGateHolder;
    // Until MySQL's restart has started it again: the starts waiting for MySQL wait it out instead of failing
    Task? _mySqlRestart;

    public ManagedProcess MySql { get; }
    public ManagedProcess AuthServer { get; }
    public ManagedProcess WorldServer { get; }
    public IReadOnlyList<ManagedProcess> All { get; }

    public bool AnyActive => All.Any(p => p.IsActive);

    /// <summary>Why the servers can't start, while their files are being installed or deleted.</summary>
    public string? StartBlockedReason { get; set; }

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

        // Restarted like any start: through the launch gate, on the UI thread this is made on
        var uiThread = SynchronizationContext.Current!;
        WorldServer.RestartRequested += () => uiThread.Post(_ => RestartAfterExit(WorldServer), null);
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

    async Task StartAsync(ManagedProcess process, CancellationToken token, bool restart = false)
    {
        token.ThrowIfCancellationRequested();
        if (StartBlockedReason is { } reason)
            throw new InvalidOperationException(reason);
        if (!Directory.Exists(_paths.MySqlDataDir))
            throw new InvalidOperationException("The database isn't set up yet, run the setup first.");

        if (process != MySql)
        {
            await LaunchAsync(process, restart, token);
            return;
        }
        if (!restart)
        {
            process.Start();
            return;
        }
        var restarted = new TaskCompletionSource();
        _mySqlRestart = restarted.Task;
        try
        {
            await process.StopAsync();
            token.ThrowIfCancellationRequested();
            process.Start();
        }
        finally
        {
            _mySqlRestart = null;
            restarted.SetResult();
        }
    }

    // Starts the authserver or worldserver within the launch gate, and MySQL first. A restart stops the server once
    // in the gate, so that the other server doesn't start meanwhile, only for this one to wait out its start.
    async Task LaunchAsync(ManagedProcess process, bool restart, CancellationToken token)
    {
        // Its own start holds the gate until it's started
        if (restart && _launchGateHolder == process)
            await process.StopAsync();
        if (_launchGate.CurrentCount == 0 && _launchGateHolder != process)
            process.Terminal.WriteNotice($"Waiting for {(process == AuthServer ? WorldServer : AuthServer).DisplayName} to start...");
        await _launchGate.WaitAsync(token);
        _launchGateHolder = process;
        try
        {
            if (restart)
                await process.StopAsync();
            token.ThrowIfCancellationRequested();
            if (!_configs.ConfigsExist)
                throw new InvalidOperationException("The server configuration files are missing, run the setup first.");
            MySql.Start();
            try
            {
                await MySql.WaitUntilRunningAsync(token);
            }
            catch (InvalidOperationException) when (_mySqlRestart is { } mySqlRestart)
            {
                await mySqlRestart.WaitAsync(token);
                await MySql.WaitUntilRunningAsync(token);
            }
            if (process == AuthServer && !AuthServer.IsActive &&
                _configs.GetDatabaseName("authserver.conf", "LoginDatabaseInfo") is { } loginDatabase)
                await _mySql.ClearRealmVersionMismatchAsync(loginDatabase);
            token.ThrowIfCancellationRequested();
            process.Start();
        }
        catch
        {
            LeaveLaunchGate();
            throw;
        }
        _ = LeaveLaunchGateOnceSettledAsync(process);
    }

    async Task LeaveLaunchGateOnceSettledAsync(ManagedProcess process)
    {
        await process.WaitUntilSettledAsync();
        LeaveLaunchGate();
    }

    void LeaveLaunchGate()
    {
        _launchGateHolder = null;
        _launchGate.Release();
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

    public async Task RestartAsync(string name)
    {
        var process = Get(name);
        // Made before stopping, so that stopping this server or MySQL meanwhile cancels the start too
        using var cancellation = StartCancellation(process);
        await IgnoreCancellation(StartAsync(process, cancellation.Token, restart: true));
    }

    async void RestartAfterExit(ManagedProcess process)
    {
        try
        {
            await StartAsync(process.Name);
        }
        catch (Exception ex)
        {
            Log.Error($"Could not restart {process.DisplayName}", ex);
        }
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

    // Cancelled by a stop of the server, or of MySQL, which every server needs
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
