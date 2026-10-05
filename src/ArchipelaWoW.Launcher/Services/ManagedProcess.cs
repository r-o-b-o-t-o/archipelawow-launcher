using System.Net.NetworkInformation;
using ArchipelaWoW.Launcher.Terminal;

namespace ArchipelaWoW.Launcher.Services;

public enum ServerState { Stopped, Starting, Running, Stopping, Crashed }

public sealed record ProcessSpec(string Executable, IReadOnlyList<string> Arguments, string WorkingDirectory);

/// <summary>
/// One of the servers the launcher runs. It counts as running once it listens on its port, which
/// all three only do when they are done starting up.
/// </summary>
public sealed class ManagedProcess(
    string name,
    string displayName,
    TerminalBuffer terminal,
    Func<ProcessSpec> spec,
    Func<int> port,
    TimeSpan stopTimeout) : ITerminalHost
{
    readonly object _lock = new();
    PtyProcess? _pty;
    bool _stopRequested;
    // From an exit with RestartExitCode until the restart: a stop in between cancels it, which closing the
    // window would otherwise leave running
    bool _restartPending;
    short _columns = 120, _rows = 30;

    public string Name { get; } = name;
    public string DisplayName { get; } = displayName;
    public TerminalBuffer Terminal { get; } = terminal;
    public ServerState State { get; private set; }
    public int? Pid => _pty?.Pid;
    public DateTimeOffset? StartedAt { get; private set; }
    public int? ExitCode { get; private set; }

    /// <summary>An exit code with which the process asks to be started again (worldserver's "server restart").</summary>
    public int? RestartExitCode { get; init; }

    /// <summary>Asks the process to shut down, returning false when that failed. Ctrl+C when not set.</summary>
    public Func<Task<bool>>? RequestStop { get; init; }

    public bool IsActive => State is ServerState.Starting or ServerState.Running or ServerState.Stopping;

    /// <summary>Raised on any thread.</summary>
    public event Action? StateChanged;

    public void Start() => Start(restart: false);

    void Start(bool restart)
    {
        PtyProcess pty;
        bool portTaken;
        lock (_lock)
        {
            if (IsActive || restart && !_restartPending)
                return;
            _restartPending = false;

            var processSpec = spec();
            Terminal.WriteNotice($"Starting {DisplayName}...");
            var listenPort = port();
            portTaken = IsListening(listenPort);
            if (portTaken)
                Terminal.WriteNotice($"Port {listenPort} is already in use, {DisplayName} will probably fail to start. Is another server running?");

            _stopRequested = false;
            ExitCode = null;
            try
            {
                pty = PtyProcess.Start(processSpec.Executable, processSpec.Arguments, processSpec.WorkingDirectory,
                    _columns, _rows, Terminal.Write);
            }
            catch (Exception ex)
            {
                Terminal.WriteNotice(ex.Message);
                throw;
            }
            _pty = pty;
            StartedAt = DateTimeOffset.Now;
            State = ServerState.Starting;
        }
        StateChanged?.Invoke();
        // Whatever holds the port would pass for this process being ready
        if (!portTaken)
            _ = WatchReadinessAsync(pty);
        _ = pty.Exited.ContinueWith(t => OnExited(pty, t.Result), TaskScheduler.Default);
    }

    public async Task StopAsync()
    {
        PtyProcess pty;
        bool alreadyStopping;
        lock (_lock)
        {
            _restartPending = false;
            if (!IsActive || _pty == null)
                return;
            pty = _pty;
            alreadyStopping = State == ServerState.Stopping;
            _stopRequested = true;
            State = ServerState.Stopping;
        }
        // Asking again would only get in the way: mysqladmin can't connect to a server that's shutting
        // down, and falling back to Ctrl+C then cuts MySQL's shutdown short
        if (alreadyStopping)
        {
            await pty.Exited;
            return;
        }
        StateChanged?.Invoke();

        Terminal.WriteNotice($"Stopping {DisplayName}...");
        if (RequestStop == null || !await RequestStop())
            pty.SendCtrlC();
        if (await Task.WhenAny(pty.Exited, Task.Delay(stopTimeout)) != pty.Exited)
        {
            Terminal.WriteNotice($"{DisplayName} did not stop within {stopTimeout.TotalSeconds:0} seconds, killing it.");
            pty.Kill();
        }
        await pty.Exited;
    }

    public void Kill()
    {
        PtyProcess? pty;
        lock (_lock)
        {
            pty = _pty;
            _stopRequested = true;
        }
        pty?.Kill();
    }

    /// <summary>Completes once the process is running, or throws if it exits first.</summary>
    public async Task WaitUntilRunningAsync(CancellationToken token = default)
    {
        while (State != ServerState.Running)
        {
            if (!IsActive)
                throw new InvalidOperationException($"{DisplayName} stopped before it was ready, see its output for details.");
            await Task.Delay(250, token);
        }
    }

    public void Input(string data) => _pty?.Write(data);

    public void Resize(short columns, short rows)
    {
        _columns = columns;
        _rows = rows;
        _pty?.Resize(columns, rows);
    }

    async Task WatchReadinessAsync(PtyProcess pty)
    {
        var listenPort = port();
        while (!pty.HasExited && State == ServerState.Starting)
        {
            if (IsListening(listenPort))
            {
                lock (_lock)
                {
                    if (_pty != pty || State != ServerState.Starting)
                        return;
                    State = ServerState.Running;
                }
                StateChanged?.Invoke();
                return;
            }
            await Task.Delay(500);
        }
    }

    void OnExited(PtyProcess pty, int exitCode)
    {
        bool restart;
        lock (_lock)
        {
            if (_pty != pty)
                return;
            _pty = null;
            ExitCode = exitCode;
            restart = !_stopRequested && exitCode == RestartExitCode;
            _restartPending = restart;
            State = _stopRequested || exitCode == 0 || restart ? ServerState.Stopped : ServerState.Crashed;
        }
        pty.Dispose();
        Terminal.WriteNotice($"{DisplayName} exited with code {exitCode}.");
        StateChanged?.Invoke();

        if (restart)
        {
            try
            {
                Start(restart: true);
            }
            catch (Exception ex)
            {
                Log.Error($"Could not restart {DisplayName}", ex);
            }
        }
    }

    static bool IsListening(int port) =>
        IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners().Any(endpoint => endpoint.Port == port);
}
