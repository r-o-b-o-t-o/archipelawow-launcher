using ArchipelaWoW.Launcher.Terminal;

namespace ArchipelaWoW.Launcher.Services;

public sealed record TaskInfo(string Title, string Stage, double? Progress, string? Detail, DateTimeOffset StartedAt);

/// <summary>
/// Runs one long operation at a time (installing, updating or deleting the server, database setup, client
/// data download or extraction, launcher update download). Tools it starts print to the shared "tasks" terminal.
/// </summary>
public sealed class TaskRunner(string logDirectory) : ITerminalHost
{
    readonly object _lock = new();
    CancellationTokenSource? _cancellation;
    PtyProcess? _tool;
    short _columns = 120, _rows = 30;
    DateTime _lastProgressEvent;

    public TerminalBuffer Terminal { get; } = new("tasks", logDirectory);
    public TaskInfo? Current { get; private set; }

    /// <summary>Completes once the current task, if any, has finished: some can't stop halfway when cancelled.</summary>
    public Task Idle { get; private set; } = Task.CompletedTask;

    /// <summary>What to tell about something that has to wait for the current task.</summary>
    public string BusyMessage => $"Wait for \"{Current?.Title}\" to finish first.";

    /// <summary>Raised on any thread.</summary>
    public event Action? Changed;

    public async Task RunAsync(string title, Func<TaskRunner, CancellationToken, Task> work)
    {
        CancellationTokenSource cancellation;
        var finished = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        lock (_lock)
        {
            if (Current != null)
                throw new InvalidOperationException(BusyMessage);
            cancellation = _cancellation = new CancellationTokenSource();
            Current = new TaskInfo(title, "", null, null, DateTimeOffset.Now);
            Idle = finished.Task;
        }
        Changed?.Invoke();
        Terminal.WriteNotice(title);
        try
        {
            await work(this, cancellation.Token);
            Terminal.WriteNotice($"{title}: done.");
        }
        catch (OperationCanceledException)
        {
            Terminal.WriteNotice($"{title}: cancelled.");
            throw;
        }
        catch (Exception ex)
        {
            Terminal.WriteNotice($"{title} failed: {ex.Message}");
            Log.Error($"Task \"{title}\" failed", ex);
            throw;
        }
        finally
        {
            lock (_lock)
            {
                Current = null;
                _cancellation = null;
            }
            cancellation.Dispose();
            Changed?.Invoke();
            finished.SetResult();
        }
    }

    public void Cancel()
    {
        lock (_lock)
            _cancellation?.Cancel();
    }

    public void Stage(string stage)
    {
        lock (_lock)
        {
            if (Current == null)
                return;
            Current = Current with { Stage = stage, Progress = null, Detail = null };
        }
        Terminal.WriteNotice(stage);
        Changed?.Invoke();
    }

    public void Progress(double fraction, string? detail = null)
    {
        lock (_lock)
        {
            if (Current == null)
                return;
            Current = Current with { Progress = fraction, Detail = detail };
            // Downloads report far more often than the UI needs
            if (fraction < 1 && DateTime.UtcNow - _lastProgressEvent < TimeSpan.FromMilliseconds(200))
                return;
            _lastProgressEvent = DateTime.UtcNow;
        }
        Changed?.Invoke();
    }

    /// <summary>Runs a console tool in the tasks terminal and returns its exit code. Cancelling kills it.</summary>
    public async Task<int> RunToolAsync(string executable, IEnumerable<string> arguments, string workingDirectory, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        Terminal.WriteNotice($"> {Path.GetFileName(executable)} {string.Join(' ', arguments.Select(PtyProcess.QuoteArgument))}");
        using var tool = PtyProcess.Start(executable, arguments, workingDirectory, _columns, _rows, Terminal.Write);
        _tool = tool;
        try
        {
            await using var registration = token.Register(tool.Kill);
            var exitCode = await tool.Exited;
            token.ThrowIfCancellationRequested();
            return exitCode;
        }
        finally
        {
            _tool = null;
        }
    }

    public void Input(string data) => _tool?.Write(data);

    public void Resize(short columns, short rows)
    {
        _columns = columns;
        _rows = rows;
        _tool?.Resize(columns, rows);
    }
}
