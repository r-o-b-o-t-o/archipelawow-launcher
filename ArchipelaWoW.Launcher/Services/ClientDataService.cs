namespace ArchipelaWoW.Launcher.Services;

public sealed record ClientDataRelease(string Tag, DateTimeOffset PublishedAt, string AssetName, long Size, string Url);

/// <summary>
/// The dbc, maps, vmaps, mmaps and camera files worldserver reads from its DataDir, either
/// downloaded from wowgaming/client-data or extracted from a 3.3.5a client with the core's tools.
/// </summary>
public sealed class ClientDataService(AppPaths paths, SettingsStore settings, HttpClient http)
{
    const string Repository = "wowgaming/client-data";
    static readonly string[] Folders = ["dbc", "maps", "vmaps", "mmaps", "Cameras"];
    // worldserver refuses to start without these; mmaps and cameras are optional
    static readonly string[] RequiredFolders = ["dbc", "maps", "vmaps"];

    public object GetStatus()
    {
        var folders = Folders.ToDictionary(f => f, f => HasFiles(Path.Combine(paths.DataDir, f)));
        return new
        {
            Version = settings.Current.ClientDataVersion,
            Folders = folders,
            Ready = RequiredFolders.All(f => folders[f]),
        };
    }

    public async Task<ClientDataRelease> GetLatestReleaseAsync(CancellationToken token)
    {
        var release = await GitHub.GetLatestReleaseAsync(http, Repository, token);
        var asset = release.Assets.First(a => a.Name.EndsWith(".zip", StringComparison.OrdinalIgnoreCase));
        return new ClientDataRelease(release.Tag, release.PublishedAt, asset.Name, asset.Size, asset.Url);
    }

    public async Task DownloadAsync(TaskRunner task, ServerManager servers, CancellationToken token)
    {
        EnsureWorldServerStopped(servers);
        task.Stage("Looking up the latest client data release");
        var release = await GetLatestReleaseAsync(token);

        var downloadDir = Path.Combine(paths.DataDir, ".download");
        var zip = Path.Combine(downloadDir, $"{release.Tag}-{release.AssetName}");
        await Downloads.DownloadOnceAsync(http, release.Url, zip, release.Size, task, token);

        task.Stage("Extracting the client data");
        await InstallAsync(servers, staging => Task.Run(() => Downloads.ExtractZip(zip, staging, task, token), token));
        Directories.Delete(downloadDir);
        settings.Update(s => s.ClientDataVersion = release.Tag);
    }

    public async Task ExtractFromClientAsync(TaskRunner task, ServerManager servers, string clientPath, bool generateMmaps,
        CancellationToken token)
    {
        if (!File.Exists(paths.ServerExe("map_extractor")))
            throw new InvalidOperationException("Install the server first, the extractors come with it.");
        EnsureWorldServerStopped(servers);
        clientPath = Path.GetFullPath(clientPath);
        var clientData = Path.Combine(clientPath, "Data");
        if (!File.Exists(Path.Combine(clientData, "lichking.MPQ")))
            throw new InvalidOperationException($"{clientPath} doesn't look like a WoW 3.3.5a client: Data\\lichking.MPQ is missing.");
        settings.Update(s => s.WowClientPath = clientPath);

        var steps = generateMmaps ? 4 : 3;
        await InstallAsync(servers, async staging =>
        {
            task.Stage($"Extracting DBC files, maps and cameras (1/{steps})");
            await RunExtractorAsync(task, "map_extractor", ["-i", clientPath, "-o", staging], staging, token);

            task.Stage($"Extracting buildings (2/{steps})");
            await RunExtractorAsync(task, "vmap4_extractor", ["-d", clientData], staging, token);

            task.Stage($"Assembling vmaps (3/{steps})");
            Directory.CreateDirectory(Path.Combine(staging, "vmaps"));
            await RunExtractorAsync(task, "vmap4_assembler", ["Buildings", "vmaps"], staging, token);

            if (generateMmaps)
            {
                task.Stage($"Generating mmaps, this takes a few hours (4/{steps})");
                Directory.CreateDirectory(Path.Combine(staging, "mmaps"));
                await RunExtractorAsync(task, "mmaps_generator", ["--config", Path.Combine(paths.ServerBin, "mmaps-config.yaml")],
                    staging, token);
            }
        });

        settings.Update(s => s.ClientDataVersion = "extracted");
    }

    /// <summary>
    /// Has <paramref name="produce"/> write the data folders to a staging directory, and only then replaces
    /// the installed ones with them, so that a failed or cancelled extraction leaves the data as it was.
    /// </summary>
    async Task InstallAsync(ServerManager servers, Func<string, Task> produce)
    {
        var staging = Path.Combine(paths.DataDir, ".staging");
        Directories.Delete(staging);
        Directory.CreateDirectory(staging);
        try
        {
            await produce(staging);
            // Generating mmaps takes hours: a worldserver started meanwhile would hold the old files open,
            // and deleting them would stop halfway
            EnsureWorldServerStopped(servers);
            foreach (var folder in Folders)
            {
                var target = Path.Combine(paths.DataDir, folder);
                Directories.Delete(target);
                var source = Path.Combine(staging, folder);
                if (Directory.Exists(source))
                    Directory.Move(source, target);
            }
        }
        finally
        {
            Directories.Delete(staging);
        }
    }

    async Task RunExtractorAsync(TaskRunner task, string tool, string[] arguments, string workingDirectory, CancellationToken token)
    {
        // Run from where the data goes: vmap4_extractor writes to ./Buildings, and mmaps_generator's config
        // reads maps and vmaps from ./
        var exitCode = await task.RunToolAsync(paths.ServerExe(tool), arguments, workingDirectory, token);
        if (exitCode != 0)
            throw new InvalidOperationException($"{tool} failed with code {exitCode}.");
    }

    static void EnsureWorldServerStopped(ServerManager servers)
    {
        if (servers.WorldServer.IsActive)
            throw new InvalidOperationException("Stop the worldserver first, it keeps the client data files open.");
    }

    static bool HasFiles(string directory) =>
        Directory.Exists(directory) && Directory.EnumerateFiles(directory, "*", SearchOption.AllDirectories).Any();
}
