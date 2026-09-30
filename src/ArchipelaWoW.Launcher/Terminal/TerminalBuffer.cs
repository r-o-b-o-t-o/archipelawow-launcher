using System.Text;

namespace ArchipelaWoW.Launcher.Terminal;

/// <summary>
/// Output of one terminal: raw VT text kept for replay when the UI (re)attaches, handed to the UI in
/// numbered chunks, and mirrored without escape sequences to a log file.
/// </summary>
public sealed class TerminalBuffer
{
    const int MaxLength = 2 * 1024 * 1024;

    readonly object _lock = new();
    readonly StringBuilder _history = new();
    readonly StringBuilder _pending = new();
    readonly StreamWriter? _log;
    readonly VtStripper _stripper = new();
    long _sequence;

    public string Name { get; }

    public TerminalBuffer(string name, string? logDirectory)
    {
        Name = name;
        if (logDirectory == null)
            return;
        try
        {
            Directory.CreateDirectory(logDirectory);
            var file = Path.Combine(logDirectory, name + ".log");
            // One log per launcher session, keeping the previous one around for troubleshooting
            if (File.Exists(file))
                File.Move(file, Path.Combine(logDirectory, name + ".1.log"), overwrite: true);
            _log = new StreamWriter(file, append: false, new UTF8Encoding(false));
        }
        catch (IOException ex)
        {
            Log.Error($"Cannot write the {name} terminal log", ex);
        }
    }

    public void Write(string text)
    {
        lock (_lock)
        {
            _pending.Append(text);
            _log?.Write(_stripper.Strip(text));
        }
    }

    /// <summary>Writes a line of launcher commentary, dimmed to set it apart from the process's own output.</summary>
    public void WriteNotice(string message) => Write($"\r\n\x1b[90m[launcher] {message}\x1b[0m\r\n");

    /// <summary>Moves the pending output into the history as a new chunk, if there is any.</summary>
    public (string Data, long Sequence)? Commit()
    {
        lock (_lock)
        {
            if (_pending.Length == 0)
                return null;
            var data = _pending.ToString();
            _pending.Clear();
            _history.Append(data);
            TrimHistory();
            _log?.Flush();
            return (data, ++_sequence);
        }
    }

    /// <summary>Committed history; chunks after <c>Sequence</c> are still to come.</summary>
    public (string Data, long Sequence) Snapshot()
    {
        lock (_lock)
            return (_history.ToString(), _sequence);
    }

    public void Clear()
    {
        lock (_lock)
        {
            _history.Clear();
            _pending.Clear();
        }
    }

    void TrimHistory()
    {
        if (_history.Length <= MaxLength)
            return;
        // Cut at a line break so the replay doesn't start in the middle of an escape sequence
        var cut = _history.Length - MaxLength * 3 / 4;
        while (cut < _history.Length && _history[cut - 1] != '\n')
            cut++;
        _history.Remove(0, cut);
    }

    /// <summary>Removes VT escape sequences from a stream, even when one is split across chunks.</summary>
    sealed class VtStripper
    {
        enum State { Text, Escape, Csi, Osc, OscEscape }

        State _state;

        public string Strip(string text)
        {
            var result = new StringBuilder(text.Length);
            foreach (var c in text)
            {
                switch (_state)
                {
                    case State.Text:
                        if (c == '\x1b')
                            _state = State.Escape;
                        else if (c == '\n')
                            result.Append(Environment.NewLine);
                        else if (c >= ' ' || c == '\t')
                            result.Append(c);
                        break;
                    case State.Escape:
                        _state = c switch { '[' => State.Csi, ']' => State.Osc, _ => State.Text };
                        break;
                    case State.Csi:
                        if (c >= '@' && c <= '~')
                            _state = State.Text;
                        break;
                    case State.Osc:
                        if (c == '\x07')
                            _state = State.Text;
                        else if (c == '\x1b')
                            _state = State.OscEscape;
                        break;
                    case State.OscEscape:
                        _state = c == '\\' ? State.Text : State.Osc;
                        break;
                }
            }
            return result.ToString();
        }
    }
}
