using System.ComponentModel;
using System.Diagnostics;

namespace ArchipelaWoW.Launcher.Services;

/// <summary>The launcher's own MySQL server: a data directory under mysql/, reachable from this machine only.</summary>
public sealed class MySqlService(AppPaths paths, SettingsStore settings)
{
    public const string User = "acore";
    public const string Password = "acore";

    const string DefaultIni = """
        # MySQL settings of the ArchipelaWoW Launcher. It passes basedir, datadir and port on the
        # command line, so that they follow the folder when it moves and the port set in the launcher.
        [mysqld]
        bind-address=127.0.0.1
        mysqlx=OFF
        character-set-server=utf8mb4
        max_allowed_packet=128M
        """;

    public bool IsInitialized => settings.Current.DatabaseInitialized && HasSystemTables;

    // mysql.ibd, the data dictionary, is written early by --initialize: without it the directory
    // holds nothing worth keeping
    bool HasSystemTables => File.Exists(Path.Combine(paths.MySqlDataDir, "mysql.ibd"));

    public ProcessSpec ServerSpec() => new(paths.MySqlExe("mysqld"), [.. ServerArguments(), "--console"], paths.MySqlDir);

    /// <summary>
    /// Shuts the server down with mysqladmin: on Ctrl+C mysqld starts shutting down but gets
    /// terminated before it's done. Fails if root was given a password.
    /// </summary>
    public async Task<bool> RequestShutdownAsync()
    {
        var info = new ProcessStartInfo(paths.MySqlExe("mysqladmin"))
        {
            WorkingDirectory = paths.MySqlDir,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        foreach (var argument in (string[])["--no-defaults", "--host=127.0.0.1", $"--port={settings.Current.MySqlPort}", "--user=root", "shutdown"])
            info.ArgumentList.Add(argument);
        try
        {
            using var process = Process.Start(info)!;
            var errors = process.StandardError.ReadToEndAsync();
            await process.StandardOutput.ReadToEndAsync();
            await process.WaitForExitAsync();
            if (process.ExitCode != 0)
                Log.Info($"mysqladmin shutdown failed: {(await errors).Trim()}");
            return process.ExitCode == 0;
        }
        catch (Win32Exception ex)
        {
            Log.Error("Could not run mysqladmin", ex);
            return false;
        }
    }

    /// <summary>Creates the data directory, starts the server and creates the AzerothCore user.</summary>
    public async Task InitializeAsync(TaskRunner task, ServerManager servers, CancellationToken token)
    {
        if (servers.MySql.IsActive)
            throw new InvalidOperationException("Stop MySQL before initializing the database.");

        if (!File.Exists(paths.MySqlIni))
            File.WriteAllText(paths.MySqlIni, DefaultIni.ReplaceLineEndings("\r\n") + "\r\n");

        if (HasSystemTables)
        {
            task.Stage("MySQL data directory already exists, keeping it");
        }
        else
        {
            if (Directory.Exists(paths.MySqlDataDir))
                Directory.Delete(paths.MySqlDataDir, recursive: true);

            task.Stage("Creating the MySQL data directory");
            var exitCode = await task.RunToolAsync(paths.MySqlExe("mysqld"),
                [.. ServerArguments(), "--initialize-insecure", "--console"], paths.MySqlDir, token);
            if (exitCode != 0)
                throw new InvalidOperationException($"mysqld --initialize failed with code {exitCode}.");
        }

        task.Stage("Starting MySQL");
        await servers.StartAsync(servers.MySql.Name);
        await servers.MySql.WaitUntilRunningAsync(token);

        task.Stage("Creating the AzerothCore user");
        // The servers create their databases themselves (see ServerManager), whatever their names
        var users = $"'{User}'@'localhost', '{User}'@'127.0.0.1'";
        var sql = string.Join(' ',
            $"CREATE USER IF NOT EXISTS '{User}'@'localhost' IDENTIFIED BY '{Password}';",
            $"CREATE USER IF NOT EXISTS '{User}'@'127.0.0.1' IDENTIFIED BY '{Password}';",
            $"GRANT ALL ON *.* TO {users};");
        // --no-defaults keeps a [client] section of some other installation's my.ini out of this
        var result = await task.RunToolAsync(paths.MySqlExe("mysql"),
            ["--no-defaults", "--host=127.0.0.1", $"--port={settings.Current.MySqlPort}", "--user=root", $"--execute={sql}"],
            paths.MySqlDir, token);
        if (result != 0)
            throw new InvalidOperationException($"Creating the AzerothCore user failed with code {result}.");

        settings.Update(s => s.DatabaseInitialized = true);
    }

    // --defaults-file has to come first
    string[] ServerArguments() =>
    [
        $"--defaults-file={paths.MySqlIni}",
        $"--basedir={paths.MySqlDir}",
        $"--datadir={paths.MySqlDataDir}",
        $"--port={settings.Current.MySqlPort}",
    ];
}
