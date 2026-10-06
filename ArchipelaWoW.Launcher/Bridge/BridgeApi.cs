using System.Diagnostics;
using System.Reflection;
using System.Text.RegularExpressions;
using ArchipelaWoW.Launcher.Services;
using ArchipelaWoW.Launcher.Terminal;
using Microsoft.Win32;

namespace ArchipelaWoW.Launcher.Bridge;

/// <summary>The methods and events the UI uses, see ui/src/lib/api.ts for the other side.</summary>
public static partial class BridgeApi
{
    const string ArchipelagoConfig = "modules/archipelawow.conf";
    const string YamlFilter = "Archipelago player options (*.yaml;*.yml)|*.yaml;*.yml";

    public static void Register(BridgeHost bridge, AppServices services, MainWindow owner)
    {
        var paths = services.Paths;
        var servers = services.Servers;
        var tasks = services.Tasks;
        var terminals = new Dictionary<string, ITerminalHost>
        {
            [servers.MySql.Name] = servers.MySql,
            [servers.AuthServer.Name] = servers.AuthServer,
            [servers.WorldServer.Name] = servers.WorldServer,
            [tasks.Terminal.Name] = tasks,
        };
        ITerminalHost Terminal(string name) =>
            terminals.GetValueOrDefault(name) ?? throw new ArgumentException($"Unknown terminal {name}.");

        foreach (var server in servers.All)
            server.StateChanged += () => bridge.Emit("servers.changed", ServerStatuses(servers));
        tasks.Changed += () => bridge.Emit("task.changed", tasks.Current);

        // App
        bridge.Handle("app.getInfo", () => new
        {
            Version = Version(),
            paths.Root,
            WindowsBuild = Environment.OSVersion.Version.Build,
        });
        bridge.Handle<TargetParams>("app.openPath", p =>
        {
            var path = p.Target switch
            {
                "root" => paths.Root,
                "configs" => paths.ConfigsDir,
                "data" => paths.DataDir,
                "logs" => paths.LogsDir,
                "launcherLogs" => paths.LauncherLogsDir,
                "players" => paths.PlayersDir,
                "mysql" => paths.MySqlDir,
                _ => throw new ArgumentException($"Unknown folder {p.Target}."),
            };
            Directory.CreateDirectory(path);
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
            return null;
        });
        bridge.Handle<UrlParams>("app.openUrl", p =>
        {
            if (!Uri.TryCreate(p.Url, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https"))
                throw new ArgumentException($"Not a web link: {p.Url}");
            Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
            return null;
        });
        bridge.Handle<UnsavedChangesParams>("app.setUnsavedChanges", p =>
        {
            owner.HasUnsavedChanges = p.Unsaved;
            return null;
        });

        // Settings
        bridge.Handle("settings.get", () => services.Settings.Current);
        bridge.Handle<SettingsPatch>("settings.update", p =>
        {
            if (p.MySqlPort is { } port && port != services.Settings.Current.MySqlPort)
            {
                if (servers.AnyActive)
                    throw new InvalidOperationException("Stop the servers before changing the MySQL port.");
                if (port is < 1024 or > 65535)
                    throw new ArgumentException("The port must be between 1024 and 65535.");
                services.Settings.Update(s => s.MySqlPort = port);
                services.Configs.ApplyDatabasePort(port);
            }
            if (p.AutoStartServers is { } autoStart)
                services.Settings.Update(s => s.AutoStartServers = autoStart);
            return services.Settings.Current;
        });

        // Setup
        bridge.Handle("setup.getStatus", () => SetupStatus(services));
        bridge.HandleAsync("repack.getLatestRelease", async () => await services.Repack.GetLatestReleaseAsync(CancellationToken.None));
        bridge.HandleAsync<BuildParams>("repack.install", async p =>
        {
            var title = services.Repack.IsInstalled ? "Updating the server" : "Installing the server";
            await tasks.RunAsync(title, (task, token) => services.Repack.InstallAsync(task, servers, p.Build, token));
            return SetupStatus(services);
        });
        bridge.HandleAsync("repack.delete", async () =>
        {
            await tasks.RunAsync("Deleting the server", (task, token) => services.Repack.DeleteAsync(task, servers, token));
            return SetupStatus(services);
        });
        bridge.HandleAsync("setup.initDatabase", async () =>
        {
            await tasks.RunAsync("Setting up the database", (task, token) => services.MySql.InitializeAsync(task, servers, token));
            return SetupStatus(services);
        });
        bridge.Handle<CreateConfigsParams>("setup.createConfigs", p => services.Configs.CreateConfigs(p.Overwrite));

        // Client data
        bridge.Handle("clientData.getStatus", services.ClientData.GetStatus);
        bridge.HandleAsync("clientData.getLatestRelease", async () => await services.ClientData.GetLatestReleaseAsync(CancellationToken.None));
        bridge.HandleAsync("clientData.download", async () =>
        {
            await tasks.RunAsync("Downloading the client data", (task, token) => services.ClientData.DownloadAsync(task, servers, token));
            return services.ClientData.GetStatus();
        });
        bridge.HandleAsync<ExtractParams>("clientData.extract", async p =>
        {
            await tasks.RunAsync("Extracting the client data", (task, token) =>
                services.ClientData.ExtractFromClientAsync(task, servers, p.ClientPath, p.GenerateMmaps, token));
            return services.ClientData.GetStatus();
        });

        // Tasks
        bridge.Handle("task.getCurrent", () => tasks.Current);
        bridge.Handle("task.cancel", () =>
        {
            tasks.Cancel();
            return null;
        });

        // Dialogs
        bridge.Handle<PickFolderParams>("dialog.pickFolder", p =>
        {
            var dialog = new OpenFolderDialog { Title = p.Title };
            if (Directory.Exists(p.InitialDirectory))
                dialog.InitialDirectory = p.InitialDirectory;
            return dialog.ShowDialog(owner) == true ? dialog.FolderName : null;
        });

        // Servers
        bridge.Handle("servers.getAll", () => ServerStatuses(servers));
        bridge.HandleAsync<NameParams>("servers.start", async p =>
        {
            await servers.StartAsync(p.Name);
            return null;
        });
        bridge.HandleAsync<NameParams>("servers.stop", async p =>
        {
            await servers.StopAsync(p.Name);
            return null;
        });
        bridge.HandleAsync<NameParams>("servers.restart", async p =>
        {
            await servers.RestartAsync(p.Name);
            return null;
        });
        bridge.Handle<NameParams>("servers.kill", p =>
        {
            servers.Get(p.Name).Kill();
            return null;
        });
        bridge.HandleAsync("servers.startAll", async () =>
        {
            await servers.StartAllAsync();
            return null;
        });
        bridge.HandleAsync("servers.stopAll", async () =>
        {
            await servers.StopAllAsync();
            return null;
        });

        // Terminals
        bridge.Handle<NameParams>("terminal.snapshot", p =>
        {
            var (data, seq) = Terminal(p.Name).Terminal.Snapshot();
            return new { data, seq };
        });
        bridge.Handle<TerminalInputParams>("terminal.input", p =>
        {
            Terminal(p.Name).Input(p.Data);
            return null;
        });
        bridge.Handle<TerminalSizeParams>("terminal.resize", p =>
        {
            Terminal(p.Name).Resize((short)Math.Clamp(p.Cols, 20, 500), (short)Math.Clamp(p.Rows, 5, 200));
            return null;
        });
        bridge.Handle<NameParams>("terminal.clear", p =>
        {
            Terminal(p.Name).Terminal.Clear();
            return null;
        });

        // Worldserver console
        bridge.Handle<CommandParams>("worldserver.command", p =>
        {
            SendWorldCommand(servers, p.Command);
            return null;
        });
        bridge.HandleAsync<AccountParams>("accounts.create", async p =>
        {
            if (!AccountNameRegex().IsMatch(p.Username))
                throw new ArgumentException("Account names are 1 to 20 letters and digits.");
            if (!PasswordRegex().IsMatch(p.Password))
                throw new ArgumentException("Passwords are 1 to 16 characters, without spaces.");
            EnsureWorldServerRunning(servers);
            var loginDatabase = services.Configs.GetDatabaseName("worldserver.conf", "LoginDatabaseInfo")
                ?? throw new InvalidOperationException("worldserver.conf has no LoginDatabaseInfo.");
            if (await services.MySql.AccountExistsAsync(loginDatabase, p.Username))
                throw new ArgumentException($"There is already an account named {p.Username}.");

            SendWorldCommand(servers, $"account create {p.Username} {p.Password}");
            // The worldserver adds the account in the background, and set gmlevel doesn't check that it
            // exists: it would give the access level to account 0
            for (var attempt = 1; !await services.MySql.AccountExistsAsync(loginDatabase, p.Username); attempt++)
            {
                if (attempt == 20)
                    throw new InvalidOperationException($"The worldserver didn't create {p.Username}, see its output.");
                await Task.Delay(250);
            }
            if (p.GmLevel is > 0 and <= 3)
                SendWorldCommand(servers, $"account set gmlevel {p.Username} {p.GmLevel} -1");
            return null;
        });

        // mod-i-found-your-sword's connection to the Archipelago room
        bridge.Handle("archipelago.getConnection", () => new
        {
            Host = services.Configs.GetValue(ArchipelagoConfig, "ArchipelaWoW.ArchipelagoServerHost"),
            Port = services.Configs.GetInt(ArchipelagoConfig, "ArchipelaWoW.ArchipelagoServerPort"),
            Password = services.Configs.GetValue(ArchipelagoConfig, "ArchipelaWoW.ArchipelagoPassword"),
        });
        bridge.Handle<ConnectionParams>("archipelago.setConnection", p =>
        {
            if (string.IsNullOrWhiteSpace(p.Host) || p.Host.Contains('"'))
                throw new ArgumentException("Enter the host name of the Archipelago server.");
            if (p.Port is < 1 or > 65535)
                throw new ArgumentException("The port must be between 1 and 65535.");
            services.Configs.SetValues(ArchipelagoConfig, new Dictionary<string, string>
            {
                ["ArchipelaWoW.ArchipelagoServerHost"] = ConfigService.Quote(p.Host.Trim()),
                ["ArchipelaWoW.ArchipelagoServerPort"] = p.Port.ToString(),
                ["ArchipelaWoW.ArchipelagoPassword"] = ConfigService.Quote(p.Password ?? ""),
            });
            var reload = servers.WorldServer.State == ServerState.Running;
            if (reload)
                SendWorldCommand(servers, "reload config");
            return new { reloaded = reload };
        });

        // Player options
        bridge.Handle("players.list", services.Players.List);
        bridge.Handle<NameParams>("players.read", p => services.Players.Read(p.Name));
        bridge.Handle<FileContentParams>("players.write", p =>
        {
            services.Players.Write(p.Name, p.Content);
            return null;
        });
        bridge.Handle<NameParams>("players.delete", p =>
        {
            services.Players.Delete(p.Name);
            return null;
        });
        bridge.Handle("players.import", () =>
        {
            var dialog = new OpenFileDialog { Filter = YamlFilter, Multiselect = true, Title = "Import player options" };
            return dialog.ShowDialog(owner) == true ? dialog.FileNames.Select(services.Players.Import).ToList() : [];
        });
        bridge.Handle<NameParams>("players.export", p =>
        {
            var dialog = new SaveFileDialog { Filter = YamlFilter, FileName = p.Name, Title = "Export player options" };
            if (dialog.ShowDialog(owner) != true)
                return false;
            services.Players.Export(p.Name, dialog.FileName);
            return true;
        });

        // Configuration files
        bridge.Handle("config.list", services.Configs.List);
        bridge.Handle<NameParams>("config.read", p => services.Configs.ReadText(p.Name));
        bridge.Handle<FileContentParams>("config.write", p =>
        {
            services.Configs.WriteText(p.Name, p.Content);
            return null;
        });
    }

    static object SetupStatus(AppServices services) => new
    {
        ServerInstalled = services.Repack.IsInstalled,
        Server = services.Repack.ReadManifest(),
        DatabaseInitialized = services.MySql.IsInitialized,
        ConfigsCreated = services.Configs.ConfigsExist,
        ClientData = services.ClientData.GetStatus(),
        SourcePathLength = services.Repack.LongestSourcePath,
        SourcePathLimit = RepackService.MaxPath,
    };

    static object ServerStatuses(ServerManager servers) =>
        servers.All.Select(p => new { p.Name, p.DisplayName, p.State, p.Pid, p.StartedAt, p.ExitCode }).ToList();

    static void EnsureWorldServerRunning(ServerManager servers)
    {
        if (servers.WorldServer.State != ServerState.Running)
            throw new InvalidOperationException("Start the worldserver first.");
    }

    static void SendWorldCommand(ServerManager servers, string command)
    {
        EnsureWorldServerRunning(servers);
        // Enter, as a console key press
        servers.WorldServer.Input(command + "\r");
    }

    static string Version()
    {
        var version = Assembly.GetEntryAssembly()?.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "";
        return version.Split('+')[0];
    }

    [GeneratedRegex("^[A-Za-z0-9]{1,20}$")]
    private static partial Regex AccountNameRegex();

    [GeneratedRegex(@"^\S{1,16}$")]
    private static partial Regex PasswordRegex();

    sealed record NameParams(string Name);
    sealed record TargetParams(string Target);
    sealed record UrlParams(string Url);
    sealed record UnsavedChangesParams(bool Unsaved);
    sealed record SettingsPatch(int? MySqlPort, bool? AutoStartServers);
    sealed record BuildParams(string Build);
    sealed record CreateConfigsParams(bool Overwrite);
    sealed record ExtractParams(string ClientPath, bool GenerateMmaps);
    sealed record PickFolderParams(string? Title, string? InitialDirectory);
    sealed record TerminalInputParams(string Name, string Data);
    sealed record TerminalSizeParams(string Name, int Cols, int Rows);
    sealed record CommandParams(string Command);
    sealed record AccountParams(string Username, string Password, int GmLevel);
    sealed record ConnectionParams(string Host, int Port, string? Password);
    sealed record FileContentParams(string Name, string Content);
}
