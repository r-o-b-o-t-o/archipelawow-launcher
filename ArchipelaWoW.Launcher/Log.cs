namespace ArchipelaWoW.Launcher;

/// <summary>Launcher's own log, for what doesn't show up in a server terminal.</summary>
public static class Log
{
    static readonly object Lock = new();
    static string? _file;

    public static void Init(string directory)
    {
        Directory.CreateDirectory(directory);
        _file = Path.Combine(directory, "launcher.log");
        // Keep the log from growing forever across sessions
        if (File.Exists(_file) && new FileInfo(_file).Length > 5 * 1024 * 1024)
            File.Move(_file, Path.Combine(directory, "launcher.1.log"), overwrite: true);
    }

    public static void Info(string message) => Write("INFO", message);

    public static void Error(string message, Exception? ex = null) =>
        Write("ERROR", ex == null ? message : $"{message}{Environment.NewLine}{ex}");

    static void Write(string level, string message)
    {
        if (_file == null)
            return;
        lock (Lock)
        {
            try
            {
                File.AppendAllText(_file, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} [{level}] {message}{Environment.NewLine}");
            }
            catch (IOException)
            {
                // Logging must never take the launcher down
            }
        }
    }
}
